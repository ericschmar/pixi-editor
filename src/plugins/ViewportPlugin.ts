import { Viewport } from 'pixi-viewport';
import type { Plugin } from './Plugin.ts';
import type { WatchfaceEngine } from '../WatchfaceEngine.ts';

export interface ViewportPluginOptions {
  /** World width — defaults to engine canvas width */
  worldWidth?: number;
  /** World height — defaults to engine canvas height */
  worldHeight?: number;
  /** Minimum scale (zoom out limit). Default: 0.1 */
  minScale?: number;
  /** Maximum scale (zoom in limit). Default: 10 */
  maxScale?: number;
  /** Enable drag panning. Default: true */
  drag?: boolean;
  /** Enable pinch-to-zoom. Default: true */
  pinch?: boolean;
  /** Enable mouse-wheel zoom. Default: true */
  wheel?: boolean;
  /** Enable deceleration after drag. Default: true */
  decelerate?: boolean;
}

const DEFAULTS: Required<ViewportPluginOptions> = {
  worldWidth: 0,  // filled from engine.options at init time
  worldHeight: 0,
  minScale: 0.1,
  maxScale: 10,
  drag: true,
  pinch: true,
  wheel: true,
  decelerate: true,
};

export class ViewportPlugin implements Plugin {
  readonly name = 'viewport';

  private options: Required<ViewportPluginOptions>;
  private engine!: WatchfaceEngine;
  private _viewport!: Viewport;

  constructor(options?: ViewportPluginOptions) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Direct access to the pixi-viewport Viewport instance */
  get viewport(): Viewport {
    return this._viewport;
  }

  get zoom(): number {
    return this._viewport?.scale.x ?? 1;
  }

  set zoom(value: number) {
    if (!this._viewport) return;
    const clamped = Math.max(this.options.minScale, Math.min(this.options.maxScale, value));
    this._viewport.setZoom(clamped, true);
    this.engine.eventBus.emit('viewport:zoomed', { zoom: clamped });
  }

  get drag(): boolean { return this.options.drag; }
  set drag(value: boolean) {
    this.options.drag = value;
    if (!this._viewport) return;
    if (value) {
      this._viewport.drag({ mouseButtons: 'middle-right' });
    } else {
      this._viewport.plugins.remove('drag');
    }
  }

  get wheel(): boolean { return this.options.wheel; }
  set wheel(value: boolean) {
    this.options.wheel = value;
    if (!this._viewport) return;
    if (value) {
      this._viewport.wheel({ smooth: 3 });
    } else {
      this._viewport.plugins.remove('wheel');
    }
  }

  init(engine: WatchfaceEngine): void {
    this.engine = engine;
    const { app } = engine;
    const { width, height } = engine.options;

    const worldWidth = this.options.worldWidth || width;
    const worldHeight = this.options.worldHeight || height;

    this._viewport = new Viewport({
      screenWidth: width,
      screenHeight: height,
      worldWidth,
      worldHeight,
      events: app.renderer.events,
    });

    // Clamp zoom
    this._viewport.clampZoom({
      minScale: this.options.minScale,
      maxScale: this.options.maxScale,
    });

    // Activate plugins based on options
    if (this.options.drag) this._viewport.drag({ mouseButtons: 'middle-right' });
    if (this.options.pinch) this._viewport.pinch();
    if (this.options.wheel) this._viewport.wheel({ smooth: 3 });
    if (this.options.decelerate) this._viewport.decelerate();

    // Move all engine layers into the viewport
    const layers = [
      engine.getBackgroundLayer(),
      engine.getElementsLayer(),
      engine.getSelectionLayer(),
      engine.getOverlayLayer(),
    ];

    for (const layer of layers) {
      // Remove from stage if already there, then re-parent into viewport
      layer.parent?.removeChild(layer);
      this._viewport.addChild(layer);
    }

    // Insert viewport into the stage (at index 0 to keep it at bottom of stage)
    app.stage.addChildAt(this._viewport, 0);

    // Keep stage interactive for left-click selection/marquee.
    // The viewport handles middle/right drag and wheel zoom without interfering.

    // Emit events on viewport changes
    this._viewport.on('zoomed', () => {
      this.engine.eventBus.emit('viewport:zoomed', { zoom: this._viewport.scale.x });
    });
    this._viewport.on('moved', () => {
      this.engine.eventBus.emit('viewport:moved', {
        x: this._viewport.x,
        y: this._viewport.y,
      });
    });
  }

  destroy(): void {
    if (!this._viewport) return;

    // Move layers back to stage before destroying viewport
    const { app } = this.engine;
    const layers = [
      this.engine.getBackgroundLayer(),
      this.engine.getElementsLayer(),
      this.engine.getSelectionLayer(),
      this.engine.getOverlayLayer(),
    ];

    for (const layer of layers) {
      this._viewport.removeChild(layer);
      app.stage.addChild(layer);
    }

    this._viewport.destroy();

  }
}
