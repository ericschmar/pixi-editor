import { cloneMetadata } from '../elements/BaseElement.ts';
import type { BaseElement } from '../elements/BaseElement.ts';
import { ElementRegistry } from '../elements/ElementRegistry.ts';
import { TextElement } from '../elements/TextElement.ts';
import { ImageElement } from '../elements/ImageElement.ts';
import { ShapeElement } from '../elements/ShapeElement.ts';
import type { EventBus } from '../EventBus.ts';
import type { ElementManager } from './ElementManager.ts';
import type { SerializedElement, WatchfaceState } from '../types.ts';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finite(data: Record<string, unknown>, key: string, minimum = -Infinity): void {
  const value = data[key];
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < minimum)) {
    throw new TypeError(`${key} must be a finite number >= ${minimum}`);
  }
}

function choice(data: Record<string, unknown>, key: string, values: readonly unknown[]): void {
  if (data[key] !== undefined && !values.includes(data[key])) throw new TypeError(`Invalid ${key}`);
}

/** Validate built-in wire fields before constructing or replacing any live elements. */
function validateElement(value: unknown): asserts value is SerializedElement {
  const data = object(value, 'element');
  if (typeof data.type !== 'string' || !data.type) throw new TypeError('element type must be a non-empty string');
  if (data.id !== undefined && (typeof data.id !== 'string' || !data.id)) throw new TypeError('element id must be a non-empty string');
  for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'zIndex', 'opacity']) finite(data, key);
  for (const key of ['width', 'height']) finite(data, key, 0);
  for (const key of ['visible', 'interactable']) choice(data, key, [true, false]);
  cloneMetadata(data.metadata);

  if (data.type === 'shape') {
    const required: Record<string, string[]> = {
      rectangle: ['w', 'h'], circle: ['radius'], arc: ['radius', 'startAngle', 'endAngle'],
      line: ['lx1', 'ly1', 'lx2', 'ly2'],
    };
    if (typeof data.shapeType !== 'string' || !Object.hasOwn(required, data.shapeType)) {
      throw new TypeError('Invalid shapeType');
    }
    const params = object(data.shapeParams, 'shapeParams');
    for (const key of required[data.shapeType]!) {
      if (params[key] === undefined) throw new TypeError(`Missing shape parameter ${key}`);
      finite(params, key, ['w', 'h', 'radius'].includes(key) ? 0 : -Infinity);
    }
    for (const key of ['foregroundColor', 'backgroundColor', 'fillPercentage']) finite(data, key);
    finite(data, 'strokeWidth', 0);
    choice(data, 'lineCap', ['butt', 'round', 'square']);
    choice(data, 'fillDirection', ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top']);
  } else if (data.type === 'text') {
    if (typeof data.text !== 'string') throw new TypeError('text must be a string');
    for (const key of ['fontFamily', 'truncationCharacter']) {
      if (data[key] !== undefined && typeof data[key] !== 'string') throw new TypeError(`${key} must be a string`);
    }
    for (const key of ['fontSize', 'color', 'letterSpacing']) finite(data, key);
    for (const key of ['boxWidth', 'boxHeight', 'lineHeight', 'maxLines']) {
      if (data[key] !== null) finite(data, key, 0);
    }
    choice(data, 'breakWords', [true, false]);
    choice(data, 'align', ['left', 'center', 'right']);
    choice(data, 'textTransform', ['none', 'uppercase', 'lowercase', 'capitalize']);
    choice(data, 'fontWeight', ['normal', 'bold', 'bolder', 'lighter', ...Array.from({ length: 9 }, (_, i) => `${(i + 1) * 100}`)]);
    if (data.arcPath != null) {
      const arc = object(data.arcPath, 'arcPath');
      for (const key of ['radius', 'startAngle', 'endAngle']) {
        if (arc[key] === undefined) throw new TypeError(`Missing arcPath ${key}`);
        finite(arc, key, key === 'radius' ? Number.MIN_VALUE : -Infinity);
      }
      if (!['outside', 'inside'].includes(String(arc.side))) throw new TypeError('Invalid arcPath side');
    }
  } else if (data.type === 'image' && typeof data.src !== 'string') {
    throw new TypeError('image src must be a string');
  }
}

export class SerializationManager {
  private eventBus: EventBus;
  private elementManager: ElementManager;
  private registry: ElementRegistry;
  private getCanvasSize: () => { width: number; height: number };

  constructor(
    eventBus: EventBus,
    elementManager: ElementManager,
    getCanvasSize: () => { width: number; height: number },
  ) {
    this.eventBus = eventBus;
    this.elementManager = elementManager;
    this.getCanvasSize = getCanvasSize;
    this.registry = new ElementRegistry();

    this.registry.register('text', TextElement);
    this.registry.register('image', ImageElement);
    this.registry.register('shape', ShapeElement);
  }

  serialize(): string {
    const size = this.getCanvasSize();
    const state: WatchfaceState = {
      version: 1,
      width: size.width,
      height: size.height,
      elements: this.elementManager
        .getAll()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(el => el.toJSON()),
    };
    return JSON.stringify(state, null, 2);
  }

  deserialize(json: string): void {
    const state = object(JSON.parse(json), 'state');
    // Missing envelope fields are accepted for legacy version-1 documents.
    if (state.version !== undefined && state.version !== 1) throw new TypeError('Unsupported state version');
    finite(state, 'width', Number.MIN_VALUE);
    finite(state, 'height', Number.MIN_VALUE);
    if (!Array.isArray(state.elements)) throw new TypeError('state elements must be an array');
    const ids = new Set<string>();
    for (const data of state.elements) {
      validateElement(data);
      if (data.id !== undefined) {
        if (ids.has(data.id)) throw new TypeError(`Duplicate element id: ${data.id}`);
        ids.add(data.id);
      }
    }
    // Custom constructor failures also leave the current document untouched.
    const elements = state.elements.map(data => this.deserializeElement(data));
    // Retire existing instances through the normal lifecycle so selection and
    // other element:removed subscribers cannot retain stale object references.
    for (const element of this.elementManager.getAll()) {
      this.elementManager.remove(element);
    }
    for (const element of elements) {
      if (element) this.elementManager.add(element);
    }

    this.eventBus.emit('state:loaded', { json });
  }

  deserializeElement(data: SerializedElement): BaseElement | null {
    validateElement(data);
    const ElementClass = this.registry.get(data.type);
    if (!ElementClass) {
      console.warn(`Unknown element type: ${data.type}`);
      return null;
    }
    return ElementClass.fromJSON(data);
  }

  getRegistry(): ElementRegistry {
    return this.registry;
  }
}
