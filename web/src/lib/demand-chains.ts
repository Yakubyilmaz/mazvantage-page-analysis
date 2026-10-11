/* ==========================================================================
   Maz Vantage — Demand Discovery: the supply chains, written by hand

   No data feed says who supplies whom. The company-relationship tab this
   app once had was removed for exactly that reason, and the spec forbids
   inventing supplier relationships. So the chains are curated here, small
   on purpose, and every membership says how it is known:

   - ACTUAL — the company's own segment reporting gives the share
     (NVIDIA's data-centre segment, Micron's DRAM and NAND lines).
   - ESTIMATE — a rounded company figure via a secondary summary
     (Vertiv's ~85% data-centre share).
   - INFERRED — reasoned from stated products and end markets, with the
     reasoning written out.

   ---------------------------------------------------------------------------
   Edges carry lags, layers carry lead times
   ---------------------------------------------------------------------------

   One layer's capital spending is the next layer's revenue a few quarters
   later. The AI build-out went cloud capex → accelerators → memory → power
   and cooling, and each edge below carries the lag range that propagation
   is expected to take. That is what lets the engine say "the layer above
   has inflected and this one has not yet" — the one statement about the
   future it is willing to make.

   A layer's supply lead time is how long new capacity takes to arrive. A
   bottleneck is where demand ramps faster than that lead time allows, which
   is why a copper mine (more than 16 years from discovery to production on
   average, per the IEA) and a residential inverter line (months) behave so
   differently when demand jumps.

   ---------------------------------------------------------------------------
   Controls
   ---------------------------------------------------------------------------

   Two chains are failure cases, kept so the engine is tested on themes where
   demand grew and the stocks still fell: lithium after 2022 and residential
   solar after 2022. An engine that cannot tell those from AI memory is
   telling stories, not reading evidence.
   ========================================================================== */

import type { DataType } from './demand-signals';
import type { CohortMetric } from './demand-cohort';

export type Exposure = 'core' | 'high' | 'meaningful' | 'indirect';

/** The spec's exposure ladder. */
export const EXPOSURE_SCORE: Record<Exposure, number> = { core: 100, high: 75, meaningful: 50, indirect: 25 };

export interface ChainMember {
  symbol: string;
  exposure: Exposure;
  basis: DataType;
  /** share of revenue from this part of the chain, when disclosed or estimated */
  share?: number;
  evidence: string;
}

export interface ChainLayer {
  id: string;
  name: string;
  /** what this layer sells to the one below it, or buys from the one above */
  role: string;
  metric: CohortMetric;
  members: ChainMember[];
  /** companies that belong here but are not in the capture, said out loud */
  uncaptured?: string[];
  leadTime: { years: [number, number]; basis: DataType; note: string };
  bottleneck?: string;
  /** evidence-register id of a sourced long-run growth figure for the priced-in gate */
  referenceGrowth?: string;
}

export interface ChainEdge {
  from: string;
  to: string;
  /** quarters for a change in `from` to show up in `to` */
  lagQuarters: [number, number];
  why: string;
}

export interface Chain {
  id: string;
  name: string;
  kind: 'theme' | 'control';
  question: string;
  layers: ChainLayer[];
  edges: ChainEdge[];
  /** a commodity price that is itself evidence, e.g. copper */
  commodity?: { symbol: string; label: string };
  /** the evidence-register theme key */
  evidenceTheme: string;
}

export const CHAINS: Chain[] = [
  {
    id: 'ai-compute',
    name: 'AI compute build-out',
    kind: 'theme',
    evidenceTheme: 'ai-compute',
    question: 'Is AI spending still accelerating, and which layer of the chain has not caught up yet?',
    layers: [
      {
        id: 'cloud-capex', name: 'Cloud capital spending', metric: 'capex',
        role: 'The buyers. Their capex is the revenue of every layer below, a few quarters later.',
        members: [
          { symbol: 'MSFT', exposure: 'core', basis: 'ACTUAL', evidence: 'Capital spending as filed in the cash-flow statement.' },
          { symbol: 'GOOGL', exposure: 'core', basis: 'ACTUAL', evidence: 'Capital spending as filed in the cash-flow statement.' },
          { symbol: 'AMZN', exposure: 'core', basis: 'ACTUAL', evidence: 'Capital spending as filed. Includes logistics as well as data centres, so it overstates the AI share.' },
          { symbol: 'META', exposure: 'core', basis: 'ACTUAL', evidence: 'Capital spending as filed in the cash-flow statement.' },
          { symbol: 'ORCL', exposure: 'core', basis: 'ACTUAL', evidence: 'Capital spending as filed. Most of it is Oracle Cloud Infrastructure; database and application capex is not split out. Fiscal year ends in May.' },
        ],
        leadTime: { years: [1, 3], basis: 'INFERRED', note: 'A data centre takes one to three years from site to power-on; the spending leads the capacity.' },
      },
      {
        id: 'accelerators', name: 'Accelerators and networking chips', metric: 'rev',
        role: 'GPUs and custom AI chips bought with that capex.',
        members: [
          { symbol: 'NVDA', exposure: 'core', basis: 'ACTUAL', share: 0.897, evidence: 'Data Center segment $193.7bn of $215.9bn revenue in fiscal 2026 (segment reporting).' },
          { symbol: 'AVGO', exposure: 'high', basis: 'INFERRED', share: 0.577, evidence: 'Semiconductor Solutions was 57.7% of fiscal 2025 revenue (segment reporting); the AI share inside it is not broken out in that table.' },
          { symbol: 'AMD', exposure: 'high', basis: 'ACTUAL', share: 0.48, evidence: 'Data Center segment $16.6bn of $34.6bn revenue in 2025 (segment reporting). It holds EPYC server CPUs as well as Instinct accelerators, so not all of it is AI.' },
          { symbol: 'MRVL', exposure: 'high', basis: 'ACTUAL', share: 0.744, evidence: 'Data center $6.1bn of $8.2bn revenue in fiscal 2026, to January 2026 (segment reporting): custom AI chips, electro-optics and storage controllers.' },
          { symbol: 'ANET', exposure: 'high', basis: 'INFERRED', evidence: 'Product revenue $7.6bn of $9.0bn in 2025; the segment data splits product from service, not by end market. Its switches go mainly into cloud and AI data-centre networks.' },
        ],
        leadTime: { years: [1, 2], basis: 'INFERRED', note: 'Leading-edge wafer and advanced-packaging capacity, added in one-to-two-year steps.' },
      },
      {
        id: 'memory', name: 'Memory and storage (HBM, DRAM, NAND, hard drives)', metric: 'rev',
        role: 'Every accelerator ships with high-bandwidth memory; AI servers also pull DRAM and SSDs, and the data they train on sits on high-capacity drives.',
        members: [
          { symbol: 'MU', exposure: 'core', basis: 'ACTUAL', share: 1, evidence: 'DRAM 77% and NAND 23% of fiscal 2025 revenue (segment reporting). HBM sits inside DRAM and is not split out.' },
          { symbol: 'SNDK', exposure: 'core', basis: 'INFERRED', share: 1, evidence: 'A NAND flash company by its own description since the 2025 spin-off from Western Digital.' },
          { symbol: 'STX', exposure: 'meaningful', basis: 'INFERRED', evidence: 'Hard drives, mostly high-capacity nearline drives for cloud data centres by its own description; no segment split in the captured data. Storage, not memory: it moves with data-centre build-outs but has its own supply chain.' },
        ],
        uncaptured: ['SK hynix', 'Samsung Electronics', 'Kioxia', 'Western Digital (its history holds the flash business spun off as Sandisk in 2025, so its growth cannot be read like for like)'],
        leadTime: { years: [2, 3], basis: 'INFERRED', note: 'Clean-room space is the constraint: Micron said in September 2026 that rooms it is building now come online in late 2028.' },
        bottleneck: 'HBM3E takes about three times the wafer supply of DDR5 for the same bits (Micron, March 2024), so HBM growth removes conventional DRAM supply.',
      },
      {
        id: 'chip-test', name: 'Chip-making equipment and test', metric: 'rev',
        role: 'The tools that build and test the chips: the memory and logic makers above buy them when they add capacity.',
        members: [
          { symbol: 'TER', exposure: 'high', basis: 'ACTUAL', share: 0.79, evidence: 'Semiconductor Test was 79% of 2025 revenue; the 10-K attributes its growth to AI compute.' },
          { symbol: 'FORM', exposure: 'high', basis: 'ACTUAL', share: 0.81, evidence: 'Probe cards were 81% of 2025 revenue: DRAM $247m (where HBM is tested) and foundry and logic $370m of $785m (segment reporting); systems are the rest.' },
          { symbol: 'AMAT', exposure: 'meaningful', basis: 'INFERRED', share: 0.733, evidence: 'Semiconductor Systems $20.8bn of $28.4bn revenue in fiscal 2025 (segment reporting). Wafer-fab tools for every kind of chip; the AI share is not stated.' },
          { symbol: 'LRCX', exposure: 'meaningful', basis: 'INFERRED', share: 0.641, evidence: 'Systems $14.9bn of $23.2bn revenue in fiscal 2026, to June (segment reporting); the rest is support for the installed base. Etch and deposition, heavily used by memory makers; the AI share is not stated.' },
          { symbol: 'KLAC', exposure: 'meaningful', basis: 'INFERRED', share: 0.69, evidence: 'Wafer inspection and patterning $9.3bn of $13.6bn revenue in fiscal 2026, to June (segment reporting). Process control rises with leading-edge and HBM complexity; the AI share is not stated.' },
        ],
        leadTime: { years: [0.5, 1.5], basis: 'INFERRED', note: 'Test systems are built to order within quarters; deposition and etch tools take longer, and the fabs they go into take two to three years.' },
      },
      {
        id: 'power-cooling', name: 'Data-centre power and cooling', metric: 'rev',
        role: 'Switchgear, UPS, thermal and liquid cooling for the buildings the capex pays for.',
        members: [
          { symbol: 'VRT', exposure: 'core', basis: 'ESTIMATE', share: 0.85, evidence: 'About 85% of 2025 sales to data centres per a company fact sheet as summarised by a third party; the 10-K lists data centres first of three end markets without a percentage.' },
          { symbol: 'ETN', exposure: 'meaningful', basis: 'INFERRED', share: 0.73, evidence: 'Electrical segments were 73% of 2025 revenue (segment reporting); the data-centre share inside them is not in that table.' },
          { symbol: 'NVT', exposure: 'meaningful', basis: 'INFERRED', share: 0.666, evidence: 'Enclosures $2.59bn of $3.89bn revenue in 2025 (segment reporting), which holds its data-centre racks and liquid cooling; the data-centre share is not in that table. Thermal Management was sold in 2025.' },
          { symbol: 'MOD', exposure: 'meaningful', basis: 'INFERRED', evidence: 'Sells data-centre cooling alongside vehicle and building thermal products; the captured segment data stops at fiscal 2018, so the data-centre share is not stated here.' },
          { symbol: 'PWR', exposure: 'meaningful', basis: 'INFERRED', share: 0.807, evidence: 'Electric Power Infrastructure $23.0bn of $28.5bn revenue in 2025 (segment reporting): grid and substation work for utilities and large loads such as data centres, not split.' },
          { symbol: 'GEV', exposure: 'meaningful', basis: 'INFERRED', evidence: 'Gas turbines, grid equipment and wind; the segment data splits only product ($20.9bn) from service ($17.1bn) in 2025. Data-centre power demand is one of several drivers. Spun off from GE in April 2024.' },
        ],
        leadTime: { years: [1, 3], basis: 'INFERRED', note: 'Large transformers and switchgear carry multi-year lead times; Vertiv said in August 2023 its lead times had come down to 30–40 weeks from 50–60 in 2022.' },
        referenceGrowth: 'iea-dc-electricity-2030',
      },
    ],
    edges: [
      { from: 'cloud-capex', to: 'accelerators', lagQuarters: [0, 2], why: 'Chips are the first thing the capex buys.' },
      { from: 'accelerators', to: 'memory', lagQuarters: [1, 4], why: 'Memory is ordered with the accelerator but priced on contracts that reset later.' },
      { from: 'accelerators', to: 'chip-test', lagQuarters: [0, 3], why: 'More and larger chips need more test capacity.' },
      { from: 'memory', to: 'chip-test', lagQuarters: [1, 4], why: 'Memory makers add wafer capacity once prices and margins have risen, and they buy the tools first.' },
      { from: 'cloud-capex', to: 'power-cooling', lagQuarters: [2, 6], why: 'Buildings are powered and cooled as they are completed, after the spending starts.' },
    ],
  },
  {
    id: 'copper-electrification',
    name: 'Copper and electrification',
    kind: 'theme',
    evidenceTheme: 'copper',
    question: 'Is copper a demand story or a supply story — and does the supply side show up in the miners yet?',
    commodity: { symbol: 'HGUSD', label: 'Copper, USD per pound' },
    layers: [
      {
        id: 'grid-equipment', name: 'Grid and electrical equipment', metric: 'rev',
        role: 'Transformers, switchgear and cable — the largest single use of copper after buildings.',
        members: [
          { symbol: 'ETN', exposure: 'high', basis: 'ACTUAL', share: 0.73, evidence: 'Electrical Americas and Electrical Global were 73% of 2025 revenue (segment reporting).' },
        ],
        leadTime: { years: [1, 3], basis: 'INFERRED', note: 'Factory expansions for transformers and switchgear take one to three years.' },
        referenceGrowth: 'iea-dc-electricity-2030',
      },
      {
        id: 'copper-miners', name: 'Copper miners', metric: 'rev',
        role: 'Mined supply: the part of the chain that cannot answer a demand jump quickly.',
        members: [
          { symbol: 'FCX', exposure: 'core', basis: 'ACTUAL', share: 0.745, evidence: 'Copper products were 74.5% of 2025 revenue; gold 15% and molybdenum 8% (revenue by product).' },
          { symbol: 'SCCO', exposure: 'core', basis: 'INFERRED', evidence: 'A copper miner by its own description, with molybdenum, zinc and silver by-products; no product split in the captured data.' },
        ],
        uncaptured: ['BHP', 'Rio Tinto', 'Teck', 'Glencore'],
        leadTime: { years: [10, 17], basis: 'ACTUAL', note: 'Major mines opened 2010–2019 took more than 16 years on average from discovery to first production (IEA Critical Minerals Policy Tracker).' },
        bottleneck: 'World mine output was flat at about 23 Mt from 2024 to 2025 (USGS) while the IEA projects a 25% supply shortfall by 2035 on the current project pipeline.',
        referenceGrowth: 'iea-copper-demand-2030',
      },
    ],
    edges: [
      { from: 'grid-equipment', to: 'copper-miners', lagQuarters: [0, 4], why: 'Equipment makers buy copper as they build; the price moves before the miners can add tonnes.' },
    ],
  },
  {
    id: 'robotics',
    name: 'Industrial robotics',
    kind: 'theme',
    evidenceTheme: 'robotics',
    question: 'Robot installations are rising again — do the listed companies actually earn from it?',
    layers: [
      {
        id: 'automation', name: 'Robots and factory automation', metric: 'rev',
        role: 'Robot arms, mobile robots, motion control and the software that runs them.',
        members: [
          { symbol: 'ROK', exposure: 'high', basis: 'INFERRED', evidence: 'All three segments are industrial automation (segment reporting); robots as such are a small part — it sells the controls around them.' },
          { symbol: 'TER', exposure: 'indirect', basis: 'ACTUAL', share: 0.1, evidence: 'Robotics (Universal Robots, MiR) was about 10% of 2025 revenue and fell 15.5% (10-K). The stock moved on semiconductor test, not robots.' },
        ],
        uncaptured: ['ABB', 'Fanuc', 'Yaskawa', 'MP Materials (magnets)'],
        leadTime: { years: [1, 2], basis: 'INFERRED', note: 'Robot assembly scales within a year or two; reducers and magnets are the slower inputs.' },
        referenceGrowth: 'ifr-installations-2029',
      },
    ],
    edges: [],
  },
  {
    id: 'lithium',
    name: 'Lithium (control: demand grew, the stocks fell)',
    kind: 'control',
    evidenceTheme: 'lithium',
    question: 'Would the engine have warned in time that supply was about to answer?',
    layers: [
      {
        id: 'lithium-producers', name: 'Lithium producers', metric: 'rev',
        role: 'Lithium carbonate and hydroxide for batteries.',
        members: [
          { symbol: 'ALB', exposure: 'core', basis: 'INFERRED', evidence: 'Its Q4 2022 call attributes the near-tripling of sales primarily to the lithium segment; bromine and refining catalysts are the rest of the business.' },
        ],
        uncaptured: ['SQM', 'Arcadium Lithium', 'Pilbara Minerals'],
        leadTime: { years: [2, 16], basis: 'INFERRED', note: 'Expansions of operating assets — the response that flooded 2023–24 — take a few years; new mines more than a decade (IEA).' },
      },
    ],
    edges: [],
  },
  {
    id: 'residential-solar',
    name: 'Residential solar (control: a demand boom that stalled)',
    kind: 'control',
    evidenceTheme: 'solar',
    question: 'Would the inventory tests have caught the 2023 destocking?',
    layers: [
      {
        id: 'inverters', name: 'Residential inverters', metric: 'rev',
        role: 'Microinverters and batteries sold through installers.',
        members: [
          { symbol: 'ENPH', exposure: 'core', basis: 'INFERRED', evidence: 'Microinverters for residential solar are its main product line by its own description.' },
        ],
        leadTime: { years: [0.25, 1], basis: 'INFERRED', note: 'Electronics assembled by contract manufacturers: supply answers within quarters, so shortages do not last.' },
      },
    ],
    edges: [],
  },
];

export const CHAIN_BY_ID: Record<string, Chain> = Object.fromEntries(CHAINS.map((c) => [c.id, c]));

/** Every symbol any chain names. */
export function chainSymbols(chains: Chain[] = CHAINS): string[] {
  return [...new Set(chains.flatMap((c) => c.layers.flatMap((l) => l.members.map((m) => m.symbol))))];
}
