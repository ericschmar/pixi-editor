# Pixi Watchface Editor Engine — Complete API Reference

## Table of Contents

1. [WatchfaceEngine](#watchfaceengine)
2. [Elements](#elements)
3. [Selection & Transformation](#selection--transformation)
4. [Managers](#managers)
5. [Plugins](#plugins)
6. [Events](#events)
7. [Types](#types)

---

## WatchfaceEngine

Main orchestrator for the watchface editor.

### Constructor

```typescript
const engine = new WatchfaceEngine();
```

### Methods

#### `async init(container: HTMLDivElement, options: WatchfaceEngineOptions): Promise<void>`

Initialize the engine with a canvas container and options.

```typescript
await engine.init(document.getElementById('canvas')!, {
  width: 400,
  height: 400,
  background: 0x1a1a2e,
  selectionHandleColor: 0x0088ff,
  selectionHandleFillColor: 0xffffff,
  selectionHandleSize: 8,
});
```

**Parameters:**
- `container`: HTML element to mount the canvas to
- `options`:
  - `width` (number, required): Canvas width
  - `height` (number, required): Canvas height
  - `background` (number | string, optional): Background color (default: 0x1a1a2e)
  - `selectionHandleColor` (number, optional): Handle outline color (default: 0x0088ff)
  - `selectionHandleFillColor` (number, optional): Handle fill color (default: 0xffffff)
  - `selectionHandleSize` (number, optional): Handle size in pixels (default: 8)

#### `destroy(): void`

Clean up the engine, destroy all plugins and elements.

```typescript
engine.destroy();
```

#### `getBackgroundLayer(): Container`

Get the background layer for custom overlays (e.g., grid).

#### `getElementsLayer(): Container`

Get the elements layer (where user elements are added).

#### `getSelectionLayer(): Container`

Get the selection layer (where selection handles are drawn).

#### `getOverlayLayer(): Container`

Get the overlay layer for plugin UI.

### Properties

#### `app: Application`

The underlying PixiJS Application instance.

```typescript
engine.app.stage;
engine.app.ticker;
engine.app.screen;
```

#### `eventBus: EventBus`

Event emitter for engine lifecycle and user interactions.

```typescript
engine.eventBus.on('element:added', ({ element }) => {});
```

#### `elements: ElementManager`

Manager for adding, removing, and accessing elements.

```typescript
engine.elements.add(element);
engine.elements.remove(element);
engine.elements.getAll();
```

#### `selection: SelectionManager`

Manager for element selection and transformation.

```typescript
engine.selection.select(element);
engine.selection.getSelected();
```

#### `plugins: PluginManager`

Manager for registering and accessing plugins.

```typescript
engine.plugins.register(new GridPlugin());
engine.plugins.get('grid');
```

#### `serialization: SerializationManager`

Manager for JSON serialization and deserialization.

```typescript
const json = engine.serialization.serialize();
await engine.serialization.deserialize(json);
```

#### `zOrder: ZOrderManager`

Manager for element z-ordering (layering).

```typescript
engine.zOrder.bringToFront(element);
```

#### `options: Readonly<WatchfaceEngineOptions>`

Current engine options (read-only).

#### `initialized: boolean`

Whether the engine has been successfully initialized.

#### `_suppressActions: boolean`

**Internal use only.** Used by UndoRedoPlugin to prevent infinite loops.

---

## Elements

### BaseElement (Abstract)

Base class for all elements. Not used directly, but defines the common API.

#### Reactive Properties

These properties trigger change events and record undoable actions when modified:

```typescript
element.x = 100;                    // number
element.y = 200;                    // number
element.rotation = Math.PI / 4;     // radians
element.zIndex = 5;                 // integer
element.visible = true;             // boolean
element.interactable = true;        // boolean (false = not selectable)
element.opacity = 0.8;              // 0-1
element.width = 100;                // number (element-specific)
element.height = 200;               // number (element-specific)
```

#### Methods

```typescript
element.getDisplayObject(): Container;
element.toJSON(): SerializedElement;
element.applyJSON(data: SerializedElement): void;
```

### TextElement

Text element with styling support.

#### Constructor

```typescript
const text = new TextElement(
  'Hello World',  // text content
  100,            // x position
  200,            // y position
  {               // optional style
    fontFamily: 'Arial',
    fontSize: 24,
    fontWeight: 'bold',        // 'normal' | 'bold' | 'bolder' | 'lighter' | '100' | ... | '900'
    align: 'center',           // 'left' | 'center' | 'right'
    color: 0xffffff,           // hex color
  }
);

engine.elements.add(text);
```

#### Properties

```typescript
text.text = 'New text';
text.fontFamily = 'Georgia';
text.fontSize = 32;
text.fontWeight = 'bold';
text.align = 'center';
text.color = 0xff0000;
```

All base element properties are also available:
```typescript
text.x = 150;
text.y = 250;
text.rotation = 0;
text.zIndex = 1;
text.visible = true;
text.interactable = true;
text.opacity = 1;
text.width;   // read-only, determined by text content
text.height;  // read-only, determined by text content
```

### ImageElement

Image element with async texture loading.

#### Constructor

```typescript
const image = new ImageElement(
  '/path/to/image.png',  // image URL or path
  100,                   // x position
  200,                   // y position
);

engine.elements.add(image);
```

#### Properties

```typescript
image.src = '/new/image.png';  // async loads new texture
image.width = 100;
image.height = 100;
image.loaded;  // boolean, whether texture is loaded

// All base element properties
image.x = 150;
image.y = 250;
image.rotation = 0.5;
image.zIndex = 2;
image.visible = true;
image.interactable = true;
image.opacity = 0.9;
```

### ShapeElement

Shape element with configurable fill percentage and direction.

#### Static Builders

```typescript
// Line from (x1, y1) to (x2, y2)
ShapeElement.line(x1, y1, x2, y2);

// Circle at (cx, cy) with radius
ShapeElement.circle(cx, cy, radius);

// Rectangle at (x, y) with width and height
ShapeElement.rectangle(x, y, width, height);

// Arc at (cx, cy) with radius from startAngle to endAngle
ShapeElement.arc(cx, cy, radius, startAngle, endAngle);
```

#### Constructor Options

```typescript
const shape = ShapeElement.circle(200, 200, 100);
// Customize via properties
shape.foregroundColor = 0xffffff;
shape.backgroundColor = 0x333333;
shape.fillPercentage = 75;
shape.fillDirection = 'left-to-right';
shape.strokeWidth = 2;
```

#### Properties

```typescript
shape.foregroundColor = 0xffffff;      // foreground fill color (hex)
shape.backgroundColor = 0x333333;      // background fill color (hex)
shape.fillPercentage = 75;             // 0-100, percentage of shape filled
shape.fillDirection = 'left-to-right'; // 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'
shape.strokeWidth = 2;                 // for lines and arcs
shape.shapeType;                       // read-only: 'line' | 'circle' | 'rectangle' | 'arc'

// Fill percentage example:
// foregroundColor fills the specified percentage in the specified direction
// backgroundColor fills the remainder
//
// Circle at 50% fill (left-to-right):
//   |██████|     |
//   |foreground  background|
```

All base element properties are also available:
```typescript
shape.x = 150;
shape.y = 250;
shape.rotation = Math.PI / 6;
shape.zIndex = 3;
shape.visible = true;
shape.interactable = true;
shape.opacity = 0.8;
shape.width;   // derived from shape parameters
shape.height;  // derived from shape parameters
```

---

## Selection & Transformation

### SelectionManager

Manages element selection, clipboard, and user transformations.

#### Selection Methods

```typescript
// Single select (deselects others)
engine.selection.select(element);

// Add to selection (multi-select)
engine.selection.addToSelection(element);

// Remove from selection
engine.selection.deselect(element);

// Clear all selections
engine.selection.clearSelection();

// Select all interactable elements
engine.selection.selectAll();

// Get currently selected elements
const selected = engine.selection.getSelected();  // BaseElement[]

// Check if element is selected
if (engine.selection.isSelected(element)) { }
```

#### Clipboard

```typescript
// Copy selected elements (as serialized JSON)
engine.selection.copySelected();

// Paste from clipboard (offset by 20px)
engine.selection.pasteClipboard();
```

#### Deletion & Movement

```typescript
// Delete all selected elements
engine.selection.deleteSelected();

// Nudge selected elements by dx, dy
engine.selection.nudgeSelected(10, 20);  // 10px right, 20px down
```

#### User Interactions (Automatic)

- **Click**: Select single element
- **Shift+Click**: Toggle selection
- **Drag**: Move selected elements (if already selected)
- **Drag (on empty canvas)**: Marquee select multiple elements
- **Drag corner handle**: Resize selected element
- **Drag rotation handle**: Rotate selected element
- **Ctrl/Cmd+C**: Copy selected
- **Ctrl/Cmd+V**: Paste
- **Delete/Backspace**: Delete selected
- **Arrow keys**: Nudge selected (Shift for 10px)

---

## Managers

### ElementManager

Manages element lifecycle.

```typescript
engine.elements.add(element);              // Add element
engine.elements.remove(element);           // Remove element
engine.elements.getById(id);               // Get by ID
engine.elements.getAll();                  // Get all elements
engine.elements.clear();                   // Remove all elements
engine.elements.count;                     // Number of elements
```

### ZOrderManager

Manages element z-ordering (layering).

```typescript
engine.zOrder.bringToFront(element);       // Move to highest z-index
engine.zOrder.sendToBack(element);         // Move to lowest z-index
engine.zOrder.moveForward(element);        // Increase z-index by 1
engine.zOrder.moveBackward(element);       // Decrease z-index by 1
```

### SerializationManager

Serializes and deserializes watchface state to/from JSON.

```typescript
// Export to JSON string
const json = engine.serialization.serialize();

// Import from JSON string
await engine.serialization.deserialize(json);

// Deserialize single element
const element = engine.serialization.deserializeElement(data);

// Get the element registry (for custom element types)
const registry = engine.serialization.getRegistry();
```

### InteractionManager

**Internal use.** Routes pointer events from elements to SelectionManager.

---

## Plugins

### Plugin Interface

All plugins must implement:

```typescript
interface Plugin {
  readonly name: string;
  init(engine: WatchfaceEngine): void;
  destroy(): void;
  update?(deltaTime: number): void;
}
```

### PluginManager

```typescript
// Register plugin
engine.plugins.register(new GridPlugin());

// Unregister plugin
engine.plugins.unregister('grid');

// Get plugin by name
const grid = engine.plugins.get<GridPlugin>('grid');

// Check if plugin is registered
if (engine.plugins.has('grid')) { }

// Destroy all plugins
engine.plugins.destroyAll();
```

### GridPlugin

Grid overlay with optional snap-to-grid.

```typescript
engine.plugins.register(new GridPlugin({
  cellSize: 20,      // Cell size in pixels (default: 20)
  color: 0x444444,   // Grid line color (default: 0x444444)
  opacity: 0.3,      // Grid opacity (default: 0.3)
  snapEnabled: false, // Enable snap-to-grid (default: false)
  visible: true,     // Show grid (default: true)
}));

const grid = engine.plugins.get<GridPlugin>('grid');
grid.cellSize = 10;
grid.snapEnabled = true;
grid.visible = false;
```

### AutosavePlugin

Periodically save watchface to JSON via callback.

```typescript
engine.plugins.register(new AutosavePlugin({
  intervalMs: 30000,                    // Save interval in ms (default: 30000)
  onSave: async (json) => {
    await fetch('/api/save', { 
      method: 'POST', 
      body: json 
    });
  },
}));

const autosave = engine.plugins.get<AutosavePlugin>('autosave');
autosave.saveNow();  // Force save immediately
```

### UndoRedoPlugin

Undo/redo support for all actions.

```typescript
engine.plugins.register(new UndoRedoPlugin({
  maxHistory: 100,  // Maximum undo steps (default: 100)
}));

const ur = engine.plugins.get<UndoRedoPlugin>('undoredo');
ur.undo();
ur.redo();
ur.canUndo;  // boolean
ur.canRedo;  // boolean
ur.clear();  // Clear history
```

### KeyboardShortcutsPlugin

Keyboard shortcuts. Automatically detects platform (Cmd on macOS, Ctrl elsewhere).

```typescript
engine.plugins.register(new KeyboardShortcutsPlugin());

// Shortcuts:
// Ctrl/Cmd+Z              → Undo
// Ctrl/Cmd+Shift+Z        → Redo
// Ctrl/Cmd+C              → Copy selected
// Ctrl/Cmd+V              → Paste
// Ctrl/Cmd+A              → Select all
// Delete/Backspace        → Delete selected
// Arrow keys              → Nudge selected (1px)
// Shift+Arrow keys        → Nudge selected (10px)
```

### Custom Plugin Example

```typescript
import type { Plugin } from 'pixi-watchface-engine';

class LoggerPlugin implements Plugin {
  readonly name = 'logger';
  private unsub?: () => void;

  init(engine: WatchfaceEngine): void {
    this.unsub = engine.eventBus.on('element:added', ({ element }) => {
      console.log('Element added:', element.type, element.id);
    });
  }

  destroy(): void {
    this.unsub?.();
  }

  update?(deltaTime: number): void {
    // Called once per frame
  }
}

engine.plugins.register(new LoggerPlugin());
```

---

## Events

### EventBus

All events go through `engine.eventBus`:

```typescript
engine.eventBus.on(event, handler);    // Subscribe
engine.eventBus.off(event, handler);   // Unsubscribe
engine.eventBus.emit(event, data);     // Emit (internal)

// Returns unsubscribe function
const unsub = engine.eventBus.on('element:added', ({ element }) => {});
unsub();  // Unsubscribe
```

### Available Events

#### Element Lifecycle

```typescript
engine.eventBus.on('element:added', ({ element }) => {});
engine.eventBus.on('element:removed', ({ element }) => {});
engine.eventBus.on('element:changed', ({ element, property, oldValue, newValue }) => {});
engine.eventBus.on('element:zChanged', ({ element, oldZ, newZ }) => {});
```

#### Selection

```typescript
engine.eventBus.on('selection:changed', ({ selected }) => {
  // selected: BaseElement[]
});
engine.eventBus.on('selection:cleared', () => {});
```

#### Interaction

```typescript
engine.eventBus.on('interaction:dragStart', ({ element, position }) => {
  // position: { x: number, y: number }
});
engine.eventBus.on('interaction:dragMove', ({ elements, dx, dy }) => {
  // elements: BaseElement[]
  // dx, dy: number
});
engine.eventBus.on('interaction:dragEnd', ({ elements }) => {});

engine.eventBus.on('interaction:resizeStart', ({ element }) => {});
engine.eventBus.on('interaction:resizeEnd', ({ element }) => {});

engine.eventBus.on('interaction:rotateStart', ({ element }) => {});
engine.eventBus.on('interaction:rotateEnd', ({ element }) => {});
```

#### Serialization

```typescript
engine.eventBus.on('state:saved', ({ json }) => {});
engine.eventBus.on('state:loaded', ({ json }) => {});
```

#### Actions (for UndoRedo integration)

```typescript
engine.eventBus.on('action:performed', ({ action }) => {
  // action: { type: string, description: string, undo(), redo() }
});
```

#### Engine Lifecycle

```typescript
engine.eventBus.on('engine:ready', () => {});
engine.eventBus.on('engine:destroy', () => {});
```

---

## Types

### WatchfaceEngineOptions

```typescript
interface WatchfaceEngineOptions {
  width: number;
  height: number;
  background?: string | number;
  selectionHandleColor?: number;
  selectionHandleFillColor?: number;
  selectionHandleSize?: number;
}
```

### SerializedElement

Represents an element in JSON form.

```typescript
interface SerializedElement {
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
  [key: string]: unknown;  // Element-specific fields
}
```

### WatchfaceState

Complete watchface state (suitable for export/import).

```typescript
interface WatchfaceState {
  version: number;
  width: number;
  height: number;
  elements: SerializedElement[];
}
```

### Type Aliases

```typescript
type FillDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';
type ShapeType = 'line' | 'circle' | 'rectangle' | 'arc';
type ElementType = 'text' | 'image' | 'shape';

interface HandleConfig {
  color: number;
  fillColor: number;
  size: number;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

---

## Complete Example

```typescript
import {
  WatchfaceEngine,
  TextElement,
  ImageElement,
  ShapeElement,
  GridPlugin,
  AutosavePlugin,
  UndoRedoPlugin,
  KeyboardShortcutsPlugin,
} from 'pixi-watchface-engine';

// Create and initialize engine
const engine = new WatchfaceEngine();
await engine.init(document.getElementById('canvas')!, {
  width: 400,
  height: 400,
  background: 0x1a1a2e,
  selectionHandleColor: 0x0088ff,
});

// Register plugins
engine.plugins.register(new GridPlugin({ snapEnabled: true }));
engine.plugins.register(new AutosavePlugin({
  onSave: (json) => localStorage.setItem('watchface', json),
}));
engine.plugins.register(new UndoRedoPlugin());
engine.plugins.register(new KeyboardShortcutsPlugin());

// Create elements
const background = ShapeElement.circle(200, 200, 180);
background.interactable = false;
background.foregroundColor = 0x2d2d5e;
engine.elements.add(background);

const timeText = new TextElement('12:00', 150, 170, {
  fontSize: 48,
  fontWeight: 'bold',
  color: 0xffffff,
  align: 'center',
});
engine.elements.add(timeText);

const battery = ShapeElement.rectangle(160, 350, 80, 12);
battery.foregroundColor = 0x00ff88;
battery.backgroundColor = 0x333333;
battery.fillPercentage = 75;
battery.fillDirection = 'left-to-right';
engine.elements.add(battery);

// Listen to events
engine.eventBus.on('selection:changed', ({ selected }) => {
  console.log('Selected:', selected.map(el => el.id));
});

// Cleanup
engine.destroy();
```
