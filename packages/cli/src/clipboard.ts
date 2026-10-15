import { spawnSync } from 'node:child_process';

/** Put HTML (with a plain-text fallback) on the system clipboard as rich text. */
export function copyHtml(html: string, text: string): void {
  if (process.platform === 'darwin') {
    const script = `ObjC.import('AppKit');
const env = $.NSProcessInfo.processInfo.environment;
const pb = $.NSPasteboard.generalPasteboard;
pb.clearContents;
pb.setStringForType(env.objectForKey('MD2_HTML'), $.NSPasteboardTypeHTML);
pb.setStringForType(env.objectForKey('MD2_TEXT'), $.NSPasteboardTypeString);`;
    const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', script], {
      env: { ...process.env, MD2_HTML: html, MD2_TEXT: text },
    });
    if (r.status !== 0) throw new Error(`osascript failed: ${r.stderr}`);
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
