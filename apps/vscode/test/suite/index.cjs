const vscode = require('vscode');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, label = 'condition') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

exports.run = async function run() {
  const examples = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const exportDir = path.join(examples, 'md2-export');
  fs.rmSync(exportDir, { recursive: true, force: true });
  const results = [];
  const step = async (name, fn) => {
    const t = Date.now();
    await fn();
    results.push(`✓ ${name} (${Date.now() - t} ms)`);
    console.log(results.at(-1));
  };
  try {
    const doc = await vscode.workspace.openTextDocument(path.join(examples, 'demo.md'));
    await vscode.window.showTextDocument(doc);
    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'md2');
    assert.ok(ext, 'extension found');
    const api = await ext.activate();

    await step('commands registered', async () => {
      const cmds = await vscode.commands.getCommands(true);
      for (const c of ['md2.openPreview', 'md2.copyWechat', 'md2.copyZhihu', 'md2.exportXhs', 'md2.copyThread', 'md2.exportLong', 'md2.exportCover', 'md2.publishWechat']) assert.ok(cmds.includes(c), c);
    });

    await step('preview opens and the webview app boots', async () => {
      await vscode.commands.executeCommand('md2.openPreview');
      await until(() => api.preview() && api.preview().ready, 30000, 'webview ready');
      assert.match(api.preview().panel.title, /demo\.md/);
    });

    await step('copy thread → clipboard (webview → host round trip)', async () => {
      await vscode.env.clipboard.writeText('');
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('md2.copyThread');
      const text = await until(async () => {
        const t = await vscode.env.clipboard.readText();
        return t.includes('🧵') ? t : '';
      }, 20000, 'thread on clipboard');
      assert.ok(text.includes('一篇 Markdown'));
    });

    await step('export long image → file in md2-export', async () => {
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('md2.exportLong');
      const file = await until(() => fs.existsSync(exportDir) && fs.readdirSync(exportDir).find((f) => f.endsWith('-long.png')), 60000, 'long png');
      const size = fs.statSync(path.join(exportDir, file)).size;
      assert.ok(size > 50000, `png size ${size}`);
    });

    await step('export Xiaohongshu cards → folder of PNGs + caption', async () => {
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('md2.exportXhs');
      const dir = await until(() => fs.readdirSync(exportDir).find((f) => f.endsWith('-xhs')), 60000, 'xhs folder');
      const files = await until(() => {
        const list = fs.readdirSync(path.join(exportDir, dir));
        return list.includes('caption.txt') ? list : null;
      }, 60000, 'xhs files');
      assert.ok(files.filter((f) => f.endsWith('.png')).length >= 5, files.join(','));
    });

    await step('live sync: editing the document updates the preview', async () => {
      const editor = await vscode.window.showTextDocument(doc);
      await editor.edit((e) => e.insert(new vscode.Position(doc.lineCount, 0), '\n\n## Live edit check\n'));
      await sleep(800);
      await vscode.commands.executeCommand('md2.copyThread');
      await until(async () => (await vscode.env.clipboard.readText()).includes('Live edit check'), 20000, 'edited text in thread');
      await vscode.commands.executeCommand('workbench.action.files.revert');
    });
    fs.writeFileSync(path.join(require('node:os').tmpdir(), 'md2-vscode-test.log'), results.join('\n') + '\nPASS\n');
  } catch (e) {
    const logs = vscode.extensions.all.find((x) => x.packageJSON.name === 'md2')?.exports?.logs?.() ?? [];
    fs.writeFileSync(path.join(require('node:os').tmpdir(), 'md2-vscode-test.log'), results.join('\n') + `\nFAIL: ${e.stack}\nwebview logs:\n${logs.join('\n')}\n`);
    throw e;
  } finally {
    fs.rmSync(exportDir, { recursive: true, force: true });
  }
};
