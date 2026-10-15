import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/actions.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  dts: { entry: { index: 'src/actions.ts' } },
  // Bundle the core so `npx md2all` works without publishing @md2/core separately
  noExternal: ['@md2/core'],
  banner: { js: '' },
  async onSuccess() {
    copyFileSync('../core/dist/md2-dom.iife.js', 'dist/md2-dom.iife.js');
  },
});
