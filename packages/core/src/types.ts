import type { Root } from 'hast';

export type Platform = 'wechat' | 'zhihu' | 'xhs' | 'x';

/** YAML front matter recognised by md2. Unknown keys are preserved. */
export interface FrontMatter {
  title?: string;
  subtitle?: string;
  author?: string;
  description?: string;
  digest?: string;
  cover?: string;
  tags?: string[] | string;
  /** Per-platform overrides, e.g. `xhs: { title: "..." }` */
  wechat?: Record<string, unknown>;
  zhihu?: Record<string, unknown>;
  xhs?: Record<string, unknown>;
  x?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParsedDoc {
  markdown: string;
  hast: Root;
  frontmatter: FrontMatter;
  /** frontmatter.title, else the text of the first H1 */
  title: string;
  /** Plain-text summary (first paragraph, ≤ 120 chars) */
  summary: string;
  tags: string[];
  /** Image URLs in document order */
  images: string[];
  /** True when the document contains TeX math (call `preloadMath()` first) */
  hasMath: boolean;
  /** Fenced diagram blocks (```mermaid) in document order */
  diagrams: { lang: string; code: string }[];
}

/** Resolve a diagram code block to a standalone SVG string (or undefined to keep it as code). */
export type DiagramResolver = (lang: string, code: string) => string | undefined;

export interface RenderWarning {
  code: string;
  message: string;
}
