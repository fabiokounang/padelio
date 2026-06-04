/* =========================
   tests/mix-mexicano-fairness.test.js
   Run: node tests/mix-mexicano-fairness.test.js
   ========================= */
'use strict';

const assert = require('assert');
const {
  pairKey,
  computeMixMexicanoRoundCapacity,
  computeMixMexicanoSessionTargets,
  buildMixMexicanoMatches,
  buildMixMexicanoFairnessReport,
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

function playersFull (maleNames, femaleNames) {
  return [
    ...maleNames.map((name) => ({ name, gender: 'M', level: 3 })),
    ...femaleNames.map((name) => ({ name, gender: 'F', level: 3 })),
  ];
}

function buildTournament (playersFull, courts) {
  const names = playersFull.map((p) => p.name);
  return {
    mode: 'mixmex',
    courts,
    players: JSON.stringify(playersFull),
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

function simulateMixMexicano (maleNames, femaleNames, courts, totalRounds, seed = 1) {
  const pf = playersFull(maleNames, femaleNames);
  const tournament = buildTournament(pf, courts);
  const rounds = [];
  for (let r = 1; r <= totalRounds; r++) {
    tournament.rounds = JSON.stringify(rounds);
    const matches = buildMixMexicanoMatches(pf, courts, rounds, r, tournament);
    const round = { round: r, matches };
    scoreRoundDeterministic(round, seed + r * 100);
    rounds.push(round);
  }
  return rounds;
}

function genderOf (name, maleSet) {
  return maleSet.has(name) ? 'M' : 'F';
}

function assertTeamsAreMixed (match, maleSet) {
  for (const team of [match.team1, match.team2]) {
    const g0 = genderOf(team[0], maleSet);
    const g1 = genderOf(team[1], maleSet);
    assert.notStrictEqual(g0, g1, `same-gender team: ${team.join('+')}`);
  }
}

console.log('\nMix Mexicano dynamic fairness');

test('computeMixMexicanoRoundCapacity — 10M+12F / 3c uses 3 courts', () => {
  const cap = computeMixMexicanoRoundCapacity(10, 12, 3);
  assert.strictEqual(cap.effectiveCourtsPerRound, 3);
  assert.strictEqual(cap.playingPerGender, 6);
  assert.strictEqual(cap.maleByesPerRound, 4);
  assert.strictEqual(cap.femaleByesPerRound, 6);
});

test('computeMixMexicanoSessionTargets — 5M+5F / 2c / 5r ideal 4 games per gender', () => {
  const t = computeMixMexicanoSessionTargets(5, 5, 2, 5);
  assert.strictEqual(t.idealGamesPerMale, 4);
  assert.strictEqual(t.idealGamesPerFemale, 4);
  assert.strictEqual(t.idealByesPerMale, 1);
  assert.strictEqual(t.idealByesPerFemale, 1);
});

test('5M+5F / 2c / 5r — every player exactly 4 games and 1 bye', () => {
  const males = Array.from({ length: 5 }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: 5 }, (_, i) => `F${i + 1}`);
  const rounds = simulateMixMexicano(males, females, 2, 5, 42);
  const report = buildMixMexicanoFairnessReport(males, females, rounds, 2, 5);
  const maleSet = new Set(males);

  rounds.forEach((r) => {
    (r.matches || []).forEach((m) => assertTeamsAreMixed(m, maleSet));
  });

  assert.strictEqual(report.gamesPlayedDifferenceMale, 0);
  assert.strictEqual(report.gamesPlayedDifferenceFemale, 0);
  assert.strictEqual(report.byeDifferenceMale, 0);
  assert.strictEqual(report.byeDifferenceFemale, 0);
  [...males, ...females].forEach((n) => {
    assert.strictEqual(report.gamesByPlayer[n], 4, `${n} games`);
    assert.strictEqual(report.byesByPlayer[n], 1, `${n} byes`);
  });
});

test('10M+10F / 2c / 5r — fair within each gender (2 games, 3 byes each)', () => {
  const males = Array.from({ length: 10 }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: 10 }, (_, i) => `F${i + 1}`);
  const rounds = simulateMixMexicano(males, females, 2, 5, 42);
  const report = buildMixMexicanoFairnessReport(males, females, rounds, 2, 5);

  assert.strictEqual(report.gamesPlayedDifferenceMale, 0);
  assert.strictEqual(report.gamesPlayedDifferenceFemale, 0);
  males.forEach((n) => {
    assert.strictEqual(report.gamesByPlayer[n], 2, `${n} games`);
    assert.strictEqual(report.byesByPlayer[n], 3, `${n} byes`);
  });
});

test('dynamic matrix — per-gender games/bye diff ≤ 1 when balanced M=F', () => {
  const matrix = [
    { m: 4, f: 4, c: 1, r: 4 },
    { m: 6, f: 6, c: 1, r: 6 },
    { m: 8, f: 8, c: 2, r: 4 },
    { m: 10, f: 10, c: 2, r: 5 },
    { m: 12, f: 12, c: 2, r: 6 },
    { m: 14, f: 14, c: 3, r: 5 },
    { m: 16, f: 16, c: 3, r: 5 },
  ];

  for (const { m, f, c, r } of matrix) {
    const males = Array.from({ length: m }, (_, i) => `M${i + 1}`);
    const females = Array.from({ length: f }, (_, i) => `F${i + 1}`);
    const rounds = simulateMixMexicano(males, females, c, r, m + f);
    const report = buildMixMexicanoFairnessReport(males, females, rounds, c, r);
    const targets = computeMixMexicanoSessionTargets(m, f, c, r);
    const maleSet = new Set(males);

    rounds.forEach((rd) => {
      (rd.matches || []).forEach((match) => assertTeamsAreMixed(match, maleSet));
    });

    assert.ok(report.gamesPlayedDifferenceMale <= 1, `${m}M/${f}F/${c}c male games`);
    assert.ok(report.gamesPlayedDifferenceFemale <= 1, `${m}M/${f}F/${c}c female games`);
    assert.ok(report.byeDifferenceMale <= 1, `${m}M/${f}F/${c}c male byes`);
    assert.ok(report.byeDifferenceFemale <= 1, `${m}M/${f}F/${c}c female byes`);

    if (Number.isInteger(targets.idealGamesPerMale)) {
      assert.strictEqual(report.gamesPlayedDifferenceMale, 0);
    }
    if (Number.isInteger(targets.idealGamesPerFemale)) {
      assert.strictEqual(report.gamesPlayedDifferenceFemale, 0);
    }
  }
});

test('unequal 8M+10F / 2c — still 2M+2F teams and fair within each gender', () => {
  const males = Array.from({ length: 8 }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: 10 }, (_, i) => `F${i + 1}`);
  const rounds = simulateMixMexicano(males, females, 2, 5, 7);
  const report = buildMixMexicanoFairnessReport(males, females, rounds, 2, 5);
  const maleSet = new Set(males);

  rounds.forEach((r) => {
    (r.matches || []).forEach((m) => assertTeamsAreMixed(m, maleSet));
  });

  assert.ok(report.gamesPlayedDifferenceMale <= 1);
  assert.ok(report.gamesPlayedDifferenceFemale <= 1);
  assert.ok(report.byeDifferenceMale <= 1);
  assert.ok(report.byeDifferenceFemale <= 1);
});

test('5M+5F / 2c / 5r — no 4x partners; limited repeats under Swiss grouping', () => {
  const males = Array.from({ length: 5 }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: 5 }, (_, i) => `F${i + 1}`);
  const rounds = simulateMixMexicano(males, females, 2, 5, 17);
  const partnerCount = new Map();
  for (const rd of rounds) {
    for (const m of rd.matches || []) {
      for (const team of [m.team1, m.team2]) {
        const k = pairKey(team[0], team[1]);
        partnerCount.set(k, (partnerCount.get(k) || 0) + 1);
      }
    }
  }
  let repeatedPairs = 0;
  let maxCount = 0;
  partnerCount.forEach((c) => {
    if (c > 1) repeatedPairs++;
    if (c > maxCount) maxCount = c;
  });
  assert.ok(maxCount <= 3, `max partner count ${maxCount} > 3`);
  assert.ok(repeatedPairs <= 6, `repeated partner pairs ${repeatedPairs} > 6`);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
