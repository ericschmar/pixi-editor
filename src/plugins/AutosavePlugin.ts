import type { Plugin } from './Plugin.ts';
import type { WatchfaceEngine } from '../WatchfaceEngine.ts';

export interface AutosavePluginOptions {
  intervalMs?: number;
  onSave: (json: string) => void | Promise<void>;
}

export class AutosavePlugin implements Plugin {
  readonly name = 'autosave';
  private engine!: WatchfaceEngine;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private onSave: (json: string) => void | Promise<void>;

  constructor(options: AutosavePluginOptions) {
    this.intervalMs = options.intervalMs ?? 30000;
    this.onSave = options.onSave;
  }

  init(engine: WatchfaceEngine): void {
    this.engine = engine;
    this.timer = setInterval(() => {
      this.saveNow();
    }, this.intervalMs);
  }

  saveNow(): void {
    const json = this.engine.serialization.serialize();
    this.onSave(json);
    this.engine.eventBus.emit('state:saved', { json });
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
