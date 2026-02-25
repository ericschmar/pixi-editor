import { Graphics } from 'pixi.js';
import type { Plugin } from './Plugin.ts';
import type { WatchfaceEngine } from '../WatchfaceEngine.ts';

export interface GridPluginOptions {
  cellSize?: number;
  color?: number;
  opacity?: number;
  snapEnabled?: boolean;
  visible?: boolean;
}

const DEFAULTS: Required<GridPluginOptions> = {
  cellSize: 20,
  color: 0x444444,
  opacity: 0.3,
  snapEnabled: false,
  visible: true,
};

export class GridPlugin implements Plugin {
  readonly name = 'grid';
  private engine!: WatchfaceEngine;
  private gridGraphics!: Graphics;
  private options: Required<GridPluginOptions>;
  private unsubscribers: (() => void)[] = [];

  constructor(options?: GridPluginOptions) {
    this.options = { ...DEFAULTS, ...options };
  }

  get cellSize(): number { return this.options.cellSize; }
  set cellSize(value: number) {
    this.options.cellSize = value;
    this.drawGrid();
  }

  get snapEnabled(): boolean { return this.options.snapEnabled; }
  set snapEnabled(value: boolean) { this.options.snapEnabled = value; }

  get visible(): boolean { return this.options.visible; }
  set visible(value: boolean) {
    this.options.visible = value;
    this.gridGraphics.visible = value;
  }

  init(engine: WatchfaceEngine): void {
    this.engine = engine;
    this.gridGraphics = new Graphics();
    this.gridGraphics.alpha = this.options.opacity;
    this.gridGraphics.visible = this.options.visible;
    engine.getBackgroundLayer().addChild(this.gridGraphics);
    this.drawGrid();

    // Hook into drag events for snap-to-grid
    const unsub = engine.eventBus.on('interaction:dragMove', ({ elements }) => {
      if (!this.options.snapEnabled) return;
      for (const el of elements) {
        el.x = this.snapValue(el.x);
        el.y = this.snapValue(el.y);
      }
    });
    this.unsubscribers.push(unsub);
  }

  snapValue(value: number): number {
    return Math.round(value / this.options.cellSize) * this.options.cellSize;
  }

  private drawGrid(): void {
    this.gridGraphics.clear();
    const { width, height } = this.engine.options;
    const { cellSize, color } = this.options;

    // Vertical lines
    for (let x = 0; x <= width; x += cellSize) {
      this.gridGraphics
        .moveTo(x, 0)
        .lineTo(x, height)
        .stroke({ color, width: 0.5 });
    }

    // Horizontal lines
    for (let y = 0; y <= height; y += cellSize) {
      this.gridGraphics
        .moveTo(0, y)
        .lineTo(width, y)
        .stroke({ color, width: 0.5 });
    }
  }

  destroy(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.gridGraphics.destroy();
  }
}
