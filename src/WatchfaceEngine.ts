import { Application, Container } from 'pixi.js';
import { EventBus } from './EventBus.ts';
import { ElementManager } from './managers/ElementManager.ts';
import { ZOrderManager } from './managers/ZOrderManager.ts';
import { InteractionManager } from './managers/InteractionManager.ts';
import { SerializationManager } from './managers/SerializationManager.ts';
import { SelectionManager } from './selection/SelectionManager.ts';
import { PluginManager } from './plugins/PluginManager.ts';
import type { HandleConfig } from './types.ts';

export interface WatchfaceEngineOptions {
  width: number;
  height: number;
  background?: string | number;
  selectionHandleColor?: number;
  selectionHandleFillColor?: number;
  selectionHandleSize?: number;
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
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    container.appendChild(this.app.canvas);

    // Build layer hierarchy
    this.backgroundLayer = new Container();
    this.elementsLayer = new Container();
    this.elementsLayer.sortableChildren = true;
    this.selectionLayer = new Container();
    this.overlayLayer = new Container();

    this.app.stage.addChild(
      this.backgroundLayer,
      this.elementsLayer,
      this.selectionLayer,
      this.overlayLayer,
    );

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
    this.selection.init(this.selectionLayer, this.app, handleConfig);

    this._initialized = true;
    this.eventBus.emit('engine:ready');
  }

  get options(): Readonly<WatchfaceEngineOptions> {
    return this._options;
  }

  get initialized(): boolean {
    return this._initialized;
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
