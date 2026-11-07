import { Sprite, Texture, ImageSource } from 'pixi.js';
import { BaseElement } from './BaseElement.ts';
import type { SerializedElement } from '../types.ts';

export class ImageElement extends BaseElement {
  private sprite: Sprite;
  private _src: string;
  private _loaded = false;
  private authoredWidth: number | null = null;
  private authoredHeight: number | null = null;
  private loadGeneration = 0;

  constructor(src: string, x: number, y: number, id?: string) {
    super('image', id);
    this._src = src;
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0);
    this.container.addChild(this.sprite);
    this.x = x;
    this.y = y;
    this.loadTexture(src);
  }

  private loadTexture(src: string): void {
    const generation = ++this.loadGeneration;
    const img = new Image();
    img.onload = () => {
      if (generation !== this.loadGeneration) return;
      const texture = new Texture({ source: new ImageSource({ resource: img }) });
      this.sprite.texture = texture;
      if (this.authoredWidth !== null) this.sprite.width = this.authoredWidth;
      if (this.authoredHeight !== null) this.sprite.height = this.authoredHeight;
      this._loaded = true;
      this.engine?.eventBus.emit('element:resourceChanged', {
        element: this, property: 'loaded', oldValue: false, newValue: true,
      });
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
    this.authoredWidth = value;
    if (old === value) return;
    this.sprite.width = value;
    this.emitChange('width', old, value);
  }

  override get height(): number { return this.sprite.height; }
  override set height(value: number) {
    const old = this.sprite.height;
    this.authoredHeight = value;
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
    if (data.width !== undefined) this.width = data.width;
    if (data.height !== undefined) this.height = data.height;
    this.applyBaseJSON(data);
  }

  static fromJSON(data: SerializedElement): ImageElement {
    const el = new ImageElement(data.src as string, data.x ?? 0, data.y ?? 0, data.id);
    el.applyJSON(data);
    return el;
  }
}
