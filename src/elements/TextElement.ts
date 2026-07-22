import { CanvasTextMetrics, Graphics, Text, TextStyle, type TextStyleFontWeight } from 'pixi.js';
import { BaseElement } from './BaseElement.ts';
import type { ArcPath, SerializedElement } from '../types.ts';

export interface TextElementStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: TextStyleFontWeight;
  align?: TextStyleAlign;
  color?: number;
  lineHeight?: number | null;
  letterSpacing?: number;
  boxWidth?: number | null;
  breakWords?: boolean;
  textTransform?: TextTransform;
  maxLines?: number | null;
  truncationCharacter?: string;
}

type TextStyleAlign = 'left' | 'center' | 'right';
type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

export class TextElement extends BaseElement {
  private pixiText: Text | null;
  private charSprites: Text[] = [];
  private boxProxy: Graphics;
  private _boxWidth: number | null = null;
  private _boxHeight: number | null = null;

  private _text: string;
  private _fontFamily: string;
  private _fontSize: number;
  private _fontWeight: TextStyleFontWeight;
  private _align: TextStyleAlign;
  private _color: number;
  private _lineHeight: number | null;
  private _letterSpacing: number;
  private _boxWidth: number | null;
  private _breakWords: boolean;
  private _textTransform: TextTransform;
  private _maxLines: number | null;
  private _truncationCharacter: string;
  private _arcPath: ArcPath | null = null;

  constructor(text: string, x: number, y: number, style?: TextElementStyle) {
    super('text');
    this._text = text;
    this._fontFamily = style?.fontFamily ?? 'Arial';
    this._fontSize = style?.fontSize ?? 24;
    this._fontWeight = style?.fontWeight ?? 'normal';
    this._align = style?.align ?? 'left';
    this._color = style?.color ?? 0xffffff;
    this._lineHeight = style?.lineHeight ?? null;
    this._letterSpacing = style?.letterSpacing ?? 0;
    this._boxWidth = style?.boxWidth ?? null;
    this._breakWords = style?.breakWords ?? false;
    this._textTransform = style?.textTransform ?? 'none';
    this._maxLines = style?.maxLines ?? null;
    this._truncationCharacter = style?.truncationCharacter ?? '…';

    this.pixiText = this.makeText(this.displayText(this._text));
    this.container.addChild(this.pixiText);
    this.boxProxy = new Graphics();
    this.container.addChild(this.boxProxy);

    this.x = x;
    this.y = y;
    this.redraw();
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
    this.redraw();
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

  get lineHeight(): number | null { return this._lineHeight; }
  set lineHeight(value: number | null) {
    const old = this._lineHeight;
    if (old === value) return;
    this._lineHeight = value;
    this.applyStyleToAll(s => { if (value != null) s.lineHeight = value; });
    this.redraw();
    this.emitChange('lineHeight', old, value);
  }

  get letterSpacing(): number { return this._letterSpacing; }
  set letterSpacing(value: number) {
    const old = this._letterSpacing;
    if (old === value) return;
    this._letterSpacing = value;
    this.applyStyleToAll(s => { s.letterSpacing = value; });
    this.emitChange('letterSpacing', old, value);
  }

  get boxWidth(): number | null { return this._boxWidth; }
  set boxWidth(value: number | null) {
    const old = this._boxWidth;
    if (old === value) return;
    this._boxWidth = value;
    this.applyStyleToAll(s => {
      s.wordWrap = value != null;
      s.wordWrapWidth = value ?? 100;
    });
    this.emitChange('boxWidth', old, value);
  }

  get breakWords(): boolean { return this._breakWords; }
  set breakWords(value: boolean) {
    const old = this._breakWords;
    if (old === value) return;
    this._breakWords = value;
    this.applyStyleToAll(s => { s.breakWords = value; });
    this.emitChange('breakWords', old, value);
  }

  get textTransform(): TextTransform { return this._textTransform; }
  set textTransform(value: TextTransform) {
    const old = this._textTransform;
    if (old === value) return;
    this._textTransform = value;
    this.redraw();
    this.emitChange('textTransform', old, value);
  }

  get maxLines(): number | null { return this._maxLines; }
  set maxLines(value: number | null) {
    const old = this._maxLines;
    if (old === value) return;
    this._maxLines = value;
    this.redraw();
    this.emitChange('maxLines', old, value);
  }

  get truncationCharacter(): string { return this._truncationCharacter; }
  set truncationCharacter(value: string) {
    const old = this._truncationCharacter;
    if (old === value) return;
    this._truncationCharacter = value;
    this.redraw();
    this.emitChange('truncationCharacter', old, value);
  }

  override get width(): number {
    if (this._arcPath) return this._arcPath.radius * 2;
    return this._boxWidth ?? this.pixiText?.width ?? 0;
  }
  override set width(value: number) {
    if (this._arcPath) return;
    const old = this.width;
    if (old === value) return;
    this._boxWidth = value;
    this.redraw();
    this.emitChange('width', old, value);
  }

  override get height(): number {
    if (this._arcPath) return this._arcPath.radius * 2;
    return this._boxHeight ?? this.pixiText?.height ?? 0;
  }
  override set height(value: number) {
    if (this._arcPath) return;
    const old = this.height;
    if (old === value) return;
    this._boxHeight = value;
    this.redraw();
    this.emitChange('height', old, value);
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
      this.pixiText = this.makeText(this.displayText(this._text));
      this.container.addChild(this.pixiText);
    } else {
      this.pixiText.text = this.displayText(this._text);
      this.pixiText.visible = true;
    }

    const text = this.pixiText!;
    const bw = this._boxWidth ?? text.width;
    const bh = this._boxHeight ?? text.height;
    this.boxProxy.clear();
    this.boxProxy.rect(0, 0, bw, bh);
    this.boxProxy.fill({ color: 0xffffff, alpha: 0 });
    text.position.y = bh / 2;
    const tw = text.width;
    text.position.x =
      this._align === 'left' ? tw / 2
      : this._align === 'right' ? bw - tw / 2
      : bw / 2;
  }

  private drawArcText(): void {
    const arc = this._arcPath!;
    this.boxProxy.clear();

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

  private displayText(value: string): string {
    const transformed = this.transformText(value);
    if (!this._maxLines || this._maxLines <= 0) return transformed;

    const style = this.makeTextStyle();
    const lines = CanvasTextMetrics.measureText(transformed, style).lines;
    const maxLines = Math.floor(this._maxLines);
    if (lines.length <= maxLines) return transformed;

    const visibleLines = lines.slice(0, maxLines);
    let lastLine = visibleLines[visibleLines.length - 1]?.replace(/\s+$/, '') ?? '';
    if (this._boxWidth != null) {
      while (lastLine && CanvasTextMetrics.measureText(`${lastLine}${this._truncationCharacter}`, style, undefined, false).width > this._boxWidth) {
        lastLine = lastLine.slice(0, -1);
      }
    }
    visibleLines[visibleLines.length - 1] = `${lastLine}${this._truncationCharacter}`;
    return visibleLines.join('\n');
  }

  private transformText(value: string): string {
    if (this._textTransform === 'uppercase') return value.toUpperCase();
    if (this._textTransform === 'lowercase') return value.toLowerCase();
    if (this._textTransform === 'capitalize') {
      return value.replace(/\p{L}[\p{L}\p{M}'’-]*/gu, word => {
        const first = word[0];
        return first ? first.toUpperCase() + word.slice(1).toLowerCase() : word;
      });
    }
    return value;
  }

  private makeTextStyle(): TextStyle {
    const style = new TextStyle({
      fontFamily: this._fontFamily,
      fontSize: this._fontSize,
      fontWeight: this._fontWeight,
      fill: this._color,
      align: this._align,
      letterSpacing: this._letterSpacing,
      wordWrap: this._boxWidth != null,
      wordWrapWidth: this._boxWidth ?? 100,
      breakWords: this._breakWords,
    });
    if (this._lineHeight != null) style.lineHeight = this._lineHeight;
    return style;
  }

  private makeText(content: string): Text {
    const style = this.makeTextStyle();

    return new Text({
      text: content,
      // Anchor (0.5, 0.5) so drawNormalText can place the glyph by its center within the
      // box (position.x/position.y). Arc-text sprites override this via sprite.anchor.set()
      // after creation, so it's a no-op there. Element x/y mean the box top-left.
      anchor: 0.5,
      style,
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
      lineHeight: this._lineHeight,
      letterSpacing: this._letterSpacing,
      boxWidth: this._boxWidth,
      breakWords: this._breakWords,
      textTransform: this._textTransform,
      maxLines: this._maxLines,
      truncationCharacter: this._truncationCharacter,
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
    if (data.lineHeight !== undefined) this.lineHeight = data.lineHeight as number | null;
    if (data.letterSpacing !== undefined) this.letterSpacing = data.letterSpacing as number;
    if (data.boxWidth !== undefined) this.boxWidth = data.boxWidth as number | null;
    if (data.breakWords !== undefined) this.breakWords = data.breakWords as boolean;
    if (data.textTransform !== undefined) this.textTransform = data.textTransform as TextTransform;
    if (data.maxLines !== undefined) this.maxLines = data.maxLines as number | null;
    if (data.truncationCharacter !== undefined) this.truncationCharacter = data.truncationCharacter as string;
    if ('arcPath' in data) this.arcPath = (data.arcPath as ArcPath | null | undefined) ?? null;
    if (data.width !== undefined) this.width = data.width as number;
    if (data.height !== undefined) this.height = data.height as number;
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
      lineHeight: data.lineHeight as number | null | undefined,
      letterSpacing: data.letterSpacing as number | undefined,
      boxWidth: data.boxWidth as number | null | undefined,
      breakWords: data.breakWords as boolean | undefined,
      textTransform: data.textTransform as TextTransform | undefined,
      maxLines: data.maxLines as number | null | undefined,
      truncationCharacter: data.truncationCharacter as string | undefined,
    });
    if (data.arcPath) el.arcPath = data.arcPath as ArcPath;
    if (data.width !== undefined) el.width = data.width as number;
    if (data.height !== undefined) el.height = data.height as number;
    el.rotation = data.rotation;
    el.zIndex = data.zIndex;
    el.visible = data.visible;
    el.interactable = data.interactable;
    el.opacity = data.opacity;
    return el;
  }
}
