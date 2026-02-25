import type { Plugin } from './Plugin.ts';
import type { WatchfaceEngine } from '../WatchfaceEngine.ts';
import type { UndoableAction } from '../types.ts';

export interface UndoRedoPluginOptions {
  maxHistory?: number;
}

export class UndoRedoPlugin implements Plugin {
  readonly name = 'undoredo';
  private engine!: WatchfaceEngine;
  private undoStack: UndoableAction[] = [];
  private redoStack: UndoableAction[] = [];
  private maxHistory: number;
  private unsubscribers: (() => void)[] = [];

  constructor(options?: UndoRedoPluginOptions) {
    this.maxHistory = options?.maxHistory ?? 100;
  }

  init(engine: WatchfaceEngine): void {
    this.engine = engine;
    const unsub = engine.eventBus.on('action:performed', ({ action }) => {
      this.undoStack.push(action);
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
      this.redoStack.length = 0;
    });
    this.unsubscribers.push(unsub);
  }

  undo(): void {
    const action = this.undoStack.pop();
    if (!action) return;
    this.engine._suppressActions = true;
    action.undo();
    this.engine._suppressActions = false;
    this.redoStack.push(action);
  }

  redo(): void {
    const action = this.redoStack.pop();
    if (!action) return;
    this.engine._suppressActions = true;
    action.redo();
    this.engine._suppressActions = false;
    this.undoStack.push(action);
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  destroy(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
