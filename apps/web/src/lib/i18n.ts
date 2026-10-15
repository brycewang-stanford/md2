/**
 * Minimal bilingual UI: `t('中文', 'English')` picks by the current language.
 * Keeping both strings inline avoids key tables drifting out of sync.
 */
import { useSyncExternalStore } from 'react';

export type Lang = 'zh' | 'en';
const KEY = 'md2:lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  return typeof navigator !== 'undefined' && /^zh/i.test(navigator.language) ? 'zh' : 'en';
}

let lang: Lang = initial();
const subs = new Set<() => void>();

export function t(zh: string, en: string): string {
  return lang === 'zh' ? zh : en;
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  subs.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => lang,
  );
}
