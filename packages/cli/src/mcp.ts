import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import {
  themes, codeThemes, coverTemplates, coverSizes, xhsCardStyles, socialPlatforms, type CoverSizeId, type CoverTemplateId,
  type XhsCardStyle, type SocialPlatformId,
} from '@md2/core';
import { closeBrowser } from './browser.js';
import {
  wechatHtml, zhihuHtml, xThread, xhsExport, coverExport, publishWechat, longExport, aiSuggest, aiConfigFromEnv, type Source, type AiTask,
} from './actions.js';

const source = {
  path: z.string().optional().describe('Path to a Markdown file'),
  markdown: z.string().optional().describe('Markdown text (used when path is not given)'),
};
const style = {
  theme: z.enum(themes.map((t) => t.id) as [string, ...string[]]).optional().describe('Article theme'),
  codeTheme: z.enum(codeThemes.map((t) => t.id) as [string, ...string[]]).optional(),
  primaryColor: z.string().optional().describe('Hex colour overriding the theme accent'),
};

function src(a: { path?: string; markdown?: string }): Source {
  if (!a.path && a.markdown === undefined) throw new Error('Provide `path` or `markdown`');
  return a.path ? { file: resolve(a.path) } : { markdown: a.markdown };
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

export async function startMcpServer(version: string) {
  const server = new McpServer({ name: 'md2', version });

  server.registerTool('md2_wechat', {
    title: 'Render WeChat article HTML',
    description: 'Convert Markdown to WeChat Official Account (公众号) HTML with every style inlined, ready to paste into the WeChat editor.',
    inputSchema: { ...source, ...style },
  }, async (a) => {
    const r = await wechatHtml(src(a), { theme: a.theme, codeTheme: a.codeTheme, primaryColor: a.primaryColor });
    return text(r.html + (r.warnings.length ? `\n\n<!-- warnings: ${r.warnings.map((w) => w.message).join('; ')} -->` : ''));
  });

  server.registerTool('md2_zhihu', {
    title: 'Render Zhihu article HTML',
    description: 'Convert Markdown to Zhihu (知乎) HTML: formulas as Zhihu equations, code blocks with lang, footnotes as native references.',
    inputSchema: { ...source },
  }, async (a) => text((await zhihuHtml(src(a))).html));

  server.registerTool('md2_thread', {
    title: 'Split into a social thread',
    description: 'Split a Markdown article into a thread for X (weighted length: CJK = 2, URL = 23), Threads, Bluesky, Mastodon, or a single LinkedIn post.',
    inputSchema: {
      ...source,
      platform: z.enum(Object.keys(socialPlatforms) as [string, ...string[]]).optional().describe('Default x'),
      limit: z.number().int().optional().describe('Max length per post (platform default)'),
    },
  }, async (a) => text(JSON.stringify((await xThread(src(a), { platform: a.platform as SocialPlatformId | undefined, limit: a.limit })).tweets, null, 2)));

  server.registerTool('md2_long_image', {
    title: 'Render a long image',
    description: 'Render the whole article as one tall PNG (长图, 1080 px wide) for WeChat Moments, Weibo or Xiaohongshu. Requires Chrome or Playwright Chromium.',
    inputSchema: { ...source, ...style, out: z.string().describe('Output PNG path') },
  }, async (a) => {
    const r = await longExport(src(a), { out: resolve(a.out), theme: a.theme, codeTheme: a.codeTheme, primaryColor: a.primaryColor });
    return text(JSON.stringify(r));
  });

  server.registerTool('md2_ai', {
    title: 'AI copywriting',
    description: 'Generate platform copy with the configured model (ANTHROPIC_API_KEY, or MD2_AI_BASE_URL/MD2_AI_API_KEY/MD2_AI_MODEL): xhs = 5 小红书 titles + caption + tags; thread = rewritten thread; wechat = 5 公众号 headlines + digest; cover = cover copy.',
    inputSchema: {
      ...source,
      task: z.enum(['xhs', 'thread', 'wechat', 'cover']),
      platform: z.enum(Object.keys(socialPlatforms) as [string, ...string[]]).optional(),
    },
  }, async (a) => text(JSON.stringify(await aiSuggest(src(a), a.task as AiTask, aiConfigFromEnv(), (a.platform as SocialPlatformId) ?? 'x'), null, 2)));

  server.registerTool('md2_xhs_cards', {
    title: 'Render Xiaohongshu image cards',
    description: 'Render a Markdown article into 小红书 3:4 image cards (1080×1440 PNG) with a cover, plus a caption (title ≤20, body ≤1000, hashtags). Requires Chrome or Playwright Chromium.',
    inputSchema: {
      ...source, ...style,
      outDir: z.string().describe('Directory for PNG files'),
      cardStyle: z.enum(xhsCardStyles.map((s) => s.id) as [string, ...string[]]).optional(),
      author: z.string().optional(),
      coverTemplate: z.enum(coverTemplates.map((t) => t.id) as [string, ...string[]]).optional(),
    },
  }, async (a) => {
    const r = await xhsExport(src(a), {
      outDir: resolve(a.outDir), theme: a.theme, codeTheme: a.codeTheme, primaryColor: a.primaryColor,
      cardStyle: a.cardStyle as XhsCardStyle | undefined, author: a.author,
      cover: a.coverTemplate ? { template: a.coverTemplate as CoverTemplateId } : true,
    });
    return text(JSON.stringify({ files: r.files, title: r.text.title, caption: r.text.full, warnings: r.warnings }, null, 2));
  });

  server.registerTool('md2_cover', {
    title: 'Generate a cover image',
    description: `Generate a cover PNG. Sizes: ${Object.entries(coverSizes).map(([k, v]) => `${k} (${v.width}×${v.height})`).join(', ')}.`,
    inputSchema: {
      path: z.string().optional().describe('Markdown file to take title/subtitle/author/tags from'),
      out: z.string().describe('Output PNG path'),
      size: z.enum(Object.keys(coverSizes) as [string, ...string[]]).optional(),
      template: z.enum(coverTemplates.map((t) => t.id) as [string, ...string[]]).optional(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      author: z.string().optional(),
      badge: z.string().optional(),
      emoji: z.string().optional(),
      tags: z.array(z.string()).optional(),
      accent: z.string().optional(),
      background: z.string().optional().describe('Background image path or URL'),
    },
  }, async (a) => {
    const r = await coverExport(a.path ? { file: resolve(a.path) } : null, {
      ...a, out: resolve(a.out), size: a.size as CoverSizeId | undefined, template: a.template as CoverTemplateId | undefined,
    });
    return text(JSON.stringify(r));
  });

  server.registerTool('md2_publish_wechat_draft', {
    title: 'Create a WeChat draft',
    description: 'Upload images and cover, then create a draft in the WeChat Official Account 草稿箱. Needs MD2_WECHAT_APPID / MD2_WECHAT_SECRET env vars and a whitelisted IP. Never publishes publicly.',
    inputSchema: { path: z.string(), ...style, dryRun: z.boolean().optional() },
  }, async (a) => {
    const r = await publishWechat({ file: resolve(a.path) }, { theme: a.theme, codeTheme: a.codeTheme, primaryColor: a.primaryColor, dryRun: a.dryRun });
    return text(JSON.stringify({ mediaId: r.mediaId, title: r.article.title, warnings: r.warnings }));
  });

  server.registerTool('md2_list_styles', {
    title: 'List md2 styles',
    description: 'List article themes, code themes, XHS card styles, cover templates and sizes.',
    inputSchema: {},
  }, async () =>
    text(JSON.stringify({
      themes: themes.map(({ id, name, description }) => ({ id, name, description })),
      codeThemes: codeThemes.map(({ id, name, dark }) => ({ id, name, dark })),
      xhsCardStyles, coverTemplates, coverSizes,
      threadPlatforms: Object.values(socialPlatforms).map(({ id, name, limit }) => ({ id, name, limit })),
    }, null, 2)),
  );

  const shutdown = async () => {
    await closeBrowser();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('end', shutdown);

  await server.connect(new StdioServerTransport());
}
