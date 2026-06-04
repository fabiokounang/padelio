/* =========================
   tests/fixed-mexicano-fairness.test.js
   Run: node tests/fixed-mexicano-fairness.test.js
   ========================= */
'use strict';

const assert = require('assert');
const {
  pairKey,
  computeFixedMexicanoRoundCapacity,
  computeFixedMexicanoSessionTargets,
  buildFixedPairsMexicanoMatches,
  buildMexicanoFairnessReport,
} = require('../js/pairing.js');

let passed = 0;
let failed = 0;

function test (name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function pairsFromCount (n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ m: `M${i + 1}`, f: `F${i + 1}` });
  }
  return out;
}

function playerNames (pairCount) {
  const names = [];
  for (let i = 0; i < pairCount; i++) {
    names.push(`M${i + 1}`, `F${i + 1}`);
  }
  return names;
}

function buildTournament (pairCount, courts) {
  const names = playerNames(pairCount);
  return {
    mode: 'fixedmex',
    courts,
    players: JSON.stringify(names.map((name) => ({ name, level: 3 }))),
    rounds: JSON.stringify([]),
  };
}

function scoreRoundDeterministic (round, seed) {
  (round.matches || []).forEach((m, idx) => {
    const a = ((seed + idx * 37) % 17) + 1;
    const b = ((seed * 7 + idx * 11) % 17) + 1;
    m.score1 = String(a);
    m.score2 = String(a === b ? (b % 17) + 1 : b);
  });
}

function simulateFixedMexicano (pairCount, courts, totalRounds, seed = 1) {
  const allPairObjs = pairsFromCount(pairCount);
  const playersFull = playerNames(pairCount).map((name) => ({ name, level: 3 }));
  const tournament = buildTournament(pairCount, courts);
  const rounds = [];
  for (let r = 1; r <= totalRounds; r++) {
    tournament.rounds = JSON.stringify(rounds);
    const matches = buildFixedPairsMexicanoMatches(
      allPairObjs, courts, rounds, r, tournament, playersFull
    );
    const round = { round: r, matches };
    scoreRoundDeterministic(round, seed + r * 100);
    rounds.push(round);
  }
  return { rounds, names: playerNames(pairCount) };
}

console.log('\nFixed Mexicano dynamic fairness');

test('computeFixedMexicanoRoundCapacity — 5 pairs / 2c plays 4 pairs', () => {
  const cap = computeFixedMexicanoRoundCapacity(5, 2);
  assert.strictEqual(cap.playingPairsPerRound, 4);
  assert.strictEqual(cap.usedCourtsPerRound, 2);
  assert.strictEqual(cap.byePairsPerRound, 1);
});

test('5 pairs (10 players) / 2c / 5r — every player 4 games and 1 bye', () => {
  const { rounds, names } = simulateFixedMexicano(5, 2, 5, 42);
  const report = buildMexicanoFairnessReport(names, rounds, 2, 5);
  assert.strictEqual(report.gamesPlayedDifference, 0);
  assert.strictEqual(report.byeDifference, 0);
  names.forEach((n) => {
    assert.strictEqual(report.gamesByPlayer[n], 4, `${n} games`);
    assert.strictEqual(report.byesByPlayer[n], 1, `${n} byes`);
  });
});

test('6 pairs (12 players) / 3c / 5r — all play every round, 5 games each', () => {
  const { rounds, names } = simulateFixedMexicano(6, 3, 5, 7);
  const report = buildMexicanoFairnessReport(names, rounds, 3, 5);
  assert.strictEqual(report.gamesPlayedDifference, 0);
  assert.strictEqual(report.byeDifference, 0);
  names.forEach((n) => {
    assert.strictEqual(report.gamesByPlayer[n], 5, `${n} games`);
    assert.strictEqual(report.byesByPlayer[n], 0, `${n} byes`);
  });
});

test('dynamic matrix — player games/bye diff ≤ 1 when balanced', () => {
  const matrix = [
    { pairs: 3, c: 1, r: 3 },
    { pairs: 4, c: 1, r: 4 },
    { pairs: 5, c: 2, r: 5 },
    { pairs: 6, c: 2, r: 6 },
    { pairs: 8, c: 3, r: 5 },
  ];
  for (const { pairs, c, r } of matrix) {
    const { rounds, names } = simulateFixedMexicano(pairs, c, r, pairs + c);
    const report = buildMexicanoFairnessReport(names, rounds, c, r);
    const targets = computeFixedMexicanoSessionTargets(pairs, c, r);
    assert.ok(report.gamesPlayedDifference <= 1, `${pairs}p/${c}c games`);
    assert.ok(report.byeDifference <= 1, `${pairs}p/${c}c byes`);
    if (Number.isInteger(targets.idealGamesPerPlayer)) {
      assert.strictEqual(report.gamesPlayedDifference, 0);
    }
    if (Number.isInteger(targets.idealByesPerPlayer)) {
      assert.strictEqual(report.byeDifference, 0);
    }
  }
});

test('fixed partners never split — same pair key on court together', () => {
  const allPairObjs = pairsFromCount(5);
  const pairKeys = allPairObjs.map((p) => pairKey(p.m, p.f));
  const { rounds } = simulateFixedMexicano(5, 2, 3, 11);
  for (const rd of rounds) {
    for (const m of rd.matches || []) {
      const t1k = pairKey(m.team1[0], m.team1[1]);
      const t2k = pairKey(m.team2[0], m.team2[1]);
      assert.ok(pairKeys.includes(t1k), `team1 ${t1k} is a roster pair`);
      assert.ok(pairKeys.includes(t2k), `team2 ${t2k} is a roster pair`);
    }
  }
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
