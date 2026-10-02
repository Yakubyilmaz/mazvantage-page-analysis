/* ==========================================================================
   Maz Vantage — SEC filings

   The documents everything else in the report is computed from, listed as
   the company filed them. FMP's `sec-filings-search/symbol` returns one row
   per filing with its form type, dates and two links (the EDGAR index page
   and the primary document). It carries no description, no section and no
   text — so what a form *is* comes from this file, and it is the SEC's
   meaning of the form, not a reading of what any one filing says.

   The groups are by purpose, because that is how a reader looks for one:
   "the annual report", "what insiders did", "what was announced". A form
   this file does not know falls into Other with its code printed as filed;
   it is never guessed into a group.
   ========================================================================== */

export type FilingGroup = 'reports' | 'current' | 'insider' | 'proxy' | 'ownership' | 'offerings' | 'other';

export const FILING_GROUPS: { id: FilingGroup; label: string; blurb: string }[] = [
  { id: 'reports', label: 'Annual & quarterly', blurb: 'The audited annual report and the quarterly reports: the statements every grade on this report is built from.' },
  { id: 'current', label: 'Current reports', blurb: 'Material events between reports: results, executive changes, deals, votes. Filed within four business days of the event.' },
  { id: 'insider', label: 'Insider filings', blurb: 'Directors’, officers’ and 10% holders’ own trades in the stock, and notices of planned sales.' },
  { id: 'proxy', label: 'Proxy & votes', blurb: 'What shareholders are asked to vote on, and what the board and outside holders say about it.' },
  { id: 'ownership', label: 'Major holders', blurb: 'A holder crossing 5% of the shares, passively (13G) or with intent to influence (13D).' },
  { id: 'offerings', label: 'Registrations & offerings', blurb: 'Shares and debt registered for sale, and the prospectus for each issue.' },
  { id: 'other', label: 'Other', blurb: 'Everything else the company filed, with the form code as filed.' },
];

/** The SEC's meaning of each form, in a line. Amendments (`/A`) are handled by `describeForm`. */
const FORMS: Record<string, { group: FilingGroup; what: string }> = {
  '10-K': { group: 'reports', what: 'Annual report — audited statements, risk factors, management’s discussion' },
  '10-KT': { group: 'reports', what: 'Transition-period annual report, after a change of fiscal year' },
  '10-Q': { group: 'reports', what: 'Quarterly report — unaudited statements for the quarter' },
  '20-F': { group: 'reports', what: 'Annual report of a foreign private issuer' },
  '40-F': { group: 'reports', what: 'Annual report of a Canadian issuer under the multijurisdictional system' },
  'NT 10-K': { group: 'reports', what: 'Notice that the annual report will be late' },
  'NT 10-Q': { group: 'reports', what: 'Notice that the quarterly report will be late' },
  'NT 20-F': { group: 'reports', what: 'Notice that the foreign annual report will be late' },
  '11-K': { group: 'reports', what: 'Annual report of an employee stock-purchase or savings plan' },
  ARS: { group: 'proxy', what: 'Annual report sent to shareholders with the proxy' },

  '8-K': { group: 'current', what: 'Current report — a material event since the last report' },
  '6-K': { group: 'current', what: 'Current report of a foreign private issuer' },

  '3': { group: 'insider', what: 'Initial statement of an insider’s holdings' },
  '4': { group: 'insider', what: 'Change in an insider’s holdings — a trade, grant or exercise' },
  '5': { group: 'insider', what: 'Annual statement of insider transactions not reported on Form 4' },
  '144': { group: 'insider', what: 'Notice of a proposed sale of restricted or control shares' },

  'DEF 14A': { group: 'proxy', what: 'Definitive proxy statement — the annual meeting’s agenda, board and pay' },
  'PRE 14A': { group: 'proxy', what: 'Preliminary proxy statement' },
  DEFA14A: { group: 'proxy', what: 'Additional proxy materials' },
  DEFM14A: { group: 'proxy', what: 'Definitive proxy statement for a merger vote' },
  DEFR14A: { group: 'proxy', what: 'Revised definitive proxy statement' },
  'DEF 14C': { group: 'proxy', what: 'Information statement — an action taken without a shareholder vote' },
  PX14A6G: { group: 'proxy', what: 'Exempt solicitation — a shareholder’s case on a proxy item' },
  PX14A6N: { group: 'proxy', what: 'Notice of an exempt solicitation' },

  'SC 13D': { group: 'ownership', what: 'A holder above 5% who may seek to influence the company' },
  'SC 13G': { group: 'ownership', what: 'A passive holder above 5%' },
  'SCHEDULE 13D': { group: 'ownership', what: 'A holder above 5% who may seek to influence the company' },
  'SCHEDULE 13G': { group: 'ownership', what: 'A passive holder above 5%' },

  'S-1': { group: 'offerings', what: 'Registration of securities — typically a first offering' },
  'S-3': { group: 'offerings', what: 'Short-form registration for an issuer already reporting' },
  'S-3ASR': { group: 'offerings', what: 'Automatic shelf registration of a well-known seasoned issuer' },
  'S-4': { group: 'offerings', what: 'Registration of securities issued in a merger or exchange' },
  'S-8': { group: 'offerings', what: 'Registration of shares for employee equity plans' },
  'S-8 POS': { group: 'offerings', what: 'Amendment to an employee-plan registration' },
  'F-1': { group: 'offerings', what: 'Registration by a foreign issuer' },
  'F-3': { group: 'offerings', what: 'Short-form registration by a foreign issuer' },
  POSASR: { group: 'offerings', what: 'Amendment to an automatic shelf registration' },
  FWP: { group: 'offerings', what: 'Free-writing prospectus — offering terms published before the final prospectus' },

  SD: { group: 'other', what: 'Specialized disclosure — conflict minerals' },
  '25-NSE': { group: 'other', what: 'An exchange removing a class of securities from listing' },
  CORRESP: { group: 'other', what: 'The company’s letter to SEC staff' },
  UPLOAD: { group: 'other', what: 'SEC staff letter to the company' },
};

const AMEND = /\/A$/;

/** Group and one-line meaning of a form code, as filed. */
export function describeForm(raw: string | null | undefined): { form: string; group: FilingGroup; what: string; amended: boolean } {
  const form = String(raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const amended = AMEND.test(form);
  const base = form.replace(AMEND, '');
  let hit = FORMS[base];
  // The prospectus supplements are numbered by the rule they are filed under
  // (424B2, 424B3, 424B5 …) — one family, one meaning.
  if (!hit && /^424B\d+$/.test(base)) hit = { group: 'offerings', what: 'Prospectus supplement — the final terms of one issue' };
  if (!hit) return { form: form || 'n/a', group: 'other', what: 'Not described here; open the filing for what it is', amended };
  return { form, group: hit.group, what: amended ? `Amendment — ${hit.what.charAt(0).toLowerCase()}${hit.what.slice(1)}` : hit.what, amended };
}

export interface Filing {
  form: string;
  group: FilingGroup;
  what: string;
  amended: boolean;
  /** YYYY-MM-DD, the day the SEC dates the filing */
  filed: string;
  /** when EDGAR accepted it, to the second — orders a day's filings */
  accepted: string | null;
  /** the primary document */
  url: string | null;
  /** the EDGAR index page: every exhibit in the filing */
  index: string | null;
}

/* The links come from a vendor feed and go into an href, so only http(s) is
   allowed through — a `javascript:` string would otherwise be a link. */
const safeUrl = (u: unknown): string | null => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
const day = (d: unknown): string => (typeof d === 'string' ? d.slice(0, 10) : '');

/** Vendor rows to filings, newest first. Rows with no form and no date are dropped. */
export function normaliseFilings(rows: unknown): Filing[] {
  if (!Array.isArray(rows)) return [];
  const out: Filing[] = [];
  for (const r of rows as any[]) {
    if (!r || typeof r !== 'object') continue;
    const filed = day(r.filingDate) || day(r.acceptedDate);
    if (!filed || !r.formType) continue;
    const d = describeForm(r.formType);
    out.push({
      ...d,
      filed,
      accepted: typeof r.acceptedDate === 'string' ? r.acceptedDate : null,
      url: safeUrl(r.finalLink) || safeUrl(r.link),
      index: safeUrl(r.link),
    });
  }
  return out.sort((a, b) => (b.accepted || b.filed).localeCompare(a.accepted || a.filed));
}

const DAY = 864e5;

export interface FilingSummary {
  total: number;
  byGroup: Record<FilingGroup, number>;
  /** form code → count, most frequent first */
  forms: { form: string; count: number }[];
  oldest: string | null;
  newest: string | null;
  lastAnnual: Filing | null;
  lastQuarterly: Filing | null;
  current90: number;
  insider90: number;
  /** the vendor's row cap was hit, so the window is shorter than asked for */
  capped: boolean;
}

/** The figures over the list. `now` is a parameter so the test can pin it. */
export function summariseFilings(list: Filing[], { cap = Infinity, now = Date.now() }: { cap?: number; now?: number } = {}): FilingSummary {
  const byGroup = Object.fromEntries(FILING_GROUPS.map((g) => [g.id, 0])) as Record<FilingGroup, number>;
  const counts = new Map<string, number>();
  for (const f of list) {
    byGroup[f.group] += 1;
    counts.set(f.form, (counts.get(f.form) || 0) + 1);
  }
  const since = (n: number) => (f: Filing) => now - new Date(f.filed).getTime() <= n * DAY;
  const annual = /^(10-K|10-KT|20-F|40-F)$/;
  return {
    total: list.length,
    byGroup,
    forms: [...counts].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)),
    oldest: list.at(-1)?.filed ?? null,
    newest: list[0]?.filed ?? null,
    lastAnnual: list.find((f) => !f.amended && annual.test(f.form)) ?? null,
    lastQuarterly: list.find((f) => !f.amended && f.form === '10-Q') ?? null,
    current90: list.filter((f) => f.group === 'current').filter(since(90)).length,
    insider90: list.filter((f) => /^[345]$/.test(f.form.replace(AMEND, ''))).filter(since(90)).length,
    capped: list.length >= cap,
  };
}

/** The filings in one group, and optionally one form within it. */
export function filterFilings(list: Filing[], group: FilingGroup | 'all', form: string | null = null): Filing[] {
  return list.filter((f) => (group === 'all' || f.group === group) && (!form || f.form === form));
}
