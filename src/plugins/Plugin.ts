import type { WatchfaceEngine } from '../WatchfaceEngine.ts';

export interface Plugin {
  readonly name: string;
  init(engine: WatchfaceEngine): void;
  destroy(): void;
  update?(deltaTime: number): void;
}
