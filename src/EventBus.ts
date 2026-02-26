import type { BaseElement } from './elements/BaseElement.ts';
import type { UndoableAction } from './types.ts';

export interface EngineEventMap {
  'engine:ready': void;
  'engine:destroy': void;

  'element:added': { element: BaseElement };
  'element:removed': { element: BaseElement };
  'element:changed': { element: BaseElement; property: string; oldValue: unknown; newValue: unknown };
  'element:zChanged': { element: BaseElement; oldZ: number; newZ: number };

  'selection:changed': { selected: BaseElement[] };
  'selection:cleared': void;

  'interaction:dragStart': { element: BaseElement; position: { x: number; y: number } };
  'interaction:dragMove': { elements: BaseElement[]; dx: number; dy: number };
  'interaction:dragEnd': { elements: BaseElement[] };
  'interaction:resizeStart': { element: BaseElement };
  'interaction:resizeEnd': { element: BaseElement };
  'interaction:rotateStart': { element: BaseElement };
  'interaction:rotateEnd': { element: BaseElement };

  'action:performed': { action: UndoableAction };

  'state:saved': { json: string };
  'state:loaded': { json: string };

  'viewport:zoomed': { zoom: number };
  'viewport:moved': { x: number; y: number };
}

type Handler<T> = T extends void ? () => void : (data: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof EngineEventMap>(
    event: K,
    handler: Handler<EngineEventMap[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof EngineEventMap>(
    event: K,
    ...args: EngineEventMap[K] extends void ? [] : [EngineEventMap[K]]
  ): void {
    this.listeners.get(event)?.forEach(handler => handler(...args));
  }

  off<K extends keyof EngineEventMap>(
    event: K,
    handler: Handler<EngineEventMap[K]>,
  ): void {
    this.listeners.get(event)?.delete(handler);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
