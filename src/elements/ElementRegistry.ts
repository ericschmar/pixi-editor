import type { BaseElement } from './BaseElement.ts';
import type { SerializedElement } from '../types.ts';

export interface ElementConstructor {
  fromJSON(data: SerializedElement): BaseElement;
}

export class ElementRegistry {
  private registry = new Map<string, ElementConstructor>();

  register(type: string, ctor: ElementConstructor): void {
    this.registry.set(type, ctor);
  }

  get(type: string): ElementConstructor | undefined {
    return this.registry.get(type);
  }

  has(type: string): boolean {
    return this.registry.has(type);
  }
}
