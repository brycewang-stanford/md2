import type { DiagramResolver, ParsedDoc } from '@md2/core';

export interface StyleSettings {
  theme: string;
  /** '' = the theme's default code theme */
  codeTheme: string;
  /** '' = the theme's default colour */
  primary: string;
  fontSize: number;
  font: 'sans' | 'serif';
  /** Fine-tuning; undefined = theme default */
  lineHeight?: number;
  paragraphSpacing?: number;
  letterSpacing?: number;
  textIndent?: boolean;
  justify?: boolean;
  headingAlign?: '' | 'left' | 'center';
  customCss?: string;
}

export const DEFAULT_STYLE: StyleSettings = { theme: 'claude', codeTheme: '', primary: '', fontSize: 16, font: 'sans' };

export interface PanelProps {
  doc: ParsedDoc;
  style: StyleSettings;
  setStyle: (s: Partial<StyleSettings>) => void;
  scrollRatio: number;
  /** Mermaid → SVG resolver (undefined when the doc has no diagrams) */
  diagram?: DiagramResolver;
}

export const FONT_SIZES = [14, 15, 16, 17, 18].map((v) => ({ value: v, label: `${v}px` }));
