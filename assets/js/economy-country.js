/* The selected country's indicator board.

   The board beside this one is the United States and says so: FMP's
   `economic-indicators` series exist for no other country, so a reader who
   picks France cannot be shown the same thing with a different flag on it.
   What France does have is its release calendar, and that is what this board
   is — the latest reported actual for each series the country published in the
   loaded history, the move against the print before it, and the earlier prints
   of the same series as its line.

   Three things are deliberately the vendor's rather than this app's: the
   ordering (its `impact` rating), the unit (printed as reported, never
   rebased) and the estimate. Where a release carries no unit the card prints
   the bare number, because inventing one would be a claim about a series this
   file cannot check. */
import { el, isNum } from './util.js';
import { economicIndicators } from './markethub-widgets.js';

const IMPACT_LABEL = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' };
const reading = (value) => !isNum(value) ? '—'
  : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const releaseDate = (date) => {
  const when = new Date(String(date || '').replace(' ', 'T').slice(0, 19) + 'Z');
  return Number.isNaN(when.getTime()) ? String(date || '')
    : when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

/* The move since the previous print, in the unit the series is reported in.
   A percentage series moves in percentage points, not per cent of itself —
   inflation going from 2.1% to 2.4% is +0.30 pp, and calling that +14% would
   be a different and much more alarming statement. */
function movement(entry) {
  if (!entry.previous || !isNum(entry.latest?.value) || !isNum(entry.previous.value)) return null;
  const delta = entry.latest.value - entry.previous.value;
  const sign = delta > 0 ? '+' : '−';
  const size = delta === 0 ? 'Unchanged'
    : entry.unit === '%' ? `${sign}${Math.abs(delta).toFixed(2)} pp`
      : `${sign}${Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 2 })}${entry.unit || ''}`;
  return { direction: delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : '',
    text: `${size} since ${releaseDate(entry.previous.date)}` };
}

/** What the vendor expected, where it published an expectation. */
function against(entry) {
  const estimate = entry.latest?.estimate;
  if (!isNum(estimate)) return IMPACT_LABEL[entry.impact] || '';
  const label = IMPACT_LABEL[entry.impact];
  return `${label ? `${label} · ` : ''}Forecast ${reading(estimate)}${entry.unit || ''}`;
}

/**
 * `series` is what `countryReleases()` returns. `status`/`message` describe the
 * calendar request behind it, so a board with nothing in it can say whether
 * that is a quiet country or a refused request.
 */
export function countryEconomy(country, series = [], { status = 'ok', message = '' } = {}) {
  const root = el('section', { class: 'em-country', id: 'economy-country' });
  const cards = series.map(entry => ({
    name: entry.event,
    note: against(entry),
    display: reading(entry.latest?.value, entry.unit),
    unit: entry.unit || '',
    change: movement(entry),
    history: entry.points.map(point => ({ date: point.date, value: point.value })),
    date: entry.latest?.date || null,
    dateText: `Released ${releaseDate(entry.latest?.date)}`,
  }));
  root.append(
    el('div', { class: 'em-heading' }, [
      el('h2', { text: country.name }),
      el('span', { class: 'mh-scope', text: 'From the release calendar' }),
    ]),
    el('p', { class: 'em-meta', text: `The latest reported figure for each series ${country.name} published in the past 180 days, highest impact first, as its release stated it. FMP publishes its indicator *series* — the charted board — for the United States only, so this country is read from its calendar instead: the move is against the previous release, and the line is the earlier releases of the same series.` }),
    cards.length ? economicIndicators(cards)
      : el('p', { class: 'em-country__none', text: status === 'skipped'
        ? `Connect your FMP API key in Settings to load ${country.name}'s releases.`
        : message || `FMP returned no release carrying a reported figure for ${country.name} in the past 180 days.` }),
  );
  return root;
}
