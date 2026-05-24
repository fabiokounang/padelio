/**
 * Comprehensive verifier for the Swiss-system Mexicano implementation in js/pairing.js
 * (which mirrors js/script.js logic for Node-based testing).
 *
 * Validates:
 *  - Court assignment follows global standings (top players -> court 1 for R2+)
 *  - Bench rotation is fair (max-min plays <= 1 across all players)
 *  - Players who sat last round must play this round (when capacity allows)
 *  - Fixed pairs stay fixed (Fixed Mexicano)
 *  - Mix Mexicano respects equal M/F per court
 *  - No malformed matches (every match has 2 valid teams of 2 players)
 *
 * Scenarios A..J cover Normal Mexicano (1-3 courts, 4-16 players), Mix Mexicano (1-2 courts),
 * and Fixed Mexicano (1-2 courts).
 *
 * Run:  node scripts/verify-mexicano-swiss.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../js/pairing.js');

/* ---------------------- helpers ---------------------- */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const mkPlayer = (name, gender = null, level = 5) => ({ name, gender, level });

const buildTournamentLike = (playersFull, mode, courts, mexScoreKind = 'rally') => ({
  mode,
  courts,
  mexScoreKind,
  players: JSON.stringify(playersFull),
  rounds: JSON.stringify([])
});

/** Inject a deterministic "score" for a finished round so the leaderboard moves. */
const scoreRoundDeterministic = (round, scenarioName) => {
  // Use scenario name + round number as a seed so behavior is reproducible.
  let seed = round.round * 1000;
  for (const ch of scenarioName) seed = (seed + ch.charCodeAt(0)) | 0;
  (round.matches || []).forEach((m, idx) => {
    // simple pseudo-random based on seed and court index
    const a = ((seed + idx * 37) % 17 + 1); // 1..17
    const b = ((seed * 7 + idx * 11) % 17 + 1);
    if (a === b) {
      m.score1 = String(a);
      m.score2 = String(b - 1 < 1 ? b + 1 : b - 1);
    } else {
      m.score1 = String(a);
      m.score2 = String(b);
    }
  });
};

const computePlayCounts = (rounds, allNames) => {
  const counts = new Map();
  allNames.forEach((n) => counts.set(n, 0));
  rounds.forEach((r) => {
    (r.matches || []).forEach((m) => {
      for (const n of [...(m.team1 || []), ...(m.team2 || [])]) {
        counts.set(n, (counts.get(n) || 0) + 1);
      }
    });
  });
  return counts;
};

const computeBenchCounts = (rounds, allNames) => {
  const benched = new Map();
  allNames.forEach((n) => benched.set(n, 0));
  rounds.forEach((r) => {
    const onCourt = new Set();
    (r.matches || []).forEach((m) => {
      for (const n of [...(m.team1 || []), ...(m.team2 || [])]) onCourt.add(n);
    });
    allNames.forEach((n) => {
      if (!onCourt.has(n)) benched.set(n, (benched.get(n) || 0) + 1);
    });
  });
  return benched;
};

const onCourtThisRound = (round) => {
  const s = new Set();
  (round.matches || []).forEach((m) => {
    for (const n of [...(m.team1 || []), ...(m.team2 || [])]) s.add(n);
  });
  return s;
};

/**
 * Replicate `computeLeaderboardSorted` from scoring.js with sort = 'points'.
 * Order: points desc, diff desc, wins desc, winRate desc, name asc (locale).
 */
const expectedSwissOrder = (allNames, prevRounds) => {
  const stats = new Map();
  allNames.forEach((n) =>
    stats.set(n, { name: n, points: 0, conceded: 0, wins: 0, losses: 0, ties: 0, matches: 0 })
  );
  prevRounds.forEach((r) => {
    (r.matches || []).forEach((m) => {
      const s1raw = m.score1;
      const s2raw = m.score2;
      const hasScore = (s1raw !== '' && s1raw != null) || (s2raw !== '' && s2raw != null);
      if (!hasScore) return;
      const s1 = Number(s1raw) || 0;
      const s2 = Number(s2raw) || 0;
      if (s1 === 0 && s2 === 0) return;
      (m.team1 || []).forEach((n) => {
        const r = stats.get(n); if (!r) return;
        r.points += s1; r.conceded += s2; r.matches++;
        if (s1 > s2) r.wins++; else if (s2 > s1) r.losses++; else r.ties++;
      });
      (m.team2 || []).forEach((n) => {
        const r = stats.get(n); if (!r) return;
        r.points += s2; r.conceded += s1; r.matches++;
        if (s2 > s1) r.wins++; else if (s1 > s2) r.losses++; else r.ties++;
      });
    });
  });
  const rows = [...stats.values()].map((r) => ({
    ...r,
    winRate: r.matches > 0 ? (r.wins / r.matches) * 100 : 0,
    diff: r.points - r.conceded
  }));
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.diff !== a.diff) return b.diff - a.diff;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return String(a.name).localeCompare(String(b.name));
  });
  return rows.map((r) => r.name);
};

/* ---------------------- assertions ---------------------- */

let totalChecks = 0;
let totalFailures = 0;
const failures = [];

const check = (cond, msg, ctx) => {
  totalChecks++;
  if (!cond) {
    totalFailures++;
    failures.push(`  ✗ ${msg}` + (ctx ? `\n      ${ctx}` : ''));
  }
};

const assertWellFormedMatches = (matches, scenario, roundNo) => {
  matches.forEach((m, i) => {
    check(
      Array.isArray(m.team1) && m.team1.length === 2,
      `${scenario} R${roundNo} court ${i + 1}: team1 must be length 2`,
      `got ${JSON.stringify(m.team1)}`
    );
    check(
      Array.isArray(m.team2) && m.team2.length === 2,
      `${scenario} R${roundNo} court ${i + 1}: team2 must be length 2`,
      `got ${JSON.stringify(m.team2)}`
    );
    const all = [...(m.team1 || []), ...(m.team2 || [])];
    const uniq = new Set(all);
    check(
      uniq.size === all.length,
      `${scenario} R${roundNo} court ${i + 1}: duplicate player in match`,
      `players: ${all.join(', ')}`
    );
  });
};

const assertNoCrossCourtDuplicates = (matches, scenario, roundNo) => {
  const seen = new Set();
  matches.forEach((m, i) => {
    for (const n of [...(m.team1 || []), ...(m.team2 || [])]) {
      check(
        !seen.has(n),
        `${scenario} R${roundNo}: ${n} appears on multiple courts`,
        `court ${i + 1}`
      );
      seen.add(n);
    }
  });
};

const assertSwissCourtOrdering = (matches, expectedOrder, scenario, roundNo) => {
  // For R2+: court c should hold expectedOrder[(c-1)*4 .. (c-1)*4+3]
  // We're lenient: each court's quad just needs to be a subset of the expected top (c*4) players.
  const slotsUsed = matches.length * 4;
  const expectedTopSet = new Set(expectedOrder.slice(0, slotsUsed));
  matches.forEach((m, i) => {
    const quad = new Set([...(m.team1 || []), ...(m.team2 || [])]);
    const expectedQuad = new Set(expectedOrder.slice(i * 4, (i + 1) * 4));
    // Loose check: all 4 players on this court are among the top-(i+1)*4 standings positions
    const expectedThruThis = new Set(expectedOrder.slice(0, (i + 1) * 4));
    for (const n of quad) {
      check(
        expectedTopSet.has(n),
        `${scenario} R${roundNo} court ${i + 1}: ${n} not in expected top ${slotsUsed} players`,
        `expected top: ${[...expectedTopSet].join(', ')}`
      );
    }
    // Stronger: the four players on this court should form exactly the next 4 in standings order
    if (expectedQuad.size === 4 && quad.size === 4) {
      const matchSet = [...quad].every((n) => expectedQuad.has(n));
      check(
        matchSet,
        `${scenario} R${roundNo} court ${i + 1}: quad doesn't match Swiss ranking slot`,
        `got [${[...quad].join(', ')}], expected [${[...expectedQuad].join(', ')}]`
      );
    }
    // expectedThruThis suppression to keep linter happy (used by intent for human review)
    void expectedThruThis;
  });
};

const assertSwissPairOrdering = (matches, orderedExpectedKeys, scenario, roundNo) => {
  // For Fixed Mexicano R2+: court c has pair at rank (c-1)*2 vs (c-1)*2+1
  matches.forEach((m, i) => {
    const k1 = [m.team1[0], m.team1[1]].sort().join('+');
    const k2 = [m.team2[0], m.team2[1]].sort().join('+');
    const expK1 = orderedExpectedKeys[i * 2];
    const expK2 = orderedExpectedKeys[i * 2 + 1];
    const got = new Set([k1, k2]);
    const exp = new Set([expK1, expK2]);
    const same =
      got.size === 2 &&
      [...got].every((x) => exp.has(x));
    check(
      same,
      `${scenario} R${roundNo} court ${i + 1}: fixed pair court doesn't match Swiss pair order`,
      `got {${k1}, ${k2}}, expected {${expK1}, ${expK2}}`
    );
  });
};

const assertBenchFairness = (rounds, allNames, scenario) => {
  const benched = computeBenchCounts(rounds, allNames);
  const counts = [...benched.values()];
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  check(
    max - min <= 1,
    `${scenario}: bench rotation unfair (max=${max}, min=${min})`,
    `bench counts: ${JSON.stringify(Object.fromEntries(benched))}`
  );
};

const assertPlayCountFairness = (rounds, allNames, scenario) => {
  const counts = computePlayCounts(rounds, allNames);
  const arr = [...counts.values()];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  check(
    max - min <= 1,
    `${scenario}: play count unfair (max=${max}, min=${min})`,
    `play counts: ${JSON.stringify(Object.fromEntries(counts))}`
  );
};

const assertBenchedLastRoundPlays = (rounds, allNames, scenario) => {
  // Walk through rounds: anyone who was benched in round k must be on court in round k+1.
  for (let i = 0; i + 1 < rounds.length; i++) {
    const benched = new Set();
    const onLast = onCourtThisRound(rounds[i]);
    allNames.forEach((n) => {
      if (!onLast.has(n)) benched.add(n);
    });
    if (benched.size === 0) continue;
    const onNext = onCourtThisRound(rounds[i + 1]);
    // Only enforce if next round has enough capacity (n bench <= slots).
    const slots = (rounds[i + 1].matches || []).length * 4;
    if (benched.size <= slots) {
      benched.forEach((n) => {
        check(
          onNext.has(n),
          `${scenario}: ${n} was benched R${rounds[i].round} but not playing R${rounds[i + 1].round}`,
          `bench last: ${[...benched].join(', ')}; on court next: ${[...onNext].join(', ')}`
        );
      });
    }
  }
};

const assertFixedPartnersIntact = (rounds, allPairKeys, scenario) => {
  // Each match's team1 and team2 must be one of the allowed pair keys (sorted).
  rounds.forEach((r) => {
    (r.matches || []).forEach((m, i) => {
      const k1 = [m.team1[0], m.team1[1]].sort().join('+');
      const k2 = [m.team2[0], m.team2[1]].sort().join('+');
      check(
        allPairKeys.has(k1),
        `${scenario} R${r.round} court ${i + 1}: team1 not a fixed pair`,
        `got ${k1}`
      );
      check(
        allPairKeys.has(k2),
        `${scenario} R${r.round} court ${i + 1}: team2 not a fixed pair`,
        `got ${k2}`
      );
    });
  });
};

const assertMixGenderShape = (matches, malesSet, femalesSet, scenario, roundNo) => {
  matches.forEach((m, i) => {
    const t1 = m.team1 || [];
    const t2 = m.team2 || [];
    const t1HasM = t1.some((n) => malesSet.has(n));
    const t1HasF = t1.some((n) => femalesSet.has(n));
    const t2HasM = t2.some((n) => malesSet.has(n));
    const t2HasF = t2.some((n) => femalesSet.has(n));
    check(
      t1HasM && t1HasF,
      `${scenario} R${roundNo} court ${i + 1}: team1 must be 1M+1F`,
      `t1 = ${t1.join(', ')}`
    );
    check(
      t2HasM && t2HasF,
      `${scenario} R${roundNo} court ${i + 1}: team2 must be 1M+1F`,
      `t2 = ${t2.join(', ')}`
    );
  });
};

/* ---------------------- scenario runner ---------------------- */

const runScenario = (name, opts) => {
  const {
    playersFull, mode, courts, roundsToSimulate,
    expectFixed = false, expectMix = false
  } = opts;
  const rosterNames = playersFull.map((p) => p.name);
  const tournament = buildTournamentLike(playersFull, mode, courts);
  const rounds = [];

  // Capture maxCourts from mode
  let maxCourts;
  if (mode === 'mixmex') {
    const malesN = playersFull.filter((p) => p.gender === 'M').length;
    const femN = playersFull.filter((p) => p.gender === 'F').length;
    maxCourts = Math.min(courts, Math.floor(malesN / 2), Math.floor(femN / 2));
  } else if (mode === 'fixedmex') {
    maxCourts = Math.min(courts, Math.floor(playersFull.length / 4));
    // fixed pairs count = floor(playersFull.length / 2)
    const numPairs = Math.floor(playersFull.length / 2);
    maxCourts = Math.min(courts, Math.floor(numPairs / 2));
  } else {
    maxCourts = Math.min(courts, Math.floor(rosterNames.length / 4));
  }

  const allPairObjs = [];
  if (mode === 'fixedmex' || expectFixed) {
    for (let i = 0; i + 1 < playersFull.length; i += 2) {
      allPairObjs.push({ m: playersFull[i].name, f: playersFull[i + 1].name });
    }
  }
  const allPairKeys = new Set(
    allPairObjs.map((p) => [p.m, p.f].sort().join('+'))
  );

  const malesSet = new Set(playersFull.filter((p) => p.gender === 'M').map((p) => p.name));
  const femalesSet = new Set(playersFull.filter((p) => p.gender === 'F').map((p) => p.name));

  for (let rn = 1; rn <= roundsToSimulate; rn++) {
    // Update tournament rounds snapshot
    tournament.rounds = JSON.stringify(rounds);

    let matches;
    if (mode === 'mexicano') {
      matches = P.buildMexicanoMatches(rosterNames, courts, rounds, rn, tournament, playersFull);
    } else if (mode === 'mixmex') {
      matches = P.buildMixMexicanoMatches(playersFull, courts, rounds, rn, tournament);
    } else if (mode === 'fixedmex') {
      matches = P.buildFixedPairsMexicanoMatches(allPairObjs, courts, rounds, rn, tournament);
    } else {
      throw new Error(`unsupported mode ${mode}`);
    }

    assertWellFormedMatches(matches, name, rn);
    assertNoCrossCourtDuplicates(matches, name, rn);
    check(
      matches.length === maxCourts,
      `${name} R${rn}: expected ${maxCourts} courts, got ${matches.length}`
    );

    if (expectMix) {
      assertMixGenderShape(matches, malesSet, femalesSet, name, rn);
    }

    if (rn >= 2) {
      if (mode === 'fixedmex') {
        // Active pairs are determined by bench rotation BEFORE Swiss ordering. So we extract them
        // from the matches we just got, and verify ONLY that those active pairs are sorted by team
        // points across courts in the Swiss order (top pair on court 1, etc.).
        const ptsReal = new Map();
        rosterNames.forEach((n) => ptsReal.set(n, 0));
        rounds.forEach((r) => {
          (r.matches || []).forEach((m) => {
            const s1raw = m.score1, s2raw = m.score2;
            const hasScore = (s1raw !== '' && s1raw != null) || (s2raw !== '' && s2raw != null);
            if (!hasScore) return;
            const s1 = Number(s1raw) || 0;
            const s2 = Number(s2raw) || 0;
            if (s1 === 0 && s2 === 0) return;
            (m.team1 || []).forEach((n) => ptsReal.set(n, (ptsReal.get(n) || 0) + s1));
            (m.team2 || []).forEach((n) => ptsReal.set(n, (ptsReal.get(n) || 0) + s2));
          });
        });
        const rosterIdx = new Map(rosterNames.map((n, i) => [n, i]));
        // Extract active pairs from current matches
        const activePairs = [];
        matches.forEach((m) => {
          activePairs.push({ key: [m.team1[0], m.team1[1]].sort().join('+'), m: m.team1[0], f: m.team1[1] });
          activePairs.push({ key: [m.team2[0], m.team2[1]].sort().join('+'), m: m.team2[0], f: m.team2[1] });
        });
        // Sort active pairs by team points (matching algorithm's sort)
        const sortedKeys = [...activePairs]
          .sort((a, b) => {
            const ta = (ptsReal.get(a.m) || 0) + (ptsReal.get(a.f) || 0);
            const tb = (ptsReal.get(b.m) || 0) + (ptsReal.get(b.f) || 0);
            if (ta !== tb) return tb - ta;
            return (rosterIdx.get(a.m) ?? 0) - (rosterIdx.get(b.m) ?? 0);
          })
          .map((p) => p.key);
        assertSwissPairOrdering(matches, sortedKeys, name, rn);
      } else if (mode === 'mexicano') {
        // Active players are determined by bench rotation BEFORE Swiss ordering. Extract them
        // from the matches and verify they're partitioned by standings position into courts.
        const order = expectedSwissOrder(rosterNames, rounds);
        const onCourtSet = onCourtThisRound({ matches });
        const orderFilteredToActive = order.filter((n) => onCourtSet.has(n));
        const flat = matches.flatMap((m) => [...(m.team1 || []), ...(m.team2 || [])]);
        for (let c = 0; c < matches.length; c++) {
          const got = new Set(flat.slice(c * 4, c * 4 + 4));
          const exp = new Set(orderFilteredToActive.slice(c * 4, c * 4 + 4));
          const ok = exp.size === 4 && [...got].every((n) => exp.has(n));
          check(
            ok,
            `${name} R${rn} court ${c + 1}: quad doesn't match standings slot`,
            `got [${[...got].join(', ')}], expected [${[...exp].join(', ')}]`
          );
        }
      } else if (mode === 'mixmex') {
        // Active males and females come from bench rotation. Extract them from matches and verify
        // they're partitioned by per-gender standings into courts.
        const orderAll = expectedSwissOrder(rosterNames, rounds);
        const orderMales = orderAll.filter((n) => malesSet.has(n));
        const orderFemales = orderAll.filter((n) => femalesSet.has(n));
        const flatM = matches.flatMap((m) => (m.team1 || []).concat(m.team2 || []).filter((n) => malesSet.has(n)));
        const flatF = matches.flatMap((m) => (m.team1 || []).concat(m.team2 || []).filter((n) => femalesSet.has(n)));
        const malesPlaying = new Set(flatM);
        const femalesPlaying = new Set(flatF);
        const malesPlayingOrdered = orderMales.filter((n) => malesPlaying.has(n));
        const femalesPlayingOrdered = orderFemales.filter((n) => femalesPlaying.has(n));
        for (let c = 0; c < matches.length; c++) {
          const courtMales = (matches[c].team1 || []).concat(matches[c].team2 || []).filter((n) => malesSet.has(n));
          const courtFemales = (matches[c].team1 || []).concat(matches[c].team2 || []).filter((n) => femalesSet.has(n));
          const expMales = new Set(malesPlayingOrdered.slice(c * 2, c * 2 + 2));
          const expFemales = new Set(femalesPlayingOrdered.slice(c * 2, c * 2 + 2));
          const okM = expMales.size === 2 && courtMales.every((n) => expMales.has(n));
          const okF = expFemales.size === 2 && courtFemales.every((n) => expFemales.has(n));
          check(
            okM,
            `${name} R${rn} court ${c + 1}: male quad-slot mismatch`,
            `got [${courtMales.join(', ')}], expected [${[...expMales].join(', ')}]`
          );
          check(
            okF,
            `${name} R${rn} court ${c + 1}: female quad-slot mismatch`,
            `got [${courtFemales.join(', ')}], expected [${[...expFemales].join(', ')}]`
          );
        }
      }
    }

    const roundData = { round: rn, matches };
    scoreRoundDeterministic(roundData, name);
    rounds.push(roundData);
  }

  if (mode === 'fixedmex') {
    assertFixedPartnersIntact(rounds, allPairKeys, name);
  }

  // Bench / play fairness checks
  if (mode === 'mexicano' || mode === 'mixmex') {
    assertBenchedLastRoundPlays(rounds, rosterNames, name);
    // Bench rotation fairness only valid when total slots < total roster
    const slotsPerRound = maxCourts * 4;
    if (slotsPerRound < rosterNames.length) {
      assertBenchFairness(rounds, rosterNames, name);
      assertPlayCountFairness(rounds, rosterNames, name);
    }
  }
};

/* ---------------------- scenarios ---------------------- */

const mkRoster = (n) => Array.from({ length: n }, (_, i) => mkPlayer(ALPHABET[i]));

const mkMixRoster = (males, females) => {
  const list = [];
  for (let i = 0; i < males; i++) list.push(mkPlayer(`M${i + 1}`, 'M'));
  for (let i = 0; i < females; i++) list.push(mkPlayer(`F${i + 1}`, 'F'));
  return list;
};

const SCENARIOS = [
  // Mexicano (Normal)
  { name: 'A: Mexicano 1 court, 5 players (1 bench)', mode: 'mexicano', courts: 1, players: mkRoster(5), rounds: 8 },
  { name: 'B: Mexicano 1 court, 4 players (no bench)', mode: 'mexicano', courts: 1, players: mkRoster(4), rounds: 6 },
  { name: 'C: Mexicano 2 courts, 8 players (no bench)', mode: 'mexicano', courts: 2, players: mkRoster(8), rounds: 6 },
  { name: 'D: Mexicano 2 courts, 10 players (2 bench)', mode: 'mexicano', courts: 2, players: mkRoster(10), rounds: 8 },
  { name: 'E: Mexicano 3 courts, 12 players (no bench)', mode: 'mexicano', courts: 3, players: mkRoster(12), rounds: 6 },
  { name: 'F: Mexicano 3 courts, 16 players (4 bench)', mode: 'mexicano', courts: 3, players: mkRoster(16), rounds: 8 },

  // Mix Mexicano
  { name: 'G: MixMex 2 courts, 4M+4F (no bench)', mode: 'mixmex', courts: 2, players: mkMixRoster(4, 4), rounds: 6, expectMix: true },
  { name: 'H: MixMex 1 court, 3M+3F (1M+1F bench)', mode: 'mixmex', courts: 1, players: mkMixRoster(3, 3), rounds: 8, expectMix: true },

  // Fixed Mexicano
  { name: 'I: FixedMex 2 courts, 8 players / 4 pairs (no bench)', mode: 'fixedmex', courts: 2, players: mkRoster(8), rounds: 6, expectFixed: true },
  { name: 'J: FixedMex 1 court, 6 players / 3 pairs (1 pair bench)', mode: 'fixedmex', courts: 1, players: mkRoster(6), rounds: 7, expectFixed: true },

  // Extra edge cases
  { name: 'K: Mexicano 1 court, 12 players (8 bench)', mode: 'mexicano', courts: 1, players: mkRoster(12), rounds: 12 },
  { name: 'L: Mexicano 2 courts, 7 players (courts capped to 1)', mode: 'mexicano', courts: 2, players: mkRoster(7), rounds: 8 },
  { name: 'M: Mexicano 4 courts, 20 players (4 bench)', mode: 'mexicano', courts: 4, players: mkRoster(20), rounds: 8 },
  { name: 'N: MixMex 2 courts, 5M+5F (1M+1F bench)', mode: 'mixmex', courts: 2, players: mkMixRoster(5, 5), rounds: 8, expectMix: true },
  { name: 'O: MixMex 3 courts, 6M+6F (no bench)', mode: 'mixmex', courts: 3, players: mkMixRoster(6, 6), rounds: 6, expectMix: true },
  { name: 'P: FixedMex 3 courts, 12 players / 6 pairs (no bench)', mode: 'fixedmex', courts: 3, players: mkRoster(12), rounds: 6, expectFixed: true },
  { name: 'Q: FixedMex 2 courts, 10 players / 5 pairs (1 pair bench)', mode: 'fixedmex', courts: 2, players: mkRoster(10), rounds: 8, expectFixed: true }
];

/* ---------------------- main ---------------------- */

console.log('=== Mexicano Swiss-system verifier ===\n');
for (const s of SCENARIOS) {
  const before = totalFailures;
  runScenario(s.name, {
    playersFull: s.players,
    mode: s.mode,
    courts: s.courts,
    roundsToSimulate: s.rounds,
    expectFixed: s.expectFixed,
    expectMix: s.expectMix
  });
  const delta = totalFailures - before;
  if (delta === 0) console.log(`  PASS  ${s.name}`);
  else console.log(`  FAIL  ${s.name}  (${delta} failures)`);
}

console.log('');
console.log(`Total checks: ${totalChecks}`);
console.log(`Failures:     ${totalFailures}`);
if (failures.length > 0) {
  console.log('\nFailure details:');
  failures.forEach((f) => console.log(f));
  process.exit(1);
}
console.log('\nAll scenarios passed.');
process.exit(0);
