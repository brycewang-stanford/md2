import { useCallback, useEffect, useMemo, useState } from 'react';
import { isMathReady, preloadMath, type DiagramResolver, type ParsedDoc } from '@md2/core';
import { mermaidConfig, renderMermaidSvg } from '@md2/core/dom';

/**
 * Loads MathJax the first time a document needs it and returns a fresh doc
 * object afterwards so memoised renders pick up the real formulas.
 */
export function useEngines(doc: ParsedDoc): ParsedDoc {
  const [ready, setReady] = useState(isMathReady());
  useEffect(() => {
    if (doc.hasMath && !ready) {
      preloadMath()
        .then(() => setReady(true))
        .catch((e) => console.error('md2: could not load MathJax', e));
    }
  }, [doc.hasMath, ready]);
  return useMemo(() => ({ ...doc }), [doc, ready]);
}

const svgCache = new Map<string, string>();
let mermaidPromise: Promise<{ initialize(c: unknown): void; render(id: string, code: string): Promise<{ svg: string }> }> | null = null;
let initialisedFor = '';

/** Renders ```mermaid blocks (lazily loading mermaid) and returns a resolver for the renderers. */
export function useDiagrams(doc: ParsedDoc, accent: string, dark: boolean): { diagram: DiagramResolver | undefined; pending: boolean } {
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const flavour = `${accent}|${dark ? 'd' : 'l'}`;
  const key = (code: string) => `${flavour}\n${code}`;

  useEffect(() => {
    const missing = doc.diagrams.filter((d) => d.lang === 'mermaid' && !svgCache.has(key(d.code)));
    if (!missing.length) return;
    let cancelled = false;
    setPending(true);
    (async () => {
      try {
        mermaidPromise ??= import('mermaid').then((m) => m.default as never);
        const mermaid = await mermaidPromise;
        if (initialisedFor !== flavour) {
          mermaid.initialize(mermaidConfig(accent, dark));
          initialisedFor = flavour;
        }
        for (const d of missing) {
          try {
            svgCache.set(key(d.code), await renderMermaidSvg(mermaid, d.code));
          } catch (e) {
            console.warn('md2: diagram failed', e);
            svgCache.set(key(d.code), ''); // invalid diagram → stays a code block
          }
        }
      } catch (e) {
        console.error('md2: could not load mermaid', e);
        mermaidPromise = null;
        for (const d of missing) svgCache.set(key(d.code), '');
      } finally {
        if (!cancelled) {
          setPending(false);
          setVersion((v) => v + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, flavour]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const diagram = useCallback<DiagramResolver>((_lang, code) => svgCache.get(key(code)) || undefined, [flavour, version]);
  return { diagram: doc.diagrams.length ? diagram : undefined, pending };
}
