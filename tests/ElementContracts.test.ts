import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { CanvasTextMetrics, Container, TextStyle } from 'pixi.js';
import { WatchfaceEngine } from '../src/WatchfaceEngine.ts';
import { ShapeElement } from '../src/elements/ShapeElement.ts';
import { TextElement } from '../src/elements/TextElement.ts';
import { ImageElement } from '../src/elements/ImageElement.ts';
import { UndoRedoPlugin } from '../src/plugins/UndoRedoPlugin.ts';
import { SerializationManager } from '../src/managers/SerializationManager.ts';
import type { ElementMetadata, SerializedElement } from '../src/types.ts';

class TestImage {
  static requests: TestImage[] = [];
  width = 64;
  height = 128;
  src = '';
  crossOrigin = '';
  onload: (() => void) | null = null;
  constructor() { TestImage.requests.push(this); }
}

const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
let measurement: ReturnType<typeof spyOn>;
beforeEach(() => {
  // Headless fixture: exercise real TextElement/layout and codecs, not browser font rasterization.
  measurement = spyOn(CanvasTextMetrics, 'measureText').mockReturnValue(new CanvasTextMetrics(
    'text', new TextStyle(), 60, 24, ['text'], [60], 24, 60, { ascent: 20, descent: 4, fontSize: 24 },
  ));
  Object.defineProperty(globalThis, 'Image', { value: TestImage, configurable: true, writable: true });
  TestImage.requests = [];
});
afterEach(() => {
  measurement.mockRestore();
  if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage);
  else Reflect.deleteProperty(globalThis, 'Image');
});

function setup() {
  const engine = new WatchfaceEngine();
  const history = new UndoRedoPlugin();
  history.init(engine);
  const serialization = new SerializationManager(engine.eventBus, engine.elements, () => ({ width: 448, height: 486 }));
  return { engine, history, serialization };
}

const metadata = (): ElementMetadata => ({ owner: { tags: ['original', { nested: 1 }] }, flag: true, nothing: null });

describe('presentation', () => {
  test('transient overrides keep canonical bytes and history pure; offsets compose with authoring changes', () => {
    const { engine, history, serialization } = setup();
    const el = ShapeElement.rectangle(0, 0, 20, 100);
    el.rotation = 0.3;
    engine.elements.add(el);
    el.x = 1;
    history.undo();
    let authoring = 0;
    let actions = 0;
    let presentations = 0;
    engine.eventBus.on('element:changed', () => authoring++);
    engine.eventBus.on('action:performed', () => actions++);
    engine.eventBus.on('element:presentationChanged', () => presentations++);
    const canonical = serialization.serialize();
    el.setPresentation({ rotationOffset: 0.7, visible: false });
    el.setPresentation({ rotationOffset: 1 });
    expect(el.rotation).toBe(0.3);
    expect(el.visible).toBe(true);
    expect(el.effectiveRotation).toBe(1.3);
    expect(el.effectiveVisible).toBe(false);
    expect(el.getDisplayObject().rotation).toBeCloseTo(1.3);
    expect(el.getDisplayObject().visible).toBe(false);
    expect(serialization.serialize()).toBe(canonical);
    expect([authoring, actions, presentations]).toEqual([0, 0, 2]);
    expect([history.canUndo, history.canRedo]).toEqual([false, true]);
    el.rotation = 0.8;
    expect(el.getDisplayObject().rotation).toBeCloseTo(1.8);
    history.undo();
    el.visible = false;
    el.setPresentation({ visible: true });
    expect(el.effectiveVisible).toBe(false);
    el.clearPresentation();
    expect(el.getDisplayObject().rotation).toBeCloseTo(0.3);
    expect(el.getDisplayObject().visible).toBe(false);
    el.clearPresentation();
    expect(presentations).toBe(4);
  });

  test('validates overrides atomically and copies input', () => {
    const { engine } = setup();
    const el = ShapeElement.circle(0, 0, 5);
    engine.elements.add(el);
    const input = { rotationOffset: 1, visible: false };
    el.setPresentation(input);
    input.rotationOffset = 99;
    expect(el.effectiveRotation).toBe(1);
    expect(() => el.setPresentation({ rotationOffset: NaN, visible: true })).toThrow(TypeError);
    expect(() => el.setPresentation({ visible: 'yes' } as unknown as Parameters<typeof el.setPresentation>[0])).toThrow(TypeError);
    expect(el.effectiveVisible).toBe(false);
  });
});

describe('metadata boundaries', () => {
  test('assignment/getter/toJSON/event/history never alias nested application data', () => {
    const { engine, history } = setup();
    const el = ShapeElement.circle(0, 0, 5);
    engine.elements.add(el);
    const original = metadata();
    const expected = metadata();
    el.metadata = original;
    (original.owner as { tags: unknown[] }).tags.push('input mutation');
    const getter = el.metadata!;
    (getter.owner as { tags: unknown[] }).tags.push('getter mutation');
    const json = el.toJSON();
    (json.metadata!.owner as { tags: unknown[] }).tags.push('serialized mutation');
    engine.eventBus.on('element:changed', ({ property, oldValue, newValue }) => {
      if (property !== 'metadata') return;
      if (oldValue) (oldValue as ElementMetadata).mutated = true;
      if (newValue) (newValue as ElementMetadata).mutated = true;
    });
    el.metadata = { updated: [1, 2] };
    expect(el.metadata).toEqual({ updated: [1, 2] });
    history.undo();
    expect(el.metadata).toEqual(expected);
    history.redo();
    expect(el.metadata).toEqual({ updated: [1, 2] });
    el.metadata = undefined;
    expect(Object.hasOwn(el.toJSON(), 'metadata')).toBe(false);
    history.undo();
    expect(el.metadata).toEqual({ updated: [1, 2] });
  });

  test('rejects non-JSON and non-object metadata atomically, including nested cycles/accessors', () => {
    const el = ShapeElement.circle(0, 0, 5);
    el.metadata = { valid: 1 };
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const invalid: unknown[] = [null, [], 'text', 1, { value: undefined }, { value: NaN }, { value: Infinity },
      { value: 1n }, { value: () => {} }, { value: Symbol('x') }, { value: new Date() }, { value: new Map() }, cycle,
      { value: new Array(2) }, { get value() { throw new Error('accessor executed'); } }, { [Symbol('x')]: 1 }];
    for (const value of invalid) {
      expect(() => { el.metadata = value as ElementMetadata; }).toThrow(TypeError);
      expect(el.metadata).toEqual({ valid: 1 });
    }
    const shared = { a: 1 };
    el.metadata = { left: shared, right: shared };
    expect(el.metadata).toEqual({ left: { a: 1 }, right: { a: 1 } });
    el.metadata = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(Object.getPrototypeOf(el.metadata!)).toBe(Object.prototype);
    expect(Object.hasOwn(el.metadata!, '__proto__')).toBe(true);
  });

  test('clipboard snapshots, restored IDs and metadata are isolated with fresh paste identities', () => {
    const { engine } = setup();
    const el = ShapeElement.rectangle(1, 2, 40, 50);
    el.metadata = metadata();
    engine.elements.add(el);
    engine.selection.select(el);
    engine.selection.copySelected();
    el.metadata = { changed: true };
    engine.selection.pasteClipboard();
    const pasted = engine.selection.getSelected()[0]!;
    expect(pasted.id).not.toBe(el.id);
    expect(pasted.metadata).toEqual(metadata());
    pasted.metadata = { pasted: true };
    expect(el.metadata).toEqual({ changed: true });
    engine.selection.pasteClipboard();
    const second = engine.selection.getSelected()[0]!;
    expect(second.id).not.toBe(pasted.id);
    expect(second.metadata).toEqual(metadata());
    expect([second.x, second.y]).toEqual([21, 22]);
  });
});

describe('built-in codecs and preflight', () => {
  function fixtures() {
    const rectangle = ShapeElement.rectangle(1, 2, 30, 40);
    const line = ShapeElement.line(2, 3, 70, 30, { strokeWidth: 3, lineCap: 'round' });
    const circle = ShapeElement.circle(5, 6, 12);
    const arc = ShapeElement.arc(7, 8, 20, 0.2, 2.4, { strokeWidth: 5 });
    const autoText = new TextElement('auto', 8, 9);
    const fixedText = new TextElement('wrapped', 10, 20, { boxWidth: 90 });
    fixedText.height = 50;
    const arcText = new TextElement('curved', 12, 13);
    arcText.arcPath = { radius: 45, startAngle: 0, endAngle: Math.PI, side: 'outside' };
    const image = new ImageElement('/fixture.png', 30, 40);
    image.width = 70;
    image.height = 110;
    return [rectangle, line, circle, arc, autoText, fixedText, arcText, image];
  }

  test('round-trips identity, metadata, dimensions, scales and defaults for every built-in', () => {
    const { serialization } = setup();
    for (const el of fixtures()) {
      el.metadata = metadata();
      el.rotation = 0.3;
      el.zIndex = 4;
      el.visible = false;
      el.getDisplayObject().scale.set(1.2, 0.7);
      const data = el.toJSON();
      const restored = serialization.deserializeElement(data)!;
      expect(restored.toJSON()).toEqual(data);
      data.metadata!.mutated = true;
      expect(restored.metadata).toEqual(metadata());
      restored.applyJSON({ ...restored.toJSON(), id: 'must-not-change', x: 77 });
      expect(restored.id).toBe(el.id);
      expect(restored.x).toBe(77);
    }
    const legacy = serialization.deserializeElement({ type: 'shape', shapeType: 'circle', shapeParams: { radius: 4 } } as SerializedElement)!;
    expect(legacy.id.length).toBeGreaterThan(0);
    expect([legacy.x, legacy.y, legacy.rotation, legacy.visible, legacy.opacity]).toEqual([0, 0, 0, true, 1]);
  });

  test('serialization sorts stably by z-index and document restoration keeps built-in IDs and order', async () => {
    const { engine, serialization, history } = setup();
    const items = fixtures();
    items.forEach((el, index) => { el.zIndex = index % 2 ? 1 : 0; el.metadata = { index }; engine.elements.add(el); });
    const sorted = items.filter((_, i) => i % 2 === 0).concat(items.filter((_, i) => i % 2 === 1));
    const json = serialization.serialize();
    history.clear();
    await serialization.deserialize(json);
    expect(engine.elements.getAll().map(el => el.id)).toEqual(sorted.map(el => el.id));
    expect(serialization.serialize()).toBe(json);
    expect(history.canUndo).toBe(false);
  });

  test('restoration retires selected instances through removal lifecycle before adding replacements', () => {
    const { engine, serialization } = setup();
    const elementsLayer = new Container();
    engine.elements._setLayer(elementsLayer);
    engine.selection.init(new Container(), engine.app);

    const original = ShapeElement.rectangle(0, 0, 10, 20);
    engine.elements.add(original);
    engine.selection.select(original);
    const document = serialization.serialize();
    expect(original.getDisplayObject().parent).toBe(elementsLayer);

    serialization.deserialize(document);

    const restored = engine.elements.getById(original.id)!;
    expect(restored).not.toBe(original);
    expect(engine.selection.getSelected()).toEqual([]);
    expect(original.getDisplayObject().parent).toBeNull();
    expect(elementsLayer.children).toEqual([restored.getDisplayObject()]);

    engine.selection.select(restored);
    engine.selection.deleteSelected();
    expect(engine.elements.count).toBe(0);
    expect(elementsLayer.children).toHaveLength(0);
    expect(engine.selection.getSelected()).toEqual([]);
  });

  test('image completion is a resource notification, preserves authored dimensions, and never records loaded history', () => {
    const { engine, history, serialization } = setup();
    const image = new ImageElement('/first.png', 0, 0);
    image.width = 100;
    image.height = 50;
    engine.elements.add(image);
    let resources = 0;
    engine.eventBus.on('element:resourceChanged', () => resources++);
    TestImage.requests[0]!.onload!();
    expect([image.loaded, image.width, image.height]).toEqual([true, 100, 50]);
    expect(resources).toBe(1);
    expect(history.canUndo).toBe(false);
    const restored = serialization.deserializeElement(image.toJSON()) as ImageElement;
    expect([restored.width, restored.height]).toEqual([100, 50]);
    TestImage.requests.at(-1)!.onload!();
    expect([restored.width, restored.height]).toEqual([100, 50]);
    image.src = '/second.png';
    const stale = TestImage.requests.at(-1)!;
    image.src = '/third.png';
    stale.onload!();
    expect(image.loaded).toBe(false);
    TestImage.requests.at(-1)!.onload!();
    expect(image.loaded).toBe(true);
    history.undo();
    expect(image.src).toBe('/second.png');
  });

  test('image zero dimensions survive JSON restore and texture completion', () => {
    const { serialization } = setup();
    const image = new ImageElement('/zero.png', 0, 0);
    image.width = 0;
    image.height = 0;
    const restored = serialization.deserializeElement(image.toJSON()) as ImageElement;
    TestImage.requests.at(-1)!.onload!();
    expect([restored.width, restored.height]).toEqual([0, 0]);
  });

  test('duplicate IDs and malformed built-ins reject before clearing the document or selection', async () => {
    const { engine, serialization } = setup();
    const existing = ShapeElement.rectangle(0, 0, 10, 20);
    engine.elements.add(existing);
    engine.selection.select(existing);
    const before = serialization.serialize();
    const data = existing.toJSON();
    const badElements: unknown[] = [null, { ...data, id: 42 }, { ...data, x: 'bad' },
      { ...data, width: -1 }, { ...data, visible: 'yes' }, { ...data, metadata: [] },
      { ...data, shapeType: 'bad' }, { ...data, shapeParams: { w: 2 } },
      { ...data, type: 'text', text: 7 }, { ...data, type: 'text', text: 'ok', arcPath: {} },
      { ...data, type: 'image', src: 7 }];
    const invalid = [JSON.stringify({ version: 1, elements: [data, data] }), 'not json', '{}',
      JSON.stringify({ version: 99, elements: [] }), JSON.stringify({ elements: [], width: 'bad' }),
      ...badElements.map(bad => JSON.stringify({ version: 1, elements: [bad] }))];
    for (const json of invalid) {
      expect(() => serialization.deserialize(json)).toThrow();
      expect(serialization.serialize()).toBe(before);
      expect(engine.elements.getById(existing.id)).toBe(existing);
      expect(engine.selection.getSelected()).toEqual([existing]);
    }
    await serialization.deserialize(JSON.stringify({ elements: [data] }));
    expect(engine.elements.getById(existing.id)!.toJSON()).toEqual(data);
  });

  test('constructor failure leaves current document in place; unknown types retain skip compatibility', async () => {
    const { engine, serialization } = setup();
    const el = ShapeElement.circle(0, 0, 4);
    engine.elements.add(el);
    serialization.getRegistry().register('shape', class {
      static fromJSON(): ShapeElement { throw new Error('custom constructor failed'); }
    });
    expect(() => serialization.deserialize(JSON.stringify({ elements: [el.toJSON()] }))).toThrow('custom constructor failed');
    expect(engine.elements.getById(el.id)).toBe(el);
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(serialization.deserializeElement({ ...el.toJSON(), type: 'future-type' } as unknown as SerializedElement)).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });
});
