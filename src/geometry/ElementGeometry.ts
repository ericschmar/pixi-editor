/** Point in the engine's world space (content-root-local), before viewport transforms. */
export interface GeometryPoint {
  x: number;
  y: number;
}

/** A local-space rectangle, including its offset from an element's authored origin. */
export interface LocalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Structural subset of a generic engine element and its Pixi local bounds. */
export interface ElementGeometryInput {
  x: number;
  y: number;
  rotation: number;
  localBounds: LocalBounds;
}

/** Axis-aligned bounds in world space (content-root-local). */
export interface WorldBounds extends LocalBounds {}

/**
 * Transform the four corners of an element's local bounds into world space.
 * Rotation is in radians and occurs around the authored element origin (x, y).
 * Viewport/pan/zoom transforms are intentionally not applied here.
 */
export function getElementWorldCorners(element: ElementGeometryInput): [GeometryPoint, GeometryPoint, GeometryPoint, GeometryPoint] {
  validateElement(element);
  const { x, y, rotation, localBounds } = element;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const right = localBounds.x + localBounds.width;
  const bottom = localBounds.y + localBounds.height;

  return [
    rotatePoint(localBounds.x, localBounds.y, x, y, cos, sin),
    rotatePoint(right, localBounds.y, x, y, cos, sin),
    rotatePoint(right, bottom, x, y, cos, sin),
    rotatePoint(localBounds.x, bottom, x, y, cos, sin),
  ];
}

/**
 * Get the axis-aligned world-space union of rotated local rectangles.
 * Returns null for an empty collection; zero-width/height rectangles are valid.
 */
export function getElementsWorldBounds(elements: readonly ElementGeometryInput[]): WorldBounds | null {
  if (elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of elements) {
    for (const corner of getElementWorldCorners(element)) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Convert a world-space pointer delta to an element's unscaled local axes. */
export function worldDeltaToLocal(delta: GeometryPoint, rotation: number): GeometryPoint {
  validatePoint(delta, 'World delta');
  if (!Number.isFinite(rotation)) throw new RangeError('Rotation must be a finite number.');
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: delta.x * cos + delta.y * sin, y: -delta.x * sin + delta.y * cos };
}

function rotatePoint(
  localX: number,
  localY: number,
  originX: number,
  originY: number,
  cos: number,
  sin: number,
): GeometryPoint {
  return {
    x: originX + localX * cos - localY * sin,
    y: originY + localX * sin + localY * cos,
  };
}

function validateElement(element: ElementGeometryInput): void {
  validatePoint(element, 'Element origin');
  if (!Number.isFinite(element.rotation)) throw new RangeError('Rotation must be a finite number.');
  const { x, y, width, height } = element.localBounds;
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) {
    throw new RangeError('Local bounds must have finite coordinates and non-negative dimensions.');
  }
}

function validatePoint(point: GeometryPoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} coordinates must be finite numbers.`);
  }
}
