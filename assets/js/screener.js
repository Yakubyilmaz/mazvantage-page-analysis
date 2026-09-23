import { el } from './util.js';
import { fetchScreener, hasApiKey } from './fmp.js';
import { COUNTRIES, dedupeStocks } from './markethub-data.js';
import { emptyState, instrumentMark } from './markethub-ui.js';
import { SCREENER_COLUMN_SETS, FUND_COLUMN_SETS, fillBags } from './markettable.js';
import { COLLECTIONS } from './stockmarkets.js';
import { SCREENER_PRESETS, screenerPreset, runScreenerPreset } from './screener-presets.js';
import { ETF_COLLECTIONS, etfCollection } from './etf-collections.js';
import { MAX_SCORE, verdictWord } from './grading.js';

const PAGE_SIZE = 50;
const finite = value => typeof value === 'number' && Number.isFinite(value);
function quantBadge(value) {
  const valid=finite(value)&&value>=0&&value<=MAX_SCORE;
  const band=valid?Math.min(4,Math.floor(value)):'missing';
  return el('strong',{
    class:`ms-screen-symbol sc-quant-badge sc-quant-badge--${band}`,
    text:valid?value.toFixed(2):'—',
    title:valid?`${verdictWord(value)} · ${value.toFixed(2)} out of ${MAX_SCORE}`:'Maz Quant score unavailable',
  });
}
const numberText = value => finite(value) ? new Intl.NumberFormat('en', {maximumFractionDigits:2,notation:Math.abs(value)>=1e6?'compact':'standard'}).format(value) : '—';
const plainColumn = (key,label,get,percent=false) => ({key,label,num:true,get,fmt:value=>finite(value)?`${numberText(value)}${percent?'%':''}`:'—'});
const quote = key => row => row.bags?.quote?.[key];
const change = row => row.bags?.quote?.changePercentage ?? row.bags?.quote?.changesPercentage;
const overview = SCREENER_COLUMN_SETS[0].columns;
const pick = key => overview.find(column=>column.key===key);
const stockOverview = {key:'overview',label:'Overview',bags:['quote','ratios','growth','grades'],columns:[
  pick('price'), plainColumn('change','Chg %',change,true), pick('volume'),
  plainColumn('relativeVolume','Rel vol',row=>row.bags?.quote?.avgVolume>0?row.volume/row.bags.quote.avgVolume:null),
  {...pick('marketCap'),label:'Mkt cap'},
  plainColumn('pe','P/E',row=>row.bags?.ratios?.priceToEarningsRatioTTM),
  plainColumn('eps','EPS dil TTM',quote('eps')),
  plainColumn('epsGrowth','EPS dil growth',row=>finite(row.bags?.growth?.growthEPSDiluted)?row.bags.growth.growthEPSDiluted*100:null,true),
  pick('divYield'), pick('sector'),
  {key:'rating',label:'Analyst rating',get:row=>row.bags?.grades?.consensus,fmt:value=>value||'—'},
]};

export function screenerParams(country,kind,collection='all') {
  return {isEtf:kind==='etfs',...(kind==='etfs'?{}:{isFund:false}),isActivelyTrading:true,
    ...(country==='WORLD'?{}:{country}),
    ...(kind==='etfs'?{}:COLLECTIONS.find(item=>item.id===collection)?.params),limit:5000};
}

/**
 * The screener, as its own page or inside one.
 *
 * `options` is what an embedding page overrides: `kind`, `country` and
 * `collection` instead of the query string, `chrome:false` to drop the title
 * row the page already provides, `picker:false` to drop the preset dropdown
 * as well, and `onNavigate` to keep a change of collection inside that page
 * rather than routing away from it.
 *
 * `picker:false` is for a host that offers the screens itself — the Quant
 * desk lists its eight as a rail, and a dropdown beside them offering forty
 * more would be a second, disagreeing answer to "which screens are these".
 * The search box stays either way: it filters the result rather than choosing
 * it, so nothing above can replace it.
 */
export function renderDedicatedScreener(nav={},options={}) {
  const params=new URLSearchParams(location.search);
  const asked=options.country??params.get('country');
  const country=COUNTRIES.some(item=>item.code===asked)?asked:asked==='WORLD'?'WORLD':'US';
  const kind=(options.kind??params.get('kind'))==='etfs'?'etfs':'stocks';
  // A fund is selected, never scored: the ETF list is collections over the
  // listings the screener already returned, the stock list is screens.
  const askedCollection=options.collection??params.get('collection');
  const selectedPreset=kind==='etfs'?etfCollection(askedCollection):screenerPreset(askedCollection);
  const collection=selectedPreset.id;
  const sets=kind==='stocks'?SCREENER_COLUMN_SETS.map(set=>set.key==='overview'?stockOverview:set):[
    FUND_COLUMN_SETS[0], ...SCREENER_COLUMN_SETS.filter(set=>['performance','technicals'].includes(set.key)),
  ];
  if(selectedPreset.idea)sets[0]={...sets[0],columns:[
    plainColumn('presetRank','Rank',row=>row.presetRank),
    {...plainColumn('quantScore','Maz Quant',row=>row.lite?.score),fmt:quantBadge},...sets[0].columns,
  ]};
  let active=sets[0], rows=[], page=1, sort=selectedPreset.idea?'presetRank':selectedPreset.sort?.key||'marketCap',
    direction=selectedPreset.idea?1:selectedPreset.sort?.direction??-1, disposed=false, generation=0;
  let coverage='';
  let loading=true, loadError=null;
  const attempted=new WeakMap(), filters=new Map();
  let refreshCells=()=>{};
  const root=el('div',{class:'mh-page ms-page sc-page'});
  root.dispose=()=>{disposed=true;generation++;};
  /* Where a change of type, country or collection lands when the host has not
     said. Stocks and funds are two pages now — two rail menus, two views — so
     the target follows the kind rather than always being the stock screener,
     and flipping the type dropdown moves to the other page with the state
     intact. */
  const navigate=changes=>{
    const next={country,kind,collection,...changes};
    if(options.onNavigate)options.onNavigate(next);
    else nav.goView?.(next.kind==='etfs'?'etfs':'stocks','screener',next);
  };
  function select(label,options,value,onchange,className='') {
    const node=el('select',{'aria-label':label,class:className,onchange:event=>onchange(event.target.value)},options.map(([value,text])=>el('option',{value,text})));
    node.value=value;return node;
  }
  const type=select('Screener type',[['stocks','Stock Screener'],['etfs','ETF Screener']],kind,value=>navigate({kind:value,collection:'all'}),'sc-type');
  const preset=select('Screener preset',[],collection,value=>navigate({collection:value}),'sc-preset');
  const presets=kind==='stocks'?SCREENER_PRESETS:ETF_COLLECTIONS;
  for(const group of [...new Set(presets.map(item=>item.group))]){
    preset.append(el('optgroup',{label:group},presets.filter(item=>item.group===group).map(item=>el('option',{
      value:item.id,text:item.title,title:item.unavailable||item.note||null,
    }))));
  }
  preset.value=collection;
  preset.title=selectedPreset.title;
  if(selectedPreset.title.length>24)preset.classList.add('sc-preset--long');
  // The rule a collection selects on, printed where it is applied: a reader
  // cannot check a rule they cannot see.
  const rule=selectedPreset.note&&!selectedPreset.unavailable
    ?el('p',{class:'sc-rule',text:selectedPreset.note}):null;
  const countryPicker=select('Country',[['WORLD','World'],...COUNTRIES.map(item=>[item.code,item.name])],country,value=>navigate({country:value}),'sc-country');
  const search=el('input',{type:'search',placeholder:'Search symbol or name','aria-label':'Search screener',oninput:()=>{page=1;draw();}});
  const filterBar=el('div',{class:'sc-filters'},[countryPicker]);
  const filterSpecs=[
    ['price','Price',row=>row.price],['marketCap','Mkt cap',row=>row.marketCap],
    ['volume','Volume',row=>row.volume],['yield','Div yield %',row=>row.price>0&&finite(row.lastAnnualDividend)?row.lastAnnualDividend/row.price*100:null],
    ['beta','Beta',row=>row.beta],
  ];
  const controls=[];
  for(const [key,label,get] of filterSpecs){
    const summary=el('summary',{text:label});
    const low=el('input',{type:'number',step:'any',placeholder:'Min','aria-label':`${label} minimum`});
    const high=el('input',{type:'number',step:'any',placeholder:'Max','aria-label':`${label} maximum`});
    const error=el('span',{class:'sc-filter-error',role:'alert'});
    const menu=el('details',{class:'sc-filter'},[summary]);
    const apply=()=>{
      const min=low.value===''?null:Number(low.value),max=high.value===''?null:Number(high.value);
      if(!low.checkValidity()||!high.checkValidity()||(min!==null&&max!==null&&min>max)){error.textContent='Enter a valid minimum and maximum.';return;}
      error.textContent='';
      if(min===null&&max===null)filters.delete(key);else filters.set(key,row=>finite(get(row))&&(min===null||get(row)>=min)&&(max===null||get(row)<=max));
      summary.textContent=filters.has(key)?`${label}: ${min??'Any'} – ${max??'Any'}`:label;
      menu.classList.toggle('is-filtered',filters.has(key));menu.open=false;page=1;draw();
    };
    const form=el('form',{class:'sc-filter-menu',onsubmit:event=>{event.preventDefault();apply();}},[
      el('strong',{text:label}),el('div',{class:'sc-range'},[low,high]),error,
      el('button',{type:'submit',class:'sc-apply',text:'Apply'}),
    ]);
    menu.append(form);filterBar.append(menu);controls.push({menu,summary,label,low,high});
  }
  const sector=select('Sector',[['','Sector']], '',()=>{page=1;draw();});
  const exchange=select('Exchange',[['','Exchange']], '',()=>{page=1;draw();});
  if(kind==='stocks')filterBar.append(sector);
  filterBar.append(exchange,el('button',{type:'button',class:'sc-reset',text:'Reset',onclick:()=>{
    filters.clear();sector.value='';exchange.value='';search.value='';page=1;
    for(const control of controls){control.low.value='';control.high.value='';control.summary.textContent=control.label;control.menu.classList.remove('is-filtered');control.menu.open=false;}
    draw();
  }}));
  root.addEventListener('keydown',event=>{if(event.key==='Escape')root.querySelectorAll('details[open]').forEach(menu=>{menu.open=false;});});
  const tabs=el('nav',{class:'ms-screen-tabs',role:'tablist','aria-label':'Screener views'});
  const resultCount=el('span',{class:'sc-count','aria-live':'polite'});
  const tableHost=el('div',{class:'ms-screener-table'});
  root.append(el('header',{class:'sc-header'},[
    ...(options.chrome===false?[]:[el('h1',{},[type])]),
    el('div',{class:`sc-preset-row${options.picker===false?' sc-preset-row--bare':''}`},
      options.picker===false?[search]:[preset,search]),
  ]),...(rule&&options.picker!==false?[rule]:[]),filterBar,tabs,resultCount,tableHost);
  function filtered(){
    const query=search.value.trim().toLowerCase();
    return rows.filter(row=>(!query||`${row.symbol} ${row.companyName||row.name||''}`.toLowerCase().includes(query))
      &&(!selectedPreset.test||selectedPreset.test(row))
      &&(!sector.value||row.sector===sector.value)&&(!exchange.value||(row.exchangeShortName||row.exchange)===exchange.value)
      &&[...filters.values()].every(test=>test(row)));
  }
  function draw(enrich=true){
    if(disposed)return;
    const revision=++generation;
    tabs.replaceChildren(...sets.map(set=>el('button',{type:'button',role:'tab','aria-selected':String(set===active),class:set===active?'is-active':'',text:set.label,onclick:()=>{
      active=set;page=1;if(!active.columns.some(column=>column.key===sort))sort=active.columns[0].key;draw();
    }})));
    if(loading||loadError){resultCount.textContent='';tableHost.replaceChildren(emptyState(loading?'loading':loadError.status,loadError?.message||'Loading listings'));return;}
    const matching=filtered(),column=active.columns.find(item=>item.key===sort)||active.columns[0];
    matching.sort((a,b)=>{
      const x=column.get(a),y=column.get(b),missing=value=>value==null||value===''||(typeof value==='number'&&!finite(value));
      if(missing(x))return missing(y)?0:1;if(missing(y))return -1;
      return direction*(column.num?x-y:String(x).localeCompare(String(y)));
    });
    const pages=Math.max(1,Math.ceil(matching.length/PAGE_SIZE));page=Math.min(page,pages);
    const visible=matching.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
    const noun=kind==='etfs'?'ETF':'stock';
    resultCount.textContent=`${matching.length.toLocaleString()} ${noun}${matching.length===1?'':'s'}${coverage?` · ${coverage}`:rows.length===5000?' · First 5,000 listings':''}`;
    const columns=active.columns;
    const cells=[];
    const table=el('table',{class:'mt'},[
      el('thead',{},[el('tr',{},[el('th',{class:'mt__id',scope:'col',text:'Symbol'}),...columns.map(item=>el('th',{scope:'col',class:item.num?'num':'','aria-sort':sort===item.key?(direction===1?'ascending':'descending'):'none'},[
        el('button',{type:'button',class:'mt__sort',text:`${sort===item.key?(direction===1?'↑ ':'↓ '):''}${item.label}`,onclick:()=>{direction=sort===item.key?-direction:-1;sort=item.key;draw();}}),
      ]))])]),
      el('tbody',{},visible.map(row=>el('tr',{},[
        el('td',{class:'mt__id'},[el('button',{type:'button',class:'ms-screen-identity',title:row.companyName||row.name||row.symbol,onclick:()=>nav.goSymbol?.(row.symbol)},[
          instrumentMark(row),el('strong',{class:'ms-screen-symbol',text:row.symbol}),el('span',{class:'ms-screen-company',text:row.companyName||row.name||''}),
        ])]),
        ...columns.map(item=>{const cell=el('td');cells.push({cell,item,row});return cell;}),
      ]))),
    ]);
    const status=el('span',{class:'sc-data-status','aria-live':'polite'});
    refreshCells=()=>{
      if(disposed)return;
      for(const {cell,item,row} of cells){
        const value=item.get(row);
        cell.className=`${item.num?'num':''} ${item.key==='change'&&finite(value)?value>=0?'sc-positive':'sc-negative':''}`;
        cell.replaceChildren(item.fmt(value));
      }
      status.textContent='';
    };
    refreshCells();
    tableHost.replaceChildren(el('div',{class:'mtscroll'},[table]),
      matching.length?el('nav',{class:'sc-pager','aria-label':'Screener pages'},[
        status,el('span',{text:`${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,matching.length)} of ${matching.length.toLocaleString()}`}),
        el('button',{type:'button',text:'Previous',disabled:page===1,onclick:()=>{page--;draw();}}),
        el('button',{type:'button',text:'Next',disabled:page===pages,onclick:()=>{page++;draw();}}),
      ]):el('p',{class:'sc-empty',text:'No matches. Adjust your filters.'}));
    // Enrich only visible listings, and never retry an unavailable bag in a render loop.
    const needed=visible.filter(row=>active.bags.some(bag=>!row.bags?.[bag]&&!attempted.get(row)?.has(bag)));
    if(enrich&&needed.length){
      const bags=[...active.bags];
      for(const row of needed){const tried=attempted.get(row)||new Set();bags.forEach(bag=>tried.add(bag));attempted.set(row,tried);}
      status.textContent='Loading metrics…';
      fillBags(needed,bags).then(()=>{if(!disposed)draw(false);}).catch(()=>{if(!disposed&&revision===generation)status.textContent='Some metrics are unavailable.';});
    }
  }
  draw();
  if(selectedPreset.unavailable){loading=false;loadError={status:'unavailable',message:selectedPreset.unavailable};draw();}
  else if(!hasApiKey()){loading=false;loadError={status:'skipped',message:'Connect FMP in Settings to load the screener.'};draw();}
  else (selectedPreset.idea?runScreenerPreset(selectedPreset,country,{onProgress:(done,total)=>{
    if(!disposed)resultCount.textContent=`Screening ${done} of ${total} companies`;
  }}).then(result=>{
    coverage=`${result.tested||0} tested of ${result.universeSize||0} candidates · Maz Vantage model`;
    return {status:result.state==='empty'?'ok':result.state,message:result.message,data:result.rows};
  }):fetchScreener(screenerParams(country,kind,collection))).then(result=>{
    if(disposed)return;
    loading=false;
    if(result.status!=='ok'){loadError=result;draw();return;}
    const data=Array.isArray(result.data)?result.data:[];
    rows=selectedPreset.idea?data:kind==='etfs'?[...new Map(data.filter(row=>row?.symbol).map(row=>[row.symbol,row])).values()]:dedupeStocks(data,{usOnly:country==='US'});
    for(const [node,key] of [[sector,'sector'],[exchange,'exchange']]){
      const values=[...new Set(rows.map(row=>key==='exchange'?row.exchangeShortName||row.exchange:row[key]).filter(Boolean))].sort();
      node.append(...values.map(value=>el('option',{value,text:value})));
    }
    draw();
  }).catch(error=>{if(!disposed){loading=false;loadError={status:'error',message:error.message};draw();}});
  return root;
}
