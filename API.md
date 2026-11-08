# Pixi Watchface Editor Engine — Complete API Reference

## Table of Contents

1. [WatchfaceEngine](#watchfaceengine)
2. [Elements](#elements)
3. [Selection & Transformation](#selection--transformation)
4. [Managers](#managers)
5. [Plugins](#plugins)
6. [Events](#events)
7. [Types](#types)
8. [Display Geometry](#display-geometry)

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
element.metadata = { app: { tag: 'example' } }; // ElementMetadata | undefined
```

#### Methods

```typescript
element.getDisplayObject(): Container;
element.toJSON(): SerializedElement;
element.applyJSON(data: SerializedElement): void;
```

`id` is stable for an element's lifetime. Built-in `fromJSON` codecs retain the saved
ID; `applyJSON` never changes an existing ID. Missing legacy fields retain constructor
defaults. Common canonical fields, metadata and display scales round-trip through all
built-in codecs. Clipboard snapshots isolate metadata; each paste uses a new ID.

#### Opaque metadata

`metadata: ElementMetadata | undefined` is optional application-owned JSON data. Setting
`undefined` removes it. Assignment, getters, serialization and automatic history actions
each take defensive deep copies, so mutating an input, returned object or event payload
cannot mutate canonical data or history. Metadata changes are ordinary authoring changes.
The root must be a plain JSON object; nested plain objects, dense arrays, strings,
booleans, null and finite numbers are accepted. Cycles, accessors, symbols, functions,
undefined members, non-finite numbers and non-JSON class instances throw `TypeError`
without changing metadata. No engine semantics are inferred from metadata keys.

#### Transient presentation

```typescript
element.setPresentation({ rotationOffset: Math.PI / 2, visible: false }): void;
element.clearPresentation(): void;
element.effectiveRotation; // canonical rotation + offset (default 0)
element.effectiveVisible;  // canonical visible AND override (default true)
```

`setPresentation(presentation: ElementPresentation): void` merges supplied fields;
omitted/undefined fields leave existing overrides alone. Rotation offsets must be finite
radians and visibility overrides must be boolean. `clearPresentation()` removes all
overrides. Canonical rotation/visibility getters, `toJSON`, autosave and history remain
unchanged; authoring setters continue to compose with any override. Only the
`element:presentationChanged` notification fires for an actual override change. Selection
visuals do not yet subscribe to this notification; presentation-aware selection geometry
is a separate phase. This is not a pivot or animation controller API.

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
text.width = 120;  // explicit layout width; boxWidth = null restores automatic width
text.height = 50;  // explicit layout height; boxHeight = null restores automatic height
text.boxWidth;    // number | null
text.boxHeight;   // number | null
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
image.loaded;  // read-only boolean, whether the current texture request completed
image.pivot = { x: 0.25, y: 0.8 };  // normalized anchor, default { x: 0, y: 0 }
image.getLocalBounds(); // { x: -25, y: -80, width: 100, height: 100 }
await image.whenLoaded(); // readiness of the CURRENT source generation

// All base element properties
image.x = 150;
image.y = 250;
image.rotation = 0.5;
image.zIndex = 2;
image.visible = true;
image.interactable = true;
image.opacity = 0.9;
```

`pivot: ImagePivot` is a normalized `{ x, y }` anchor; both coordinates must be finite
numbers in `[0, 1]`. Assignment validates before changing anything and the getter returns
a defensive copy. `x`/`y` always identify the authored rotation origin, not the image's
top-left corner. The sprite anchor and `getLocalBounds(): Bounds` reflect the pivot:
`{ x: -pivot.x * width, y: -pivot.y * height, width, height }`. Changing pivot is a
normal undoable property edit. Canonical JSON includes a copied `pivot`; legacy JSON
without one restores the default `(0, 0)`.

Image codecs restore authored width/height (including explicit zero) before asynchronous
loading. Authored dimensions survive texture completion, source changes, restore and
clipboard operations; only unauthored axes adopt natural image dimensions. Dimensions
must be finite and nonnegative. Completion emits `element:resourceChanged` with
`property: 'loaded'`, never an authoring action or history entry.

`whenLoaded(): Promise<void>` captures the source generation current when called. It
resolves after that generation installs its texture and dimensions, or rejects on load
failure, supersession, removal during loading, or disposal. Call it again after changing
`src` to await the new generation. Ignoring readiness is safe: eager load failures never
produce unhandled promise rejections. Old callbacks cannot modify replaced or disposed
instances. Removing an image cancels in-flight work; reattaching it restarts loading if
necessary, so normal undo/re-add remains supported.

`dispose(): void` permanently cancels loading, rejects readiness and releases the display
tree and privately owned textures; it is idempotent. Destroying the image's display
container also disposes it. Detached images retain already loaded textures for undo;
call `dispose()` when permanently retiring standalone/detached instances. Source
replacement releases the previous privately owned texture after the new one is installed.
No shared cached texture (including Pixi's `Texture.EMPTY`) is destroyed.

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

// Filled polygon at authored rotation origin (x, y), using LOCAL x/y pairs
ShapeElement.polygon(x, y, [-8, 6, 4, 6, 4, -24, -8, -24]);
```

`polygon(x: number, y: number, points: number[]): ShapeElement` requires a finite
origin and at least three finite vertex pairs with finite, nonzero bounds and nonzero
signed area. Invalid geometry throws before mutation. Local negative coordinates are
preserved: the example has local bounds `{ x: -8, y: -24, width: 12, height: 30 }`,
without shifting its authored origin. The input, `points` getter and serialized
`shapeParams.points` are defensive copies. `shapeType` is `'polygon'`; document and
clipboard codecs preserve its points, style, metadata and standard identity rules.

Assigning `polygon.points` is undoable via the normal history stack. Setting positive,
finite `width` or `height` scales the corresponding local vertex coordinates about
`(0, 0)`; it does not move `x`/`y`. Zero/negative/nonfinite sizes are rejected to keep
the polygon nondegenerate. Fill percentage/direction use its actual local bounds,
including negative coordinates. Existing shape factories and their defaults are unchanged.

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

`deserialize(json: string): void` is synchronous. Version-1 output and stable ascending
z-index serialization order are unchanged. Before clearing the live document, import
validates the envelope, common fields, metadata, built-in shape/text/image payloads and
unique non-empty IDs, then constructs all elements. Validation/constructor errors leave
the previous document and selection untouched. A missing version means version 1;
missing canvas dimensions and optional legacy element fields are accepted, and missing
IDs are generated. Explicit unsupported versions and malformed fields are rejected.
Unknown element types still warn and are skipped for compatibility. Canvas dimensions
remain descriptive; loading does not resize the engine. This preflight is not rollback
for errors thrown by application event listeners during final installation, nor validation
of custom type-specific payloads. Existing history is not automatically cleared on import;
applications replacing documents should explicitly clear history after success.

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

#### Synchronous history scopes

```typescript
ur.suspend<T>(fn: () => T): T;
ur.batch<T>(description: string, fn: () => T): T;

ur.suspend(() => { element.rotation = 1; });
ur.batch('Edit objects', () => {
  first.x += 10;
  second.x += 10;
});
```

- `suspend` is synchronous, nestable and exception-safe. It suppresses recording of both
  automatic property actions and explicit `action:performed` actions without clearing redo.
  Canonical `element:changed` events still fire. It does not restore edited state.
- `batch` collects existing automatic and explicit `UndoableAction`s into one history
  entry, undoing in reverse order and redoing in forward order. It returns the callback's
  result. An empty batch changes neither stack. Nested batches join the outer batch;
  they are not independent savepoints (a caught inner error remains part of the outer batch).
- An escaping callback error reverses recorded actions under suspension, leaves the
  existing undo/redo stacks intact and rethrows. If rollback itself fails, an `AggregateError`
  contains the callback and rollback errors. A batch inside suspension does not record or
  roll back unrecorded edits. Do not pass async callbacks: scopes cover the synchronous
  callback execution only, not later promise continuations.
- Successful non-empty recording clears redo. `maxHistory` is a non-negative integer
  (default 100; zero disables stored undo steps); a batch counts as one step.
- Undo/redo move an action between stacks only after its callback succeeds. Throws retain
  the action on its original stack and always restore suppression. `undo`, `redo` and
  `clear` cannot be called inside a batch or another undo/redo callback.

**Reversible-action contract:** actions describe already-performed work. Their synchronous
`undo`/`redo` callbacks must faithfully reverse/reapply their own state, including any
application sidecar, and should not partially mutate then throw. History cannot magically
roll back arbitrary external side effects or a partially failing callback. The engine only
rolls back recorded actions, not arbitrary callback mutations. Exceptions from canonical
change listeners can interrupt recording and are the application's responsibility.

`ElementManager.add/remove` remain deliberately non-recording. For a compound insertion,
perform the add/remove and sidecar changes, then emit one explicit `action:performed`
action with matching inverse callbacks. This mechanism remains compatible with batches
and suspension; subsequent ordinary property edits are separate undo steps. A batch by
itself does not make unrecorded element additions undoable.

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
engine.eventBus.on('element:presentationChanged', ({ element }) => {});
engine.eventBus.on('element:resourceChanged', ({ element, property, oldValue, newValue }) => {});
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
  metadata?: ElementMetadata;
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
type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
type ElementMetadata = { [key: string]: JSONValue };
interface ElementPresentation {
  rotationOffset?: number;
  visible?: boolean;
}

type FillDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';
type ShapeType = 'line' | 'circle' | 'rectangle' | 'arc' | 'polygon';
interface ImagePivot {
  x: number; // finite, normalized [0, 1]
  y: number; // finite, normalized [0, 1]
}
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

## Display Geometry

Display geometry describes the face's logical shape and dimensions separately
from the editor's pixel dimensions. The geometry helpers are device-independent;
they accept circular and rectangular profiles without inferring a shape.

```typescript
const geometry = { shape: 'rectangle', width: 448, height: 486 } as const;
const fitted = fitDisplayGeometry(geometry, {
  x: 0, y: 0, width: 600, height: 600, // editor bounds, not logical face size
});
const editorPoint = displayToViewportPoint(
  { x: 224, y: 243 }, geometry, fitted,
);
const hit = isPointInDisplay({ x: 0, y: 0 }, geometry); // true for rectangles
```

`fitDisplayGeometry` centers the logical display in editor bounds and uses one
uniform scale. `displayToViewportPoint` and `viewportToDisplayPoint` convert
coordinates while preserving either the default `top-left` or `center` origin.
`isPointInDisplay` uses rectangular bounds or the circular visible boundary.
`createDisplayMask` creates a Pixi `Graphics` mask for the same shape;
`applyDisplayMask` attaches one to a container and returns it for cleanup.
Circular profiles must have equal positive width and height. Invalid dimensions
and unknown shapes throw instead of silently selecting a default.

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
