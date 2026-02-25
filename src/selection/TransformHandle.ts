import { Graphics } from 'pixi.js';
import type { HandleConfig } from '../types.ts';

export type HandlePosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-right' | 'bottom-right' | 'bottom-center'
  | 'bottom-left' | 'middle-left' | 'rotate';

const CURSORS: Record<HandlePosition, string> = {
  'top-left': 'nwse-resize',
  'top-center': 'ns-resize',
  'top-right': 'nesw-resize',
  'middle-right': 'ew-resize',
  'bottom-right': 'nwse-resize',
  'bottom-center': 'ns-resize',
  'bottom-left': 'nesw-resize',
  'middle-left': 'ew-resize',
  'rotate': 'grab',
};

export class TransformHandle {
  readonly graphics: Graphics;
  readonly position: HandlePosition;

  constructor(position: HandlePosition) {
    this.position = position;
    this.graphics = new Graphics();
    this.graphics.eventMode = 'static';
    this.graphics.cursor = CURSORS[position];
    this.graphics.visible = false;
  }

  show(x: number, y: number, config: HandleConfig): void {
    this.graphics.clear();
    this.graphics.visible = true;
    const half = config.size / 2;

    if (this.position === 'rotate') {
      this.graphics
        .circle(0, 0, config.size / 2 + 1)
        .fill({ color: config.fillColor })
        .stroke({ color: config.color, width: 1.5 });
    } else {
      this.graphics
        .rect(-half, -half, config.size, config.size)
        .fill({ color: config.fillColor })
        .stroke({ color: config.color, width: 1.5 });
    }

    this.graphics.x = x;
    this.graphics.y = y;
  }

  hide(): void {
    this.graphics.visible = false;
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
