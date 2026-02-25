import type { BaseElement } from '../elements/BaseElement.ts';
import { ElementRegistry } from '../elements/ElementRegistry.ts';
import { TextElement } from '../elements/TextElement.ts';
import { ImageElement } from '../elements/ImageElement.ts';
import { ShapeElement } from '../elements/ShapeElement.ts';
import type { EventBus } from '../EventBus.ts';
import type { ElementManager } from './ElementManager.ts';
import type { SerializedElement, WatchfaceState } from '../types.ts';

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
    const state: WatchfaceState = JSON.parse(json);
    this.elementManager.clear();

    for (const data of state.elements) {
      const element = this.deserializeElement(data);
      if (element) {
        this.elementManager.add(element);
      }
    }

    this.eventBus.emit('state:loaded', { json });
  }

  deserializeElement(data: SerializedElement): BaseElement | null {
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
