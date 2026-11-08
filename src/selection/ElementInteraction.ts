import type { BaseElement, EngineRef } from '../elements/BaseElement.ts';
import type { EventBus } from '../EventBus.ts';
import type { SerializedElement } from '../types.ts';
import type { ElementGeometryInput, LocalBounds } from '../geometry/ElementGeometry.ts';

/** Engine-internal bridge: scopes never escape a synchronous setter/replay call. */
export function suppressElementActions<T>(elements: readonly BaseElement[], fn: () => T): T {
  const engines = new Map<EngineRef, boolean>();
  for (const element of elements) {
    // Selection is engine infrastructure, not an application-side history API.
    const engine = Reflect.get(element, 'engine') as EngineRef | null;
    if (engine && !engines.has(engine)) engines.set(engine, engine._suppressActions);
  }
  try {
    for (const engine of engines.keys()) engine._suppressActions = true;
    return fn();
  } finally {
    for (const [engine, previous] of engines) engine._suppressActions = previous;
  }
}

/** Local bounds include canonical container scale exactly once, never rotation. */
export function selectionGeometry(element: BaseElement): ElementGeometryInput {
  const display = element.getDisplayObject();
  const bounded = element as BaseElement & { getLocalBounds?: () => LocalBounds };
  const bounds = bounded.getLocalBounds?.() ?? display.getLocalBounds();
  const x1 = bounds.x * display.scale.x;
  const x2 = (bounds.x + bounds.width) * display.scale.x;
  const y1 = bounds.y * display.scale.y;
  const y2 = (bounds.y + bounds.height) * display.scale.y;
  return {
    x: element.x, y: element.y, rotation: element.effectiveRotation,
    localBounds: {
      x: Math.min(x1, x2), y: Math.min(y1, y2),
      width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
    },
  };
}

export interface ElementSnapshot {
  element: BaseElement;
  json: SerializedElement;
  imageSize?: { width: number | null; height: number | null };
}

export function snapshotElements(elements: readonly BaseElement[]): ElementSnapshot[] {
  return elements.map(element => ({
    element, json: structuredClone(element.toJSON()),
    ...(typeof Reflect.get(element, '_captureInteractionSize') === 'function'
      ? { imageSize: Reflect.get(element, '_captureInteractionSize').call(element) as { width: number | null; height: number | null } }
      : {}),
  }));
}

export function restoreElements(snapshots: readonly ElementSnapshot[], eventBus: EventBus): void {
  suppressElementActions(snapshots.map(({ element }) => element), () => {
    for (const snapshot of snapshots) {
      const { element, json } = snapshot;
      element.applyJSON(structuredClone(json));
      if (snapshot.imageSize && typeof Reflect.get(element, '_restoreInteractionSize') === 'function') {
        Reflect.get(element, '_restoreInteractionSize').call(element, snapshot.imageSize);
      }
      // Compatibility with the foundation ShapeElement.applyJSON, which applies
      // styles/base fields but omits its canonical shapeParams. Keep the original
      // instance (and its listeners); do not approximate parameter restoration by
      // writing width/height, which loses line endpoints and arc stroke extents.
      if (json.shapeParams !== undefined &&
          JSON.stringify(element.toJSON().shapeParams) !== JSON.stringify(json.shapeParams) &&
          Object.hasOwn(element, '_shapeParams')) {
        const oldValue = structuredClone(element.toJSON().shapeParams);
        Reflect.set(element, '_shapeParams', structuredClone(json.shapeParams));
        Reflect.get(element, 'redraw').call(element);
        eventBus.emit('element:changed', {
          element, property: 'shapeParams', oldValue, newValue: structuredClone(json.shapeParams),
        });
      }
    }
  });
}

/** Record one generic action after a synchronous edit or an entire pointer gesture. */
export function recordElementEdit(
  eventBus: EventBus,
  before: readonly ElementSnapshot[],
  type: string,
  description: string,
): void {
  const after = snapshotElements(before.map(({ element }) => element));
  if (before.every((snapshot, i) => JSON.stringify(snapshot.json) === JSON.stringify(after[i]!.json))) return;
  eventBus.emit('action:performed', {
    action: {
      type, description,
      undo: () => restoreElements(before, eventBus),
      redo: () => restoreElements(after, eventBus),
    },
  });
}
