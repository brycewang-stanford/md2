// End-to-end test: launches VS Code with the extension in development mode.
import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const local = ['/Applications/Visual Studio Code.app/Contents/MacOS/Code', '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'].find(existsSync);
await runTests({
  ...(local && !process.env.CI ? { vscodeExecutablePath: local } : {}),
  extensionDevelopmentPath: root,
  extensionTestsPath: join(root, 'test/suite/index.cjs'),
  launchArgs: [join(root, '../../examples'), '--disable-extensions', '--user-data-dir', mkdtempSync(join(tmpdir(), 'md2-vscode-'))],
});
