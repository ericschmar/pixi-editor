import { Sprite, Texture, ImageSource } from 'pixi.js';
import { BaseElement } from './BaseElement.ts';
import type { SerializedElement } from '../types.ts';

export class ImageElement extends BaseElement {
  private sprite: Sprite;
  private _src: string;
  private _loaded = false;

  constructor(src: string, x: number, y: number) {
    super('image');
    this._src = src;
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0);
    this.container.addChild(this.sprite);
    this.x = x;
    this.y = y;
    this.loadTexture(src);
  }

  private loadTexture(src: string): void {
    const img = new Image();
    img.onload = () => {
      const texture = new Texture({ source: new ImageSource({ resource: img }) });
      this.sprite.texture = texture;
      this._loaded = true;
      this.emitChange('loaded', false, true);
    };
    img.onerror = () => {
      console.warn(`Failed to load image: ${src}`);
    };
    img.src = src;
  }

  get src(): string { return this._src; }
  set src(value: string) {
    const old = this._src;
    if (old === value) return;
    this._src = value;
    this._loaded = false;
    this.emitChange('src', old, value);
    this.loadTexture(value);
  }

  get loaded(): boolean { return this._loaded; }

  override get width(): number { return this.sprite.width; }
  override set width(value: number) {
    const old = this.sprite.width;
    if (old === value) return;
    this.sprite.width = value;
    this.emitChange('width', old, value);
  }

  override get height(): number { return this.sprite.height; }
  override set height(value: number) {
    const old = this.sprite.height;
    if (old === value) return;
    this.sprite.height = value;
    this.emitChange('height', old, value);
  }

  protected override redraw(): void {
    // Sprite auto-updates with texture changes
  }

  override toJSON(): SerializedElement {
    return {
      ...super.toJSON(),
      src: this._src,
    };
  }

  override applyJSON(data: SerializedElement): void {
    if (data.src !== undefined) this.src = data.src as string;
    this.x = data.x;
    this.y = data.y;
    if (data.width) this.width = data.width;
    if (data.height) this.height = data.height;
    this.rotation = data.rotation;
    this.zIndex = data.zIndex;
    this.visible = data.visible;
    this.interactable = data.interactable;
    this.opacity = data.opacity;
  }

  static fromJSON(data: SerializedElement): ImageElement {
    const el = new ImageElement(data.src as string, data.x, data.y);
    el.rotation = data.rotation;
    el.zIndex = data.zIndex;
    el.visible = data.visible;
    el.interactable = data.interactable;
    el.opacity = data.opacity;
    return el;
  }
}
