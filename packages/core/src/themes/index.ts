import { mix, rgba, readableOn } from './color.js';
import { getCodeTheme } from './code.js';

export { codeThemes, getCodeTheme, type CodeTheme } from './code.js';
export * from './color.js';

export interface Theme {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  primary: string;
  /** Default code theme for this article theme */
  codeTheme: string;
  /** Extra CSS variables (override base defaults) */
  vars?: Record<string, string>;
  /** Text injected into heading `.prefix` / `.suffix` spans */
  prefix?: Partial<Record<'h1' | 'h2' | 'h3' | 'h4', string>>;
  suffix?: Partial<Record<'h1' | 'h2' | 'h3' | 'h4', string>>;
  css: string;
}

export const FONT_STACKS = {
  sans: `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif`,
  serif: `Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", "Source Han Serif SC", STSong, SimSun, serif`,
  mono: `"SF Mono", Menlo, Consolas, "JetBrains Mono", "Courier New", monospace`,
};

export interface StyleOptions {
  theme?: string;
  codeTheme?: string;
  /** Override the theme's primary colour */
  primaryColor?: string;
  /** Base font size in px (default 16) */
  fontSize?: number;
  /** 'sans' | 'serif' | any CSS font-family */
  fontFamily?: string;
  lineHeight?: number;
  /** Space after paragraphs, in em */
  paragraphSpacing?: number;
  /** Letter spacing, in em */
  letterSpacing?: number;
  /** 首行缩进: indent body paragraphs by 2em */
  textIndent?: boolean;
  /** Justify body text */
  justify?: boolean;
  /** Force heading alignment */
  headingAlign?: 'left' | 'center';
  /** Appended after the theme, highest priority */
  customCss?: string;
}

/** Structure shared by every theme. Themes only override what makes them distinct. */
const BASE_CSS = `
.md2 {
  font-family: var(--md2-font); font-size: var(--md2-fs); line-height: var(--md2-lh);
  color: var(--md2-text); letter-spacing: 0.02em; word-break: break-word; overflow-wrap: break-word;
  text-align: left;
}
.md2 p { margin: 0 0 1.1em; }
.md2 h1, .md2 h2, .md2 h3, .md2 h4, .md2 h5, .md2 h6 { margin: 1.8em 0 0.9em; line-height: 1.4; font-weight: bold; color: var(--md2-heading); }
.md2 h1 { font-size: var(--md2-fs-h1); margin-top: 0.6em; }
.md2 h2 { font-size: var(--md2-fs-h2); }
.md2 h3 { font-size: var(--md2-fs-h3); }
.md2 h4, .md2 h5, .md2 h6 { font-size: var(--md2-fs); }
.md2 h1 .prefix, .md2 h2 .prefix, .md2 h3 .prefix, .md2 h4 .prefix { color: var(--md2-primary); }
.md2 strong { font-weight: bold; color: var(--md2-strong); }
.md2 em { font-style: italic; }
.md2 del { text-decoration: line-through; color: var(--md2-muted); }
.md2 mark { background: var(--md2-mark); color: inherit; padding: 0 2px; border-radius: 2px; }
.md2 a, .md2 .link { color: var(--md2-primary); text-decoration: none; border-bottom: 1px solid var(--md2-primary-soft); }
.md2 sup.footnote-ref { color: var(--md2-primary); font-size: 0.72em; line-height: 0; margin: 0 1px; }
.md2 blockquote { margin: 1.3em 0; padding: 0.9em 1.1em; border-left: 4px solid var(--md2-primary); background: var(--md2-quote-bg); color: var(--md2-quote-text); border-radius: 0 6px 6px 0; }
.md2 blockquote p { margin: 0.35em 0; }
.md2 ul, .md2 ol { margin: 0.9em 0; padding-left: 1.7em; }
.md2 ul { list-style-type: disc; }
.md2 ol { list-style-type: decimal; }
.md2 ul ul, .md2 ol ul { list-style-type: circle; }
.md2 ul ul ul { list-style-type: square; }
.md2 li { margin: 0.35em 0; }
.md2 li p { margin: 0; }
.md2 li ul, .md2 li ol { margin: 0.2em 0; }
.md2 code { font-family: var(--md2-mono); font-size: 0.88em; padding: 2px 5px; margin: 0 2px; border-radius: 4px; background: var(--md2-code-inline-bg); color: var(--md2-code-inline); }
.md2 pre { margin: 1.3em 0; padding: 0; border-radius: 8px; background: var(--md2-code-bg); color: var(--md2-code-text); text-align: left; overflow-x: auto; }
.md2 pre code { display: block; padding: 0.9em 1em 1em; margin: 0; overflow-x: auto; font-size: 13px; line-height: 1.65; color: var(--md2-code-text); background: none; border-radius: 0; white-space: nowrap; letter-spacing: 0; }
.md2 pre .mac-dots { display: block; padding: 12px 14px 0; line-height: 0; }
.md2 figure { margin: 1.4em 0; text-align: center; }
.md2 img { max-width: 100%; height: auto; border-radius: 6px; }
.md2 figure img { display: block; margin: 0 auto; }
.md2 figcaption { margin-top: 0.6em; font-size: 0.8em; color: var(--md2-muted); text-align: center; line-height: 1.5; }
.md2 .table-wrap { margin: 1.3em 0; overflow-x: auto; }
.md2 table { border-collapse: collapse; width: 100%; font-size: 0.88em; line-height: 1.6; }
.md2 th { background: var(--md2-th-bg); font-weight: bold; color: var(--md2-heading); }
.md2 th, .md2 td { border: 1px solid var(--md2-border); padding: 7px 10px; text-align: left; }
.md2 hr { border: none; border-top: 1px solid var(--md2-border); margin: 2.2em 0; height: 0; }
.md2 .math-block { display: block; margin: 1.1em 0; text-align: center; overflow-x: auto; overflow-y: hidden; }
.md2 .math-inline { display: inline; }
.md2 .callout { margin: 1.3em 0; padding: 0.85em 1.1em; border-radius: 8px; border-left: 4px solid #0969da; background: #f0f6ff; }
.md2 .callout p { margin: 0.3em 0; }
.md2 .callout .callout-title { font-weight: bold; margin: 0 0 0.35em; }
.md2 .callout-note { border-left-color: #0969da; background: #eef5ff; }
.md2 .callout-note .callout-title { color: #0969da; }
.md2 .callout-tip { border-left-color: #1a7f37; background: #eefaf1; }
.md2 .callout-tip .callout-title { color: #1a7f37; }
.md2 .callout-important { border-left-color: #8250df; background: #f6f1ff; }
.md2 .callout-important .callout-title { color: #8250df; }
.md2 .callout-warning { border-left-color: #bf8700; background: #fff8e5; }
.md2 .callout-warning .callout-title { color: #9a6700; }
.md2 .callout-caution { border-left-color: #cf222e; background: #fff0f0; }
.md2 .callout-caution .callout-title { color: #cf222e; }
.md2 .refs { margin-top: 2.4em; padding-top: 1em; border-top: 1px dashed var(--md2-border); font-size: 0.8em; line-height: 1.7; color: var(--md2-muted); }
.md2 .refs-title { font-weight: bold; color: var(--md2-heading); margin: 0 0 0.6em; font-size: 1.05em; }
.md2 .ref-item { margin: 0.3em 0; word-break: break-all; }
.md2 .ref-num { color: var(--md2-primary); margin-right: 4px; }
.md2 .ref-url { color: var(--md2-muted); font-style: italic; }
.md2 kbd { font-family: var(--md2-mono); font-size: 0.85em; padding: 1px 6px; border: 1px solid var(--md2-border); border-bottom-width: 2px; border-radius: 4px; background: #fafafa; }
.md2 .task { color: var(--md2-primary); }
.md2 .diagram { display: block; margin: 1.3em 0; text-align: center; overflow-x: auto; }
`;

export const themes: Theme[] = [
  {
    id: 'claude',
    name: 'Claude',
    nameEn: 'Claude',
    description: '暖象牙 + 陶土橙，衬线标题，安静克制',
    descriptionEn: 'Warm ivory and clay, serif headings, calm',
    primary: '#d97757',
    codeTheme: 'rose-pine-dawn',
    prefix: { h2: '✱ ' },
    vars: {
      '--md2-text': '#3d3d3a', '--md2-heading': '#141413', '--md2-strong': '#141413', '--md2-muted': '#87867f',
      '--md2-quote-bg': '#f0eee6', '--md2-quote-text': '#3d3d3a', '--md2-border': '#e8e6dc', '--md2-th-bg': '#f5f4ef',
      '--md2-code-inline': '#a8482a', '--md2-code-inline-bg': '#f0eee6',
    },
    css: `
.md2 h1, .md2 h2, .md2 h3 { font-family: var(--md2-serif); font-weight: 600; letter-spacing: -0.005em; }
.md2 h1 { font-size: var(--md2-fs-h1); line-height: 1.3; }
.md2 h2 .prefix { color: var(--md2-primary); font-family: var(--md2-font); }
.md2 h3 { color: #141413; }
.md2 blockquote { border-left: 0; border-radius: 12px; padding: 1em 1.2em; }
.md2 pre { border-radius: 12px; border: 1px solid #e8e6dc; }
.md2 a, .md2 .link { color: #141413; border-bottom: 1px solid var(--md2-primary); }
.md2 strong { background: linear-gradient(transparent 62%, rgba(217, 119, 87, 0.22) 62%); }`,
  },
  {
    id: 'linear',
    name: 'Linear',
    nameEn: 'Linear',
    description: '靛紫强调，紧凑无衬线，产品发布感',
    descriptionEn: 'Indigo accent, tight sans, product-launch feel',
    primary: '#5e6ad2',
    codeTheme: 'github-light',
    vars: {
      '--md2-text': '#3c4149', '--md2-heading': '#08090a', '--md2-strong': '#08090a', '--md2-muted': '#8a8f98',
      '--md2-border': '#e6e7eb', '--md2-th-bg': '#f7f8f9', '--md2-quote-bg': '#f7f8fd',
      '--md2-code-inline': '#3c4149', '--md2-code-inline-bg': '#f4f5f8',
    },
    css: `
.md2 h1, .md2 h2, .md2 h3 { font-weight: 600; letter-spacing: -0.012em; }
.md2 h1 { font-size: var(--md2-fs-h1); line-height: 1.25; }
.md2 h2 { margin-top: 2.2em; }
.md2 h3 { color: var(--md2-primary); }
.md2 blockquote { border-left: 2px solid var(--md2-primary); border-radius: 0 8px 8px 0; }
.md2 code { border: 1px solid #e6e7eb; border-radius: 5px; }
.md2 pre { border: 1px solid #e6e7eb; border-radius: 10px; }
.md2 pre code { border: 0; }
.md2 th { font-size: 0.86em; color: #8a8f98; font-weight: 600; letter-spacing: 0.04em; }
.md2 th, .md2 td { border: 0; border-bottom: 1px solid #ececf1; }`,
  },
  {
    id: 'geist',
    name: 'Geist 黑白',
    nameEn: 'Geist',
    description: 'Vercel 式纯黑白，细线网格，等宽点缀',
    descriptionEn: 'Vercel-style black & white, hairlines, mono accents',
    primary: '#000000',
    codeTheme: 'vitesse-light',
    prefix: { h3: '/ ' },
    vars: {
      '--md2-text': '#171717', '--md2-heading': '#000000', '--md2-strong': '#000000', '--md2-muted': '#8f8f8f',
      '--md2-border': '#eaeaea', '--md2-th-bg': '#fafafa', '--md2-quote-bg': '#fafafa', '--md2-quote-text': '#4d4d4d',
      '--md2-code-inline': '#171717', '--md2-code-inline-bg': '#f2f2f2',
    },
    css: `
.md2 h1, .md2 h2, .md2 h3 { font-weight: 700; letter-spacing: -0.02em; }
.md2 h1 { font-size: var(--md2-fs-h1); }
.md2 h2 { border-top: 1px solid #eaeaea; padding-top: 1em; }
.md2 h3 .prefix { color: #8f8f8f; font-family: var(--md2-mono); font-weight: 400; }
.md2 blockquote { border: 1px solid #eaeaea; border-radius: 12px; }
.md2 pre { border: 1px solid #eaeaea; border-radius: 12px; }
.md2 code { border-radius: 6px; }
.md2 a, .md2 .link { color: #000; border-bottom: 1px solid #000; }
.md2 hr { border-top: 1px dashed #d4d4d4; }`,
  },
  {
    id: 'apple',
    name: 'Apple 发布会',
    nameEn: 'Newsroom',
    description: 'SF 字体、大标题、#0071e3 链接蓝、圆角卡片',
    descriptionEn: 'SF type, big headlines, #0071e3 links, rounded cards',
    primary: '#0071e3',
    codeTheme: 'github-light',
    vars: {
      '--md2-text': '#1d1d1f', '--md2-heading': '#1d1d1f', '--md2-strong': '#1d1d1f', '--md2-muted': '#6e6e73',
      '--md2-border': '#e5e5ea', '--md2-th-bg': '#f5f5f7', '--md2-quote-bg': '#f5f5f7', '--md2-quote-text': '#1d1d1f',
      '--md2-code-inline': '#1d1d1f', '--md2-code-inline-bg': '#f5f5f7',
    },
    css: `
.md2 { letter-spacing: 0.01em; }
.md2 h1 { font-size: var(--md2-fs-h1); font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
.md2 h2 { font-weight: 700; letter-spacing: -0.015em; margin-top: 2.4em; }
.md2 h3 { font-weight: 600; }
.md2 blockquote { border-left: 0; border-radius: 18px; padding: 1.2em 1.4em; font-size: 1.08em; font-weight: 600; line-height: 1.6; }
.md2 pre { border-radius: 18px; }
.md2 img { border-radius: 14px; }
.md2 .callout { border-left: 0; border-radius: 18px; }
.md2 a, .md2 .link { border-bottom: 0; }`,
  },
  {
    id: 'editorial',
    name: '杂志编辑',
    nameEn: 'Editorial',
    description: '衬线正文、引语大字、细线分隔，长文阅读感',
    descriptionEn: 'Serif body, big pull quotes, fine rules — long reads',
    primary: '#b4441c',
    codeTheme: 'rose-pine-dawn',
    vars: {
      '--md2-font': 'var(--md2-serif)', '--md2-text': '#1f1d1a', '--md2-heading': '#111111', '--md2-strong': '#111111',
      '--md2-muted': '#7a756d', '--md2-border': '#ddd8cf', '--md2-quote-bg': 'transparent', '--md2-quote-text': '#111111',
    },
    css: `
.md2 { text-align: justify; }
.md2 h1 { text-align: center; font-size: var(--md2-fs-h1); font-weight: 700; line-height: 1.3; }
.md2 h2 { text-align: center; font-weight: 700; margin-top: 2.4em; }
.md2 h2 .content { display: inline-block; border-top: 1px solid #111; padding-top: 10px; }
.md2 h3 { color: var(--md2-primary); font-style: italic; }
.md2 blockquote { border-left: 0; border-top: 1px solid #111; border-bottom: 1px solid #111; border-radius: 0; text-align: center; font-size: 1.15em; font-style: italic; line-height: 1.65; padding: 1em 0.6em; }
.md2 figcaption { font-style: italic; }
.md2 table { border-top: 2px solid #111; border-bottom: 2px solid #111; }
.md2 th { background: transparent; border: 0; border-bottom: 1px solid #111; }
.md2 td { border: 0; border-bottom: 1px solid #ece7de; }`,
  },
  {
    id: 'swiss',
    name: '瑞士国际主义',
    nameEn: 'Swiss',
    description: 'Helvetica、红色方块、粗黑规线，网格秩序',
    descriptionEn: 'Helvetica, red squares, heavy rules, grid order',
    primary: '#ff3b30',
    codeTheme: 'github-light',
    prefix: { h2: '■ ' },
    vars: {
      '--md2-font': '"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", sans-serif',
      '--md2-text': '#111111', '--md2-heading': '#000000', '--md2-strong': '#000000', '--md2-quote-bg': 'transparent',
      '--md2-quote-text': '#111111', '--md2-border': '#111111', '--md2-code-inline': '#000', '--md2-code-inline-bg': '#f0f0f0',
    },
    css: `
.md2 h1 { font-size: var(--md2-fs-h1); font-weight: 800; letter-spacing: -0.02em; border-bottom: 6px solid #000; padding-bottom: 8px; }
.md2 h2 { font-weight: 800; letter-spacing: -0.01em; }
.md2 h2 .prefix { color: var(--md2-primary); }
.md2 h3 { font-weight: 700; color: var(--md2-primary); }
.md2 blockquote { border-left: 6px solid #000; border-radius: 0; font-weight: 600; }
.md2 hr { border-top: 4px solid #000; }
.md2 pre { border-radius: 0; }
.md2 code { border-radius: 0; }
.md2 img { border-radius: 0; }
.md2 th { background: #000; color: #fff; border-color: #000; }`,
  },
  {
    id: 'brutal',
    name: '新野兽派',
    nameEn: 'Neo-Brutal',
    description: '粗黑描边 + 硬投影 + 高饱和黄，年轻有冲击力',
    descriptionEn: 'Thick outlines, hard shadows, loud yellow',
    primary: '#ffd23f',
    codeTheme: 'github-light',
    vars: {
      '--md2-text': '#111111', '--md2-heading': '#111111', '--md2-strong': '#111111', '--md2-quote-bg': '#fff6cf',
      '--md2-quote-text': '#111111', '--md2-border': '#111111', '--md2-th-bg': '#ffd23f', '--md2-code-inline': '#111',
      '--md2-code-inline-bg': '#ffe98a',
    },
    css: `
.md2 h1 { font-size: var(--md2-fs-h1); font-weight: 900; }
.md2 h1 .content { background: var(--md2-primary); padding: 2px 8px; border: 2px solid #111; box-shadow: 4px 4px 0 #111; }
.md2 h2 { font-weight: 900; margin-top: 2.2em; }
.md2 h2 .content { display: inline-block; background: #ff90e8; border: 2px solid #111; box-shadow: 4px 4px 0 #111; padding: 3px 12px; }
.md2 h3 .content { border-bottom: 4px solid var(--md2-primary); }
.md2 blockquote { border: 2px solid #111; border-radius: 0; box-shadow: 5px 5px 0 #111; }
.md2 pre { border: 2px solid #111; border-radius: 0; box-shadow: 5px 5px 0 #111; }
.md2 code { border-radius: 0; }
.md2 img { border: 2px solid #111; border-radius: 0; box-shadow: 5px 5px 0 #111; }
.md2 .callout { border: 2px solid #111; border-radius: 0; box-shadow: 5px 5px 0 #111; }
.md2 a, .md2 .link { color: #111; border-bottom: 3px solid #ff90e8; }`,
  },
  {
    id: 'bento',
    name: '便当卡片',
    nameEn: 'Bento',
    description: '大圆角柔和卡片 + 胶囊标题，现代 App 质感',
    descriptionEn: 'Soft rounded cards and pill headings, app-like',
    primary: '#7c5cff',
    codeTheme: 'catppuccin-latte',
    vars: {
      '--md2-text': '#2b2b33', '--md2-heading': '#14141a', '--md2-quote-bg': '#f4f4f7', '--md2-quote-text': '#3a3a44',
      '--md2-border': '#ececf2', '--md2-th-bg': '#f4f4f7',
    },
    css: `
.md2 h1 { font-size: var(--md2-fs-h1); font-weight: 800; letter-spacing: -0.015em; }
.md2 h2 .content { display: inline-block; padding: 5px 16px; border-radius: 999px; background: var(--md2-primary-light); color: var(--md2-primary-dark); font-size: var(--md2-fs-h3); }
.md2 h3 { color: var(--md2-primary); }
.md2 blockquote { border-left: 0; border-radius: 20px; padding: 1.1em 1.3em; }
.md2 pre { border-radius: 20px; }
.md2 img { border-radius: 20px; }
.md2 .callout { border-left: 0; border-radius: 20px; }
.md2 code { border-radius: 7px; }`,
  },
  {
    id: 'aurora',
    name: '极光渐变',
    nameEn: 'Aurora',
    description: '紫青渐变胶囊、渐变分隔条，科技感但不浮夸',
    descriptionEn: 'Violet-teal gradient pills and dividers',
    primary: '#7f5af0',
    codeTheme: 'tokyo-night',
    vars: { '--md2-text': '#2e2e3a', '--md2-heading': '#16161f', '--md2-quote-bg': '#f5f3ff', '--md2-quote-text': '#3b3a4a' },
    css: `
.md2 h1 { text-align: center; font-size: var(--md2-fs-h1); font-weight: 800; }
.md2 h1 .suffix { display: block; width: 56px; height: 4px; margin: 14px auto 0; border-radius: 4px; background: linear-gradient(90deg, #7f5af0, #2cb67d); }
.md2 h2 .content { display: inline-block; padding: 5px 16px; border-radius: 10px; background: linear-gradient(90deg, #7f5af0, #4f8cff 55%, #2cb67d); color: #ffffff; font-size: var(--md2-fs-h3); }
.md2 h3 .content { background: linear-gradient(transparent 60%, rgba(44, 182, 125, 0.25) 60%); }
.md2 blockquote { border-left: 0; border-radius: 14px; background: linear-gradient(135deg, rgba(127, 90, 240, 0.08), rgba(44, 182, 125, 0.08)); }
.md2 pre { border-radius: 14px; }
.md2 strong { color: #5b3fd6; }
.md2 hr { border: 0; height: 2px; background: linear-gradient(90deg, transparent, #7f5af0, #2cb67d, transparent); }`,
  },
  {
    id: 'midnight',
    name: '深夜模式',
    nameEn: 'Midnight',
    description: '深色背景整篇阅读，Tokyo Night 配色',
    descriptionEn: 'Full dark reading mode, Tokyo Night palette',
    primary: '#7aa2f7',
    codeTheme: 'tokyo-night',
    vars: {
      '--md2-text': '#c0caf5', '--md2-heading': '#ffffff', '--md2-strong': '#ffffff', '--md2-muted': '#7a82a6',
      '--md2-border': '#2a2e45', '--md2-th-bg': '#1f2335', '--md2-quote-bg': '#1f2335', '--md2-quote-text': '#a9b1d6',
      '--md2-code-inline': '#ff9e64', '--md2-code-inline-bg': '#24283b', '--md2-mark': '#3d59a1',
    },
    css: `
.md2 { background: #13141c; padding: 24px 18px; border-radius: 0; }
.md2 h1 { font-size: var(--md2-fs-h1); }
.md2 h2 .prefix { color: var(--md2-primary); }
.md2 h2 { border-bottom: 1px solid #2a2e45; padding-bottom: 6px; }
.md2 h3 { color: #bb9af7; }
.md2 pre { border: 1px solid #2a2e45; }
.md2 .callout { background: #1f2335; }
.md2 .callout .callout-title { filter: brightness(1.4); }`,
  },
  {
    id: 'matcha',
    name: '抹茶',
    nameEn: 'Matcha',
    description: '低饱和抹茶绿与米白，温柔耐看',
    descriptionEn: 'Muted matcha green on cream, gentle',
    primary: '#5b8c5a',
    codeTheme: 'vitesse-light',
    vars: { '--md2-text': '#34392f', '--md2-heading': '#1f241c', '--md2-quote-bg': '#f1f5ec', '--md2-quote-text': '#3e4a3a', '--md2-border': '#e3e8dc', '--md2-th-bg': '#f1f5ec' },
    css: `
.md2 h1 { text-align: center; font-size: var(--md2-fs-h1); }
.md2 h2 .content { border-bottom: 3px solid rgba(91, 140, 90, 0.35); padding-bottom: 2px; }
.md2 h3 { color: var(--md2-primary); }
.md2 blockquote { border-left: 0; border-radius: 12px; }
.md2 pre { border-radius: 12px; }
.md2 img { border-radius: 12px; }`,
  },
  {
    id: 'wabi',
    name: '侘寂',
    nameEn: 'Wabi',
    description: '大留白、宽字距、灰褐色调，日式静谧',
    descriptionEn: 'Generous space, wide tracking, taupe — Japanese calm',
    primary: '#8c7b6b',
    codeTheme: 'rose-pine-dawn',
    prefix: { h2: '— ' },
    suffix: { h2: ' —' },
    vars: {
      '--md2-font': 'var(--md2-serif)', '--md2-text': '#3a3632', '--md2-heading': '#26221f', '--md2-strong': '#26221f',
      '--md2-muted': '#9b948b', '--md2-quote-bg': 'transparent', '--md2-quote-text': '#6b645c', '--md2-border': '#e6e0d8',
    },
    css: `
.md2 { letter-spacing: 0.06em; }
.md2 p { margin-bottom: 1.4em; }
.md2 h1 { text-align: center; font-weight: 600; letter-spacing: 0.12em; }
.md2 h2 { text-align: center; font-weight: 600; letter-spacing: 0.12em; margin: 2.6em 0 1.4em; }
.md2 h2 .prefix, .md2 h2 .suffix { color: #c4b8aa; font-weight: 400; }
.md2 h3 { font-weight: 600; color: var(--md2-primary); }
.md2 blockquote { border-left: 0; text-align: center; font-style: italic; }
.md2 hr { border-top: 1px solid #e6e0d8; margin: 3em 30%; }`,
  },
  {
    id: 'distill',
    name: '学术 Distill',
    nameEn: 'Distill',
    description: '论文式排版：三线表、图注、衬线正文、无花哨装饰',
    descriptionEn: 'Paper-style: booktabs tables, captions, serif body',
    primary: '#2a5db0',
    codeTheme: 'github-light',
    vars: {
      '--md2-font': 'var(--md2-serif)', '--md2-text': '#222222', '--md2-heading': '#111111', '--md2-strong': '#111111',
      '--md2-quote-bg': 'transparent', '--md2-quote-text': '#555555', '--md2-border': '#dddddd',
    },
    css: `
.md2 { text-align: justify; }
.md2 h1, .md2 h2, .md2 h3 { font-family: var(--md2-font); }
.md2 h1 { font-size: var(--md2-fs-h1); font-weight: 700; }
.md2 h2 { font-weight: 700; border-bottom: 1px solid rgba(0, 0, 0, 0.12); padding-bottom: 6px; }
.md2 h3 { font-weight: 600; font-style: italic; }
.md2 blockquote { border-left: 3px solid #cfcfcf; border-radius: 0; }
.md2 table { border-top: 2px solid #111; border-bottom: 2px solid #111; }
.md2 th { background: transparent; border: 0; border-bottom: 1px solid #111; }
.md2 td { border: 0; }
.md2 figcaption { text-align: left; color: #6b6b6b; }`,
  },
  {
    id: 'coral',
    name: '珊瑚生活',
    nameEn: 'Coral',
    description: '珊瑚红胶囊标题、圆润卡片，适合生活方式内容',
    descriptionEn: 'Coral pill headings, rounded cards — lifestyle',
    primary: '#ff5a5f',
    codeTheme: 'catppuccin-latte',
    vars: { '--md2-text': '#3a3335', '--md2-heading': '#231d1f', '--md2-quote-bg': '#fff2f1', '--md2-quote-text': '#5b4447' },
    css: `
.md2 h1 { text-align: center; font-size: var(--md2-fs-h1); font-weight: 800; }
.md2 h2 { text-align: center; }
.md2 h2 .content { display: inline-block; padding: 5px 18px; border-radius: 999px; background: var(--md2-primary); color: #ffffff; font-size: var(--md2-fs-h3); }
.md2 h3 { color: var(--md2-primary); }
.md2 blockquote { border-left: 0; border-radius: 16px; }
.md2 img { border-radius: 16px; }
.md2 pre { border-radius: 16px; }
.md2 strong { color: #e0484d; }`,
  },
  {
    id: 'stripe',
    name: 'Stripe 文档',
    nameEn: 'Stripe',
    description: '深海军蓝标题 + 蓝紫强调，开发者文档的精致感',
    descriptionEn: 'Navy headings, blurple accent — polished dev docs',
    primary: '#635bff',
    codeTheme: 'github-dark',
    vars: {
      '--md2-text': '#425466', '--md2-heading': '#0a2540', '--md2-strong': '#0a2540', '--md2-muted': '#8792a2',
      '--md2-quote-bg': '#f6f9fc', '--md2-quote-text': '#425466', '--md2-border': '#e3e8ee', '--md2-th-bg': '#f6f9fc',
      '--md2-code-inline': '#0a2540', '--md2-code-inline-bg': '#f6f9fc',
    },
    css: `
.md2 h1, .md2 h2, .md2 h3 { letter-spacing: -0.01em; }
.md2 h1 { font-size: var(--md2-fs-h1); font-weight: 700; }
.md2 h2 { font-weight: 700; }
.md2 h3 { color: var(--md2-primary); font-weight: 600; }
.md2 blockquote { border-left: 3px solid var(--md2-primary); border-radius: 0 10px 10px 0; }
.md2 pre { border-radius: 10px; }
.md2 code { border: 1px solid #e3e8ee; }
.md2 pre code { border: 0; }`,
  },
  {
    id: 'song',
    name: '宋韵',
    nameEn: 'Song',
    description: '宋体正文、朱砂点缀、对称标题，现代中式',
    descriptionEn: 'Song serif, cinnabar accents, symmetric headings',
    primary: '#b23a2e',
    codeTheme: 'rose-pine-dawn',
    prefix: { h2: '〔 ' },
    suffix: { h2: ' 〕' },
    vars: {
      '--md2-font': 'var(--md2-serif)', '--md2-text': '#2e2925', '--md2-heading': '#1d1916', '--md2-strong': '#1d1916',
      '--md2-quote-bg': '#f8f4ee', '--md2-quote-text': '#4f463e', '--md2-border': '#e6ddd0',
    },
    css: `
.md2 { text-align: justify; letter-spacing: 0.05em; }
.md2 h1 { text-align: center; letter-spacing: 0.14em; font-weight: 700; }
.md2 h2 { text-align: center; letter-spacing: 0.12em; font-weight: 700; }
.md2 h2 .prefix, .md2 h2 .suffix { color: var(--md2-primary); }
.md2 h3 { color: var(--md2-primary); }
.md2 blockquote { border-left: 0; border-top: 1px solid rgba(178, 58, 46, 0.3); border-bottom: 1px solid rgba(178, 58, 46, 0.3); border-radius: 0; text-align: center; }
.md2 hr { border-top: 1px dashed rgba(178, 58, 46, 0.35); }`,
  },
];

export function getTheme(id?: string): Theme {
  return themes.find((t) => t.id === id) ?? themes[0];
}

/** Resolve all CSS variables for a theme + user options. */
export function themeVars(theme: Theme, opts: StyleOptions = {}): Record<string, string> {
  const primary = opts.primaryColor || theme.primary;
  const fs = opts.fontSize ?? 16;
  const code = getCodeTheme(opts.codeTheme || theme.codeTheme);
  const fontFamily =
    opts.fontFamily === 'serif' ? FONT_STACKS.serif : opts.fontFamily === 'sans' || !opts.fontFamily ? undefined : opts.fontFamily;
  const vars: Record<string, string> = {
    '--md2-primary': primary,
    '--md2-primary-dark': mix(primary, 0.25, '#000000'),
    '--md2-primary-light': mix(primary, 0.92),
    '--md2-primary-soft': rgba(primary, 0.28),
    '--md2-on-primary': readableOn(primary),
    '--md2-font': FONT_STACKS.sans,
    '--md2-serif': FONT_STACKS.serif,
    '--md2-mono': FONT_STACKS.mono,
    '--md2-fs': `${fs}px`,
    '--md2-fs-h1': `${Math.round(fs * 1.5)}px`,
    '--md2-fs-h2': `${Math.round(fs * 1.3)}px`,
    '--md2-fs-h3': `${Math.round(fs * 1.12)}px`,
    '--md2-lh': String(opts.lineHeight ?? 1.75),
    '--md2-text': '#333333',
    '--md2-heading': '#1a1a1a',
    '--md2-strong': '#1a1a1a',
    '--md2-muted': '#888888',
    '--md2-border': '#e5e5e5',
    '--md2-th-bg': '#f6f6f6',
    '--md2-mark': '#fff3a3',
    '--md2-quote-bg': mix(primary, 0.94),
    '--md2-quote-text': '#555555',
    '--md2-code-bg': code.bg,
    '--md2-code-text': code.text,
    '--md2-code-inline': mix(primary, 0.2, '#000000'),
    '--md2-code-inline-bg': mix(primary, 0.9),
    ...theme.vars,
  };
  if (fontFamily) vars['--md2-font'] = fontFamily;
  // Resolve var() references inside vars (e.g. --md2-font: var(--md2-serif))
  for (const k of Object.keys(vars)) {
    vars[k] = vars[k].replace(/var\((--[\w-]+)\)/g, (_, n) => vars[n] ?? '');
  }
  return vars;
}

/** CSS generated from the fine-tuning options; placed after the theme so it wins. */
export function tuningCss(opts: StyleOptions): string {
  const out: string[] = [];
  if (opts.letterSpacing !== undefined) out.push(`.md2 { letter-spacing: ${opts.letterSpacing}em; }`);
  if (opts.justify !== undefined) out.push(`.md2 { text-align: ${opts.justify ? 'justify' : 'left'}; }`);
  if (opts.paragraphSpacing !== undefined) out.push(`.md2 p { margin-bottom: ${opts.paragraphSpacing}em; }`);
  if (opts.textIndent) out.push('.md2 > p { text-indent: 2em; }');
  if (opts.headingAlign) out.push(`.md2 h1, .md2 h2, .md2 h3 { text-align: ${opts.headingAlign}; }`);
  return out.join('\n');
}

/** Full stylesheet for a theme (base + theme + code theme + custom). */
export function themeCss(theme: Theme, opts: StyleOptions = {}): string {
  const code = getCodeTheme(opts.codeTheme || theme.codeTheme);
  const scopedCode = code.css.replace(/(^|\n)(\.hljs[^{]*)\{/g, (_, nl, sel: string) =>
    nl + sel.split(',').map((s) => `.md2 ${s.trim()}`).join(', ') + ' {',
  );
  return [BASE_CSS, theme.css, scopedCode, tuningCss(opts), opts.customCss ?? ''].join('\n');
}
