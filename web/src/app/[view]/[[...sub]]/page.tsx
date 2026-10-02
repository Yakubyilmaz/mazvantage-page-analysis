import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NAV_BY_VIEW, labelFor, OFF_RAIL_TITLES } from '@/lib/nav';
import { PAGE_VIEWS, resolveSub } from '@/lib/routes';
import { NavPage } from '@/components/pages/nav-page';

/* Every page that is not a company report: `/<view>/<sub>`.

   One dynamic route rather than a folder per view, so the allow-list stays
   `NAV` (plus Calendar and Pricing) — the menu and the router cannot drift.
   Static segments win over this one, so `/stock` and `/api` are unaffected. */

type Props = { params: { view: string; sub?: string[] } };

function resolve(params: Props['params']) {
  const view = params.view.toLowerCase();
  if (!PAGE_VIEWS.has(view)) return null;
  const sub = NAV_BY_VIEW[view] ? resolveSub(view, params.sub?.[0] ? decodeURIComponent(params.sub[0]) : null) : null;
  return { view, sub };
}

export function generateMetadata({ params }: Props): Metadata {
  const r = resolve(params);
  if (!r) return {};
  return { title: OFF_RAIL_TITLES[r.view] || labelFor(r.view, r.sub) || NAV_BY_VIEW[r.view]?.label || r.view };
}

export default function Page({ params }: Props) {
  const r = resolve(params);
  if (!r) notFound();
  return <NavPage view={r.view} sub={r.sub} />;
}
