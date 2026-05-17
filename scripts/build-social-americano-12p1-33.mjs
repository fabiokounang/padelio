/**
 * Finds 33 doubles rounds on 12 players (1 court) such that each unordered pair
 * is teammates exactly once globally and opponents at least once.
 * Partner edges: 66 = 33*2 ✓ ; oppose edges need ≥66, capacity 33*4=132 ✓
 *
 * Run: node scripts/build-social-americano-12p1-33.mjs
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const N = 12;
const R = 33;

const pairKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

function comb4(n) {
  const out = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) out.push([a, b, c, d]);
  return out;
}

/** Three classic padel splits on sorted quartet [w<x<y<z] */
function splitQuad(q, s) {
  const [w, x, y, z] = q;
  switch (s) {
    case 0:
      return {
        team1: [w, x],
        team2: [y, z]
      };
    case 1:
      return {
        team1: [w, y],
        team2: [x, z]
      };
    case 2:
      return {
        team1: [w, z],
        team2: [x, y]
      };
    default:
      throw new Error('bad split');
  }
}

const QUADS = comb4(N);

/** Try random greedy with restarts until full coverage */
function tryBuild(seed) {
  let rng = seed;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0xffffffff;
  };

  const rounds = [];

  /** bitset-ish: forbid double partner pairing */
  const partnerUsed = new Set();
  /** count how often pair opposed (want >=1 for all); allow multi */
  const opposeCount = new Map();

  for (let r = 0; r < R; r++) {
    let localBest = null;
    let localScore = -1e9;

    const reps = QUADS.length;
    const order = Array.from({ length: reps }, (_, i) => i);
    for (let ii = reps - 1; ii > 0; ii--) {
      const jj = Math.floor(rand() * (ii + 1));
      [order[ii], order[jj]] = [order[jj], order[ii]];
    }

    for (const qi of order) {
      const q = QUADS[qi];
      for (let s = 0; s < 3; s++) {
        const { team1, team2 } = splitQuad(q, s);
        const p1 = pairKey(team1[0], team1[1]);
        const p2 = pairKey(team2[0], team2[1]);
        if (partnerUsed.has(p1) || partnerUsed.has(p2)) continue;

        const cross = [];
        for (const a of team1) for (const b of team2) cross.push(pairKey(a, b));

        /** score: maximise new oppose-zero pairs; tertiary random */
        let gain = 0;
        let bonusRare = 0;
        for (const pk of cross) {
          const c = opposeCount.get(pk) || 0;
          if (c === 0) gain += 120;
          else if (c === 1) bonusRare += 2;
        }
        gain += bonusRare;

        gain += rand() * 0.001;

        if (gain > localScore) {
          localScore = gain;
          localBest = {
            quad: [...q],
            split: s,
            team1: [...team1],
            team2: [...team2],
            pk1: p1,
            pk2: p2,
            cross
          };
        }
      }
    }

    if (!localBest) return null;

    partnerUsed.add(localBest.pk1);
    partnerUsed.add(localBest.pk2);
    for (const pk of localBest.cross)
      opposeCount.set(pk, (opposeCount.get(pk) || 0) + 1);

    rounds.push({
      quad: localBest.quad,
      split: localBest.split
    });
  }

  /** Validate all 66 oppose >=1 */
  let ok = partnerUsed.size === 66;
  if (!ok) return null;

  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const pk = pairKey(i, j);
      const o = opposeCount.get(pk) || 0;
      if (o < 1) {
        ok = false;
        break;
      }
    }

  return ok ? rounds : null;
}

for (let attempt = 1; attempt <= 500000; attempt++) {
  const s = attempt * 2654435761 + 42;
  const run = tryBuild(s >>> 0);
  if (run) {
    const outPath = join(__dirname, '..', 'js', 'normal-social-schedule-12p1.json');
    fs.writeFileSync(outPath, JSON.stringify(run, null, 2));

    console.log(`OK seed chain start ${s} attempts ${attempt}`);
    console.log(`Wrote ${run.length} rounds -> ${outPath}`);
    process.exit(0);
  }
  if (attempt % 20000 === 0) console.error('still searching…', attempt);
}

console.error('FAILED increase search');
process.exit(1);
