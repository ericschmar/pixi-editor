import { Application, Container } from 'pixi.js';
import { EventBus } from './EventBus.ts';
import { ElementManager } from './managers/ElementManager.ts';
import { ZOrderManager } from './managers/ZOrderManager.ts';
import { InteractionManager } from './managers/InteractionManager.ts';
import { SerializationManager } from './managers/SerializationManager.ts';
import { SelectionManager } from './selection/SelectionManager.ts';
import { PluginManager } from './plugins/PluginManager.ts';
import type { HandleConfig, CoordinateOrigin } from './types.ts';

export interface WatchfaceEngineOptions {
  width: number;
  height: number;
  background?: string | number;
  selectionHandleColor?: number;
  selectionHandleFillColor?: number;
  selectionHandleSize?: number;
  /**
   * Where (0, 0) is placed on the canvas.
   * - `'top-left'` (default) — standard screen coordinates.
   * - `'center'` — origin is the center of the canvas; useful for watchface
   *   layouts where elements are positioned relative to the watch center.
   */
  coordinateOrigin?: CoordinateOrigin;
}

export class WatchfaceEngine {
  readonly app: Application;
  readonly eventBus: EventBus;
  readonly elements: ElementManager;
  readonly selection: SelectionManager;
  readonly plugins: PluginManager;
  readonly serialization: SerializationManager;
  readonly zOrder: ZOrderManager;

  private backgroundLayer!: Container;
  private elementsLayer!: Container;
  private selectionLayer!: Container;
  private overlayLayer!: Container;

  /**
   * Single container that holds all four layers. Plugins (e.g. ViewportPlugin)
   * should move this container rather than individual layers.
   * @internal
   */
  private _contentRoot!: Container;

  private interaction: InteractionManager;

  private _options!: WatchfaceEngineOptions;
  private _initialized = false;

  /** @internal Used by UndoRedoPlugin to suppress action recording during undo/redo */
  _suppressActions = false;

  constructor() {
    this.app = new Application();
    this.eventBus = new EventBus();
    this.elements = new ElementManager(this, this.eventBus);
    this.zOrder = new ZOrderManager(this.elements);
    this.selection = new SelectionManager(this.eventBus, this.elements);
    this.interaction = new InteractionManager(this.eventBus, this.elements);
    this.serialization = new SerializationManager(
      this.eventBus,
      this.elements,
      () => ({ width: this._options.width, height: this._options.height }),
    );
    this.plugins = new PluginManager(this);

    // Wire selection as the interaction delegate
    this.interaction.setDelegate(this.selection);
    this.selection.setSerializationManager(this.serialization);
  }

  async init(container: HTMLDivElement, options: WatchfaceEngineOptions): Promise<void> {
    this._options = options;

    await this.app.init({
      width: options.width,
      height: options.height,
      background: options.background ?? 0x1a1a2e,
      antialias: true,
    });

    container.appendChild(this.app.canvas);

    // contentRoot holds all layers; offset it to implement coordinateOrigin
    this._contentRoot = new Container();
    if (options.coordinateOrigin === 'center') {
      this._contentRoot.x = options.width / 2;
      this._contentRoot.y = options.height / 2;
    }

    // Build layer hierarchy inside contentRoot
    this.backgroundLayer = new Container();
    this.elementsLayer = new Container();
    this.elementsLayer.sortableChildren = true;
    this.selectionLayer = new Container();
    this.overlayLayer = new Container();

    this._contentRoot.addChild(
      this.backgroundLayer,
      this.elementsLayer,
      this.selectionLayer,
      this.overlayLayer,
    );

    this.app.stage.addChild(this._contentRoot);

    // Enable stage interaction for marquee selection
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    // Set element manager layer
    this.elements._setLayer(this.elementsLayer);

    // Initialize selection with handle config
    const handleConfig: Partial<HandleConfig> = {};
    if (options.selectionHandleColor !== undefined) handleConfig.color = options.selectionHandleColor;
    if (options.selectionHandleFillColor !== undefined) handleConfig.fillColor = options.selectionHandleFillColor;
    if (options.selectionHandleSize !== undefined) handleConfig.size = options.selectionHandleSize;
    this.selection.init(this.selectionLayer, this.app, handleConfig, this._contentRoot);

    this._initialized = true;
    this.eventBus.emit('engine:ready');
  }

  get options(): Readonly<WatchfaceEngineOptions> {
    return this._options;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * The offset applied to the content root based on `coordinateOrigin`.
   * `{ x: 0, y: 0 }` for `'top-left'`, `{ x: width/2, y: height/2 }` for `'center'`.
   */
  get originOffset(): { x: number; y: number } {
    if (this._options?.coordinateOrigin === 'center') {
      return { x: this._options.width / 2, y: this._options.height / 2 };
    }
    return { x: 0, y: 0 };
  }

  /** The container that holds all layers. Plugins should add this to viewports. */
  getContentRoot(): Container {
    return this._contentRoot;
  }

  getBackgroundLayer(): Container {
    return this.backgroundLayer;
  }

  getElementsLayer(): Container {
    return this.elementsLayer;
  }

  getSelectionLayer(): Container {
    return this.selectionLayer;
  }

  getOverlayLayer(): Container {
    return this.overlayLayer;
  }

  destroy(): void {
    this.plugins.destroyAll();
    this.selection.destroy();
    this.interaction.destroy();
    this.elements.clear();
    this.eventBus.emit('engine:destroy');
    this.eventBus.removeAllListeners();
    this.app.destroy(true, { children: true });
    this._initialized = false;
  }
}
