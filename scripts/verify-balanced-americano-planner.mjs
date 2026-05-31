/**
 * Balanced Americano verification: fairness + power-level stats.
 * Run: node scripts/verify-balanced-americano-planner.mjs
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { planAmericanoRound } = require(join(__dirname, '../js/americano-round-planner.js'));
const { pickActivePlayersNormal } = require(join(__dirname, '../js/pairing.js'));
const { buildFairnessReport, computeRoundCapacity } = require(
  join(__dirname, '../js/normal-americano-planner.js')
);

const cases = [
  { n: 12, c: 2, r: 6 },
  { n: 15, c: 3, r: 5 },
  { n: 16, c: 4, r: 5 },
  { n: 20, c: 4, r: 5 }
];

function getLevel (lvl, p) {
  return Number(lvl[p]) || 3;
}

function levelStats (rounds, lvl) {
  const gaps = [];
  let teamDiffMax = 0;
  let allSameQuads = 0;
  let matches = 0;
  for (const rd of rounds) {
    for (const m of rd.matches || []) {
      matches++;
      gaps.push(Math.abs(getLevel(lvl, m.team1[0]) - getLevel(lvl, m.team1[1])));
      gaps.push(Math.abs(getLevel(lvl, m.team2[0]) - getLevel(lvl, m.team2[1])));
      const d = Math.abs(
        getLevel(lvl, m.team1[0]) + getLevel(lvl, m.team1[1]) -
        (getLevel(lvl, m.team2[0]) + getLevel(lvl, m.team2[1]))
      );
      if (d > teamDiffMax) teamDiffMax = d;
      const four = [...m.team1, ...m.team2].map((p) => getLevel(lvl, p));
      if (Math.max(...four) - Math.min(...four) === 0) allSameQuads++;
    }
  }
  const sum = gaps.reduce((a, b) => a + b, 0);
  return {
    matches,
    maxPg: gaps.length ? Math.max(...gaps) : 0,
    avgPg: gaps.length ? sum / gaps.length : 0,
    teamDiffMax,
    allSameQuads
  };
}

let failures = 0;

for (const { n, c, r } of cases) {
  const players = Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const lvl = Object.fromEntries(players.map((p, i) => [p, 1 + (i % 5)]));
  const prior = [];
  const usedCourts = Math.min(c, Math.floor(n / 4));

  for (let rn = 1; rn <= r; rn++) {
    const active = pickActivePlayersNormal(players, usedCourts * 4, prior, rn);
    const out = planAmericanoRound({
      players,
      courtCount: usedCourts,
      priorRounds: prior,
      roundNo: rn,
      levelByName: lvl,
      opts: { fixedActiveNames: active }
    });
    if (out.error || out.matches.length !== usedCourts) {
      console.error(`FAIL ${n}p/${c}c/${r}r round ${rn}: ${out.error || 'match count'}`);
      failures++;
      break;
    }
    prior.push({ round: rn, matches: out.matches });
  }

  const rep = buildFairnessReport(players, prior, c);
  const ls = levelStats(prior, lvl);
  const ok =
    rep.gamesPlayedDifference <= 1 &&
    rep.byeDifference <= 1 &&
    ls.teamDiffMax <= 2 &&
    ls.avgPg <= 2.75;
  const status = ok ? 'OK  ' : 'WARN';
  if (!ok) failures++;

  console.log(
    `[${status}] n=${String(n).padStart(2)} c=${c} r=${r} ` +
    `gDiff=${rep.gamesPlayedDifference} bDiff=${rep.byeDifference} ` +
    `Pdup=${rep.partnerRepeatPairs} Mmin/max=${rep.minUniqueMeetings}/${rep.maxUniqueMeetings} ` +
    `Pgavg=${ls.avgPg.toFixed(2)} Pgmax=${ls.maxPg} Tdiff=${ls.teamDiffMax} ` +
    `sameLvlQuads=${ls.allSameQuads}/${ls.matches} ` +
    `score=${rep.fairnessScore} ${rep.rating}`
  );
}

console.log(`\nFailures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
