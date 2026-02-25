Design an engine for Pixijs that allows a user to create watchfaces with a visual editor. I know the PixiJS documentation references React, but our project is exclusively in Svelte.

You will be creating a standalone library that will be used by another project. So this should be able to stand on its own. We will need to initialize it.

FIRST THING FIRST: PULL PIXI DOCUMENTATION 

DO:
- Ask clarifying questions
- Be incredibly critical of your own work; double check it against the PixiJS documentation and these requirements
- Use Bun for our project

1. It should feature a plugin system that allows for easy extension and customization. Plugins would look like:
    a. Grid Plugin - Provides a grid overlay for better alignment and positioning of elements.
        1. Snap to grid option
    b. Autosave Plugin - Automatically saves the watchface design periodically to prevent data loss.
    c. Undo/Redo Plugin - Allows users to undo and redo actions within the editor.
    d. Keyboard Shortcuts Plugin - Enables users to perform actions using keyboard shortcuts using the Pixijs event system.
2. It should support a wide range of watchface elements, including but not limited to:
    a. Text Elements - Allows users to add text to their watchface designs.
        1. Text Alignment - Allows users to align text within their watchface designs.
        2. Text Style - Allows users to customize the style of their text elements.
            1. Font Family - Allows users to select a font family for their text elements.
            2. Font Size - Allows users to adjust the font size of their text elements.
            3. Font Weight - Allows users to adjust the font weight of their text elements.
    b. Image Elements - Enables users to include images in their watchface designs.
    c. Shape Elements - Provides a variety of shapes for users to customize their watchface designs.
        1. Line
        2. Arc
        3. Circle
        4. Rectangle
    d. The shape elements should all contain a foreground and background color and fill percentage
        1. Fill percentage means: a line that is filled 30% has a background that is the full length, and a foreground that is filled 30% of the length.
3. The engine should have a very intuitive UX for developers to manage elements and plugins.
    a. A user could have:
        ```
        let elements = [
            new TextElement("Hello", 100, 100),
            new ImageElement("image.png", 200, 200),
            new ShapeElement("line", 300, 300, 400, 400),
            new ShapeElement("arc", 500, 500, 600, 600),
            new ShapeElement("circle", 700, 700, 800, 800),
            new ShapeElement("rectangle", 900, 900, 1000, 1000)
        ];
        
        ...later in the code...
        
        const item = elements[2];
        item.x = 500; // Set the x-coordinate of the shape element, auto updates on the canvas
        ... etc for other properties like fill, etc...
        ```
    b. This would allow a developer to have a button that creates a new shape and add it to our elements.
    c. The jsx would be: 
        ```
          <div
            bind:this={canvasContainer}
            class="flex-1 flex items-center justify-center"
            ></div>
        ```
4. It should natively support select one, select multiple, resize, rotate, and move.


** Full PixiJS LLM Documentation **
https://pixijs.com/llms-full.txt
