import { Graphics } from "pixi.js";
import type { Plugin } from "./Plugin.ts";
import type { WatchfaceEngine } from "../WatchfaceEngine.ts";
import type { BaseElement } from "../elements/BaseElement.ts";
import type { ViewportPlugin } from "./ViewportPlugin.ts";

export interface AlignmentGuidesPluginOptions {
  /** Guide line color. Default: 0xff3366 */
  color?: number;
  /** Guide line opacity. Default: 0.85 */
  opacity?: number;
  /** Snap threshold in world-space pixels — how close the center must be to axis to show a guide. Default: 4 */
  threshold?: number;
}

const DEFAULTS: Required<AlignmentGuidesPluginOptions> = {
  color: 0xff3366,
  opacity: 0.85,
  threshold: 0,
};

export class AlignmentGuidesPlugin implements Plugin {
  readonly name = "alignmentGuides";

  private engine!: WatchfaceEngine;
  private graphics!: Graphics;
  private options: Required<AlignmentGuidesPluginOptions>;
  private unsubscribers: (() => void)[] = [];

  constructor(options?: AlignmentGuidesPluginOptions) {
    this.options = { ...DEFAULTS, ...options };
  }

  init(engine: WatchfaceEngine): void {
    this.engine = engine;

    this.graphics = new Graphics();
    this.graphics.alpha = this.options.opacity;
    this.graphics.visible = false;

    // Drawn in screen space on top of everything else
    engine.app.stage.addChild(this.graphics);

    const bus = engine.eventBus;

    // Show guides while dragging
    this.unsubscribers.push(
      bus.on("interaction:dragMove", ({ elements }) => {
        this.drawGuides(elements);
      }),
      // Hide once drag ends
      bus.on("interaction:dragEnd", () => {
        this.hide();
      }),
      // Also show during resize / rotate in case the element's center moves
      bus.on("interaction:resizeEnd", () => {
        this.hide();
      }),
      bus.on("interaction:rotateEnd", () => {
        this.hide();
      }),
    );
  }

  private hide(): void {
    this.graphics.clear();
    this.graphics.visible = false;
  }

  /**
   * Compute the screen-space position of an element's bounding-box center.
   * We replicate the same bounds logic as SelectionManager.computeCombinedBounds
   * (world space) then convert to screen space using the viewport transform.
   */
  private elementCenterInWorld(elements: BaseElement[]): {
    cx: number;
    cy: number;
  } {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of elements) {
      const b = el.getDisplayObject().getLocalBounds();
      const wx = el.x + b.x;
      const wy = el.y + b.y;
      minX = Math.min(minX, wx);
      minY = Math.min(minY, wy);
      maxX = Math.max(maxX, wx + b.width);
      maxY = Math.max(maxY, wy + b.height);
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  private drawGuides(elements: BaseElement[]): void {
    if (elements.length === 0) {
      this.hide();
      return;
    }

    const { width, height } = this.engine.options;

    // Get viewport transform for screen-space rendering
    const viewportPlugin = this.engine.plugins.get("viewport") as
      | ViewportPlugin
      | undefined;
    const viewport = viewportPlugin?.viewport;
    const scale = viewport?.scale.x ?? 1;
    const panX = viewport?.x ?? 0;
    const panY = viewport?.y ?? 0;

    // Origin offset (center vs top-left)
    const { x: ox, y: oy } = this.engine.originOffset;

    // Canvas center in world space (relative to contentRoot) is (0, 0) for center
    // origin, or (width/2, height/2) for top-left origin.
    const canvasCenterWorld =
      this.engine.options.coordinateOrigin === "center"
        ? { x: 0, y: 0 }
        : { x: width / 2, y: height / 2 };

    const { cx, cy } = this.elementCenterInWorld(elements);

    const diffX = Math.abs(cx - canvasCenterWorld.x);
    const diffY = Math.abs(cy - canvasCenterWorld.y);

    const showH = diffY <= this.options.threshold;
    const showV = diffX <= this.options.threshold;

    if (!showH && !showV) {
      this.hide();
      return;
    }

    this.graphics.clear();
    this.graphics.visible = true;

    const { color } = this.options;

    // Convert world-space canvas bounds to screen space for drawing the guide lines.
    // canvas left/right/top/bottom in world coords (relative to contentRoot)
    const worldLeft =
      this.engine.options.coordinateOrigin === "center" ? -width / 2 : 0;
    const worldRight =
      this.engine.options.coordinateOrigin === "center" ? width / 2 : width;
    const worldTop =
      this.engine.options.coordinateOrigin === "center" ? -height / 2 : 0;
    const worldBottom =
      this.engine.options.coordinateOrigin === "center" ? height / 2 : height;

    // world → screen: screenX = panX + (worldX + ox) * scale
    const toScreenX = (wx: number) => panX + (wx + ox) * scale;
    const toScreenY = (wy: number) => panY + (wy + oy) * scale;

    if (showH) {
      // Horizontal center guide: full width of canvas at the element's Y center
      const screenY = toScreenY(canvasCenterWorld.y);
      const screenLeft = toScreenX(worldLeft);
      const screenRight = toScreenX(worldRight);
      this.graphics
        .moveTo(screenLeft, screenY)
        .lineTo(screenRight, screenY)
        .stroke({ color, width: 1 });
    }

    if (showV) {
      // Vertical center guide: full height of canvas at the element's X center
      const screenX = toScreenX(canvasCenterWorld.x);
      const screenTop = toScreenY(worldTop);
      const screenBottom = toScreenY(worldBottom);
      this.graphics
        .moveTo(screenX, screenTop)
        .lineTo(screenX, screenBottom)
        .stroke({ color, width: 1 });
    }
  }

  destroy(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.graphics.destroy();
  }
}
