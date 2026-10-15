import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const core = (p: string) => fileURLToPath(new URL(`../../packages/core/src/${p}`, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@md2/core/dom', replacement: core('dom.ts') },
      { find: '@md2/core', replacement: core('index.ts') },
    ],
  },
  server: { fs: { allow: ['../..'] } },
  build: { chunkSizeWarningLimit: 4000 },
});
