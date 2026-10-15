#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename, extname } from 'node:path';
import { Argument, Command, Option } from 'commander';
import { readFileSync } from 'node:fs';
import {
  themes, codeThemes, coverTemplates, coverSizes, xhsCardStyles, socialPlatforms, type CoverSizeId, type CoverTemplateId,
  type XhsCardStyle, type SocialPlatformId, type StyleOptions,
} from '@md2/core';
import {
  wechatHtml, zhihuHtml, xThread, xhsExport, coverExport, publishWechat, longExport, aiSuggest, aiConfigFromEnv, type AiTask,
} from './actions.js';
import { copyHtml, copyText } from './clipboard.js';
import { closeBrowser } from './browser.js';
import { startMcpServer } from './mcp.js';

const VERSION = '0.2.0';

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function warn(ws: { message: string }[]) {
  for (const w of ws) console.error(c.yellow('⚠ ' + w.message));
}

function stem(file?: string) {
  return file && file !== '-' ? basename(file, extname(file)) : 'md2';
}

function write(path: string, content: string) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content);
  console.error(c.green('✓ ') + path);
}

const styleOptions = (cmd: Command) =>
  cmd
    .addOption(new Option('-t, --theme <id>', 'article theme').choices(themes.map((t) => t.id)).default('claude'))
    .addOption(new Option('--code-theme <id>', 'code highlight theme').choices(codeThemes.map((t) => t.id)))
    .option('--color <hex>', 'override primary colour, e.g. "#d97757"')
    .option('--font-size <px>', 'base font size', (v) => Number(v))
    .addOption(new Option('--font <family>', 'sans | serif | any CSS font-family'))
    .option('--line-height <n>', 'line height, e.g. 1.8', (v) => Number(v))
    .option('--para-spacing <em>', 'space after paragraphs in em', (v) => Number(v))
    .option('--letter-spacing <em>', 'letter spacing in em', (v) => Number(v))
    .option('--indent', '首行缩进 2em')
    .option('--justify', 'justify body text')
    .addOption(new Option('--heading-align <a>', 'heading alignment').choices(['left', 'center']))
    .option('--css <file>', 'extra CSS appended after the theme');

/** StyleOptions from the shared CLI flags. */
function style(o: Record<string, unknown>): StyleOptions {
  return {
    theme: o.theme as string, codeTheme: o.codeTheme as string, primaryColor: o.color as string,
    fontSize: o.fontSize as number, fontFamily: o.font as string, lineHeight: o.lineHeight as number,
    paragraphSpacing: o.paraSpacing as number, letterSpacing: o.letterSpacing as number,
    textIndent: o.indent as boolean, justify: o.justify as boolean, headingAlign: o.headingAlign as 'left' | 'center',
    customCss: o.css ? readFileSync(o.css as string, 'utf8') : undefined,
  };
}

const program = new Command();
program
  .name('md2')
  .description('Markdown → 公众号 WeChat · 知乎 Zhihu · 小红书 XHS cards · X threads · covers')
  .version(VERSION);

styleOptions(
  program
    .command('wechat')
    .description('render WeChat (公众号) HTML with inline styles; --copy puts it on the clipboard as rich text')
    .argument('[file]', 'markdown file (default: stdin)')
    .option('-o, --out <file>', 'write HTML to file')
    .option('-c, --copy', 'copy rich text to clipboard, then paste into the WeChat editor')
    .option('--no-link-refs', 'keep external links instead of converting them to references')
    .option('--no-mac', 'no macOS dots on code blocks')
    .option('--remove-title', 'drop the first H1'),
).action(async (file, o) => {
  const r = await wechatHtml({ file }, { ...style(o), linkReferences: o.linkRefs, macCodeBlock: o.mac, removeTitle: o.removeTitle }).finally(closeBrowser);
  warn(r.warnings);
  if (o.copy) {
    copyHtml(r.html, r.doc.markdown);
    console.error(c.green('✓ copied — paste into mp.weixin.qq.com editor'));
  }
  if (o.out) write(o.out, previewPage(r.doc.title, r.html));
  if (!o.copy && !o.out) process.stdout.write(r.html + '\n');
});

program
  .command('zhihu')
  .description('render Zhihu (知乎) HTML: native formulas, code blocks and references')
  .argument('[file]', 'markdown file (default: stdin)')
  .option('-o, --out <file>', 'write HTML to file')
  .option('-c, --copy', 'copy rich text to clipboard, then paste into the Zhihu editor')
  .option('--keep-title', 'keep the first H1')
  .option('--links-as-refs', 'turn external links into Zhihu references')
  .action(async (file, o) => {
    const r = await zhihuHtml({ file }, { removeTitle: !o.keepTitle, linksAsReferences: o.linksAsRefs });
    warn(r.warnings);
    if (o.copy) {
      copyHtml(r.html, r.text);
      console.error(c.green('✓ copied — paste into zhuanlan.zhihu.com/write'));
    }
    if (o.out) write(o.out, previewPage(r.doc.title, r.html));
    if (!o.copy && !o.out) process.stdout.write(r.html + '\n');
  });

styleOptions(
  program
    .command('xhs')
    .description('render Xiaohongshu (小红书) 3:4 image cards (1080×1440) + caption.txt')
    .argument('[file]', 'markdown file')
    .option('-o, --out <dir>', 'output directory')
    .addOption(new Option('-s, --card-style <id>', 'card frame').choices(xhsCardStyles.map((s) => s.id)).default('clean'))
    .option('-a, --author <name>', 'author shown on cards')
    .option('--no-cover', 'no cover card')
    .addOption(new Option('--cover-template <id>', 'cover template').choices(coverTemplates.map((t) => t.id)).default('claude'))
    .option('--no-hr-break', "don't start a new card at ---")
    .option('--no-page-numbers', 'hide page numbers'),
).action(async (file, o) => {
  const outDir = o.out ?? `${stem(file)}-xhs`;
  try {
    const r = await xhsExport({ file }, {
      outDir, ...style(o),
      cardStyle: o.cardStyle as XhsCardStyle, author: o.author, cover: o.cover === false ? false : { template: o.coverTemplate },
      hrPageBreak: o.hrBreak, pageNumbers: o.pageNumbers,
    });
    warn(r.warnings);
    r.files.forEach((f) => console.error(c.green('✓ ') + f));
    console.error(c.green('✓ ') + r.caption);
    console.error(c.dim(`标题 ${r.text.titleLength}/20 · 正文 ${r.text.bodyLength}/1000`));
  } finally {
    await closeBrowser();
  }
});

program
  .command('thread')
  .aliases(['x', 'twitter'])
  .description('split an article into a thread: X, Threads, Bluesky, Mastodon or one LinkedIn post')
  .argument('[file]', 'markdown file (default: stdin)')
  .addOption(new Option('-p, --platform <id>', 'target platform').choices(Object.keys(socialPlatforms)).default('x'))
  .option('-o, --out <file>', 'write thread (.txt or .json)')
  .option('-l, --limit <n>', 'max length per post (X Premium: 25000)', (v) => Number(v))
  .option('--no-numbering', 'no "1/n" counters')
  .option('--no-title', "don't open with the title")
  .option('--bold-headings', 'Unicode-bold headings (𝗹𝗶𝗸𝗲 𝘁𝗵𝗶𝘀)')
  .option('--include-code', 'keep code blocks as text')
  .option('--json', 'print JSON')
  .option('-c, --copy', 'copy the whole thread to clipboard')
  .action(async (file, o) => {
    const platform = socialPlatforms[o.platform as SocialPlatformId];
    const limit = o.limit ?? platform.limit;
    const r = await xThread({ file }, {
      platform: platform.id, limit, numbering: o.numbering === false ? false : undefined, titleFirst: o.title,
      includeCode: o.includeCode, boldHeadings: o.boldHeadings,
    });
    warn(r.warnings);
    const sep = '\n\n────────\n\n';
    const text = r.tweets.map((t) => t.text + (t.images.length ? `\n[images: ${t.images.join(', ')}]` : '')).join(sep);
    if (o.copy) copyText(r.tweets.map((t) => t.text).join(sep));
    if (o.out) write(o.out, o.out.endsWith('.json') ? JSON.stringify(r.tweets, null, 2) : text + '\n');
    else if (o.json) process.stdout.write(JSON.stringify(r.tweets, null, 2) + '\n');
    else {
      r.tweets.forEach((t, i) => {
        console.log(c.dim(`── ${platform.name} ${i + 1}/${r.tweets.length} · ${t.length}/${limit}`));
        console.log(t.text + (t.images.length ? c.dim(`\n🖼  ${t.images.join(', ')}`) : '') + '\n');
      });
    }
  });

styleOptions(
  program
    .command('long')
    .description('render the whole article as one tall image (长图, 1080 px wide)')
    .argument('[file]', 'markdown file')
    .option('-o, --out <file>', 'output PNG')
    .option('-w, --width <px>', 'layout width in CSS px (exported at 2×)', (v) => Number(v), 540)
    .option('--no-header', 'no title header')
    .option('--footer <text>', 'footer text'),
).action(async (file, o) => {
  try {
    const out = o.out ?? `${stem(file)}-long.png`;
    const r = await longExport({ file }, { out, ...style(o), width: o.width, header: o.header, footer: o.footer });
    warn(r.warnings);
    console.error(c.green('✓ ') + r.file);
  } finally {
    await closeBrowser();
  }
});

program
  .command('ai')
  .description('AI copywriting with your own key (ANTHROPIC_API_KEY, or MD2_AI_BASE_URL/MD2_AI_API_KEY/MD2_AI_MODEL)')
  .addArgument(new Argument('<task>', 'what to write').choices(['xhs', 'thread', 'wechat', 'cover']))
  .argument('[file]', 'markdown file (default: stdin)')
  .addOption(new Option('-p, --platform <id>', 'thread platform').choices(Object.keys(socialPlatforms)).default('x'))
  .option('-m, --model <id>', 'model id (default claude-opus-5-5)')
  .option('--json', 'print raw JSON')
  .action(async (task: AiTask, file, o) => {
    const cfg = aiConfigFromEnv({ model: o.model });
    console.error(c.dim(`… ${cfg.provider === 'anthropic' ? 'Claude' : cfg.baseURL} · ${cfg.model || 'default model'}`));
    const r = (await aiSuggest({ file }, task, cfg, o.platform)) as unknown as Record<string, unknown>;
    if (o.json) {
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
      return;
    }
    for (const [k, v] of Object.entries(r)) {
      console.log(c.bold(k));
      if (Array.isArray(v)) v.forEach((x, i) => console.log(`  ${i + 1}. ${String(x).replace(/\n/g, '\n     ')}`));
      else console.log('  ' + String(v).replace(/\n/g, '\n  '));
      console.log();
    }
  });

program
  .command('cover')
  .description('generate a cover image (title etc. default to the article front matter)')
  .argument('[file]', 'markdown file (optional)')
  .option('-o, --out <file>', 'output PNG')
  .addOption(new Option('-s, --size <id>', 'size preset').choices(Object.keys(coverSizes)).default('xhs'))
  .addOption(new Option('-t, --template <id>', 'template').choices(coverTemplates.map((t) => t.id)).default('aurora'))
  .option('--title <text>', 'title (use \\n for line breaks, ==x== to highlight)')
  .option('--subtitle <text>')
  .option('--author <name>')
  .option('--badge <text>', 'small label, e.g. 干货')
  .option('--emoji <char>')
  .option('--tags <list>', 'comma separated', (v) => v.split(/[,，]/).map((s) => s.trim()).filter(Boolean))
  .option('--accent <hex>', 'accent colour')
  .option('--background <img>', 'background image path / URL')
  .option('--all', 'render every template for this size')
  .action(async (file, o) => {
    try {
      const templates: CoverTemplateId[] = o.all ? coverTemplates.map((t) => t.id) : [o.template];
      for (const template of templates) {
        const out = o.all
          ? resolve(o.out ?? '.', `${stem(file)}-cover-${o.size}-${template}.png`)
          : (o.out ?? `${stem(file)}-cover-${o.size}.png`);
        const r = await coverExport(file ? { file } : null, {
          out, size: o.size as CoverSizeId, template, title: o.title?.replace(/\\n/g, '\n'), subtitle: o.subtitle,
          author: o.author, badge: o.badge, emoji: o.emoji, tags: o.tags, accent: o.accent, background: o.background,
        });
        console.error(c.green('✓ ') + `${r.file} ${c.dim(`${r.width}×${r.height}`)}`);
      }
    } finally {
      await closeBrowser();
    }
  });

const publish = program.command('publish').description('publish to a platform');
styleOptions(
  publish
    .command('wechat')
    .description('upload images + cover and create a draft in the WeChat Official Account (草稿箱)')
    .argument('<file>', 'markdown file')
    .option('--appid <id>', 'AppID (or env MD2_WECHAT_APPID)')
    .option('--secret <secret>', 'AppSecret (or env MD2_WECHAT_SECRET)')
    .option('--cover <img>', 'cover image (default: front matter cover → first image → generated)')
    .addOption(new Option('--cover-template <id>', 'template for a generated cover').choices(coverTemplates.map((t) => t.id)))
    .option('--author <name>')
    .option('--digest <text>', 'summary shown in the feed')
    .option('--source-url <url>', '阅读原文 link')
    .option('--open-comment', 'enable comments')
    .option('--dry-run', 'do everything except calling the API'),
).action(async (file, o) => {
  try {
    const r = await publishWechat({ file }, {
      appId: o.appid, appSecret: o.secret, cover: o.cover, coverTemplate: o.coverTemplate, author: o.author,
      digest: o.digest, sourceUrl: o.sourceUrl, openComment: o.openComment, dryRun: o.dryRun, ...style(o),
      onProgress: (m) => console.error(c.dim(m)),
    });
    warn(r.warnings);
    console.error(c.green(`✓ draft ${r.mediaId} — open mp.weixin.qq.com → 内容管理 → 草稿箱`));
  } finally {
    await closeBrowser();
  }
});

program
  .command('themes')
  .description('list themes, code themes, card styles, cover templates and sizes')
  .action(() => {
    console.log(c.bold('Article themes'));
    themes.forEach((t) => console.log(`  ${t.id.padEnd(12)} ${t.name} ${c.dim('· ' + t.description)}`));
    console.log(c.bold('\nCode themes'));
    codeThemes.forEach((t) => console.log(`  ${t.id.padEnd(18)} ${t.name}${t.dark ? c.dim(' (dark)') : ''}`));
    console.log(c.bold('\nXHS card styles'));
    xhsCardStyles.forEach((s) => console.log(`  ${s.id.padEnd(12)} ${s.name}`));
    console.log(c.bold('\nCover templates'));
    coverTemplates.forEach((t) => console.log(`  ${t.id.padEnd(12)} ${t.name}`));
    console.log(c.bold('\nThread platforms'));
    Object.values(socialPlatforms).forEach((p) => console.log(`  ${p.id.padEnd(12)} ${p.name} · ${p.limit}`));
    console.log(c.bold('\nCover sizes'));
    Object.entries(coverSizes).forEach(([id, s]) => console.log(`  ${id.padEnd(14)} ${s.width}×${s.height}  ${s.label}`));
  });

program
  .command('mcp')
  .description('run as an MCP server (stdio) for Claude, Cursor and other agents')
  .action(async () => {
    await startMcpServer(VERSION);
  });

function previewPage(title: string, body: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/</g, '&lt;')}</title>
<style>body{margin:0;background:#f3f3f3}main{max-width:680px;margin:24px auto;background:#fff;padding:28px 22px;box-shadow:0 1px 4px rgba(0,0,0,.06)}</style></head>
<body><main>${body}</main></body></html>`;
}

program.parseAsync().catch(async (e) => {
  console.error('\x1b[31m✗ ' + (e as Error).message + '\x1b[0m');
  await closeBrowser();
  process.exit(1);
});
