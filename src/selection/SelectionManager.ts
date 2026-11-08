import { Container, type FederatedPointerEvent, type Application } from 'pixi.js';
import type { BaseElement } from '../elements/BaseElement.ts';
import type { EventBus } from '../EventBus.ts';
import type { ElementManager } from '../managers/ElementManager.ts';
import type { SerializationManager } from '../managers/SerializationManager.ts';
import type { InteractionDelegate } from '../managers/InteractionManager.ts';
import { SelectionBox } from './SelectionBox.ts';
import { MarqueeSelect } from './MarqueeSelect.ts';
import { TransformController } from './TransformController.ts';
import type { HandleConfig } from '../types.ts';
import { generateUid } from '../utils/uid.ts';
import { getElementWorldCorners, getElementsWorldBounds, type LocalBounds } from '../geometry/ElementGeometry.ts';
import { recordElementEdit, selectionGeometry, snapshotElements, suppressElementActions } from './ElementInteraction.ts';

export class SelectionManager implements InteractionDelegate {
  private eventBus: EventBus;
  private elementManager: ElementManager;
  private serializationManager: SerializationManager | null = null;
  private selected = new Set<BaseElement>();
  private selectionBox: SelectionBox;
  private marquee: MarqueeSelect;
  private transformController: TransformController;
  private clipboard: string[] = [];
  private layer: Container | null = null;
  private contentRoot: Container | null = null;
  private handleConfig: HandleConfig = { color: 0x0088ff, fillColor: 0xffffff, size: 8 };
  private isMarqueeActive = false;
  private marqueeStart = { x: 0, y: 0 };
  private stage: Container | null = null;
  private destroyed = false;
  private visualKey = '';
  private cleanup: (() => void)[] = [];
  private stageCleanup: (() => void)[] = [];

  constructor(eventBus: EventBus, elementManager: ElementManager) {
    this.eventBus = eventBus;
    this.elementManager = elementManager;
    this.selectionBox = new SelectionBox();
    this.marquee = new MarqueeSelect();
    this.transformController = new TransformController(eventBus);
    this.cleanup.push(eventBus.on('element:removed', ({ element }) => {
      if (this.selected.has(element)) this.cancelTransform();
      if (this.selected.delete(element)) {
        this.updateSelectionVisuals();
        this.eventBus.emit('selection:changed', { selected: this.getSelected() });
      }
    }));
    const refresh = ({ element }: { element: BaseElement }) => {
      if (!this.selected.has(element)) return;
      if (!element.effectiveVisible || !element.interactable) this.cancelTransform();
      this.updateSelectionVisuals();
    };
    this.cleanup.push(eventBus.on('element:changed', refresh));
    this.cleanup.push(eventBus.on('element:presentationChanged', refresh));
    this.cleanup.push(eventBus.on('element:resourceChanged', refresh));
    // A viewport change invalidates a gesture's pointer coordinate frame.
    this.cleanup.push(eventBus.on('viewport:moved', () => this.cancelTransform()));
    this.cleanup.push(eventBus.on('viewport:zoomed', () => this.cancelTransform()));
    this.wireHandleEvents();
  }

  setSerializationManager(sm: SerializationManager): void { this.serializationManager = sm; }

  init(layer: Container, app: Application, config?: Partial<HandleConfig>, contentRoot?: Container): void {
    this.cancelTransform();
    this.stageCleanup.splice(0).forEach(unsubscribe => unsubscribe());
    this.layer = layer;
    this.stage = app.stage;
    if (config) this.handleConfig = { ...this.handleConfig, ...config };
    if (contentRoot) {
      this.contentRoot = contentRoot;
      this.transformController.setContentRoot(contentRoot);
    }
    layer.addChild(this.selectionBox.container);
    layer.addChild(this.marquee.graphics);
    const down = (e: FederatedPointerEvent) => this.onStagePointerDown(e);
    const move = (e: FederatedPointerEvent) => this.onStagePointerMove(e);
    const up = (e: FederatedPointerEvent) => this.onStagePointerUp(e);
    const cancel = () => this.cancelTransform();
    const stage = app.stage;
    stage.on('pointerdown', down);
    stage.on('globalpointermove', move);
    stage.on('pointerup', up);
    stage.on('pointerupoutside', up);
    stage.on('pointercancel', cancel);
    this.stageCleanup.push(() => {
      stage.off('pointerdown', down);
      stage.off('globalpointermove', move);
      stage.off('pointerup', up);
      stage.off('pointerupoutside', up);
      stage.off('pointercancel', cancel);
    });
    if (typeof window !== 'undefined') {
      // Gesture cancellation remains available without any optional plugins.
      const escape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && (this.transformController.isDragging || this.isMarqueeActive)) {
          e.preventDefault();
          this.cancelTransform();
        }
      };
      window.addEventListener('keydown', escape);
      window.addEventListener('blur', cancel);
      this.stageCleanup.push(() => {
        window.removeEventListener('keydown', escape);
        window.removeEventListener('blur', cancel);
      });
    }
    // Pixi scale can be authored directly (and applyJSON sets it silently on
    // this foundation). Observe that structural geometry at render cadence,
    // without authoring fields or continuously redrawing unchanged graphics.
    const ticker = app.ticker;
    if (ticker) {
      const refresh = () => this.updateSelectionVisuals(true);
      ticker.add(refresh);
      this.stageCleanup.push(() => ticker.remove(refresh));
    }
    this.updateSelectionVisuals();
  }

  // --- InteractionDelegate ---

  handleElementPointerDown(element: BaseElement, event: FederatedPointerEvent): void {
    if (!element.interactable || !element.effectiveVisible || (event.button !== undefined && event.button !== 0)) return;
    if (event.shiftKey) {
      if (this.selected.has(element)) this.deselect(element);
      else this.addToSelection(element);
    } else if (!this.selected.has(element)) {
      this.selectOnly(element);
    }
    if (this.selected.has(element)) this.transformController.startMove(this.getSelected(), event);
  }

  handleElementPointerMove(_element: BaseElement, event: FederatedPointerEvent): void {
    // InteractionManager and the stage can both receive the same global event.
    // Let the stage be authoritative once initialized; detached controllers work too.
    if (!this.stage) this.onStagePointerMove(event);
  }

  handleElementPointerUp(_element: BaseElement, event: FederatedPointerEvent): void {
    this.onStagePointerUp(event);
  }

  // --- Public selection API ---

  /** Cancel a pointer transform/marquee, restoring exact authored before-state. */
  cancelTransform(): void {
    if (this.destroyed) return;
    this.isMarqueeActive = false;
    this.marquee.clear();
    this.transformController.cancel();
    this.updateSelectionVisuals();
  }

  select(element: BaseElement): void {
    this.clearSelection();
    this.addToSelection(element);
  }

  selectOnly(element: BaseElement): void { this.select(element); }

  addToSelection(element: BaseElement): void {
    if (this.selected.has(element)) return;
    this.cancelTransform();
    this.selected.add(element);
    this.updateSelectionVisuals();
    this.eventBus.emit('selection:changed', { selected: this.getSelected() });
  }

  deselect(element: BaseElement): void {
    if (!this.selected.has(element)) return;
    this.cancelTransform();
    this.selected.delete(element);
    this.updateSelectionVisuals();
    this.eventBus.emit('selection:changed', { selected: this.getSelected() });
  }

  deselectAll(): void { this.clearSelection(); }

  clearSelection(): void {
    this.cancelTransform();
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.selectionBox.hide();
    this.visualKey = '';
    this.eventBus.emit('selection:cleared');
  }

  selectAll(): void {
    this.cancelTransform();
    for (const el of this.elementManager.getAll()) {
      if (el.interactable && el.effectiveVisible) this.selected.add(el);
    }
    this.updateSelectionVisuals();
    this.eventBus.emit('selection:changed', { selected: this.getSelected() });
  }

  getSelected(): BaseElement[] { return Array.from(this.selected); }
  isSelected(element: BaseElement): boolean { return this.selected.has(element); }

  // --- Clipboard ---

  copySelected(): void {
    this.clipboard = this.getSelected().map(el => JSON.stringify(el.toJSON()));
  }

  pasteClipboard(): void {
    if (!this.clipboard.length || !this.serializationManager) return;
    this.cancelTransform();
    // Preflight every clone before mutating the document/selection. The action
    // retains these instances, fresh IDs, metadata and deterministic insertion order.
    const clones: BaseElement[] = [];
    for (const json of this.clipboard) {
      const data = JSON.parse(json);
      data.id = generateUid();
      data.x += 20;
      data.y += 20;
      const el = this.serializationManager.deserializeElement(data);
      if (el) clones.push(el);
    }
    if (!clones.length) return;
    const insert = () => {
      this.clearSelection();
      for (const el of clones) this.elementManager.add(el);
      for (const el of clones) this.selected.add(el);
      this.updateSelectionVisuals();
      this.eventBus.emit('selection:changed', { selected: this.getSelected() });
    };
    const remove = () => {
      for (const el of clones) this.elementManager.remove(el);
      this.updateSelectionVisuals();
    };
    insert();
    this.eventBus.emit('action:performed', {
      action: { type: 'selection-paste', description: 'Paste selection', undo: remove, redo: insert },
    });
  }

  deleteSelected(): void {
    this.cancelTransform();
    const removed = this.getSelected();
    if (!removed.length) return;
    const order = this.elementManager.getAll();
    const remove = () => {
      for (const el of removed) this.elementManager.remove(el);
      this.clearSelection();
    };
    const insert = () => {
      for (const el of removed) this.elementManager.add(el);
      this.elementManager._restoreOrder(order);
    };
    remove();
    this.eventBus.emit('action:performed', {
      action: { type: 'selection-delete', description: 'Delete selection', undo: insert, redo: remove },
    });
  }

  nudgeSelected(dx: number, dy: number): void {
    this.cancelTransform();
    if ((!dx && !dy) || !this.selected.size) return;
    const elements = this.getSelected().filter(el => el.interactable && el.effectiveVisible);
    const before = snapshotElements(elements);
    suppressElementActions(elements, () => {
      for (const el of elements) { el.x += dx; el.y += dy; }
    });
    recordElementEdit(this.eventBus, before, 'selection-nudge', 'Nudge selection');
    this.updateSelectionVisuals();
  }

  // --- Visuals ---

  private updateSelectionVisuals(onlyIfChanged = false): void {
    const geometries = this.getSelected().filter(el => el.effectiveVisible).map(selectionGeometry);
    const key = JSON.stringify(geometries);
    if (onlyIfChanged && key === this.visualKey) return;
    this.visualKey = key;
    if (!geometries.length) { this.selectionBox.hide(); return; }
    if (geometries.length === 1) {
      const geometry = geometries[0]!;
      this.selectionBox.show(geometry.localBounds, this.handleConfig, true, geometry);
    } else {
      const bounds = getElementsWorldBounds(geometries)!;
      this.selectionBox.show(bounds, this.handleConfig, false);
    }
  }

  private wireHandleEvents(): void {
    for (const handle of this.selectionBox.getAllHandles()) {
      handle.graphics.on('pointerdown', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        if (e.button !== undefined && e.button !== 0) return;
        if (handle.position === 'rotate') this.transformController.startRotate(this.getSelected(), e);
        else this.transformController.startResize(this.getSelected(), handle.position, e);
      });
    }
  }

  private toWorld(globalX: number, globalY: number): { x: number; y: number } {
    return this.contentRoot?.toLocal({ x: globalX, y: globalY }) ?? { x: globalX, y: globalY };
  }

  private onStagePointerDown(event: FederatedPointerEvent): void {
    if (event.button !== undefined && event.button !== 0) { this.cancelTransform(); return; }
    if (!event.shiftKey) this.clearSelection();
    this.isMarqueeActive = true;
    this.marqueeStart = this.toWorld(event.globalX, event.globalY);
  }

  private onStagePointerMove(event: FederatedPointerEvent): void {
    if (this.transformController.isDragging) {
      this.transformController.onPointerMove(event);
      this.updateSelectionVisuals();
    } else if (this.isMarqueeActive) {
      const world = this.toWorld(event.globalX, event.globalY);
      this.marquee.draw(this.marqueeStart.x, this.marqueeStart.y, world.x, world.y);
    }
  }

  private onStagePointerUp(event: FederatedPointerEvent): void {
    this.transformController.onPointerUp(event);
    this.updateSelectionVisuals();
    if (!this.isMarqueeActive) return;
    this.isMarqueeActive = false;
    const world = this.toWorld(event.globalX, event.globalY);
    const rect = this.marquee.getRect(this.marqueeStart.x, this.marqueeStart.y, world.x, world.y);
    this.marquee.clear();
    if (rect.width <= 3 && rect.height <= 3) return;
    for (const el of this.elementManager.getAll()) {
      if (el.interactable && el.effectiveVisible && this.overlapsElement(rect, el)) this.selected.add(el);
    }
    this.updateSelectionVisuals();
    this.eventBus.emit('selection:changed', { selected: this.getSelected() });
  }

  /** Separating-axis test: a rotated bound, not its overly broad world AABB. */
  private overlapsElement(rect: LocalBounds, element: BaseElement): boolean {
    const corners = getElementWorldCorners(selectionGeometry(element));
    const box = [
      { x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height },
    ];
    const axes = [
      { x: 1, y: 0 }, { x: 0, y: 1 },
      { x: corners[1].y - corners[0].y, y: corners[0].x - corners[1].x },
      { x: corners[3].y - corners[0].y, y: corners[0].x - corners[3].x },
    ];
    return axes.every(axis => {
      const a = corners.map(p => p.x * axis.x + p.y * axis.y);
      const b = box.map(p => p.x * axis.x + p.y * axis.y);
      return Math.max(...a) >= Math.min(...b) && Math.max(...b) >= Math.min(...a);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clearSelection();
    this.destroyed = true;
    this.stageCleanup.splice(0).forEach(unsubscribe => unsubscribe());
    this.cleanup.splice(0).forEach(unsubscribe => unsubscribe());
    this.stage = null;
    this.selectionBox.destroy();
    this.marquee.destroy();
  }
}
