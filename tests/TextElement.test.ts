import { describe, expect, mock, test } from 'bun:test';
import { TextElement } from '../src/elements/TextElement.ts';

function textElement(align: 'left' | 'center' | 'right') {
  const element = Object.create(TextElement.prototype);
  element._align = align;
  element._boxWidth = null;
  element._boxHeight = null;
  element._arcPath = null;
  element.charSprites = [];
  element.displayText = (value: string) => value;
  element.pixiText = {
    width: 60,
    height: 40,
    style: {},
    position: { x: 30, y: 20 },
  };
  element.boxProxy = { clear: mock(), rect: mock(), fill: mock() };
  element.emitChange = mock();
  return element;
}

describe('TextElement boxWidth', () => {
  test.each([
    ['left', 30],
    ['center', 100],
    ['right', 170],
  ] as const)('repositions %s-aligned text when restoring an expanded box', (align, expectedX) => {
    const element = textElement(align);

    element.boxWidth = 200;

    expect(element.width).toBe(200);
    expect(element.pixiText.position.x).toBe(expectedX);
    expect(element.boxProxy.rect).toHaveBeenLastCalledWith(0, 0, 200, 40);
    expect(element.pixiText.style).toMatchObject({ wordWrap: true, wordWrapWidth: 200 });
    expect(element.emitChange).toHaveBeenCalledWith('boxWidth', null, 200);
  });

  test('repositions text when returning to automatic width', () => {
    const element = textElement('right');
    element.boxWidth = 200;
    element.boxWidth = null;

    expect(element.width).toBe(60);
    expect(element.pixiText.position.x).toBe(30);
    expect(element.boxProxy.rect).toHaveBeenLastCalledWith(0, 0, 60, 40);
    expect(element.pixiText.style.wordWrap).toBe(false);
  });
});
