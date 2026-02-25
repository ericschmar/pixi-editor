import type { FederatedPointerEvent } from 'pixi.js';
import type { BaseElement } from '../elements/BaseElement.ts';
import type { EventBus } from '../EventBus.ts';
import type { HandlePosition } from './TransformHandle.ts';
import { angleBetweenPoints } from '../utils/math.ts';

type TransformMode = 'none' | 'move' | 'resize' | 'rotate';

interface DragState {
  mode: TransformMode;
  startX: number;
  startY: number;
  handlePosition?: HandlePosition;
  elementStartProps: Map<string, { x: number; y: number; width: number; height: number; rotation: number }>;
}

export class TransformController {
  private eventBus: EventBus;
  private dragState: DragState | null = null;
  private activeElements: BaseElement[] = [];

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  get isDragging(): boolean {
    return this.dragState !== null;
  }

  get currentMode(): TransformMode {
    return this.dragState?.mode ?? 'none';
  }

  startMove(elements: BaseElement[], event: FederatedPointerEvent): void {
    this.activeElements = elements;
    const startProps = new Map<string, { x: number; y: number; width: number; height: number; rotation: number }>();
    for (const el of elements) {
      startProps.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation });
    }

    this.dragState = {
      mode: 'move',
      startX: event.globalX,
      startY: event.globalY,
      elementStartProps: startProps,
    };

    if (elements.length > 0) {
      this.eventBus.emit('interaction:dragStart', {
        element: elements[0]!,
        position: { x: event.globalX, y: event.globalY },
      });
    }
  }

  startResize(elements: BaseElement[], handlePosition: HandlePosition, event: FederatedPointerEvent): void {
    this.activeElements = elements;
    const startProps = new Map<string, { x: number; y: number; width: number; height: number; rotation: number }>();
    for (const el of elements) {
      startProps.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation });
    }

    this.dragState = {
      mode: 'resize',
      startX: event.globalX,
      startY: event.globalY,
      handlePosition,
      elementStartProps: startProps,
    };

    if (elements.length > 0) {
      this.eventBus.emit('interaction:resizeStart', { element: elements[0]! });
    }
  }

  startRotate(elements: BaseElement[], event: FederatedPointerEvent): void {
    this.activeElements = elements;
    const startProps = new Map<string, { x: number; y: number; width: number; height: number; rotation: number }>();
    for (const el of elements) {
      startProps.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation });
    }

    this.dragState = {
      mode: 'rotate',
      startX: event.globalX,
      startY: event.globalY,
      elementStartProps: startProps,
    };

    if (elements.length > 0) {
      this.eventBus.emit('interaction:rotateStart', { element: elements[0]! });
    }
  }

  onPointerMove(event: FederatedPointerEvent): void {
    if (!this.dragState) return;

    switch (this.dragState.mode) {
      case 'move':
        this.handleMove(event);
        break;
      case 'resize':
        this.handleResize(event);
        break;
      case 'rotate':
        this.handleRotate(event);
        break;
    }
  }

  onPointerUp(_event: FederatedPointerEvent): void {
    if (!this.dragState) return;
    const mode = this.dragState.mode;

    if (mode === 'move' && this.activeElements.length > 0) {
      this.eventBus.emit('interaction:dragEnd', { elements: this.activeElements });
    } else if (mode === 'resize' && this.activeElements.length > 0) {
      this.eventBus.emit('interaction:resizeEnd', { element: this.activeElements[0]! });
    } else if (mode === 'rotate' && this.activeElements.length > 0) {
      this.eventBus.emit('interaction:rotateEnd', { element: this.activeElements[0]! });
    }

    this.dragState = null;
    this.activeElements = [];
  }

  cancel(): void {
    if (!this.dragState) return;
    // Restore original positions
    for (const el of this.activeElements) {
      const start = this.dragState.elementStartProps.get(el.id);
      if (start) {
        el.x = start.x;
        el.y = start.y;
      }
    }
    this.dragState = null;
    this.activeElements = [];
  }

  private handleMove(event: FederatedPointerEvent): void {
    if (!this.dragState) return;
    const dx = event.globalX - this.dragState.startX;
    const dy = event.globalY - this.dragState.startY;

    for (const el of this.activeElements) {
      const start = this.dragState.elementStartProps.get(el.id);
      if (start) {
        el.x = start.x + dx;
        el.y = start.y + dy;
      }
    }

    this.eventBus.emit('interaction:dragMove', {
      elements: this.activeElements,
      dx,
      dy,
    });
  }

  private handleResize(event: FederatedPointerEvent): void {
    if (!this.dragState || !this.dragState.handlePosition) return;
    const dx = event.globalX - this.dragState.startX;
    const dy = event.globalY - this.dragState.startY;
    const handle = this.dragState.handlePosition;

    for (const el of this.activeElements) {
      const start = this.dragState.elementStartProps.get(el.id);
      if (!start) continue;

      let newX = start.x;
      let newY = start.y;
      let newW = start.width;
      let newH = start.height;

      // Adjust based on which handle is being dragged
      if (handle.includes('left')) {
        newX = start.x + dx;
        newW = start.width - dx;
      }
      if (handle.includes('right')) {
        newW = start.width + dx;
      }
      if (handle.includes('top')) {
        newY = start.y + dy;
        newH = start.height - dy;
      }
      if (handle.includes('bottom')) {
        newH = start.height + dy;
      }

      // Prevent negative dimensions
      if (newW < 5) { newW = 5; newX = start.x + start.width - 5; }
      if (newH < 5) { newH = 5; newY = start.y + start.height - 5; }

      el.x = newX;
      el.y = newY;
      el.width = newW;
      el.height = newH;
    }
  }

  private handleRotate(event: FederatedPointerEvent): void {
    if (!this.dragState) return;

    for (const el of this.activeElements) {
      const start = this.dragState.elementStartProps.get(el.id);
      if (!start) continue;

      // Compute center of element
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;

      // Angle from center to current pointer
      const angle = angleBetweenPoints(cx, cy, event.globalX, event.globalY);
      // Angle from center to start pointer
      const startAngle = angleBetweenPoints(cx, cy, this.dragState.startX, this.dragState.startY);

      el.rotation = start.rotation + (angle - startAngle);
    }
  }
}
