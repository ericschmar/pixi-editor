import { Text, TextStyle, type TextStyleFontWeight } from 'pixi.js';
import { BaseElement } from './BaseElement.ts';
import type { SerializedElement } from '../types.ts';

export interface TextElementStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: TextStyleFontWeight;
  align?: TextStyleAlign;
  color?: number;
}

type TextStyleAlign = 'left' | 'center' | 'right';

export class TextElement extends BaseElement {
  private pixiText: Text;
  private _text: string;
  private _fontFamily: string;
  private _fontSize: number;
  private _fontWeight: TextStyleFontWeight;
  private _align: TextStyleAlign;
  private _color: number;

  constructor(text: string, x: number, y: number, style?: TextElementStyle) {
    super('text');
    this._text = text;
    this._fontFamily = style?.fontFamily ?? 'Arial';
    this._fontSize = style?.fontSize ?? 24;
    this._fontWeight = style?.fontWeight ?? 'normal';
    this._align = style?.align ?? 'left';
    this._color = style?.color ?? 0xffffff;

    this.pixiText = new Text({
      text: this._text,
      style: new TextStyle({
        fontFamily: this._fontFamily,
        fontSize: this._fontSize,
        fontWeight: this._fontWeight,
        fill: this._color,
        align: this._align,
      }),
    });

    this.container.addChild(this.pixiText);
    this.x = x;
    this.y = y;
  }

  get text(): string { return this._text; }
  set text(value: string) {
    const old = this._text;
    if (old === value) return;
    this._text = value;
    this.pixiText.text = value;
    this.emitChange('text', old, value);
  }

  get fontFamily(): string { return this._fontFamily; }
  set fontFamily(value: string) {
    const old = this._fontFamily;
    if (old === value) return;
    this._fontFamily = value;
    (this.pixiText.style as TextStyle).fontFamily = value;
    this.emitChange('fontFamily', old, value);
  }

  get fontSize(): number { return this._fontSize; }
  set fontSize(value: number) {
    const old = this._fontSize;
    if (old === value) return;
    this._fontSize = value;
    (this.pixiText.style as TextStyle).fontSize = value;
    this.emitChange('fontSize', old, value);
  }

  get fontWeight(): TextStyleFontWeight { return this._fontWeight; }
  set fontWeight(value: TextStyleFontWeight) {
    const old = this._fontWeight;
    if (old === value) return;
    this._fontWeight = value;
    (this.pixiText.style as TextStyle).fontWeight = value;
    this.emitChange('fontWeight', old, value);
  }

  get align(): TextStyleAlign { return this._align; }
  set align(value: TextStyleAlign) {
    const old = this._align;
    if (old === value) return;
    this._align = value;
    (this.pixiText.style as TextStyle).align = value;
    this.emitChange('align', old, value);
  }

  get color(): number { return this._color; }
  set color(value: number) {
    const old = this._color;
    if (old === value) return;
    this._color = value;
    (this.pixiText.style as TextStyle).fill = value;
    this.emitChange('color', old, value);
  }

  override get width(): number { return this.pixiText.width; }
  override set width(value: number) {
    const old = this.pixiText.width;
    if (old === value) return;
    this.pixiText.width = value;
    this.emitChange('width', old, value);
  }

  override get height(): number { return this.pixiText.height; }
  override set height(value: number) {
    const old = this.pixiText.height;
    if (old === value) return;
    this.pixiText.height = value;
    this.emitChange('height', old, value);
  }

  protected override redraw(): void {
    // Text auto-redraws when style properties change
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
    };
  }

  override applyJSON(data: SerializedElement): void {
    if (data.text !== undefined) this.text = data.text as string;
    if (data.fontFamily !== undefined) this.fontFamily = data.fontFamily as string;
    if (data.fontSize !== undefined) this.fontSize = data.fontSize as number;
    if (data.fontWeight !== undefined) this.fontWeight = data.fontWeight as TextStyleFontWeight;
    if (data.align !== undefined) this.align = data.align as TextStyleAlign;
    if (data.color !== undefined) this.color = data.color as number;
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
    el.rotation = data.rotation;
    el.zIndex = data.zIndex;
    el.visible = data.visible;
    el.interactable = data.interactable;
    el.opacity = data.opacity;
    return el;
  }
}
