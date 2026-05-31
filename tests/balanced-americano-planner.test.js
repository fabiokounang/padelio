/* =========================
   tests/balanced-americano-planner.test.js
   Balanced Americano: fairness + power-level pairing (planAmericanoRound).
   Run: node tests/balanced-americano-planner.test.js
   ========================= */
'use strict';

const assert = require('assert');
const {
  planAmericanoRound,
  buildSessionStats
} = require('../js/americano-round-planner.js');
const { pickActivePlayersNormal } = require('../js/pairing.js');
const {
  buildFairnessReport,
  computeRoundCapacity,
  pairKey
} = require('../js/normal-americano-planner.js');

let passed = 0;
let failed = 0;

function test (name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function makeSeededRandom (seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function withSeededRandom (seed, fn) {
  const rng = makeSeededRandom(seed);
  const orig = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function levelMapFromObject (obj) {
  return new Map(Object.entries(obj));
}

function getLevel (levelByName, name) {
  if (levelByName instanceof Map) {
    return levelByName.has(name) ? Number(levelByName.get(name)) : 3;
  }
  return Number(levelByName[name]) || 3;
}

function partnerLevelGap (team, levelByName) {
  return Math.abs(getLevel(levelByName, team[0]) - getLevel(levelByName, team[1]));
}

function teamLevelSum (team, levelByName) {
  return getLevel(levelByName, team[0]) + getLevel(levelByName, team[1]);
}

function collectLevelStats (rounds, levelByName) {
  const partnerGaps = [];
  let teamSumDiffMax = 0;
  let allSameLevelQuads = 0;
  let matchCount = 0;

  for (const round of rounds) {
    for (const m of round.matches || []) {
      matchCount++;
      partnerGaps.push(partnerLevelGap(m.team1, levelByName));
      partnerGaps.push(partnerLevelGap(m.team2, levelByName));
      const diff = Math.abs(
        teamLevelSum(m.team1, levelByName) - teamLevelSum(m.team2, levelByName)
      );
      if (diff > teamSumDiffMax) teamSumDiffMax = diff;
      const four = [...m.team1, ...m.team2].map((p) => getLevel(levelByName, p));
      const lo = Math.min(...four);
      const hi = Math.max(...four);
      if (hi - lo === 0) allSameLevelQuads++;
    }
  }

  const sum = partnerGaps.reduce((a, b) => a + b, 0);
  return {
    matchCount,
    maxPartnerGap: partnerGaps.length ? Math.max(...partnerGaps) : 0,
    avgPartnerGap: partnerGaps.length ? sum / partnerGaps.length : 0,
    teamSumDiffMax,
    allSameLevelQuads
  };
}

/** Mirrors production balanced flow in script.js */
function simulateBalanced (players, courts, rounds, levelByName, seed) {
  return withSeededRandom(seed, () => {
    const priorRounds = [];
    const usedCourts = Math.min(courts, Math.floor(players.length / 4));
    const slots = usedCourts * 4;
    const lvl =
      levelByName instanceof Map
        ? Object.fromEntries(levelByName)
        : { ...levelByName };

    for (let r = 1; r <= rounds; r++) {
      const active = pickActivePlayersNormal(players, slots, priorRounds, r);
      const out = planAmericanoRound({
        players,
        courtCount: usedCourts,
        priorRounds,
        roundNo: r,
        levelByName: lvl,
        opts: { fixedActiveNames: active }
      });
      if (out.error) {
        throw new Error(`Round ${r} failed: ${out.error}`);
      }
      assert.strictEqual(
        out.matches.length,
        usedCourts,
        `round ${r}: expected ${usedCourts} matches`
      );
      priorRounds.push({ round: r, matches: out.matches });
    }
    return priorRounds;
  });
}

function summarize (players, allRounds) {
  const games = new Map(players.map((p) => [p, 0]));
  const byes = new Map(players.map((p) => [p, 0]));
  const partnerCount = new Map();

  for (const round of allRounds) {
    const byeSet = new Set(players);
    for (const m of round.matches) {
      const [a1, a2] = m.team1;
      const [b1, b2] = m.team2;
      [a1, a2, b1, b2].forEach((n) => {
        games.set(n, games.get(n) + 1);
        byeSet.delete(n);
      });
      const k1 = pairKey(a1, a2);
      const k2 = pairKey(b1, b2);
      partnerCount.set(k1, (partnerCount.get(k1) || 0) + 1);
      partnerCount.set(k2, (partnerCount.get(k2) || 0) + 1);
    }
    byeSet.forEach((n) => byes.set(n, byes.get(n) + 1));
  }

  const gArr = [...games.values()];
  const bArr = [...byes.values()];
  return {
    gamesPlayedDiff: Math.max(...gArr) - Math.min(...gArr),
    byeDiff: Math.max(...bArr) - Math.min(...bArr),
    partnerCount
  };
}

/* ---- Level pairing (single round) ---- */
console.log('\nPower-level pairing');

test('empty history: 1+1 vs 5+5 → equal team level sums (fair sides)', () => {
  const lvl = levelMapFromObject({ Ann: 1, Ben: 1, Cia: 5, Dan: 5 });
  const out = planAmericanoRound({
    players: ['Ann', 'Ben', 'Cia', 'Dan'],
    courtCount: 1,
    priorRounds: [],
    roundNo: 1,
    levelByName: lvl,
    opts: { fixedActiveNames: ['Ann', 'Ben', 'Cia', 'Dan'] }
  });
  assert.strictEqual(out.error, undefined);
  assert.strictEqual(out.matches.length, 1);
  const m = out.matches[0];
  const s1 = teamLevelSum(m.team1, lvl);
  const s2 = teamLevelSum(m.team2, lvl);
  assert.strictEqual(s1, s2, `team sums ${s1} vs ${s2}`);
  // Partners may be same-level (1+1) or cross-level (1+5) depending on split;
  // both patterns can tie on level score when team sums are equal.
  assert.ok(
    partnerLevelGap(m.team1, lvl) <= 4 && partnerLevelGap(m.team2, lvl) <= 4
  );
});

test('all active players same level → partner gap 0 on every court', () => {
  const players = Array.from({ length: 12 }, (_, i) => `L1_${i}`);
  const lvl = levelMapFromObject(
    Object.fromEntries(players.map((p) => [p, 1]))
  );
  const out = planAmericanoRound({
    players,
    courtCount: 3,
    priorRounds: [],
    roundNo: 1,
    levelByName: lvl,
    opts: { fixedActiveNames: players }
  });
  assert.strictEqual(out.matches.length, 3);
  for (const m of out.matches) {
    assert.strictEqual(partnerLevelGap(m.team1, lvl), 0);
    assert.strictEqual(partnerLevelGap(m.team2, lvl), 0);
  }
});

test('four level-5 players on one court is allowed (no error)', () => {
  const players = ['A', 'B', 'C', 'D'];
  const lvl = levelMapFromObject({ A: 5, B: 5, C: 5, D: 5 });
  const out = planAmericanoRound({
    players,
    courtCount: 1,
    priorRounds: [],
    roundNo: 1,
    levelByName: lvl,
    opts: { fixedActiveNames: players }
  });
  assert.ok(!out.error && out.matches.length === 1);
  const four = [...out.matches[0].team1, ...out.matches[0].team2];
  assert.ok(four.every((p) => getLevel(lvl, p) === 5));
});

/* ---- Fairness (multi-round, seeded) ---- */
console.log('\nFairness invariants — balanced');

const matrix = [
  { n: 12, c: 2, r: 6 },
  { n: 15, c: 3, r: 5 },
  { n: 16, c: 4, r: 5 },
  { n: 20, c: 4, r: 5 }
];

for (const { n, c, r } of matrix) {
  test(`${n}p / ${c}c / ${r}r → valid matches, fair games/byes`, () => {
    const players = Array.from({ length: n }, (_, i) =>
      `P${String(i + 1).padStart(2, '0')}`
    );
    const lvl = Object.fromEntries(
      players.map((p, i) => [p, 1 + (i % 5)])
    );
    const rounds = simulateBalanced(players, c, r, lvl, 0xba1a);
    const sum = summarize(players, rounds);
    assert.ok(sum.gamesPlayedDiff <= 1, `gamesDiff=${sum.gamesPlayedDiff}`);
    assert.ok(sum.byeDiff <= 1, `byeDiff=${sum.byeDiff}`);
    const cap = computeRoundCapacity(n, c);
    rounds.forEach((rd, idx) => {
      assert.strictEqual(rd.matches.length, cap.usedCourtsPerRound, `round ${idx + 1}`);
    });
  });
}

test('15p / 3c / 5r → fairness report: games/byes balanced, meetings tracked', () => {
  const players = Array.from({ length: 15 }, (_, i) =>
    `P${String(i + 1).padStart(2, '0')}`
  );
  const lvl = Object.fromEntries(players.map((p, i) => [p, 1 + (i % 5)]));
  const rounds = simulateBalanced(players, 3, 5, lvl, 0xba1a);
  const rep = buildFairnessReport(players, rounds, 3);
  assert.strictEqual(rep.gamesPlayedDifference, 0);
  assert.strictEqual(rep.byeDifference, 0);
  assert.ok(rep.minUniqueMeetings >= 8, `minMeetings=${rep.minUniqueMeetings}`);
  assert.ok(typeof rep.averageUniqueMeetings === 'number');
});

test('12p / 2c / 6r → minimal partner repeats with levels', () => {
  const players = Array.from({ length: 12 }, (_, i) =>
    `P${String(i + 1).padStart(2, '0')}`
  );
  const lvl = Object.fromEntries(players.map((p, i) => [p, 1 + (i % 5)]));
  const rounds = simulateBalanced(players, 2, 6, lvl, 0xba1b);
  const sum = summarize(players, rounds);
  const repeats = [...sum.partnerCount.values()].reduce(
    (s, c) => s + Math.max(0, c - 1),
    0
  );
  assert.ok(repeats <= 4, `partner repeats=${repeats}, expected <= 4`);
});

/* ---- Level stats over a session ---- */
console.log('\nLevel balance over session');

test('15p / 3c / 5r → team level sums nearly balanced; partner gaps reasonable', () => {
  const players = Array.from({ length: 15 }, (_, i) =>
    `P${String(i + 1).padStart(2, '0')}`
  );
  const lvl = Object.fromEntries(players.map((p, i) => [p, 1 + (i % 5)]));
  const rounds = simulateBalanced(players, 3, 5, lvl, 0xba1a);
  const stats = collectLevelStats(rounds, lvl);
  assert.ok(
    stats.teamSumDiffMax <= 1,
    `teamSumDiffMax=${stats.teamSumDiffMax}, expected <= 1`
  );
  assert.ok(
    stats.avgPartnerGap <= 2.5,
    `avgPartnerGap=${stats.avgPartnerGap.toFixed(2)}, expected <= 2.5`
  );
  assert.ok(
    stats.maxPartnerGap <= 4,
    `maxPartnerGap=${stats.maxPartnerGap}, expected <= 4`
  );
});

test('round 1 with distributed levels → team sums equal, moderate partner gaps', () => {
  const players = Array.from({ length: 12 }, (_, i) =>
    `P${String(i + 1).padStart(2, '0')}`
  );
  const lvl = Object.fromEntries(players.map((p, i) => [p, 1 + (i % 4)]));
  const out = planAmericanoRound({
    players,
    courtCount: 3,
    priorRounds: [],
    roundNo: 1,
    levelByName: lvl,
    opts: { fixedActiveNames: players }
  });
  assert.strictEqual(out.matches.length, 3);
  const stats = collectLevelStats([{ matches: out.matches }], lvl);
  assert.strictEqual(stats.teamSumDiffMax, 0);
  assert.ok(
    stats.avgPartnerGap <= 2.5,
    `round-1 avgPartnerGap=${stats.avgPartnerGap.toFixed(2)}`
  );
});

test('buildSessionStats tracks partners after balanced rounds', () => {
  const roster = ['A', 'B', 'C', 'D'];
  const prior = [{
    round: 1,
    matches: [{ court: 1, team1: ['A', 'B'], team2: ['C', 'D'] }]
  }];
  const st = buildSessionStats(roster, prior);
  assert.strictEqual(st.partnerCount.get(pairKey('A', 'B')), 1);
});

/* ---- Summary ---- */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
