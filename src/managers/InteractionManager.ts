import type { FederatedPointerEvent } from 'pixi.js';
import type { BaseElement } from '../elements/BaseElement.ts';
import type { EventBus } from '../EventBus.ts';
import type { ElementManager } from './ElementManager.ts';

export interface InteractionDelegate {
  handleElementPointerDown(element: BaseElement, event: FederatedPointerEvent): void;
  handleElementPointerMove(element: BaseElement, event: FederatedPointerEvent): void;
  handleElementPointerUp(element: BaseElement, event: FederatedPointerEvent): void;
}

export class InteractionManager {
  private eventBus: EventBus;
  private elementManager: ElementManager;
  private delegate: InteractionDelegate | null = null;
  private boundHandlers = new Map<string, {
    down: (e: FederatedPointerEvent) => void;
    move: (e: FederatedPointerEvent) => void;
    up: (e: FederatedPointerEvent) => void;
  }>();

  constructor(eventBus: EventBus, elementManager: ElementManager) {
    this.eventBus = eventBus;
    this.elementManager = elementManager;

    this.eventBus.on('element:added', ({ element }) => this.attachListeners(element));
    this.eventBus.on('element:removed', ({ element }) => this.detachListeners(element));
  }

  setDelegate(delegate: InteractionDelegate): void {
    this.delegate = delegate;
  }

  private attachListeners(element: BaseElement): void {
    const display = element.getDisplayObject();

    const down = (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.delegate?.handleElementPointerDown(element, e);
    };
    const move = (e: FederatedPointerEvent) => {
      this.delegate?.handleElementPointerMove(element, e);
    };
    const up = (e: FederatedPointerEvent) => {
      this.delegate?.handleElementPointerUp(element, e);
    };

    display.on('pointerdown', down);
    display.on('globalpointermove', move);
    display.on('pointerup', up);
    display.on('pointerupoutside', up);

    this.boundHandlers.set(element.id, { down, move, up });
  }

  private detachListeners(element: BaseElement): void {
    const handlers = this.boundHandlers.get(element.id);
    if (!handlers) return;
    const display = element.getDisplayObject();
    display.off('pointerdown', handlers.down);
    display.off('globalpointermove', handlers.move);
    display.off('pointerup', handlers.up);
    display.off('pointerupoutside', handlers.up);
    this.boundHandlers.delete(element.id);
  }

  destroy(): void {
    for (const element of this.elementManager.getAll()) {
      this.detachListeners(element);
    }
    this.boundHandlers.clear();
  }
}
