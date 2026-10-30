// Google Docs HTML export -> a flat list of blocks (DOM-free: parse5 tree only).
//
// Google's export marks bold/italic with generated CSS classes (`.c5{font-weight:700}`)
// rather than <b>/<i>, flattens nested lists into sibling <ul class="lst-kix_..-N">,
// wraps links in https://www.google.com/url?q=..., and appends comments as
// footnote-like divs. All of that is handled here. Never throws on content.
import { parse } from 'parse5';

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  href?: string;
}
export type Seg = Run | { image: string } | { br: true };

export interface ParagraphBlock {
  kind: 'paragraph';
  runs: Seg[];
}
export interface HeadingBlock {
  kind: 'heading';
  /** 0 = Google "Title" style, 1-6 = h1-h6. */
  level: number;
  runs: Seg[];
}
export interface ListItem {
  runs: Seg[];
  depth: number;
}
export interface ListBlock {
  kind: 'list';
  ordered: boolean;
  start: number;
  items: ListItem[];
}
export interface TableBlock {
  kind: 'table';
  /** rows -> cells -> lines -> runs (one line per paragraph / list item / <br> in the cell). */
  rows: Seg[][][][];
}
export interface ImageBlock {
  kind: 'image';
  src: string;
}
export type Block = ParagraphBlock | HeadingBlock | ListBlock | TableBlock | ImageBlock;

// ---- minimal parse5 node typing -------------------------------------------------
interface PNode {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: PNode[];
  content?: PNode;
}

const attr = (n: PNode, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const kids = (n: PNode): PNode[] => n.childNodes ?? n.content?.childNodes ?? [];

interface Fmt {
  bold: boolean;
  italic: boolean;
  href?: string;
}

interface StyleRules {
  bold: Map<string, boolean>;
  italic: Map<string, boolean>;
}

/** Collect `.cN{...}` class rules for font-weight / font-style from the export's <style> blocks. */
function readStyles(root: PNode): StyleRules {
  const rules: StyleRules = { bold: new Map(), italic: new Map() };
  const visit = (n: PNode) => {
    if (n.nodeName === 'style') {
      const css = kids(n)
        .map((c) => c.value ?? '')
        .join('');
      for (const m of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
        const w = declBold(m[2]);
        if (w !== undefined) rules.bold.set(m[1], w);
        const it = declItalic(m[2]);
        if (it !== undefined) rules.italic.set(m[1], it);
      }
    }
    kids(n).forEach(visit);
  };
  visit(root);
  return rules;
}

function declBold(decls: string): boolean | undefined {
  const m = /font-weight\s*:\s*([\w]+)/i.exec(decls);
  if (!m) return undefined;
  const v = m[1].toLowerCase();
  if (v === 'bold' || v === 'bolder') return true;
  if (v === 'normal' || v === 'lighter') return false;
  const n = Number(v);
  return Number.isFinite(n) ? n >= 600 : undefined;
}

function declItalic(decls: string): boolean | undefined {
  const m = /font-style\s*:\s*(\w+)/i.exec(decls);
  if (!m) return undefined;
  return m[1].toLowerCase() === 'italic' || m[1].toLowerCase() === 'oblique';
}

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'div', 'section', 'article', 'header', 'footer', 'main', 'blockquote', 'pre', 'hr', 'body', 'dl', 'dt', 'dd',
]);
const SKIP_TAGS = new Set(['style', 'script', 'head', 'title', 'meta', 'link', 'noscript', '#comment']);

/** Undo Google's link redirect wrapper; allow only http(s) and mailto. */
export function cleanHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  let h = href.trim();
  try {
    const u = new URL(h);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url' && u.searchParams.get('q')) {
      h = u.searchParams.get('q')!;
    }
  } catch {
    return undefined;
  }
  return /^(https?:|mailto:)/i.test(h) ? h : undefined;
}

class Walker {
  blocks: Block[] = [];
  private rules: StyleRules;
  constructor(rules: StyleRules) {
    this.rules = rules;
  }

  fmtFor(n: PNode, base: Fmt): Fmt {
    const f: Fmt = { ...base };
    const tag = n.nodeName;
    if (tag === 'b' || tag === 'strong') f.bold = true;
    if (tag === 'i' || tag === 'em') f.italic = true;
    for (const cls of (attr(n, 'class') ?? '').split(/\s+/).filter(Boolean)) {
      const b = this.rules.bold.get(cls);
      if (b !== undefined) f.bold = b;
      const it = this.rules.italic.get(cls);
      if (it !== undefined) f.italic = it;
    }
    const style = attr(n, 'style');
    if (style) {
      const b = declBold(style);
      if (b !== undefined) f.bold = b;
      const it = declItalic(style);
      if (it !== undefined) f.italic = it;
    }
    if (tag === 'a') {
      const href = attr(n, 'href');
      f.href = cleanHref(href);
    }
    return f;
  }

  /** Inline content of `n` (text, links, images, line breaks). Nested block elements become line breaks. */
  inline(n: PNode, fmt: Fmt, out: Seg[]): void {
    for (const c of kids(n)) {
      const tag = c.nodeName;
      if (tag === '#text') {
        out.push({ text: c.value ?? '', bold: fmt.bold, italic: fmt.italic, href: fmt.href });
      } else if (SKIP_TAGS.has(tag)) {
        continue;
      } else if (tag === 'br') {
        out.push({ br: true });
      } else if (tag === 'img') {
        const src = attr(c, 'src');
        if (src) out.push({ image: src });
      } else if (tag === 'a' && /^#(cmnt|ftnt)/.test(attr(c, 'href') ?? '')) {
        continue; // comment / footnote reference marker like [a]
      } else if (BLOCK_TAGS.has(tag)) {
        if (out.length && !('br' in out[out.length - 1])) out.push({ br: true });
        this.inline(c, this.fmtFor(c, fmt), out);
        out.push({ br: true });
      } else {
        this.inline(c, this.fmtFor(c, fmt), out);
      }
    }
  }

  /** Emit text segments as `make(runs)` blocks and split images out as image blocks, keeping order. */
  emitWithImages(segs: Seg[], make: (runs: Seg[]) => Block): void {
    let cur: Seg[] = [];
    const flush = () => {
      if (hasText(cur)) this.blocks.push(make(cur));
      cur = [];
    };
    for (const s of segs) {
      if ('image' in s) {
        flush();
        this.blocks.push({ kind: 'image', src: s.image });
      } else cur.push(s);
    }
    flush();
  }

  block(n: PNode, fmt: Fmt): void {
    let pending: Seg[] = [];
    const flushPending = () => {
      if (pending.length) this.emitWithImages(pending, (runs) => ({ kind: 'paragraph', runs }));
      pending = [];
    };
    for (const c of kids(n)) {
      const tag = c.nodeName;
      if (SKIP_TAGS.has(tag)) continue;
      if (tag === '#text' || !BLOCK_TAGS.has(tag)) {
        this.inline({ nodeName: 'span', childNodes: [c] }, fmt, pending);
        continue;
      }
      flushPending();
      const f = this.fmtFor(c, fmt);
      if (/^h[1-6]$/.test(tag)) {
        const segs: Seg[] = [];
        this.inline(c, f, segs);
        const level = Number(tag[1]);
        this.emitWithImages(segs, (runs) => ({ kind: 'heading', level, runs }));
      } else if (tag === 'p') {
        const cls = (attr(c, 'class') ?? '').split(/\s+/);
        const segs: Seg[] = [];
        this.inline(c, f, segs);
        if (cls.includes('title')) this.emitWithImages(segs, (runs) => ({ kind: 'heading', level: 0, runs }));
        else this.emitWithImages(segs, (runs) => ({ kind: 'paragraph', runs }));
      } else if (tag === 'ul' || tag === 'ol') {
        this.list(c, f);
      } else if (tag === 'table') {
        this.table(c, f);
      } else if (tag === 'hr') {
        continue;
      } else if (tag === 'div' && isCommentDiv(c)) {
        continue; // Google Docs comment thread appended at the end of the export
      } else {
        this.block(c, f);
      }
    }
    flushPending();
  }

  list(n: PNode, fmt: Fmt): void {
    const ordered = n.nodeName === 'ol';
    const start = Number(attr(n, 'start')) || 1;
    const depthMatch = /lst-kix_\w+-(\d+)/.exec(attr(n, 'class') ?? '');
    const baseDepth = depthMatch ? Number(depthMatch[1]) : 0;
    const items: ListItem[] = [];
    const images: string[] = [];
    const visit = (list: PNode, depth: number) => {
      for (const li of kids(list)) {
        if (li.nodeName !== 'li') {
          if (li.nodeName === 'ul' || li.nodeName === 'ol') visit(li, depth + 1);
          continue;
        }
        const segs: Seg[] = [];
        const nested: PNode[] = [];
        const liFmt = this.fmtFor(li, fmt);
        for (const c of kids(li)) {
          if (c.nodeName === 'ul' || c.nodeName === 'ol') nested.push(c);
          else this.inline({ nodeName: 'span', childNodes: [c] }, liFmt, segs);
        }
        const text: Seg[] = [];
        for (const s of segs) {
          if ('image' in s) images.push(s.image);
          else text.push(s);
        }
        if (hasText(text)) items.push({ runs: text, depth });
        for (const sub of nested) visit(sub, depth + 1);
      }
    };
    visit(n, baseDepth);
    // Google exports consecutive (and nested) list levels as sibling lists: merge them.
    const prev = this.blocks[this.blocks.length - 1];
    if (items.length) {
      if (prev && prev.kind === 'list' && (prev.ordered === ordered || baseDepth > 0)) prev.items.push(...items);
      else this.blocks.push({ kind: 'list', ordered, start, items });
    }
    for (const src of images) this.blocks.push({ kind: 'image', src });
  }

  table(n: PNode, fmt: Fmt): void {
    const rows: Seg[][][] = [];
    const images: string[] = [];
    const visitRows = (node: PNode) => {
      for (const c of kids(node)) {
        if (c.nodeName === 'tr') {
          const cells: Seg[][] = [];
          for (const td of kids(c)) {
            if (td.nodeName !== 'td' && td.nodeName !== 'th') continue;
            const segs: Seg[] = [];
            this.inline(td, this.fmtFor(td, fmt), segs);
            const text: Seg[] = [];
            for (const s of segs) {
              if ('image' in s) images.push(s.image);
              else text.push(s);
            }
            cells.push(text);
          }
          rows.push(cells);
        } else if (['thead', 'tbody', 'tfoot'].includes(c.nodeName)) visitRows(c);
      }
    };
    visitRows(n);
    if (rows.some((r) => r.some(hasText))) this.blocks.push({ kind: 'table', rows: rows.map((r) => r.map(splitLines)) });
    for (const src of images) this.blocks.push({ kind: 'image', src });
  }
}

function isCommentDiv(n: PNode): boolean {
  let found = false;
  const visit = (x: PNode) => {
    if (found) return;
    if (x.nodeName === 'a' && /^cmnt\d/.test(attr(x, 'id') ?? '')) found = true;
    kids(x).forEach(visit);
  };
  visit(n);
  return found;
}

/** Split a run list at line breaks. */
export function splitLines(segs: Seg[]): Seg[][] {
  const lines: Seg[][] = [[]];
  for (const s of segs) {
    if ('br' in s) lines.push([]);
    else lines[lines.length - 1].push(s);
  }
  return lines.filter(hasText);
}

export function hasText(segs: Seg[]): boolean {
  return segs.some((s) => 'text' in s && s.text.replace(/[\s ​-‏‪-‮⁦-⁩﻿]/g, '') !== '');
}

/** Parse a Google Docs HTML export into blocks. */
export function parseGoogleDocHtml(html: string): Block[] {
  const doc = parse(html) as unknown as PNode;
  const walker = new Walker(readStyles(doc));
  const htmlEl = kids(doc).find((c) => c.nodeName === 'html') ?? doc;
  const body = kids(htmlEl).find((c) => c.nodeName === 'body') ?? htmlEl;
  walker.block(body, { bold: false, italic: false });
  return walker.blocks;
}
