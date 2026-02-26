<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        WatchfaceEngine,
        TextElement,
        ShapeElement,
        GridPlugin,
        UndoRedoPlugin,
        KeyboardShortcutsPlugin,
        ViewportPlugin,
    } from "pixi-watchface-engine";

    // ── State ──────────────────────────────────────────────────────────────────

    let canvasContainer: HTMLDivElement;
    let status = $state("Initializing…");
    let fillPercent = $state(100);
    let gridVisible = $state(true);
    let snapEnabled = $state(false);
    let selectedCount = $state(0);
    let selectedHasShape = $state(false);
    let zoomLevel = $state(1);
    let mouseWheelZoom = $state(true);

    // ── Engine refs (not reactive — PixiJS manages these) ─────────────────────

    let engine: WatchfaceEngine;
    let grid: GridPlugin;
    let undoRedo: UndoRedoPlugin;
    let viewport: ViewportPlugin;

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    onMount(async () => {
        engine = new WatchfaceEngine();

        await engine.init(canvasContainer, {
            width: 400,
            height: 400,
            background: 0x1a1a2e,
            selectionHandleColor: 0x7c5cbf,
            selectionHandleFillColor: 0x1e1e3a,
        });

        grid = new GridPlugin({
            cellSize: 20,
            snapEnabled: false,
            visible: true,
        });
        undoRedo = new UndoRedoPlugin();
        const keyboard = new KeyboardShortcutsPlugin();
        viewport = new ViewportPlugin({
            drag: true,
            pinch: true,
            wheel: true,
            decelerate: true,
            minScale: 0.1,
            maxScale: 10,
        });

        engine.plugins.register(grid);
        engine.plugins.register(undoRedo);
        engine.plugins.register(keyboard);
        engine.plugins.register(viewport);

        engine.eventBus.on("viewport:zoomed", ({ zoom }) => {
            zoomLevel = zoom;
        });

        engine.eventBus.on("selection:changed", ({ selected }) => {
            selectedCount = selected.length;
            selectedHasShape = selected.some((el) => el.type === "shape");

            if (selectedCount === 0) {
                status = "No selection";
            } else if (selectedCount === 1) {
                status = `Selected: ${selected[0].type}`;
            } else {
                status = `${selectedCount} elements selected`;
            }

            // Sync fill slider to first selected shape
            const shape = selected.find((el) => el.type === "shape") as
                | ShapeElement
                | undefined;
            if (shape) fillPercent = shape.fillPercentage;
        });

        loadDemoScene();
        status = "Demo loaded — click elements to select";
    });

    onDestroy(() => {
        engine?.destroy();
    });

    // ── Handlers ───────────────────────────────────────────────────────────────

    function handleFillChange() {
        const selected = engine.selection.getSelected();
        for (const el of selected) {
            if (el instanceof ShapeElement) el.fillPercentage = fillPercent;
        }
    }

    function addText() {
        const el = new TextElement("Hello World", rp(), rp(), {
            fontSize: 28,
            fontWeight: "bold",
            color: 0xa78bfa,
        });
        engine.elements.add(el);
        engine.selection.selectOnly(el);
    }

    function addCircle() {
        const el = ShapeElement.circle(rp(), rp(), 40);
        el.foregroundColor = 0x7c5cbf;
        el.backgroundColor = 0x2a1a4a;
        el.fillPercentage = 75;
        engine.elements.add(el);
        engine.selection.selectOnly(el);
    }

    function addRect() {
        const el = ShapeElement.rectangle(rp(), rp(), 100, 30);
        el.foregroundColor = 0x22c55e;
        el.backgroundColor = 0x0a2a1a;
        el.fillPercentage = 60;
        el.fillDirection = "left-to-right";
        engine.elements.add(el);
        engine.selection.selectOnly(el);
    }

    function addArc() {
        const el = ShapeElement.arc(rp(), rp(), 50, 0, Math.PI * 1.5);
        el.foregroundColor = 0xf59e0b;
        el.backgroundColor = 0x2a1a00;
        el.strokeWidth = 6;
        engine.elements.add(el);
        engine.selection.selectOnly(el);
    }

    function addLine() {
        const x = rp(),
            y = rp();
        const el = ShapeElement.line(x, y, x + 80, y + 40);
        el.foregroundColor = 0xf87171;
        el.strokeWidth = 3;
        engine.elements.add(el);
        engine.selection.selectOnly(el);
    }

    function toggleGrid() {
        gridVisible = !gridVisible;
        grid.visible = gridVisible;
    }

    function handleZoomSlider() {
        viewport.zoom = zoomLevel;
    }

    function toggleMouseWheelZoom() {
        mouseWheelZoom = !mouseWheelZoom;
        viewport.wheel = mouseWheelZoom;
    }

    function toggleSnap() {
        snapEnabled = !snapEnabled;
        grid.snapEnabled = snapEnabled;
        status = `Snap-to-grid ${snapEnabled ? "on" : "off"}`;
    }

    function deleteSelected() {
        const selected = engine.selection.getSelected();
        if (selected.length === 0) {
            status = "Nothing selected";
            return;
        }
        for (const el of [...selected]) {
            engine.selection.deselect(el);
            engine.elements.remove(el);
        }
    }

    function bringToFront() {
        for (const el of engine.selection.getSelected())
            engine.zOrder.bringToFront(el);
    }

    function sendToBack() {
        for (const el of engine.selection.getSelected())
            engine.zOrder.sendToBack(el);
    }

    function clearAll() {
        engine.selection.deselectAll();
        engine.elements.clear();
        status = "Cleared";
    }

    function undo() {
        undoRedo.undo();
        status = "Undo";
    }
    function redo() {
        undoRedo.redo();
        status = "Redo";
    }

    function exportJson() {
        const json = engine.serialization.serialize();
        console.log("Watchface JSON:", JSON.parse(json));
        status = "JSON exported to console (F12)";
    }

    function loadDemo() {
        loadDemoScene();
        status = "Demo scene loaded";
    }

    // ── Demo Scene ─────────────────────────────────────────────────────────────

    function loadDemoScene() {
        engine.selection.deselectAll();
        engine.elements.clear();

        const ring = ShapeElement.circle(200, 200, 190);
        ring.foregroundColor = 0x1e1e3a;
        ring.backgroundColor = 0x0a0a1a;
        ring.interactable = false;
        engine.elements.add(ring);

        const batteryBg = ShapeElement.rectangle(130, 340, 140, 16);
        batteryBg.foregroundColor = 0x22c55e;
        batteryBg.backgroundColor = 0x0a2a1a;
        batteryBg.fillPercentage = 72;
        batteryBg.fillDirection = "left-to-right";
        engine.elements.add(batteryBg);

        const stepsArc = ShapeElement.arc(200, 200, 170, -Math.PI / 2, Math.PI);
        stepsArc.foregroundColor = 0xf59e0b;
        stepsArc.backgroundColor = 0x1a1000;
        stepsArc.strokeWidth = 8;
        engine.elements.add(stepsArc);

        const hrArc = ShapeElement.arc(200, 200, 155, -Math.PI / 2, 0.8);
        hrArc.foregroundColor = 0xf87171;
        hrArc.backgroundColor = 0x1a0000;
        hrArc.strokeWidth = 8;
        engine.elements.add(hrArc);

        const time = new TextElement("10:09", 200, 155, {
            fontSize: 72,
            fontWeight: "bold",
            color: 0xffffff,
            align: "center",
        });
        time.x = 200 - time.width / 2;
        engine.elements.add(time);

        const date = new TextElement("WED 25 FEB", 200, 248, {
            fontSize: 18,
            color: 0xa78bfa,
            align: "center",
        });
        date.x = 200 - date.width / 2;
        engine.elements.add(date);

        const batteryLabel = new TextElement("72%", 176, 358, {
            fontSize: 12,
            color: 0x6ee7b7,
        });
        engine.elements.add(batteryLabel);

        const dot1 = ShapeElement.circle(120, 200, 4);
        dot1.foregroundColor = 0xa78bfa;
        dot1.interactable = false;
        engine.elements.add(dot1);

        const dot2 = ShapeElement.circle(280, 200, 4);
        dot2.foregroundColor = 0xa78bfa;
        dot2.interactable = false;
        engine.elements.add(dot2);
    }

    function rp(): number {
        return 40 + Math.floor(Math.random() * 320);
    }
</script>

<main>
    <h1>Pixi Watchface Engine</h1>

    <div class="layout">
        <!-- Left panel -->
        <div class="panel">
            <section>
                <h2>Add Elements</h2>
                <div class="btn-group">
                    <button onclick={addText}>+ Text</button>
                    <button onclick={addCircle}>+ Circle</button>
                    <button onclick={addRect}>+ Rectangle</button>
                    <button onclick={addArc}>+ Arc</button>
                    <button onclick={addLine}>+ Line</button>
                </div>
            </section>

            <section>
                <h2>Fill Control</h2>
                <label>
                    Fill %: <span class="value">{fillPercent}%</span>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        bind:value={fillPercent}
                        oninput={handleFillChange}
                        disabled={!selectedHasShape}
                    />
                </label>
            </section>

            <section>
                <h2>Zoom</h2>
                <label>
                    Level: <span class="value"
                        >{Math.round(zoomLevel * 100)}%</span
                    >
                    <input
                        type="range"
                        min="0.25"
                        max="5"
                        step="0.05"
                        bind:value={zoomLevel}
                        oninput={handleZoomSlider}
                    />
                </label>
                <button
                    onclick={toggleMouseWheelZoom}
                    class:active={mouseWheelZoom}
                >
                    Scroll wheel: {mouseWheelZoom ? "on" : "off"}
                </button>
            </section>

            <section>
                <h2>Grid</h2>
                <div class="btn-group">
                    <button onclick={toggleGrid} class:active={gridVisible}>
                        Grid: {gridVisible ? "on" : "off"}
                    </button>
                    <button onclick={toggleSnap} class:active={snapEnabled}>
                        Snap: {snapEnabled ? "on" : "off"}
                    </button>
                </div>
            </section>
        </div>

        <!-- Canvas -->
        <div class="canvas-wrapper">
            <div bind:this={canvasContainer}></div>
        </div>

        <!-- Right panel -->
        <div class="panel">
            <section>
                <h2>Selection</h2>
                <div class="btn-group">
                    <button
                        onclick={deleteSelected}
                        disabled={selectedCount === 0}
                        class="danger"
                    >
                        Delete ({selectedCount})
                    </button>
                    <button
                        onclick={bringToFront}
                        disabled={selectedCount === 0}>Bring to Front</button
                    >
                    <button onclick={sendToBack} disabled={selectedCount === 0}
                        >Send to Back</button
                    >
                    <button onclick={clearAll} class="danger">Clear All</button>
                </div>
            </section>

            <section>
                <h2>History</h2>
                <div class="btn-group">
                    <button onclick={undo}>Undo</button>
                    <button onclick={redo}>Redo</button>
                </div>
            </section>

            <section>
                <h2>Scene</h2>
                <div class="btn-group">
                    <button onclick={exportJson}>Export JSON</button>
                    <button onclick={loadDemo}>Load Demo</button>
                </div>
            </section>

            <section>
                <h2>Status</h2>
                <p class="status">{status}</p>
            </section>

            <section>
                <h2>Shortcuts</h2>
                <div class="shortcuts">
                    <span><kbd>⌘Z</kbd> Undo</span>
                    <span><kbd>⌘⇧Z</kbd> Redo</span>
                    <span><kbd>⌘C</kbd> Copy</span>
                    <span><kbd>⌘V</kbd> Paste</span>
                    <span><kbd>Del</kbd> Delete</span>
                    <span><kbd>⌘A</kbd> Select All</span>
                    <span><kbd>↑↓←→</kbd> Nudge</span>
                </div>
            </section>
        </div>
    </div>
</main>

<style>
    :global(*, *::before, *::after) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    :global(body) {
        background: #0f0f1a;
        color: #e0e0e0;
        font-family: "Segoe UI", system-ui, sans-serif;
        min-height: 100vh;
    }

    main {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 24px;
        gap: 20px;
    }

    h1 {
        font-size: 1.4rem;
        font-weight: 600;
        color: #a78bfa;
        letter-spacing: 0.05em;
    }

    .layout {
        display: flex;
        gap: 20px;
        align-items: flex-start;
        flex-wrap: wrap;
        justify-content: center;
    }

    .canvas-wrapper {
        border: 2px solid #2a2a4a;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        flex-shrink: 0;
    }

    .panel {
        background: #16162a;
        border: 1px solid #2a2a4a;
        border-radius: 10px;
        padding: 16px;
        width: 220px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    h2 {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #7c7ca0;
        border-bottom: 1px solid #2a2a4a;
        padding-bottom: 6px;
    }

    .btn-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    button {
        padding: 7px 10px;
        border-radius: 6px;
        border: 1px solid #3a3a6a;
        background: #1e1e3a;
        color: #c0c0e0;
        font-size: 0.8rem;
        cursor: pointer;
        text-align: left;
        transition:
            background 0.12s,
            border-color 0.12s;
    }

    button:hover:not(:disabled) {
        background: #2a2a5a;
        border-color: #6060a0;
        color: #e0e0ff;
    }

    button:disabled {
        opacity: 0.4;
        cursor: default;
    }

    button.danger {
        border-color: #6a3a3a;
        color: #e08080;
    }

    button.danger:hover:not(:disabled) {
        background: #3a1e1e;
        border-color: #a05050;
    }

    button.active {
        border-color: #7c5cbf;
        color: #a78bfa;
        background: #1e1a3a;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.8rem;
        color: #9090b0;
    }

    .value {
        color: #a78bfa;
        font-weight: 600;
    }

    input[type="range"] {
        width: 100%;
        accent-color: #7c5cbf;
    }

    input[type="range"]:disabled {
        opacity: 0.4;
    }

    .status {
        font-size: 0.78rem;
        color: #7070a0;
        font-style: italic;
        min-height: 1.2em;
    }

    .shortcuts {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 0.72rem;
        color: #5a5a7a;
    }

    kbd {
        background: #1e1e3a;
        border: 1px solid #3a3a5a;
        border-radius: 3px;
        padding: 1px 4px;
        font-size: 0.68rem;
        font-family: monospace;
        color: #9090b0;
        margin-right: 4px;
    }
</style>
