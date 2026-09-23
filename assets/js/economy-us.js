/* The United States indicator board.

   FMP's `economic-indicators` feed is a US dataset — there is no equivalent
   series for any other country, which is why this board is labelled United
   States and stays that way whichever country the picker holds.

   Six series lead the section because they are the ones a reader opens the
   page for. The other seventeen cost a request per 90-day window each, so they
   wait behind a button that says what they cost, the way every bought column
   in this product does.

   Scales are this file's, not the vendor's: the feed returns a bare number and
   the table in `markethub-data.js` records which unit each series is in. A
   value is printed in the unit it was reported in, never rebased. */
import { el, isNum } from './util.js';
import { US_INDICATORS, US_INDICATOR_GROUPS } from './markethub-data.js';
import { economicIndicators } from './markethub-widgets.js';

const FORMAT = {
  percent: value => `${value.toFixed(2)}%`,
  index: value => value.toLocaleString('en-US', { maximumFractionDigits: 2 }),
  usd: value => `$${Math.round(value).toLocaleString('en-US')}`,
  usdBn: value => `${value < 0 ? '−' : ''}$${(Math.abs(value) / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}T`,
  usdMn: value => `${value < 0 ? '−' : ''}$${(Math.abs(value) / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`,
  jobs: value => `${(value / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`,
  people: value => Math.round(value).toLocaleString('en-US'),
  thousandUnits: value => `${Math.round(value).toLocaleString('en-US')}K`,
  millionUnits: value => `${value.toFixed(2)}M`,
};
/* A change is a different size from a level: a quarter of real GDP moves by
   billions, not by trillions, so a delta is printed at the scale it lands on
   rather than at the scale of the level above it. */
const DELTA = {
  ...FORMAT,
  usdBn: value => `$${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}B`,
  usdMn: value => value >= 1000 ? `$${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`
    : `$${Math.round(value).toLocaleString('en-US')}M`,
  jobs: value => value >= 1000 ? `${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`
    : `${Math.round(value).toLocaleString('en-US')}K`,
};
/* A reading in the unit its series is reported in. The chart beside this board
   prints its axis and its readout through the same table, so one series says
   one thing in both places. */
export const indicatorValue = (value, unit) => !isNum(value) ? '—' : (FORMAT[unit] || FORMAT.index)(value);
const at = date => new Date(`${String(date).slice(0, 10)}T12:00:00Z`);
/** The period an observation covers, said the way its release says it. */
export function periodOf(date, step) {
  const when = at(date);
  if (Number.isNaN(when.getTime())) return String(date);
  if (step === 'quarter') return `Q${Math.floor(when.getUTCMonth() / 3) + 1} ${when.getUTCFullYear()}`;
  if (step === 'week') return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return when.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The move since the previous observation, in the unit it was measured in. */
function movement(entry) {
  if (!entry.latest || !entry.previous || !isNum(entry.latest.value) || !isNum(entry.previous.value)) return null;
  const delta = entry.latest.value - entry.previous.value;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const size = entry.unit === 'percent'
    ? `${sign}${Math.abs(delta).toFixed(2)} pp`
    : `${sign}${(DELTA[entry.unit] || DELTA.index)(Math.abs(delta))}`;
  const relative = entry.unit !== 'percent' && entry.previous.value !== 0
    ? ` (${sign}${Math.abs(delta / entry.previous.value * 100).toFixed(2)}%)` : '';
  return { direction: delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : '',
    text: `${size}${relative} since ${periodOf(entry.previous.date, entry.step)}` };
}

function card(entry) {
  const failed = entry.status !== 'ok';
  return {
    name: entry.label || entry.name,
    note: failed ? entry.message : entry.note,
    display: failed ? '—' : indicatorValue(entry.latest?.value, entry.unit),
    change: failed ? null : movement(entry),
    history: entry.points || [],
    date: entry.latest?.date || null,
    // The date on one of these rows is the period observed, not the day it was
    // published — printing it as a release date would be a different claim.
    dateText: entry.latest ? `${entry.step === 'week' ? 'Week of' : 'Period ·'} ${periodOf(entry.latest.date, entry.step)}`
      : 'No observation in the loaded windows',
  };
}

/**
 * The board. `loaded` is the map `loadUsIndicators()` returns; `loadMore` is
 * handed the names still missing and returns the same shape for them.
 */
export function usEconomy(loaded = new Map(), { loadMore = null, status = 'ok' } = {}) {
  const data = new Map(loaded);
  const root = el('section', { class: 'em-us', id: 'economy-us' });
  const body = el('div', { class: 'em-us__body' });
  let filling = false;

  const missing = () => US_INDICATORS.filter(item => !data.has(item.name));
  const cost = list => list.reduce((total, item) => total + (item.windows || 1), 0);

  function consent() {
    const rest = missing();
    if (!rest.length) return null;
    if (status === 'skipped') return null;
    const progress = el('span', { class: 'em-progress', 'aria-live': 'polite' });
    const button = el('button', {
      type: 'button', class: 'em-load', text: `Load the other ${rest.length} series`,
      onclick: async () => {
        if (filling || !loadMore) return;
        filling = true;
        button.disabled = true;
        button.textContent = 'Loading…';
        const extra = await loadMore(rest.map(item => item.name), (done, total) => {
          progress.textContent = ` ${done} of ${total}…`;
        });
        for (const [name, entry] of extra) data.set(name, entry);
        filling = false;
        draw();
      },
    });
    return el('div', { class: 'em-consent' }, [
      el('div', {}, [
        el('strong', { text: `${rest.length} more series are not loaded yet.` }),
        el('p', { text: `FMP answers one series per request and caps each at 90 days, so a series with history costs a request per window: about ${cost(rest)} requests for the rest of the board. They are cached for ten minutes once loaded.` }),
      ]),
      el('div', { class: 'em-consent__act' }, [button, progress]),
    ]);
  }

  function draw() {
    const nodes = [];
    for (const group of US_INDICATOR_GROUPS) {
      const rows = US_INDICATORS.filter(item => item.group === group && data.has(item.name))
        .map(item => card({ ...item, ...data.get(item.name) }));
      if (!rows.length) continue;
      nodes.push(el('div', { class: 'em-us__group' }, [
        el('h3', { class: 'em-us__group-title', text: group }),
        economicIndicators(rows),
      ]));
    }
    if (!nodes.length) {
      nodes.push(el('p', { class: 'em-us__none', text: status === 'skipped'
        ? 'Connect your FMP API key in Settings to load the US indicator series.'
        : 'FMP returned no observation for any of these series.' }));
    }
    body.replaceChildren(...nodes, ...[consent()].filter(Boolean));
  }

  root.append(
    el('div', { class: 'em-heading' }, [
      el('h2', { text: 'United States' }),
      el('span', { class: 'mh-scope', text: 'US series only' }),
    ]),
    el('p', { class: 'em-meta', text: 'Economic indicator series from FMP, which publishes them for the United States and no other country. Each figure is the latest observation in the series, in the unit it is reported in; the move is against the observation before it.' }),
    body,
  );
  draw();
  root.refresh = next => { for (const [name, entry] of next) data.set(name, entry); draw(); };
  return root;
}
