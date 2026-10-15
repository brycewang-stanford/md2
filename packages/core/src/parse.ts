import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { parse as parseYaml } from 'yaml';
import { visit } from 'unist-util-visit';
import { toText } from 'hast-util-to-text';
import type { Root as MdRoot, Blockquote, Paragraph } from 'mdast';
import type { Root, Element } from 'hast';
import type { FrontMatter, ParsedDoc } from './types.js';

const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

/**
 * GitHub-style alerts (`> [!TIP]`) → `<div class="callout callout-tip">`.
 * Unlike the upstream plugin we emit no SVG icons: titles are plain text so
 * every platform (and the CSS inliner) can style them.
 */
function remarkCallouts() {
  return (tree: MdRoot) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0];
      if (!first || first.type !== 'paragraph') return;
      const head = (first as Paragraph).children[0];
      if (!head || head.type !== 'text') return;
      const m = head.value.match(ALERT_RE);
      if (!m) return;
      const kind = m[1].toLowerCase();
      head.value = head.value.slice(m[0].length);
      // Drop an empty leading text / line break left behind by `[!TIP]\n`
      if (!head.value) {
        first.children.shift();
        if (first.children[0]?.type === 'break') first.children.shift();
      }
      if (first.children.length === 0) node.children.shift();
      node.data = {
        hName: 'div',
        hProperties: { className: ['callout', `callout-${kind}`], dataCallout: kind },
      };
      node.children.unshift({
        type: 'paragraph',
        data: { hProperties: { className: ['callout-title'] } },
        children: [{ type: 'text', value: CALLOUT_TITLES[kind] ?? kind.toUpperCase() }],
      });
    });
  };
}

export const CALLOUT_TITLES: Record<string, string> = {
  note: 'ℹ️ 说明',
  tip: '💡 提示',
  important: '📌 重要',
  warning: '⚠️ 注意',
  caution: '🚫 警告',
};

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkCallouts)
  .use(remarkRehype, {
    allowDangerousHtml: true,
    footnoteLabel: '注释',
    footnoteBackLabel: '返回',
  })
  .use(rehypeRaw);

function readFrontmatter(mdast: MdRoot): FrontMatter {
  const node = mdast.children[0];
  if (!node || node.type !== 'yaml') return {};
  try {
    const data = parseYaml(node.value);
    return data && typeof data === 'object' ? (data as FrontMatter) : {};
  } catch {
    return {};
  }
}

export function normalizeTags(tags: unknown): string[] {
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(/[,，\s]+/);
  return list.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean);
}

/** Parse Markdown into a hast tree plus the metadata every platform needs. */
export function parseMarkdown(markdown: string): ParsedDoc {
  const mdast = processor.parse(markdown) as MdRoot;
  const frontmatter = readFrontmatter(mdast);
  const hast = processor.runSync(mdast) as Root;

  let firstH1 = '';
  let summary = '';
  const images: string[] = [];
  visit(hast, 'element', (el: Element) => {
    if (!firstH1 && el.tagName === 'h1') firstH1 = toText(el).trim();
    if (!summary && el.tagName === 'p') {
      const text = toText(el).trim();
      if (text.length > 8) summary = text;
    }
    if (el.tagName === 'img' && typeof el.properties?.src === 'string') images.push(el.properties.src);
  });
  if (summary.length > 120) summary = summary.slice(0, 118) + '…';

  return {
    markdown,
    hast,
    frontmatter,
    title: String(frontmatter.title ?? firstH1 ?? '').trim(),
    summary: String(frontmatter.description ?? frontmatter.digest ?? summary),
    tags: normalizeTags(frontmatter.tags),
    images,
  };
}
