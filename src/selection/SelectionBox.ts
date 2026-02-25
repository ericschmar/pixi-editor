import { Container, Graphics } from 'pixi.js';
import { TransformHandle } from './TransformHandle.ts';
import type { HandlePosition } from './TransformHandle.ts';
import type { HandleConfig } from '../types.ts';

const HANDLE_POSITIONS: HandlePosition[] = [
  'top-left', 'top-center', 'top-right',
  'middle-right', 'bottom-right', 'bottom-center',
  'bottom-left', 'middle-left',
];

export class SelectionBox {
  readonly container: Container;
  private outline: Graphics;
  private rotationLine: Graphics;
  private handles: TransformHandle[] = [];
  private rotateHandle: TransformHandle;

  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this.outline = new Graphics();
    this.rotationLine = new Graphics();
    this.container.addChild(this.outline);
    this.container.addChild(this.rotationLine);

    for (const pos of HANDLE_POSITIONS) {
      const handle = new TransformHandle(pos);
      this.handles.push(handle);
      this.container.addChild(handle.graphics);
    }

    this.rotateHandle = new TransformHandle('rotate');
    this.container.addChild(this.rotateHandle.graphics);
  }

  show(
    bounds: { x: number; y: number; width: number; height: number },
    config: HandleConfig,
    showRotation: boolean,
  ): void {
    this.container.visible = true;
    const { x, y, width: w, height: h } = bounds;

    // Draw bounding box outline
    this.outline.clear();
    this.outline
      .rect(x, y, w, h)
      .stroke({ color: config.color, width: 1 });

    // Position resize handles
    const positions: { x: number; y: number }[] = [
      { x, y },                       // top-left
      { x: x + w / 2, y },            // top-center
      { x: x + w, y },                // top-right
      { x: x + w, y: y + h / 2 },     // middle-right
      { x: x + w, y: y + h },         // bottom-right
      { x: x + w / 2, y: y + h },     // bottom-center
      { x, y: y + h },                // bottom-left
      { x, y: y + h / 2 },            // middle-left
    ];

    for (let i = 0; i < this.handles.length; i++) {
      this.handles[i]!.show(positions[i]!.x, positions[i]!.y, config);
    }

    // Rotation handle
    this.rotationLine.clear();
    if (showRotation) {
      const rotateY = y - 30;
      this.rotateHandle.show(x + w / 2, rotateY, config);
      this.rotationLine
        .moveTo(x + w / 2, y)
        .lineTo(x + w / 2, rotateY)
        .stroke({ color: config.color, width: 1 });
    } else {
      this.rotateHandle.hide();
    }
  }

  hide(): void {
    this.container.visible = false;
  }

  getHandle(index: number): TransformHandle | undefined {
    return this.handles[index];
  }

  getRotateHandle(): TransformHandle {
    return this.rotateHandle;
  }

  getAllHandles(): TransformHandle[] {
    return [...this.handles, this.rotateHandle];
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
