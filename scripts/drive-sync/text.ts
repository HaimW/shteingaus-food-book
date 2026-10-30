// Plain-text and Markdown rendering of inline runs, plus Hebrew-tolerant label matching.
import type { Run, Seg } from './gdoc-html.ts';

const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Collapse HTML whitespace (incl. nbsp) to single spaces. */
const collapse = (s: string) => s.replace(/[\s ]+/g, ' ');

/** Plain text of runs; line breaks become "\n". */
export function plain(segs: Seg[]): string {
  return segs
    .map((s) => ('br' in s ? '\n' : 'text' in s ? collapse(s.text) : ''))
    .join('')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/** Plain text on one line. */
export function plainLine(segs: Seg[]): string {
  return plain(segs).replace(/\s*\n\s*/g, ' ').trim();
}

/** Normalize a label / heading for matching: no niqqud, punctuation, invisible marks, extra spaces. */
export function normLabel(s: string): string {
  return s
    .normalize('NFKD')
    .replace(INVISIBLE, '')
    .replace(/[֑-ׇ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escape Markdown-significant characters in text. */
export function escapeMd(text: string): string {
  return text.replace(/([\\`*_[\]<>|])/g, '\\$1');
}

/** Escape what would turn a line into a heading / quote / list. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+-])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2');
}

function mdUrl(href: string): string {
  return href.replace(/[ ()<>]/g, (c) => encodeURIComponent(c));
}

/** Markdown for runs: bold/italic/links; line breaks become hard breaks. */
export function markdown(segs: Seg[], opts: { plainStyle?: boolean } = {}): string {
  // Merge adjacent runs with identical formatting first, so markers wrap whole phrases.
  const lines: Run[][] = [[]];
  for (const s of segs) {
    if ('br' in s) lines.push([]);
    else if ('text' in s) {
      const line = lines[lines.length - 1];
      const prev = line[line.length - 1];
      const r = { ...s, text: collapse(s.text) };
      if (opts.plainStyle) r.bold = r.italic = false;
      if (prev && prev.bold === r.bold && prev.italic === r.italic && prev.href === r.href) prev.text += r.text;
      else line.push(r);
    }
  }
  const rendered = lines
    .map((line) => line.map(renderRun).join('').replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '')
    .map(escapeLineStart);
  return rendered.join('  \n');
}

function renderRun(r: Run): string {
  const lead = /^\s/.test(r.text) ? ' ' : '';
  const trail = /\s$/.test(r.text) && r.text.trim() ? ' ' : '';
  const core = r.text.trim();
  if (!core) return r.text ? ' ' : '';
  let out = escapeMd(core);
  if (r.bold && r.italic) out = `***${out}***`;
  else if (r.bold) out = `**${out}**`;
  else if (r.italic) out = `*${out}*`;
  if (r.href) out = `[${out}](${mdUrl(r.href)})`;
  return lead + out + trail;
}

/** True when every visible character of the runs is bold. */
export function allBold(segs: Seg[]): boolean {
  const visible = segs.filter((s): s is Run => 'text' in s && s.text.replace(INVISIBLE, '').trim() !== '');
  return visible.length > 0 && visible.every((r) => r.bold);
}
