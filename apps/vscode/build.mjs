// Bundles the extension host code and copies the web app build into media/app.
import { build } from 'esbuild';
import { cpSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const webDist = new URL('../web/dist/', import.meta.url);
if (!existsSync(webDist) || process.argv.includes('--web')) {
  execSync('pnpm --filter @md2/web build', { stdio: 'inherit' });
}
rmSync(new URL('./media/app', import.meta.url), { recursive: true, force: true });
cpSync(webDist, new URL('./media/app', import.meta.url), { recursive: true });

await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: false,
  minify: true,
  logLevel: 'info',
  // @md2/core is resolved from source so the extension never needs a prebuilt core
  alias: { '@md2/core': '../../packages/core/src/index.ts' },
});
