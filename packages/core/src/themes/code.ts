export interface CodeTheme {
  id: string;
  name: string;
  dark: boolean;
  bg: string;
  text: string;
  css: string;
}

interface Palette {
  comment: string; keyword: string; string: string; number: string; title: string;
  type: string; attr: string; variable: string; meta: string; deletion: string;
}

const tokens = (c: Palette) => `
.hljs-comment, .hljs-quote { color: ${c.comment}; font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-doctag, .hljs-section, .hljs-name, .hljs-meta .hljs-keyword { color: ${c.keyword}; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-meta .hljs-string { color: ${c.string}; }
.hljs-number, .hljs-literal, .hljs-symbol, .hljs-bullet, .hljs-variable.constant_ { color: ${c.number}; }
.hljs-title, .hljs-title.function_, .hljs-title.class_ { color: ${c.title}; }
.hljs-built_in, .hljs-type, .hljs-class { color: ${c.type}; }
.hljs-attr, .hljs-attribute, .hljs-property, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id { color: ${c.attr}; }
.hljs-variable, .hljs-template-variable, .hljs-params, .hljs-subst { color: ${c.variable}; }
.hljs-meta, .hljs-tag { color: ${c.meta}; }
.hljs-deletion { color: ${c.deletion}; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: bold; }
.hljs-link { text-decoration: underline; }
`;

const def = (id: string, name: string, dark: boolean, bg: string, text: string, p: Palette): CodeTheme => ({
  id, name, dark, bg, text, css: tokens(p),
});

/** Modern editor palettes (Vitesse, Tokyo Night, Catppuccin, Rosé Pine, GitHub Primer). */
export const codeThemes: CodeTheme[] = [
  def('github-light', 'GitHub Light', false, '#f6f8fa', '#1f2328', {
    comment: '#59636e', keyword: '#cf222e', string: '#0a3069', number: '#0550ae', title: '#8250df',
    type: '#953800', attr: '#0550ae', variable: '#953800', meta: '#116329', deletion: '#82071e',
  }),
  def('github-dark', 'GitHub Dark', true, '#0d1117', '#e6edf3', {
    comment: '#8b949e', keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', title: '#d2a8ff',
    type: '#ffa657', attr: '#79c0ff', variable: '#ffa657', meta: '#7ee787', deletion: '#ffa198',
  }),
  def('vitesse-light', 'Vitesse Light', false, '#f7f7f5', '#393a34', {
    comment: '#a0ada0', keyword: '#1e754f', string: '#b56959', number: '#2f798a', title: '#59873a',
    type: '#2e8f82', attr: '#b07d48', variable: '#b07d48', meta: '#ab5959', deletion: '#ab5959',
  }),
  def('vitesse-dark', 'Vitesse Dark', true, '#121212', '#dbd7ca', {
    comment: '#758575', keyword: '#4d9375', string: '#c98a7d', number: '#4c9a91', title: '#80a665',
    type: '#5da994', attr: '#bd976a', variable: '#bd976a', meta: '#cb7676', deletion: '#cb7676',
  }),
  def('tokyo-night', 'Tokyo Night', true, '#1a1b26', '#a9b1d6', {
    comment: '#565f89', keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', title: '#7aa2f7',
    type: '#2ac3de', attr: '#73daca', variable: '#c0caf5', meta: '#f7768e', deletion: '#f7768e',
  }),
  def('catppuccin-latte', 'Catppuccin Latte', false, '#eff1f5', '#4c4f69', {
    comment: '#8c8fa1', keyword: '#8839ef', string: '#40a02b', number: '#fe640b', title: '#1e66f5',
    type: '#df8e1d', attr: '#179299', variable: '#e64553', meta: '#d20f39', deletion: '#d20f39',
  }),
  def('catppuccin-mocha', 'Catppuccin Mocha', true, '#1e1e2e', '#cdd6f4', {
    comment: '#7f849c', keyword: '#cba6f7', string: '#a6e3a1', number: '#fab387', title: '#89b4fa',
    type: '#f9e2af', attr: '#94e2d5', variable: '#eba0ac', meta: '#f38ba8', deletion: '#f38ba8',
  }),
  def('rose-pine-dawn', 'Rosé Pine Dawn', false, '#faf4ed', '#575279', {
    comment: '#9893a5', keyword: '#286983', string: '#ea9d34', number: '#d7827e', title: '#d7827e',
    type: '#56949f', attr: '#907aa9', variable: '#575279', meta: '#b4637a', deletion: '#b4637a',
  }),
];

export function getCodeTheme(id?: string): CodeTheme {
  return codeThemes.find((t) => t.id === id) ?? codeThemes[0];
}
