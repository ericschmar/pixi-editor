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

export class SelectionManager implements InteractionDelegate {
  private eventBus: EventBus;
  private elementManager: ElementManager;
  private serializationManager: SerializationManager | null = null;

  private selected = new Set<BaseElement>();
  private selectionBox: SelectionBox;
  private marquee: MarqueeSelect;
  private transformController: TransformController;
  private clipboard: string[] = []; // serialized JSON strings

  private layer: Container | null = null;
  private handleConfig: HandleConfig = { color: 0x0088ff, fillColor: 0xffffff, size: 8 };

  // Marquee state
  private isMarqueeActive = false;
  private marqueeStart = { x: 0, y: 0 };

  // Element drag state
  private isDraggingElement = false;

  // Stage event handlers (bound for cleanup)
  private stageDownHandler: ((e: FederatedPointerEvent) => void) | null = null;
  private stageMoveHandler: ((e: FederatedPointerEvent) => void) | null = null;
  private stageUpHandler: ((e: FederatedPointerEvent) => void) | null = null;

  constructor(eventBus: EventBus, elementManager: ElementManager) {
    this.eventBus = eventBus;
    this.elementManager = elementManager;
    this.selectionBox = new SelectionBox();
    this.marquee = new MarqueeSelect();
    this.transformController = new TransformController(eventBus);
  }

  setSerializationManager(sm: SerializationManager): void {
    this.serializationManager = sm;
  }

  init(
    layer: Container,
    app: Application,
    config?: Partial<HandleConfig>,
  ): void {
    this.layer = layer;
    if (config) {
      this.handleConfig = { ...this.handleConfig, ...config };
    }

    this.layer.addChild(this.selectionBox.container);
    this.layer.addChild(this.marquee.graphics);

    // Wire up handle events for resize/rotate
    this.wireHandleEvents();

    // Wire stage events for marquee and global pointer tracking
    this.stageDownHandler = (e: FederatedPointerEvent) => this.onStagePointerDown(e);
    this.stageMoveHandler = (e: FederatedPointerEvent) => this.onStagePointerMove(e);
    this.stageUpHandler = (e: FederatedPointerEvent) => this.onStagePointerUp(e);

    app.stage.on('pointerdown', this.stageDownHandler);
    app.stage.on('pointermove', this.stageMoveHandler);
    app.stage.on('pointerup', this.stageUpHandler);
    app.stage.on('pointerupoutside', this.stageUpHandler);

    // Deselect elements that get removed
    this.eventBus.on('element:removed', ({ element }) => {
      this.selected.delete(element);
      this.updateSelectionVisuals();
    });
  }

  // --- InteractionDelegate ---

  handleElementPointerDown(element: BaseElement, event: FederatedPointerEvent): void {
    if (!element.interactable) return;

    if (event.shiftKey) {
      if (this.selected.has(element)) {
        this.deselect(element);
      } else {
        this.addToSelection(element);
      }
    } else {
      if (!this.selected.has(element)) {
        this.clearSelection();
        this.addToSelection(element);
      }
    }

    // Start dragging
    this.isDraggingElement = true;
    this.transformController.startMove(this.getSelected(), event);
  }

  handleElementPointerMove(_element: BaseElement, event: FederatedPointerEvent): void {
    if (this.isDraggingElement && this.transformController.isDragging) {
      this.transformController.onPointerMove(event);
      this.updateSelectionVisuals();
    }
  }

  handleElementPointerUp(_element: BaseElement, event: FederatedPointerEvent): void {
    if (this.isDraggingElement) {
      this.isDraggingElement = false;
      this.transformController.onPointerUp(event);
      this.updateSelectionVisuals();
    }
  }

  // --- Public selection API ---

  select(element: BaseElement): void {
    this.clearSelection();
    this.addToSelection(element);
  }

  addToSelection(element: BaseElement): void {
    this.selected.add(element);
    this.updateSelectionVisuals();
    this.eventBus.emit('selection:changed', { selected: this.getSelected() });
  }

  deselect(element: BaseElement): void {
    this.selected.delete(element);
    this.updateSelectionVisuals();
    this.eventBus.emit('selection:changed', { selected: this.getSelected() });
  }

  clearSelection(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.selectionBox.hide();
    this.eventBus.emit('selection:cleared');
  }

  selectAll(): void {
    for (const el of this.elementManager.getAll()) {
      if (el.interactable) this.selected.add(el);
    }
    this.updateSelectionVisuals();
    this.eventBus.emit('selection:changed', { selected: this.getSelected() });
  }

  getSelected(): BaseElement[] {
    return Array.from(this.selected);
  }

  isSelected(element: BaseElement): boolean {
    return this.selected.has(element);
  }

  // --- Clipboard ---

  copySelected(): void {
    this.clipboard = this.getSelected().map(el => JSON.stringify(el.toJSON()));
  }

  pasteClipboard(): void {
    if (this.clipboard.length === 0 || !this.serializationManager) return;
    this.clearSelection();

    for (const json of this.clipboard) {
      const data = JSON.parse(json);
      data.id = generateUid();
      data.x += 20;
      data.y += 20;

      const el = this.serializationManager.deserializeElement(data);
      if (el) {
        this.elementManager.add(el);
        this.addToSelection(el);
      }
    }
  }

  deleteSelected(): void {
    for (const el of this.getSelected()) {
      this.elementManager.remove(el);
    }
    this.clearSelection();
  }

  nudgeSelected(dx: number, dy: number): void {
    for (const el of this.getSelected()) {
      el.x += dx;
      el.y += dy;
    }
    this.updateSelectionVisuals();
  }

  // --- Visuals ---

  private updateSelectionVisuals(): void {
    if (this.selected.size === 0) {
      this.selectionBox.hide();
      return;
    }

    const bounds = this.computeCombinedBounds(this.getSelected());
    this.selectionBox.show(bounds, this.handleConfig, this.selected.size === 1);
  }

  private computeCombinedBounds(elements: BaseElement[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const display = el.getDisplayObject();
      const b = display.getBounds();
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // --- Handle events (resize/rotate) ---

  private wireHandleEvents(): void {
    const handles = this.selectionBox.getAllHandles();
    for (const handle of handles) {
      handle.graphics.on('pointerdown', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        if (handle.position === 'rotate') {
          this.transformController.startRotate(this.getSelected(), e);
        } else {
          this.transformController.startResize(this.getSelected(), handle.position, e);
        }
      });
    }
  }

  // --- Stage events (marquee + global pointer tracking) ---

  private onStagePointerDown(event: FederatedPointerEvent): void {
    // If clicking directly on stage (empty area), start marquee
    if (event.target === event.currentTarget) {
      if (!event.shiftKey) {
        this.clearSelection();
      }
      this.isMarqueeActive = true;
      this.marqueeStart = { x: event.globalX, y: event.globalY };
    }
  }

  private onStagePointerMove(event: FederatedPointerEvent): void {
    // Handle ongoing transform (resize/rotate from handles)
    if (this.transformController.isDragging && !this.isDraggingElement) {
      this.transformController.onPointerMove(event);
      this.updateSelectionVisuals();
      return;
    }

    // Handle marquee
    if (this.isMarqueeActive) {
      this.marquee.draw(
        this.marqueeStart.x, this.marqueeStart.y,
        event.globalX, event.globalY,
      );
    }
  }

  private onStagePointerUp(event: FederatedPointerEvent): void {
    // Finish transform (resize/rotate)
    if (this.transformController.isDragging && !this.isDraggingElement) {
      this.transformController.onPointerUp(event);
      this.updateSelectionVisuals();
    }

    // Finish marquee
    if (this.isMarqueeActive) {
      this.isMarqueeActive = false;
      const rect = this.marquee.getRect(
        this.marqueeStart.x, this.marqueeStart.y,
        event.globalX, event.globalY,
      );
      this.marquee.clear();

      // Only process if the marquee has some size
      if (rect.width > 3 || rect.height > 3) {
        for (const el of this.elementManager.getAll()) {
          if (!el.interactable) continue;
          const b = el.getDisplayObject().getBounds();
          if (this.boundsOverlap(rect, { x: b.x, y: b.y, width: b.width, height: b.height })) {
            this.selected.add(el);
          }
        }
        if (this.selected.size > 0) {
          this.updateSelectionVisuals();
          this.eventBus.emit('selection:changed', { selected: this.getSelected() });
        }
      }
    }
  }

  private boundsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  destroy(): void {
    this.clearSelection();
    this.selectionBox.destroy();
    this.marquee.destroy();
  }
}
