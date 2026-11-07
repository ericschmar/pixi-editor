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
  private batchActions: UndoableAction[] | null = null;
  private replaying = false;

  constructor(options?: UndoRedoPluginOptions) {
    this.maxHistory = options?.maxHistory ?? 100;
    if (!Number.isInteger(this.maxHistory) || this.maxHistory < 0) {
      throw new RangeError('maxHistory must be a non-negative integer');
    }
  }

  init(engine: WatchfaceEngine): void {
    this.engine = engine;
    const unsub = engine.eventBus.on('action:performed', ({ action }) => {
      if (this.engine._suppressActions) return;
      if (this.batchActions) this.batchActions.push(action);
      else this.record(action);
    });
    this.unsubscribers.push(unsub);
  }

  private record(action: UndoableAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Synchronous, nestable recording suspension; canonical change events still fire. */
  suspend<T>(fn: () => T): T {
    const previous = this.engine._suppressActions;
    this.engine._suppressActions = true;
    try {
      return fn();
    } finally {
      this.engine._suppressActions = previous;
    }
  }

  /** Group already-performed actions. Nested batches join the outer batch. */
  batch<T>(description: string, fn: () => T): T {
    if (this.batchActions || this.engine._suppressActions) return fn();
    const actions: UndoableAction[] = [];
    this.batchActions = actions;
    let result: T;
    try {
      result = fn();
    } catch (error) {
      try {
        this.suspend(() => {
          for (let i = actions.length - 1; i >= 0; i--) actions[i]!.undo();
        });
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Batch callback and rollback failed');
      } finally {
        this.batchActions = null;
      }
      throw error;
    }
    this.batchActions = null;
    if (actions.length) {
      this.record({
        type: 'batch',
        description,
        undo() {
          for (let i = actions.length - 1; i >= 0; i--) actions[i]!.undo();
        },
        redo() {
          for (const action of actions) action.redo();
        },
      });
    }
    return result;
  }

  private assertIdle(): void {
    if (this.batchActions || this.replaying) {
      throw new Error('Cannot change history during a batch or undo/redo');
    }
  }

  undo(): void {
    this.assertIdle();
    const action = this.undoStack[this.undoStack.length - 1];
    if (!action) return;
    this.replaying = true;
    try {
      this.suspend(() => action.undo());
      this.undoStack.pop();
      this.redoStack.push(action);
    } finally {
      this.replaying = false;
    }
  }

  redo(): void {
    this.assertIdle();
    const action = this.redoStack[this.redoStack.length - 1];
    if (!action) return;
    this.replaying = true;
    try {
      this.suspend(() => action.redo());
      this.redoStack.pop();
      this.undoStack.push(action);
    } finally {
      this.replaying = false;
    }
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  clear(): void {
    this.assertIdle();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  destroy(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers.length = 0;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
