import { useRef, useState } from 'react';
import { codeThemes, getTheme, type StyleOptions } from '@md2/core';
import { ColorField, Icon, Select, ThemePicker, Toggle, useOutside } from '../components/ui';
import { t } from '../lib/i18n';
import { FONT_SIZES, DEFAULT_STYLE, type StyleSettings } from './types';

/** Theme / code theme / colour / size / font / fine-tuning controls shared by WeChat, XHS and 长图. */
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
      {!compact && <Select value={style.fontSize} options={FONT_SIZES} onChange={(fontSize) => setStyle({ fontSize })} />}
      <Tuning style={style} setStyle={setStyle} />
    </>
  );
}

function Slider({ label, value, min, max, step, fallback, unit, onChange }: {
  label: string; value: number | undefined; min: number; max: number; step: number; fallback: number; unit?: string;
  onChange: (v: number | undefined) => void;
}) {
  const v = value ?? fallback;
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <span className="slider-val">
          {value === undefined ? t('默认', 'Auto') : `${v}${unit ?? ''}`}
          {value !== undefined && (
            <button type="button" className="icon-btn" onClick={(e) => (e.preventDefault(), onChange(undefined))} title="reset">
              <Icon name="reset" size={12} />
            </button>
          )}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** "排版微调" popover: spacing, indent, justify, heading alignment, custom CSS. */
function Tuning({ style, setStyle }: { style: StyleSettings; setStyle: (s: Partial<StyleSettings>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);
  const changed =
    style.lineHeight !== undefined || style.paragraphSpacing !== undefined || style.letterSpacing !== undefined ||
    !!style.textIndent || style.justify !== undefined || !!style.headingAlign || !!style.customCss || style.font === 'serif';
  return (
    <div className="picker" ref={ref}>
      <button type="button" className={`picker-btn${changed ? ' is-changed' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title={t('排版微调', 'Fine-tune')}>
        <Icon name="sliders" size={15} />
        <span className="picker-name">{t('微调', 'Tune')}</span>
      </button>
      {open && (
        <div className="popover tuning">
          <Slider label={t('行高', 'Line height')} value={style.lineHeight} min={1.4} max={2.4} step={0.05} fallback={1.75} onChange={(lineHeight) => setStyle({ lineHeight })} />
          <Slider label={t('段落间距', 'Paragraph spacing')} value={style.paragraphSpacing} min={0.4} max={2.4} step={0.1} fallback={1.1} unit="em" onChange={(paragraphSpacing) => setStyle({ paragraphSpacing })} />
          <Slider label={t('字间距', 'Letter spacing')} value={style.letterSpacing} min={0} max={0.2} step={0.01} fallback={0.02} unit="em" onChange={(letterSpacing) => setStyle({ letterSpacing })} />
          <div className="tuning-row">
            <Toggle label={t('首行缩进', 'Indent')} checked={!!style.textIndent} onChange={(textIndent) => setStyle({ textIndent })} />
            <Toggle label={t('两端对齐', 'Justify')} checked={!!style.justify} onChange={(justify) => setStyle({ justify })} />
            <Toggle label={t('衬线字体', 'Serif')} checked={style.font === 'serif'} onChange={(v) => setStyle({ font: v ? 'serif' : 'sans' })} />
          </div>
          <Select
            label={t('标题对齐', 'Headings')}
            value={style.headingAlign ?? ''}
            options={[
              { value: '', label: t('跟随主题', 'Theme default') },
              { value: 'left', label: t('左对齐', 'Left') },
              { value: 'center', label: t('居中', 'Center') },
            ]}
            onChange={(headingAlign) => setStyle({ headingAlign })}
          />
          <label className="field">
            <span className="field-label">{t('自定义 CSS（作用于 .md2）', 'Custom CSS (scoped to .md2)')}</span>
            <textarea
              className="input code-input"
              rows={5}
              spellCheck={false}
              placeholder={'.md2 h2 { color: #e11d48; }\n.md2 blockquote { border-radius: 0; }'}
              value={style.customCss ?? ''}
              onChange={(e) => setStyle({ customCss: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              setStyle({ ...DEFAULT_STYLE, theme: style.theme, codeTheme: style.codeTheme, primary: style.primary, fontSize: style.fontSize, lineHeight: undefined, paragraphSpacing: undefined, letterSpacing: undefined, textIndent: false, justify: undefined, headingAlign: '', customCss: '' })
            }
          >
            {t('全部重置', 'Reset all')}
          </button>
        </div>
      )}
    </div>
  );
}

export function styleOptions(style: StyleSettings): StyleOptions {
  return {
    theme: style.theme,
    codeTheme: style.codeTheme || undefined,
    primaryColor: style.primary || undefined,
    fontSize: style.fontSize,
    fontFamily: style.font === 'serif' ? 'serif' : undefined,
    lineHeight: style.lineHeight,
    paragraphSpacing: style.paragraphSpacing,
    letterSpacing: style.letterSpacing,
    textIndent: style.textIndent || undefined,
    justify: style.justify,
    headingAlign: style.headingAlign || undefined,
    customCss: style.customCss || undefined,
  };
}
