/* =========================
   tests/pairing.test.js
   Run: node tests/pairing.test.js
   ========================= */
'use strict';

const assert = require('assert');
const {
  pairKey,
  getPriorRoundsCompleted,
  getPreviousRoundDatum,
  buildMixHistory,
  consecutiveBenchStreak,
  fairnessTierCmp,
  shuffleFairnessRuns,
  pickActivePlayersNormal,
  makeLevelByNameMap,
  getLevelForPairing,
  activeLevelSpread,
} = require('../js/pairing.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
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

/* ---- pairKey ---- */
console.log('\npairKey');
test('pairKey is symmetric (same result regardless of order)', () => {
  assert.strictEqual(pairKey('Alice', 'Bob'), pairKey('Bob', 'Alice'));
});
test('pairKey distinguishes different pairs', () => {
  assert.notStrictEqual(pairKey('Alice', 'Bob'), pairKey('Alice', 'Carol'));
});
test('pairKey handles empty strings', () => {
  assert.strictEqual(typeof pairKey('', 'x'), 'string');
});

/* ---- getPriorRoundsCompleted ---- */
console.log('\ngetPriorRoundsCompleted');
const rounds3 = [
  { round: 1, matches: [] },
  { round: 2, matches: [] },
  { round: 3, matches: [] },
];
test('returns only rounds before given roundNo', () => {
  const prior = getPriorRoundsCompleted(rounds3, 3);
  assert.strictEqual(prior.length, 2);
  assert.ok(prior.every(r => Number(r.round) < 3));
});
test('returns rounds sorted ascending by round number', () => {
  const shuffled = [rounds3[2], rounds3[0], rounds3[1]];
  const prior = getPriorRoundsCompleted(shuffled, 4);
  assert.deepStrictEqual(prior.map(r => r.round), [1, 2, 3]);
});
test('returns empty array for first round', () => {
  assert.strictEqual(getPriorRoundsCompleted(rounds3, 1).length, 0);
});
test('handles non-array input gracefully', () => {
  assert.strictEqual(getPriorRoundsCompleted(null, 2).length, 0);
  assert.strictEqual(getPriorRoundsCompleted(undefined, 2).length, 0);
});

/* ---- getPreviousRoundDatum ---- */
console.log('\ngetPreviousRoundDatum');
test('returns the round immediately before the given roundNo', () => {
  const prev = getPreviousRoundDatum(rounds3, 3);
  assert.strictEqual(Number(prev.round), 2);
});
test('returns null for round 1 (no previous round)', () => {
  assert.strictEqual(getPreviousRoundDatum(rounds3, 1), null);
});
test('falls back to the last prior round if exact prev is missing', () => {
  const sparse = [{ round: 1, matches: [] }, { round: 3, matches: [] }];
  const prev = getPreviousRoundDatum(sparse, 4);
  assert.strictEqual(Number(prev.round), 3);
});

/* ---- buildMixHistory ---- */
console.log('\nbuildMixHistory');
const mixRounds = [
  {
    round: 1,
    matches: [
      { team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], score1: 21, score2: 15 },
    ],
  },
  {
    round: 2,
    matches: [
      { team1: ['Alice', 'Carol'], team2: ['Bob', 'Dave'], score1: 18, score2: 21 },
    ],
  },
];
test('tracks partner counts correctly', () => {
  const { partnerCount } = buildMixHistory(mixRounds);
  const abKey = pairKey('Alice', 'Bob');
  const acKey = pairKey('Alice', 'Carol');
  assert.strictEqual(partnerCount.get(abKey), 1, 'Alice+Bob partnered once');
  assert.strictEqual(partnerCount.get(acKey), 1, 'Alice+Carol partnered once');
});
test('tracks opposition counts correctly', () => {
  const { opposeCount } = buildMixHistory(mixRounds);
  const aliceCarolKey = pairKey('Alice', 'Carol');
  // In round 1, Alice vs Carol, in round 2, Alice on same team as Carol (not opposed)
  assert.strictEqual(opposeCount.get(aliceCarolKey), 1, 'Alice faced Carol once as opponent');
});
test('returns empty maps for no rounds', () => {
  const { partnerCount, opposeCount, matchupCount } = buildMixHistory([]);
  assert.strictEqual(partnerCount.size, 0);
  assert.strictEqual(opposeCount.size, 0);
  assert.strictEqual(matchupCount.size, 0);
});
test('handles null/undefined gracefully', () => {
  assert.doesNotThrow(() => buildMixHistory(null));
  assert.doesNotThrow(() => buildMixHistory(undefined));
});

/* ---- consecutiveBenchStreak ---- */
console.log('\nconsecutiveBenchStreak');
const benchRounds = [
  { round: 1, matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'] }] },
  { round: 2, matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'] }] },
  { round: 3, matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'] }] },
];
const identity = (x) => x;

test('streak is 0 for player who played last round', () => {
  const prior = getPriorRoundsCompleted(benchRounds, 4);
  assert.strictEqual(consecutiveBenchStreak('Alice', prior, identity), 0);
});

const mixedRounds = [
  { round: 1, matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'] }] },
  { round: 2, matches: [{ team1: ['Carol', 'Dave'], team2: ['Eve', 'Frank'] }] },
  { round: 3, matches: [{ team1: ['Carol', 'Dave'], team2: ['Eve', 'Frank'] }] },
];
test('streak counts consecutive bench rounds at end of history', () => {
  const prior = getPriorRoundsCompleted(mixedRounds, 4); // rounds 1,2,3
  // Alice played R1, benched R2 and R3 → streak 2
  assert.strictEqual(consecutiveBenchStreak('Alice', prior, identity), 2);
});
test('streak is 0 for player with no rounds', () => {
  assert.strictEqual(consecutiveBenchStreak('Alice', [], identity), 0);
});

/* ---- fairnessTierCmp ---- */
console.log('\nfairnessTierCmp');
test('player with fewer played games comes first (lower played)', () => {
  const a = { played: 1, benchedLastRound: false, streak: 0 };
  const b = { played: 3, benchedLastRound: false, streak: 0 };
  assert.ok(fairnessTierCmp(a, b) < 0, 'fewer games = higher priority');
});
test('benched last round comes before active (same played count)', () => {
  const a = { played: 2, benchedLastRound: true, streak: 1 };
  const b = { played: 2, benchedLastRound: false, streak: 1 };
  assert.ok(fairnessTierCmp(a, b) < 0, 'benched last round = higher priority');
});
test('longer bench streak comes first when same played/benched', () => {
  const a = { played: 2, benchedLastRound: false, streak: 3 };
  const b = { played: 2, benchedLastRound: false, streak: 1 };
  assert.ok(fairnessTierCmp(a, b) < 0, 'longer streak = higher priority');
});
test('equal players compare as 0', () => {
  const a = { played: 2, benchedLastRound: false, streak: 1 };
  const b = { played: 2, benchedLastRound: false, streak: 1 };
  assert.strictEqual(fairnessTierCmp(a, b), 0);
});

/* ---- shuffleFairnessRuns ---- */
console.log('\nshuffleFairnessRuns');
test('output contains same rows as input', () => {
  const rows = [
    { played: 1, benchedLastRound: false, streak: 0, name: 'A' },
    { played: 2, benchedLastRound: false, streak: 0, name: 'B' },
    { played: 1, benchedLastRound: true, streak: 2, name: 'C' },
  ];
  const out = shuffleFairnessRuns(rows);
  assert.strictEqual(out.length, rows.length);
  const outNames = new Set(out.map(r => r.name));
  rows.forEach(r => assert.ok(outNames.has(r.name)));
});
test('players with lower fairness tier always appear before higher tier', () => {
  const rows = [
    { played: 3, benchedLastRound: false, streak: 0, name: 'Heavy' },
    { played: 1, benchedLastRound: false, streak: 0, name: 'Light' },
    { played: 1, benchedLastRound: true, streak: 2, name: 'Benched' },
  ];
  // Run 10 times to account for shuffling within ties
  for (let i = 0; i < 10; i++) {
    const out = shuffleFairnessRuns(rows);
    const heavyIdx = out.findIndex(r => r.name === 'Heavy');
    const lightIdx = out.findIndex(r => r.name === 'Light');
    const benchedIdx = out.findIndex(r => r.name === 'Benched');
    assert.ok(benchedIdx < lightIdx, 'Benched before Light');
    assert.ok(lightIdx < heavyIdx || benchedIdx < heavyIdx, 'Light/Benched before Heavy');
  }
});
test('does not mutate the input array', () => {
  const rows = [
    { played: 1, benchedLastRound: false, streak: 0, name: 'A' },
    { played: 2, benchedLastRound: false, streak: 0, name: 'B' },
  ];
  const namesBefore = rows.map(r => r.name);
  shuffleFairnessRuns(rows);
  assert.deepStrictEqual(rows.map(r => r.name), namesBefore);
});

/* ---- pickActivePlayersNormal ---- */
console.log('\npickActivePlayersNormal');
test('with no prior rounds, returns first N players', () => {
  const all = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
  const active = pickActivePlayersNormal(all, 4, [], 1);
  assert.strictEqual(active.length, 4);
  assert.deepStrictEqual(active, ['Alice', 'Bob', 'Carol', 'Dave']);
});
test('returns at most `slots` players', () => {
  const all = ['Alice', 'Bob', 'Carol', 'Dave'];
  const active = pickActivePlayersNormal(all, 2, [], 1);
  assert.strictEqual(active.length, 2);
});
test('benched player gets priority in next round', () => {
  const all = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
  const rounds = [
    {
      round: 1,
      matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], score1: 0, score2: 0 }],
    },
  ];
  // Slots=4, Eve was benched in round 1
  const active = pickActivePlayersNormal(all, 4, rounds, 2);
  assert.ok(active.includes('Eve'), 'Eve (benched) should be included');
  assert.strictEqual(active.length, 4);
});

/* ---- makeLevelByNameMap / getLevelForPairing / activeLevelSpread ---- */
console.log('\nmakeLevelByNameMap / getLevelForPairing / activeLevelSpread');
const playersFull = [
  { name: 'Alice', level: 5 },
  { name: 'Bob',   level: 2 },
  { name: 'Carol', level: 3 },
];
test('makeLevelByNameMap maps name to level using original casing', () => {
  const map = makeLevelByNameMap(playersFull);
  assert.strictEqual(map.get('Alice'), 5);
  assert.strictEqual(map.get('Bob'),   2);
  assert.strictEqual(map.get('Carol'), 3);
});
test('getLevelForPairing returns level when resolve produces the correct key', () => {
  const map = makeLevelByNameMap(playersFull);
  const resolve = (n) => n;
  assert.strictEqual(getLevelForPairing(map, resolve, 'Alice'), 5);
  assert.strictEqual(getLevelForPairing(map, resolve, 'Bob'),   2);
});
test('getLevelForPairing is case-sensitive when using identity resolve (returns default for wrong case)', () => {
  const map = makeLevelByNameMap(playersFull);
  const resolve = (n) => n;
  assert.strictEqual(getLevelForPairing(map, resolve, 'alice'), 3); // falls back to default
});
test('getLevelForPairing returns 3 (default) for unknown player', () => {
  const map = makeLevelByNameMap(playersFull);
  const resolve = (n) => n;
  assert.strictEqual(getLevelForPairing(map, resolve, 'Unknown'), 3);
});
test('activeLevelSpread returns max - min of levels in the active group', () => {
  const map = makeLevelByNameMap(playersFull);
  const resolve = (n) => n;
  const getL = (n) => getLevelForPairing(map, resolve, n);
  const spread = activeLevelSpread(['Alice', 'Bob', 'Carol'], getL);
  assert.strictEqual(spread, 3); // 5 - 2 = 3
});
test('activeLevelSpread returns 0 for a single player', () => {
  const map = makeLevelByNameMap(playersFull);
  const getL = (n) => getLevelForPairing(map, (x) => x, n);
  assert.strictEqual(activeLevelSpread(['Alice'], getL), 0);
});

/* ---- summary ---- */
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
