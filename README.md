# Pixi Watchface Editor Engine

A standalone PixiJS v8 watchface editor library with a visual editor, plugin system, and intuitive developer API. Framework-agnostic (works with Svelte, React, vanilla JS).

## Features

- 🎨 **Visual Editor** — Click, drag, resize, rotate watchface elements
- 🔌 **Plugin System** — Grid, autosave, undo/redo, keyboard shortcuts
- 📦 **Rich Elements** — Text, images, shapes (line, circle, rectangle, arc)
- ⚙️ **Fill Percentage** — Configurable fill direction for shape elements
- ✏️ **Reactive Properties** — Setting `element.x = 500` auto-updates the canvas
- 🔄 **Full Serialization** — Export/import watchfaces as JSON
- ⌨️ **Keyboard Shortcuts** — Cmd/Ctrl-aware (macOS/Windows), copy/paste, undo/redo
- 🎯 **Z-Ordering** — Bring to front, send to back
- 📋 **Multi-Select** — Click, Shift+Click, drag-to-select marquee

## Quick Start

```typescript
import {
  WatchfaceEngine,
  TextElement,
  ShapeElement,
  GridPlugin,
  UndoRedoPlugin,
  KeyboardShortcutsPlugin,
} from 'pixi-watchface-engine';

const engine = new WatchfaceEngine();
await engine.init(document.getElementById('canvas')!, {
  width: 400,
  height: 400,
  background: 0x1a1a2e,
});

// Register plugins
engine.plugins.register(new GridPlugin({ snapEnabled: true }));
engine.plugins.register(new UndoRedoPlugin());
engine.plugins.register(new KeyboardShortcutsPlugin());

// Add elements
const text = new TextElement('12:00', 150, 170, { fontSize: 48 });
engine.elements.add(text);

const battery = ShapeElement.rectangle(160, 350, 80, 12);
battery.fillPercentage = 75;
battery.foregroundColor = 0x00ff88;
engine.elements.add(battery);

// Reactive updates
text.x = 160;  // Auto-updates canvas
battery.fillPercentage = 50;
```

## Elements

### TextElement
```typescript
const text = new TextElement('Hello', x, y, {
  fontFamily: 'Arial',
  fontSize: 24,
  fontWeight: 'bold',
  align: 'center',
  color: 0xffffff,
});
```

### ImageElement
```typescript
const image = new ImageElement('/assets/logo.png', x, y);
image.width = 100;
image.height = 100;
```

### ShapeElement
```typescript
ShapeElement.line(x1, y1, x2, y2);
ShapeElement.circle(cx, cy, radius);
ShapeElement.rectangle(x, y, width, height);
ShapeElement.arc(cx, cy, radius, startAngle, endAngle);

// Shape properties
shape.foregroundColor = 0xffffff;
shape.backgroundColor = 0x333333;
shape.fillPercentage = 75;  // 0-100
shape.fillDirection = 'left-to-right';  // or right-to-left, top-to-bottom, bottom-to-top
shape.strokeWidth = 2;  // for lines and arcs
```

## Selection & Transformation

**Programmatically:**
```typescript
engine.selection.select(element);
engine.selection.selectAll();
engine.selection.deleteSelected();
engine.selection.copySelected();
engine.selection.pasteClipboard();
engine.selection.nudgeSelected(dx, dy);
```

**User interactions:**
- Click to select
- Shift+Click to toggle
- Drag to select multiple (marquee)
- Drag element to move
- Drag corner handle to resize
- Drag rotation handle to rotate
- Ctrl/Cmd+C/V for copy/paste
- Delete/Backspace to delete
- Arrow keys to nudge
- Ctrl/Cmd+Z/Shift+Z for undo/redo

## Z-Ordering
```typescript
engine.zOrder.bringToFront(element);
engine.zOrder.sendToBack(element);
engine.zOrder.moveForward(element);
engine.zOrder.moveBackward(element);
```

## Serialization
```typescript
// Export
const json = engine.serialization.serialize();
localStorage.setItem('watchface', json);

// Import
await engine.serialization.deserialize(json);
```

## Plugins

### GridPlugin
```typescript
engine.plugins.register(new GridPlugin({
  cellSize: 20,
  color: 0x444444,
  opacity: 0.3,
  snapEnabled: false,
  visible: true,
}));
```

### AutosavePlugin
```typescript
engine.plugins.register(new AutosavePlugin({
  intervalMs: 30000,
  onSave: async (json) => { /* save */ },
}));
```

### UndoRedoPlugin
```typescript
engine.plugins.register(new UndoRedoPlugin({ maxHistory: 100 }));
const ur = engine.plugins.get('undoredo');
ur.undo();
ur.redo();
```

### KeyboardShortcutsPlugin
```typescript
engine.plugins.register(new KeyboardShortcutsPlugin());
// Automatically handles Cmd on macOS, Ctrl elsewhere
```

### Custom Plugins
```typescript
class MyPlugin implements Plugin {
  readonly name = 'my-plugin';
  init(engine: WatchfaceEngine) { /* setup */ }
  destroy() { /* cleanup */ }
  update?(deltaTime: number) { /* per-frame */ }
}
```

## Events
```typescript
engine.eventBus.on('element:added', ({ element }) => {});
engine.eventBus.on('element:changed', ({ element, property, oldValue, newValue }) => {});
engine.eventBus.on('selection:changed', ({ selected }) => {});
engine.eventBus.on('interaction:dragMove', ({ elements, dx, dy }) => {});
engine.eventBus.on('state:saved', ({ json }) => {});
engine.eventBus.on('state:loaded', ({ json }) => {});
engine.eventBus.on('action:performed', ({ action }) => {});
// ... and more
```

## API Reference

### WatchfaceEngine
```typescript
app: Application;
eventBus: EventBus;
elements: ElementManager;
selection: SelectionManager;
plugins: PluginManager;
serialization: SerializationManager;
zOrder: ZOrderManager;

async init(container: HTMLDivElement, options: WatchfaceEngineOptions): Promise<void>;
destroy(): void;
```

### Element Properties
```typescript
// All elements have
x: number;
y: number;
rotation: number;        // radians
zIndex: number;
visible: boolean;
interactable: boolean;   // false = not selectable
opacity: number;         // 0-1
width: number;           // element-specific
height: number;          // element-specific
```

### Engine Options
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

## Svelte Integration

```svelte
<script lang="ts">
  import { WatchfaceEngine, TextElement, ShapeElement } from 'pixi-watchface-engine';
  
  let canvasContainer: HTMLDivElement;
  
  onMount(async () => {
    const engine = new WatchfaceEngine();
    await engine.init(canvasContainer, { width: 400, height: 400 });
    
    const text = new TextElement('Hello', 100, 100);
    engine.elements.add(text);
  });
</script>

<div bind:this={canvasContainer} class="canvas"></div>

<style>
  .canvas { width: 400px; height: 400px; }
</style>
```

## License

MIT
