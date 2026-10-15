import { useEffect, useRef } from 'react';
import { EditorView, keymap, placeholder, drawSelection, highlightActiveLine, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { saveAsset } from '../lib/assets';
import { readFileAsDataUrl } from '../lib/image';

const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.25em', color: 'var(--ed-heading)' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.12em', color: 'var(--ed-heading)' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--ed-heading)' },
  { tag: t.strong, fontWeight: '700', color: 'var(--ed-strong)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--ed-link)' },
  { tag: t.monospace, color: 'var(--ed-code)', fontFamily: 'var(--font-mono)' },
  { tag: t.quote, color: 'var(--ed-quote)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--ed-meta)' },
  { tag: t.comment, color: 'var(--ed-meta)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '14.5px', backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.75', padding: '8px 0' },
  '.cm-content': { padding: '12px 0 40vh', caretColor: 'var(--accent)', maxWidth: '760px' },
  '.cm-line': { padding: '0 20px 0 8px' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--text-faint)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 14px', fontSize: '11.5px' },
  '.cm-activeLine': { backgroundColor: 'var(--ed-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-dim)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--ed-selection) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-placeholder': { color: 'var(--text-faint)' },
});

interface Props {
  value: string;
  onChange: (v: string) => void;
  onScrollRatio?: (r: number) => void;
}

async function insertImages(view: EditorView, files: File[]) {
  const parts: string[] = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const id = await saveAsset(await readFileAsDataUrl(f));
    parts.push(`![${f.name.replace(/\.[^.]+$/, '')}](asset:${id})`);
  }
  if (!parts.length) return;
  const { from, to } = view.state.selection.main;
  const text = parts.join('\n\n');
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
}

export function Editor({ value, onChange, onScrollRatio }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const scrollRef = useRef(onScrollRatio);
  scrollRef.current = onScrollRatio;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          closeBrackets(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(mdHighlight),
          theme,
          placeholder('在这里写 Markdown，或把 .md 文件 / 图片拖进来…'),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changeRef.current(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(e, view) {
              const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
              if (!files.length) return false;
              e.preventDefault();
              void insertImages(view, files);
              return true;
            },
            drop(e, view) {
              const files = Array.from(e.dataTransfer?.files ?? []);
              const md = files.find((f) => /\.(md|markdown|txt)$/i.test(f.name));
              if (md) {
                e.preventDefault();
                void md.text().then((text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
                return true;
              }
              const imgs = files.filter((f) => f.type.startsWith('image/'));
              if (!imgs.length) return false;
              e.preventDefault();
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos !== null) view.dispatch({ selection: { anchor: pos } });
              void insertImages(view, imgs);
              return true;
            },
            scroll(_e, view) {
              const el = view.scrollDOM;
              const max = el.scrollHeight - el.clientHeight;
              scrollRef.current?.(max > 0 ? el.scrollTop / max : 0);
            },
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // external value changes (open file / load sample)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="editor" ref={host} />;
}
