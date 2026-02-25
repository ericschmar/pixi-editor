import { Graphics } from 'pixi.js';
import { BaseElement } from './BaseElement.ts';
import { FillMask } from './FillMask.ts';
import type { Bounds, FillDirection, SerializedElement, ShapeType } from '../types.ts';
import { clamp } from '../utils/math.ts';

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
  private _shapeParams: Record<string, number>;

  private constructor(
    shapeType: ShapeType,
    params: Record<string, number>,
    options?: Partial<{
      foregroundColor: number;
      backgroundColor: number;
      fillPercentage: number;
      fillDirection: FillDirection;
      strokeWidth: number;
    }>,
  ) {
    super('shape');
    this._shapeType = shapeType;
    this._shapeParams = { ...params };
    this._foregroundColor = options?.foregroundColor ?? 0xffffff;
    this._backgroundColor = options?.backgroundColor ?? 0x333333;
    this._fillPercentage = options?.fillPercentage ?? 100;
    this._fillDirection = options?.fillDirection ?? 'left-to-right';
    this._strokeWidth = options?.strokeWidth ?? 2;

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

  // --- Reactive shape properties ---

  get shapeType(): ShapeType { return this._shapeType; }

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
    this.updateMask();
    this.emitChange('fillPercentage', old, clamped);
  }

  get fillDirection(): FillDirection { return this._fillDirection; }
  set fillDirection(value: FillDirection) {
    const old = this._fillDirection;
    if (old === value) return;
    this._fillDirection = value;
    this.updateMask();
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

  override get width(): number {
    return this.getLocalBounds().width;
  }
  override set width(value: number) {
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
      case 'circle': {
        const r = this._shapeParams['radius']!;
        return { x: 0, y: 0, width: r * 2, height: r * 2 };
      }
      case 'rectangle':
        return { x: 0, y: 0, width: this._shapeParams['w']!, height: this._shapeParams['h']! };
      case 'line': {
        const lx1 = this._shapeParams['lx1']!;
        const ly1 = this._shapeParams['ly1']!;
        const lx2 = this._shapeParams['lx2']!;
        const ly2 = this._shapeParams['ly2']!;
        const w = Math.abs(lx2 - lx1) || 1;
        const h = Math.abs(ly2 - ly1) || 1;
        return { x: 0, y: 0, width: w, height: h };
      }
      case 'arc': {
        const r = this._shapeParams['radius']!;
        return { x: 0, y: 0, width: r * 2, height: r * 2 };
      }
    }
  }

  protected override redraw(): void {
    this.bgGraphics.clear();
    this.fgGraphics.clear();

    this.drawShape(this.bgGraphics, this._backgroundColor);
    this.drawShape(this.fgGraphics, this._foregroundColor);
    this.updateMask();
  }

  private drawShape(g: Graphics, color: number): void {
    switch (this._shapeType) {
      case 'line': {
        const lx1 = this._shapeParams['lx1']!;
        const ly1 = this._shapeParams['ly1']!;
        const lx2 = this._shapeParams['lx2']!;
        const ly2 = this._shapeParams['ly2']!;
        g.moveTo(lx1, ly1).lineTo(lx2, ly2).stroke({ color, width: this._strokeWidth });
        break;
      }
      case 'circle': {
        const r = this._shapeParams['radius']!;
        g.circle(r, r, r).fill({ color });
        break;
      }
      case 'rectangle': {
        const w = this._shapeParams['w']!;
        const h = this._shapeParams['h']!;
        g.rect(0, 0, w, h).fill({ color });
        break;
      }
      case 'arc': {
        const r = this._shapeParams['radius']!;
        const start = this._shapeParams['startAngle']!;
        const end = this._shapeParams['endAngle']!;
        g.arc(r, r, r, start, end).stroke({ color, width: this._strokeWidth });
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
      shapeParams: { ...this._shapeParams },
      foregroundColor: this._foregroundColor,
      backgroundColor: this._backgroundColor,
      fillPercentage: this._fillPercentage,
      fillDirection: this._fillDirection,
      strokeWidth: this._strokeWidth,
    };
  }

  override applyJSON(data: SerializedElement): void {
    if (data.foregroundColor !== undefined) this.foregroundColor = data.foregroundColor as number;
    if (data.backgroundColor !== undefined) this.backgroundColor = data.backgroundColor as number;
    if (data.fillPercentage !== undefined) this.fillPercentage = data.fillPercentage as number;
    if (data.fillDirection !== undefined) this.fillDirection = data.fillDirection as FillDirection;
    if (data.strokeWidth !== undefined) this.strokeWidth = data.strokeWidth as number;
    this.x = data.x;
    this.y = data.y;
    this.rotation = data.rotation;
    this.zIndex = data.zIndex;
    this.visible = data.visible;
    this.interactable = data.interactable;
    this.opacity = data.opacity;
  }

  static fromJSON(data: SerializedElement): ShapeElement {
    const params = data.shapeParams as Record<string, number>;
    const el = new ShapeElement(data.shapeType as ShapeType, params, {
      foregroundColor: data.foregroundColor as number,
      backgroundColor: data.backgroundColor as number,
      fillPercentage: data.fillPercentage as number,
      fillDirection: data.fillDirection as FillDirection,
      strokeWidth: data.strokeWidth as number,
    });
    el.x = data.x;
    el.y = data.y;
    el.rotation = data.rotation;
    el.zIndex = data.zIndex;
    el.visible = data.visible;
    el.interactable = data.interactable;
    el.opacity = data.opacity;
    return el;
  }
}
