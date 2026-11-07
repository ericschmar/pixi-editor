import { describe, expect, test } from 'bun:test';
import { WatchfaceEngine } from '../src/WatchfaceEngine.ts';
import { ShapeElement } from '../src/elements/ShapeElement.ts';
import { UndoRedoPlugin } from '../src/plugins/UndoRedoPlugin.ts';
import type { UndoableAction } from '../src/types.ts';

function setup(maxHistory = 100) {
  const engine = new WatchfaceEngine();
  const history = new UndoRedoPlugin({ maxHistory });
  history.init(engine);
  const element = ShapeElement.rectangle(0, 0, 40, 120);
  engine.elements.add(element);
  const record = (action: UndoableAction) => engine.eventBus.emit('action:performed', { action });
  return { engine, history, element, record };
}

const noop: UndoableAction = { type: 'test', description: 'explicit', undo() {}, redo() {} };

describe('history scopes', () => {
  test('suspend returns a value, nests, suppresses explicit and automatic history, preserves redo and canonical events', () => {
    const { engine, history, element, record } = setup();
    element.x = 1;
    history.undo();
    let changes = 0;
    engine.eventBus.on('element:changed', () => changes++);
    expect(history.suspend(() => {
      element.rotation = 0.7;
      history.suspend(() => { element.visible = false; record(noop); });
      record(noop);
      return 42;
    })).toBe(42);
    expect(changes).toBe(2);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    history.redo();
    expect(element.x).toBe(1);
    element.y = 2;
    history.undo();
    expect(element.y).toBe(0);
  });

  test('suspend restores the previous suppression state after nested exceptions', () => {
    const { engine, history, element } = setup();
    expect(() => history.suspend(() => history.suspend(() => { throw new Error('scope'); }))).toThrow('scope');
    expect(engine._suppressActions).toBe(false);
    engine._suppressActions = true;
    expect(() => history.suspend(() => { throw new Error('previous'); })).toThrow('previous');
    expect(engine._suppressActions).toBe(true);
    engine._suppressActions = false;
    element.x = 4;
    expect(history.canUndo).toBe(true);
  });

  test('batch joins nested actions, returns result, undoes in reverse order and redoes forward', () => {
    const { history, record } = setup();
    const order: string[] = [];
    const action = (label: string): UndoableAction => ({
      type: label, description: label,
      undo() { order.push(`undo ${label}`); }, redo() { order.push(`redo ${label}`); },
    });
    expect(history.batch('outer', () => {
      record(action('a'));
      history.batch('inner', () => record(action('b')));
      record(action('c'));
      return 'result';
    })).toBe('result');
    history.undo();
    expect(order).toEqual(['undo c', 'undo b', 'undo a']);
    expect(history.canUndo).toBe(false);
    history.redo();
    expect(order.slice(3)).toEqual(['redo a', 'redo b', 'redo c']);
  });

  test('empty and suspended batches do not replace redo; suspension inside a batch is not recorded', () => {
    const { history, element, record } = setup();
    element.x = 5;
    history.undo();
    history.batch('empty', () => {});
    history.suspend(() => history.batch('suppressed', () => { element.y = 8; record(noop); }));
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    history.batch('edit', () => {
      element.x = 6;
      history.suspend(() => { element.y = 9; record(noop); });
      element.rotation = 1;
    });
    history.undo();
    expect(element.x).toBe(0);
    expect(element.rotation).toBe(0);
    expect(element.y).toBe(9);
    expect(history.canUndo).toBe(false);
  });

  test('callback failure rolls back recorded automatic and explicit actions and preserves redo', () => {
    const { history, element, record } = setup();
    let sidecar = 0;
    element.x = 12;
    history.undo();
    expect(() => history.batch('failed', () => {
      element.y = 9;
      sidecar = 1;
      record({ ...noop, undo() { sidecar = 0; }, redo() { sidecar = 1; } });
      history.batch('nested failure', () => { element.rotation = 3; throw new Error('callback'); });
    })).toThrow('callback');
    expect(element.y).toBe(0);
    expect(element.rotation).toBe(0);
    expect(sidecar).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    history.redo();
    expect(element.x).toBe(12);
  });

  test('caught nested failure has no independent savepoint', () => {
    const { history, element } = setup();
    history.batch('outer', () => {
      try { history.batch('inner', () => { element.x = 1; throw new Error('caught'); }); } catch {}
      element.y = 2;
    });
    history.undo();
    expect([element.x, element.y]).toEqual([0, 0]);
    expect(history.canUndo).toBe(false);
  });

  test('rollback failure reports both errors and restores recording without changing stacks', () => {
    const { engine, history, element, record } = setup();
    element.x = 2;
    history.undo();
    let failure: unknown;
    try {
      history.batch('bad', () => {
        record({ ...noop, undo() { throw new Error('rollback'); } });
        throw new Error('callback');
      });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map(error => error.message)).toEqual(['callback', 'rollback']);
    expect(engine._suppressActions).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.canUndo).toBe(false);
    element.y = 4;
    expect(history.canUndo).toBe(true);
  });

  test('failed undo and redo keep actions on their original stacks and restore suppression', () => {
    const { engine, history, element, record } = setup();
    let failUndo = true;
    let failRedo = true;
    record({ ...noop,
      undo() { if (failUndo) throw new Error('undo'); },
      redo() { if (failRedo) throw new Error('redo'); },
    });
    expect(() => history.undo()).toThrow('undo');
    expect([history.canUndo, history.canRedo, engine._suppressActions]).toEqual([true, false, false]);
    failUndo = false;
    history.undo();
    expect(() => history.redo()).toThrow('redo');
    expect([history.canUndo, history.canRedo, engine._suppressActions]).toEqual([false, true, false]);
    failRedo = false;
    history.redo();
    element.x = 4;
    history.undo();
    expect(element.x).toBe(0);
  });

  test('automatic property action failure restores suppression and retains the action for retry', () => {
    const { engine, history, element } = setup();
    element.x = 1;
    const off = engine.eventBus.on('element:changed', () => { throw new Error('listener failure'); });
    expect(() => history.undo()).toThrow('listener failure');
    expect([engine._suppressActions, history.canUndo, history.canRedo]).toEqual([false, true, false]);
    // The setter already mutated before the listener threw: no promise of external atomicity.
    expect(element.x).toBe(0);
    off();
    history.undo();
    history.redo();
    expect(element.x).toBe(1);
  });

  test('replayed explicit actions cannot record history and stack mutation is rejected inside a batch', () => {
    const { history, record } = setup();
    record({ ...noop, undo() { record(noop); }, redo() { record(noop); } });
    history.undo();
    expect(history.canUndo).toBe(false);
    history.redo();
    history.undo();
    expect(history.canUndo).toBe(false);
    for (const operation of [() => history.undo(), () => history.redo(), () => history.clear()]) {
      expect(() => history.batch('invalid', operation)).toThrow('Cannot change history');
    }
  });

  test('maxHistory counts a batch as one entry, trims oldest and supports zero', () => {
    const { history, element } = setup(2);
    element.x = 1;
    history.batch('two edits', () => { element.x = 2; element.y = 2; });
    element.x = 3;
    history.undo();
    history.undo();
    expect([element.x, element.y, history.canUndo]).toEqual([1, 0, false]);
    const zero = setup(0);
    zero.element.x = 1;
    expect(zero.history.canUndo).toBe(false);
    expect(() => new UndoRedoPlugin({ maxHistory: -1 })).toThrow(RangeError);
  });

  test('76-element explicit command with sidecar stays separate from a later edit; add/remove never auto-record', () => {
    const { engine, history, record } = setup();
    engine.elements.clear();
    const elements = Array.from({ length: 76 }, (_, index) => {
      const el = ShapeElement.rectangle(index, 0, 10, 20);
      el.metadata = { app: { index } };
      return el;
    });
    let sidecar: number[] = [];
    const insert = () => { elements.forEach(el => engine.elements.add(el)); sidecar = elements.map((_, i) => i); };
    const remove = () => { elements.forEach(el => engine.elements.remove(el)); sidecar = []; };
    insert();
    expect(history.canUndo).toBe(false);
    const snapshot = JSON.stringify(engine.elements.getAll().map(el => el.toJSON()));
    record({ type: 'insert', description: 'Insert objects', undo: remove, redo: insert });
    elements[0]!.rotation = 0.7;
    history.undo();
    expect(elements[0]!.rotation).toBe(0);
    expect(engine.elements.count).toBe(76);
    history.undo();
    expect(engine.elements.count).toBe(0);
    expect(sidecar).toEqual([]);
    history.redo();
    expect(JSON.stringify(engine.elements.getAll().map(el => el.toJSON()))).toBe(snapshot);
    expect(sidecar).toEqual(elements.map((_, i) => i));
    history.redo();
    expect(elements[0]!.rotation).toBe(0.7);
  });
});
