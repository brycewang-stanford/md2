import type { ParsedDoc } from '@md2/core';

export interface StyleSettings {
  theme: string;
  /** '' = the theme's default code theme */
  codeTheme: string;
  /** '' = the theme's default colour */
  primary: string;
  fontSize: number;
  font: 'sans' | 'serif';
}

export interface PanelProps {
  doc: ParsedDoc;
  style: StyleSettings;
  setStyle: (s: Partial<StyleSettings>) => void;
  scrollRatio: number;
}

export const FONT_SIZES = [14, 15, 16, 17, 18].map((v) => ({ value: v, label: `${v}px` }));
