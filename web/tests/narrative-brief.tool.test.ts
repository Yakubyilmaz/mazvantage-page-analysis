/* Not a test: the tool for writing a new research narrative (2026-10-12).

   A narrative is written in session from the brief, the same pre-computed
   figures the page prints, and checked by tests/narrative-figures.test.ts
   before it ships. This writes that brief, with the prompt and the schema,
   for any symbol with a bundled snapshot in public/data/:

     BRIEF=MSFT npx vitest run tests/narrative-brief.tool.test.ts

   Output: tools/narrative/work/<SYMBOL>-prompt.json (git-ignored). Write the
   sections into public/data/research.json under the symbol, with `model`,
   `generatedAt` and a `basis` of price, fair value and quant rating as the
   page prints them; record a first edition in lib/research-editions.ts with
   the same readings and the note's headline; then run the tests. Keep each
   section's paragraph count stable once outside voices are anchored to it.

   Skipped unless BRIEF is set, so the normal test run never writes files. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { researchRatings } from '@/lib/research-model';
import { buildPrompt } from '@/lib/narrative';
import { price, dec } from '@/lib/format';

const SYMBOL = process.env.BRIEF?.toUpperCase();

describe.skipIf(!SYMBOL)('narrative brief', () => {
  it(`writes the brief for ${SYMBOL}`, () => {
    const ROOT = path.resolve(import.meta.dirname, '..');
    const load = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
    const snap = load(`${SYMBOL}.json`);
    const a: any = analyse(
      makeDataset(SYMBOL!, Object.fromEntries(Object.entries(snap.feeds).map(([k, v]) => [k, { status: 'ok', data: v }])) as any),
      { sectorStats: load('sector-stats.json'), benchmarks: snap.extras.benchmarks, peerRatios: snap.extras.peerRatios, peerGrowth: snap.extras.peerGrowth, peerMetrics: snap.extras.peerMetrics },
    );
    const r = researchRatings(a);
    const out = path.resolve(ROOT, '..', 'tools', 'narrative', 'work');
    mkdirSync(out, { recursive: true });
    const basis = {
      price: price(a.facts.price),
      fairValue: price(r.fve.value),
      quantRating: `${r.quant.verdict} · ${r.quant.letter} · ${dec(r.quant.score, 2)} of 5`,
      asOf: snap.capturedAt,
    };
    writeFileSync(path.join(out, `${SYMBOL}-prompt.json`), JSON.stringify({ basis, ...buildPrompt(a, r) }, null, 2));
    console.log(`Wrote tools/narrative/work/${SYMBOL}-prompt.json`, basis);
  });
});
