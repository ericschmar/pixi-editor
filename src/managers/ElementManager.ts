import type { Container } from 'pixi.js';
import type { BaseElement, EngineRef } from '../elements/BaseElement.ts';
import type { EventBus } from '../EventBus.ts';

export class ElementManager {
  private elements = new Map<string, BaseElement>();
  private engine: EngineRef;
  private eventBus: EventBus;
  private elementsLayer: Container | null = null;

  constructor(engine: EngineRef, eventBus: EventBus) {
    this.engine = engine;
    this.eventBus = eventBus;
  }

  /** @internal Set by WatchfaceEngine after init */
  _setLayer(layer: Container): void {
    this.elementsLayer = layer;
  }

  add(element: BaseElement): void {
    if (this.elements.has(element.id)) return;
    this.elements.set(element.id, element);
    element._attach(this.engine);

    if (this.elementsLayer) {
      this.elementsLayer.addChild(element.getDisplayObject());
    }

    this.eventBus.emit('element:added', { element });
  }

  remove(element: BaseElement): void {
    if (!this.elements.has(element.id)) return;
    this.elements.delete(element.id);

    if (this.elementsLayer) {
      this.elementsLayer.removeChild(element.getDisplayObject());
    }

    element._detach();
    this.eventBus.emit('element:removed', { element });
  }

  getById(id: string): BaseElement | undefined {
    return this.elements.get(id);
  }

  getAll(): BaseElement[] {
    return Array.from(this.elements.values());
  }

  clear(): void {
    for (const element of this.elements.values()) {
      if (this.elementsLayer) {
        this.elementsLayer.removeChild(element.getDisplayObject());
      }
      element._detach();
    }
    this.elements.clear();
  }

  get count(): number {
    return this.elements.size;
  }
}
