import postcss, { type Rule, type Declaration } from 'postcss';
import { selectAll } from 'hast-util-select';
import { visit } from 'unist-util-visit';
import type { Root, Element } from 'hast';

interface StyledRule {
  selector: string;
  specificity: number;
  order: number;
  decls: { prop: string; value: string; important: boolean }[];
}

interface Applied {
  value: string;
  important: boolean;
  weight: number;
}

export interface InlineCssOptions {
  /** Extra CSS custom properties, e.g. `{ '--md2-primary': '#d97757' }` */
  vars?: Record<string, string>;
  /** Remove `class` attributes after inlining (WeChat strips them anyway). */
  stripClasses?: boolean;
}

/** a-b-c specificity packed into one number. Good enough for theme CSS. */
export function specificity(selector: string): number {
  let s = selector.replace(/::?(before|after|first-line|first-letter|placeholder)\b/g, '');
  let a = 0;
  let b = 0;
  let c = 0;
  // :not(x) / :is(x) count as their argument
  s = s.replace(/:(not|is|has)\(([^)]*)\)/g, (_, _n, inner) => ` ${inner} `);
  s = s.replace(/:where\([^)]*\)/g, ' ');
  a += (s.match(/#[\w-]+/g) || []).length;
  b += (s.match(/\.[\w-]+/g) || []).length;
  b += (s.match(/\[[^\]]+\]/g) || []).length;
  b += (s.match(/:(?!:)[\w-]+(\([^)]*\))?/g) || []).length;
  const types = s
    .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?/g, ' ')
    .split(/[\s>+~,]+/)
    .filter((t) => t && t !== '*');
  c += types.length;
  return a * 10000 + b * 100 + c;
}

function resolveVars(value: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 8 || !value.includes('var(')) return value;
  const out = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fb) =>
    vars[name] !== undefined ? vars[name] : (fb ?? '').trim(),
  );
  return resolveVars(out, vars, depth + 1);
}

const ROOT_SELECTORS = new Set([':root', '.md2', 'section.md2']);

/**
 * Inline a stylesheet into a hast tree: every matching rule is written to the
 * element's `style` attribute with proper specificity / `!important` / source
 * order handling. Pseudo-elements and at-rules are skipped (they cannot be
 * inlined); themes use real `<span>`s injected by the renderer instead.
 */
export function inlineCss(tree: Root, css: string, opts: InlineCssOptions = {}): Root {
  const root = postcss.parse(css);
  const vars: Record<string, string> = {};
  const rules: StyledRule[] = [];
  let order = 0;

  root.walkRules((rule: Rule) => {
    if (rule.parent && rule.parent.type === 'atrule') return; // @media etc.
    const decls: StyledRule['decls'] = [];
    rule.walkDecls((d: Declaration) => {
      if (d.prop.startsWith('--')) {
        if (rule.selectors.some((s) => ROOT_SELECTORS.has(s.trim()))) vars[d.prop] = d.value.trim();
        return;
      }
      decls.push({ prop: d.prop, value: d.value, important: d.important });
    });
    if (!decls.length) return;
    for (const raw of rule.selectors) {
      const selector = raw.trim();
      if (/::|:(before|after|hover|focus|active|visited)\b/.test(selector)) continue;
      rules.push({ selector, specificity: specificity(selector), order: order++, decls });
    }
  });
  Object.assign(vars, opts.vars);

  rules.sort((x, y) => x.specificity - y.specificity || x.order - y.order);

  const applied = new Map<Element, Map<string, Applied>>();
  const inline = new Map<Element, string>();
  visit(tree, 'element', (el: Element) => {
    const style = el.properties?.style;
    if (typeof style === 'string' && style.trim()) inline.set(el, style);
  });

  // Prefilter: skip rules whose rightmost compound needs a tag/class absent from the tree
  const tags = new Set<string>();
  const classes = new Set<string>();
  visit(tree, 'element', (el: Element) => {
    tags.add(el.tagName);
    const c: unknown = el.properties?.className;
    if (Array.isArray(c)) c.forEach((x) => classes.add(String(x)));
    else if (typeof c === 'string') c.split(/\s+/).forEach((x) => classes.add(x));
  });
  const possible = (selector: string) => {
    const last = selector.replace(/\([^)]*\)/g, '').split(/[\s>+~]+/).filter(Boolean).pop() ?? '';
    const tag = /^[a-z][\w-]*/i.exec(last)?.[0];
    if (tag && !tags.has(tag.toLowerCase())) return false;
    for (const m of last.matchAll(/\.([\w-]+)/g)) if (!classes.has(m[1])) return false;
    return true;
  };

  let weight = 0;
  for (const rule of rules) {
    if (!possible(rule.selector)) continue;
    let matched: Element[];
    try {
      matched = selectAll(rule.selector, tree) as Element[];
    } catch {
      continue; // unsupported selector
    }
    if (!matched.length) continue;
    weight++;
    for (const el of matched) {
      let map = applied.get(el);
      if (!map) applied.set(el, (map = new Map()));
      for (const d of rule.decls) {
        const prev = map.get(d.prop);
        if (prev && prev.important && !d.important) continue;
        map.set(d.prop, { value: resolveVars(d.value, vars), important: d.important, weight });
      }
    }
  }

  for (const [el, map] of applied) {
    const parts: string[] = [];
    for (const [prop, v] of map) parts.push(`${prop}: ${v.value}`);
    const own = inline.get(el);
    el.properties.style = parts.join('; ') + (own ? '; ' + resolveVars(own, vars) : '');
  }

  if (opts.stripClasses) {
    visit(tree, 'element', (el: Element) => {
      if (el.properties) delete el.properties.className;
    });
  }
  return tree;
}
