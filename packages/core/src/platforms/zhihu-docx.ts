/**
 * Word export for Zhihu's 导入 → 导入文档. A pasted article only carries image
 * URLs, which Zhihu's servers must fetch (impossible for files that aren't on a
 * public host); a .docx carries the image bytes, and Zhihu uploads them itself
 * when it imports the file. The document is built from the same HTML as
 * "Copy for Zhihu", so both routes produce the same article.
 */
import JSZip from 'jszip';
import { fromHtml } from 'hast-util-from-html';
import { toText } from 'hast-util-to-text';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import { renderZhihu, type ZhihuOptions } from './zhihu.js';
import type { ParsedDoc, RenderWarning } from '../types.js';

export interface DocxImage {
  data: Uint8Array;
  mime: string;
}

export interface ZhihuDocxOptions extends ZhihuOptions {
  /** Bytes of an image, given its src as it appears in the Zhihu HTML (after resolveImage) */
  loadImage: (src: string) => Promise<DocxImage>;
}

export interface ZhihuDocxResult {
  data: Uint8Array;
  title: string;
  warnings: RenderWarning[];
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp' };
/** 6 inches: the text width of an A4 / Letter page with ~1 inch margins */
const MAX_WIDTH_EMU = 5486400;
const EMU_PER_PX = 9525;
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'blockquote', 'figure', 'table', 'hr', 'div', 'section', 'details', 'main']);

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Pixel size from the image header (PNG, GIF, JPEG, WebP). */
export function imageSize(b: Uint8Array): { width: number; height: number } | undefined {
  const be16 = (i: number) => (b[i] << 8) | b[i + 1];
  const le16 = (i: number) => b[i] | (b[i + 1] << 8);
  const le24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const be32 = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  if (b.length < 24) return undefined;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: be32(16), height: be32(20) };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: le16(6), height: le16(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return undefined;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: be16(i + 7), height: be16(i + 5) };
      i += 2 + be16(i + 2);
    }
    return undefined;
  }
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...b.slice(12, 16));
    if (chunk === 'VP8X') return { width: le24(24) + 1, height: le24(27) + 1 };
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
  }
  return undefined;
}

interface Media {
  rId: string;
  cx: number;
  cy: number;
}

interface Fmt {
  b?: boolean;
  i?: boolean;
  s?: boolean;
  code?: boolean;
  sup?: boolean;
  sub?: boolean;
  link?: boolean;
}

interface Para {
  style?: string;
  jc?: 'center';
  num?: { id: number; level: number };
  indent?: number;
  border?: boolean;
  keepNext?: boolean;
}

class DocxWriter {
  body: string[] = [];
  rels: string[] = [];
  /** w:num instances: [numId, abstractNumId] (0 = bullets, 1 = decimal) */
  nums: [number, number][] = [];
  media = new Map<string, Media | Error>();
  files: [string, Uint8Array][] = [];
  equations = 0;
  private rel = 0;
  private drawing = 0;
  private quote = 0;

  addRel(type: string, target: string, external = false): string {
    const id = `rId${++this.rel + 10}`;
    this.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${esc(target)}"${external ? ' TargetMode="External"' : ''}/>`);
    return id;
  }

  addImage(img: DocxImage): Media {
    const ext = EXT[img.mime.toLowerCase()] ?? 'png';
    const name = `image${this.files.length + 1}.${ext}`;
    this.files.push([`word/media/${name}`, img.data]);
    const size = imageSize(img.data) ?? { width: 600, height: 400 };
    let cx = size.width * EMU_PER_PX;
    let cy = size.height * EMU_PER_PX;
    if (cx > MAX_WIDTH_EMU) {
      cy = Math.round((cy * MAX_WIDTH_EMU) / cx);
      cx = MAX_WIDTH_EMU;
    }
    return { rId: this.addRel('image', `media/${name}`), cx, cy };
  }

  newNum(ordered: boolean): number {
    const id = this.nums.length + 1;
    this.nums.push([id, ordered ? 1 : 0]);
    return id;
  }

  para(runs: string, p: Para = {}) {
    if (!runs && !p.border) return;
    const style = p.style ?? (this.quote ? 'Quote' : undefined);
    const pPr = [
      style && `<w:pStyle w:val="${style}"/>`,
      p.keepNext && '<w:keepNext/>',
      p.num && `<w:numPr><w:ilvl w:val="${p.num.level}"/><w:numId w:val="${p.num.id}"/></w:numPr>`,
      p.border && '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D0D0D0"/></w:pBdr>',
      p.indent && `<w:ind w:left="${p.indent}"/>`,
      p.jc && `<w:jc w:val="${p.jc}"/>`,
    ].filter(Boolean);
    this.body.push(`<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${runs}</w:p>`);
  }

  // ───── inline ─────

  run(text: string, f: Fmt): string {
    const rPr = [
      f.link && '<w:rStyle w:val="Hyperlink"/>',
      f.code && '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>',
      f.b && '<w:b/>',
      f.i && '<w:i/>',
      f.s && '<w:strike/>',
      f.code && '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>',
      f.sup && '<w:vertAlign w:val="superscript"/>',
      f.sub && '<w:vertAlign w:val="subscript"/>',
    ].filter(Boolean);
    const parts = text.split('\n');
    const body = parts.map((t, i) => `${i ? '<w:br/>' : ''}${t ? `<w:t xml:space="preserve">${esc(t)}</w:t>` : ''}`).join('');
    return `<w:r>${rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''}${body}</w:r>`;
  }

  image(el: Element): string {
    const src = String(el.properties.src ?? '');
    const alt = String(el.properties.alt ?? '');
    if (el.properties.eeimg) {
      // Zhihu's equation images: keep the TeX so the formula can be re-inserted with 公式
      this.equations++;
      return this.run(`$${alt.replace(/\\\\$/, '')}$`, { code: true });
    }
    const m = this.media.get(src);
    if (!m || m instanceof Error) return this.run(`[图片：${alt || src}]`, { i: true });
    const id = ++this.drawing;
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${m.cx}" cy="${m.cy}"/>` +
      `<wp:docPr id="${id}" name="Picture ${id}" descr="${esc(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
      `<pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}" descr="${esc(alt)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${m.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${m.cx}" cy="${m.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    );
  }

  runs(nodes: ElementContent[], f: Fmt = {}): string {
    let out = '';
    for (const n of nodes) {
      if (n.type === 'text') {
        // HTML whitespace: newlines inside a paragraph render as spaces
        const t = n.value.replace(/\s*\n\s*/g, ' ');
        if (t) out += this.run(t, f);
        continue;
      }
      if (n.type !== 'element') continue;
      const kids = n.children as ElementContent[];
      switch (n.tagName) {
        case 'strong':
        case 'b':
          out += this.runs(kids, { ...f, b: true });
          break;
        case 'em':
        case 'i':
          out += this.runs(kids, { ...f, i: true });
          break;
        case 'del':
        case 's':
          out += this.runs(kids, { ...f, s: true });
          break;
        case 'code':
        case 'kbd':
          out += this.run(toText(n), { ...f, code: true });
          break;
        case 'sup':
          out += this.runs(kids, { ...f, sup: true });
          break;
        case 'sub':
          out += this.runs(kids, { ...f, sub: true });
          break;
        case 'br':
          out += '<w:r><w:br/></w:r>';
          break;
        case 'img':
          out += this.image(n);
          break;
        case 'input':
          break;
        case 'a': {
          const href = String(n.properties.href ?? '');
          if (/^(https?:|mailto:)/i.test(href)) out += `<w:hyperlink r:id="${this.addRel('hyperlink', href, true)}">${this.runs(kids, { ...f, link: true })}</w:hyperlink>`;
          else out += this.runs(kids, f);
          break;
        }
        default:
          out += this.runs(kids, f);
      }
    }
    return out;
  }

  // ───── blocks ─────

  /** Block-level children; stray inline content between blocks becomes its own paragraph. */
  blocks(nodes: (RootContent | ElementContent)[], p: Para = {}) {
    let inline: ElementContent[] = [];
    const flush = () => {
      if (inline.some((n) => n.type === 'element' || (n.type === 'text' && n.value.trim()))) this.para(this.runs(inline), p);
      inline = [];
    };
    for (const n of nodes) {
      if (n.type === 'element' && BLOCKS.has(n.tagName)) {
        flush();
        this.block(n, p);
      } else if (n.type === 'text' || n.type === 'element') inline.push(n as ElementContent);
    }
    flush();
  }

  block(el: Element, p: Para) {
    const kids = el.children as ElementContent[];
    const tag = el.tagName;
    if (/^h[1-6]$/.test(tag)) return this.para(this.runs(kids), { style: `Heading${Math.min(Number(tag[1]), 3)}`, keepNext: true });
    switch (tag) {
      case 'p': {
        const onlyImages = kids.every((n) => (n.type === 'element' && n.tagName === 'img' && !n.properties.eeimg) || (n.type === 'text' && !n.value.trim()));
        return this.para(this.runs(kids), onlyImages && kids.length ? { ...p, jc: 'center' } : p);
      }
      case 'figure': {
        const caption = kids.find((n): n is Element => n.type === 'element' && n.tagName === 'figcaption');
        const media = kids.filter((n) => n !== caption);
        this.para(this.runs(media), { jc: 'center', keepNext: !!caption });
        if (caption) this.para(this.runs(caption.children as ElementContent[]), { style: 'Caption', jc: 'center' });
        return;
      }
      case 'pre':
        return this.para(this.run(toText(el).replace(/\n$/, ''), { code: true }), { style: 'Code' });
      case 'hr':
        return this.para('', { border: true });
      case 'blockquote':
        this.quote++;
        this.blocks(kids, p);
        this.quote--;
        return;
      case 'ul':
      case 'ol':
        return this.list(el, p.num ? p.num.level + 1 : 0);
      case 'table':
        return this.table(el);
      default:
        return this.blocks(kids, p);
    }
  }

  list(el: Element, level: number) {
    const id = this.newNum(el.tagName === 'ol');
    for (const li of el.children) {
      if (li.type !== 'element' || li.tagName !== 'li') continue;
      let first = true;
      let inline: ElementContent[] = [];
      const item = (runs: string) => {
        if (!runs) return;
        this.para(runs, first ? { num: { id, level } } : { indent: 360 * (level + 1) });
        first = false;
      };
      const flush = () => {
        if (inline.some((n) => n.type === 'element' || (n.type === 'text' && n.value.trim()))) item(this.runs(inline));
        inline = [];
      };
      for (const n of li.children) {
        if (n.type === 'element' && (n.tagName === 'ul' || n.tagName === 'ol')) {
          flush();
          this.list(n, level + 1);
          first = false;
        } else if (n.type === 'element' && n.tagName === 'p') {
          flush();
          item(this.runs(n.children as ElementContent[]));
        } else if (n.type === 'element' && BLOCKS.has(n.tagName)) {
          flush();
          this.block(n, {});
          first = false;
        } else if (n.type === 'text' || n.type === 'element') inline.push(n as ElementContent);
      }
      flush();
    }
  }

  table(el: Element) {
    const rows: Element[] = [];
    const collect = (e: Element) => {
      for (const c of e.children) {
        if (c.type !== 'element') continue;
        if (c.tagName === 'tr') rows.push(c);
        else collect(c);
      }
    };
    collect(el);
    const cols = Math.max(1, ...rows.map((r) => r.children.filter((c) => c.type === 'element').length));
    const width = Math.floor(9000 / cols);
    let xml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(cols)}</w:tblGrid>`;
    for (const r of rows) {
      xml += '<w:tr>';
      for (const c of r.children) {
        if (c.type !== 'element') continue;
        const head = c.tagName === 'th';
        const outer = this.body;
        this.body = [];
        const kids = c.children as ElementContent[];
        this.blocks(head ? [{ type: 'element', tagName: 'strong', properties: {}, children: kids }] : kids);
        const content = this.body.join('') || '<w:p/>';
        this.body = outer;
        xml += `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr>${content}</w:tc>`;
      }
      xml += '</w:tr>';
    }
    this.body.push(`${xml}</w:tbl>`, '<w:p/>');
  }
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="PingFang SC" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="8A8A8A"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="D0D0D0"/></w:pBdr><w:ind w:left="240"/></w:pPr><w:rPr><w:color w:val="646464"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F6F6F6"/><w:spacing w:after="160" w:line="260" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="175199"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D0D0D0"/><w:left w:val="single" w:sz="4" w:color="D0D0D0"/><w:bottom w:val="single" w:sz="4" w:color="D0D0D0"/><w:right w:val="single" w:sz="4" w:color="D0D0D0"/><w:insideH w:val="single" w:sz="4" w:color="D0D0D0"/><w:insideV w:val="single" w:sz="4" w:color="D0D0D0"/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

function numbering(nums: [number, number][]): string {
  const levels = (ordered: boolean) =>
    Array.from({ length: 9 }, (_, l) => {
      const fmt = ordered ? 'decimal' : 'bullet';
      const text = ordered ? `%${l + 1}.` : ['•', '◦', '▪'][l % 3];
      return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
    }).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum>` +
    // every list restarts its numbering
    nums.map(([id, abs]) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${abs}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('') +
    '</w:numbering>'
  );
}

/** Render a Markdown document as a .docx for Zhihu's 导入文档, with every image embedded. */
export async function renderZhihuDocx(input: string | ParsedDoc, opts: ZhihuDocxOptions): Promise<ZhihuDocxResult> {
  const r = renderZhihu(input, opts);
  const tree = fromHtml(r.html, { fragment: true }) as Root;
  const w = new DocxWriter();
  // the copy route's warnings are about Zhihu fetching URLs, which a .docx doesn't need
  const warnings: RenderWarning[] = r.warnings.filter((x) => x.code !== 'local-image');

  const srcs = new Set<string>();
  const walk = (n: Root | Element) => {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      if (c.tagName === 'img' && !c.properties.eeimg && c.properties.src) srcs.add(String(c.properties.src));
      walk(c);
    }
  };
  walk(tree);
  await Promise.all(
    [...srcs].map(async (src) => {
      try {
        const img = await opts.loadImage(src);
        if (!EXT[img.mime.toLowerCase()]) throw new Error(`不支持的图片格式 ${img.mime}`);
        w.media.set(src, w.addImage(img));
      } catch (e) {
        w.media.set(src, e as Error);
        warnings.push({ code: 'docx-image', message: `图片无法嵌入 Word（${(e as Error).message}）: ${src}` });
      }
    }),
  );

  w.blocks(tree.children);
  if (w.equations)
    warnings.push({ code: 'docx-math', message: `${w.equations} 个公式以 TeX 文本写入 Word，导入知乎后需用「公式」按钮重新插入` });

  const title = r.doc.title || 'zhihu';
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      Object.entries({ png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })
        .map(([ext, mime]) => `<Default Extension="${ext}" ContentType="${mime}"/>`)
        .join('') +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
  );
  zip.file(
    'docProps/core.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      `<dc:title>${esc(title)}</dc:title><dc:creator>md2</dc:creator></cp:coreProperties>`,
  );
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', numbering(w.nums));
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      `${w.rels.join('')}</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${w.body.join('')}` +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1247" w:bottom="1440" w:left="1247" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>',
  );
  for (const [path, data] of w.files) zip.file(path, data);
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { data, title, warnings };
}
