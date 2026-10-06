import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'esnext', // required for top-level await (used by PixiJS v8)
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      // When running locally (before npm publish), resolve the library
      // from the parent src/ directory instead of node_modules.
      // Remove this alias after publishing to npm.
      'pixi-watchface-engine': resolve(__dirname, '../src/index.ts'),
    },
  },
});
