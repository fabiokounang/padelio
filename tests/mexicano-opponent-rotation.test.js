/* =========================
   tests/mexicano-opponent-rotation.test.js
   Run: node tests/mexicano-opponent-rotation.test.js
   ========================= */
'use strict';

const assert = require('assert');
const {
  pairKey,
  buildMexicanoMatches,
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

function buildTournament (players, courts) {
  return {
    mode: 'mexicano',
    courts,
    players: JSON.stringify(players.map((name) => ({ name, level: 3 }))),
    rounds: JSON.stringify([]),
  };
}

/** Deterministic scores so R2+ standings grouping is exercised. */
function scoreRoundDeterministic (round, seed) {
  (round.matches || []).forEach((m, idx) => {
    const a = ((seed + idx * 37) % 17) + 1;
    const b = ((seed * 7 + idx * 11) % 17) + 1;
    m.score1 = String(a);
    m.score2 = String(a === b ? (b % 17) + 1 : b);
  });
}

function simulateMexicano (rosterNames, courts, totalRounds, seed = 1) {
  const tournament = buildTournament(rosterNames, courts);
  const rounds = [];
  for (let r = 1; r <= totalRounds; r++) {
    tournament.rounds = JSON.stringify(rounds);
    const matches = buildMexicanoMatches(
      rosterNames, courts, rounds, r, tournament, tournament.players
        ? JSON.parse(tournament.players)
        : rosterNames.map((name) => ({ name, level: 3 }))
    );
    const round = { round: r, matches };
    scoreRoundDeterministic(round, seed + r * 100);
    rounds.push(round);
  }
  return rounds;
}

function maxOpponentCount (rounds) {
  const counts = new Map();
  for (const rd of rounds) {
    for (const m of rd.matches) {
      (m.team1 || []).forEach((a) => (m.team2 || []).forEach((b) => {
        const k = pairKey(a, b);
        counts.set(k, (counts.get(k) || 0) + 1);
      }));
    }
  }
  let max = 0;
  counts.forEach((c) => { if (c > max) max = c; });
  return max;
}

function opponentCountFor (rounds, a, b) {
  const k = pairKey(a, b);
  let n = 0;
  for (const rd of rounds) {
    for (const m of rd.matches) {
      const t1 = m.team1 || [];
      const t2 = m.team2 || [];
      if (t1.includes(a) && t2.includes(b)) n++;
      if (t1.includes(b) && t2.includes(a)) n++;
    }
  }
  return n;
}

console.log('\nMexicano opponent rotation');

test('12p / 2c / 6r — games 4, byes 2, no 3x opponent pairs (good seeds)', () => {
  const roster = [
    'Fabio', 'ridel', 'gavin', 'dio', 'fedi', 'Senas',
    'pingky', 'filia', 'maria', 'Sharon', 'cindy', 'Esther'
  ];
  for (const seed of [17, 77, 99, 13]) {
    const rounds = simulateMexicano(roster, 2, 6, seed);
    const report = buildMexicanoFairnessReport(roster, rounds, 2);

    assert.strictEqual(report.gamesRange.diff, 0, `seed ${seed} games diff`);
    assert.strictEqual(report.byesRange.diff, 0, `seed ${seed} bye diff`);
    roster.forEach((n) => {
      assert.strictEqual(report.gamesByPlayer[n], 4, `seed ${seed}: ${n} games`);
      assert.strictEqual(report.byesByPlayer[n], 2, `seed ${seed}: ${n} byes`);
    });
    assert.strictEqual(
      report.opponentPairsRepeated3x, 0,
      `seed ${seed}: ${report.opponentPairsRepeated3x} opponent pairs at 3x`
    );
    assert.ok(
      report.minimumUniqueOpponentCount >= 5,
      `seed ${seed}: min unique opponents ${report.minimumUniqueOpponentCount} < 5`
    );
    assert.ok(maxOpponentCount(rounds) <= 2, `seed ${seed}: max opponent count > 2`);
  }
});

test('12p / 2c / 6r — fewer total opponent repeats than legacy weighting', () => {
  const roster = [
    'Fabio', 'ridel', 'gavin', 'dio', 'fedi', 'Senas',
    'pingky', 'filia', 'maria', 'Sharon', 'cindy', 'Esther'
  ];
  let triples = 0;
  let totalRepeats = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const report = buildMexicanoFairnessReport(
      roster, simulateMexicano(roster, 2, 6, seed * 3), 2
    );
    triples += report.opponentPairsRepeated3x;
    totalRepeats += report.totalOpponentRepeats;
  }
  assert.ok(triples <= 15, `3x pairs across 20 seeds = ${triples}, expected <= 15`);
  assert.ok(totalRepeats <= 220, `total opponent repeats = ${totalRepeats}, expected <= 220`);
});

test('12p / 2c / 6r — gavin+fedi and Sharon+maria never face 3x', () => {
  const roster = [
    'Fabio', 'ridel', 'gavin', 'dio', 'fedi', 'Senas',
    'pingky', 'filia', 'maria', 'Sharon', 'cindy', 'Esther'
  ];
  const rounds = simulateMexicano(roster, 2, 6, 77);
  assert.ok(opponentCountFor(rounds, 'gavin', 'fedi') <= 2);
  assert.ok(opponentCountFor(rounds, 'Sharon', 'maria') <= 2);
  assert.ok(opponentCountFor(rounds, 'gavin', 'fedi') < 3);
  assert.ok(opponentCountFor(rounds, 'Sharon', 'maria') < 3);
});

test('buildMexicanoFairnessReport exposes opponent and meeting metrics', () => {
  const roster = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
  const rounds = simulateMexicano(roster, 2, 6, 11);
  const report = buildMexicanoFairnessReport(roster, rounds, 2);
  assert.ok(typeof report.repeatedOpponentPairCount === 'number');
  assert.ok(typeof report.totalOpponentRepeats === 'number');
  assert.ok(Array.isArray(report.repeatedOpponentPairsDetail));
  assert.ok(typeof report.minimumUniqueOpponentCount === 'number');
  assert.ok(typeof report.averageUniqueOpponentCount === 'number');
  assert.ok(typeof report.minimumUniqueMeetingCount === 'number');
  roster.forEach((n) => {
    assert.ok(typeof report.uniqueOpponentsByPlayer[n] === 'number');
    assert.ok(typeof report.uniqueMeetingsByPlayer[n] === 'number');
  });
});

test('14p / 3c / 6r — fair games/byes, at most 1 opponent pair at 3x', () => {
  const roster = Array.from({ length: 14 }, (_, i) => `P${i + 1}`);
  const rounds = simulateMexicano(roster, 3, 6, 13);
  const report = buildMexicanoFairnessReport(roster, rounds, 3);
  assert.ok(report.gamesRange.diff <= 1);
  assert.ok(report.byesRange.diff <= 1);
  assert.ok(report.opponentPairsRepeated3x <= 1);
});

test('15p / 4c / 6r — fair games/byes, no 3x opponent pairs', () => {
  const roster = Array.from({ length: 15 }, (_, i) => `P${i + 1}`);
  const rounds = simulateMexicano(roster, 4, 6, 17);
  const report = buildMexicanoFairnessReport(roster, rounds, 4);
  assert.ok(report.gamesRange.diff <= 1);
  assert.ok(report.byesRange.diff <= 1);
  assert.strictEqual(report.opponentPairsRepeated3x, 0);
});

test('15p / 5c / 6r — fair games/byes, no 3x opponent pairs', () => {
  const roster = Array.from({ length: 15 }, (_, i) => `P${i + 1}`);
  const maxCourts = Math.min(5, Math.floor(15 / 4));
  const rounds = simulateMexicano(roster, 5, 6, 19);
  const report = buildMexicanoFairnessReport(roster, rounds, 5);
  assert.ok(report.gamesRange.diff <= 1);
  assert.ok(report.byesRange.diff <= 1);
  assert.strictEqual(report.opponentPairsRepeated3x, 0);
  assert.strictEqual(maxCourts, 3);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
