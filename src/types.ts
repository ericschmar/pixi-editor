export type FillDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';

/** Where (0, 0) is placed on the canvas.
 *  - `'top-left'` — default; origin is the top-left corner.
 *  - `'center'`   — origin is the center of the canvas.
 */
export type CoordinateOrigin = 'top-left' | 'center';

export type ShapeType = 'line' | 'circle' | 'rectangle' | 'arc';

export type LineCap = 'butt' | 'round' | 'square';

export type ElementType = 'text' | 'image' | 'shape';

export interface SerializedElement {
  type: ElementType;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  zIndex: number;
  visible: boolean;
  interactable: boolean;
  opacity: number;
  [key: string]: unknown;
}

export interface WatchfaceState {
  version: number;
  width: number;
  height: number;
  elements: SerializedElement[];
}

export interface UndoableAction {
  type: string;
  description: string;
  undo(): void;
  redo(): void;
}

export interface HandleConfig {
  color: number;
  fillColor: number;
  size: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
