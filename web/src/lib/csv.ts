/* ==========================================================================
   Maz Vantage — CSV in and out

   Out: any table as a file a spreadsheet opens. Numbers go out as numbers,
   not as the "US$4.54t" the page prints, because a spreadsheet can do nothing
   with the second. Two defences are built in:
   - a leading byte-order mark, without which Excel reads UTF-8 as Latin-1
     and turns every "—" and "€" into mojibake;
   - text that begins with =, +, -, @ or a tab is prefixed with an apostrophe,
     because a spreadsheet would otherwise run it as a formula — a company
     name or a news headline is not something to execute. Numbers are exempt:
     a negative number is a number, not a formula.

   In: a reader's holdings from a broker's export or a spreadsheet. The
   delimiter is detected rather than assumed — a comma in the US, a semicolon
   from a European Excel, a tab when cells are pasted straight from a sheet.
   ========================================================================== */

import { BRAND_SLUG } from './brand';

export type CsvCell = string | number | boolean | null | undefined;

const RISKY = /^[=+\-@\t\r]/;

function cellText(v: CsvCell): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  let s = String(v);
  // A lone "-" is a placeholder, and "-12.5%" is a number written as text;
  // neither is a formula.
  if (RISKY.test(s) && s.length > 1 && !/^[+-]?[\d.]/.test(s.replace(/,/g, ''))) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text, CRLF-terminated as RFC 4180 has it. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(cellText).join(',')).join('\r\n') + '\r\n';
}

/** A filename that says what and when: `mazvantage-aapl-income-statement-2026-09-30.csv`. */
export function csvFilename(...parts: (string | null | undefined)[]): string {
  const slug = parts
    .filter((p): p is string => !!p && !!p.trim())
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('-');
  const day = new Date().toISOString().slice(0, 10);
  return `${BRAND_SLUG}-${slug || 'table'}-${day}.csv`;
}

/** Hand the reader a file. Nothing leaves the browser. */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? `﻿${text}` : text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  downloadText(filename, toCsv(headers, rows));
}

/* ---------- a rendered table ---------------------------------------------------- */

/** What a cell reads as on screen, whitespace collapsed. */
const visibleText = (el: Element) => ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * A table as it is drawn. For the report's tables, whose cells are already
 * formatted for reading and have no raw value behind them in the DOM, the
 * text a reader sees is the honest export. Cells marked `data-csv-skip`
 * (a remove button, a star) are left out.
 */
export function tableToRows(table: HTMLTableElement): { headers: string[]; rows: string[][] } {
  const rowsOf = (section: Element | null) => (section ? [...section.querySelectorAll(':scope > tr')] : []);
  const cells = (tr: Element) => [...tr.children].filter((c) => !c.hasAttribute('data-csv-skip')).map(visibleText);
  const headRows = rowsOf(table.tHead);
  const bodyRows = table.tBodies.length ? [...table.tBodies].flatMap((b) => rowsOf(b)) : rowsOf(table);
  const headers = headRows.length ? cells(headRows[headRows.length - 1]) : [];
  return { headers, rows: bodyRows.map(cells).filter((r) => r.some(Boolean)) };
}

/**
 * The nearest heading above an element — the table's name for its filename.
 * Walks up the ancestors and takes the last heading that comes before the
 * element in document order.
 */
export function headingFor(el: Element): string | null {
  for (let node: Element | null = el.parentElement; node; node = node.parentElement) {
    const heads = [...node.querySelectorAll('h1, h2, h3, h4')].filter(
      (h) => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    if (heads.length) return visibleText(heads[heads.length - 1]);
  }
  return null;
}

/* ---------- reading one --------------------------------------------------------------- */

/** Which of comma, semicolon or tab separates the fields on the header line. */
function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const count = (d: string) => line.split(d).length - 1;
  const tabs = count('\t');
  const semis = count(';');
  const commas = count(',');
  if (tabs > 0 && tabs >= commas) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/** CSV text to rows of strings: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === d) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/**
 * A number as a person or a broker writes it: "$1,234.50", "1.234,50" from a
 * European export, "(12.5)" for a negative, "12%" as twelve. Null for
 * anything that is not one.
 */
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || /^(n\/?a|—|-|–)$/i.test(s)) return null;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()\s$€£¥]|US\$|USD|EUR|GBP/gi, '').replace(/%$/, '');
  // With both separators the last one is the decimal: "1.234,56" is European,
  // "1,234.56" American. With commas alone, "1,234" and "1,234,567" are
  // thousands and "12,5" is a European decimal — three digits after a single
  // comma is read as thousands, because share counts are written that way far
  // more often than prices with three decimals.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const parts = s.split(',');
    s = parts.length > 2 || parts[parts.length - 1].length === 3 ? parts.join('') : s.replace(',', '.');
  }
  if (!/^[+-]?\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? (negative ? -v : v) : null;
}

/** A date in the formats exports use, as `YYYY-MM-DD`; null when it is not one. */
export function parseDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  // US order first, the way US brokers export: 03/14/2024. A first number
  // over 12 can only be a day, so 14/03/2024 still reads correctly.
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    let [a, b] = [+m[1], +m[2]];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12 && b <= 12) [a, b] = [b, a];
    return iso(y, a, b);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}
