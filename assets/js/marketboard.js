/* One market board, two pages.

   Market Indices and Futures are the same machine: a summary tab that compares
   a handful of instruments on one percentage axis, then a tab per collection,
   each of them the same table twice — Overview columns that arrive with the
   feed the page already loads, and Performance columns that cost a request per
   row and therefore ask first.

   Everything a page knows about its own market — which tabs, which rows fall
   under each, what the note says, what the summary compares — lives in the
   spec it passes in. This file knows none of it. */
import { el, isNum } from './util.js';
import { hasApiKey } from './fmp.js';
import {
  number, percent, changeOf, signed, arrow, instrumentMark,
  priceText, heading, emptyState, carousel, createDialog, newsCard,
} from './markethub-ui.js';
import { marketChart } from './markethub-chart.js';
import { compareChart } from './markethub-compare.js';

export const OVERVIEW_COLUMNS = [
  { key: 'name', label: 'Symbol' },
  { key: 'price', label: 'Price', numeric: true },
  { key: 'changesPercentage', label: 'Chg %', numeric: true, tone: true, suffix: '%' },
  { key: 'change', label: 'Chg', numeric: true, tone: true },
  { key: 'dayHigh', label: 'High', numeric: true },
  { key: 'dayLow', label: 'Low', numeric: true },
];
const toned = (value, text) => el('span', { class: `mh-change ${value > 0 ? 'mh-up' : value < 0 ? 'mh-down' : ''}`, text });

/**
 * @param {object} spec
 *   id, title, meta, boards[{id,label}], news?, summary{load,pick}, board{load,rows,note,columns,performance,unit}
 */
export function renderMarketBoard(nav = {}, spec) {
  const TABS = [{ id: 'overview', label: 'Overview' }, ...spec.boards, ...(spec.news ? [{ id: 'news', label: 'News' }] : [])];
  const resources = new Set();
  const dialogs = new Set();
  let disposed = false;
  let tab = openingTab();
  let columns = 'overview';
  let sort = { key: 'changesPercentage', dir: -1 };
  let board = null;
  let boardError = null;
  let summary = null;
  let news = null;
  let newsHost = null;
  let performance = new Map();
  let filling = false;
  const page = el('main', { class: `mh-page mi-page mi-page--${spec.id}`, id: `market-${spec.id}` });
  const track = node => { resources.add(node); return node; };
  const release = () => {
    for (const node of resources) { node.destroy?.(); node.dispose?.(); }
    resources.clear();
  };
  const openDialog = (title, build, onClose) => {
    let dialog;
    dialog = createDialog(title, build, () => { dialogs.delete(dialog); onClose?.(); });
    dialogs.add(dialog);
    return dialog;
  };
  const openInstrument = row => {
    let chart;
    openDialog(row.name || row.symbol, () => {
      chart = marketChart({ ...row, quote: row });
      return chart;
    }, () => chart?.destroy?.());
  };

  const crumb = el('button', { type: 'button', class: 'mi-crumb', onclick: () => nav.goView?.('markets', 'overview') }, ['Market Data', arrow()]);
  const navigation = el('nav', { class: 'mh-navigation', 'aria-label': `${spec.title} boards` });
  const body = el('div', { class: 'mi-body' });
  page.append(el('header', { class: 'mh-hero' }, [
    el('div', { class: 'mh-eyebrow' }, [crumb]),
    el('h1', { class: 'mi-title', text: spec.title }),
    el('div', { class: 'mh-hero__meta' }, [
      el('span', { text: spec.meta }),
      el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
      el('button', {
        type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`,
        text: hasApiKey() ? 'FMP connected' : 'Connect FMP', onclick: () => nav.openSettings?.(),
      }),
    ]),
  ]), navigation, body);

  function openingTab() {
    try {
      const asked = new URLSearchParams(location.search).get('board');
      if (asked && TABS.some(item => item.id === asked)) return asked;
    } catch { /* no query string to read */ }
    return 'overview';
  }
  function rememberTab(id) {
    try {
      const url = new URL(location.href);
      if (id === 'overview') url.searchParams.delete('board'); else url.searchParams.set('board', id);
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
  }
  function drawTabs() {
    navigation.replaceChildren(...TABS.map(item => el('button', {
      type: 'button', 'data-board': item.id, text: item.label,
      class: item.id === tab ? 'is-active' : '',
      'aria-current': item.id === tab ? 'page' : null,
      onclick: () => setTab(item.id),
    })));
  }
  /** Switching boards redraws from what is already loaded; the index feed and
   *  the country's summary are each fetched once per visit. */
  function setTab(id) {
    if (id === tab) return;
    tab = id;
    columns = 'overview';
    sort = { key: 'changesPercentage', dir: -1 };
    rememberTab(id);
    drawTabs();
    release();
    const ready = id === 'overview' ? summary : id === 'news' ? news : board;
    if (ready) render(); else load();
    page.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- the overview tab -------------------------------------------------- */

  function drawSummary() {
    const view = spec.summary.pick(summary?.data || {});
    const quotes = view.quotes || [];
    const nodes = [];
    if (!quotes.length) {
      nodes.push(emptyState(summary?.status || 'loading', summary?.message || ''));
    } else {
      const chart = track(compareChart({ series: quotes.map(row => ({ symbol: row.symbol, name: row.name, shortName: row.shortName || row.name })) }));
      const list = el('div', { class: 'mi-quotes' }, [
        ...quotes.map(row => el('button', { type: 'button', class: 'mi-quote', onclick: () => openInstrument(row) }, [
          instrumentMark(row, true),
          el('span', { class: 'mi-quote__id' }, [
            el('strong', { text: row.shortName || row.name || row.symbol }),
            el('small', { class: 'mi-ticker', text: row.symbol }),
          ]),
          el('span', { class: 'mi-quote__values' }, [priceText(row), signed(changeOf(row))]),
        ])),
        el('button', { type: 'button', class: 'mh-see-all', onclick: () => setTab(view.seeAll?.tab || 'all') },
          [view.seeAll?.label || 'See all', arrow()]),
      ]);
      nodes.push(el('div', { class: 'mi-summary' }, [chart, list]));
    }
    const section = el('section', { class: 'mh-section mi-section' }, [
      heading(view.heading, null, 'h2'),
      el('p', { class: 'mh-section-description', text: view.note }),
      ...nodes,
    ]);
    const rail = view.rail?.rows?.length ? el('section', { class: 'mh-section mi-section mh-world-indices' }, [
      heading(view.rail.heading, view.rail.tab ? () => setTab(view.rail.tab) : null, 'h2'),
      track(carousel(view.rail.rows.map(row => el('button', { type: 'button', class: 'mh-world-card', onclick: () => openInstrument(row) }, [
        el('span', { class: 'mh-world-card__head' }, [instrumentMark(row), el('span', {}, [
          el('strong', { text: row.shortName || row.symbol }), el('small', { text: row.name }),
        ])]),
        priceText(row), signed(changeOf(row)),
      ])), { label: view.rail.heading.toLowerCase(), className: 'mh-world-rail' })),
    ]) : null;
    let stories = null;
    if (spec.news) {
      newsHost = el('div', { class: 'mi-news-host' }, [newsBlock(9, true)]);
      stories = el('section', { class: 'mh-section mi-section' }, [heading('News', () => setTab('news'), 'h2'), newsHost]);
    }
    body.replaceChildren(...[section, rail, stories].filter(Boolean));
  }

  /* ---- news ---------------------------------------------------------------
     The same block twice: nine stories under the summary, all of them on the
     News tab. Headlines open on the publisher's own site. */

  function newsBlock(limit, keepReading) {
    const items = news?.data?.articles || [];
    if (!items.length) {
      return emptyState(news?.status || 'loading', news?.message
        || (news?.status === 'ok' ? 'None of the latest market stories named an index this board tracks.' : ''), true);
    }
    return el('div', { class: 'mi-news-block' }, [
      el('div', { class: 'mi-news-grid' }, items.slice(0, limit).map(newsCard)),
      keepReading ? el('button', { type: 'button', class: 'mi-keep', onclick: () => setTab('news') }, ['Keep reading', arrow()]) : null,
    ].filter(Boolean));
  }
  function drawNews() {
    body.replaceChildren(el('section', { class: 'mh-section mi-section' }, [
      heading(`${spec.title} news`, null, 'h2'),
      el('p', { class: 'mh-section-description', text: spec.news.note }),
      newsBlock(60, false),
      (news?.notes || []).length ? el('details', { class: 'mh-coverage' }, [
        el('summary', { text: 'Data coverage' }),
        el('div', {}, news.notes.map(note => el('p', { text: note }))),
      ]) : null,
    ].filter(Boolean)));
  }

  /* ---- the board tabs ---------------------------------------------------- */

  const boardRows = id => spec.board.rows(id, board?.data || {});
  const boardNote = (id, count) => spec.board.note(id, count, board, TABS.find(item => item.id === id)?.label || spec.title);
  const columnsFor = id => spec.board.columns(id, columns) || OVERVIEW_COLUMNS;
  const hasPerformance = id => Boolean(spec.board.columns(id, 'performance'));
  const valueOf = (row, key) => key.startsWith('perf:')
    ? performance.get(row.symbol)?.values?.[key.slice(5)] ?? null
    : key === 'name' ? String(row.name || row.symbol || '') : row[key] ?? null;

  function cell(row, column) {
    if (column.key === 'name') {
      return el('td', { class: 'mi-table__id' }, [
        el('button', { type: 'button', class: 'mi-name', onclick: () => row.available !== false ? openInstrument(row) : null, disabled: row.available === false ? true : null }, [
          instrumentMark(row),
          el('span', {}, [el('strong', { text: row.name || row.symbol }), row.symbol !== row.name ? el('small', { class: 'mi-ticker', text: row.symbol }) : null].filter(Boolean)),
        ]),
      ]);
    }
    const value = valueOf(row, column.key);
    if (!column.numeric) return el('td', { text: value == null || value === '' ? '—' : String(value) });
    const text = !isNum(value) ? '—' : column.suffix === '%' ? percent(value)
      : `${value > 0 && column.tone ? '+' : ''}${number(value, Math.abs(value) < 10 ? 2 : 2)}`;
    return el('td', { class: 'mi-table__n' }, [column.tone ? toned(value, text) : el('span', { text })]);
  }

  function boardTable(id) {
    const columnSet = columnsFor(id);
    const rows = [...boardRows(id)].sort((a, b) => {
      const av = valueOf(a, sort.key), bv = valueOf(b, sort.key);
      if (av == null || av === '') return bv == null || bv === '' ? 0 : 1;
      if (bv == null || bv === '') return -1;
      return (typeof av === 'string' ? av.localeCompare(String(bv)) : av - bv) * sort.dir;
    });
    if (!rows.length) {
      return emptyState(board?.status === 'ok' ? 'unavailable' : board?.status || 'loading',
        board?.status === 'ok' ? `The feed returned nothing this page could place under ${TABS.find(item => item.id === id)?.label}.` : board?.message || '');
    }
    const head = el('tr', {}, columnSet.map(column => {
      const active = sort.key === column.key;
      return el('th', { class: `${column.numeric ? 'mi-table__n' : ''}${active ? ' is-sorted' : ''}`.trim(), scope: 'col', 'aria-sort': active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none' }, [
        el('button', {
          type: 'button', onclick: () => {
            sort = active ? { key: column.key, dir: sort.dir * -1 } : { key: column.key, dir: column.key === 'name' ? 1 : -1 };
            render();
          },
        }, [column.label, active ? el('span', { class: 'mi-sort', 'aria-hidden': 'true', text: sort.dir === 1 ? '↑' : '↓' }) : null].filter(Boolean)),
      ]);
    }));
    return el('div', { class: 'mi-table__scroll' }, [
      el('table', { class: 'mi-table' }, [el('thead', {}, [head]), el('tbody', {}, rows.map(row => el('tr', {}, columnSet.map(column => cell(row, column)))))]),
    ]);
  }

  /** Performance is one request per row, so it says what it costs first. */
  function performanceBar(id) {
    const rows = boardRows(id).filter(row => row.available !== false);
    const missing = rows.filter(row => !performance.has(row.symbol));
    if (!missing.length) return null;
    if (!hasApiKey()) return emptyState('skipped', 'Performance windows come from FMP. Add your API key in Settings.', true);
    const progress = el('span', { class: 'mi-progress', 'aria-live': 'polite' });
    const button = el('button', {
      type: 'button', class: 'mi-load', text: `Load performance for ${missing.length} ${spec.unit || 'rows'}`,
      onclick: async () => {
        if (filling) return;
        filling = true;
        button.disabled = true;
        button.textContent = 'Loading…';
        const loaded = await spec.board.performance(missing.map(row => row.symbol), (done, total) => {
          progress.textContent = ` ${done} of ${total}…`;
        });
        if (disposed) return;
        for (const [symbol, value] of loaded) performance.set(symbol, value);
        filling = false;
        render();
      },
    });
    return el('div', { class: 'mi-consent' }, [
      el('div', {}, [
        el('strong', { text: 'Performance is not loaded for this board yet.' }),
        el('p', { text: `The list itself costs one request; performance costs one more per row. Filling these ${missing.length} rows is about ${missing.length} requests, cached for ten minutes and reused by every other board.` }),
      ]),
      el('div', { class: 'mi-consent__act' }, [button, progress]),
    ]);
  }

  function drawBoard() {
    const rows = boardRows(tab);
    const label = TABS.find(item => item.id === tab)?.label || spec.title;
    const filters = !hasPerformance(tab) ? null : el('div', { class: 'mi-filters', role: 'group', 'aria-label': 'Columns' },
      [['overview', 'Overview'], ['performance', 'Performance']].map(([id, text]) => el('button', {
        type: 'button', class: `mi-filter${columns === id ? ' is-active' : ''}`, 'aria-pressed': String(columns === id),
        onclick: () => { if (columns !== id) { columns = id; if (id === 'performance' && sort.key === 'price') sort = { key: 'changesPercentage', dir: -1 }; render(); } },
      }, [text, id === 'performance' ? el('i', { class: 'mi-filter__cost', title: 'Costs one request per index', text: '·' }) : null].filter(Boolean))));
    body.replaceChildren(el('section', { class: 'mh-section mi-section' }, [
      el('div', { class: 'mi-board__head' }, [
        el('h2', { class: 'mh-heading mh-heading--section', text: label }),
        filters,
      ]),
      el('p', { class: 'mh-section-description', text: boardNote(tab, rows.length) }),
      columns === 'performance' && hasPerformance(tab) ? performanceBar(tab) : null,
      boardError ? el('div', { class: 'mh-section-error' }, [
        el('span', { text: boardError }),
        el('button', { type: 'button', text: 'Retry', onclick: () => load(true) }),
      ]) : null,
      boardTable(tab),
      (board?.notes || []).length ? el('details', { class: 'mh-coverage' }, [
        el('summary', { text: 'Data coverage' }),
        el('div', {}, board.notes.map(note => el('p', { text: note }))),
      ]) : null,
    ].filter(Boolean)));
  }

  function render() {
    release();
    if (tab === 'overview') drawSummary();
    else if (tab === 'news') drawNews();
    else drawBoard();
  }

  async function load(refresh = false) {
    const opened = tab;
    body.setAttribute('aria-busy', 'true');
    body.replaceChildren(emptyState('loading', '', true));
    try {
      if (tab === 'overview') summary = await spec.summary.load(refresh);
      else if (tab === 'news') news = await spec.news.load({ refresh });
      else {
        board = await spec.board.load({ refresh });
        boardError = board.status === 'error' || board.status === 'gated' ? board.message || 'Some data could not be loaded.' : null;
      }
      if (disposed || tab !== opened) return;
      render();
      // The summary is on screen before the news feed is asked for, so the
      // chart never waits on two more requests it does not need.
      if (tab === 'overview' && spec.news && !news) {
        news = await spec.news.load({ refresh });
        if (!disposed && tab === opened && newsHost) newsHost.replaceChildren(newsBlock(9, true));
      }
    } catch (error) {
      if (!disposed) body.replaceChildren(emptyState('error', String(error?.message || error)));
    } finally {
      body.removeAttribute('aria-busy');
    }
  }

  drawTabs();
  load();
  page.dispose = () => {
    disposed = true;
    release();
    for (const dialog of dialogs) dialog.close();
    dialogs.clear();
  };
  return page;
}
