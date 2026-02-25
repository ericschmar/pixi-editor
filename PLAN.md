# Pixi Watchface Editor Engine — Implementation Plan

## Context
Building a standalone PixiJS v8 watchface editor engine library. The library will be used by a Svelte project but is framework-agnostic. It provides a visual editor for creating watchfaces with elements (text, images, shapes), a plugin system, selection/transform tools, and serialization.

## Tech Stack
- **Runtime/Package Manager:** Bun
- **Language:** TypeScript
- **Rendering:** PixiJS v8 (async init, new Graphics API)
- **No framework dependency** (Svelte-compatible but standalone)

## File Structure

```
pixi-editor/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                        # Barrel export
│   ├── WatchfaceEngine.ts              # Main engine class
│   ├── EventBus.ts                     # Typed event emitter
│   ├── types.ts                        # Shared types/interfaces
│   ├── elements/
│   │   ├── index.ts
│   │   ├── BaseElement.ts              # Abstract base with reactive props
│   │   ├── TextElement.ts
│   │   ├── ImageElement.ts
│   │   ├── ShapeElement.ts             # Static builders: line/circle/rect/arc
│   │   ├── FillMask.ts                 # Fill percentage masking
│   │   └── ElementRegistry.ts          # Type registry for deserialization
│   ├── selection/
│   │   ├── index.ts
│   │   ├── SelectionManager.ts         # Click/shift-click/marquee selection
│   │   ├── SelectionBox.ts             # Bounding box + resize/rotate handles
│   │   ├── TransformHandle.ts          # Individual handle graphics
│   │   ├── MarqueeSelect.ts            # Drag-to-select rectangle
│   │   └── TransformController.ts      # Resize/rotate/move math
│   ├── plugins/
│   │   ├── index.ts
│   │   ├── Plugin.ts                   # Plugin interface
│   │   ├── PluginManager.ts
│   │   ├── GridPlugin.ts               # Grid overlay + snap-to-grid
│   │   ├── AutosavePlugin.ts           # Periodic save via callback
│   │   ├── UndoRedoPlugin.ts           # Action history stack
│   │   └── KeyboardShortcutsPlugin.ts  # Cmd/Ctrl-aware shortcuts
│   ├── managers/
│   │   ├── index.ts
│   │   ├── ElementManager.ts           # Add/remove/reorder elements
│   │   ├── ZOrderManager.ts            # Bring to front/send to back
│   │   ├── InteractionManager.ts       # Pointer event routing to elements
│   │   └── SerializationManager.ts     # JSON serialize/deserialize
│   └── utils/
│       ├── platform.ts                 # OS detection (Cmd vs Ctrl)
│       ├── math.ts                     # Geometry helpers
│       └── uid.ts                      # Unique ID generation
```

## Implementation Steps (in order)

### Step 1: Project Setup
- Initialize Bun project with `bun init`
- Install `pixi.js` dependency
- Configure `tsconfig.json` for library output
- Create `package.json` with proper `main`/`module`/`types` fields

### Step 2: Core Foundation
- `src/types.ts` — All shared types: `FillDirection`, `ShapeType`, `ElementType`, `SerializedElement`, `WatchfaceState`, `UndoableAction`, `HandleConfig`
- `src/EventBus.ts` — Typed event emitter with `on`/`off`/`emit`, returns unsubscribe functions
- `src/utils/uid.ts` — Simple unique ID generator
- `src/utils/platform.ts` — `isMacOS()` detection for Cmd vs Ctrl
- `src/utils/math.ts` — `clamp`, `angleBetweenPoints`, `distanceBetween`

### Step 3: Element System
- `src/elements/BaseElement.ts` — Abstract base class with reactive getter/setter properties (`x`, `y`, `rotation`, `zIndex`, `visible`, `interactable`, `opacity`). Each setter updates the PixiJS container and emits change events. Includes `_suppressActions` check to prevent undo/redo loops.
- `src/elements/FillMask.ts` — Rectangle mask that clips foreground graphics based on fill percentage + direction
- `src/elements/TextElement.ts` — Text with reactive `text`, `fontFamily`, `fontSize`, `fontWeight`, `align`, `color` properties
- `src/elements/ImageElement.ts` — Image with async texture loading, reactive `src`, `width`, `height`
- `src/elements/ShapeElement.ts` — Static builders (`line`, `circle`, `rectangle`, `arc`), dual-graphics (bg + fg) with FillMask, reactive `foregroundColor`, `backgroundColor`, `fillPercentage`, `fillDirection`
- `src/elements/ElementRegistry.ts` — Maps type strings to classes with `fromJSON` static methods

### Step 4: Managers
- `src/managers/ElementManager.ts` — `add()`, `remove()`, `getAll()`, `getById()`, `clear()`. Manages attaching/detaching elements to engine, adding display objects to elements layer
- `src/managers/ZOrderManager.ts` — `bringToFront()`, `sendToBack()`, `moveForward()`, `moveBackward()`
- `src/managers/InteractionManager.ts` — Attaches pointer event listeners to element containers, routes to SelectionManager and TransformController
- `src/managers/SerializationManager.ts` — `serialize()` returns JSON string, `deserialize(json)` restores state. Uses ElementRegistry for type-safe deserialization.

### Step 5: Selection & Transform
- `src/selection/TransformHandle.ts` — Individual handle (small square for resize, circle for rotate) with pointer event handling
- `src/selection/SelectionBox.ts` — Bounding box outline + 8 resize handles + 1 rotation handle, configurable colors
- `src/selection/MarqueeSelect.ts` — Dashed rectangle overlay during drag-to-select
- `src/selection/TransformController.ts` — Math for resize (corner drag), rotate (angle computation), move (delta tracking)
- `src/selection/SelectionManager.ts` — Click/shift-click selection, marquee selection, clipboard (copy/paste), delete, nudge, programmatic select/deselect

### Step 6: Plugin System
- `src/plugins/Plugin.ts` — Interface: `name`, `init(engine)`, `destroy()`, optional `update(deltaTime)`
- `src/plugins/PluginManager.ts` — `register()`, `unregister()`, `get()`, `destroyAll()`
- `src/plugins/GridPlugin.ts` — Draws grid lines on background layer, snap-to-grid on drag events
- `src/plugins/AutosavePlugin.ts` — `setInterval` + developer callback, `saveNow()` method
- `src/plugins/UndoRedoPlugin.ts` — Undo/redo stacks, listens to `action:performed`, uses `_suppressActions` during undo/redo
- `src/plugins/KeyboardShortcutsPlugin.ts` — Window keydown listener, Cmd/Ctrl-aware, wires to undo/redo/copy/paste/delete/select-all/nudge

### Step 7: WatchfaceEngine (Main Orchestrator)
- `src/WatchfaceEngine.ts` — Creates PixiJS Application, layer hierarchy (background/elements/selection/overlay), initializes all managers, exposes public API
- `src/index.ts` — Barrel export of all public types, classes, and interfaces

## Key Architecture Decisions

1. **Reactive getter/setter pattern** — Each property setter updates PixiJS display object + emits EventBus event + records undoable action. `_suppressActions` flag prevents infinite loops during undo/redo.

2. **Dual-graphics + mask for fill percentage** — Background graphics (full shape in bgColor) + foreground graphics (full shape in fgColor) masked by a rectangle computed from fill % and direction. GPU-accelerated via PixiJS stencil buffer.

3. **4-layer Container hierarchy** — `backgroundLayer` (grid), `elementsLayer` (sortableChildren=true), `selectionLayer` (handles/marquee), `overlayLayer` (plugin UI). Prevents z-index conflicts between system UI and user elements.

4. **Static builders on ShapeElement** — `ShapeElement.circle()`, `.rectangle()`, `.line()`, `.arc()` rather than separate classes. Keeps serialization simple (one "shape" type with a `shapeType` discriminator).

5. **Window-level keyboard events** — PixiJS event system is pointer-based. Keyboard shortcuts use `window.addEventListener('keydown')` for reliable behavior.

## Developer API (Usage Example)

```typescript
import { WatchfaceEngine, TextElement, ShapeElement, GridPlugin, UndoRedoPlugin, KeyboardShortcutsPlugin, AutosavePlugin } from 'pixi-watchface-engine';

const engine = new WatchfaceEngine();
await engine.init(canvasContainer, { width: 400, height: 400, background: 0x1a1a2e });

engine.plugins.register(new GridPlugin({ cellSize: 20, snapEnabled: true }));
engine.plugins.register(new UndoRedoPlugin());
engine.plugins.register(new KeyboardShortcutsPlugin());
engine.plugins.register(new AutosavePlugin({ onSave: (json) => saveToServer(json) }));

const title = new TextElement('12:00', 150, 50, { fontSize: 48, fontWeight: 'bold' });
const battery = ShapeElement.rectangle(160, 350, 80, 12);
battery.fillPercentage = 75;
battery.fillDirection = 'left-to-right';

engine.elements.add(title);
engine.elements.add(battery);

// Reactive updates
title.x = 160;  // auto-updates canvas
battery.fillPercentage = 50;  // auto-updates canvas

// Events for Svelte integration
engine.eventBus.on('selection:changed', ({ selected }) => { /* update sidebar */ });
```

## Verification
1. Initialize engine in a test HTML page, verify canvas renders
2. Add each element type, verify they appear correctly
3. Test fill percentage on shapes at 0%, 50%, 100% with all 4 directions
4. Click to select, shift-click multi-select, marquee select
5. Drag to move, corner handles to resize, rotation handle to rotate
6. Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo
7. Ctrl/Cmd+C copy, Ctrl/Cmd+V paste
8. Serialize to JSON, clear, deserialize — verify state restored
9. Grid plugin renders, snap-to-grid works during drag
10. Autosave callback fires on interval
