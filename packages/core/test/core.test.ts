import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseMarkdown, renderWechat, renderZhihu, renderX, renderXhs, renderXhsText, renderCover,
  tweetLength, inlineCss, specificity, themes, codeThemes, coverTemplates, coverSizes,
} from '../src/index.js';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';

const demo = readFileSync(new URL('../../../examples/demo.md', import.meta.url), 'utf8');

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
});

describe('zhihu', () => {
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
