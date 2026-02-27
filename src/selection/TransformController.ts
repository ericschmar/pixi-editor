import type { Container, FederatedPointerEvent } from 'pixi.js';
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

  get isDragging(): boolean {
    return this.dragState !== null;
  }

  get currentMode(): TransformMode {
    return this.dragState?.mode ?? 'none';
  }

  /** Convert a pointer event's global position to world (content-root-local) coordinates. */
  private toWorld(event: FederatedPointerEvent): { x: number; y: number } {
    if (this.contentRoot) {
      return this.contentRoot.toLocal({ x: event.globalX, y: event.globalY });
    }
    return { x: event.globalX, y: event.globalY };
  }

  startMove(elements: BaseElement[], event: FederatedPointerEvent): void {
    this.activeElements = elements;
    const startProps = new Map<string, { x: number; y: number; width: number; height: number; rotation: number }>();
    for (const el of elements) {
      startProps.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation });
    }

    const world = this.toWorld(event);
    this.dragState = {
      mode: 'move',
      startX: world.x,
      startY: world.y,
      elementStartProps: startProps,
    };

    if (elements.length > 0) {
      this.eventBus.emit('interaction:dragStart', {
        element: elements[0]!,
        position: { x: world.x, y: world.y },
      });
    }
  }

  startResize(elements: BaseElement[], handlePosition: HandlePosition, event: FederatedPointerEvent): void {
    this.activeElements = elements;
    const startProps = new Map<string, { x: number; y: number; width: number; height: number; rotation: number }>();
    for (const el of elements) {
      startProps.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation });
    }

    const world = this.toWorld(event);
    this.dragState = {
      mode: 'resize',
      startX: world.x,
      startY: world.y,
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

    const world = this.toWorld(event);
    this.dragState = {
      mode: 'rotate',
      startX: world.x,
      startY: world.y,
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
    const world = this.toWorld(event);
    const dx = world.x - this.dragState.startX;
    const dy = world.y - this.dragState.startY;

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
    const world = this.toWorld(event);
    const dx = world.x - this.dragState.startX;
    const dy = world.y - this.dragState.startY;
    const handle = this.dragState.handlePosition;
    const constrain = event.shiftKey;

    for (const el of this.activeElements) {
      const start = this.dragState.elementStartProps.get(el.id);
      if (!start) continue;

      const aspect = start.height === 0 ? 1 : start.width / start.height;

      let newX = start.x;
      let newY = start.y;
      let newW = start.width;
      let newH = start.height;

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

      if (constrain && start.width > 0 && start.height > 0) {
        const isCorner =
          (handle.includes('left') || handle.includes('right')) &&
          (handle.includes('top') || handle.includes('bottom'));

        if (isCorner) {
          // Use the dominant delta to drive both dimensions
          const absDx = Math.abs(newW - start.width);
          const absDy = Math.abs(newH - start.height);
          if (absDx / aspect >= absDy) {
            // Width change dominates — constrain height
            newH = newW / aspect;
            if (handle.includes('top')) newY = start.y + start.height - newH;
          } else {
            // Height change dominates — constrain width
            newW = newH * aspect;
            if (handle.includes('left')) newX = start.x + start.width - newW;
          }
        } else {
          // Edge handle — scale the other dimension from center
          if (handle === 'middle-left' || handle === 'middle-right') {
            const centerY = start.y + start.height / 2;
            newH = newW / aspect;
            newY = centerY - newH / 2;
          } else {
            // top-center or bottom-center
            const centerX = start.x + start.width / 2;
            newW = newH * aspect;
            newX = centerX - newW / 2;
          }
        }
      }

      if (newW < 5) { newW = 5; if (handle.includes('left')) newX = start.x + start.width - 5; }
      if (newH < 5) { newH = 5; if (handle.includes('top')) newY = start.y + start.height - 5; }

      el.x = newX;
      el.y = newY;
      el.width = newW;
      el.height = newH;
    }
  }

  private handleRotate(event: FederatedPointerEvent): void {
    if (!this.dragState) return;
    const world = this.toWorld(event);

    for (const el of this.activeElements) {
      const start = this.dragState.elementStartProps.get(el.id);
      if (!start) continue;

      // Element center in world space
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;

      const angle = angleBetweenPoints(cx, cy, world.x, world.y);
      const startAngle = angleBetweenPoints(cx, cy, this.dragState.startX, this.dragState.startY);

      el.rotation = start.rotation + (angle - startAngle);
    }
  }
}
