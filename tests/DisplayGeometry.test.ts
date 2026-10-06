import { describe, expect, test } from 'bun:test';
import { Container, Graphics } from 'pixi.js';
import {
  applyDisplayMask,
  createDisplayMask,
  displayToViewportPoint,
  fitDisplayGeometry,
  getDisplayBounds,
  isPointInDisplay,
  validateDisplayGeometry,
  viewportToDisplayPoint,
} from '../src/geometry/DisplayGeometry.ts';
import type { DisplayGeometry } from '../src/geometry/DisplayGeometry.ts';

describe('display geometry', () => {
  const rectangular: DisplayGeometry = { shape: 'rectangle', width: 448, height: 486 };
  const round: DisplayGeometry = { shape: 'circle', width: 400, height: 400 };

  test('uses full 448×486 rectangular logical bounds', () => {
    expect(getDisplayBounds(rectangular)).toEqual({ x: 0, y: 0, width: 448, height: 486 });
    expect(getDisplayBounds(rectangular, 'center')).toEqual({
      x: -224,
      y: -243,
      width: 448,
      height: 486,
    });
    expect(isPointInDisplay({ x: 0, y: 0 }, rectangular)).toBe(true);
    expect(isPointInDisplay({ x: 448, y: 486 }, rectangular)).toBe(true);
    expect(isPointInDisplay({ x: 448.01, y: 200 }, rectangular)).toBe(false);
  });

  test('fits 448×486 inside editor bounds uniformly without stretching', () => {
    const viewport = fitDisplayGeometry(rectangular, { x: 10, y: 20, width: 600, height: 600 });
    expect(viewport.scale).toBeCloseTo(600 / 486);
    expect(viewport.width).toBeCloseTo(448 * (600 / 486));
    expect(viewport.height).toBeCloseTo(600);
    expect(viewport.x).toBeCloseTo(10 + (600 - viewport.width) / 2);
    expect(viewport.y).toBeCloseTo(20);
    expect(viewport.width / viewport.height).toBeCloseTo(448 / 486);
  });

  test('round-trips coordinates for top-left and center origins', () => {
    const viewport = fitDisplayGeometry(rectangular, { x: 30, y: 40, width: 900, height: 700 });
    for (const origin of ['top-left', 'center'] as const) {
      const logical = origin === 'center' ? { x: -113, y: 127 } : { x: 111, y: 370 };
      const fitted = displayToViewportPoint(logical, rectangular, viewport, origin);
      const roundTrip = viewportToDisplayPoint(fitted, rectangular, viewport, origin);
      expect(roundTrip.x).toBeCloseTo(logical.x);
      expect(roundTrip.y).toBeCloseTo(logical.y);
    }
  });

  test('preserves circular hit testing and square logical bounds', () => {
    expect(getDisplayBounds(round)).toEqual({ x: 0, y: 0, width: 400, height: 400 });
    expect(isPointInDisplay({ x: 200, y: 200 }, round)).toBe(true);
    expect(isPointInDisplay({ x: 0, y: 0 }, round)).toBe(false);
    expect(isPointInDisplay({ x: 0, y: 200 }, round)).toBe(true);
    expect(isPointInDisplay({ x: 200, y: 0 }, round, 'center')).toBe(true);
  });

  test('creates and attaches shape-aware Pixi masks', () => {
    const rectangleMask = createDisplayMask(rectangular);
    const circleMask = createDisplayMask(round);
    expect(rectangleMask).toBeInstanceOf(Graphics);
    expect(circleMask).toBeInstanceOf(Graphics);
    expect(rectangleMask.getBounds()).toMatchObject({ x: 0, y: 0, width: 448, height: 486 });
    expect(circleMask.getBounds()).toMatchObject({ x: 0, y: 0, width: 400, height: 400 });
    expect(rectangleMask.containsPoint({ x: 0, y: 0 })).toBe(true);
    expect(circleMask.containsPoint({ x: 0, y: 0 })).toBe(false);

    const target = new Container();
    const attachedMask = applyDisplayMask(target, rectangular);
    expect(target.mask).toBe(attachedMask);
    expect(target.children).toContain(attachedMask);

    target.destroy({ children: true });
    rectangleMask.destroy();
    circleMask.destroy();
  });

  test('rejects unknown, invalid, and non-square circular geometry', () => {
    expect(() => validateDisplayGeometry({ shape: 'oval', width: 448, height: 486 })).toThrow();
    expect(() => validateDisplayGeometry({ shape: 'rectangle', width: 0, height: 486 })).toThrow();
    expect(() => validateDisplayGeometry({ shape: 'circle', width: 448, height: 486 })).toThrow();
    expect(() => fitDisplayGeometry(rectangular, { x: 0, y: 0, width: 0, height: 600 })).toThrow();
  });
});
