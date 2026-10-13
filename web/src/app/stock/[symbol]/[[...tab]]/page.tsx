import type { Metadata } from 'next';
import { getStockSummary, halalQuestion } from '@/components/report/stock-summary';
import { stockHref, tabFromSlug } from '@/lib/routes';

/* The tab is read from the path by the report shell in the layout above; the
   page itself renders nothing, so switching tabs never remounts the report.
   It does own the metadata, because only the page knows the tab: the Shariah
   tab answers "Is <company> halal?", every other tab names itself. */

type Props = { params: { symbol: string; tab?: string[] } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sym = decodeURIComponent(params.symbol).toUpperCase();
  const tab = tabFromSlug(params.tab?.[0] ? decodeURIComponent(params.tab[0]) : null) ?? 'Overview';
  const s = await getStockSummary(sym).catch(() => null);
  const name = s?.name || sym;
  const canonical = stockHref(sym, tab);
  if (tab === 'Shariah Compliance') {
    return {
      title: `${s ? halalQuestion(s) : `Is ${sym} halal?`} Shariah compliance check`,
      description: s ? `${s.label.headline}. ${s.label.sentence}` : undefined,
      alternates: { canonical },
    };
  }
  return {
    title: tab === 'Overview' ? `${name} (${sym}) stock analysis and halal check` : `${name} (${sym}) ${tab}`,
    description: s
      ? `${name} (${sym}): ${tab === 'Overview' ? 'grades on valuation, growth, profitability, financial health and momentum against its sector' : tab.toLowerCase()}. Shariah screen: ${s.label.headline.toLowerCase()}.`
      : undefined,
    alternates: { canonical },
  };
}

export default function StockTabPage() {
  return null;
}
