/* ==========================================================================
   Vanlior — price-chart pings

   The markers that say *when* somebody bought or sold, and the legend that
   doubles as their controls. Three charts mount this: the Overview's price
   performance card, the Analysis tab's price history, and the Research tab's
   price-against-fair-value.

   It lives in its own module for one reason: **the fund markers cost eight
   requests**, and three charts each fetching their own would cost
   twenty-four. `FUND_CACHE` memoises the promise per symbol, so whichever
   chart the reader presses the button on, the other two get the answer free.

   ---------------------------------------------------------------------------
   What a ping is and is not
   ---------------------------------------------------------------------------

   It is a **time**. Nothing here is scaled by size, because a marker sized by
   value invites a reader to compare a 1,439-share sale with a 900,000-share
   one on a chart that is about neither.

   The two sources are not the same kind of evidence, and the shapes say so:

   * a **triangle** is a Form 4 — the day the trade happened;
   * a **diamond** is a 13F — the quarter *end it was reported for*. A 13F
     says what a manager held on the last day of a quarter, not when they
     traded, and it is filed up to 45 days later.

   See `deriveInsiderMarkers` and `fundMarkersForQuarter` in `model.js` for
   what is filtered out and why — awards and tax withholdings are not
   decisions to buy or sell, and an index tracker's rebalancing is not a
   conviction.
   ========================================================================== */

import { el } from './util.js';
import { fetchHolderQuarters, hasApiKey } from './fmp.js';
import { fundMarkersForQuarter } from './model.js';

/** symbol -> a promise for its fund markers, so eight requests happen once. */
const FUND_CACHE = new Map();

/** How many quarters of 13F filings a load walks back through. */
const QUARTERS = 8;

function loadFunds(symbol) {
  if (!FUND_CACHE.has(symbol)) {
    FUND_CACHE.set(symbol, fetchHolderQuarters(symbol, QUARTERS).then((results) => {
      const out = [];
      for (const r of results) {
        if (r.status !== 'ok') continue;
        out.push(...fundMarkersForQuarter(r.data));
      }
      return out;
    }).catch(() => []));
  }
  return FUND_CACHE.get(symbol);
}

/** Has some other chart already paid for this symbol's fund markers? */
const fundsReady = (symbol) => FUND_CACHE.has(symbol);

/**
 * Mount the ping controls for one chart.
 *
 * `onChange` fires whenever the marker set changes — a toggle flipped, or the
 * fund fetch landing — and the caller redraws its own chart with
 * `markers()`.
 *
 * Returns `{ legend, note, markers }`. The caller places `legend` and `note`
 * wherever they fit; a card too small for the note can leave it out, because
 * every chip carries the same caveat in its `title`.
 */
export function createPings(a, { onChange, compact = false } = {}) {
  const symbol = a.facts.symbol;
  const insider = a.insiderMarkers || { markers: [], excluded: 0, filings: 0 };

  let showInsider = insider.markers.length > 0;
  let funds = null;                 // null = not loaded, [] = loaded and empty
  let showFunds = false;

  const legend = el('div', { class: `pings ${compact ? 'pings--compact' : ''}`.trim() });
  const note = el('p', { class: 't-tiny subtle mt2' });
  const status = el('span', { class: 'ping__note' });

  const markers = () => [
    ...(showInsider ? insider.markers : []),
    ...(showFunds && funds ? funds : []),
  ];

  const chip = (kind, label, on, toggle, title) => el('button', {
    type: 'button', class: `ping ${on ? 'is-on' : ''}`.trim(), title, onclick: toggle,
  }, [
    el('i', { class: `ping__g ping__g--${kind}` }),
    el('span', { text: label }),
  ]);

  async function pull() {
    status.textContent = `Reading ${QUARTERS} quarters of 13F filings…`;
    funds = await loadFunds(symbol);
    showFunds = true;
    status.textContent = funds.length ? '' : 'No fund position changes were reported.';
    render();
    onChange?.();
  }

  function render() {
    const kids = [];

    if (insider.markers.length) {
      const buys = insider.markers.filter((m) => m.kind === 'insiderBuy').length;
      const sells = insider.markers.length - buys;
      const flip = () => { showInsider = !showInsider; render(); onChange?.(); };
      kids.push(chip('insiderBuy', `Insider buys (${buys})`, showInsider, flip,
        'Open-market purchases on Form 4, at the date on the filing. Awards, option '
        + 'exercises and tax withholdings are not marked.'));
      kids.push(chip('insiderSell', `Insider sells (${sells})`, showInsider, flip,
        'Open-market sales on Form 4, at the date on the filing.'));
    } else {
      kids.push(el('span', { class: 'ping__note',
        text: insider.filings
          ? `${insider.filings} Form 4 filings, none of them an open-market trade`
          : 'No insider filings returned' }));
    }

    if (funds === null) {
      kids.push(hasApiKey()
        ? el('button', {
            type: 'button', class: 'ping ping--load',
            // Free once any chart has paid for it.
            text: fundsReady(symbol) ? 'Show fund positions' : 'Load fund positions',
            onclick: async (e) => { e.currentTarget.disabled = true; await pull(); },
          })
        : el('span', { class: 'ping__note', text: 'Fund positions need a live FMP key' }));
    } else if (funds.length) {
      const adds = funds.filter((m) => m.kind === 'fundBuy').length;
      const flip = () => { showFunds = !showFunds; render(); onChange?.(); };
      kids.push(chip('fundBuy', `Funds added (${adds})`, showFunds, flip,
        'A 13F position increase, placed at the quarter end it was reported for — not a '
        + 'trade date. Index managers are excluded.'));
      kids.push(chip('fundSell', `Funds cut (${funds.length - adds})`, showFunds, flip,
        'A 13F position decrease, placed at the quarter end it was reported for — not a '
        + 'trade date. Index managers are excluded.'));
    }

    kids.push(status);
    legend.replaceChildren(...kids);
    note.textContent = noteText();
  }

  function noteText() {
    const bits = [];

    if (insider.filings) {
      bits.push(`${insider.markers.length} of ${insider.filings} Form 4 filing`
        + `${insider.filings === 1 ? ' is' : 's are'} marked`
        + (insider.excluded
          ? `; ${insider.excluded} ${insider.excluded === 1 ? 'was' : 'were'} left off. Awards, `
            + 'option exercises, gifts and shares withheld to pay tax on a vesting grant are not '
            + 'decisions to buy or sell, and counting them would turn one vesting date into a '
            + 'cluster of "insider buying".'
          : '.'));
    }

    if (funds?.length) {
      bits.push('Fund markers are diamonds because a 13F reports what a manager held at a '
        + 'quarter end, not when they traded — and it is filed up to 45 days later. Index '
        + 'managers are excluded: a tracker’s position moves with the index, not with a view.');
    }

    bits.push('Nothing is scaled by size. A marker says when, not how much.');
    return bits.join(' ');
  }

  render();
  return { legend, note, markers };
}
