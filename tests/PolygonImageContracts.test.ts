import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Sprite, Texture } from 'pixi.js';
import { WatchfaceEngine } from '../src/WatchfaceEngine.ts';
import { ShapeElement } from '../src/elements/ShapeElement.ts';
import { ImageElement } from '../src/elements/ImageElement.ts';
import { UndoRedoPlugin } from '../src/plugins/UndoRedoPlugin.ts';
import { SerializationManager } from '../src/managers/SerializationManager.ts';

class TestImage {
  static requests: TestImage[] = [];
  width = 20;
  height = 100;
  src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { TestImage.requests.push(this); }
}

const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const instances: ImageElement[] = [];
beforeEach(() => {
  TestImage.requests = [];
  Object.defineProperty(globalThis, 'Image', { value: TestImage, configurable: true, writable: true });
});
afterEach(() => {
  for (const image of instances.splice(0)) image.dispose();
  if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage);
  else Reflect.deleteProperty(globalThis, 'Image');
});

function image(src = '/first.png') {
  const el = new ImageElement(src, 30, -10);
  instances.push(el);
  return el;
}
function track(el: ImageElement) { instances.push(el); return el; }
function setup() {
  const engine = new WatchfaceEngine();
  const history = new UndoRedoPlugin();
  history.init(engine);
  const serialization = new SerializationManager(engine.eventBus, engine.elements, () => ({ width: 400, height: 400 }));
  return { engine, history, serialization };
}
const vertices = () => [-8, 6, 4, 6, 4, -24, -8, -24];

describe('polygon geometry and codecs', () => {
  test('preserves negative local coordinates/origin, copies input/getter/JSON, renders and masks exact bounds', () => {
    const input = vertices();
    const el = ShapeElement.polygon(-30, 20, input);
    input[0] = 999;
    const got = el.points;
    got[1] = 999;
    const json = el.toJSON();
    (json.shapeParams as { points: number[] }).points[0] = 999;
    expect(el.points).toEqual(vertices());
    expect([el.x, el.y, el.shapeType]).toEqual([-30, 20, 'polygon']);
    const bounds = { x: -8, y: -24, width: 12, height: 30 };
    expect(el.getLocalBounds()).toEqual(bounds);
    expect(el.getDisplayObject().getLocalBounds()).toMatchObject(bounds);
    el.fillPercentage = 50;
    el.fillDirection = 'bottom-to-top';
    const mask = el.getDisplayObject().children[2]!;
    expect(mask.getLocalBounds()).toMatchObject({ x: -8, y: -9, width: 12, height: 15 });
  });

  test('rejects invalid/degenerate vertices and invalid origins atomically', () => {
    const el = ShapeElement.polygon(0, 0, vertices());
    const before = el.toJSON();
    const invalid = [[], [0, 0, 1, 1], [0, 0, 1, 1, 2], [0, 0, NaN, 1, 1, 0],
      [0, 0, Infinity, 1, 1, 0], [0, 0, 1, 1, 2, 2], [0, 0, 0, 1, 0, 2],
      [-Number.MAX_VALUE, 0, Number.MAX_VALUE, 1, 0, 2], Array(6)];
    for (const points of invalid) {
      expect(() => ShapeElement.polygon(0, 0, points)).toThrow(TypeError);
      expect(() => { el.points = points; }).toThrow(TypeError);
      expect(() => el.applyJSON({ ...before, x: 100, shapeParams: { points } })).toThrow(TypeError);
      expect(el.toJSON()).toEqual(before);
    }
    expect(() => ShapeElement.polygon(NaN, 0, vertices())).toThrow(TypeError);
    expect(() => ShapeElement.polygon(0, Infinity, vertices())).toThrow(TypeError);
    for (const size of [0, -1, NaN, Infinity]) {
      expect(() => { el.width = size; }).toThrow(TypeError);
      expect(() => { el.height = size; }).toThrow(TypeError);
    }
    expect(el.toJSON()).toEqual(before);
  });

  test('scales vertices around local origin, replays exact points in standard history, protects event snapshots', () => {
    const { engine, history } = setup();
    const el = ShapeElement.polygon(-30, 20, vertices());
    engine.elements.add(el);
    engine.eventBus.on('element:changed', event => {
      if (event.property === 'points') expect(Reflect.set(event.newValue as number[], 0, 999)).toBe(false);
    });
    el.width = 24;
    el.height = 90;
    expect(el.points).toEqual([-16, 18, 8, 18, 8, -72, -16, -72]);
    expect([el.x, el.y]).toEqual([-30, 20]);
    history.undo();
    expect(el.points).toEqual([-16, 6, 8, 6, 8, -24, -16, -24]);
    history.undo();
    expect(el.points).toEqual(vertices());
    expect(history.canUndo).toBe(false);
    history.redo();
    history.redo();
    expect(el.getLocalBounds()).toEqual({ x: -16, y: -72, width: 24, height: 90 });
    const points = [0, 0, 20, 0, 0, 20];
    el.points = points;
    points[0] = 100;
    expect(el.points[0]).toBe(0);
    history.undo();
    expect(el.width).toBe(24);
  });

  test('round-trips document, applyJSON and clipboard with IDs/metadata and immutable point snapshots', () => {
    const { engine, history, serialization } = setup();
    const el = ShapeElement.polygon(-30, 20, vertices());
    el.metadata = { role: { tags: ['opaque'] } };
    el.rotation = 0.7;
    engine.elements.add(el);
    const before = serialization.serialize();
    serialization.deserialize(before);
    expect(serialization.serialize()).toBe(before);
    const restored = engine.elements.getById(el.id) as ShapeElement;
    restored.points = [0, 0, 1, 0, 0, 1];
    restored.applyJSON(el.toJSON());
    expect(restored.toJSON()).toEqual(el.toJSON());
    engine.selection.select(restored);
    engine.selection.copySelected();
    restored.points = [0, 0, 2, 0, 0, 2];
    history.clear();
    engine.selection.pasteClipboard();
    const pasted = engine.selection.getSelected()[0] as ShapeElement;
    expect(pasted.id).not.toBe(el.id);
    expect(pasted.points).toEqual(vertices());
    expect(pasted.metadata).toEqual(el.metadata);
    const id = pasted.id;
    const after = serialization.serialize();
    history.undo();
    history.redo();
    expect(engine.elements.getById(id)).toBeDefined();
    expect(serialization.serialize()).toBe(after);
  });

  test('document preflight rejects malformed polygon/pivot without removing live elements', () => {
    const { engine, serialization } = setup();
    const live = ShapeElement.rectangle(0, 0, 5, 10);
    engine.elements.add(live);
    engine.selection.select(live);
    const before = serialization.serialize();
    const polygon = ShapeElement.polygon(0, 0, vertices()).toJSON();
    const bad = [
      { ...polygon, shapeParams: {} },
      { ...polygon, shapeParams: { points: [0, 0, 1, 1, 2, 2] } },
      { ...polygon, type: 'image', src: '/x.png', pivot: { x: 0.5, y: 2 } },
    ];
    for (const data of bad) {
      expect(() => serialization.deserialize(JSON.stringify({ elements: [polygon, data] }))).toThrow();
      expect(serialization.serialize()).toBe(before);
      expect(engine.selection.getSelected()).toEqual([live]);
    }
    expect(TestImage.requests).toHaveLength(0);
  });
});

describe('image pivot, dimensions and readiness', () => {
  test('defaults to top-left, adopts unauthored natural dimensions, and reports real Pixi anchor bounds', async () => {
    const el = image();
    expect(el.pivot).toEqual({ x: 0, y: 0 });
    const ready = el.whenLoaded();
    expect(el.whenLoaded()).toBe(ready);
    TestImage.requests[0]!.onload!();
    await ready;
    expect([el.loaded, el.width, el.height]).toEqual([true, 20, 100]);
    expect(el.getLocalBounds()).toEqual({ x: -0, y: -0, width: 20, height: 100 });
    for (const pivot of [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 0.25, y: 0.8 }]) {
      el.pivot = pivot;
      const visual = el.getDisplayObject().getLocalBounds();
      const local = el.getLocalBounds();
      for (const key of ['x', 'y', 'width', 'height'] as const) expect(visual[key]).toBeCloseTo(local[key]);
      expect([el.x, el.y]).toEqual([30, -10]);
      expect(el.toJSON().pivot).toEqual(pivot);
    }
  });

  test('preserves predecode 40×150, one-axis authoring and explicit zero, even when equal to placeholder size', async () => {
    for (const sizes of [[40, 150], [0, 0], [1, 1]]) {
      const el = image();
      el.width = sizes[0]!;
      el.height = sizes[1]!;
      el.pivot = { x: 0.25, y: 0.8 };
      TestImage.requests.at(-1)!.onload!();
      await el.whenLoaded();
      expect([el.width, el.height]).toEqual(sizes);
      expect(el.getDisplayObject().getLocalBounds().width).toBeCloseTo(sizes[0]!);
      expect(el.getDisplayObject().getLocalBounds().height).toBeCloseTo(sizes[1]!);
    }
    const el = image();
    el.width = 40;
    TestImage.requests.at(-1)!.onload!();
    await el.whenLoaded();
    expect([el.width, el.height]).toEqual([40, 100]);
  });

  test('pivot copies, validation and JSON application are atomic and history replays normal setters', () => {
    const { engine, history } = setup();
    const el = image();
    engine.elements.add(el);
    engine.eventBus.on('element:changed', event => {
      if (event.property === 'pivot') expect(Reflect.set(event.newValue as object, 'x', 999)).toBe(false);
    });
    const input = { x: 0.25, y: 0.8 };
    el.pivot = input;
    input.x = 999;
    el.pivot.y = 999;
    (el.toJSON().pivot as { x: number }).x = 999;
    const before = el.toJSON();
    for (const pivot of [null, [], {}, { x: 0.5 }, { x: NaN, y: 0 }, { x: 0, y: Infinity },
      { x: -0.1, y: 0 }, { x: 0.5, y: 1.1 }, { x: '0', y: 0 }]) {
      expect(() => { el.pivot = pivot as never; }).toThrow(TypeError);
      expect(() => el.applyJSON({ ...before, src: '/changed.png', width: 500, pivot })).toThrow(TypeError);
      expect(() => ImageElement.fromJSON({ ...before, pivot })).toThrow(TypeError);
      expect(el.toJSON()).toEqual(before);
    }
    expect(TestImage.requests).toHaveLength(1);
    history.undo();
    expect(el.pivot).toEqual({ x: 0, y: 0 });
    expect(history.canUndo).toBe(false);
    history.redo();
    expect(el.pivot).toEqual({ x: 0.25, y: 0.8 });
  });

  test('decoded resources never create authoring actions or invalidate redo', async () => {
    const { engine, history } = setup();
    const el = image();
    el.width = 40;
    el.height = 150;
    engine.elements.add(el);
    el.x = 100;
    history.undo();
    let changes = 0, actions = 0, resources = 0;
    engine.eventBus.on('element:changed', () => changes++);
    engine.eventBus.on('action:performed', () => actions++);
    engine.eventBus.on('element:resourceChanged', () => resources++);
    TestImage.requests[0]!.onload!();
    await el.whenLoaded();
    expect([changes, actions, resources]).toEqual([0, 0, 1]);
    expect([history.canUndo, history.canRedo]).toEqual([false, true]);
    history.redo();
    expect(el.x).toBe(100);
  });

  test('round-trip/apply/source/clipboard retain canonical authored dimensions, pivot, ID and metadata', async () => {
    const { engine, history, serialization } = setup();
    const el = image();
    el.width = 40;
    el.height = 150;
    el.pivot = { x: 0.25, y: 0.8 };
    el.metadata = { opaque: ['image', 1] };
    el.rotation = 0.7;
    engine.elements.add(el);
    const json = el.toJSON();
    const restored = track(serialization.deserializeElement(json) as ImageElement);
    TestImage.requests.at(-1)!.onload!();
    await restored.whenLoaded();
    expect(restored.toJSON()).toEqual(json);
    restored.applyJSON({ ...json, src: '/next.png' });
    TestImage.requests.at(-1)!.onload!();
    await restored.whenLoaded();
    expect(restored.toJSON()).toEqual({ ...json, src: '/next.png' });
    engine.selection.select(el);
    engine.selection.copySelected();
    history.clear();
    engine.selection.pasteClipboard();
    const pasted = track(engine.selection.getSelected()[0] as ImageElement);
    TestImage.requests.at(-1)!.onload!();
    await pasted.whenLoaded();
    expect(pasted.id).not.toBe(el.id);
    expect([pasted.width, pasted.height, pasted.pivot, pasted.metadata]).toEqual([40, 150, el.pivot, el.metadata]);
    const after = serialization.serialize();
    history.undo();
    expect(history.canUndo).toBe(false);
    history.redo();
    const redone = engine.elements.getById(pasted.id) as ImageElement;
    if (redone !== pasted) track(redone);
    if (!redone.loaded) TestImage.requests.at(-1)!.onload!();
    await redone.whenLoaded();
    expect(serialization.serialize()).toBe(after);
    const legacy = { ...json };
    delete legacy.pivot;
    expect(track(ImageElement.fromJSON(legacy)).pivot).toEqual({ x: 0, y: 0 });
  });

  test('invalid metadata is preflighted before image requests or any existing state changes', () => {
    const beforeRequests = [...TestImage.requests];
    expect(() => ImageElement.fromJSON({
      type: 'image', src: '/fixture.png', metadata: [],
    } as never)).toThrow('metadata must be a JSON object');
    expect(TestImage.requests).toEqual(beforeRequests);

    const el = image('/stable.png');
    const before = el.toJSON();
    const readiness = el.whenLoaded();
    const requests = [...TestImage.requests];
    expect(() => el.applyJSON({ ...before, src: '/changed.png', width: 500, metadata: [] } as never))
      .toThrow('metadata must be a JSON object');
    expect(el.toJSON()).toEqual(before);
    expect(el.whenLoaded()).toBe(readiness);
    expect(el.loaded).toBe(false);
    expect(TestImage.requests).toEqual(requests);
  });

  test('fromJSON rejects invalid payloads before starting image requests', () => {
    const valid = { ...image().toJSON() };
    instances[0]!.dispose();
    for (const data of [
      { ...valid, src: 42 },
      { ...valid, src: undefined },
      { ...valid, width: NaN },
      { ...valid, width: Infinity },
      { ...valid, width: -1 },
      { ...valid, height: NaN },
      { ...valid, height: Infinity },
      { ...valid, height: -1 },
    ]) {
      const before = [...TestImage.requests];
      expect(() => ImageElement.fromJSON(data as never)).toThrow(TypeError);
      expect(TestImage.requests).toEqual(before);
    }
  });

  test('supersession rejects old generation, old callbacks are inert, failures reject current readiness and undo reloads', async () => {
    const { engine, history } = setup();
    const el = image();
    el.width = 40;
    engine.elements.add(el);
    const first = el.whenLoaded();
    const oldLoad = TestImage.requests[0]!.onload!;
    const oldError = TestImage.requests[0]!.onerror!;
    el.src = '/second.png';
    const second = el.whenLoaded();
    expect(second).not.toBe(first);
    await expect(first).rejects.toThrow('superseded');
    oldLoad();
    oldError();
    expect(el.loaded).toBe(false);
    TestImage.requests.at(-1)!.onerror!();
    await expect(second).rejects.toThrow('Failed to load image: /second.png');
    expect(el.loaded).toBe(false);
    history.undo();
    expect(el.src).toBe('/first.png');
    const third = el.whenLoaded();
    TestImage.requests.at(-1)!.onload!();
    await third;
    expect([el.loaded, el.width, el.height]).toEqual([true, 40, 100]);
    expect(history.canUndo).toBe(false);
  });

  test('replacement/detach cancels pending work and reattachment starts a fresh generation', async () => {
    const { engine, serialization } = setup();
    const el = image();
    engine.elements.add(el);
    const first = el.whenLoaded();
    const stale = TestImage.requests[0]!.onload!;
    serialization.deserialize(serialization.serialize());
    const restored = track(engine.elements.getById(el.id) as ImageElement);
    await expect(first).rejects.toThrow('detached');
    stale();
    expect(el.loaded).toBe(false);
    expect(restored.loaded).toBe(false);
    engine.elements.remove(restored);
    engine.elements.add(el);
    const next = el.whenLoaded();
    expect(next).not.toBe(first);
    TestImage.requests.at(-1)!.onload!();
    await next;
    expect(el.loaded).toBe(true);
  });

  test('dispose/display destruction rejects readiness, stale completion cannot revive it, no unobserved failures leak', async () => {
    const el = image();
    const first = el.whenLoaded();
    const stale = TestImage.requests[0]!.onload!;
    el.dispose();
    el.dispose();
    await expect(first).rejects.toThrow('disposed');
    await expect(el.whenLoaded()).rejects.toThrow('disposed');
    stale();
    expect(el.loaded).toBe(false);
    expect(() => { el.src = '/after.png'; }).toThrow('disposed');
    const other = image();
    const pending = other.whenLoaded();
    other.getDisplayObject().destroy({ children: true, texture: true, textureSource: true });
    await expect(pending).rejects.toThrow('disposed');
    // Intentionally unobserved errors/cancellations: Bun fails this test on unhandled rejection.
    image('/unobserved-error.png');
    TestImage.requests.at(-1)!.onerror!();
    const unobserved = image('/unobserved-cancel.png');
    unobserved.src = '/superseding.png';
    unobserved.dispose();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  test('releases only owned textures on replacement/disposal and tolerates duplicate completion', async () => {
    const el = image();
    const load = TestImage.requests[0]!.onload!;
    load();
    await el.whenLoaded();
    const first = (el.getDisplayObject().children[0] as Sprite).texture;
    load();
    expect((el.getDisplayObject().children[0] as Sprite).texture).toBe(first);
    el.src = '/next.png';
    expect(first.destroyed).toBe(false);
    TestImage.requests.at(-1)!.onload!();
    await el.whenLoaded();
    expect(first.destroyed).toBe(true);
    const second = (el.getDisplayObject().children[0] as Sprite).texture;
    el.dispose();
    expect(second.destroyed).toBe(true);
    expect(Texture.EMPTY.destroyed).toBe(false);
    await expect(el.whenLoaded()).rejects.toThrow('disposed');
  });
});
