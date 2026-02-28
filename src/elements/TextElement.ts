import { Text, TextStyle, type TextStyleFontWeight } from 'pixi.js';
import { BaseElement } from './BaseElement.ts';
import type { ArcPath, SerializedElement } from '../types.ts';

export interface TextElementStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: TextStyleFontWeight;
  align?: TextStyleAlign;
  color?: number;
}

type TextStyleAlign = 'left' | 'center' | 'right';

export class TextElement extends BaseElement {
  private pixiText: Text | null;
  private charSprites: Text[] = [];

  private _text: string;
  private _fontFamily: string;
  private _fontSize: number;
  private _fontWeight: TextStyleFontWeight;
  private _align: TextStyleAlign;
  private _color: number;
  private _arcPath: ArcPath | null = null;

  constructor(text: string, x: number, y: number, style?: TextElementStyle) {
    super('text');
    this._text = text;
    this._fontFamily = style?.fontFamily ?? 'Arial';
    this._fontSize = style?.fontSize ?? 24;
    this._fontWeight = style?.fontWeight ?? 'normal';
    this._align = style?.align ?? 'left';
    this._color = style?.color ?? 0xffffff;

    this.pixiText = this.makeText(this._text);
    this.container.addChild(this.pixiText);

    this.x = x;
    this.y = y;
  }

  // --- Arc path ---

  get arcPath(): ArcPath | null { return this._arcPath; }
  set arcPath(value: ArcPath | null) {
    const old = this._arcPath;
    this._arcPath = value;
    this.redraw();
    this.emitChange('arcPath', old, value);
  }

  // --- Text / style properties ---

  get text(): string { return this._text; }
  set text(value: string) {
    const old = this._text;
    if (old === value) return;
    this._text = value;
    this.redraw();
    this.emitChange('text', old, value);
  }

  get fontFamily(): string { return this._fontFamily; }
  set fontFamily(value: string) {
    const old = this._fontFamily;
    if (old === value) return;
    this._fontFamily = value;
    this.applyStyleToAll(s => { s.fontFamily = value; });
    this.emitChange('fontFamily', old, value);
  }

  get fontSize(): number { return this._fontSize; }
  set fontSize(value: number) {
    const old = this._fontSize;
    if (old === value) return;
    this._fontSize = value;
    this.applyStyleToAll(s => { s.fontSize = value; });
    this.emitChange('fontSize', old, value);
  }

  get fontWeight(): TextStyleFontWeight { return this._fontWeight; }
  set fontWeight(value: TextStyleFontWeight) {
    const old = this._fontWeight;
    if (old === value) return;
    this._fontWeight = value;
    this.applyStyleToAll(s => { s.fontWeight = value; });
    this.emitChange('fontWeight', old, value);
  }

  get align(): TextStyleAlign { return this._align; }
  set align(value: TextStyleAlign) {
    const old = this._align;
    if (old === value) return;
    this._align = value;
    if (this.pixiText) (this.pixiText.style as TextStyle).align = value;
    this.emitChange('align', old, value);
  }

  get color(): number { return this._color; }
  set color(value: number) {
    const old = this._color;
    if (old === value) return;
    this._color = value;
    this.applyStyleToAll(s => { s.fill = value; });
    this.emitChange('color', old, value);
  }

  override get width(): number {
    if (this._arcPath) return this._arcPath.radius * 2;
    return this.pixiText?.width ?? 0;
  }
  override set width(_value: number) {
    // width is determined by content/arc; not directly settable
  }

  override get height(): number {
    if (this._arcPath) return this._arcPath.radius * 2;
    return this.pixiText?.height ?? 0;
  }
  override set height(_value: number) {
    // height is determined by content/arc; not directly settable
  }

  protected override redraw(): void {
    if (this._arcPath) {
      this.drawArcText();
    } else {
      this.drawNormalText();
    }
  }

  private drawNormalText(): void {
    // Remove arc character sprites
    for (const s of this.charSprites) {
      this.container.removeChild(s);
      s.destroy();
    }
    this.charSprites = [];

    if (!this.pixiText) {
      this.pixiText = this.makeText(this._text);
      this.container.addChild(this.pixiText);
    } else {
      this.pixiText.text = this._text;
      this.pixiText.visible = true;
    }
  }

  private drawArcText(): void {
    const arc = this._arcPath!;

    // Hide the single text node while arc mode is active
    if (this.pixiText) {
      this.pixiText.visible = false;
    }

    // Remove old char sprites
    for (const s of this.charSprites) {
      this.container.removeChild(s);
      s.destroy();
    }
    this.charSprites = [];

    const chars = Array.from(this._text);
    if (chars.length === 0) return;

    // Build one sprite per character so we can measure and position each individually.
    const sprites: Text[] = chars.map(ch => this.makeText(ch));

    const span = arc.endAngle - arc.startAngle;
    const arcLength = Math.abs(arc.radius * span);
    const totalWidth = sprites.reduce((sum, s) => sum + s.width, 0);

    // Scale character widths to fill the arc length
    const spacingScale = arcLength > 0 ? arcLength / totalWidth : 1;

    // 'outside': characters stand upright with feet toward the arc (anchor bottom-center)
    // 'inside' : characters are flipped so feet point outward (anchor top-center)
    const flip = arc.side === 'inside' ? Math.PI : 0;
    const anchorY = arc.side === 'outside' ? 1 : 0;

    let angle = arc.startAngle;

    for (const sprite of sprites) {
      const halfAngular = ((sprite.width * spacingScale) / 2) / arc.radius;

      // Advance to character center
      angle += halfAngular * Math.sign(span);

      sprite.x = Math.cos(angle) * arc.radius;
      sprite.y = Math.sin(angle) * arc.radius;
      sprite.rotation = angle + Math.PI / 2 + flip;
      sprite.anchor.set(0.5, anchorY);

      this.container.addChild(sprite);
      this.charSprites.push(sprite);

      // Advance past character center
      angle += halfAngular * Math.sign(span);
    }
  }

  private makeText(content: string): Text {
    return new Text({
      text: content,
      style: new TextStyle({
        fontFamily: this._fontFamily,
        fontSize: this._fontSize,
        fontWeight: this._fontWeight,
        fill: this._color,
        align: this._align,
      }),
    });
  }

  private applyStyleToAll(mutate: (s: TextStyle) => void): void {
    if (this.pixiText) mutate(this.pixiText.style as TextStyle);
    for (const s of this.charSprites) mutate(s.style as TextStyle);
  }

  override toJSON(): SerializedElement {
    return {
      ...super.toJSON(),
      text: this._text,
      fontFamily: this._fontFamily,
      fontSize: this._fontSize,
      fontWeight: this._fontWeight,
      align: this._align,
      color: this._color,
      arcPath: this._arcPath ?? undefined,
    };
  }

  override applyJSON(data: SerializedElement): void {
    if (data.text !== undefined) this.text = data.text as string;
    if (data.fontFamily !== undefined) this.fontFamily = data.fontFamily as string;
    if (data.fontSize !== undefined) this.fontSize = data.fontSize as number;
    if (data.fontWeight !== undefined) this.fontWeight = data.fontWeight as TextStyleFontWeight;
    if (data.align !== undefined) this.align = data.align as TextStyleAlign;
    if (data.color !== undefined) this.color = data.color as number;
    if ('arcPath' in data) this.arcPath = (data.arcPath as ArcPath | null | undefined) ?? null;
    this.x = data.x;
    this.y = data.y;
    this.rotation = data.rotation;
    this.zIndex = data.zIndex;
    this.visible = data.visible;
    this.interactable = data.interactable;
    this.opacity = data.opacity;
  }

  static fromJSON(data: SerializedElement): TextElement {
    const el = new TextElement(data.text as string, data.x, data.y, {
      fontFamily: data.fontFamily as string,
      fontSize: data.fontSize as number,
      fontWeight: data.fontWeight as TextStyleFontWeight,
      align: data.align as TextStyleAlign,
      color: data.color as number,
    });
    if (data.arcPath) el.arcPath = data.arcPath as ArcPath;
    el.rotation = data.rotation;
    el.zIndex = data.zIndex;
    el.visible = data.visible;
    el.interactable = data.interactable;
    el.opacity = data.opacity;
    return el;
  }
}
