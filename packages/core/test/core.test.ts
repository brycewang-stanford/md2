import { beforeAll, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseMarkdown, renderWechat, renderZhihu, renderX, renderXhs, renderXhsText, renderCover,
  tweetLength, inlineCss, specificity, themes, codeThemes, coverTemplates, coverSizes,
  preloadMath, renderLongImage, toUnicodeBold, socialPlatforms, aiXhsCopy, aiThread, articleText, AiError,
  texToSvg, isPublicImage, zhihuImageCandidates, lookupImage,
} from '../src/index.js';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';

const demo = readFileSync(new URL('../../../examples/demo.md', import.meta.url), 'utf8');

await preloadMath();
beforeAll(async () => {
  await preloadMath();
});

describe('parse', () => {
  test('front matter, title, tags, summary', () => {
    const d = parseMarkdown(demo);
    expect(d.title).toBe('一篇 Markdown，发遍公众号、知乎、小红书和 X');
    expect(d.tags).toEqual(['Markdown', '公众号排版', '效率工具']);
    expect(d.summary.length).toBeGreaterThan(10);
  });
  test('title falls back to first H1', () => {
    expect(parseMarkdown('# Hello\n\ntext').title).toBe('Hello');
  });
  test('comma separated tags', () => {
    expect(parseMarkdown('---\ntags: a, b，c\n---\nx').tags).toEqual(['a', 'b', 'c']);
  });
});

describe('local images', () => {
  // VS Code keys its image map by the src as written; the renderer percent-encodes it
  const map = { 'images/1-封面.png': 'U1', 'images/5-bootstrap.gif': 'U2', '100%.png': 'U3' };
  test('non-ASCII file names resolve through the host map', () => {
    const { html } = renderWechat('![a](images/1-封面.png)\n\n![b](images/5-bootstrap.gif)', {
      resolveImage: (s) => lookupImage(map, s),
    });
    expect(html).toContain('src="U1"');
    expect(html).toContain('src="U2"');
  });
  test('parseMarkdown lists every src the renderer resolves', () => {
    // VS Code builds its map from parseMarkdown().images, so the two must agree
    const md = [
      '![a](images/1-封面.png "title")',
      '![b](<my pics/a b.png>)',
      '![c][ref]',
      '<img src="raw html.png" width="200">',
      '',
      '[ref]: refs/图.png',
    ].join('\n');
    const seen: string[] = [];
    renderWechat(md, { resolveImage: (s) => (seen.push(s), undefined) });
    const listed = parseMarkdown(md).images;
    expect(listed).toHaveLength(4);
    expect(new Set(seen)).toEqual(new Set(listed));
    expect(listed.map((s) => decodeURI(s))).toEqual(['images/1-封面.png', 'my pics/a b.png', 'refs/图.png', 'raw html.png']);
  });
  test('malformed escapes and unknown or inherited keys miss cleanly', () => {
    expect(lookupImage(map, '100%.png')).toBe('U3');
    expect(lookupImage(map, 'x%E5.png')).toBeUndefined();
    expect(lookupImage(map, 'missing.png')).toBeUndefined();
    expect(lookupImage(map, 'constructor')).toBeUndefined();
  });
});

describe('inlineCss', () => {
  test('specificity ordering and !important', () => {
    const tree = fromHtml('<section class="md2"><p class="x">a</p><p>b</p></section>', { fragment: true });
    inlineCss(tree, `.md2 { --c: red; } p { color: blue; } .md2 p { color: var(--c); } p.x { color: green !important; } .md2 .x { color: pink; }`);
    const html = toHtml(tree);
    expect(html).toContain('<p class="x" style="color: green">');
    expect(html).toContain('<p style="color: red">');
  });
  test('existing inline style wins', () => {
    const tree = fromHtml('<p style="color: black">a</p>', { fragment: true });
    inlineCss(tree, 'p { color: blue; margin: 0 }');
    expect(toHtml(tree)).toContain('style="color: blue; margin: 0; color: black"');
  });
  test('specificity', () => {
    expect(specificity('.md2 p')).toBeGreaterThan(specificity('p'));
    expect(specificity('#a')).toBeGreaterThan(specificity('.a.b.c'));
    expect(specificity('.md2 h2 .content')).toBe(201);
  });
});

describe('wechat', () => {
  const { html, warnings } = renderWechat(demo, { theme: 'claude' });
  test('no classes or style tags survive', () => {
    expect(html).not.toMatch(/ class="/);
    expect(html).not.toContain('<style');
    expect(html.startsWith('<section')).toBe(true);
  });
  test('inline styles and theme colour', () => {
    expect(html).toContain('#d97757');
    expect(html).toMatch(/<span style="color: #d97757[^"]*">✱ <\/span>/);
  });
  test('math → svg', () => {
    expect(html).toContain('<svg');
    expect(html).not.toContain('math-inline');
  });
  test('code keeps whitespace via nbsp + br', () => {
    expect(html).toContain('    ');
    expect(html).toMatch(/<br>/);
  });
  test('external links → numbered refs', () => {
    expect(html).not.toContain('href="https://github.com');
    expect(html).toContain('参考资料');
    expect(html).toContain('https://commonmark.org');
    expect(html).toMatch(/\[1\]/);
    expect(html).toMatch(/\[3\]/); // footnote + 2 links
  });
  test('callouts render', () => {
    expect(html).toContain('💡 提示');
  });
  test('no warnings for demo', () => {
    expect(warnings).toEqual([]);
  });
  test('every theme renders', { timeout: 30000 }, () => {
    for (const t of themes) for (const c of codeThemes) expect(renderWechat(demo, { theme: t.id, codeTheme: c.id }).html.length).toBeGreaterThan(1000);
  });
  test('primary colour override', () => {
    expect(renderWechat(demo, { theme: 'claude', primaryColor: '#123456' }).html).toContain('#123456');
  });
  test('local image warning', () => {
    expect(renderWechat('![a](./a.png)').warnings[0].code).toBe('local-image');
  });
  test('mp.weixin links are kept', () => {
    expect(renderWechat('[x](https://mp.weixin.qq.com/s/abc)').html).toContain('href="https://mp.weixin.qq.com/s/abc"');
  });
  test('only mp.weixin links stay links (WeChat refuses to publish any other <a href>)', () => {
    const md = '[a](https://x.com/a) <me@x.com> [m](mailto:m@x.com) [h](#top) [r](./r.md) [w](https://mp.weixin.qq.com/s/w) <a href="https://x.com/raw">raw</a>\n\nNote[^1]\n\n[^1]: See [inner](https://x.com/inner).';
    for (const linkReferences of [true, false]) {
      const { html } = renderWechat(md, { linkReferences });
      expect([...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])).toEqual(['https://mp.weixin.qq.com/s/w']);
    }
    expect(renderWechat(md).html).toContain('https://x.com/inner');
  });
  test('survives the WeChat editor: no div, task items in one block, no text gradients', () => {
    expect(html).not.toContain('<div');
    expect(html).toMatch(/<li[^>]*><section><span[^>]*>☑ <\/span> 公众号一键复制<\/section><\/li>/);
    expect(html).not.toMatch(/<(strong|span)[^>]*linear-gradient/);
    expect(html).not.toContain('line-height: 0; margin: 0 1px');
  });
});

describe('zhihu', () => {
  test('only public images survive Zhihu re-hosting', () => {
    expect(isPublicImage('https://example.com/a.png')).toBe(true);
    expect(isPublicImage('data:image/png;base64,AA')).toBe(true);
    expect(isPublicImage('docs/a.png')).toBe(false);
    expect(isPublicImage('https://file+.vscode-resource.vscode-cdn.net/Users/a.png')).toBe(false);
    expect(isPublicImage('http://localhost:5173/a.png')).toBe(false);
    expect(isPublicImage('blob:https://x/1')).toBe(false);
  });
  test('SVG and GitHub raw images get Zhihu-fetchable alternatives', () => {
    expect(zhihuImageCandidates('https://img.shields.io/pypi/v/StatsPAI.svg')).toEqual([
      'https://wsrv.nl/?url=https%3A%2F%2Fimg.shields.io%2Fpypi%2Fv%2FStatsPAI.svg&output=png',
    ]);
    expect(zhihuImageCandidates('https://raw.githubusercontent.com/o/r/main/docs/a.png')).toEqual([
      'https://wsrv.nl/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fo%2Fr%2Fmain%2Fdocs%2Fa.png',
      'https://cdn.jsdelivr.net/gh/o/r@main/docs/a.png',
    ]);
    expect(zhihuImageCandidates('https://github.com/o/r/blob/v1/a.png')[1]).toBe('https://cdn.jsdelivr.net/gh/o/r@v1/a.png');
    expect(zhihuImageCandidates('https://x.org/badge.svg')).toEqual(['https://wsrv.nl/?url=https%3A%2F%2Fx.org%2Fbadge.svg&output=png']);
    expect(zhihuImageCandidates('https://example.com/a.png')).toEqual([]);
    // idempotent: an alternative needs no further alternative
    for (const c of zhihuImageCandidates('https://raw.githubusercontent.com/o/r/main/a.svg')) expect(zhihuImageCandidates(c)).toEqual([]);
    const { html } = renderZhihu('![b](https://img.shields.io/badge/x-y-blue.svg)');
    expect(html).toContain('src="https://wsrv.nl/?url=https%3A%2F%2Fimg.shields.io%2Fbadge%2Fx-y-blue.svg&#x26;output=png"');
  });
  const { html } = renderZhihu(demo);
  test('equations use zhihu images; display ends with \\\\', () => {
    expect(html).toContain('eeimg="1"');
    expect(html).toContain('https://www.zhihu.com/equation?tex=E%20%3D%20mc%5E2"');
    expect(html).toMatch(/alt="[^"]*\\\\"/);
  });
  test('code blocks use <pre lang>', () => {
    expect(html).toContain('<pre lang="python">def fib');
  });
  test('no inline styles or classes', () => {
    expect(html).not.toMatch(/ style="| class="/);
  });
  test('title removed, footnote → native reference', () => {
    expect(html).not.toContain('<h1>');
    expect(html).toContain('data-draft-type="reference"');
  });
});

describe('x thread', () => {
  test('weighted length', () => {
    expect(tweetLength('hello')).toBe(5);
    expect(tweetLength('你好')).toBe(4);
    expect(tweetLength('see https://example.com/a/very/long/path?x=1')).toBe(4 + 23);
    expect(tweetLength('🚀')).toBe(2);
  });
  test('every post within limit and numbered', () => {
    const { tweets } = renderX(demo);
    expect(tweets.length).toBeGreaterThan(3);
    for (const t of tweets) expect(t.length).toBeLessThanOrEqual(280);
    expect(tweets[0].text).toContain('🧵');
    expect(tweets.at(-1)!.text).toMatch(new RegExp(`${tweets.length}/${tweets.length}$`));
  });
  test('intro paragraph is not repeated after the hook', () => {
    const { tweets } = renderX(demo);
    const intro = 'md2 是一个开源的多平台排版工具';
    expect(tweets.filter((t) => t.text.includes(intro)).length).toBe(1);
  });
  test('display math is kept as its own text', () => {
    const { tweets } = renderX(demo);
    expect(tweets.some((t) => t.text.includes('\\sqrt{\\pi}'))).toBe(true);
    expect(renderXhsText(demo).body).toContain('\\sqrt{\\pi}');
  });
  test('long paragraphs are split', () => {
    const long = '这是一句很长的话。'.repeat(80);
    const { tweets } = renderX(long, { titleFirst: false });
    expect(tweets.length).toBeGreaterThan(4);
    for (const t of tweets) expect(t.length).toBeLessThanOrEqual(280);
  });
  test('premium limit keeps one post', () => {
    const { tweets } = renderX('一段话。'.repeat(100), { limit: 25000, titleFirst: false });
    expect(tweets.length).toBe(1);
  });
});

describe('xhs', () => {
  test('text: title, emoji body, tags', () => {
    const t = renderXhsText(demo);
    expect(t.title).toBe('一篇 Markdown 发 4 个平台');
    expect(t.body).toContain('📌 为什么需要它');
    expect(t.body).toContain('1️⃣');
    expect(t.full).toContain('#公众号排版');
    expect(t.body).not.toContain('一篇 Markdown，发遍公众号');
  });
  test('layout has cover + themed content', () => {
    const r = renderXhs(demo, { theme: 'coral', cardStyle: 'notes' });
    expect(r.layout.cover?.html).toContain('cv-title');
    expect(r.layout.contentHtml).toContain('class="md2"');
    expect(r.layout.contentHtml).not.toContain('<h1');
    expect(r.layout.vars['--md2-primary']).toBe('#ff5a5f');
  });
});

describe('cover', () => {
  test('all templates × sizes render', () => {
    for (const t of coverTemplates)
      for (const s of Object.keys(coverSizes))
        expect(renderCover({ title: 'Hello 世界', template: t.id, size: s as keyof typeof coverSizes, tags: ['a'] }).html).toContain(`cv-${t.id}`);
  });
  test('escapes html and supports highlight', () => {
    const { html } = renderCover({ title: '<b>x</b> ==重点==' });
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('<mark>重点</mark>');
  });
  test('wide sizes use wide layout', () => {
    expect(renderCover({ title: 'x', size: 'wechat' }).html).toContain('cv-wide');
  });
});

describe('v0.2 engine', () => {
  test('parse flags math and diagrams', () => {
    const d = parseMarkdown('$x$\n\n```mermaid\ngraph TD; A-->B\n```');
    expect(d.hasMath).toBe(true);
    expect(d.diagrams).toEqual([{ lang: 'mermaid', code: 'graph TD; A-->B' }]);
    expect(parseMarkdown('plain').hasMath).toBe(false);
  });
  test('diagram resolver swaps the code block for SVG', () => {
    const md = '```mermaid\ngraph TD; A-->B\n```';
    const html = renderWechat(md, { diagram: () => '<svg id="d"></svg>' }).html;
    expect(html).toContain('<svg id="d"></svg>');
    expect(html).not.toContain('graph TD');
    expect(renderWechat(md).html).toContain('graph');
  });
  test('tuning options', () => {
    const html = renderWechat('para one\n\n> quote', { textIndent: true, justify: true, paragraphSpacing: 2, letterSpacing: 0.1 }).html;
    expect(html).toMatch(/<p style="[^"]*text-indent: 2em/);
    expect(html).toMatch(/<section[^>]*text-align: justify/);
    expect(html).toMatch(/margin-bottom: 2em/);
    expect(html).not.toMatch(/<blockquote[^>]*>\s*<p style="[^"]*text-indent/);
  });
  test('long image wraps the article with header and footer', () => {
    const r = renderLongImage(demo, { theme: 'linear' });
    expect(r.html).toContain('class="md2-long"');
    expect(r.html).toContain('一篇 Markdown，发遍公众号');
    expect(r.html).toContain('>md2</footer>');
    expect(r.html).not.toMatch(/font-family:[^;"]*"[^>]*<h1/);
    expect(r.width).toBe(540);
  });
  test('unicode bold', () => {
    expect(toUnicodeBold('Hi 9 你好')).toBe('𝗛𝗶 𝟵 你好');
  });
  test('each social platform respects its limit', () => {
    for (const id of Object.keys(socialPlatforms) as (keyof typeof socialPlatforms)[]) {
      const p = socialPlatforms[id];
      const r = renderX(demo, { platform: id });
      expect(r.platform).toBe(id);
      for (const t of r.tweets) expect(p.count(t.text)).toBeLessThanOrEqual(p.limit);
    }
    expect(renderX(demo, { platform: 'linkedin' }).tweets.length).toBe(1);
    expect(renderX('# Title\n\n## Section\n\ntext', { platform: 'linkedin' }).tweets[0].text).toContain('𝗦𝗲𝗰𝘁𝗶𝗼𝗻');
  });
  test('math falls back to TeX code before the engine loads', () => {
    expect(texToSvg('x', false)).toContain('<svg');
  });
});

describe('ai', () => {
  test('articleText is compact and keeps headings', () => {
    const t = articleText(demo);
    expect(t).toContain('## 为什么需要它');
    expect(t).not.toMatch(/<(section|p|h2|svg)\b/);
  });
  test('openai-compatible provider parses JSON (with fenced output and retry without response_format)', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      if (body.response_format) return new Response('bad', { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"titles":["a"],"body":"b","tags":["t"]}\n```' } }] }));
    }));
    const r = await aiXhsCopy({ provider: 'openai', apiKey: 'k', baseURL: 'https://api.example.com/v1/', model: 'm' }, demo);
    expect(r).toEqual({ titles: ['a'], body: 'b', tags: ['t'] });
    expect(calls.length).toBe(2);
    vi.unstubAllGlobals();
  });
  test('anthropic provider sends structured output + fallbacks via the SDK', async () => {
    let seen: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const req = url instanceof Request ? url : new Request(String(url), init);
      seen = { url: req.url, headers: req.headers, body: JSON.parse(await req.text()) };
      return new Response(JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'text', text: '{"posts":["hello","world"]}' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }), { headers: { 'content-type': 'application/json' } });
    }));
    const r = await aiThread({ provider: 'anthropic', apiKey: 'sk-test' }, demo, 'x');
    expect(r.posts).toEqual(['hello', 'world']);
    expect(seen!.url).toContain('/v1/messages');
    expect(seen!.body.model).toBe('claude-opus-5-5');
    expect(seen!.body.fallbacks).toBe('default');
    expect((seen!.body.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    expect(seen!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    vi.unstubAllGlobals();
  });
  test('missing key', async () => {
    await expect(aiThread({ provider: 'anthropic', apiKey: '' }, demo)).rejects.toBeInstanceOf(AiError);
  });
});
