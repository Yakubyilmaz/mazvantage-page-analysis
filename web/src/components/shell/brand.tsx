/* ==========================================================================
   The brand, drawn: the mark, the wordmark and the slogan.

   - **The mark is inline SVG in `currentColor`**, so one drawing serves the
     black rail and footer (white) and any themed page (foreground). The same
     path ships as files in `public/img/mazvantage-mark-{white,black}.svg`
     and `mazvantage-favicon.svg` for uses outside the page.
   - **The wordmark is set in ES Klarheit Kurrent Semibold**, the logo's
     typeface, loaded by `layout.tsx` as `--font-brand`. Only the wordmark
     uses it; the interface stays in Inter.
   - **The slogan's "vantage" is blue.** On the black chrome that is the
     dark theme's primary (`text-rail-accent`, 6:1 on black); on a themed
     surface it is `text-primary`.
   ========================================================================== */

import { cn } from '@/lib/cn';
import { BRAND_NAME, BRAND_SLOGAN } from '@/lib/brand';

const MARK_D = 'M2989.54 2672.24C2989.54 2666.8 2993.52 2659.91 2998.47 2656.91C3003.32 2653.9 3038.25 2599.67 3076.08 2536.51C3301.36 2159.79 3497.97 1615.77 3104.8 1433.32C2938.12 1330.39 2501.64 1339.41 1786.33 1460.68C1578.23 1495.99 1004.18 1610.67 821.11 1653.45C762.414 1667.23 711.189 1677.32 707.211 1675.96C698.092 1672.95 1021.35 1554.59 1315.8 1453.11C2252.12 1130.63 3048.24 940.769 3462.21 941.254C3671.87 941.448 3766.55 1035.29 3780.43 1052.24C4031.07 1358.41 3560.2 2210.24 3063.67 2620.72C3022.92 2654.38 2989.54 2677.57 2989.54 2672.24ZM73.9794 1726.99C403.547 1537.61 1213.54 1135.38 1631.11 953.575C2603.41 530.389 3164.08 330.632 3868.62 156.293C4302.48 48.8962 4529.76 0 4861.88 0C5194 0 5194 254.878 5194 290.885C5194 810.525 4725.89 1317.35 4067.34 1838.23C3877.08 1988.7 3871.55 1992.1 3910.65 1936.12C3950.14 1879.75 4051.52 1703.96 4095.57 1615.77C4221.88 1362.75 4322.66 912.674 4016.24 736.392C3780.43 589.537 3339.29 682.996 2615.83 864.514C2028.39 1011.88 1252.06 1277.42 272.865 1665.87C131.414 1721.95 9.26883 1769.97 1.2164 1772.49C-6.83604 1775.01 25.9558 1754.54 73.9794 1726.99Z';

/** The mark alone, 5194 × 2673. Size it by height (`h-5`) or width; the ratio holds. */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 5194 2673" fill="currentColor" className={cn('w-auto flex-none', className)}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={MARK_D} />
    </svg>
  );
}

/** "Maz Vantage", in the logo's typeface. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-brand font-semibold leading-none tracking-[-.005em] whitespace-nowrap', className)}>{BRAND_NAME}</span>;
}

const STEM = BRAND_SLOGAN.slice(0, -'vantage'.length);

/** "Market Research to your ad**vantage**", the last word's tail in blue. */
export function Slogan({ className, onBlack }: { className?: string; onBlack?: boolean }) {
  return (
    <span className={className}>
      {STEM}<span className={onBlack ? 'text-rail-accent' : 'text-primary'}>vantage</span>
    </span>
  );
}
