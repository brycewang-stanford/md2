import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', dom: 'src/dom.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    target: 'es2022',
  },
  {
    // Self-contained browser script used by the CLI (Playwright) to paginate
    // XHS cards and fit cover text with the exact same code as the web app.
    entry: { 'md2-dom.iife': 'src/dom.ts' },
    format: ['iife'],
    globalName: 'Md2Dom',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    outExtension: () => ({ js: '.js' }),
  },
]);
