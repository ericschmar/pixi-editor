<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { Graphics } from 'pixi.js';
    import {
        applyDisplayMask,
        displayToViewportPoint,
        fitDisplayGeometry,
        ShapeElement,
        TextElement,
        WatchfaceEngine,
    } from 'pixi-watchface-engine';
    import type { DisplayGeometry } from 'pixi-watchface-engine';

    const editorSize = 800;
    const editorInset = 32;
    const displaySize = 400;
    let canvasContainer: HTMLDivElement;
    let engine: WatchfaceEngine;
    let isCircle = $state(false);
    let fittedScale = $state(1);
    let displayMask: Graphics | undefined;
    let frame: Graphics | undefined;

    onMount(async () => {
        engine = new WatchfaceEngine();
        await engine.init(canvasContainer, {
            width: editorSize,
            height: editorSize,
            background: 0x10101b,
            coordinateOrigin: 'center',
        });

        updateDisplayGeometry();
        loadSquareFace();
    });

    onDestroy(() => {
        engine?.destroy();
    });

    function loadSquareFace() {
        const outerRing = ShapeElement.circle(0, 0, 184);
        outerRing.foregroundColor = 0x292943;
        outerRing.backgroundColor = 0x17172a;
        outerRing.interactable = false;
        engine.elements.add(outerRing);

        const stepsArc = ShapeElement.arc(0, 0, 164, -Math.PI / 2, Math.PI * 1.6);
        stepsArc.foregroundColor = 0x9b83ff;
        stepsArc.backgroundColor = 0x28243e;
        stepsArc.strokeWidth = 8;
        stepsArc.lineCap = 'round';
        engine.elements.add(stepsArc);

        const time = new TextElement('10:09', 0, -48, {
            fontSize: 68,
            fontWeight: 'bold',
            color: 0xffffff,
            align: 'center',
        });
        time.y += time.height / 2;
        engine.elements.add(time);

        const date = new TextElement('WED 25 FEB', 0, 43, {
            fontSize: 16,
            color: 0xa78bfa,
            align: 'center',
        });
        date.y += date.height / 2;
        engine.elements.add(date);

        const battery = ShapeElement.rectangle(-66, 112, 132, 14);
        battery.foregroundColor = 0x35d39a;
        battery.backgroundColor = 0x18352d;
        battery.fillPercentage = 78;
        battery.fillDirection = 'left-to-right';
        engine.elements.add(battery);

        const batteryLabel = new TextElement('BATTERY 78%', 0, 145, {
            fontSize: 12,
            color: 0x8be7c4,
            align: 'center',
        });
        batteryLabel.y += batteryLabel.height / 2;
        engine.elements.add(batteryLabel);
    }

    function toggleShape() {
        isCircle = !isCircle;
        updateDisplayGeometry();
    }

    function updateDisplayGeometry() {
        if (!engine) return;

        // Both modes use the same device-independent logical dimensions. Fit
        // the face uniformly, then let the selected shape define its clipping.
        const display: DisplayGeometry = {
            shape: isCircle ? 'circle' : 'rectangle',
            width: displaySize,
            height: displaySize,
        };
        const viewport = fitDisplayGeometry(display, {
            x: editorInset,
            y: editorInset,
            width: editorSize - editorInset * 2,
            height: editorSize - editorInset * 2,
        });
        const viewportCenter = displayToViewportPoint(
            { x: 0, y: 0 },
            display,
            viewport,
            'center',
        );
        const contentRoot = engine.getContentRoot();
        contentRoot.position.set(viewportCenter.x, viewportCenter.y);
        contentRoot.scale.set(viewport.scale);
        fittedScale = viewport.scale;

        const elementsLayer = engine.getElementsLayer();
        if (displayMask) {
            elementsLayer.mask = null;
            elementsLayer.removeChild(displayMask);
            displayMask.destroy();
        }
        displayMask = applyDisplayMask(elementsLayer, display, 'center');

        // The frame lives in editor space, outside the masked face contents.
        if (frame) {
            engine.app.stage.removeChild(frame);
            frame.destroy();
        }
        frame = new Graphics();
        if (display.shape === 'circle') {
            frame.circle(
                viewport.x + viewport.width / 2,
                viewport.y + viewport.height / 2,
                viewport.width / 2,
            );
        } else {
            frame.rect(viewport.x, viewport.y, viewport.width, viewport.height);
        }
        frame.stroke({ color: 0x7c5cbf, width: 2 });
        engine.app.stage.addChild(frame);
    }
</script>

<svelte:head>
    <title>Square and circle display geometry — Pixi Watchface Engine</title>
</svelte:head>

<main>
    <header>
        <a href="/">← Editor example</a>
        <p class="eyebrow">Generic display geometry</p>
        <h1>Square and circle watch face</h1>
        <p class="intro">
            Switch between square and circular geometry in the same logical
            400 × 400 space. The face stays device-independent while the preview
            scales uniformly.
        </p>
    </header>

    <section class="demo">
        <div class="preview" bind:this={canvasContainer}></div>
        <aside>
            <h2>Display setup</h2>
            <button
                class="shape-toggle"
                type="button"
                aria-pressed={isCircle}
                onclick={toggleShape}
            >
                Circle preview {isCircle ? 'on' : 'off'}
            </button>
            <dl>
                <div>
                    <dt>Shape</dt>
                    <dd>{isCircle ? 'circle' : 'rectangle'} · {isCircle ? 'round' : 'square'} profile</dd>
                </div>
                <div>
                    <dt>Logical size</dt>
                    <dd>{displaySize} × {displaySize}</dd>
                </div>
                <div>
                    <dt>Fit scale</dt>
                    <dd>{Math.round(fittedScale * 100)}%</dd>
                </div>
                <div>
                    <dt>Origin</dt>
                    <dd>center</dd>
                </div>
            </dl>
            <p>
                <code>fitDisplayGeometry</code> centers the face without stretching;
                <code>applyDisplayMask</code> clips its rendered elements to the
                selected shape boundary.
            </p>
        </aside>
    </section>
</main>

<style>
    :global(*, *::before, *::after) {
        box-sizing: border-box;
    }

    :global(body) {
        min-width: 320px;
        min-height: 100vh;
        margin: 0;
        background: #0f0f1a;
        color: #e0e0e0;
        font-family: 'Segoe UI', system-ui, sans-serif;
    }

    main {
        width: min(1180px, 100%);
        margin: 0 auto;
        padding: 32px clamp(16px, 4vw, 48px) 48px;
    }

    header {
        max-width: 680px;
        margin: 0 auto 28px;
    }

    a {
        color: #a78bfa;
        text-decoration: none;
    }

    a:hover {
        text-decoration: underline;
    }

    .eyebrow {
        margin: 28px 0 8px;
        color: #a78bfa;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }

    h1 {
        margin: 0;
        font-size: clamp(2rem, 6vw, 3rem);
    }

    .intro {
        color: #a0a0b8;
        line-height: 1.6;
    }

    .demo {
        display: grid;
        grid-template-columns: minmax(0, 720px) minmax(220px, 280px);
        align-items: center;
        justify-content: center;
        gap: 28px;
    }

    .preview {
        width: 100%;
        aspect-ratio: 1;
        overflow: hidden;
        border: 1px solid #2a2a4a;
        border-radius: 12px;
        background: #10101b;
        box-shadow: 0 8px 32px rgb(0 0 0 / 40%);
    }

    :global(.preview canvas) {
        display: block;
        width: 100%;
        height: 100%;
    }

    aside {
        padding: 20px;
        border: 1px solid #2a2a4a;
        border-radius: 10px;
        background: #16162a;
    }

    h2 {
        margin: 0 0 16px;
        color: #c0c0e0;
        font-size: 0.9rem;
    }

    .shape-toggle {
        width: 100%;
        margin: 0 0 18px;
        padding: 10px 12px;
        border: 1px solid #7c5cbf;
        border-radius: 6px;
        background: #292943;
        color: #e0e0e0;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }

    .shape-toggle:hover {
        background: #383454;
    }

    .shape-toggle:focus-visible {
        outline: 2px solid #c4b5fd;
        outline-offset: 3px;
    }

    dl {
        display: grid;
        gap: 14px;
        margin: 0 0 18px;
    }

    dl div {
        display: flex;
        justify-content: space-between;
        gap: 12px;
    }

    dt {
        color: #8585a5;
    }

    dd {
        margin: 0;
        color: #e0e0e0;
        text-align: right;
    }

    aside p {
        color: #a0a0b8;
        font-size: 0.88rem;
        line-height: 1.6;
    }

    code {
        color: #c4b5fd;
        font-size: 0.84em;
    }

    @media (max-width: 900px) {
        .demo {
            grid-template-columns: minmax(0, 720px);
        }
    }
</style>
