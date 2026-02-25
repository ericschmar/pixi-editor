# Getting Started with Pixi Watchface Editor Engine

## Installation

```bash
bun add pixi-watchface-engine pixi.js
```

## 5-Minute Quick Start

### Step 1: Create HTML Container

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; background: #0a0a0e; }
    #canvas { width: 400px; height: 400px; display: block; }
  </style>
</head>
<body>
  <div id="canvas"></div>
  <script src="./index.js" type="module"></script>
</body>
</html>
```

### Step 2: Initialize Engine

```typescript
import {
  WatchfaceEngine,
  TextElement,
  ShapeElement,
  GridPlugin,
  KeyboardShortcutsPlugin,
} from 'pixi-watchface-engine';

// Create engine
const engine = new WatchfaceEngine();

// Initialize with container
await engine.init(document.getElementById('canvas')!, {
  width: 400,
  height: 400,
  background: 0x1a1a2e,
});

// Register plugins
engine.plugins.register(new GridPlugin({ snapEnabled: true }));
engine.plugins.register(new KeyboardShortcutsPlugin());

console.log('✓ Engine ready!');
```

### Step 3: Add Your First Element

```typescript
// Create a circle
const circle = ShapeElement.circle(200, 200, 100);
circle.foregroundColor = 0x0088ff;
circle.interactable = false; // Background element

engine.elements.add(circle);

// Create text
const text = new TextElement('Hello', 150, 180, {
  fontSize: 48,
  fontWeight: 'bold',
  color: 0xffffff,
});

engine.elements.add(text);

console.log('✓ Elements added!');
```

### Step 4: Enable User Interactions

Users can now:
- **Click** the text to select it
- **Drag** it to move
- **Drag corners** to resize
- **Drag rotation handle** (circle above) to rotate
- **Delete key** to delete
- **Ctrl/Cmd+Z** to undo

## Common Tasks

### Add a Grid with Snap-to-Grid

```typescript
engine.plugins.register(new GridPlugin({
  cellSize: 20,
  snapEnabled: true,  // Enable snapping
}));
```

### Save and Load Designs

```typescript
// Save to localStorage
const json = engine.serialization.serialize();
localStorage.setItem('myWatchface', json);

// Load from localStorage
const json = localStorage.getItem('myWatchface');
await engine.serialization.deserialize(json);
```

### Enable Undo/Redo

```typescript
import { UndoRedoPlugin } from 'pixi-watchface-engine';

engine.plugins.register(new UndoRedoPlugin({ maxHistory: 50 }));

// Now Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z work
```

### Copy/Paste Elements

```typescript
// Select an element
engine.selection.select(element);

// Copy (Ctrl/Cmd+C or programmatic)
engine.selection.copySelected();

// Paste (Ctrl/Cmd+V or programmatic)
engine.selection.pasteClipboard();  // Creates offset copy
```

### Work with Elements Programmatically

```typescript
// Create text
const title = new TextElement('12:00', 100, 100, {
  fontSize: 48,
  fontWeight: 'bold',
});
engine.elements.add(title);

// Access and modify properties (auto-updates canvas)
title.x = 150;
title.y = 150;
title.fontSize = 52;
title.color = 0xff0000;

// Get all elements
const allElements = engine.elements.getAll();
console.log(`Total elements: ${allElements.length}`);

// Z-ordering
engine.zOrder.bringToFront(title);
engine.zOrder.sendToBack(title);
```

### Listen to Changes

```typescript
// When element is added
engine.eventBus.on('element:added', ({ element }) => {
  console.log('Added:', element.type, element.id);
});

// When selection changes
engine.eventBus.on('selection:changed', ({ selected }) => {
  console.log('Selected elements:', selected.length);
});

// When property changes
engine.eventBus.on('element:changed', ({ element, property, newValue }) => {
  console.log(`${element.id}.${property} = ${newValue}`);
});
```

### Create Custom Plugins

```typescript
import type { Plugin } from 'pixi-watchface-engine';

class DebugPlugin implements Plugin {
  readonly name = 'debug';

  init(engine: WatchfaceEngine) {
    console.log('✓ Debug plugin active');

    engine.eventBus.on('element:added', ({ element }) => {
      console.log('[DEBUG] Element added:', element.id);
    });
  }

  destroy() {
    console.log('✗ Debug plugin destroyed');
  }
}

engine.plugins.register(new DebugPlugin());
```

### Autosave to Server

```typescript
import { AutosavePlugin } from 'pixi-watchface-engine';

engine.plugins.register(new AutosavePlugin({
  intervalMs: 10000,  // Save every 10 seconds
  onSave: async (json) => {
    const response = await fetch('/api/watchfaces/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    if (response.ok) {
      console.log('✓ Saved to server');
    }
  },
}));
```

## Advanced: Svelte Component

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    WatchfaceEngine,
    TextElement,
    ShapeElement,
    GridPlugin,
    UndoRedoPlugin,
    KeyboardShortcutsPlugin,
    type BaseElement,
  } from 'pixi-watchface-engine';

  let canvasContainer: HTMLDivElement;
  let engine: WatchfaceEngine;
  let selectedElements: BaseElement[] = [];

  onMount(async () => {
    engine = new WatchfaceEngine();
    await engine.init(canvasContainer, {
      width: 400,
      height: 400,
      background: 0x1a1a2e,
    });

    // Register plugins
    engine.plugins.register(new GridPlugin({ snapEnabled: true }));
    engine.plugins.register(new UndoRedoPlugin());
    engine.plugins.register(new KeyboardShortcutsPlugin());

    // Listen to selections
    engine.eventBus.on('selection:changed', ({ selected }) => {
      selectedElements = selected;
    });

    // Load saved design
    const saved = localStorage.getItem('watchface');
    if (saved) await engine.serialization.deserialize(saved);
  });

  function addText() {
    const text = new TextElement('New', 100, 100, { fontSize: 24 });
    engine.elements.add(text);
    engine.selection.select(text);
  }

  function updateSelected(key: string, value: unknown) {
    for (const el of selectedElements) {
      if (el.type === 'text' && key in el) {
        (el as any)[key] = value;
      }
    }
  }

  function save() {
    const json = engine.serialization.serialize();
    localStorage.setItem('watchface', json);
    alert('Saved!');
  }

  onDestroy(() => {
    engine?.destroy();
  });
</script>

<div class="editor">
  <div bind:this={canvasContainer} class="canvas" />

  <div class="sidebar">
    <h2>Editor</h2>

    <h3>Add Element</h3>
    <button on:click={addText}>+ Text</button>

    {#if selectedElements.length > 0}
      <h3>Properties</h3>
      {#if selectedElements[0].type === 'text'}
        <label>
          Text:
          <input
            value={selectedElements[0].text}
            on:change={(e) => updateSelected('text', e.target.value)}
          />
        </label>
        <label>
          Font Size:
          <input
            type="number"
            value={selectedElements[0].fontSize}
            on:change={(e) => updateSelected('fontSize', +e.target.value)}
          />
        </label>
      {/if}

      <label>
        X:
        <input
          type="number"
          value={selectedElements[0]?.x}
          on:change={(e) => updateSelected('x', +e.target.value)}
        />
      </label>
      <label>
        Y:
        <input
          type="number"
          value={selectedElements[0]?.y}
          on:change={(e) => updateSelected('y', +e.target.value)}
        />
      </label>
    {/if}

    <button on:click={save} class="save-btn">💾 Save</button>
  </div>
</div>

<style>
  .editor {
    display: flex;
    height: 100vh;
    background: #0a0a0e;
    color: #fff;
  }
  .canvas {
    flex: 1;
    border: 1px solid #333;
  }
  .sidebar {
    width: 280px;
    background: #1a1a2e;
    padding: 1rem;
    overflow-y: auto;
  }
  button {
    width: 100%;
    padding: 0.5rem;
    margin: 0.5rem 0;
    background: #333;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  button:hover {
    background: #444;
  }
  button.save-btn {
    background: #0088ff;
    font-weight: bold;
    margin-top: 2rem;
  }
  label {
    display: flex;
    flex-direction: column;
    margin: 0.75rem 0;
    font-size: 0.85rem;
  }
  input {
    padding: 0.35rem;
    margin-top: 0.25rem;
    background: #222;
    color: #fff;
    border: 1px solid #444;
    border-radius: 3px;
    font-size: 0.9rem;
  }
  h2, h3 {
    margin: 1rem 0 0.5rem 0;
    font-size: 1rem;
  }
</style>
```

## Architecture Overview

```
WatchfaceEngine
├── app (PixiJS Application)
├── eventBus (Event emitter)
├── elements (ElementManager)
│   ├── TextElement
│   ├── ImageElement
│   └── ShapeElement
├── selection (SelectionManager)
│   ├── SelectionBox
│   ├── TransformController
│   └── MarqueeSelect
├── plugins (PluginManager)
│   ├── GridPlugin
│   ├── AutosavePlugin
│   ├── UndoRedoPlugin
│   └── KeyboardShortcutsPlugin
├── serialization (SerializationManager)
└── zOrder (ZOrderManager)
```

## Performance Tips

1. **Mark static elements as non-interactable** to reduce hit-testing:
   ```typescript
   background.interactable = false;
   ```

2. **Use `GridPlugin.snapEnabled = false`** by default (only enable when needed)

3. **Serialize periodically** with `AutosavePlugin` rather than on every change

4. **Use `visible = false`** instead of removing elements if you plan to show them again

## Troubleshooting

### Selection handles not visible
- Check `selectionHandleColor` contrasts with background
- Verify element is interactable: `element.interactable === true`

### Fill percentage not working
- Ensure 0 ≤ `fillPercentage` ≤ 100
- Check `fillDirection` is valid: `left-to-right`, `right-to-left`, `top-to-bottom`, or `bottom-to-top`

### Undo/redo not working
- Register `UndoRedoPlugin` before adding elements
- Check keyboard shortcuts plugin is registered for Ctrl/Cmd+Z

### Elements appear distorted
- Check that width and height are positive numbers
- Ensure rotation is in radians (not degrees)

## Next Steps

- Read the [API Reference](./API.md) for detailed documentation
- Check [README.md](./README.md) for feature overview
- Explore the source code in `src/` for implementation details
