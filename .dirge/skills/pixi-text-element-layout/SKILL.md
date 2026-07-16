---
description: Add or review text layout features on PixiJS TextElement classes in this project.
---

# Pixi TextElement Layout

Use this when changing `src/elements/TextElement.ts` layout behavior.

## Known PixiJS v8 fields

- Native `TextStyle` fields confirmed in this repo:
  - `wordWrap`
  - `wordWrapWidth`
  - `breakWords`
  - `letterSpacing`
  - `lineHeight`
- PixiJS v8.16.0 does not expose native `TextStyle` fields for:
  - `textTransform`
  - `maxLines`
  - `truncationCharacter`

## Project conventions

- Keep `TextElement.width` and `TextElement.height` as rendered bounds. Do not overload them as wrapping constraints.
- Use `boxWidth` as the fixed wrapping constraint.
- Keep `TextElement` serialization in the class: style interface, private state, getters/setters, `toJSON`, `applyJSON`, and `fromJSON` should all round-trip together.
- Arc text should not be transformed or clamped unless explicitly requested; normal text can use displayed/transformed/clamped text.
- For nullable `lineHeight`, only assign `style.lineHeight` when the value is non-null. Do not use `lineHeight: value ?? 0`.
- When setting `lineHeight` on an existing element, update existing Pixi text style before/while redrawing so `pixiText.style.lineHeight` reflects the setter result.

## Verification

Run:

```bash
bun run typecheck
bun run build
```

For runtime smoke checks under Bun, Pixi text metrics need DOM stubs:

```ts
globalThis.CanvasRenderingContext2D = function CanvasRenderingContext2D() {};
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      font: '',
      fillRect() {},
      getImageData: () => ({ data: [0, 0, 0, 255] }),
      measureText: (text: string) => ({
        width: text.length * 10,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 4,
        fontBoundingBoxAscent: 10,
        fontBoundingBoxDescent: 4,
      }),
    }),
  }),
};
```

Check normal text style fields, save/reload round-trip, clamped output, and that arc text remains raw when that is the intended behavior.
