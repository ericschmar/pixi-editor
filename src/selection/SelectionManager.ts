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
  private clipboard: string[] = [];

  private layer: Container | null = null;
  private contentRoot: Container | null = null;
  private handleConfig: HandleConfig = { color: 0x0088ff, fillColor: 0xffffff, size: 8 };

  // Marquee state (world-space coords)
  private isMarqueeActive = false;
  private marqueeStart = { x: 0, y: 0 };

  private isDraggingElement = false;

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
    contentRoot?: Container,
  ): void {
    this.layer = layer;
    if (config) {
      this.handleConfig = { ...this.handleConfig, ...config };
    }
    if (contentRoot) {
      this.contentRoot = contentRoot;
      this.transformController.setContentRoot(contentRoot);
    }

    this.layer.addChild(this.selectionBox.container);
    this.layer.addChild(this.marquee.graphics);

    this.wireHandleEvents();

    this.stageDownHandler = (e: FederatedPointerEvent) => this.onStagePointerDown(e);
    this.stageMoveHandler = (e: FederatedPointerEvent) => this.onStagePointerMove(e);
    this.stageUpHandler = (e: FederatedPointerEvent) => this.onStagePointerUp(e);

    app.stage.on('pointerdown', this.stageDownHandler);
    app.stage.on('pointermove', this.stageMoveHandler);
    app.stage.on('pointerup', this.stageUpHandler);
    app.stage.on('pointerupoutside', this.stageUpHandler);

    this.eventBus.on('element:removed', ({ element }) => {
      this.selected.delete(element);
      this.updateSelectionVisuals();
    });

    this.eventBus.on('element:changed', ({ element }) => {
      if (this.selected.has(element)) {
        this.updateSelectionVisuals();
      }
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

  selectOnly(element: BaseElement): void {
    this.select(element);
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

  deselectAll(): void {
    this.clearSelection();
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

  /**
   * Compute combined bounds in world space by combining each element's
   * logical position (el.x, el.y) with its local-space bounding box.
   * This correctly handles both 'top-left' and 'center' coordinate origins,
   * and is unaffected by viewport zoom/pan.
   */
  private computeCombinedBounds(elements: BaseElement[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const b = el.getDisplayObject().getLocalBounds();
      const wx = el.x + b.x;
      const wy = el.y + b.y;
      minX = Math.min(minX, wx);
      minY = Math.min(minY, wy);
      maxX = Math.max(maxX, wx + b.width);
      maxY = Math.max(maxY, wy + b.height);
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

  /** Convert a global pointer position to world (content-root-local) coords. */
  private toWorld(globalX: number, globalY: number): { x: number; y: number } {
    if (this.contentRoot) {
      return this.contentRoot.toLocal({ x: globalX, y: globalY });
    }
    return { x: globalX, y: globalY };
  }

  private onStagePointerDown(event: FederatedPointerEvent): void {
    // Elements and handles call stopPropagation(), so any event that reaches
    // here was a click on empty canvas — treat it as a background click.
    if (!event.shiftKey) {
      this.clearSelection();
    }
    this.isMarqueeActive = true;
    const world = this.toWorld(event.globalX, event.globalY);
    this.marqueeStart = { x: world.x, y: world.y };
  }

  private onStagePointerMove(event: FederatedPointerEvent): void {
    if (this.transformController.isDragging && !this.isDraggingElement) {
      this.transformController.onPointerMove(event);
      this.updateSelectionVisuals();
      return;
    }

    if (this.isMarqueeActive) {
      const world = this.toWorld(event.globalX, event.globalY);
      this.marquee.draw(
        this.marqueeStart.x, this.marqueeStart.y,
        world.x, world.y,
      );
    }
  }

  private onStagePointerUp(event: FederatedPointerEvent): void {
    if (this.transformController.isDragging && !this.isDraggingElement) {
      this.transformController.onPointerUp(event);
      this.updateSelectionVisuals();
    }

    if (this.isMarqueeActive) {
      this.isMarqueeActive = false;
      const world = this.toWorld(event.globalX, event.globalY);
      const rect = this.marquee.getRect(
        this.marqueeStart.x, this.marqueeStart.y,
        world.x, world.y,
      );
      this.marquee.clear();

      if (rect.width > 3 || rect.height > 3) {
        for (const el of this.elementManager.getAll()) {
          if (!el.interactable) continue;
          const lb = el.getDisplayObject().getLocalBounds();
          const elBounds = {
            x: el.x + lb.x,
            y: el.y + lb.y,
            width: lb.width,
            height: lb.height,
          };
          if (this.boundsOverlap(rect, elBounds)) {
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
