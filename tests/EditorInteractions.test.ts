import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { CanvasTextMetrics, Container, TextStyle, type Application, type FederatedPointerEvent } from 'pixi.js';
import { WatchfaceEngine } from '../src/WatchfaceEngine.ts';
import { ShapeElement } from '../src/elements/ShapeElement.ts';
import { ImageElement } from '../src/elements/ImageElement.ts';
import { TextElement } from '../src/elements/TextElement.ts';
import type { BaseElement } from '../src/elements/BaseElement.ts';
import { UndoRedoPlugin } from '../src/plugins/UndoRedoPlugin.ts';
import { KeyboardShortcutsPlugin } from '../src/plugins/KeyboardShortcutsPlugin.ts';
import { TransformController } from '../src/selection/TransformController.ts';
import { selectionGeometry } from '../src/selection/ElementInteraction.ts';
import { getElementWorldCorners, getElementsWorldBounds, worldDeltaToLocal } from '../src/geometry/ElementGeometry.ts';

class TestImage {
  static requests: TestImage[] = [];
  width = 80;
  height = 120;
  src = '';
  onload: (() => void) | null = null;
  constructor() { TestImage.requests.push(this); }
}

// Models the structural offset contract of the parallel image-pivot work;
// production interactions must not inspect a class-specific pivot property.
class OffsetImage extends ImageElement {
  getLocalBounds() {
    return { x: -this.width * 0.25, y: -this.height * 0.8, width: this.width, height: this.height };
  }
}

const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let measurement: ReturnType<typeof spyOn>;
let fixtures: ReturnType<typeof setup>[];
beforeEach(() => {
  measurement = spyOn(CanvasTextMetrics, 'measureText').mockReturnValue(new CanvasTextMetrics(
    'text', new TextStyle(), 60, 24, ['text'], [60], 24, 60, { ascent: 20, descent: 4, fontSize: 24 },
  ));
  Object.defineProperty(globalThis, 'Image', { value: TestImage, configurable: true, writable: true });
  fixtures = [];
  TestImage.requests = [];
});
afterEach(() => {
  for (const { engine, history } of fixtures) { engine.selection.destroy(); history?.destroy(); }
  measurement.mockRestore();
  if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage);
  else Reflect.deleteProperty(globalThis, 'Image');
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function pointer(x: number, y: number, shiftKey = false): FederatedPointerEvent {
  return { globalX: x, globalY: y, button: 0, shiftKey, stopPropagation() {} } as FederatedPointerEvent;
}
function setup(withHistory = true) {
  const engine = new WatchfaceEngine();
  const history = withHistory ? new UndoRedoPlugin() : null;
  history?.init(engine);
  const controller = new TransformController(engine.eventBus);
  const result = { engine, history, controller };
  fixtures?.push(result);
  return result;
}
function canonical(elements: BaseElement[]): string { return JSON.stringify(elements.map(el => el.toJSON())); }
function closePoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}
function addDelta(start: { x: number; y: number }, dx: number, dy: number, angle: number) {
  const world = worldDeltaToLocal({ x: dx, y: dy }, -angle);
  return pointer(start.x + world.x, start.y + world.y);
}
function stageFixture(engine: WatchfaceEngine) {
  const stage = new Container();
  const layer = new Container();
  const ticks = new Set<() => void>();
  const ticker = { add: (fn: () => void) => ticks.add(fn), remove: (fn: () => void) => ticks.delete(fn) };
  engine.selection.init(layer, { stage, ticker } as unknown as Application);
  return { stage, layer, box: layer.children[0] as Container, ticks, tick: () => ticks.forEach(fn => fn()) };
}

// These tests use public controllers/delegates and real Pixi containers, without
// a renderer. The parent acceptance suite owns real Chromium pointer coverage.
describe('generic pointer transforms', () => {
  for (const angle of [0, Math.PI / 2, Math.PI / 5]) {
    test(`rectangle resize uses effective local axes and one reversible action at ${angle}`, () => {
      const { engine, history, controller } = setup();
      const el = ShapeElement.rectangle(23, -17, 40, 120);
      el.rotation = angle - 0.2;
      el.setPresentation({ rotationOffset: 0.2 });
      el.metadata = { app: { role: 'generic' } };
      engine.elements.add(el);
      const before = canonical([el]);
      const [anchor, , start] = getElementWorldCorners(selectionGeometry(el));
      let actions = 0;
      let changes = 0;
      engine.eventBus.on('action:performed', () => actions++);
      const external = () => changes++;
      el.getDisplayObject().on('pointermove', external);
      engine.eventBus.on('element:changed', external);
      controller.startResize([el], 'bottom-right', pointer(start.x, start.y));
      controller.onPointerMove(addDelta(start, 10, 0, angle));
      controller.onPointerMove(addDelta(start, 20, 0, angle));
      expect(actions).toBe(0);
      expect(engine._suppressActions).toBe(false);
      expect(el.width).toBeCloseTo(60);
      expect(el.height).toBeCloseTo(120);
      closePoint(getElementWorldCorners(selectionGeometry(el))[0], anchor);
      controller.onPointerUp(addDelta(start, 20, 0, angle));
      expect(actions).toBe(1);
      expect(changes).toBeGreaterThan(0);
      const after = canonical([el]);
      history!.undo();
      expect(canonical([el])).toBe(before);
      expect(history!.canUndo).toBe(false);
      history!.redo();
      expect(canonical([el])).toBe(after);
      expect(engine.elements.getById(el.id)).toBe(el);
      expect(el.getDisplayObject().listeners('pointermove')).toContain(external);
      expect(el.effectiveRotation).toBeCloseTo(angle);
      expect(actions).toBe(1);
    });
  }

  test('offset image bounds and signed canonical scale preserve the opposite world anchor', () => {
    for (const scaleX of [2, -2]) {
      const { engine, history, controller } = setup();
      const el = new OffsetImage('/fixture.png', 30, 40);
      el.width = 80;
      el.height = 120;
      el.rotation = Math.PI / 5;
      el.getDisplayObject().scale.set(scaleX, 0.5);
      engine.elements.add(el);
      const before = canonical([el]);
      const [anchor, , start] = getElementWorldCorners(selectionGeometry(el));
      controller.startResize([el], 'bottom-right', pointer(start.x, start.y));
      controller.onPointerMove(addDelta(start, 40, 0, el.effectiveRotation));
      expect(el.width).toBeCloseTo(100);
      expect(el.height).toBeCloseTo(120);
      closePoint(getElementWorldCorners(selectionGeometry(el))[0], anchor);
      expect(el.x).not.toBe(30); // Pivoted origins must move during resize.
      controller.onPointerUp(pointer(0, 0));
      const after = canonical([el]);
      history!.undo();
      expect(canonical([el])).toBe(before);
      history!.redo();
      expect(canonical([el])).toBe(after);
    }
  });

  test('pointer conversion accounts for content-root translation and viewport scale', () => {
    const { engine, controller } = setup();
    const root = new Container();
    root.position.set(120, 80);
    root.scale.set(2);
    controller.setContentRoot(root);
    const el = ShapeElement.rectangle(11, 13, 40, 120);
    el.rotation = Math.PI / 5;
    engine.elements.add(el);
    const [anchor, , start] = getElementWorldCorners(selectionGeometry(el));
    const screenStart = root.toGlobal(start);
    const localMove = addDelta(start, 20, 0, el.rotation);
    const screenMove = root.toGlobal({ x: localMove.globalX, y: localMove.globalY });
    controller.startResize([el], 'bottom-right', pointer(screenStart.x, screenStart.y));
    controller.onPointerMove(pointer(screenMove.x, screenMove.y));
    expect(el.width).toBeCloseTo(60);
    expect(el.height).toBeCloseTo(120);
    closePoint(getElementWorldCorners(selectionGeometry(el))[0], anchor);
    controller.cancel();
  });

  test('corner and edge resize keep their opposite anchors with rotation, offset bounds and aspect constraint', () => {
    const { engine, controller } = setup();
    const el = ShapeElement.circle(11, 13, 20);
    el.rotation = Math.PI / 5;
    engine.elements.add(el);
    for (const [handle, anchor] of [
      ['top-left', { x: 20, y: 20 }], ['middle-left', { x: 20, y: 0 }],
      ['top-center', { x: 0, y: 20 }],
    ] as const) {
      const before = canonical([el]);
      const origin = { x: el.x, y: el.y };
      const world = worldDeltaToLocal(anchor, -el.rotation);
      controller.startResize([el], handle, pointer(0, 0));
      const event = addDelta({ x: 0, y: 0 }, -20, -20, el.rotation);
      event.shiftKey = true;
      controller.onPointerMove(event);
      expect(el.width).toBeCloseTo(60);
      expect(el.height).toBeCloseTo(60);
      const resized = worldDeltaToLocal({ x: anchor.x * 1.5, y: anchor.y * 1.5 }, -el.rotation);
      closePoint({ x: el.x + resized.x, y: el.y + resized.y }, { x: origin.x + world.x, y: origin.y + world.y });
      controller.cancel();
      expect(canonical([el])).toBe(before);
    }
  });

  test('a throwing canonical observer releases synchronous suppression and cancels the gesture', () => {
    const { engine, history, controller } = setup();
    const el = ShapeElement.rectangle(1, 2, 40, 120);
    engine.elements.add(el);
    const before = canonical([el]);
    const off = engine.eventBus.on('element:changed', () => { off(); throw new Error('observer failure'); });
    controller.startResize([el], 'bottom-right', pointer(0, 0));
    expect(() => controller.onPointerMove(pointer(20, 0))).toThrow('observer failure');
    expect(canonical([el])).toBe(before);
    expect(controller.isDragging).toBe(false);
    expect(engine._suppressActions).toBe(false);
    expect(history!.canUndo).toBe(false);
    el.x = 9;
    expect(history!.canUndo).toBe(true);
  });

  test('text keeps its noncentral local origin; cancellation restores automatic sizing', () => {
    const { engine, history, controller } = setup();
    const el = new TextElement('text', 31, 47);
    el.rotation = Math.PI / 5;
    engine.elements.add(el);
    const before = canonical([el]);
    const [anchor, , start] = getElementWorldCorners(selectionGeometry(el));
    controller.startResize([el], 'bottom-right', pointer(start.x, start.y));
    controller.onPointerMove(addDelta(start, 20, 10, el.rotation));
    closePoint(getElementWorldCorners(selectionGeometry(el))[0], anchor);
    expect(el.width).toBeCloseTo(80);
    expect(el.height).toBeCloseTo(34);
    controller.cancel();
    expect(canonical([el])).toBe(before);
    expect(history!.canUndo).toBe(false);
    expect(engine._suppressActions).toBe(false);
  });

  test('rotation is around the authored origin, not the bounds center; groups retain shared-center behavior', () => {
    const { engine, history, controller } = setup();
    const el = ShapeElement.rectangle(20, 30, 40, 120);
    engine.elements.add(el);
    const before = canonical([el]);
    controller.startRotate([el], pointer(40, 0));
    controller.onPointerMove(pointer(50, 10));
    const expected = Math.atan2(-20, 30) - Math.atan2(-30, 20);
    expect(el.rotation).toBeCloseTo(expected);
    expect([el.x, el.y]).toEqual([20, 30]);
    controller.onPointerUp(pointer(50, 10));
    history!.undo();
    expect(canonical([el])).toBe(before);
    history!.redo();
    expect(el.rotation).toBeCloseTo(expected);

    const other = ShapeElement.rectangle(100, 30, 40, 120);
    engine.elements.add(other);
    const centerBounds = getElementsWorldBounds([el, other].map(selectionGeometry))!;
    const center = { x: centerBounds.x + centerBounds.width / 2, y: centerBounds.y + centerBounds.height / 2 };
    const origin = { x: el.x, y: el.y };
    controller.startRotate([el, other], pointer(center.x + 100, center.y));
    controller.onPointerMove(pointer(center.x, center.y + 100));
    closePoint(el, { x: center.x - (origin.y - center.y), y: center.y + (origin.x - center.x) });
    controller.cancel();
    closePoint(el, origin);
  });

  test('move across many pointer events is atomic, including without UndoRedoPlugin', () => {
    for (const withHistory of [true, false]) {
      const { engine, history, controller } = setup(withHistory);
      const elements = [ShapeElement.rectangle(1, 2, 40, 120), ShapeElement.circle(90, 80, 10)];
      elements.forEach(el => engine.elements.add(el));
      const before = canonical(elements);
      let actions = 0;
      let changes = 0;
      engine.eventBus.on('action:performed', () => actions++);
      engine.eventBus.on('element:changed', () => changes++);
      controller.startMove(elements, pointer(0, 0));
      for (let i = 1; i <= 20; i++) {
        controller.onPointerMove(pointer(i, i * 2));
        expect(engine._suppressActions).toBe(false);
        expect(actions).toBe(0);
      }
      controller.onPointerUp(pointer(20, 40));
      expect(actions).toBe(1);
      expect(changes).toBe(80);
      expect([elements[0]!.x, elements[1]!.y]).toEqual([21, 120]);
      if (history) {
        const after = canonical(elements);
        history.undo();
        expect(canonical(elements)).toBe(before);
        expect(history.canUndo).toBe(false);
        history.redo();
        expect(canonical(elements)).toBe(after);
      }
    }
  });

  test('clicks, returned-to-start transforms and cancellation have zero actions and exact shape params', () => {
    const { engine, history, controller } = setup();
    const elements = [
      ShapeElement.rectangle(3, 4, 40, 120), ShapeElement.circle(30, 40, 20),
      ShapeElement.line(10, 20, 80, 55),
      ShapeElement.arc(10, 20, 25, 0.2, 2.4),
    ];
    elements[2]!.strokeWidth = 3;
    elements[3]!.strokeWidth = 5;
    let actions = 0;
    engine.eventBus.on('action:performed', () => actions++);
    for (const el of elements) {
      engine.elements.add(el);
      const before = canonical([el]);
      for (const mode of ['move', 'resize', 'rotate'] as const) {
        const start = () => mode === 'move' ? controller.startMove([el], pointer(50, 60))
          : mode === 'resize' ? controller.startResize([el], 'bottom-right', pointer(50, 60))
          : controller.startRotate([el], pointer(50, 60));
        start();
        controller.onPointerMove(pointer(50, 60));
        controller.onPointerUp(pointer(50, 60));
        expect(canonical([el])).toBe(before);
        start();
        controller.onPointerMove(pointer(70, 80));
        controller.onPointerMove(pointer(50, 60));
        controller.onPointerUp(pointer(50, 60));
        expect(canonical([el])).toBe(before);
        start();
        controller.onPointerMove(pointer(70, 80));
        controller.cancel();
        expect(canonical([el])).toBe(before);
      }
    }
    expect(actions).toBe(0);
    expect(history!.canUndo).toBe(false);
    expect(engine._suppressActions).toBe(false);
  });
});

describe('selection geometry and lifecycle', () => {
  test('single bounds follow effective rotation; mixed union follows presentation/resource/canonical events', () => {
    const { engine, history } = setup();
    const { box } = stageFixture(engine);
    const el = ShapeElement.rectangle(10, 20, 40, 120);
    const image = new ImageElement('/fixture.png', 150, -30);
    image.width = 80;
    image.height = 60;
    const text = new TextElement('text', -100, -80);
    image.rotation = Math.PI / 5;
    text.rotation = -Math.PI / 3;
    el.getDisplayObject().scale.set(2, 0.5);
    [el, image, text].forEach(item => engine.elements.add(item));
    engine.selection.select(el);
    const before = canonical([el, image, text]);
    el.setPresentation({ rotationOffset: Math.PI / 2 });
    expect(box.rotation).toBeCloseTo(Math.PI / 2);
    closePoint(box, el);
    closePoint(box.children[6]!, { x: 80, y: 60 }); // bottom-right, scaled once
    expect(canonical([el, image, text])).toBe(before);
    engine.selection.selectAll();
    const assertUnion = (visible: BaseElement[]) => {
      const bounds = getElementsWorldBounds(visible.map(selectionGeometry))!;
      closePoint(box.children[2]!, bounds);
      closePoint(box.children[6]!, { x: bounds.x + bounds.width, y: bounds.y + bounds.height });
    };
    assertUnion([el, image, text]);
    image.setPresentation({ visible: false });
    assertUnion([el, text]);
    image.clearPresentation();
    assertUnion([el, image, text]);
    // Resource completion can alter natural geometry without canonical events.
    image.getDisplayObject().children[0]!.scale.x *= 2;
    engine.eventBus.emit('element:resourceChanged', { element: image, property: 'loaded', oldValue: false, newValue: true });
    assertUnion([el, image, text]);
    expect(history!.canUndo).toBe(false);
    text.x = -200;
    assertUnion([el, image, text]);
    el.visible = false;
    assertUnion([image, text]);
  });

  test('asynchronous image resource completion refreshes natural selection bounds without canonical events or actions', () => {
    const { engine, history } = setup();
    const { box } = stageFixture(engine);
    const image = new ImageElement('/fixture.png', 40, 50);
    image.setPresentation({ rotationOffset: Math.PI / 5 });
    engine.elements.add(image);
    engine.selection.select(image);
    let changed = 0;
    engine.eventBus.on('element:changed', () => changed++);
    TestImage.requests.at(-1)!.onload!();
    closePoint(box.children[6]!, { x: 80, y: 120 });
    expect(box.rotation).toBeCloseTo(Math.PI / 5);
    expect(changed).toBe(0);
    expect(history!.canUndo).toBe(false);
  });

  for (const decodeBeforeCancel of [false, true]) {
    test(`pending natural image move cancellation preserves sizing intent (decoded=${decodeBeforeCancel})`, async () => {
      const { engine, history } = setup();
      const { stage } = stageFixture(engine);
      const image = new ImageElement('/natural.png', 40, 50);
      engine.elements.add(image);
      engine.selection.select(image);
      const ready = image.whenLoaded();
      const request = TestImage.requests.at(-1)!;
      engine.selection.handleElementPointerDown(image, pointer(40, 50));
      stage.emit('globalpointermove', pointer(50, 70));
      if (decodeBeforeCancel) request.onload!();
      engine.selection.cancelTransform();
      closePoint(image, { x: 40, y: 50 });
      expect(image.whenLoaded()).toBe(ready);
      expect(TestImage.requests).toHaveLength(1);
      expect(history!.canUndo).toBe(false);
      if (!decodeBeforeCancel) request.onload!();
      await ready;
      expect([image.width, image.height]).toEqual([80, 120]);
    });
  }

  test('pending image nudge history retains natural and authored sizes across decode', async () => {
    const { engine, history } = setup();
    const natural = new ImageElement('/natural.png', 40, 50);
    const authored = new ImageElement('/authored.png', 60, 70);
    authored.width = 30;
    authored.height = 45;
    engine.elements.add(natural);
    engine.elements.add(authored);
    engine.selection.selectAll();
    const readiness = [natural.whenLoaded(), authored.whenLoaded()];
    engine.selection.nudgeSelected(1, 0);
    history!.undo(); // Restoring before decode must not pin placeholder dimensions.
    history!.redo();
    TestImage.requests.forEach(request => request.onload!());
    await Promise.all(readiness);
    for (let i = 0; i < 2; i++) {
      history!.undo();
      expect([natural.x, authored.x]).toEqual([40, 60]);
      expect([natural.width, natural.height, authored.width, authored.height]).toEqual([80, 120, 30, 45]);
      history!.redo();
      expect([natural.x, authored.x]).toEqual([41, 61]);
      expect([natural.width, natural.height, authored.width, authored.height]).toEqual([80, 120, 30, 45]);
    }
    expect([natural.whenLoaded(), authored.whenLoaded()]).toEqual(readiness);
    expect(TestImage.requests).toHaveLength(2);
  });

  test('silent canonical scale updates refresh on the next render tick, with no actions and owned ticker cleanup', () => {
    const { engine, history } = setup();
    const { box, ticks, tick } = stageFixture(engine);
    const el = ShapeElement.rectangle(10, 20, 40, 120);
    engine.elements.add(el);
    engine.selection.select(el);
    el.applyJSON({ ...el.toJSON(), scaleX: 2, scaleY: 0.5 });
    tick();
    closePoint(box.children[6]!, { x: 80, y: 60 });
    el.getDisplayObject().scale.set(-3, 2);
    tick();
    closePoint(box.children[2]!, { x: -120, y: 0 });
    closePoint(box.children[6]!, { x: 0, y: 240 });
    expect(history!.canUndo).toBe(false);
    expect(ticks.size).toBe(1);
    engine.selection.destroy();
    expect(ticks.size).toBe(0);
  });

  test('marquee hits rotated bounds, not an overly broad AABB, and excludes effectively hidden elements', () => {
    const { engine } = setup();
    const { stage } = stageFixture(engine);
    const el = ShapeElement.rectangle(0, 0, 100, 10);
    el.setPresentation({ rotationOffset: Math.PI / 4 });
    engine.elements.add(el);
    const drag = (x1: number, y1: number, x2: number, y2: number) => {
      stage.emit('pointerdown', pointer(x1, y1));
      stage.emit('globalpointermove', pointer(x2, y2));
      stage.emit('pointerup', pointer(x2, y2));
    };
    drag(-5, 65, 5, 75); // In its AABB, outside its rotated rectangle.
    expect(engine.selection.getSelected()).toEqual([]);
    drag(30, 30, 40, 40);
    expect(engine.selection.getSelected()).toEqual([el]);
    el.setPresentation({ visible: false });
    drag(30, 30, 40, 40);
    expect(engine.selection.getSelected()).toEqual([]);
  });

  test('selection changes, removal, viewport moves, pointercancel and blur restore a gesture and release suppression', () => {
    const { engine, history } = setup();
    const windowEvents = new EventTarget();
    Object.defineProperty(globalThis, 'window', { value: windowEvents, configurable: true });
    const { stage } = stageFixture(engine);
    const el = ShapeElement.rectangle(1, 2, 40, 120);
    engine.elements.add(el);
    const before = canonical([el]);
    const start = () => {
      engine.selection.select(el);
      engine.selection.handleElementPointerDown(el, pointer(0, 0));
      stage.emit('globalpointermove', pointer(10, 20));
      expect(el.x).toBe(11);
    };
    for (const cancel of [
      () => engine.selection.clearSelection(),
      () => engine.eventBus.emit('viewport:moved', { x: 10, y: 20 }),
      () => engine.eventBus.emit('viewport:zoomed', { zoom: 2 }),
      () => stage.emit('pointercancel', pointer(0, 0)),
      () => windowEvents.dispatchEvent(new Event('blur')),
      () => engine.elements.remove(el),
    ]) {
      start();
      cancel();
      expect(canonical([el])).toBe(before);
      expect(history!.canUndo).toBe(false);
      expect(engine._suppressActions).toBe(false);
      stage.emit('globalpointermove', pointer(20, 30));
      stage.emit('pointerup', pointer(20, 30));
      expect(canonical([el])).toBe(before);
      if (!engine.elements.getById(el.id)) engine.elements.add(el);
    }
    el.x = 9;
    expect(history!.canUndo).toBe(true);
  });

  test('stage routing updates each gesture once and destroy removes only owned listeners', () => {
    const { engine } = setup();
    const { stage } = stageFixture(engine);
    const el = ShapeElement.rectangle(1, 2, 40, 120);
    engine.elements.add(el);
    let moves = 0;
    let external = 0;
    const off = engine.eventBus.on('interaction:dragMove', () => moves++);
    const listener = () => external++;
    stage.on('globalpointermove', listener);
    engine.selection.handleElementPointerDown(el, pointer(0, 0));
    engine.selection.handleElementPointerMove(el, pointer(10, 20));
    stage.emit('globalpointermove', pointer(10, 20));
    expect(moves).toBe(1);
    engine.selection.destroy();
    stage.emit('globalpointermove', pointer(30, 40));
    expect(moves).toBe(1);
    expect(external).toBe(2);
    expect(stage.listeners('globalpointermove')).toEqual([listener]);
    off();
  });
});

describe('clipboard and keyboard commands', () => {
  test('paste uses fresh IDs, snapshots metadata, and replays the same references/IDs/order as one action', () => {
    const { engine, history } = setup();
    const elements = [ShapeElement.rectangle(1, 2, 40, 120), ShapeElement.circle(30, 40, 5)];
    elements.forEach((el, i) => { el.metadata = { app: { index: i } }; engine.elements.add(el); });
    engine.selection.selectAll();
    engine.selection.copySelected();
    elements[0]!.metadata = { edited: true };
    history!.clear();
    const before = canonical(engine.elements.getAll());
    let actions = 0;
    engine.eventBus.on('action:performed', () => actions++);
    engine.selection.pasteClipboard();
    const clones = engine.selection.getSelected();
    expect(clones).toHaveLength(2);
    expect(clones[0]!.id).not.toBe(elements[0]!.id);
    expect(clones[1]!.id).not.toBe(elements[1]!.id);
    expect(clones[0]!.metadata).toEqual({ app: { index: 0 } });
    expect([clones[0]!.x, clones[0]!.y]).toEqual([21, 22]);
    const after = canonical(engine.elements.getAll());
    expect(actions).toBe(1);
    history!.undo();
    expect(canonical(engine.elements.getAll())).toBe(before);
    expect(history!.canUndo).toBe(false);
    history!.redo();
    expect(canonical(engine.elements.getAll())).toBe(after);
    expect(engine.elements.getAll().slice(2)).toEqual(clones);
    expect(actions).toBe(1);
  });

  test('delete preserves equal-z order on undo; multiselection nudge records one action per step', () => {
    const { engine, history } = setup();
    const elements = Array.from({ length: 4 }, (_, i) => ShapeElement.rectangle(i * 10, i, 40, 120));
    elements.forEach(el => engine.elements.add(el));
    engine.selection.select(elements[0]!);
    engine.selection.addToSelection(elements[2]!);
    const before = canonical(elements);
    engine.selection.deleteSelected();
    expect(engine.elements.getAll()).toEqual([elements[1]!, elements[3]!]);
    history!.undo();
    expect(engine.elements.getAll()).toEqual(elements);
    expect(canonical(engine.elements.getAll())).toBe(before);
    expect(history!.canUndo).toBe(false);
    history!.redo();
    expect(engine.elements.getAll()).toEqual([elements[1]!, elements[3]!]);
    history!.undo();
    engine.selection.selectAll();
    let actions = 0;
    engine.eventBus.on('action:performed', () => actions++);
    engine.selection.nudgeSelected(1, 0);
    const first = canonical(elements);
    engine.selection.nudgeSelected(0, 10);
    const second = canonical(elements);
    engine.selection.nudgeSelected(0, 0);
    expect(actions).toBe(2);
    history!.undo();
    expect(canonical(elements)).toBe(first);
    history!.undo();
    expect(canonical(elements)).toBe(before);
    expect(history!.canUndo).toBe(false);
    history!.redo();
    history!.redo();
    expect(canonical(elements)).toBe(second);
  });

  test('delete undo restores map and display order without detaching a pending survivor', async () => {
    const { engine, history } = setup();
    const layer = new Container();
    engine.elements._setLayer(layer);
    const first = ShapeElement.rectangle(0, 0, 40, 120);
    const survivor = new ImageElement('/survivor.png');
    const last = ShapeElement.rectangle(20, 0, 40, 120);
    [first, survivor, last].forEach(element => engine.elements.add(element));
    const ready = survivor.whenLoaded();
    const added: BaseElement[] = [];
    const removed: BaseElement[] = [];
    engine.eventBus.on('element:added', ({ element }) => added.push(element));
    engine.eventBus.on('element:removed', ({ element }) => removed.push(element));
    engine.selection.select(first);
    engine.selection.deleteSelected();
    history!.undo();
    expect(engine.elements.getAll()).toEqual([first, survivor, last]);
    expect(layer.children).toEqual([first, survivor, last].map(element => element.getDisplayObject()));
    expect(added).toEqual([first]);
    expect(removed).toEqual([first]);
    expect(survivor.whenLoaded()).toBe(ready);
    expect(TestImage.requests).toHaveLength(1);
    TestImage.requests[0]!.onload!();
    await ready;
    expect([survivor.width, survivor.height]).toEqual([80, 120]);
    // Reordering must not lose a managed instance absent from an older order snapshot.
    const extra = ShapeElement.circle(5, 5, 3);
    engine.elements.add(extra);
    engine.elements._restoreOrder([first, survivor, last]);
    expect(engine.elements.getAll()).toEqual([first, survivor, last, extra]);
    expect(layer.children).toEqual([first, survivor, last, extra].map(element => element.getDisplayObject()));
  });

  test('Escape works without optional plugins; KeyboardShortcutsPlugin forwards cancellation and cleans up on reinit/destroy', () => {
    const { engine, history } = setup();
    const windowEvents = new EventTarget();
    Object.defineProperty(globalThis, 'window', { value: windowEvents, configurable: true });
    const { stage } = stageFixture(engine);
    const el = ShapeElement.rectangle(1, 2, 40, 120);
    engine.elements.add(el);
    engine.selection.select(el);
    const before = canonical([el]);
    const escape = () => {
      const e = new Event('keydown', { cancelable: true });
      Object.defineProperty(e, 'key', { value: 'Escape' });
      windowEvents.dispatchEvent(e);
    };
    const start = () => {
      engine.selection.handleElementPointerDown(el, pointer(0, 0));
      stage.emit('globalpointermove', pointer(10, 20));
    };
    start();
    escape();
    expect(canonical([el])).toBe(before);
    expect(history!.canUndo).toBe(false);
    const plugin = new KeyboardShortcutsPlugin();
    const cancel = spyOn(engine.selection, 'cancelTransform');
    plugin.init(engine);
    plugin.init(engine);
    escape();
    expect(cancel).toHaveBeenCalledTimes(1); // Core fallback only forwards while active.
    plugin.destroy();
    escape();
    expect(cancel).toHaveBeenCalledTimes(1);
    start();
    engine.selection.destroy();
    const calls = cancel.mock.calls.length;
    escape();
    expect(cancel).toHaveBeenCalledTimes(calls);
    expect(canonical([el])).toBe(before);
    expect(history!.canUndo).toBe(false);
    cancel.mockRestore();
  });
});
