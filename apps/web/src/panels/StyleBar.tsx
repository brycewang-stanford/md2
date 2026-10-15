import { codeThemes, getTheme } from '@md2/core';
import { ColorField, Select, ThemePicker } from '../components/ui';
import { FONT_SIZES, type StyleSettings } from './types';

/** Theme / code theme / colour / size / font controls shared by WeChat & XHS. */
export function StyleBar({ style, setStyle, compact }: { style: StyleSettings; setStyle: (s: Partial<StyleSettings>) => void; compact?: boolean }) {
  const theme = getTheme(style.theme);
  return (
    <>
      <ThemePicker value={style.theme} onChange={(theme) => setStyle({ theme, primary: '', codeTheme: '' })} />
      <Select
        value={style.codeTheme || theme.codeTheme}
        options={codeThemes.map((c) => ({ value: c.id, label: `⌘ ${c.name}` }))}
        onChange={(codeTheme) => setStyle({ codeTheme })}
      />
      <ColorField value={style.primary} fallback={theme.primary} onChange={(primary) => setStyle({ primary })} />
      {!compact && (
        <>
          <Select value={style.fontSize} options={FONT_SIZES} onChange={(fontSize) => setStyle({ fontSize })} />
          <Select
            value={style.font}
            options={[
              { value: 'sans', label: '无衬线' },
              { value: 'serif', label: '衬线' },
            ]}
            onChange={(font) => setStyle({ font })}
          />
        </>
      )}
    </>
  );
}

export function styleOptions(style: StyleSettings) {
  const theme = getTheme(style.theme);
  return {
    theme: style.theme,
    codeTheme: style.codeTheme || undefined,
    primaryColor: style.primary || undefined,
    fontSize: style.fontSize,
    // keep a theme's own serif/sans choice unless the user picked serif explicitly
    fontFamily: style.font === 'serif' ? 'serif' : theme.vars?.['--md2-font'] ? undefined : 'sans',
  };
}
