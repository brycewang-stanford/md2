import { createLowlight, common } from 'lowlight';
import type { Element, ElementContent } from 'hast';

const lowlight = createLowlight(common);

const ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', zsh: 'bash', shell: 'bash',
  yml: 'yaml', md: 'markdown', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', golang: 'go',
  rs: 'rust', kt: 'kotlin', rb: 'ruby', jsx: 'javascript', tsx: 'typescript', vue: 'xml', html: 'xml',
};

export function normalizeLang(lang: string | undefined): string {
  const l = (lang || '').toLowerCase().trim();
  return ALIASES[l] ?? l;
}

/** Language of a `<code class="language-x">` element, if any. */
export function codeLang(code: Element): string {
  const cls: unknown = code.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : typeof cls === 'string' ? cls.split(/\s+/) : [];
  const hit = list.find((c: string) => c.startsWith('language-'));
  return hit ? hit.slice('language-'.length) : '';
}

/** Syntax-highlight code into hast nodes carrying `hljs-*` classes. */
export function highlightCode(code: string, lang: string): ElementContent[] {
  const l = normalizeLang(lang);
  if (l && lowlight.registered(l)) {
    try {
      return lowlight.highlight(l, code).children as ElementContent[];
    } catch {
      /* fall through */
    }
  }
  return [{ type: 'text', value: code }];
}
