import type { Plugin } from './Plugin.ts';
import type { WatchfaceEngine } from '../WatchfaceEngine.ts';
import { UndoRedoPlugin } from './UndoRedoPlugin.ts';
import { getModKey } from '../utils/platform.ts';

export class KeyboardShortcutsPlugin implements Plugin {
  readonly name = 'keyboard';
  private engine!: WatchfaceEngine;
  private boundHandler: ((e: KeyboardEvent) => void) | null = null;

  init(engine: WatchfaceEngine): void {
    this.engine = engine;
    const modKey = getModKey();

    this.boundHandler = (e: KeyboardEvent) => {
      const mod = e[modKey];

      // Ctrl/Cmd+Z = Undo
      if (mod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        engine.plugins.get<UndoRedoPlugin>('undoredo')?.undo();
        return;
      }

      // Ctrl/Cmd+Shift+Z = Redo
      if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        engine.plugins.get<UndoRedoPlugin>('undoredo')?.redo();
        return;
      }

      // Ctrl/Cmd+C = Copy
      if (mod && e.key === 'c') {
        e.preventDefault();
        engine.selection.copySelected();
        return;
      }

      // Ctrl/Cmd+V = Paste
      if (mod && e.key === 'v') {
        e.preventDefault();
        engine.selection.pasteClipboard();
        return;
      }

      // Ctrl/Cmd+A = Select All
      if (mod && e.key === 'a') {
        e.preventDefault();
        engine.selection.selectAll();
        return;
      }

      // Delete/Backspace = Remove selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't intercept if focus is in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        engine.selection.deleteSelected();
        return;
      }

      // Arrow keys = Nudge
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (engine.selection.getSelected().length === 0) return;
        e.preventDefault();

        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        engine.selection.nudgeSelected(dx, dy);
        return;
      }
    };

    window.addEventListener('keydown', this.boundHandler);
  }

  destroy(): void {
    if (this.boundHandler) {
      window.removeEventListener('keydown', this.boundHandler);
      this.boundHandler = null;
    }
  }
}
