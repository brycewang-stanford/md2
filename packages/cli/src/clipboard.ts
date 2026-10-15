import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Put HTML (with a plain-text fallback) on the system clipboard as rich text. */
export function copyHtml(html: string, text: string): void {
  if (process.platform === 'darwin') {
    // Pass the content through temp files: an env var or argv tops out around 1 MB
    // (E2BIG), which inline base64 images easily exceed
    const dir = mkdtempSync(join(tmpdir(), 'md2-clip-'));
    const htmlFile = join(dir, 'clip.html');
    const textFile = join(dir, 'clip.txt');
    writeFileSync(htmlFile, html);
    writeFileSync(textFile, text);
    const script = `ObjC.import('AppKit');
const env = $.NSProcessInfo.processInfo.environment;
const read = (k) => $.NSString.stringWithContentsOfFileEncodingError(env.objectForKey(k), $.NSUTF8StringEncoding, null);
const pb = $.NSPasteboard.generalPasteboard;
pb.clearContents;
pb.setStringForType(read('MD2_HTML_FILE'), $.NSPasteboardTypeHTML);
pb.setStringForType(read('MD2_TEXT_FILE'), $.NSPasteboardTypeString);`;
    try {
      const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', script], {
        env: { ...process.env, MD2_HTML_FILE: htmlFile, MD2_TEXT_FILE: textFile },
      });
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(`osascript failed: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return;
  }
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', 'Set-Clipboard -AsHtml -Value $input'], { input: html });
    if (r.status !== 0) throw new Error(`Set-Clipboard failed: ${r.stderr}`);
    return;
  }
  for (const [cmd, args] of [
    ['wl-copy', ['--type', 'text/html']],
    ['xclip', ['-selection', 'clipboard', '-t', 'text/html']],
  ] as const) {
    const r = spawnSync(cmd, args as unknown as string[], { input: html });
    if (r.status === 0) return;
  }
  throw new Error('No clipboard tool found (install wl-clipboard or xclip)');
}

export function copyText(text: string): void {
  const cmds: [string, string[]][] =
    process.platform === 'darwin' ? [['pbcopy', []]]
    : process.platform === 'win32' ? [['clip', []]]
    : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']]];
  for (const [cmd, args] of cmds) {
    if (spawnSync(cmd, args, { input: text }).status === 0) return;
  }
  throw new Error('No clipboard tool found');
}
