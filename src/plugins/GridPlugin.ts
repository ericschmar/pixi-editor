import { Graphics } from 'pixi.js';
import type { Plugin } from './Plugin.ts';
import type { WatchfaceEngine } from '../WatchfaceEngine.ts';
import type { ViewportPlugin } from './ViewportPlugin.ts';

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

    // Place on stage (outside viewport) so it is never scaled by zoom
    engine.app.stage.addChild(this.gridGraphics);

    this.drawGrid();

    // Redraw whenever the viewport zooms or pans
    const unsubZoom = engine.eventBus.on('viewport:zoomed', () => this.drawGrid());
    const unsubMove = engine.eventBus.on('viewport:moved', () => this.drawGrid());
    this.unsubscribers.push(unsubZoom, unsubMove);

    // Snap-to-grid on drag
    const unsubDrag = engine.eventBus.on('interaction:dragMove', ({ elements }) => {
      if (!this.options.snapEnabled) return;
      for (const el of elements) {
        el.x = this.snapValue(el.x);
        el.y = this.snapValue(el.y);
      }
    });
    this.unsubscribers.push(unsubDrag);
  }

  snapValue(value: number): number {
    return Math.round(value / this.options.cellSize) * this.options.cellSize;
  }

  private drawGrid(): void {
    this.gridGraphics.clear();

    const { width, height } = this.engine.options;
    const { x: ox, y: oy } = this.engine.originOffset;
    const { cellSize, color } = this.options;

    // Get current viewport transform (scale + pan) if ViewportPlugin is active
    const viewportPlugin = this.engine.plugins.get('viewport') as ViewportPlugin | undefined;
    const viewport = viewportPlugin?.viewport;

    let scale = 1;
    let panX = 0;
    let panY = 0;

    if (viewport) {
      scale = viewport.scale.x;
      panX = viewport.x;
      panY = viewport.y;
    }

    // The contentRoot offset (origin) in screen space
    // contentRoot.x/y accounts for both the viewport pan and the origin offset
    const originScreenX = panX + ox * scale;
    const originScreenY = panY + oy * scale;

    // Screen-space cell size
    const screenCell = cellSize * scale;

    // Find the first grid line to the left/above the canvas edge (screen 0,0)
    // by working backwards from the origin in screen space
    const startX = originScreenX - Math.ceil(originScreenX / screenCell) * screenCell;
    const startY = originScreenY - Math.ceil(originScreenY / screenCell) * screenCell;

    // Vertical lines across the canvas width
    for (let sx = startX; sx <= width; sx += screenCell) {
      this.gridGraphics
        .moveTo(sx, 0)
        .lineTo(sx, height)
        .stroke({ color, width: 0.5 });
    }

    // Horizontal lines across the canvas height
    for (let sy = startY; sy <= height; sy += screenCell) {
      this.gridGraphics
        .moveTo(0, sy)
        .lineTo(width, sy)
        .stroke({ color, width: 0.5 });
    }
  }

  destroy(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.gridGraphics.destroy();
  }
}
