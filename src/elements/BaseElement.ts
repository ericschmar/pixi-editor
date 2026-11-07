import { Container } from 'pixi.js';
import { generateUid } from '../utils/uid.ts';
import type { EventBus } from '../EventBus.ts';
import type { ElementType, SerializedElement, ElementMetadata, ElementPresentation, JSONValue } from '../types.ts';

/** @internal Validate and copy opaque data without invoking accessors or toJSON. */
export function cloneMetadata(value: unknown): ElementMetadata | undefined {
  if (value === undefined) return undefined;
  const ancestors = new Set<object>();
  const copy = (item: unknown): JSONValue => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || item === null || ancestors.has(item)) {
      throw new TypeError('metadata must contain only finite, acyclic JSON values');
    }
    const array = Array.isArray(item);
    if (!array && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new TypeError('metadata must contain only plain JSON objects');
    }
    ancestors.add(item);
    const result: JSONValue[] | ElementMetadata = array ? [] : {};
    const keys = Reflect.ownKeys(item);
    if (array && keys.length !== item.length + 1) throw new TypeError('metadata arrays must be dense JSON arrays');
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor) ||
          (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length))) {
        throw new TypeError('metadata must contain only enumerable JSON data properties');
      }
      Object.defineProperty(result, key, {
        value: copy(descriptor.value), enumerable: true, writable: true, configurable: true,
      });
    }
    ancestors.delete(item);
    return result;
  };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('metadata must be a JSON object');
  }
  return copy(value) as ElementMetadata;
}

export interface EngineRef {
  eventBus: EventBus;
  _suppressActions: boolean;
}

export abstract class BaseElement {
  readonly id: string;
  readonly type: ElementType;
  protected readonly container: Container;
  protected engine: EngineRef | null = null;

  private _x = 0;
  private _y = 0;
  private _rotation = 0;
  private _zIndex = 0;
  private _visible = true;
  private _interactable = true;
  private _opacity = 1;
  private _metadata: ElementMetadata | undefined;
  private presentation: ElementPresentation = {};

  constructor(type: ElementType, id?: string) {
    this.id = id ?? generateUid();
    this.type = type;
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
  }

  // --- Reactive properties ---

  get x(): number { return this._x; }
  set x(value: number) {
    const old = this._x;
    if (old === value) return;
    this._x = value;
    this.container.x = value;
    this.emitChange('x', old, value);
  }

  get y(): number { return this._y; }
  set y(value: number) {
    const old = this._y;
    if (old === value) return;
    this._y = value;
    this.container.y = value;
    this.emitChange('y', old, value);
  }

  get rotation(): number { return this._rotation; }
  set rotation(value: number) {
    const old = this._rotation;
    if (old === value) return;
    this._rotation = value;
    this.container.rotation = this.effectiveRotation;
    this.emitChange('rotation', old, value);
  }

  get zIndex(): number { return this._zIndex; }
  set zIndex(value: number) {
    const old = this._zIndex;
    if (old === value) return;
    this._zIndex = value;
    this.container.zIndex = value;
    this.emitChange('zIndex', old, value);
    this.engine?.eventBus.emit('element:zChanged', { element: this, oldZ: old, newZ: value });
  }

  get visible(): boolean { return this._visible; }
  set visible(value: boolean) {
    const old = this._visible;
    if (old === value) return;
    this._visible = value;
    this.container.visible = this.effectiveVisible;
    this.emitChange('visible', old, value);
  }

  get interactable(): boolean { return this._interactable; }
  set interactable(value: boolean) {
    const old = this._interactable;
    if (old === value) return;
    this._interactable = value;
    this.container.eventMode = value ? 'static' : 'none';
    this.container.cursor = value ? 'pointer' : 'default';
    this.emitChange('interactable', old, value);
  }

  get opacity(): number { return this._opacity; }
  set opacity(value: number) {
    const old = this._opacity;
    if (old === value) return;
    this._opacity = value;
    this.container.alpha = value;
    this.emitChange('opacity', old, value);
  }

  get metadata(): ElementMetadata | undefined { return cloneMetadata(this._metadata); }
  set metadata(value: ElementMetadata | undefined) {
    const next = cloneMetadata(value);
    const old = this._metadata;
    if (JSON.stringify(old) === JSON.stringify(next)) return;
    this._metadata = next;
    this.emitChange('metadata', old, next);
  }

  get effectiveRotation(): number { return this._rotation + (this.presentation.rotationOffset ?? 0); }
  get effectiveVisible(): boolean { return this._visible && (this.presentation.visible ?? true); }

  /** Merge transient display overrides; never changes canonical properties or history. */
  setPresentation(presentation: ElementPresentation): void {
    if (presentation.rotationOffset !== undefined && !Number.isFinite(presentation.rotationOffset)) {
      throw new TypeError('rotationOffset must be finite');
    }
    if (presentation.visible !== undefined && typeof presentation.visible !== 'boolean') {
      throw new TypeError('presentation visible must be a boolean');
    }
    const next = { ...this.presentation };
    if (presentation.rotationOffset !== undefined) next.rotationOffset = presentation.rotationOffset;
    if (presentation.visible !== undefined) next.visible = presentation.visible;
    if (next.rotationOffset === this.presentation.rotationOffset && next.visible === this.presentation.visible) return;
    this.presentation = next;
    this.updatePresentation();
  }

  clearPresentation(): void {
    if (Object.keys(this.presentation).length === 0) return;
    this.presentation = {};
    this.updatePresentation();
  }

  private updatePresentation(): void {
    this.container.rotation = this.effectiveRotation;
    this.container.visible = this.effectiveVisible;
    this.engine?.eventBus.emit('element:presentationChanged', { element: this });
  }

  /** Apply common canonical fields, retaining defaults for absent legacy fields and never changing ID. */
  protected applyBaseJSON(data: SerializedElement): void {
    if (data.x !== undefined) this.x = data.x;
    if (data.y !== undefined) this.y = data.y;
    if (data.rotation !== undefined) this.rotation = data.rotation;
    if (data.zIndex !== undefined) this.zIndex = data.zIndex;
    if (data.visible !== undefined) this.visible = data.visible;
    if (data.interactable !== undefined) this.interactable = data.interactable;
    if (data.opacity !== undefined) this.opacity = data.opacity;
    if (data.scaleX !== undefined) this.container.scale.x = data.scaleX;
    if (data.scaleY !== undefined) this.container.scale.y = data.scaleY;
    this.metadata = data.metadata;
  }

  abstract get width(): number;
  abstract set width(value: number);
  abstract get height(): number;
  abstract set height(value: number);

  protected emitChange(property: string, oldValue: unknown, newValue: unknown): void {
    if (!this.engine) return;
    // Event consumers and history must not share mutable metadata snapshots.
    const snapshot = (value: unknown) => property === 'metadata' ? cloneMetadata(value) : value;
    const before = snapshot(oldValue);
    const after = snapshot(newValue);
    this.engine.eventBus.emit('element:changed', {
      element: this,
      property,
      oldValue: snapshot(before),
      newValue: snapshot(after),
    });

    if (this.engine._suppressActions) return;

    const element = this;
    const apply = (value: unknown) => {
      const engine = element.engine;
      const previous = engine?._suppressActions ?? false;
      if (engine) engine._suppressActions = true;
      try {
        if (!Reflect.set(element, property, snapshot(value))) throw new TypeError(`Cannot restore property ${property}`);
      } finally {
        if (engine) engine._suppressActions = previous;
      }
    };
    this.engine.eventBus.emit('action:performed', {
      action: {
        type: 'property-change',
        description: `Change ${property} on ${this.type} ${this.id}`,
        undo() { apply(before); },
        redo() { apply(after); },
      },
    });
  }

  /** @internal Called by ElementManager when added to engine */
  _attach(engine: EngineRef): void {
    this.engine = engine;
  }

  /** @internal Called by ElementManager when removed from engine */
  _detach(): void {
    this.engine = null;
  }

  getDisplayObject(): Container {
    return this.container;
  }

  toJSON(): SerializedElement {
    return {
      type: this.type,
      id: this.id,
      x: this._x,
      y: this._y,
      width: this.width,
      height: this.height,
      rotation: this._rotation,
      scaleX: this.container.scale.x,
      scaleY: this.container.scale.y,
      zIndex: this._zIndex,
      visible: this._visible,
      interactable: this._interactable,
      opacity: this._opacity,
      ...(this._metadata === undefined ? {} : { metadata: cloneMetadata(this._metadata) }),
    };
  }

  abstract applyJSON(data: SerializedElement): void;

  protected abstract redraw(): void;
}
