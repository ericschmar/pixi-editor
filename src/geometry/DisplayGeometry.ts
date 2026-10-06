import { Container, Graphics } from 'pixi.js';
import type { Bounds, CoordinateOrigin } from '../types.ts';

/** Display shape supported by watch-face geometry. */
export type DisplayShape = 'circle' | 'rectangle';

/** Logical display dimensions, independent of an editor's pixel dimensions. */
export interface DisplayGeometry {
  shape: DisplayShape;
  width: number;
  height: number;
}

export interface DisplayPoint {
  x: number;
  y: number;
}

/** A display's fitted rectangle in the editor, plus its uniform scale. */
export interface DisplayViewport extends Bounds {
  scale: number;
}

/**
 * Check and narrow geometry received from saved data or device integrations.
 * Circular displays use a square logical coordinate space.
 */
export function validateDisplayGeometry(value: unknown): asserts value is DisplayGeometry {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Display geometry must be an object.');
  }

  const geometry = value as Record<string, unknown>;
  if (geometry.shape !== 'circle' && geometry.shape !== 'rectangle') {
    throw new TypeError(`Unsupported display shape: ${String(geometry.shape)}.`);
  }
  if (typeof geometry.width !== 'number' || !Number.isFinite(geometry.width) || geometry.width <= 0) {
    throw new RangeError('Display geometry width must be a positive finite number.');
  }
  if (typeof geometry.height !== 'number' || !Number.isFinite(geometry.height) || geometry.height <= 0) {
    throw new RangeError('Display geometry height must be a positive finite number.');
  }
  if (geometry.shape === 'circle' && geometry.width !== geometry.height) {
    throw new RangeError('Circular display geometry must have equal width and height.');
  }
}

/** Return logical display bounds for the requested coordinate origin. */
export function getDisplayBounds(
  geometry: DisplayGeometry,
  coordinateOrigin: CoordinateOrigin = 'top-left',
): Bounds {
  validateDisplayGeometry(geometry);
  validateCoordinateOrigin(coordinateOrigin);
  return {
    x: coordinateOrigin === 'center' ? -geometry.width / 2 : 0,
    y: coordinateOrigin === 'center' ? -geometry.height / 2 : 0,
    width: geometry.width,
    height: geometry.height,
  };
}

/**
 * Fit a logical display inside an editor-space rectangle without distortion.
 * The returned bounds are centered in the editor rectangle; the editor
 * rectangle is never interpreted as the face's logical dimensions.
 */
export function fitDisplayGeometry(
  geometry: DisplayGeometry,
  editorBounds: Bounds,
): DisplayViewport {
  validateDisplayGeometry(geometry);
  validateBounds(editorBounds, 'Editor bounds');

  const scale = Math.min(editorBounds.width / geometry.width, editorBounds.height / geometry.height);
  const width = geometry.width * scale;
  const height = geometry.height * scale;
  return {
    x: editorBounds.x + (editorBounds.width - width) / 2,
    y: editorBounds.y + (editorBounds.height - height) / 2,
    width,
    height,
    scale,
  };
}

/** Convert a logical face coordinate to the fitted editor viewport. */
export function displayToViewportPoint(
  point: DisplayPoint,
  geometry: DisplayGeometry,
  viewport: DisplayViewport,
  coordinateOrigin: CoordinateOrigin = 'top-left',
): DisplayPoint {
  validateDisplayGeometry(geometry);
  validateViewport(viewport);
  validatePoint(point, 'Display point');
  const bounds = getDisplayBounds(geometry, coordinateOrigin);
  return {
    x: viewport.x + (point.x - bounds.x) * viewport.scale,
    y: viewport.y + (point.y - bounds.y) * viewport.scale,
  };
}

/** Convert a fitted editor-space point to logical face coordinates. */
export function viewportToDisplayPoint(
  point: DisplayPoint,
  geometry: DisplayGeometry,
  viewport: DisplayViewport,
  coordinateOrigin: CoordinateOrigin = 'top-left',
): DisplayPoint {
  validateDisplayGeometry(geometry);
  validateViewport(viewport);
  validatePoint(point, 'Viewport point');
  const bounds = getDisplayBounds(geometry, coordinateOrigin);
  return {
    x: bounds.x + (point.x - viewport.x) / viewport.scale,
    y: bounds.y + (point.y - viewport.y) / viewport.scale,
  };
}

/** Test whether a logical coordinate falls inside the visible display shape. */
export function isPointInDisplay(
  point: DisplayPoint,
  geometry: DisplayGeometry,
  coordinateOrigin: CoordinateOrigin = 'top-left',
): boolean {
  validateDisplayGeometry(geometry);
  validatePoint(point, 'Display point');
  const bounds = getDisplayBounds(geometry, coordinateOrigin);

  if (geometry.shape === 'rectangle') {
    return point.x >= bounds.x && point.x <= bounds.x + bounds.width
      && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
  }

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radius = geometry.width / 2;
  return (point.x - centerX) ** 2 + (point.y - centerY) ** 2 <= radius ** 2;
}

/**
 * Create a Pixi mask matching the visible display shape. Add the returned
 * Graphics to the masked container (or a sibling in the same coordinate
 * space) and assign it as that container's mask.
 */
export function createDisplayMask(
  geometry: DisplayGeometry,
  coordinateOrigin: CoordinateOrigin = 'top-left',
): Graphics {
  const bounds = getDisplayBounds(geometry, coordinateOrigin);
  const mask = new Graphics();
  if (geometry.shape === 'circle') {
    mask.circle(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width / 2);
  } else {
    mask.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  mask.fill({ color: 0xffffff });
  return mask;
}

/** Attach a shape-aware Pixi mask and return it for later removal/destruction. */
export function applyDisplayMask(
  target: Container,
  geometry: DisplayGeometry,
  coordinateOrigin: CoordinateOrigin = 'top-left',
): Graphics {
  const mask = createDisplayMask(geometry, coordinateOrigin);
  target.addChild(mask);
  target.mask = mask;
  return mask;
}

function validateCoordinateOrigin(value: CoordinateOrigin): void {
  if (value !== 'top-left' && value !== 'center') {
    throw new TypeError(`Unsupported coordinate origin: ${String(value)}.`);
  }
}

function validatePoint(point: DisplayPoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} coordinates must be finite numbers.`);
  }
}

function validateBounds(bounds: Bounds, label: string): void {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
    throw new RangeError(`${label} position must use finite numbers.`);
  }
  if (!Number.isFinite(bounds.width) || bounds.width <= 0
    || !Number.isFinite(bounds.height) || bounds.height <= 0) {
    throw new RangeError(`${label} width and height must be positive finite numbers.`);
  }
}

function validateViewport(viewport: DisplayViewport): void {
  validateBounds(viewport, 'Viewport bounds');
  if (!Number.isFinite(viewport.scale) || viewport.scale <= 0) {
    throw new RangeError('Viewport scale must be a positive finite number.');
  }
}
