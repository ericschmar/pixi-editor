// Engine
export { WatchfaceEngine } from './WatchfaceEngine.ts';
export type { WatchfaceEngineOptions } from './WatchfaceEngine.ts';

// Elements
export { BaseElement } from './elements/BaseElement.ts';
export { TextElement } from './elements/TextElement.ts';
export type { TextElementStyle } from './elements/TextElement.ts';
export { ImageElement } from './elements/ImageElement.ts';
export { ShapeElement } from './elements/ShapeElement.ts';
export { FillMask } from './elements/FillMask.ts';
export { ElementRegistry } from './elements/ElementRegistry.ts';

// Plugins
export type { Plugin } from './plugins/Plugin.ts';
export { PluginManager } from './plugins/PluginManager.ts';
export { GridPlugin } from './plugins/GridPlugin.ts';
export type { GridPluginOptions } from './plugins/GridPlugin.ts';
export { AutosavePlugin } from './plugins/AutosavePlugin.ts';
export type { AutosavePluginOptions } from './plugins/AutosavePlugin.ts';
export { UndoRedoPlugin } from './plugins/UndoRedoPlugin.ts';
export type { UndoRedoPluginOptions } from './plugins/UndoRedoPlugin.ts';
export { KeyboardShortcutsPlugin } from './plugins/KeyboardShortcutsPlugin.ts';

// Managers
export { ElementManager } from './managers/ElementManager.ts';
export { ZOrderManager } from './managers/ZOrderManager.ts';
export { SelectionManager } from './selection/SelectionManager.ts';
export { SerializationManager } from './managers/SerializationManager.ts';

// Types
export type {
  FillDirection,
  ShapeType,
  ElementType,
  SerializedElement,
  WatchfaceState,
  UndoableAction,
  HandleConfig,
  Bounds,
} from './types.ts';

// EventBus
export { EventBus } from './EventBus.ts';
export type { EngineEventMap } from './EventBus.ts';
