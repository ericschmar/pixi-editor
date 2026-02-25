import { Graphics } from 'pixi.js';

export class MarqueeSelect {
  readonly graphics: Graphics;

  constructor() {
    this.graphics = new Graphics();
    this.graphics.visible = false;
  }

  draw(startX: number, startY: number, endX: number, endY: number): void {
    this.graphics.visible = true;
    this.graphics.clear();

    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    this.graphics
      .rect(x, y, w, h)
      .fill({ color: 0x0088ff, alpha: 0.1 })
      .stroke({ color: 0x0088ff, width: 1, alpha: 0.5 });
  }

  getRect(startX: number, startY: number, endX: number, endY: number) {
    return {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
    };
  }

  clear(): void {
    this.graphics.clear();
    this.graphics.visible = false;
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
