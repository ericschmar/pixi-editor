import type { Ticker } from 'pixi.js';
import type { Plugin } from './Plugin.ts';
import type { WatchfaceEngine } from '../WatchfaceEngine.ts';

export class PluginManager {
  private plugins = new Map<string, Plugin>();
  private engine: WatchfaceEngine;
  private tickerCallbacks = new Map<string, (ticker: Ticker) => void>();

  constructor(engine: WatchfaceEngine) {
    this.engine = engine;
  }

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered.`);
    }
    this.plugins.set(plugin.name, plugin);
    plugin.init(this.engine);

    if (plugin.update) {
      const callback = (ticker: Ticker) => {
        if (this.plugins.has(plugin.name)) {
          plugin.update!(ticker.deltaTime);
        }
      };
      this.tickerCallbacks.set(plugin.name, callback);
      this.engine.app.ticker.add(callback);
    }
  }

  unregister(name: string): void {
    const plugin = this.plugins.get(name);
    if (!plugin) return;

    const tickerCallback = this.tickerCallbacks.get(name);
    if (tickerCallback) {
      this.engine.app.ticker.remove(tickerCallback);
      this.tickerCallbacks.delete(name);
    }

    plugin.destroy();
    this.plugins.delete(name);
  }

  get<T extends Plugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  destroyAll(): void {
    for (const [name] of this.plugins) {
      this.unregister(name);
    }
  }
}
