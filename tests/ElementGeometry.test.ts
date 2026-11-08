import { describe, expect, test } from 'bun:test';
import {
  getElementWorldCorners,
  getElementsWorldBounds,
  worldDeltaToLocal,
  type ElementGeometryInput,
} from '../src/geometry/ElementGeometry.ts';

describe('element geometry', () => {
  test('transforms local corners around authored origin at cardinal and non-cardinal rotations', () => {
    const element: ElementGeometryInput = {
      x: 10,
      y: 20,
      rotation: 0,
      localBounds: { x: -5, y: -10, width: 20, height: 10 },
    };
    expect(getElementWorldCorners(element)).toEqual([
      { x: 5, y: 10 }, { x: 25, y: 10 }, { x: 25, y: 20 }, { x: 5, y: 20 },
    ]);

    element.rotation = Math.PI / 2;
    const quarterTurn = getElementWorldCorners(element);
    expect(quarterTurn[0]!.x).toBeCloseTo(20);
    expect(quarterTurn[0]!.y).toBeCloseTo(15);
    expect(quarterTurn[2]!.x).toBeCloseTo(10);
    expect(quarterTurn[2]!.y).toBeCloseTo(35);

    element.rotation = Math.PI / 5;
    const fifthTurn = getElementWorldCorners(element);
    expect(fifthTurn[0]!.x).toBeCloseTo(10 - 5 * Math.cos(Math.PI / 5) + 10 * Math.sin(Math.PI / 5));
    expect(fifthTurn[0]!.y).toBeCloseTo(20 - 5 * Math.sin(Math.PI / 5) - 10 * Math.cos(Math.PI / 5));
  });

  test('unions rotated elements with negative local origins and allows zero-sized bounds', () => {
    const bounds = getElementsWorldBounds([
      { x: 100, y: 50, rotation: Math.PI / 2, localBounds: { x: -10, y: -5, width: 20, height: 10 } },
      { x: -4, y: 8, rotation: 0, localBounds: { x: 1, y: -2, width: 3, height: 4 } },
    ]);
    expect(bounds?.x).toBeCloseTo(-3);
    expect(bounds?.y).toBeCloseTo(6);
    expect(bounds?.width).toBeCloseTo(108);
    expect(bounds?.height).toBeCloseTo(54);

    expect(getElementsWorldBounds([
      { x: 3, y: 4, rotation: Math.PI / 5, localBounds: { x: 0, y: 0, width: 0, height: 0 } },
    ])).toEqual({ x: 3, y: 4, width: 0, height: 0 });
    expect(getElementsWorldBounds([])).toBeNull();
  });

  test('inverse-rotates world pointer deltas to local axes for representative angles', () => {
    for (const rotation of [0, Math.PI / 2, Math.PI / 5]) {
      const world = { x: 20 * Math.cos(rotation), y: 20 * Math.sin(rotation) };
      const local = worldDeltaToLocal(world, rotation);
      expect(local.x).toBeCloseTo(20);
      expect(local.y).toBeCloseTo(0);
    }
  });

  test('rejects non-finite transforms and invalid local extents', () => {
    expect(() => getElementWorldCorners({
      x: 0, y: 0, rotation: Number.NaN, localBounds: { x: 0, y: 0, width: 1, height: 1 },
    })).toThrow(RangeError);
    expect(() => getElementWorldCorners({
      x: 0, y: 0, rotation: 0, localBounds: { x: 0, y: 0, width: -1, height: 1 },
    })).toThrow(RangeError);
  });
});
