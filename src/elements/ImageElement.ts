import { Sprite, Texture, ImageSource } from 'pixi.js';
import { BaseElement, cloneMetadata } from './BaseElement.ts';
import type { EngineRef } from './BaseElement.ts';
import type { Bounds, ImagePivot, SerializedElement } from '../types.ts';

/** @internal Shared by setters, codecs and document preflight. */
export function validateImagePivot(value: unknown): asserts value is ImagePivot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('image pivot must contain finite x/y coordinates in [0, 1]');
  }
  const { x, y } = value as ImagePivot;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new TypeError('image pivot must contain finite x/y coordinates in [0, 1]');
  }
}

function validateDimension(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new TypeError('image dimensions must be finite and nonnegative');
}

function validateImagePayload(data: SerializedElement, requireSource = false): void {
  if (requireSource || data.src !== undefined) {
    if (typeof data.src !== 'string') throw new TypeError('image src must be a string');
  }
  if (data.width !== undefined) validateDimension(data.width);
  if (data.height !== undefined) validateDimension(data.height);
  if (data.pivot !== undefined) validateImagePivot(data.pivot);
  if (data.metadata !== undefined) cloneMetadata(data.metadata);
}

export class ImageElement extends BaseElement {
  private sprite: Sprite;
  private _src: string;
  private _loaded = false;
  private _pivot: ImagePivot = { x: 0, y: 0 };
  private authoredWidth: number | null = null;
  private authoredHeight: number | null = null;
  private loadGeneration = 0;
  private readiness!: Promise<void>;
  private rejectReadiness: ((error: Error) => void) | null = null;
  private pendingImage: HTMLImageElement | null = null;
  // Textures created here are exclusively owned. Never destroy Texture.EMPTY or cached textures.
  private ownedTexture: Texture | null = null;
  private disposed = false;

  constructor(src: string, x: number, y: number, id?: string) {
    super('image', id);
    this._src = src;
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0);
    this.container.addChild(this.sprite);
    this.container.on('destroyed', () => this.dispose());
    this.x = x;
    this.y = y;
    this.loadTexture(src);
  }

  private cancelLoad(reason: string): void {
    ++this.loadGeneration;
    if (this.pendingImage) {
      // Drop captured instance references; late DOM notifications become inert.
      this.pendingImage.onload = () => {};
      this.pendingImage.onerror = () => {};
      this.pendingImage = null;
    }
    this.rejectReadiness?.(new Error(reason));
    this.rejectReadiness = null;
  }

  private loadTexture(src: string): void {
    this.cancelLoad('Image load superseded');
    const generation = this.loadGeneration;
    this._loaded = false;
    let resolve!: () => void;
    this.readiness = new Promise<void>((done, reject) => {
      resolve = done;
      this.rejectReadiness = reject;
    });
    // Loading starts eagerly; an unobserved failure must not become an unhandled rejection.
    // Keep the original rejecting promise so whenLoaded() still reports the failure.
    void this.readiness.catch(() => {});
    const current = () => generation === this.loadGeneration && !this.disposed;
    const clearRequest = () => {
      if (this.pendingImage) {
        this.pendingImage.onload = null;
        this.pendingImage.onerror = null;
        this.pendingImage = null;
      }
    };
    const fail = () => {
      if (!current() || !this.rejectReadiness) return;
      clearRequest();
      this.rejectReadiness(new Error(`Failed to load image: ${src}`));
      this.rejectReadiness = null;
    };
    try {
      const img = new Image();
      this.pendingImage = img;
      img.onload = () => {
        if (!current() || !this.rejectReadiness) return;
        let texture: Texture;
        try {
          texture = new Texture({ source: new ImageSource({ resource: img }) });
        } catch {
          fail();
          return;
        }
        clearRequest();
        const previous = this.ownedTexture;
        this.ownedTexture = texture;
        this.sprite.texture = texture;
        // Reapply even explicit zero: Pixi's texture setter only remembers truthy sizes.
        this.sprite.width = this.authoredWidth ?? texture.orig.width;
        this.sprite.height = this.authoredHeight ?? texture.orig.height;
        previous?.destroy(true);
        this._loaded = true;
        this.rejectReadiness = null;
        resolve();
        this.engine?.eventBus.emit('element:resourceChanged', {
          element: this, property: 'loaded', oldValue: false, newValue: true,
        });
      };
      img.onerror = fail;
      img.src = src;
    } catch {
      fail();
    }
  }

  /** @internal Preserve natural-vs-authored sizing for engine interaction snapshots. */
  _captureInteractionSize(): { width: number | null; height: number | null } {
    return { width: this.authoredWidth, height: this.authoredHeight };
  }

  /** @internal Restore sizing intent without changing source generation or readiness. */
  _restoreInteractionSize(size: { width: number | null; height: number | null }): void {
    this.authoredWidth = size.width;
    this.authoredHeight = size.height;
    this.sprite.width = size.width ?? this.sprite.texture.orig.width;
    this.sprite.height = size.height ?? this.sprite.texture.orig.height;
  }

  /** Readiness of the source generation current at the time of this call. */
  whenLoaded(): Promise<void> { return this.readiness; }

  get src(): string { return this._src; }
  set src(value: string) {
    if (this.disposed) throw new Error('ImageElement is disposed');
    if (typeof value !== 'string') throw new TypeError('image src must be a string');
    const old = this._src;
    if (old === value) return;
    this._src = value;
    this.loadTexture(value);
    this.emitChange('src', old, value);
  }

  get loaded(): boolean { return this._loaded; }

  get pivot(): ImagePivot { return { ...this._pivot }; }
  set pivot(value: ImagePivot) {
    validateImagePivot(value);
    const next = { x: value.x, y: value.y };
    const old = this._pivot;
    if (old.x === next.x && old.y === next.y) return;
    this._pivot = next;
    this.sprite.anchor.set(next.x, next.y);
    this.emitChange('pivot', Object.freeze({ ...old }), Object.freeze({ ...next }));
  }

  override get width(): number { return this.authoredWidth ?? this.sprite.width; }
  override set width(value: number) {
    validateDimension(value);
    const old = this.width;
    this.authoredWidth = value;
    this.sprite.width = value;
    if (old !== value) this.emitChange('width', old, value);
  }

  override get height(): number { return this.authoredHeight ?? this.sprite.height; }
  override set height(value: number) {
    validateDimension(value);
    const old = this.height;
    this.authoredHeight = value;
    this.sprite.height = value;
    if (old !== value) this.emitChange('height', old, value);
  }

  getLocalBounds(): Bounds {
    return { x: -this._pivot.x * this.width, y: -this._pivot.y * this.height, width: this.width, height: this.height };
  }

  /** Removal cancels in-flight work; reattachment (e.g. undo) can load it again. */
  override _detach(): void {
    this.cancelLoad('Image load cancelled: element detached');
    super._detach();
  }

  override _attach(engine: EngineRef): void {
    if (this.disposed) throw new Error('ImageElement is disposed');
    super._attach(engine);
    if (!this._loaded && !this.pendingImage) this.loadTexture(this._src);
  }

  /** Permanently release this instance's request and privately owned texture. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this._loaded = false;
    this.cancelLoad('Image load cancelled: element disposed');
    this.readiness = Promise.reject(new Error('ImageElement is disposed'));
    void this.readiness.catch(() => {});
    // Disconnect our texture before destroying the display tree, even when the caller
    // requested texture destruction. Shared Texture.EMPTY must remain usable elsewhere.
    if (!this.sprite.destroyed) this.sprite.texture = Texture.EMPTY;
    this.ownedTexture?.destroy(true);
    this.ownedTexture = null;
    if (!this.container.destroyed) this.container.destroy({ children: true });
  }

  protected override redraw(): void {
    // Sprite auto-updates with texture changes
  }

  override toJSON(): SerializedElement {
    return { ...super.toJSON(), src: this._src, pivot: this.pivot };
  }

  override applyJSON(data: SerializedElement): void {
    // Validate the entire image payload before changing the source or any geometry.
    validateImagePayload(data);
    if (data.src !== undefined) this.src = data.src as string;
    if (data.width !== undefined) this.width = data.width;
    if (data.height !== undefined) this.height = data.height;
    if (data.pivot !== undefined) this.pivot = data.pivot as ImagePivot;
    this.applyBaseJSON(data);
  }

  static fromJSON(data: SerializedElement): ImageElement {
    validateImagePayload(data, true);
    const el = new ImageElement(data.src as string, data.x ?? 0, data.y ?? 0, data.id);
    el.applyJSON(data);
    return el;
  }
}
