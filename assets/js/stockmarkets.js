import { el } from './util.js';
import { fetchScreener, fetchFor, fetchNewsFeed, fetchBatchQuotes, hasApiKey, logoUrl } from './fmp.js';
import { logo } from './ui.js';
import { COUNTRIES, countryOf, loadHubSection, dedupeStocks } from './markethub-data.js';
import { heading, emptyState, storedCountry, instrumentMark, priceText, signed, changeOf, shortNumber, carousel } from './markethub-ui.js';
import { calendarStrip } from './markethub-widgets.js';
import { compareChart } from './markethub-compare.js';
import { marketTable, STOCK_COLUMN_SETS, SCREENER_COLUMN_SETS, newTableState } from './markettable.js';
import { IDEAS } from './ideas.js';
import { beatTheMarket } from './beatmarket.js';

/* ==========================================================================
   The prefiltered screens

   Modelled on the market-movers screens a big terminal offers, and cut to what
   this vendor can actually answer. FMP's screener filters on **market cap,
   price, beta, dividend, volume, sector, industry, exchange and country** —
   so every screen below is one of those, applied by the vendor, and the whole
   list still costs the one request the page was already making.

   What is deliberately absent, and why, because a screen that cannot be built
   is worth naming once rather than being quietly missing:

     - **Top gainers, losers and most volatile.** The screener returns no
       session change at all — not the move, not the range. The vendor
       publishes those as separate mover feeds, which is where the Overview tab
       above already gets them, and they exist for US exchanges only.
     - **52-week and all-time highs, RSI, unusual volume.** These need a quote
       or a technical series *per company*: a hundred requests for a page of
       fifty, and thousands to filter a universe of five thousand.

   `test` is the one thing done here rather than by the vendor: a yield is a
   dividend over a price and the screener filters on the dividend alone, so
   that screen filters the rows it already has. */
const screen = (id, title, group, params = {}, note = '', test = null) => ({ id, title, group, params, note, test });
const yieldOf = (row) => (Number(row.price) > 0 && Number(row.lastAnnualDividend) > 0
  ? Number(row.lastAnnualDividend) / Number(row.price) * 100 : null);

export const COLLECTIONS = [
  screen('all', 'All stocks', 'Everything', {}, 'Every listing the screener returns for this market.'),

  screen('mega', 'Mega-cap', 'Size', { marketCapMoreThan: 200e9 }, 'Companies worth more than $200bn.'),
  screen('large', 'Large-cap', 'Size', { marketCapMoreThan: 10e9 }, 'Companies worth more than $10bn.'),
  screen('mid', 'Mid-cap', 'Size', { marketCapMoreThan: 2e9, marketCapLowerThan: 10e9 }, 'Companies worth between $2bn and $10bn.'),
  screen('small', 'Small-cap', 'Size', { marketCapMoreThan: 300e6, marketCapLowerThan: 2e9 }, 'Companies worth between $300m and $2bn.'),
  screen('micro', 'Micro-cap', 'Size', { marketCapMoreThan: 50e6, marketCapLowerThan: 300e6 }, 'Companies worth between $50m and $300m.'),

  screen('penny', 'Penny stocks', 'Price and liquidity', { priceLowerThan: 5 }, 'Listings trading under $5 — a price, not a judgement of the company.'),
  screen('active', 'Actively traded', 'Price and liquidity', { volumeMoreThan: 1e6 }, 'More than a million shares in the latest session. Sort the volume column to rank them.'),
  screen('heavy', 'Heavily traded', 'Price and liquidity', { volumeMoreThan: 10e6 }, 'More than ten million shares in the latest session.'),

  screen('dividend', 'Dividend payers', 'Income', { dividendMoreThan: 0 }, 'Companies that declared a dividend over the trailing year.'),
  screen('highyield', 'High dividend yield', 'Income', { dividendMoreThan: 0 },
    'Trailing dividend over the latest price, above 3%. The yield is computed here — the screener filters on the dividend, not on the yield — so it is the rows of the dividend screen, narrowed.',
    (row) => (yieldOf(row) ?? 0) >= 3),

  screen('highbeta', 'High beta', 'Volatility', { betaMoreThan: 1.5 }, 'Beta above 1.5, as FMP reports it against the US market.'),
  screen('lowbeta', 'Low beta', 'Volatility', { betaMoreThan: 0, betaLowerThan: 0.5 }, 'Beta between zero and 0.5, as FMP reports it against the US market.'),
  screen('negbeta', 'Negative beta', 'Volatility', { betaLowerThan: 0 }, 'Companies FMP reports as moving against the US market.'),

  ...[['energy','Oil and gas','Energy'], ['tech','Tech','Technology'], ['finance','Finance','Financial Services'], ['health','Healthcare','Healthcare'], ['consumer','Consumer discretionary','Consumer Cyclical']]
    .map(([id,title,sector]) => screen(id, title, 'Sectors', { sector }, `The ${sector} sector, as FMP classifies it.`)),
  ...[['semiconductors','Semiconductors'], ['software','Software - Application'], ['banks','Banks - Diversified'], ['biotech','Biotechnology'], ['automakers','Auto - Manufacturers'], ['restaurants','Restaurants']]
    .map(([id,industry]) => screen(id, industry, 'Industries', { industry }, `The ${industry} industry, as FMP classifies it.`)),
];
export const collectionOf = (id) => COLLECTIONS.find((c) => c.id === id) || COLLECTIONS[0];
export function stockScreenParams(code, collection = 'all') {
  return { isEtf:false, isFund:false, isActivelyTrading:true, includeAllShareClasses:false,
    ...(code === 'WORLD' ? {} : {country:countryOf(code).code}),
    ...collectionOf(collection).params, limit:5000 };
}
const selectedCountry = () => storedCountry() === 'WORLD' ? 'WORLD' : countryOf(storedCountry()).code;
const titleFor = code => code === 'WORLD' ? 'World stocks' : `${countryOf(code).short} stocks`;
const section = (title, children) => el('section',{class:'mh-section'},[heading(title,null,'h2'),...children]);
function picker(code, onChange) {
  const select = el('select', {class:'ms-country','aria-label':'Stock market',onchange:event=>onChange(event.target.value)},
    [{code:'WORLD',name:'World stocks'},...COUNTRIES.map(c=>({code:c.code,name:`${c.short} stocks`}))]
      .map(c=>el('option',{value:c.code,text:c.name})));
  select.value=code;
  return select;
}
function frame(code, nav, screener=false, collection='all') {
  const board=new URLSearchParams(location.search).get('board');
  const embedded=new URLSearchParams(location.search).get('view')==='markets';
  const news=board==='news';
  const beat=board==='beat';
  const sectors=!screener && new URLSearchParams(location.search).get('board')==='sectors';
  return el('div',{class:'mh-page ms-page'},[
    el('header',{class:'mh-hero'},[
      el('nav',{class:'mh-eyebrow','aria-label':'Breadcrumb'},[
        el('button',{type:'button',text:'Market Data',onclick:()=>nav.goView?.('markets','overview')}),' / ',
        el('button',{type:'button',text:'Stocks',onclick:()=>nav.goView?.('markets','stocks',{country:code})}),
      ]),
      el('h1',{},[screener?(embedded?'Quotes':'Stock Screener'):picker(code,country=>nav.goView?.('markets','stocks',{country,...(sectors?{board:'sectors'}:{})}))]),
      el('div',{class:'mh-hero__meta',text:'Market data supplied by FMP'}),
    ]),
    el('nav',{class:'ms-nav','aria-label':'Stocks navigation'},[
      el('button',{type:'button',class:!screener&&!sectors&&!news&&!beat?'is-active':'',text:'Overview',onclick:()=>nav.goView?.('markets','stocks',{country:code})}),
      el('button',{type:'button',class:screener?'is-active':'',text:'Quotes',onclick:()=>nav.goView?.(embedded?'markets':'stocks',embedded?'stocks':'screener',{country:code,collection,...(embedded?{board:'screener'}:{})})}),
      el('button',{type:'button',class:sectors?'is-active':'',text:'Sectors & Industries',onclick:()=>nav.goView?.('markets','stocks',{country:code,board:'sectors'})}),
      el('button',{type:'button',class:beat?'is-active':'',text:'Beat the Market',onclick:()=>nav.goView?.('markets','stocks',{country:code,board:'beat'})}),
      el('button',{type:'button',class:news?'is-active':'',text:'News',onclick:()=>nav.goView?.('markets','stocks',{country:code,board:'news'})}),
    ]),
  ]);
}
function listing(rows, nav, metric='marketCap') {
  return el('div',{class:'ms-list'},rows.slice(0,6).map(row=>el('button',{type:'button',class:'ms-stock',onclick:()=>nav.goSymbol?.(row.symbol)},[
    instrumentMark(row),el('span',{class:'ms-name'},[el('strong',{text:row.companyName||row.name||row.symbol}),el('small',{text:row.symbol})]),
    el('span',{},[priceText(row),signed(changeOf(row))]),el('strong',{text:shortNumber(row[metric])}),
  ])));
}
const sorted = (rows, key) => [...rows].sort((a,b)=>(b[key]||0)-(a[key]||0));
const rowsOf = result => Array.isArray(result?.data) ? result.data : [];
function safeURL(value) { try { const url=new URL(value); return /^https?:$/.test(url.protocol)?url.href:null; } catch { return null; } }
/* One story on the board. The symbol leads the meta line with the vendor's
   logo beside it, the way the wire chips and the research pills print it; a
   symbol the vendor has no image for is just the symbol. Built here because
   the board renders this card in two places. */
function storyCard(a) {
  return el('a',{class:'ms-story',href:safeURL(a.url),target:'_blank',rel:'noopener noreferrer'},[
    safeURL(a.image)&&el('img',{src:safeURL(a.image),alt:'',loading:'lazy'}),
    el('small',{class:'ms-story__m'},[
      a.symbol&&logo(logoUrl(a.symbol),a.symbol,{size:'xs',fallback:'none'}),
      el('span',{text:[a.site,a.symbol,a.publishedDate].filter(Boolean).join(' · ')}),
    ].filter(Boolean)),
    el('h3',{text:a.title}),
  ].filter(Boolean));
}
function screenerIdentity(row, nav) {
  return el('button', {type:'button',class:'ms-screen-identity',title:row.companyName||row.name||row.symbol,onclick:()=>nav.goSymbol?.(row.symbol)},[
    instrumentMark(row),
    el('strong',{class:'ms-screen-symbol',text:row.symbol}),
    el('span',{class:'ms-screen-company',text:row.companyName||row.name||''}),
  ]);
}

function screenerTabs(sets, state, onChange) {
  return el('nav', { class: 'ms-screen-tabs', 'aria-label': 'Screener views' }, sets.map(set => el('button', {
    type: 'button',
    class: set.key === state.set ? 'is-active' : '',
    text: set.label,
    onclick: () => {
      if (state.set === set.key) return;
      state.set = set.key;
      state.page = 1;
      if (!set.columns.some(column => column.key === state.sort)) {
        state.sort = set.columns[0].key;
        state.dir = -1;
      }
      onChange?.();
    },
  })));
}

function renderStockNews(nav){
  const code=selectedCountry(),root=frame(code,nav),body=el('div',{class:'ms-news'},[emptyState('loading','Loading stock news…')]);
  let disposed=false;root.dispose=()=>{disposed=true;};root.append(section(`${titleFor(code)} news`,[body]));
  (async()=>{
    let result, symbols=[];
    if(!hasApiKey())result={status:'skipped',data:[]};
    else if(code==='WORLD')result=await fetchNewsFeed('stock',{limit:60});
    else {
      const universe=await fetchScreener(stockScreenParams(code));
      symbols=sorted(dedupeStocks(rowsOf(universe),{usOnly:code==='US'}),'marketCap').slice(0,50).map(r=>r.symbol);
      result=symbols.length?await fetchFor('news',symbols.join(',')):{status:universe.status,data:[]};
    }
    if(disposed)return;
    const seen=new Set();
    const articles=rowsOf(result).filter(a=>{const url=safeURL(a.url);if(!url||seen.has(url)||(code!=='WORLD'&&!symbols.includes(a.symbol)))return false;seen.add(url);return true;}).sort((a,b)=>String(b.publishedDate).localeCompare(String(a.publishedDate)));
    body.replaceChildren(...(articles.length?articles.map(storyCard)
      :[emptyState(result.status,'No stock news returned for this market.')]));
  })().catch(error=>{if(!disposed)body.replaceChildren(emptyState('error',error.message));});
  return root;
}

export function renderStockMarkets(nav={}) {
  if(new URLSearchParams(location.search).get('board')==='screener')return renderStockScreener(nav);
  if(new URLSearchParams(location.search).get('board')==='news')return renderStockNews(nav);
  if(new URLSearchParams(location.search).get('board')==='beat')return renderBeatTheMarket(nav);
  if(new URLSearchParams(location.search).get('board')==='sectors')return renderStockSectors(nav);
  const code=selectedCountry(), root=frame(code,nav), body=el('div');
  let disposed=false, chart, tradedRail;
  root.dispose=()=>{disposed=true;chart?.destroy?.();tradedRail?.dispose?.();};
  root.append(body);
  body.append(emptyState('loading','Loading this stock market…'));
  const openScreen=collection=>nav.goView?.('stocks','screener',{country:code,collection});
  async function load() {
    const [stock,index,universe]=await Promise.all([
      loadHubSection(code==='WORLD'?'world':'stocks',{country:code}),
      loadHubSection('indices',{country:code==='WORLD'?'US':code}),
      hasApiKey()?fetchScreener(stockScreenParams(code,'large')):Promise.resolve({status:'skipped',data:[]}),
    ]);
    if(disposed)return;
    const data=stock.data, largest=code==='WORLD'?(data.lists.largest||[]):sorted(dedupeStocks(rowsOf(universe),{usOnly:code==='US'}),'marketCap');
    const active=sorted(code==='WORLD'?(data.lists.largest||[]):(data.lists.volume||[]),'volume');
    const indices=code==='WORLD'?[...(index.data.quotes||[]).filter(r=>r.meta?.primary),...(index.data.worldIndices||[])]: (index.data.quotes||[]).filter(r=>!r.meta?.volatility);
    chart=compareChart({series:indices.slice(0,6)});
    tradedRail=carousel(active.slice(0,12).map(row=>el('button',{type:'button',class:'ms-traded',onclick:()=>nav.goSymbol?.(row.symbol)},[
      instrumentMark(row,true),el('strong',{text:row.name||row.companyName||row.symbol}),el('small',{text:row.symbol}),priceText(row),signed(changeOf(row)),
    ])),{label:'Most traded stocks'});
    const collectionCards=el('div',{class:'ms-collection-groups'},
      [...new Set(COLLECTIONS.map(c=>c.group))].map((group,g)=>el('div',{class:'ms-collection-group'},[
        el('p',{class:'ms-collection-group__h',text:group}),
        el('div',{class:'ms-collections'},COLLECTIONS.filter(c=>c.group===group).map((c,i)=>el('button',{
          type:'button',class:'ms-collection',style:{'--collection-hue':String((g*53+i*17+205)%360)},
          title:c.note,text:c.title,onclick:()=>openScreen(c.id),
        }))),
      ])));
    const news=el('div',{class:'ms-news'},[emptyState('loading','Loading stock news…')]);
    const employers=el('div',{},[emptyState('loading','Loading reported headcounts…')]);
    const gate=()=>emptyState(stock.status,stock.message||'No listings returned for this market.');
    const performance=el('div',{},[emptyState('loading','Loading sector performance…')]);
    const movers=el('div',{class:'ms-rankings'},[emptyState('loading','Loading gainers and losers…')]);
    body.replaceChildren(
      section('Market summary',[chart]),
      section('IPO Calendar',[data.ipos?.length?calendarStrip(data.ipos,{kind:'ipos',onSymbol:nav.goSymbol}):emptyState(data.iposStatus?.status||stock.status,'No upcoming IPOs returned for this market.',true)]),
      section('Earnings Calendar',[data.earnings?.length?calendarStrip(data.earnings,{onSymbol:nav.goSymbol}):emptyState(data.earningsStatus?.status||stock.status,'No upcoming earnings returned for this market.',true)]),
      section('Most traded',[active.length?tradedRail:gate()]),
      section('Sector performance',[performance,el('button',{type:'button',class:'mh-see-all',text:'Explore sectors & industries ›',onclick:()=>nav.goView?.('markets','stocks',{country:code,board:'sectors'})})]),
      movers,
      el('div',{class:'ms-rankings'},[
        section(code==='WORLD'?'World biggest companies':'Biggest companies',[largest.length?listing(largest,nav):gate(),el('button',{class:'mh-see-all',text:'See all large-cap stocks ›',onclick:()=>openScreen('large')})]),
        section('Largest employers',[employers,el('p',{class:'mh-section-description',text:'Reported headcounts among the largest companies shown; reporting dates vary.'})]),
      ]),
      section('Stock collections',[collectionCards]),
      section('Stock Ideas',[
        el('div',{class:'ms-idea-grid'},['us-tech-top15','us-value-top20','dividend-compounders','compounding-growth'].map(key=>IDEAS.find(i=>i.key===key)).filter(Boolean).map(idea=>el('button',{type:'button',class:'ms-idea-card',onclick:()=>nav.goView?.('ideas',null,{idea:idea.key})},[
          el('small',{text:idea.group}),el('h3',{text:idea.title}),el('p',{text:idea.thesis}),el('span',{text:'Explore portfolio ›'}),
        ]))),
        el('button',{type:'button',class:'mh-see-all',text:'Explore more investment ideas ›',onclick:()=>nav.goView?.('ideas','all')}),
      ]),
      section(`${titleFor(code)} news`,[news]),
      el('p',{class:'mh-section-description',text:code==='WORLD'?'Selected leading US and international companies. Market caps shown in USD.':'Rankings cover the listings returned by FMP, with one listing per company.'}),
    );
    loadCountryPerformance(code).then(result=>{
      if(disposed)return;
      performance.replaceChildren(performanceGroups(result,'sector'));
      const candidates=code==='WORLD'?result.rows:null;
      const gainers=candidates?sorted(candidates.filter(r=>changeOf(r)>0),'changesPercentage'):data.lists.gainers||[];
      const losers=candidates?sorted(candidates.filter(r=>changeOf(r)<0),'changesPercentage').reverse():data.lists.losers||[];
      movers.replaceChildren(...[['Gainers',gainers],['Losers',losers]].map(([title,rows])=>section(title,[rows.length?listing(rows,nav,'volume'):emptyState(stock.status,`No ${title.toLowerCase()} returned for this market.`,true)])));
    }).catch(error=>{if(!disposed){performance.replaceChildren(emptyState('error',error.message));movers.replaceChildren(emptyState('error',error.message));}});
    const symbols=[...new Set([...largest,...active].map(r=>r.symbol))].slice(0,30);
    const [newsResult,profiles]=await Promise.all([
      !hasApiKey()?Promise.resolve({status:'skipped',data:[]}):code==='WORLD'?fetchNewsFeed('stock',{limit:40}):symbols.length?fetchFor('news',symbols.join(',')):Promise.resolve({status:'empty',data:[]}),
      code==='WORLD'?Promise.resolve([]):Promise.all(largest.slice(0,12).map(r=>fetchFor('profile',r.symbol))),
    ]);
    if(disposed)return;
    const heads=code==='WORLD'?data.lists.employers||[]:profiles.flatMap((p,i)=>p.status==='ok'&&p.data?[{...largest[i],employees:Number(p.data.fullTimeEmployees)||null}]:[]).filter(r=>r.employees);
    employers.replaceChildren(heads.length?listing(sorted(heads,'employees'),nav,'employees'):emptyState(stock.status,'No reported headcounts available.',true));
    const seen=new Set();
    const articles=rowsOf(newsResult).filter(a=>{const url=safeURL(a.url);if(!url||seen.has(url)||(code!=='WORLD'&&!symbols.includes(a.symbol)))return false;seen.add(url);return true;})
      .sort((a,b)=>String(b.publishedDate).localeCompare(String(a.publishedDate))).slice(0,9);
    news.replaceChildren(...(articles.length?articles.map(storyCard)
      :[emptyState(newsResult.status,'No stock news returned for companies in this market.',true)]));
  }
  load().catch(error=>{if(!disposed)body.replaceChildren(emptyState('error',error.message));});
  return root;
}

/* The basket, on this page's own frame. The module is shared with the ETFs
   page: same benchmark, same rule, same caveats, and only the universe it
   screens differs. */
function renderBeatTheMarket(nav={}) {
  const code=selectedCountry();
  const root=frame(code,nav);
  const block=beatTheMarket({kind:'stocks',country:code==='WORLD'?'US':code,nav});
  root.append(el('div',{class:'ms-beat'},[block]));
  root.dispose=()=>block.dispose?.();
  return root;
}

export function aggregatePerformance(rows, field) {
  const groups=new Map();
  for(const row of rows){
    const change=changeOf(row), name=row[field];
    if(!name||typeof change!=='number'||!Number.isFinite(change))continue;
    const group=groups.get(name)||{name,total:0,count:0};
    group.total+=change;group.count++;groups.set(name,group);
  }
  return [...groups.values()].map(g=>({...g,change:g.total/g.count})).sort((a,b)=>b.change-a.change);
}
async function loadCountryPerformance(code){
  if(!hasApiKey())return {status:'skipped',rows:[]};
  const universe=await fetchScreener(stockScreenParams(code));
  if(universe.status!=='ok')return {...universe,rows:[]};
  const companies=sorted(dedupeStocks(rowsOf(universe),{usOnly:code==='US'}),'marketCap').slice(0,250);
  if(!companies.length)return {status:'empty',rows:[]};
  const quotes=await fetchBatchQuotes(companies.map(r=>r.symbol));
  const by=new Map(rowsOf(quotes).map(r=>[r.symbol,r]));
  return {status:quotes.status,rows:companies.filter(r=>by.has(r.symbol)).map(r=>({...r,...by.get(r.symbol),sector:r.sector,industry:r.industry,changesPercentage:changeOf(by.get(r.symbol))}))};
}
function performanceGroups(result,field){
  const groups=aggregatePerformance(result.rows,field);
  return el('div',{},[
    el('p',{class:'mh-section-description',text:'Equal-weight session change among up to 250 largest companies returned for this market. Only companies with a reported change are included.'}),
    groups.length?el('div',{class:'ms-performance'},groups.map(g=>el('div',{class:'ms-performance__row'},[
      el('strong',{text:g.name}),el('span',{text:`${g.count} stocks`}),signed(g.change),
      el('span',{class:'ms-performance__bar','aria-hidden':'true',style:{width:`${Math.min(100,Math.abs(g.change)*10)}%`,background:g.change>=0?'var(--mh-up)':'var(--mh-down)'}}),
    ]))):emptyState(result.status,'No classified stock performance is available for this market.',true),
  ]);
}
function renderStockSectors(nav){
  const code=selectedCountry(),root=frame(code,nav),body=el('div',{},[emptyState('loading','Loading sectors and industries…')]);
  let disposed=false;root.dispose=()=>{disposed=true;};root.append(body);
  (hasApiKey()?fetchScreener(stockScreenParams(code)):Promise.resolve({status:'skipped',data:[]})).then(result=>{
    if(disposed)return;
    const companies=sorted(dedupeStocks(rowsOf(result),{usOnly:code==='US'}),'marketCap');
    const tableHost=el('div',{class:'ms-screener-table'}),tabHost=el('div');
    const sets=SCREENER_COLUMN_SETS;
    const state=newTableState(sets);
    /* This tab filters by sector and industry, and by nothing else. The size,
       dividend and volatility screens that used to sit in a row above them now
       live on the Quotes tab, where the rest of the market screens are — two
       bars of company screens on two tabs of the same page was one bar too
       many, and the one that stayed is the one whose table is built to be
       screened. */
    let sector='';
    let industry='';

    const matching=()=>companies.filter(r=>(!sector||r.sector===sector)
      &&(!industry||r.industry===industry));

    /* The industry list follows the chosen sector, and a chosen industry that
       the new sector does not contain is cleared rather than left filtering an
       empty table. */
    const industriesFor=()=>[...new Set(companies.filter(r=>!sector||r.sector===sector).map(r=>r.industry).filter(Boolean))].sort();

    const pill=(label,on,onclick,title)=>el('button',{type:'button',class:`ms-pill${on?' is-on':''}`,title:title||null,onclick},[label]);

    const bar=el('div',{class:'ms-pills'});
    const industrySel=el('select',{class:'ms-isel','aria-label':'Industry',onchange:(e)=>{industry=e.target.value;state.page=1;draw();}});
    const count=el('p',{class:'ms-count'});

    function drawBar(){
      bar.replaceChildren(
        el('div',{class:'ms-pills__row ms-pills__row--sectors'},[
          pill('All sectors',!sector,()=>{sector='';industry='';state.page=1;draw();}),
          ...[...new Set(companies.map(r=>r.sector).filter(Boolean))].sort()
            .map(name=>pill(name,sector===name,()=>{sector=name;industry='';state.page=1;draw();})),
        ]),
      );
      const list=industriesFor();
      if(industry&&!list.includes(industry))industry='';
      industrySel.replaceChildren(el('option',{value:'',text:`All industries (${list.length})`}),
        ...list.map(name=>el('option',{value:name,text:name})));
      industrySel.value=industry;
    }

    function draw(){
      drawBar();
      const rows=matching();
      count.textContent=`${rows.length.toLocaleString()} of ${companies.length.toLocaleString()} companies`;
      tabHost.replaceChildren(screenerTabs(sets,state,draw));
      tableHost.replaceChildren(marketTable({rows,sets,state,showTabs:false,identity:r=>screenerIdentity(r,nav),
        emptyText:'No company matches that combination.'}));
    }

    draw();
    body.replaceChildren(
      bar,
      el('div',{class:'ms-filters'},[industrySel,count]),
      tabHost,
      el('p',{class:'mh-section-description',text:`${titleFor(code)} · up to 5,000 companies returned by FMP, grouped by the sector and industry it classifies each one under. The size, income and volatility screens are on the Quotes tab.`}),
      tableHost,
      ...(result.status==='ok'?[]:[emptyState(result.status,result.message||'Connect FMP in Settings to load companies.')]),
    );
  }).catch(error=>{if(!disposed)body.replaceChildren(emptyState('error',error.message));});
  return root;
}

export function renderStockScreener(nav={}) {
  const embedded=new URLSearchParams(location.search).get('view')==='markets';
  const screenNav={...nav,goView:(view,sub,params)=>view==='stocks'&&sub==='screener'&&embedded?nav.goView?.('markets','stocks',{...params,board:'screener'}):nav.goView?.(view,sub,params)};
  const code=selectedCountry(), collection=new URLSearchParams(location.search).get('collection')||'all';
  const root=frame(code,screenNav,true,collection), results=el('div',{class:'ms-screener-table'});
  const rating=STOCK_COLUMN_SETS.find(s=>s.key==='analysts').columns.find(c=>c.key==='score');
  const sets=SCREENER_COLUMN_SETS.map(s=>s.key==='overview'?{...s,bags:['grades'],columns:[...s.columns,{...rating,key:'wallstreet',label:'Wall Street rating'}]}:s);
  const tableState=newTableState(sets);
  let disposed=false, companies=[];
  root.dispose=()=>{disposed=true;};
  const screen=collectionOf(collection);
  /* The screens as pills rather than a dropdown, in the bar the Sectors and
     Industries tab already uses — a screen you can see the whole of is easier
     to pick from than one you have to open, and it is one visual language
     across the two tabs. Two rows, because the market screens and the sector
     ones are two different questions: what kind of company, and what kind of
     business. */
  const MARKET_GROUPS=['Everything','Size','Price and liquidity','Income','Volatility'];
  const screenPill=(c)=>el('button',{type:'button',class:`ms-pill${c.id===collection?' is-on':''}`,
    title:c.note||null,onclick:()=>screenNav.goView?.('stocks','screener',{country:code,collection:c.id})},[c.title]);
  const filter=el('div',{class:'ms-pills'},[
    el('div',{class:'ms-pills__row'},COLLECTIONS.filter(c=>MARKET_GROUPS.includes(c.group)).map(screenPill)),
    el('div',{class:'ms-pills__row ms-pills__row--sectors'},COLLECTIONS.filter(c=>!MARKET_GROUPS.includes(c.group)).map(screenPill)),
  ]);
  const search=el('input',{type:'search',placeholder:'Search symbol or company','aria-label':'Search stocks',oninput:()=>draw()});
  const tabHost=el('div');
  root.append(filter,tabHost,el('div',{class:'ms-filters'},[picker(code,country=>screenNav.goView?.('stocks','screener',{country,collection})),search]),results);
  function draw(){
    const query=search.value.trim().toLowerCase();
    const rows=companies
      .filter(r=>!screen.test||screen.test(r))
      .filter(r=>`${r.symbol} ${r.companyName}`.toLowerCase().includes(query));
    tableState.page=1;
    tabHost.replaceChildren(screenerTabs(sets,tableState,draw));
    results.replaceChildren(...[
      el('p',{class:'mh-section-description',text:`${rows.length.toLocaleString()} ${rows.length===1?'company':'companies'} · ${screen.id==='all'?titleFor(code):`${screen.title} · ${titleFor(code)}`} · Up to 5,000 listings returned by FMP`}),
      // The rule, printed: a screen a reader cannot see the definition of is a
      // screen they cannot check.
      screen.note?el('p',{class:'mh-panel-note',text:screen.note}):null,
      marketTable({rows,sets,state:tableState,showTabs:false,identity:r=>screenerIdentity(r,nav)}),
    ].filter(Boolean));
  }
  draw();
  results.append(emptyState(hasApiKey()?'loading':'skipped','Connect FMP in Settings to load stocks.'));
  if(hasApiKey())fetchScreener(stockScreenParams(code,collection)).then(result=>{
    if(disposed)return;
    if(result.status!=='ok'){results.replaceChildren(emptyState(result.status,result.message));return;}
    companies=sorted(dedupeStocks(rowsOf(result),{usOnly:code==='US'}),'marketCap');draw();
  }).catch(error=>{if(!disposed)results.replaceChildren(emptyState('error',error.message));});
  return root;
}
