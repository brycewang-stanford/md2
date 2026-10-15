import { mix, rgba, readableOn } from '../themes/color.js';
import { FONT_STACKS } from '../themes/index.js';

export type CoverTemplateId =
  | 'aurora' | 'glass' | 'claude' | 'bento' | 'swiss' | 'brutal' | 'terminal' | 'notes' | 'editorial' | 'photo';

export const coverTemplates: { id: CoverTemplateId; name: string; accent: string }[] = [
  { id: 'aurora', name: '极光 Aurora', accent: '#7f5af0' },
  { id: 'glass', name: '毛玻璃 Glass', accent: '#4f8cff' },
  { id: 'claude', name: 'Claude', accent: '#d97757' },
  { id: 'bento', name: '便当 Bento', accent: '#7c5cff' },
  { id: 'swiss', name: '瑞士 Swiss', accent: '#ff3b30' },
  { id: 'brutal', name: '新野兽派 Brutal', accent: '#ffd23f' },
  { id: 'terminal', name: '终端 Terminal', accent: '#7ee787' },
  { id: 'notes', name: '备忘录 Notes', accent: '#e0a400' },
  { id: 'editorial', name: '杂志 Editorial', accent: '#b4441c' },
  { id: 'photo', name: '图片 Photo', accent: '#f97316' },
];

/** Export sizes in device pixels. Covers are laid out at half size and exported at 2×. */
export const coverSizes = {
  xhs: { width: 1080, height: 1440, label: '小红书 3:4' },
  'xhs-square': { width: 1080, height: 1080, label: '小红书 1:1' },
  wechat: { width: 900, height: 383, label: '公众号头图 2.35:1' },
  'wechat-square': { width: 1080, height: 1080, label: '公众号分享图 1:1' },
  zhihu: { width: 1280, height: 720, label: '知乎题图 16:9' },
  x: { width: 1600, height: 900, label: 'X / Twitter 16:9' },
} as const;
export type CoverSizeId = keyof typeof coverSizes;

export interface CoverOptions {
  title: string;
  subtitle?: string;
  author?: string;
  /** Small label above the title, e.g. "干货" or "TUTORIAL" */
  badge?: string;
  tags?: string[];
  /** Big emoji / glyph shown above the title */
  emoji?: string;
  template?: CoverTemplateId;
  accent?: string;
  /** Background image URL / data URL (used by `photo`, optional for others) */
  background?: string;
  size?: CoverSizeId | { width: number; height: number };
  /** Device scale used when exporting; layout size = export size / scale. Default 2 */
  scale?: number;
}

export interface CoverRender {
  html: string;
  css: string;
  /** Export size in px */
  width: number;
  height: number;
  /** Layout (CSS) size in px */
  cssWidth: number;
  cssHeight: number;
  scale: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Visual length of a string: CJK ≈ 1, latin ≈ 0.55 */
export function visualLength(s: string): number {
  let n = 0;
  for (const ch of s) n += /[⺀-鿿가-힯＀-￯　-〿]/.test(ch) ? 1 : /\s/.test(ch) ? 0.3 : 0.56;
  return n;
}

const STARBURST = (color: string) =>
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="${color}">${Array.from({ length: 12 }, (_, i) => `<rect x="47" y="4" width="6" height="40" rx="3" transform="rotate(${i * 30} 50 50)"/>`).join('')}</g></svg>`;

const COVER_CSS = `
.md2-cover { position: relative; overflow: hidden; box-sizing: border-box; display: flex; flex-direction: column;
  padding: calc(var(--u) * 8); font-family: ${FONT_STACKS.sans}; color: var(--cv-text); background: var(--cv-bg);
  -webkit-font-smoothing: antialiased; text-align: left; line-height: 1.4; }
.md2-cover * { box-sizing: border-box; margin: 0; padding: 0; }
.md2-cover .cv-deco { position: absolute; pointer-events: none; }
.md2-cover .cv-top, .md2-cover .cv-main, .md2-cover .cv-foot { position: relative; z-index: 2; }
.md2-cover .cv-top { display: flex; align-items: center; justify-content: space-between; min-height: calc(var(--u) * 6); }
.md2-cover .cv-badge { display: inline-block; font-size: calc(var(--u) * 3.4); font-weight: 800; padding: 0.35em 0.95em; border-radius: 999px; background: var(--accent); color: var(--on-accent); letter-spacing: 0.08em; }
.md2-cover .cv-main { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
.md2-cover .cv-emoji { font-size: calc(var(--u) * 15); line-height: 1.1; margin-bottom: calc(var(--u) * 4); }
.md2-cover .cv-title { font-size: var(--cv-title-size); font-weight: 900; line-height: 1.2; letter-spacing: 0.01em; word-break: break-word; overflow-wrap: anywhere; text-wrap: balance; }
.md2-cover .cv-sub { font-size: calc(var(--u) * 4.6); margin-top: calc(var(--u) * 4); opacity: 0.82; line-height: 1.5; font-weight: 500; }
.md2-cover .cv-tags { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 2); margin-top: calc(var(--u) * 5); }
.md2-cover .cv-tag { font-size: calc(var(--u) * 3.3); padding: 0.3em 0.85em; border-radius: 999px; border: 1.5px solid currentColor; opacity: 0.85; font-weight: 600; }
.md2-cover .cv-foot { display: flex; align-items: center; gap: calc(var(--u) * 2.2); font-size: calc(var(--u) * 3.6); font-weight: 600; opacity: 0.9; min-height: calc(var(--u) * 7); }
.md2-cover .cv-avatar { width: calc(var(--u) * 7.5); height: calc(var(--u) * 7.5); border-radius: 50%; background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: calc(var(--u) * 3.6); flex: none; }
.md2-cover mark { background: linear-gradient(transparent 55%, var(--accent-soft) 55%); color: inherit; padding: 0 0.08em; }

/* wide (2.35:1, 16:9): tighter, centred */
.md2-cover.cv-wide { padding: calc(var(--u) * 7) calc(var(--u) * 10); }
.md2-cover.cv-wide .cv-main { align-items: center; text-align: center; }
.md2-cover.cv-wide .cv-tags { justify-content: center; }
.md2-cover.cv-wide .cv-emoji { font-size: calc(var(--u) * 16); margin-bottom: calc(var(--u) * 2); }
.md2-cover.cv-wide .cv-sub { font-size: calc(var(--u) * 6); margin-top: calc(var(--u) * 3); }
.md2-cover.cv-wide .cv-badge { font-size: calc(var(--u) * 5); }
.md2-cover.cv-wide .cv-tag { font-size: calc(var(--u) * 4.6); }
.md2-cover.cv-wide .cv-foot { font-size: calc(var(--u) * 5); min-height: 0; justify-content: center; }
.md2-cover.cv-wide .cv-avatar { width: calc(var(--u) * 9); height: calc(var(--u) * 9); font-size: calc(var(--u) * 4.6); }
.md2-cover.cv-wide .cv-top { position: absolute; top: calc(var(--u) * 6); left: calc(var(--u) * 7); }
.md2-cover.cv-wide .cv-foot { position: absolute; bottom: calc(var(--u) * 6); right: calc(var(--u) * 7); }

/* wrapped layouts keep header/footer in flow on wide sizes */
.md2-cover.cv-wide .cv-card .cv-top, .md2-cover.cv-wide .cv-panel .cv-top, .md2-cover.cv-wide .cv-window .cv-top { position: static; min-height: 0; }
.md2-cover.cv-wide .cv-card .cv-foot, .md2-cover.cv-wide .cv-panel .cv-foot { position: static; justify-content: flex-end; }
.md2-cover.cv-wide .cv-panel, .md2-cover.cv-wide .cv-card { padding: calc(var(--u) * 5) calc(var(--u) * 8); }
.md2-cover.cv-wide .cv-card .cv-main, .md2-cover.cv-wide .cv-panel .cv-main { min-height: 0; }

/* aurora: mesh gradient */
.cv-aurora { --cv-bg: #0d0b1f; --cv-text: #fff; }
.cv-aurora .cv-deco.d1 { inset: -20%; background:
  radial-gradient(40% 35% at 20% 25%, var(--accent) 0%, transparent 70%),
  radial-gradient(35% 30% at 80% 20%, var(--accent-2) 0%, transparent 70%),
  radial-gradient(45% 40% at 70% 80%, var(--accent-3) 0%, transparent 70%),
  radial-gradient(40% 35% at 15% 85%, #2cb67d 0%, transparent 70%);
  filter: blur(calc(var(--u) * 4)); opacity: 0.9; }
.cv-aurora .cv-deco.d2 { inset: 0; background-image: radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px); background-size: calc(var(--u) * 2.4) calc(var(--u) * 2.4); }
.cv-aurora .cv-badge { background: rgba(255,255,255,0.14); color: #fff; border: 1px solid rgba(255,255,255,0.35); }
.cv-aurora .cv-avatar { background: #fff; color: #111; }
.cv-aurora .cv-title { letter-spacing: -0.01em; }

/* glass: frosted card over colour blobs */
.cv-glass { --cv-bg: #eef1f8; --cv-text: #0f172a; padding: calc(var(--u) * 7); }
.cv-glass .cv-deco.d1 { width: 70%; aspect-ratio: 1; left: -15%; top: -10%; border-radius: 50%; background: var(--accent); filter: blur(calc(var(--u) * 6)); opacity: 0.75; }
.cv-glass .cv-deco.d2 { width: 65%; aspect-ratio: 1; right: -18%; bottom: -12%; border-radius: 50%; background: var(--accent-2); filter: blur(calc(var(--u) * 6)); opacity: 0.7; }
.cv-glass .cv-deco.d3 { width: 40%; aspect-ratio: 1; right: 10%; top: 12%; border-radius: 50%; background: var(--accent-3); filter: blur(calc(var(--u) * 6)); opacity: 0.55; }
.cv-glass .cv-panel { position: relative; z-index: 2; flex: 1; min-height: 0; display: flex; flex-direction: column; padding: calc(var(--u) * 6); border-radius: calc(var(--u) * 5);
  background: rgba(255,255,255,0.55); border: 1px solid rgba(255,255,255,0.8); box-shadow: 0 calc(var(--u) * 2) calc(var(--u) * 8) rgba(15, 23, 42, 0.12); }
.cv-glass .cv-badge { background: rgba(15,23,42,0.88); color: #fff; }

/* claude */
.cv-claude { --cv-bg: #f0eee6; --cv-text: #141413; }
.cv-claude .cv-title { font-family: ${FONT_STACKS.serif}; font-weight: 600; letter-spacing: -0.005em; }
.cv-claude .cv-sub { color: #5e5d59; opacity: 1; }
.cv-claude .cv-deco.d1 { width: 30%; aspect-ratio: 1; right: 7%; top: 6%; }
.cv-claude.cv-wide .cv-deco.d1 { width: auto; height: 52%; right: 6%; top: 24%; }
.cv-claude.cv-wide .cv-main { align-items: flex-start; text-align: left; padding-right: 26%; }
.cv-claude.cv-wide .cv-tags { justify-content: flex-start; }
.cv-claude.cv-wide .cv-main { padding-top: calc(var(--u) * 9); }
.cv-claude .cv-deco.d2 { left: 0; right: 0; bottom: 0; height: calc(var(--u) * 1.4); background: var(--accent); }
.cv-claude .cv-tag { border-color: #c2c0b6; color: #3d3d3a; }
.cv-claude .cv-badge { background: #141413; color: #f0eee6; }

/* bento: tile grid */
.cv-bento { --cv-bg: #eceef3; --cv-text: #14141a; padding: calc(var(--u) * 5); }
.cv-bento .cv-grid { position: relative; z-index: 2; flex: 1; min-height: 0; display: grid; gap: calc(var(--u) * 3); grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr auto; }
.cv-bento .cv-tile { background: #fff; border-radius: calc(var(--u) * 5); padding: calc(var(--u) * 5); display: flex; flex-direction: column; justify-content: center; min-height: 0; overflow: hidden; }
.cv-bento .cv-tile.t-main { grid-column: 1 / 3; }
.cv-bento .cv-tile.t-accent { background: var(--accent); color: var(--on-accent); align-items: center; justify-content: center; }
.cv-bento .cv-tile.t-accent .cv-emoji { margin: 0; font-size: calc(var(--u) * 16); }
.cv-bento .cv-tile.t-meta { gap: calc(var(--u) * 2); }
.cv-bento .cv-tile.t-top { grid-column: 1 / 3; flex-direction: row; justify-content: space-between; align-items: center; padding: calc(var(--u) * 3.5) calc(var(--u) * 5); }
.cv-bento .cv-tags { margin-top: 0; }
.cv-bento .cv-tag { border: 0; background: #f2f2f6; opacity: 1; }
.cv-bento.cv-wide .cv-grid { grid-template-columns: 2.2fr 1fr; grid-template-rows: auto 1fr; }
.cv-bento.cv-wide .cv-tile.t-main { grid-column: 1; grid-row: 2; text-align: left; align-items: flex-start; }
.cv-bento.cv-wide .cv-tile.t-meta { display: none; }
.cv-bento.cv-wide .cv-tile.t-accent { grid-row: 2; }
.cv-bento.cv-wide .cv-foot { position: static; }

/* swiss */
.cv-swiss { --cv-bg: #f4f4f0; --cv-text: #000; font-family: "Helvetica Neue", Helvetica, Arial, "PingFang SC", sans-serif; }
.cv-swiss .cv-deco.d1 { right: 0; top: 0; width: 38%; height: 30%; background: var(--accent); }
.cv-swiss .cv-deco.d2 { left: calc(var(--u) * 8); right: calc(var(--u) * 8); bottom: calc(var(--u) * 19); height: calc(var(--u) * 1.6); background: #000; }
.cv-swiss .cv-main { justify-content: flex-end; padding-bottom: calc(var(--u) * 10); }
.cv-swiss .cv-title { font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; }
.cv-swiss .cv-badge { background: transparent; color: #000; padding: 0; letter-spacing: 0.3em; border-radius: 0; }
.cv-swiss .cv-tag { border-radius: 0; border-width: 2px; }
.cv-swiss .cv-avatar { border-radius: 0; background: #000; color: #fff; }
.cv-swiss.cv-wide .cv-deco.d1 { width: 22%; height: 100%; }
.cv-swiss.cv-wide .cv-deco.d2 { display: none; }
.cv-swiss.cv-wide .cv-main { align-items: flex-start; text-align: left; padding: 0 26% 0 0; justify-content: center; }

/* brutal */
.cv-brutal { --cv-bg: var(--accent); --cv-text: #111; }
.cv-brutal .cv-card { position: relative; z-index: 2; flex: 1; min-height: 0; display: flex; flex-direction: column; background: #fff; border: calc(var(--u) * 0.8) solid #111; box-shadow: calc(var(--u) * 2) calc(var(--u) * 2) 0 #111; padding: calc(var(--u) * 6); }
.cv-brutal .cv-title { font-weight: 900; letter-spacing: -0.02em; line-height: 1.12; }
.cv-brutal .cv-badge { background: #ff90e8; color: #111; border: calc(var(--u) * 0.6) solid #111; border-radius: 0; box-shadow: calc(var(--u) * 0.8) calc(var(--u) * 0.8) 0 #111; }
.cv-brutal .cv-tag { border-radius: 0; border-width: 2px; background: #c4f1ff; opacity: 1; }
.cv-brutal .cv-avatar { background: #111; color: var(--accent); border-radius: 0; }
.cv-brutal mark { background: #ff90e8; }

/* terminal */
.cv-terminal { --cv-bg: #0d1117; --cv-text: #e6edf3; padding: calc(var(--u) * 6); }
.cv-terminal .cv-window { position: relative; z-index: 2; flex: 1; min-height: 0; display: flex; flex-direction: column; border: 1px solid #30363d; border-radius: calc(var(--u) * 3); background: #161b22; overflow: hidden; }
.cv-terminal .cv-bar { flex: none; display: flex; align-items: center; gap: calc(var(--u) * 1.6); height: calc(var(--u) * 8); padding: 0 calc(var(--u) * 4); border-bottom: 1px solid #30363d; font-family: ${FONT_STACKS.mono}; font-size: calc(var(--u) * 3); color: #7d8590; }
.cv-terminal .cv-bar i { width: calc(var(--u) * 2.6); height: calc(var(--u) * 2.6); border-radius: 50%; display: inline-block; }
.cv-terminal .cv-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: calc(var(--u) * 6); }
.cv-terminal .cv-title { font-family: ${FONT_STACKS.sans}; }
.cv-terminal .cv-prompt { font-family: ${FONT_STACKS.mono}; color: var(--accent); font-size: calc(var(--u) * 4); margin-bottom: calc(var(--u) * 3); }
.cv-terminal .cv-sub { color: #7d8590; opacity: 1; font-family: ${FONT_STACKS.mono}; font-size: calc(var(--u) * 3.8); }
.cv-terminal .cv-badge { background: transparent; color: var(--accent); border: 1.5px solid var(--accent); border-radius: 4px; font-family: ${FONT_STACKS.mono}; }
.cv-terminal .cv-tag { font-family: ${FONT_STACKS.mono}; color: var(--accent); border-radius: 4px; }
.cv-terminal .cv-avatar { background: var(--accent); color: #0d1117; }
.cv-terminal .cv-foot { padding: 0 calc(var(--u) * 6) calc(var(--u) * 5); }
.cv-terminal.cv-wide .cv-top { display: none; }
.cv-terminal.cv-wide .cv-body { padding: calc(var(--u) * 4) calc(var(--u) * 8); }
.cv-terminal.cv-wide .cv-foot { position: static; padding: 0 calc(var(--u) * 6) calc(var(--u) * 4); justify-content: flex-end; }

/* notes: iOS Notes */
.cv-notes { --cv-bg: #ffffff; --cv-text: #1d1d1f; padding-top: calc(var(--u) * 17); }
.cv-notes .cv-deco.d1 { left: 0; right: 0; top: 0; height: calc(var(--u) * 11); display: flex; align-items: center; justify-content: space-between; padding: 0 calc(var(--u) * 5); color: var(--accent); font-size: calc(var(--u) * 4.2); font-weight: 600; border-bottom: 1px solid #ececec; background: #fbfbfb; }
.cv-notes .cv-deco.d2 { left: 0; right: 0; top: calc(var(--u) * 11); bottom: 0; background-image: linear-gradient(transparent calc(100% - 1px), #f2f2f2 1px); background-size: 100% calc(var(--u) * 8); }
.cv-notes .cv-date { position: relative; z-index: 2; text-align: center; color: #8e8e93; font-size: calc(var(--u) * 3.2); margin-bottom: calc(var(--u) * 3); }
.cv-notes .cv-badge { background: rgba(255, 214, 10, 0.35); color: #7a5a00; }
.cv-notes mark { background: linear-gradient(transparent 55%, rgba(255, 214, 10, 0.6) 55%); }
.cv-notes.cv-wide { padding-top: calc(var(--u) * 14); }
.cv-notes.cv-wide .cv-date { display: none; }
.cv-notes.cv-wide .cv-top { top: calc(var(--u) * 14); }

/* editorial */
.cv-editorial { --cv-bg: #f6f1e7; --cv-text: #1c1a17; }
.cv-editorial .cv-title { font-family: ${FONT_STACKS.serif}; font-weight: 800; letter-spacing: -0.01em; }
.cv-editorial .cv-sub { font-family: ${FONT_STACKS.serif}; font-style: italic; }
.cv-editorial .cv-deco.d1 { left: calc(var(--u) * 8); right: calc(var(--u) * 8); top: calc(var(--u) * 15); border-top: 3px solid #1c1a17; border-bottom: 1px solid #1c1a17; height: calc(var(--u) * 1.6); }
.cv-editorial .cv-deco.d2 { inset: 0; background-image: radial-gradient(rgba(0,0,0,0.045) 1px, transparent 1px); background-size: calc(var(--u) * 2.2) calc(var(--u) * 2.2); }
.cv-editorial .cv-badge { background: transparent; color: var(--accent); padding: 0; border-radius: 0; letter-spacing: 0.25em; font-family: ${FONT_STACKS.serif}; }
.cv-editorial.cv-wide .cv-deco.d1 { display: none; }

/* photo */
.cv-photo { --cv-text: #fff; background: var(--cv-photo, linear-gradient(140deg, var(--accent), var(--accent-3))); background-size: cover; background-position: center; }
.cv-photo .cv-deco.d1 { inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.72) 100%); }
.cv-photo .cv-main { justify-content: flex-end; }
.cv-photo .cv-title { text-shadow: 0 2px 12px rgba(0,0,0,0.35); }
.cv-photo .cv-avatar { background: #fff; color: #111; }
.cv-photo.cv-wide .cv-main { justify-content: center; }
.cv-photo.cv-wide .cv-deco.d1 { background: rgba(0,0,0,0.45); }
`;

export const coverCss = COVER_CSS;

function decorations(tpl: CoverTemplateId, accent: string): string {
  switch (tpl) {
    case 'aurora': return '<div class="cv-deco d1"></div><div class="cv-deco d2"></div>';
    case 'glass': return '<div class="cv-deco d1"></div><div class="cv-deco d2"></div><div class="cv-deco d3"></div>';
    case 'claude': return `<div class="cv-deco d1">${STARBURST(accent)}</div><div class="cv-deco d2"></div>`;
    case 'swiss': return '<div class="cv-deco d1"></div><div class="cv-deco d2"></div>';
    case 'notes': return '<div class="cv-deco d2"></div><div class="cv-deco d1"><span>‹ 备忘录</span><span>···</span></div>';
    case 'editorial': return '<div class="cv-deco d2"></div><div class="cv-deco d1"></div>';
    case 'photo': return '<div class="cv-deco d1"></div>';
    default: return '';
  }
}

/** Title markup: `\n` → line break, `==x==` → highlighted run. */
function titleHtml(title: string): string {
  return esc(title.trim())
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/\s*(\\n|\n)\s*/g, '<br>');
}

export function renderCover(opts: CoverOptions): CoverRender {
  const tpl = opts.template ?? 'aurora';
  const meta = coverTemplates.find((t) => t.id === tpl) ?? coverTemplates[0];
  const accent = opts.accent || meta.accent;
  const size = typeof opts.size === 'object' ? opts.size : coverSizes[opts.size ?? 'xhs'];
  const scale = opts.scale ?? 2;
  const W = size.width / scale;
  const H = size.height / scale;
  const ratio = W / H;
  const orient = ratio > 1.25 ? 'wide' : ratio < 0.9 ? 'portrait' : 'square';
  const u = Math.min(W, H) / 100;

  // Estimate a title size from available area; the DOM fitter refines it.
  const title = opts.title?.trim() || '未命名标题';
  const len = Math.max(2, visualLength(title.replace(/==/g, '')));
  const padX = orient === 'wide' ? 20 : 16;
  const availW = W - u * padX * (orient === 'wide' ? 1.6 : 1);
  const availH = H * (orient === 'wide' ? 0.42 : 0.42);
  const lineH = 1.22;
  let fs = Math.sqrt((availW * availH) / (len * lineH));
  fs = Math.min(fs, availW / Math.min(len, orient === 'wide' ? 14 : 7), u * (orient === 'wide' ? 24 : 15.5));
  fs = Math.max(fs, u * 5.5);

  const vars = [
    `width:${W}px`, `height:${H}px`, `--u:${u.toFixed(3)}px`,
    `--accent:${accent}`, `--accent-2:${mix(accent, 0.35, '#ec4899')}`, `--accent-3:${mix(accent, 0.5, '#f59e0b')}`,
    `--accent-soft:${rgba(accent, 0.35)}`, `--on-accent:${readableOn(accent)}`,
    `--cv-title-size:${fs.toFixed(1)}px`,
  ];
  if (opts.background) vars.push(`--cv-photo:url('${opts.background.replace(/'/g, '%27')}')`);
  if (opts.background && !['photo', 'aurora', 'terminal'].includes(tpl)) vars.push(`background-image:linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.82)),url('${opts.background.replace(/'/g, '%27')}')`, 'background-size:cover', 'background-position:center');

  const author = opts.author?.trim();
  const initial = author ? Array.from(author.replace(/^@/, ''))[0]?.toUpperCase() : '';
  const tags = (opts.tags ?? []).slice(0, orient === 'wide' ? 3 : 5);

  const badge = opts.badge ? `<span class="cv-badge">${esc(opts.badge)}</span>` : '';
  const emoji = opts.emoji ? `<div class="cv-emoji">${esc(opts.emoji)}</div>` : '';
  const titleEl = `<h1 class="cv-title">${titleHtml(title)}</h1>`;
  const sub = opts.subtitle ? `<p class="cv-sub">${esc(opts.subtitle)}</p>` : '';
  const tagsEl = tags.length ? `<div class="cv-tags">${tags.map((t) => `<span class="cv-tag">#${esc(t.replace(/^#/, ''))}</span>`).join('')}</div>` : '';
  const foot = author ? `<span class="cv-avatar">${esc(initial)}</span><span class="cv-author">${esc(author)}</span>` : '';
  const today = new Date();
  const date = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  let inner: string;
  switch (tpl) {
    case 'glass':
      inner = `<div class="cv-panel"><div class="cv-top">${badge}</div><div class="cv-main">${emoji}${titleEl}${sub}${tagsEl}</div><div class="cv-foot">${foot}</div></div>`;
      break;
    case 'brutal':
      inner = `<div class="cv-card"><div class="cv-top">${badge}</div><div class="cv-main">${emoji}${titleEl}${sub}${tagsEl}</div><div class="cv-foot">${foot}</div></div>`;
      break;
    case 'terminal':
      inner = `<div class="cv-window"><div class="cv-bar"><i style="background:#ff5f56"></i><i style="background:#ffbd2e"></i><i style="background:#27c93f"></i><span style="margin-left:auto">~/${esc((author || 'md2').replace(/^@/, ''))}</span></div>
<div class="cv-body"><div class="cv-top">${badge}</div><div class="cv-main"><div class="cv-prompt">$ cat README.md</div>${titleEl}${sub}${tagsEl}</div></div><div class="cv-foot">${foot}</div></div>`;
      break;
    case 'bento':
      inner = `<div class="cv-grid"><div class="cv-tile t-top">${badge || '<span></span>'}<div class="cv-foot">${foot}</div></div>
<div class="cv-tile t-main"><div class="cv-main">${titleEl}${sub}</div></div>
<div class="cv-tile t-accent">${opts.emoji ? emoji : `<div class="cv-emoji">✦</div>`}</div>
<div class="cv-tile t-meta">${tagsEl || `<span style="opacity:.6">${date}</span>`}</div></div>`;
      break;
    case 'notes':
      inner = `<div class="cv-date">${date}</div><div class="cv-top">${badge}</div><div class="cv-main">${emoji}${titleEl}${sub}${tagsEl}</div><div class="cv-foot">${foot}</div>`;
      break;
    default:
      inner = `<div class="cv-top">${badge}</div><div class="cv-main">${emoji}${titleEl}${sub}${tagsEl}</div><div class="cv-foot">${foot}</div>`;
  }

  const html = `<div class="md2-cover cv-${tpl} cv-${orient}" style="${vars.join(';')}">${decorations(tpl, accent)}${inner}</div>`;

  return { html, css: COVER_CSS, width: size.width, height: size.height, cssWidth: W, cssHeight: H, scale };
}
