import type { BaseElement } from '../elements/BaseElement.ts';
import type { ElementManager } from './ElementManager.ts';

export class ZOrderManager {
  private elementManager: ElementManager;

  constructor(elementManager: ElementManager) {
    this.elementManager = elementManager;
  }

  bringToFront(element: BaseElement): void {
    const maxZ = this.getMaxZIndex();
    element.zIndex = maxZ + 1;
  }

  sendToBack(element: BaseElement): void {
    const minZ = this.getMinZIndex();
    element.zIndex = minZ - 1;
  }

  moveForward(element: BaseElement): void {
    const all = this.getSortedByZ();
    const idx = all.indexOf(element);
    if (idx < 0 || idx >= all.length - 1) return;
    const nextEl = all[idx + 1]!;
    const nextZ = nextEl.zIndex;
    nextEl.zIndex = element.zIndex;
    element.zIndex = nextZ;
  }

  moveBackward(element: BaseElement): void {
    const all = this.getSortedByZ();
    const idx = all.indexOf(element);
    if (idx <= 0) return;
    const prevEl = all[idx - 1]!;
    const prevZ = prevEl.zIndex;
    prevEl.zIndex = element.zIndex;
    element.zIndex = prevZ;
  }

  private getSortedByZ(): BaseElement[] {
    return this.elementManager.getAll().sort((a, b) => a.zIndex - b.zIndex);
  }

  private getMaxZIndex(): number {
    const all = this.elementManager.getAll();
    if (all.length === 0) return 0;
    return Math.max(...all.map(e => e.zIndex));
  }

  private getMinZIndex(): number {
    const all = this.elementManager.getAll();
    if (all.length === 0) return 0;
    return Math.min(...all.map(e => e.zIndex));
  }
}
