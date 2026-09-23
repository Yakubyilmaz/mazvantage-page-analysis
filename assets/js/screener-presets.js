import { IDEAS, runIdea } from './ideas.js';
import { SECTORS, sectorSlug } from './nav.js';
import { COLLECTIONS } from './stockmarkets.js';
import { SHARIAH_IDEAS } from './shariah-screens.js';

const byKey = key => IDEAS.find(idea => idea.key === key);
const ranked = byKey('stocks-by-quant');
const sectorNames = {
  Technology: 'Top Tech Stocks', Healthcare: 'Top Healthcare Stocks',
  'Financial Services': 'Top Financial Stocks', 'Consumer Cyclical': 'Top Consumer Discretionary Stocks',
  'Communication Services': 'Top Communication Services Stocks', Industrials: 'Top Industrial Stocks',
  'Consumer Defensive': 'Top Consumer Staples Stocks', Energy: 'Top Energy Stocks',
  'Basic Materials': 'Top Materials Stocks', 'Real Estate': 'Top Real Estate Stocks', Utilities: 'Top Utility Stocks',
};
const sectors = SECTORS.map(sector => ({
  id: sector === 'Technology' ? 'top-tech-stocks' : `top-${sectorSlug(sector)}-stocks`,
  title: sectorNames[sector], group: 'Top Stocks by Sector',
  idea: sector === 'Technology' ? byKey('top-tech-stocks') : {
    ...ranked, key: `top-${sectorSlug(sector)}-stocks`, title: sectorNames[sector],
    universe: {...ranked.universe, sector}, resultLimit: 25,
  },
}));
const featured = IDEAS.filter(idea => idea.group === 'Featured screens' && !['all-stocks','top-tech-stocks'].includes(idea.key))
  .map(idea => ({id: idea.key, title: idea.title, group: 'Featured Screeners', idea}));
const reits = {
  ...ranked, key: 'top-reits', title: 'Top REITs',
  universe: {...ranked.universe, sector: 'Real Estate'},
  rules: [{label:'Real estate investment trusts', bags:[], test:row=>/\breit\b/i.test(row.industry||'')}],
};
// Explicit aliases collapse equivalent entry points; specialized investment theses stay distinct.
const aliases = {
  'all-stocks':'all', 'top-quant-stocks':'stocks-by-quant',
  'us-tech-top15':'top-tech-stocks', 'us-value-top20':'top-value-stocks',
  'small-profitable':'top-small-cap-stocks',
};
const claimed = new Set([...featured.map(item=>item.id), ...sectors.map(item=>item.id), ...Object.keys(aliases)]);
const ideas = IDEAS.filter(idea => !claimed.has(idea.key))
  .map(idea => ({id:idea.key,title:idea.title,group:'Investment Ideas',idea}));
const basic = COLLECTIONS.filter(item => item.id !== 'all').map(item => ({...item,group:'Market Collections'}));

/* The Shariah screens are not entries in `IDEAS` — they are built from the
   AAOIFI limits in `shariah-screens.js` — so they are registered here rather
   than filtered out of the catalogue above. Registering them is what lets the
   Shariah desk run them through the same table as every other screen. */
const shariah = SHARIAH_IDEAS.map(idea => ({id:idea.key,title:idea.title,group:'Shariah',idea}));

export const SCREENER_PRESETS = [
  {id:'all',title:'All Stocks',group:'Featured Screeners'},
  ...featured,
  {id:'top-reits',title:'Top REITs',group:'Featured Screeners',idea:reits},
  ...['Most Shorted Stocks','Strong Buy Stocks - Short Squeeze'].map(title=>({
    id:sectorSlug(title),title,group:'Featured Screeners',
    unavailable:'Short-interest data is not available from the connected screener feeds.',
  })),
  ...sectors, ...ideas, ...shariah, ...basic,
];
// Stocks by Quant is the single canonical screen; both names remain discoverable.
SCREENER_PRESETS.find(item=>item.id==='stocks-by-quant').title='Top Quant Stocks (Stocks by Quant)';

export function screenerPreset(id) {
  return SCREENER_PRESETS.find(item=>item.id===(aliases[id]||id)) || SCREENER_PRESETS[0];
}

export function presetIdea(preset,country) {
  if(!preset.idea)return null;
  const universe={...preset.idea.universe};
  if(country==='WORLD')delete universe.country;else universe.country=country;
  return {...preset.idea,universe};
}

export async function runScreenerPreset(preset,country,options={}) {
  const result=await runIdea(presetIdea(preset,country),options);
  return {...result, rows:(result.rows||[]).map((row,index)=>({
    ...row, companyName:row.name, presetRank:index+1,
    bags:Object.fromEntries(['ratios','metrics','growth','returns','balance','grades'].filter(key=>row[key]!=null).map(key=>[key,row[key]])),
  }))};
}
