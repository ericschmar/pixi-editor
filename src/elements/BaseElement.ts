import { Container } from 'pixi.js';
import { generateUid } from '../utils/uid.ts';
import type { EventBus } from '../EventBus.ts';
import type { ElementType, SerializedElement } from '../types.ts';

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
    this.container.rotation = value;
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
    this.container.visible = value;
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

  abstract get width(): number;
  abstract set width(value: number);
  abstract get height(): number;
  abstract set height(value: number);

  protected emitChange(property: string, oldValue: unknown, newValue: unknown): void {
    if (!this.engine) return;
    this.engine.eventBus.emit('element:changed', {
      element: this,
      property,
      oldValue,
      newValue,
    });

    if (this.engine._suppressActions) return;

    const element = this;
    this.engine.eventBus.emit('action:performed', {
      action: {
        type: 'property-change',
        description: `Change ${property} on ${this.type} ${this.id}`,
        undo() {
          if (element.engine) element.engine._suppressActions = true;
          (element as any)[property] = oldValue;
          if (element.engine) element.engine._suppressActions = false;
        },
        redo() {
          if (element.engine) element.engine._suppressActions = true;
          (element as any)[property] = newValue;
          if (element.engine) element.engine._suppressActions = false;
        },
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
    };
  }

  abstract applyJSON(data: SerializedElement): void;

  protected abstract redraw(): void;
}
