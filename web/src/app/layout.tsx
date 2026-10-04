import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { AppProviders } from '@/components/providers';
import { AppFrame } from '@/components/shell/app-frame';
import { BRAND_NAME, BRAND_SLOGAN } from '@/lib/brand';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });
// The logo's typeface, for the wordmark only. One weight, self-hosted.
const klarheit = localFont({ src: '../fonts/es-klarheit-kurrent-semibold.woff', weight: '600', display: 'swap', variable: '--font-klarheit' });

export const metadata: Metadata = {
  title: { default: `${BRAND_NAME} — ${BRAND_SLOGAN}`, template: `%s — ${BRAND_NAME}` },
  description:
    `${BRAND_NAME} stock analysis: a five-factor report on valuation, growth, track record, balance sheet health `
    + 'and dividends.',
  icons: {
    icon: [
      { url: '/img/mazvantage-favicon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/img/mazvantage-favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

// Read per request, not at build: whether the operator configured a key is a
// fact about the running server, and a baked-in answer would survive a
// redeploy that changed it.
export const dynamic = 'force-dynamic';

/* The theme is applied before first paint. Light is the default, as it was in
   the legacy shell, and the choice lives under the legacy storage key so a
   reader's setting carries over. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('mazvantage.theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const serverKey = Boolean(process.env.FMP_API_KEY?.trim());
  return (
    <html lang="en" data-theme="light" className={`${inter.variable} ${klarheit.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppProviders serverKey={serverKey}>
          <AppFrame>{children}</AppFrame>
        </AppProviders>
      </body>
    </html>
  );
}
