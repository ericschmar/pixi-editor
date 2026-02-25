import { Graphics } from 'pixi.js';
import type { Bounds, FillDirection } from '../types.ts';
import { clamp } from '../utils/math.ts';

export class FillMask {
  private maskGraphics: Graphics;

  constructor() {
    this.maskGraphics = new Graphics();
  }

  getMaskGraphics(): Graphics {
    return this.maskGraphics;
  }

  update(bounds: Bounds, fillPercentage: number, direction: FillDirection): void {
    this.maskGraphics.clear();
    const pct = clamp(fillPercentage, 0, 100) / 100;

    let maskX = bounds.x;
    let maskY = bounds.y;
    let maskW = bounds.width;
    let maskH = bounds.height;

    switch (direction) {
      case 'left-to-right':
        maskW = bounds.width * pct;
        break;
      case 'right-to-left':
        maskW = bounds.width * pct;
        maskX = bounds.x + bounds.width - maskW;
        break;
      case 'top-to-bottom':
        maskH = bounds.height * pct;
        break;
      case 'bottom-to-top':
        maskH = bounds.height * pct;
        maskY = bounds.y + bounds.height - maskH;
        break;
    }

    this.maskGraphics.rect(maskX, maskY, maskW, maskH).fill({ color: 0xffffff });
  }

  destroy(): void {
    this.maskGraphics.destroy();
  }
}
