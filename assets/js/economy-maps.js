import { el } from './util.js';
import { number } from './markethub-ui.js';

let geography;
async function worldGeometry() {
  if (!geography) geography = Promise.all([
    import('./d3.min.js'),
    fetch(new URL('../data/world-countries.geojson', import.meta.url)).then(response => {
      if (!response.ok) throw new Error('Country boundaries could not be loaded.');
      return response.json();
    }),
  ]).then(([, data]) => ({ ...data, features: data.features.filter(feature => feature.properties.ISO_A2 !== 'AQ') }))
    .catch(error => { geography = null; throw error; });
  return geography;
}

const svgNode = (name, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const nameOf = code => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code); } catch { return code; }
};

/** `metrics` narrows the board to one map — the front page shows inflation. */
export function economyMaps(data = {}, status = 'ok', onRetry = null, { metrics = ['gdp', 'inflation'] } = {}) {
  const root = el('div', { class: 'em-maps' });
  let disposed = false;
  for (const metric of metrics) {
    let basis = metric;
    const title = metric === 'gdp' ? 'GDP growth rate' : 'Inflation rate';
    const colors = metric === 'gdp' ? ['#b94257', '#df8791', '#b4dcd1', '#48ae94', '#08745f']
      : ['#488da7', '#91c5cb', '#ecd37d', '#e88a62', '#b8415a'];
    const limits = metric === 'gdp' ? [-3, 0, 3, 6] : [0, 2, 5, 10];
    const labels = metric === 'gdp' ? ['< -3%', '-3 to 0%', '0 to 3%', '3 to 6%', '6% +'] : ['< 0%', '0 to 2%', '2 to 5%', '5 to 10%', '10% +'];
    const detail = el('div', { class: 'em-detail', 'aria-live': 'polite', text: 'No country selected' });
    const notice = el('div', { class: 'em-notice', role: 'status', hidden: true });
    const mapHost = el('div', { class: 'em-map', 'aria-busy': 'true' });
    const count = el('span', { class: 'em-count' });
    const search = el('input', { type: 'search', class: 'mh-search', placeholder: 'Search country', 'aria-label': `Search ${title} countries` });
    const countrySelect = el('select', { class: 'mh-select', 'aria-label': `${title} country` });
    const rowsHost = el('div', { class: 'em-table-wrap' });
    const tableDetails = el('details', { class: 'em-table-details' }, [el('summary', { text: 'Country data' }), search, rowsHost]);
    const legend = el('div', { class: 'em-legend' }, [...labels.map((label, i) => el('span', {}, [
      el('i', { style: { backgroundColor: colors[i] } }), label,
    ])), el('span', {}, [el('i', { class: 'em-no-data' }), 'No reported value'])]);
    const basisSelect = el('select', { class: 'mh-select', 'aria-label': 'GDP growth basis' }, [
      el('option', { value: 'gdp', text: 'Year over year' }),
      el('option', { value: 'gdpQuarterly', text: 'Quarter over quarter' }),
      el('option', { value: 'gdpAnnualized', text: 'Annualized quarterly' }),
    ]);
    const section = el('section', { class: 'em-section', id: `economy-map-${metric}` }, [
      el('div', { class: 'em-heading' }, [el('h2', { text: title }), metric === 'gdp' ? basisSelect : el('span', { class: 'mh-scope', text: 'Year over year' })]),
      el('div', { class: 'em-meta' }, [el('span', { text: 'Latest actual releases · Past 180 days' }), count]),
      notice, mapHost, legend, el('div', { class: 'em-selection' }, [countrySelect, detail]), tableDetails,
    ]);
    root.append(section);
    let features = [];
    const paths = new Map();
    const values = () => data.worldRates?.[basis] || {};
    const select = code => {
      const row = values()[code];
      countrySelect.value = code;
      for (const [id, path] of paths) path.classList.toggle('is-selected', code === id);
      detail.replaceChildren(el('strong', { text: nameOf(code) }), el('span', { text: row
        ? `${number(row.value)}% · ${row.basis} · ${row.event} · Released ${row.date.slice(0, 10)}`
        : 'No reported actual for this rate in the past 180 days' }));
    };
    const drawTable = () => {
      const query = search.value.trim().toLowerCase();
      const rows = Object.values(values()).filter(row => `${row.country} ${nameOf(row.country)}`.toLowerCase().includes(query))
        .sort((a, b) => b.value - a.value);
      rowsHost.replaceChildren(el('table', { class: 'em-table' }, [
        el('thead', {}, [el('tr', {}, ['Country', 'Rate', 'Release', 'Event'].map(text => el('th', { text })))]),
        el('tbody', {}, rows.map(row => el('tr', {}, [
          el('td', {}, [el('button', { type: 'button', text: nameOf(row.country), onclick: () => select(row.country) })]),
          el('td', { text: `${number(row.value)}%` }), el('td', { text: row.date.slice(0, 10) }), el('td', { text: row.event }),
        ]))),
      ]), ...(!rows.length ? [el('p', { class: 'em-meta', text: 'No matching reported values.' })] : []));
    };
    const update = () => {
      const live = values();
      count.textContent = `${Object.keys(live).length} countries with data`;
      const all = new Map(features.map(feature => [feature.properties.ISO_A2_EH || feature.properties.ISO_A2, feature.properties.NAME_EN || feature.properties.NAME]));
      Object.keys(live).forEach(code => all.set(code, nameOf(code)));
      countrySelect.replaceChildren(el('option', { value: '', text: 'Select country' }), ...[...all].filter(([code]) => /^[A-Z]{2}$/.test(code)).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => el('option', { value: code, text: name })));
      for (const [code, path] of paths) {
        const row = live[code];
        // Inline style, not the `fill` attribute: an SVG presentation attribute
        // does not resolve var(), so the empty colour would render as black.
        path.style.fill = row ? colors[limits.filter(limit => row.value >= limit).length] : 'var(--em-empty)';
        path.setAttribute('aria-label', `${nameOf(code)}: ${row ? `${number(row.value)}%, ${row.basis}, ${row.date.slice(0, 10)}` : 'No reported value'}`);
        path.querySelector('title').textContent = path.getAttribute('aria-label');
        path.classList.remove('is-selected');
      }
      // Why a map is empty belongs above the map, with the way to try again.
      const trouble = status === 'skipped' ? 'Connect your FMP API key in Settings to load country rates.'
        : data.mapStatus && data.mapStatus.status !== 'ok' ? data.mapStatus.message
          : !Object.keys(live).length ? 'FMP reported no actual for this rate in any country over the past 180 days.' : '';
      notice.hidden = !trouble;
      if (trouble) {
        notice.replaceChildren(...[el('span', { text: trouble }),
          onRetry ? el('button', { type: 'button', class: 'em-retry', text: 'Retry', onclick: () => onRetry() }) : null
].filter(Boolean));
      }
      detail.textContent = Object.keys(live).length ? 'No country selected' : 'No reported actuals available for this rate.';
      drawTable();
    };
    countrySelect.addEventListener('change', () => { if (countrySelect.value) select(countrySelect.value); });
    basisSelect.addEventListener('change', () => { basis = basisSelect.value; update(); });
    search.addEventListener('input', drawTable);
    update();
    const drawMap = async () => {
      mapHost.setAttribute('aria-busy', 'true');
      try {
        const geo = await worldGeometry();
        if (disposed) return;
        features = geo.features;
        const d3 = globalThis.d3;
        const projection = d3.geoNaturalEarth1().fitExtent([[12, 12], [988, 485]], geo);
        const pathFor = d3.geoPath(projection);
        const svg = svgNode('svg', { viewBox: '0 0 1000 500', role: 'group', 'aria-label': `${title} world map` });
        for (const feature of features) {
          const code = feature.properties.ISO_A2_EH || feature.properties.ISO_A2;
          const path = svgNode('path', { d: pathFor(feature), 'data-country': code, tabindex: '0', role: 'button' });
          path.append(svgNode('title'));
          path.addEventListener('click', () => select(code));
          path.addEventListener('mouseenter', () => select(code));
          path.addEventListener('focus', () => select(code));
          path.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(code); } });
          paths.set(code, path); svg.append(path);
        }
        mapHost.replaceChildren(svg);
        update();
      } catch (error) {
        if (!disposed) mapHost.replaceChildren(el('p', { text: error.message }), el('button', { type: 'button', text: 'Retry map', onclick: drawMap }));
      } finally { mapHost.removeAttribute('aria-busy'); }
    };
    drawMap();
  }
  root.append(el('p', { class: 'em-source', text: 'Source: FMP Economic Data Releases Calendar. Actuals only; reporting periods and release dates vary by country. Geography: Natural Earth (public domain).' }));
  root.destroy = () => { disposed = true; };
  return root;
}
