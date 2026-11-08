import { Graphics } from 'pixi.js';
import { BaseElement } from './BaseElement.ts';
import { FillMask } from './FillMask.ts';
import type { Bounds, FillDirection, LineCap, SerializedElement, ShapeType } from '../types.ts';
import { clamp } from '../utils/math.ts';

type ShapeParams = Partial<Record<'radius' | 'w' | 'h' | 'startAngle' | 'endAngle' | 'lx1' | 'ly1' | 'lx2' | 'ly2', number>> & { points?: number[] };

/** @internal Shared by the factory, codecs and document preflight. */
export function validatePolygonPoints(value: unknown): asserts value is number[] {
  if (!Array.isArray(value) || value.length < 6 || value.length % 2 !== 0 ||
      !Array.from(value).every(v => typeof v === 'number' && Number.isFinite(v))) {
    throw new TypeError('polygon points must contain at least three finite x/y pairs');
  }
  const bounds = polygonBounds(value);
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    throw new TypeError('polygon points must have finite, nondegenerate bounds');
  }
  // Translate and normalize before the shoelace sum to avoid overflow and large-origin cancellation.
  let area = 0;
  for (let i = 0; i < value.length; i += 2) {
    const j = (i + 2) % value.length;
    area += ((value[i]! - bounds.x) / bounds.width) * ((value[j + 1]! - bounds.y) / bounds.height)
      - ((value[j]! - bounds.x) / bounds.width) * ((value[i + 1]! - bounds.y) / bounds.height);
  }
  if (!Number.isFinite(area) || area === 0) throw new TypeError('polygon points must enclose nonzero area');
}

function polygonBounds(points: number[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]!);
    maxX = Math.max(maxX, points[i]!);
    minY = Math.min(minY, points[i + 1]!);
    maxY = Math.max(maxY, points[i + 1]!);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export class ShapeElement extends BaseElement {
  private bgGraphics: Graphics;
  private fgGraphics: Graphics;
  private fillMask: FillMask;

  private _shapeType: ShapeType;
  private _foregroundColor: number;
  private _backgroundColor: number;
  private _fillPercentage: number;
  private _fillDirection: FillDirection;
  private _strokeWidth: number;
  private _lineCap: LineCap;
  private _shapeParams: ShapeParams;

  private constructor(
    shapeType: ShapeType,
    params: ShapeParams,
    options?: Partial<{
      foregroundColor: number;
      backgroundColor: number;
      fillPercentage: number;
      fillDirection: FillDirection;
      strokeWidth: number;
      lineCap: LineCap;
    }>,
    id?: string,
  ) {
    super('shape', id);
    this._shapeType = shapeType;
    if (shapeType === 'polygon') validatePolygonPoints(params.points);
    this._shapeParams = { ...params, ...(params.points ? { points: [...params.points] } : {}) };
    this._foregroundColor = options?.foregroundColor ?? 0xffffff;
    this._backgroundColor = options?.backgroundColor ?? 0x333333;
    this._fillPercentage = options?.fillPercentage ?? 100;
    this._fillDirection = options?.fillDirection ?? 'left-to-right';
    this._strokeWidth = options?.strokeWidth ?? 2;
    this._lineCap = options?.lineCap ?? 'butt';

    this.bgGraphics = new Graphics();
    this.fgGraphics = new Graphics();
    this.fillMask = new FillMask();

    this.container.addChild(this.bgGraphics);
    this.container.addChild(this.fgGraphics);
    this.container.addChild(this.fillMask.getMaskGraphics());
    this.fgGraphics.mask = this.fillMask.getMaskGraphics();

    this.redraw();
  }

  // --- Static builders ---

  static line(x1: number, y1: number, x2: number, y2: number): ShapeElement {
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const el = new ShapeElement('line', {
      lx1: x1 - minX,
      ly1: y1 - minY,
      lx2: x2 - minX,
      ly2: y2 - minY,
    });
    el.x = minX;
    el.y = minY;
    return el;
  }

  static circle(x: number, y: number, radius: number): ShapeElement {
    const el = new ShapeElement('circle', { radius });
    el.x = x;
    el.y = y;
    return el;
  }

  static rectangle(x: number, y: number, width: number, height: number): ShapeElement {
    const el = new ShapeElement('rectangle', { w: width, h: height });
    el.x = x;
    el.y = y;
    return el;
  }

  static arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): ShapeElement {
    const el = new ShapeElement('arc', { radius, startAngle, endAngle });
    el.x = x;
    el.y = y;
    return el;
  }

  /** Filled polygon in local coordinates; x/y remain the authored rotation origin. */
  static polygon(x: number, y: number, points: number[]): ShapeElement {
    validatePolygonPoints(points);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('polygon origin must be finite');
    const el = new ShapeElement('polygon', { points });
    el.x = x;
    el.y = y;
    return el;
  }

  // --- Reactive shape properties ---

  get shapeType(): ShapeType { return this._shapeType; }

  /** Defensive local vertex copy. Only available on polygons. */
  get points(): number[] {
    if (this._shapeType !== 'polygon') throw new TypeError('points is only available on polygons');
    return [...this._shapeParams.points!];
  }
  set points(value: number[]) {
    if (this._shapeType !== 'polygon') throw new TypeError('points is only available on polygons');
    validatePolygonPoints(value);
    const old = this.points;
    const next = [...value];
    if (old.length === next.length && old.every((v, i) => v === next[i])) return;
    this._shapeParams.points = next;
    this.redraw();
    // Base history replays the normal setter. Freeze separate event/history snapshots.
    this.emitChange('points', Object.freeze(old), Object.freeze([...next]));
  }

  get foregroundColor(): number { return this._foregroundColor; }
  set foregroundColor(value: number) {
    const old = this._foregroundColor;
    if (old === value) return;
    this._foregroundColor = value;
    this.redraw();
    this.emitChange('foregroundColor', old, value);
  }

  get backgroundColor(): number { return this._backgroundColor; }
  set backgroundColor(value: number) {
    const old = this._backgroundColor;
    if (old === value) return;
    this._backgroundColor = value;
    this.redraw();
    this.emitChange('backgroundColor', old, value);
  }

  get fillPercentage(): number { return this._fillPercentage; }
  set fillPercentage(value: number) {
    const old = this._fillPercentage;
    const clamped = clamp(value, 0, 100);
    if (old === clamped) return;
    this._fillPercentage = clamped;
    if (this._shapeType === 'arc') {
      this.redraw();
    } else {
      this.updateMask();
    }
    this.emitChange('fillPercentage', old, clamped);
  }

  get fillDirection(): FillDirection { return this._fillDirection; }
  set fillDirection(value: FillDirection) {
    const old = this._fillDirection;
    if (old === value) return;
    this._fillDirection = value;
    if (this._shapeType === 'arc') {
      this.redraw();
    } else {
      this.updateMask();
    }
    this.emitChange('fillDirection', old, value);
  }

  get strokeWidth(): number { return this._strokeWidth; }
  set strokeWidth(value: number) {
    const old = this._strokeWidth;
    if (old === value) return;
    this._strokeWidth = value;
    this.redraw();
    this.emitChange('strokeWidth', old, value);
  }

  get lineCap(): LineCap { return this._lineCap; }
  set lineCap(value: LineCap) {
    const old = this._lineCap;
    if (old === value) return;
    this._lineCap = value;
    this.redraw();
    this.emitChange('lineCap', old, value);
  }

  override get width(): number {
    return this.getLocalBounds().width;
  }
  override set width(value: number) {
    if (this._shapeType === 'polygon') {
      if (!Number.isFinite(value) || value <= 0) throw new TypeError('polygon width must be finite and positive');
      if (value === this.width) return;
      const ratio = value / this.width;
      this.points = this.points.map((v, i) => i % 2 === 0 ? v * ratio : v);
      return;
    }
    const old = this.width;
    if (old === value || old === 0) return;
    switch (this._shapeType) {
      case 'rectangle':
        this._shapeParams['w'] = value;
        break;
      case 'circle':
        this._shapeParams['radius'] = value / 2;
        break;
      case 'arc':
        this._shapeParams['radius'] = value / 2;
        break;
      case 'line':
        this._shapeParams['lx2'] = value;
        break;
    }
    this.redraw();
    this.emitChange('width', old, value);
  }

  override get height(): number {
    return this.getLocalBounds().height;
  }
  override set height(value: number) {
    if (this._shapeType === 'polygon') {
      if (!Number.isFinite(value) || value <= 0) throw new TypeError('polygon height must be finite and positive');
      if (value === this.height) return;
      const ratio = value / this.height;
      this.points = this.points.map((v, i) => i % 2 === 1 ? v * ratio : v);
      return;
    }
    const old = this.height;
    if (old === value || old === 0) return;
    switch (this._shapeType) {
      case 'rectangle':
        this._shapeParams['h'] = value;
        break;
      case 'circle':
        this._shapeParams['radius'] = value / 2;
        break;
      case 'arc':
        this._shapeParams['radius'] = value / 2;
        break;
      case 'line':
        this._shapeParams['ly2'] = value;
        break;
    }
    this.redraw();
    this.emitChange('height', old, value);
  }

  getLocalBounds(): Bounds {
    switch (this._shapeType) {
      case 'polygon':
        return polygonBounds(this._shapeParams.points!);
      case 'circle': {
        const r = this._shapeParams['radius']!;
        return { x: -r, y: -r, width: r * 2, height: r * 2 };
      }
      case 'rectangle':
        return { x: 0, y: 0, width: this._shapeParams['w']!, height: this._shapeParams['h']! };
      case 'line': {
        const lx1 = this._shapeParams['lx1']!;
        const ly1 = this._shapeParams['ly1']!;
        const lx2 = this._shapeParams['lx2']!;
        const ly2 = this._shapeParams['ly2']!;
        const half = this._strokeWidth / 2;
        const w = Math.abs(lx2 - lx1) || 1;
        const h = Math.abs(ly2 - ly1) || 1;
        return { x: -half, y: -half, width: w + this._strokeWidth, height: h + this._strokeWidth };
      }
      case 'arc': {
        const r = this._shapeParams['radius']!;
        const half = this._strokeWidth / 2;
        return { x: -r - half, y: -r - half, width: (r + half) * 2, height: (r + half) * 2 };
      }
    }
  }

  protected override redraw(): void {
    this.bgGraphics.clear();
    this.fgGraphics.clear();

    if (this._shapeType === 'arc') {
      this.drawArc(this.bgGraphics, this._backgroundColor, 100);
      this.drawArc(this.fgGraphics, this._foregroundColor, this._fillPercentage);
      // Arc fill is handled by angular span — no rectangular mask needed.
      this.fillMask.update(this.getLocalBounds(), 100, this._fillDirection);
    } else {
      this.drawShape(this.bgGraphics, this._backgroundColor);
      this.drawShape(this.fgGraphics, this._foregroundColor);
      this.updateMask();
    }
  }

  /**
   * Draw the arc foreground with its span trimmed to `fillPct` percent.
   * `fillDirection` controls which end the fill grows from:
   *   - left-to-right / top-to-bottom: grows from startAngle toward endAngle
   *   - right-to-left / bottom-to-top: grows from endAngle toward startAngle
   */
  private drawArc(g: Graphics, color: number, fillPct: number): void {
    const r = this._shapeParams['radius']!;
    const start = this._shapeParams['startAngle']!;
    const end = this._shapeParams['endAngle']!;
    const pct = clamp(fillPct, 0, 100) / 100;
    const span = end - start;

    let arcStart: number;
    let arcEnd: number;

    if (this._fillDirection === 'right-to-left' || this._fillDirection === 'bottom-to-top') {
      // Grow from end angle backward
      arcStart = end - span * pct;
      arcEnd = end;
    } else {
      // Grow from start angle forward (default)
      arcStart = start;
      arcEnd = start + span * pct;
    }

    if (pct === 0) return;
    g.arc(0, 0, r, arcStart, arcEnd).stroke({ color, width: this._strokeWidth, cap: this._lineCap });
  }

  private drawShape(g: Graphics, color: number): void {
    switch (this._shapeType) {
      case 'polygon':
        g.poly(this._shapeParams.points!, true).fill({ color });
        break;
      case 'line': {
        const lx1 = this._shapeParams['lx1']!;
        const ly1 = this._shapeParams['ly1']!;
        const lx2 = this._shapeParams['lx2']!;
        const ly2 = this._shapeParams['ly2']!;
        g.moveTo(lx1, ly1).lineTo(lx2, ly2).stroke({ color, width: this._strokeWidth, cap: this._lineCap });
        break;
      }
      case 'circle': {
        const r = this._shapeParams['radius']!;
        g.circle(0, 0, r).fill({ color });
        break;
      }
      case 'rectangle': {
        const w = this._shapeParams['w']!;
        const h = this._shapeParams['h']!;
        g.rect(0, 0, w, h).fill({ color });
        break;
      }
    }
  }

  private updateMask(): void {
    const bounds = this.getLocalBounds();
    this.fillMask.update(bounds, this._fillPercentage, this._fillDirection);
  }

  override toJSON(): SerializedElement {
    return {
      ...super.toJSON(),
      shapeType: this._shapeType,
      shapeParams: { ...this._shapeParams, ...(this._shapeParams.points ? { points: this.points } : {}) },
      foregroundColor: this._foregroundColor,
      backgroundColor: this._backgroundColor,
      fillPercentage: this._fillPercentage,
      fillDirection: this._fillDirection,
      strokeWidth: this._strokeWidth,
      lineCap: this._lineCap,
    };
  }

  override applyJSON(data: SerializedElement): void {
    if (this._shapeType === 'polygon' && data.shapeParams !== undefined) {
      const points = (data.shapeParams as ShapeParams | null)?.points;
      validatePolygonPoints(points);
      this.points = points;
    }
    if (data.foregroundColor !== undefined) this.foregroundColor = data.foregroundColor as number;
    if (data.backgroundColor !== undefined) this.backgroundColor = data.backgroundColor as number;
    if (data.fillPercentage !== undefined) this.fillPercentage = data.fillPercentage as number;
    if (data.fillDirection !== undefined) this.fillDirection = data.fillDirection as FillDirection;
    if (data.strokeWidth !== undefined) this.strokeWidth = data.strokeWidth as number;
    if (data.lineCap !== undefined) this.lineCap = data.lineCap as LineCap;
    this.applyBaseJSON(data);
  }

  static fromJSON(data: SerializedElement): ShapeElement {
    const params = data.shapeParams as ShapeParams;
    const el = new ShapeElement(data.shapeType as ShapeType, params, {
      foregroundColor: data.foregroundColor as number,
      backgroundColor: data.backgroundColor as number,
      fillPercentage: data.fillPercentage as number,
      fillDirection: data.fillDirection as FillDirection,
      strokeWidth: data.strokeWidth as number,
      lineCap: data.lineCap as LineCap | undefined,
    }, data.id);
    el.applyBaseJSON(data);
    return el;
  }
}
