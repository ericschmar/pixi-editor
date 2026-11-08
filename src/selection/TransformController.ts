import type { Container, FederatedPointerEvent } from 'pixi.js';
import type { BaseElement } from '../elements/BaseElement.ts';
import type { EventBus } from '../EventBus.ts';
import type { HandlePosition } from './TransformHandle.ts';
import { angleBetweenPoints } from '../utils/math.ts';
import { getElementsWorldBounds, worldDeltaToLocal, type ElementGeometryInput } from '../geometry/ElementGeometry.ts';
import {
  recordElementEdit, restoreElements, selectionGeometry, snapshotElements, suppressElementActions,
  type ElementSnapshot,
} from './ElementInteraction.ts';

type TransformMode = 'none' | 'move' | 'resize' | 'rotate';

interface StartGeometry extends ElementGeometryInput {
  width: number;
  height: number;
  authoredRotation: number;
}

interface DragState {
  mode: Exclude<TransformMode, 'none'>;
  startX: number;
  startY: number;
  handlePosition?: HandlePosition;
  before: ElementSnapshot[];
  geometry: Map<BaseElement, StartGeometry>;
  center: { x: number; y: number };
  updated: boolean;
}

export class TransformController {
  private eventBus: EventBus;
  private contentRoot: Container | null = null;
  private dragState: DragState | null = null;
  private activeElements: BaseElement[] = [];

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /** Set the world-space root container for coordinate conversion. */
  setContentRoot(root: Container): void {
    this.contentRoot = root;
  }

  get isDragging(): boolean { return this.dragState !== null; }
  get currentMode(): TransformMode { return this.dragState?.mode ?? 'none'; }

  private toWorld(event: FederatedPointerEvent): { x: number; y: number } {
    return this.contentRoot?.toLocal({ x: event.globalX, y: event.globalY }) ??
      { x: event.globalX, y: event.globalY };
  }

  private start(
    mode: Exclude<TransformMode, 'none'>,
    elements: BaseElement[],
    event: FederatedPointerEvent,
    handlePosition?: HandlePosition,
  ): void {
    this.cancel();
    this.activeElements = elements.filter(element => element.interactable && element.effectiveVisible);
    if (!this.activeElements.length) return;
    const world = this.toWorld(event);
    const geometry = new Map<BaseElement, StartGeometry>();
    for (const element of this.activeElements) {
      geometry.set(element, {
        ...selectionGeometry(element), width: element.width, height: element.height,
        authoredRotation: element.rotation,
      });
    }
    const bounds = getElementsWorldBounds([...geometry.values()])!;
    const first = this.activeElements[0]!;
    this.dragState = {
      mode, startX: world.x, startY: world.y, handlePosition,
      before: snapshotElements(this.activeElements), geometry,
      center: this.activeElements.length === 1
        ? { x: first.x, y: first.y }
        : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      updated: false,
    };
    if (mode === 'move') this.eventBus.emit('interaction:dragStart', { element: first, position: world });
    else if (mode === 'resize') this.eventBus.emit('interaction:resizeStart', { element: first });
    else this.eventBus.emit('interaction:rotateStart', { element: first });
  }

  startMove(elements: BaseElement[], event: FederatedPointerEvent): void {
    this.start('move', elements, event);
  }

  startResize(elements: BaseElement[], handlePosition: HandlePosition, event: FederatedPointerEvent): void {
    this.start('resize', elements, event, handlePosition);
  }

  startRotate(elements: BaseElement[], event: FederatedPointerEvent): void {
    this.start('rotate', elements, event);
  }

  onPointerMove(event: FederatedPointerEvent): void {
    const state = this.dragState;
    if (!state) return;
    const world = this.toWorld(event);
    // Don't turn a click into explicit dimensions on auto-sized text/images.
    if (!state.updated && world.x === state.startX && world.y === state.startY) return;
    state.updated = true;
    try {
      suppressElementActions(this.activeElements, () => {
        if (state.mode === 'move') this.handleMove(world, state);
        else if (state.mode === 'resize') this.handleResize(world, state, event.shiftKey);
        else this.handleRotate(world, state, event.shiftKey);
      });
    } catch (error) {
      this.cancel();
      throw error;
    }
  }

  onPointerUp(_event: FederatedPointerEvent): void {
    const state = this.dragState;
    if (!state) return;
    const elements = this.activeElements;
    this.dragState = null;
    this.activeElements = [];
    if (state.updated) recordElementEdit(this.eventBus, state.before, `selection-${state.mode}`, `${state.mode} selection`);
    if (state.mode === 'move') this.eventBus.emit('interaction:dragEnd', { elements });
    else if (state.mode === 'resize') this.eventBus.emit('interaction:resizeEnd', { element: elements[0]! });
    else this.eventBus.emit('interaction:rotateEnd', { element: elements[0]! });
  }

  /** Restore all canonical authored fields; cancellation emits no action or end event. */
  cancel(): void {
    const state = this.dragState;
    this.dragState = null;
    this.activeElements = [];
    if (state?.updated) restoreElements(state.before, this.eventBus);
  }

  private handleMove(world: { x: number; y: number }, state: DragState): void {
    const dx = world.x - state.startX;
    const dy = world.y - state.startY;
    for (const el of this.activeElements) {
      if (this.dragState !== state) break;
      const start = state.geometry.get(el)!;
      el.x = start.x + dx;
      if (this.dragState !== state) return;
      el.y = start.y + dy;
    }
    this.eventBus.emit('interaction:dragMove', { elements: this.activeElements, dx, dy });
  }

  private handleResize(world: { x: number; y: number }, state: DragState, constrain: boolean): void {
    // Re-evaluate each frame from the exact start, not a chain of lossy
    // width/height mutations (e.g. coupled circle sizes or line endpoints).
    restoreElements(state.before, this.eventBus);
    if (this.dragState !== state) return;
    const handle = state.handlePosition!;
    const left = handle.includes('left');
    const right = handle.includes('right');
    const top = handle.includes('top');
    const bottom = handle.includes('bottom');
    // The opposite edge/corner remains fixed, including an off-center local pivot.
    const anchorX = left ? 1 : right ? 0 : 0.5;
    const anchorY = top ? 1 : bottom ? 0 : 0.5;
    for (const el of this.activeElements) {
      if (this.dragState !== state) break;
      const start = state.geometry.get(el)!;
      const local = start.localBounds;
      if (local.width === 0 || local.height === 0) continue;
      const delta = worldDeltaToLocal({ x: world.x - state.startX, y: world.y - state.startY }, start.rotation);
      let w = local.width + (left ? -delta.x : right ? delta.x : 0);
      let h = local.height + (top ? -delta.y : bottom ? delta.y : 0);
      const aspect = local.width / local.height;
      if (constrain) {
        if ((left || right) && (top || bottom)) {
          if (Math.abs(w - local.width) / aspect >= Math.abs(h - local.height)) h = w / aspect;
          else w = h * aspect;
        } else if (left || right) h = w / aspect;
        else w = h * aspect;
      }
      // Preserve the existing minimum, in canonical size units (not viewport pixels).
      w = Math.max(w, start.width > 0 ? 5 * local.width / start.width : 5);
      h = Math.max(h, start.height > 0 ? 5 * local.height / start.height : 5);
      const targetW = start.width * w / local.width;
      const targetH = start.height * h / local.height;
      // Coupled-size shapes may change both dimensions from one setter. Don't
      // overwrite that with an unchanged dimension from the gesture's start.
      if (Math.abs(w - local.width) > 1e-10 || Math.abs(el.width - start.width) > 1e-10) el.width = targetW;
      if (this.dragState !== state) return;
      if (Math.abs(h - local.height) > 1e-10) el.height = targetH;
      if (this.dragState !== state) return;
      const actual = selectionGeometry(el).localBounds;
      const oppositeBefore = worldDeltaToLocal({
        x: local.x + local.width * anchorX,
        y: local.y + local.height * anchorY,
      }, -start.rotation);
      const oppositeAfter = worldDeltaToLocal({
        x: actual.x + actual.width * anchorX,
        y: actual.y + actual.height * anchorY,
      }, -start.rotation);
      el.x = start.x + (oppositeBefore.x - oppositeAfter.x);
      if (this.dragState !== state) return;
      el.y = start.y + (oppositeBefore.y - oppositeAfter.y);
      // Returning to the start must also restore auto-size and exact shape params.
      if (Math.abs(delta.x) < 1e-10 && Math.abs(delta.y) < 1e-10) {
        restoreElements(state.before.filter(snapshot => snapshot.element === el), this.eventBus);
      }
    }
  }

  private handleRotate(world: { x: number; y: number }, state: DragState, _constrain: boolean): void {
    const { x: cx, y: cy } = state.center;
    const angle = angleBetweenPoints(cx, cy, world.x, world.y) -
      angleBetweenPoints(cx, cy, state.startX, state.startY);
    for (const el of this.activeElements) {
      if (this.dragState !== state) break;
      const start = state.geometry.get(el)!;
      el.rotation = start.authoredRotation + angle;
      if (this.dragState !== state) return;
      if (this.activeElements.length > 1) {
        const origin = worldDeltaToLocal({ x: start.x - cx, y: start.y - cy }, -angle);
        el.x = cx + origin.x;
        el.y = cy + origin.y;
      }
    }
  }
}
