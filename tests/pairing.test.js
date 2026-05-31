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
  pickActivePlayersMixBalancedGender,
  buildMixDynamicMatches,
  buildMixFairnessHistory,
  buildMixFairnessReport,
  buildBestMixCandidateSchedule,
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

/* ---- pickActivePlayersMixBalancedGender ---- */
console.log('\npickActivePlayersMixBalancedGender');

const mixMales = ['M1', 'M2', 'M3', 'M4', 'M5'];
const mixFemales = ['F1', 'F2', 'F3', 'F4', 'F5'];

test('round 1 with empty rounds returns first 2*courts males and 2*courts females', () => {
  const out = pickActivePlayersMixBalancedGender(mixMales, mixFemales, 2, [], 1);
  assert.strictEqual(out.effectiveCourts, 2);
  assert.deepStrictEqual(out.activeM, ['M1', 'M2', 'M3', 'M4']);
  assert.deepStrictEqual(out.activeF, ['F1', 'F2', 'F3', 'F4']);
  assert.deepStrictEqual(out.active, ['M1', 'M2', 'M3', 'M4', 'F1', 'F2', 'F3', 'F4']);
});

test('effective courts is capped by the smallest gender pool', () => {
  const out = pickActivePlayersMixBalancedGender(
    ['M1', 'M2', 'M3', 'M4'],
    ['F1', 'F2'],
    4,
    [],
    1
  );
  assert.strictEqual(out.effectiveCourts, 1);
  assert.strictEqual(out.activeM.length, 2);
  assert.strictEqual(out.activeF.length, 2);
});

test('returns empty arrays when gender pools are too small for any court', () => {
  const out = pickActivePlayersMixBalancedGender(['M1'], ['F1', 'F2'], 1, [], 1);
  assert.strictEqual(out.effectiveCourts, 0);
  assert.deepStrictEqual(out.activeM, []);
  assert.deepStrictEqual(out.activeF, []);
  assert.deepStrictEqual(out.active, []);
});

test('handles 0 courts gracefully', () => {
  const out = pickActivePlayersMixBalancedGender(mixMales, mixFemales, 0, [], 1);
  assert.strictEqual(out.effectiveCourts, 0);
  assert.deepStrictEqual(out.activeM, []);
  assert.deepStrictEqual(out.activeF, []);
});

test('round 2 prioritizes benched players per gender (M5 + F5 forced in)', () => {
  // Round 1 used the first 4 of each gender; M5 and F5 sat out.
  // Round 2 with 2 courts (4M+4F needed) must include M5 and F5.
  const rounds = [
    {
      round: 1,
      matches: [
        { team1: ['M1', 'F1'], team2: ['M2', 'F2'], score1: 0, score2: 0 },
        { team1: ['M3', 'F3'], team2: ['M4', 'F4'], score1: 0, score2: 0 }
      ]
    }
  ];
  const out = pickActivePlayersMixBalancedGender(mixMales, mixFemales, 2, rounds, 2);
  assert.strictEqual(out.effectiveCourts, 2);
  assert.strictEqual(out.activeM.length, 4);
  assert.strictEqual(out.activeF.length, 4);
  assert.ok(out.activeM.includes('M5'), 'M5 (benched last round) should be active');
  assert.ok(out.activeF.includes('F5'), 'F5 (benched last round) should be active');
});

test('multi-round fairness: every player games-played diff per gender stays <= 1', () => {
  // 5M / 5F, 2 courts (4M+4F per round), 5 rounds.
  // With the Normal fairness selector running per gender, no player should be
  // played more than 1 extra time vs. another player of the same gender.
  const rounds = [];
  const males = ['M1', 'M2', 'M3', 'M4', 'M5'];
  const females = ['F1', 'F2', 'F3', 'F4', 'F5'];

  for (let r = 1; r <= 5; r++) {
    const sel = pickActivePlayersMixBalancedGender(males, females, 2, rounds, r);
    assert.strictEqual(sel.activeM.length, 4);
    assert.strictEqual(sel.activeF.length, 4);
    rounds.push({
      round: r,
      matches: [
        { team1: [sel.activeM[0], sel.activeF[0]], team2: [sel.activeM[1], sel.activeF[1]], score1: 0, score2: 0 },
        { team1: [sel.activeM[2], sel.activeF[2]], team2: [sel.activeM[3], sel.activeF[3]], score1: 0, score2: 0 }
      ]
    });
  }

  const gamesM = Object.fromEntries(males.map((n) => [n, 0]));
  const gamesF = Object.fromEntries(females.map((n) => [n, 0]));
  for (const rd of rounds) {
    for (const m of rd.matches) {
      [...m.team1, ...m.team2].forEach((n) => {
        if (n in gamesM) gamesM[n]++;
        else if (n in gamesF) gamesF[n]++;
      });
    }
  }

  const mVals = Object.values(gamesM);
  const fVals = Object.values(gamesF);
  const mDiff = Math.max(...mVals) - Math.min(...mVals);
  const fDiff = Math.max(...fVals) - Math.min(...fVals);
  assert.ok(mDiff <= 1, `male games diff = ${mDiff}, expected <= 1`);
  assert.ok(fDiff <= 1, `female games diff = ${fDiff}, expected <= 1`);
});

test('selected active set always has 2M + 2F per court', () => {
  // 6M / 6F, 2 courts, 4 rounds. The contract is structural: each round must
  // be able to pair exactly 2M + 2F per court.
  const rounds = [];
  const males = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
  const females = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
  for (let r = 1; r <= 4; r++) {
    const sel = pickActivePlayersMixBalancedGender(males, females, 2, rounds, r);
    assert.strictEqual(sel.activeM.length, 4);
    assert.strictEqual(sel.activeF.length, 4);
    rounds.push({
      round: r,
      matches: [
        { team1: [sel.activeM[0], sel.activeF[0]], team2: [sel.activeM[1], sel.activeF[1]], score1: 0, score2: 0 },
        { team1: [sel.activeM[2], sel.activeF[2]], team2: [sel.activeM[3], sel.activeF[3]], score1: 0, score2: 0 }
      ]
    });
  }
});

/* ---- buildMixDynamicMatches ---- */
console.log('\nbuildMixDynamicMatches');

// Tiny deterministic LCG so seeded test runs are reproducible regardless of
// how the Mix builder uses Math.random for tie-break / shuffling.
function makeSeededRandom (seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function withSeededRandom (seed, fn) {
  const original = Math.random;
  Math.random = makeSeededRandom(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

// Simulate a full N-round Mix Americano session using the shared
// `buildMixDynamicMatches` (the same algorithm `script.js` runs at runtime).
// Returns the rounds array as it would be stored on the tournament.
function simulateMix (males, females, courts, totalRounds) {
  const rounds = [];
  for (let r = 1; r <= totalRounds; r++) {
    const out = buildMixDynamicMatches(males, females, courts, rounds, r);
    rounds.push({ round: r, matches: out.matches });
  }
  return rounds;
}

function tallyGamesAndByes (allNames, rounds) {
  const games = Object.fromEntries(allNames.map((n) => [n, 0]));
  for (const rd of rounds) {
    for (const m of rd.matches) {
      [...m.team1, ...m.team2].forEach((n) => {
        if (n in games) games[n]++;
      });
    }
  }
  const byes = Object.fromEntries(
    Object.entries(games).map(([n, g]) => [n, rounds.length - g])
  );
  return { games, byes };
}

function assertMixStructuralInvariants (rounds, males, females, expectedCourts) {
  const maleSet = new Set(males);
  const femaleSet = new Set(females);
  for (const rd of rounds) {
    assert.strictEqual(
      rd.matches.length,
      expectedCourts,
      `round ${rd.round} should have ${expectedCourts} courts, got ${rd.matches.length}`
    );
    const seenOnCourt = new Set();
    for (const m of rd.matches) {
      const t1 = m.team1 || [];
      const t2 = m.team2 || [];
      assert.strictEqual(t1.length, 2, `court ${m.court} team1 must have 2 players`);
      assert.strictEqual(t2.length, 2, `court ${m.court} team2 must have 2 players`);
      const all = [...t1, ...t2];
      const males1 = all.filter((n) => maleSet.has(n));
      const females1 = all.filter((n) => femaleSet.has(n));
      assert.strictEqual(males1.length, 2, `court ${m.court} must have exactly 2 males`);
      assert.strictEqual(females1.length, 2, `court ${m.court} must have exactly 2 females`);
      assert.ok(
        maleSet.has(t1[0]) && femaleSet.has(t1[1]),
        `team1 must be [M, F] on court ${m.court}, got ${JSON.stringify(t1)}`
      );
      assert.ok(
        maleSet.has(t2[0]) && femaleSet.has(t2[1]),
        `team2 must be [M, F] on court ${m.court}, got ${JSON.stringify(t2)}`
      );
      for (const n of all) {
        assert.ok(
          !seenOnCourt.has(n),
          `${n} appears on more than one court in round ${rd.round}`
        );
        seenOnCourt.add(n);
      }
    }
  }
}

test('10 players (5M+5F), 2 courts, 5 rounds: every player plays exactly 4 times, byes exactly 1', () => {
  // The exact roster the user reported as producing bad fairness.
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];
  const all = [...males, ...females];

  // Try several seeds; with 5 players and 4 active per gender per round,
  // 5 rounds * 4 actives = 20 player-slots / 5 players = 4 games per player,
  // 1 bye per player. The selector must guarantee this for every seed.
  for (const seed of [1, 7, 42, 99, 1234, 65535]) {
    const rounds = withSeededRandom(seed, () => simulateMix(males, females, 2, 5));
    assertMixStructuralInvariants(rounds, males, females, 2);

    const { games, byes } = tallyGamesAndByes(all, rounds);
    for (const name of all) {
      assert.strictEqual(
        games[name], 4,
        `seed ${seed}: ${name} should play 4 games, got ${games[name]}`
      );
      assert.strictEqual(
        byes[name], 1,
        `seed ${seed}: ${name} should bye exactly once, got ${byes[name]}`
      );
    }
  }
});

test('10 players (5M+5F), 2 courts, 5 rounds: no pre-generated mix_schedule_json needed for fair rounds', () => {
  // Same scenario, but explicitly proving the dynamic path (which takes an
  // empty `allRounds` start) produces a fully fair session on its own — no
  // `mix_schedule_json` or other pre-generated state is consulted.
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];
  const all = [...males, ...females];

  const rounds = withSeededRandom(2026, () => simulateMix(males, females, 2, 5));
  assertMixStructuralInvariants(rounds, males, females, 2);
  const { games, byes } = tallyGamesAndByes(all, rounds);
  Object.values(games).forEach((g) => assert.strictEqual(g, 4));
  Object.values(byes).forEach((b) => assert.strictEqual(b, 1));
});

test('Mix invariants hold across many random seeds (10p / 2c / 5r)', () => {
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];

  for (let seed = 1; seed <= 25; seed++) {
    const rounds = withSeededRandom(seed * 31, () => simulateMix(males, females, 2, 5));
    assertMixStructuralInvariants(rounds, males, females, 2);
  }
});

/* ---- generic N-player / N-court / N-round Mix regression ---- */
console.log('\nbuildMixDynamicMatches — generic N×N×N fairness');

// For a session of `totalRounds` rounds with `effectiveCourts` courts, each
// gender contributes `2 * effectiveCourts` player-slots per round. Distributed
// across the gender pool of size G, every player's game count must satisfy
//   floor(totalSlots / G) <= games <= ceil(totalSlots / G).
// Equivalently max(games) - min(games) <= 1 within a gender.
function assertGamesBalancedPerGender (rounds, males, females, effectiveCourts) {
  const totalSlotsPerGender = effectiveCourts * 2 * rounds.length;
  const expectMin = Math.floor(totalSlotsPerGender / males.length);
  const expectMax = Math.ceil(totalSlotsPerGender / males.length);
  const expectMinF = Math.floor(totalSlotsPerGender / females.length);
  const expectMaxF = Math.ceil(totalSlotsPerGender / females.length);

  const { games: gAll } = tallyGamesAndByes([...males, ...females], rounds);
  const gM = males.map((n) => gAll[n]);
  const gF = females.map((n) => gAll[n]);

  const minM = Math.min(...gM), maxM = Math.max(...gM);
  const minF = Math.min(...gF), maxF = Math.max(...gF);

  assert.ok(
    minM >= expectMin && maxM <= expectMax,
    `male games out of [${expectMin}, ${expectMax}], got [${minM}, ${maxM}] (${JSON.stringify(gM)})`
  );
  assert.ok(
    minF >= expectMinF && maxF <= expectMaxF,
    `female games out of [${expectMinF}, ${expectMaxF}], got [${minF}, ${maxF}] (${JSON.stringify(gF)})`
  );
}

// A comprehensive matrix of (totalPlayers, courts, rounds). The Mix algorithm
// must produce fair, valid rounds for every combination.
const matrix = [
  { males: 2, females: 2, courts: 1, rounds: 4 },
  { males: 3, females: 3, courts: 1, rounds: 6 },
  { males: 4, females: 4, courts: 2, rounds: 4 },
  { males: 4, females: 4, courts: 2, rounds: 7 },
  { males: 5, females: 5, courts: 2, rounds: 5 },   // user's case
  { males: 5, females: 5, courts: 2, rounds: 8 },
  { males: 6, females: 6, courts: 2, rounds: 6 },
  { males: 6, females: 6, courts: 3, rounds: 6 },
  { males: 7, females: 7, courts: 3, rounds: 7 },
  { males: 8, females: 8, courts: 3, rounds: 8 },
  { males: 8, females: 8, courts: 4, rounds: 5 },
  { males: 5, females: 4, courts: 2, rounds: 6 },   // effective courts capped at 2 (4F/2)
  { males: 7, females: 4, courts: 3, rounds: 6 },   // effective courts capped at 2 (4F/2)
];

for (const cfg of matrix) {
  const males = Array.from({ length: cfg.males }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: cfg.females }, (_, i) => `F${i + 1}`);
  const effectiveCourts = Math.min(
    cfg.courts,
    Math.floor(cfg.males / 2),
    Math.floor(cfg.females / 2)
  );

  test(`Mix N×N×N: ${cfg.males}M + ${cfg.females}F / ${cfg.courts} courts (effective ${effectiveCourts}) / ${cfg.rounds} rounds`, () => {
    for (const seed of [3, 17, 256]) {
      const rounds = withSeededRandom(seed, () =>
        simulateMix(males, females, cfg.courts, cfg.rounds)
      );
      assertMixStructuralInvariants(rounds, males, females, effectiveCourts);
      assertGamesBalancedPerGender(rounds, males, females, effectiveCourts);
    }
  });
}

/* ---- Mix Fair Optimizer — partner / opponent / meeting quality ---- */
console.log('\nMix Fair Optimizer — quality assertions');

function repeatedPartnerCount (rounds) {
  const counts = new Map();
  for (const rd of rounds) {
    for (const m of rd.matches) {
      [m.team1, m.team2].forEach((t) => {
        if (t && t.length === 2) {
          const k = pairKey(t[0], t[1]);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      });
    }
  }
  let repeats = 0;
  counts.forEach((c) => { if (c > 1) repeats += c - 1; });
  return repeats;
}

function repeatedOpponentCount (rounds) {
  const counts = new Map();
  for (const rd of rounds) {
    for (const m of rd.matches) {
      (m.team1 || []).forEach((a) => (m.team2 || []).forEach((b) => {
        const k = pairKey(a, b);
        counts.set(k, (counts.get(k) || 0) + 1);
      }));
    }
  }
  let repeats = 0;
  counts.forEach((c) => { if (c > 1) repeats += c - 1; });
  return repeats;
}

function uniquePartnerCounts (allNames, rounds, isMaleSet, isFemaleSet) {
  const partners = Object.fromEntries(allNames.map((n) => [n, new Set()]));
  for (const rd of rounds) {
    for (const m of rd.matches) {
      [m.team1, m.team2].forEach((t) => {
        if (t && t.length === 2) {
          const [a, b] = t;
          if (partners[a] && (isMaleSet.has(b) || isFemaleSet.has(b))) {
            partners[a].add(b);
          }
          if (partners[b] && (isMaleSet.has(a) || isFemaleSet.has(a))) {
            partners[b].add(a);
          }
        }
      });
    }
  }
  return Object.fromEntries(Object.entries(partners).map(([n, s]) => [n, s.size]));
}

function uniqueOpponentCounts (allNames, rounds) {
  const opps = Object.fromEntries(allNames.map((n) => [n, new Set()]));
  for (const rd of rounds) {
    for (const m of rd.matches) {
      (m.team1 || []).forEach((a) => (m.team2 || []).forEach((b) => {
        if (opps[a]) opps[a].add(b);
        if (opps[b]) opps[b].add(a);
      }));
    }
  }
  return Object.fromEntries(Object.entries(opps).map(([n, s]) => [n, s.size]));
}

test('10p (5M+5F) / 2c / 5r — 0 repeated mixed partner pairs for EVERY seed', () => {
  // The optimizer now explores every fair active-bye permutation and picks
  // the lex-best round (partnerRepeats asc, combinedScore asc). For this
  // configuration zero repeated partners is always achievable, so we assert
  // exact equality with 0 across all seeds.
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];
  const trials = [11, 22, 33, 44, 55, 66, 77, 88, 99, 101];
  for (const seed of trials) {
    const rounds = withSeededRandom(seed, () => simulateMix(males, females, 2, 5));
    const repeats = repeatedPartnerCount(rounds);
    assert.strictEqual(
      repeats, 0,
      `seed ${seed}: expected 0 partner repeats, got ${repeats}`
    );
  }
});

test('10p (5M+5F) / 2c / 5r — gavin + maria never partner twice (user regression)', () => {
  // Concrete regression for the bug report: "gavin + maria became partners
  // 2 times". With the active-set rejection gate this must never happen for
  // this roster across any seed.
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];
  const gavinMariaKey = pairKey('gavin', 'maria');
  for (let seed = 1; seed <= 50; seed++) {
    const rounds = withSeededRandom(seed * 7, () => simulateMix(males, females, 2, 5));
    let pairings = 0;
    for (const rd of rounds) {
      for (const m of rd.matches) {
        [m.team1, m.team2].forEach((t) => {
          if (t && pairKey(t[0], t[1]) === gavinMariaKey) pairings++;
        });
      }
    }
    assert.ok(
      pairings <= 1,
      `seed ${seed * 7}: gavin+maria partnered ${pairings} times (expected <= 1)`
    );
  }
});

test('10p (5M+5F) / 2c / 5r — every player partners with 4 distinct opposite-gender players', () => {
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];
  const all = [...males, ...females];
  const maleSet = new Set(males);
  const femaleSet = new Set(females);

  for (const seed of [13, 29, 47, 61, 89]) {
    const rounds = withSeededRandom(seed, () => simulateMix(males, females, 2, 5));
    const uniq = uniquePartnerCounts(all, rounds, maleSet, femaleSet);
    for (const n of all) {
      assert.strictEqual(
        uniq[n], 4,
        `seed ${seed}: ${n} should have 4 distinct partners (1 per game), got ${uniq[n]}`
      );
    }
  }
});

test('10p (5M+5F) / 2c / 5r — every player faces opponents broadly (>= 7 unique of 8 max)', () => {
  // With 4 games, theoretical max unique opponents per player is min(9, 4*2) = 8.
  // The known-horizon candidate optimizer tries 100+ schedules and picks the
  // lex-best for opponent rotation while keeping partner repeats at 0.
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];
  const all = [...males, ...females];
  const { rounds, report } = buildBestMixCandidateSchedule(
    males, females, 2, 5, { candidateCount: 100, baseSeed: 42 }
  );
  assert.strictEqual(report.repeatedPartnerPairs, 0);
  assert.strictEqual(report.repeatedPartnerPairCount, 0);
  const uniqO = uniqueOpponentCounts(all, rounds);
  const worst = Math.min(...Object.values(uniqO));
  assert.ok(
    worst >= 7,
    `worst-player unique opponents = ${worst}, expected >= 7 (uniqO=${JSON.stringify(uniqO)})`
  );
  assert.ok(report.minimumUniqueOpponentCount >= 7);
  assert.ok(report.averageUniqueOpponentCount >= 7);
});

test('10p (5M+5F) / 2c / 5r — candidate optimizer beats greedy opponent rotation', () => {
  // Regression for user-reported repeated opponent pairs (Fabio vs Sharon 2x,
  // pingky vs Sharon 2x, etc.). The 100-candidate optimizer should produce
  // fewer repeated opponent pairs than a single greedy pass.
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];
  const greedy = withSeededRandom(2024, () => simulateMix(males, females, 2, 5));
  const greedyRepeats = repeatedOpponentCount(greedy);
  const { rounds, report, quality } = buildBestMixCandidateSchedule(
    males, females, 2, 5, { candidateCount: 100, baseSeed: 2024 }
  );
  assert.strictEqual(repeatedPartnerCount(rounds), 0);
  assert.ok(
    report.repeatedOpponentPairCount <= greedyRepeats,
    `optimizer repeated opponent pairs ${report.repeatedOpponentPairCount} ` +
    `should be <= greedy ${greedyRepeats}`
  );
  assert.ok(
    quality.minUniqueOpponents >= 7,
    `min unique opponents ${quality.minUniqueOpponents}, expected >= 7`
  );
  const badPairs = [
    pairKey('Fabio', 'Sharon'),
    pairKey('pingky', 'Sharon'),
    pairKey('ridel', 'maria'),
    pairKey('Fabio', 'gavin'),
    pairKey('cindy', 'maria'),
    pairKey('dio', 'ridel'),
    pairKey('fedi', 'filia')
  ];
  for (const k of badPairs) {
    const detail = report.repeatedOpponentPairsDetail.find(
      (d) => pairKey(d.playerA, d.playerB) === k
    );
    assert.ok(
      !detail || detail.count <= 1,
      `repeated opponent pair ${k} should not occur more than once, got ${detail && detail.count}`
    );
  }
});

test('12p (6M+6F) / 3c / 4r — 0 partner repeats and worst-player opponents >= 6', () => {
  // 4 games × 2 opps = 8 max unique opponents (capped at 11 others). The
  // optimizer prioritises partner uniqueness over opponent uniqueness (W=10000
  // vs 2500 per the Mix scoring weights), so the worst-case player may have
  // 6-7 unique opponents on some seeds while every other constraint is met.
  // We assert:
  //   - 0 partner repeats per seed (fully feasible: 4 of 6 distinct females),
  //   - every player gets 4 unique partners,
  //   - worst-case opponents per seed >= 6.
  const males = Array.from({ length: 6 }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: 6 }, (_, i) => `F${i + 1}`);
  const all = [...males, ...females];
  const maleSet = new Set(males);
  const femaleSet = new Set(females);
  for (const seed of [5, 23, 41, 67, 91]) {
    const rounds = withSeededRandom(seed, () => simulateMix(males, females, 3, 4));
    assert.strictEqual(repeatedPartnerCount(rounds), 0, `seed ${seed}: partner repeats not 0`);
    const uniqP = uniquePartnerCounts(all, rounds, maleSet, femaleSet);
    Object.entries(uniqP).forEach(([n, c]) => {
      assert.strictEqual(c, 4, `seed ${seed}: ${n} unique partners = ${c}, expected 4`);
    });
    const uniqO = uniqueOpponentCounts(all, rounds);
    const worst = Math.min(...Object.values(uniqO));
    assert.ok(worst >= 6, `seed ${seed}: worst unique opponents = ${worst}, expected >= 6`);
  }
});

test('Unequal gender 6M+4F / 2c / 5r — only valid M+F teams, gender bye balanced within each gender', () => {
  // 4F → effective courts = min(2, 6/2, 4/2) = 2. Each round uses 4M + 4F,
  // so every female plays every round (0 byes per female); males rotate
  // bye 5 rounds × 2 = 10 male slots, 6 males → spread 1.
  const males = Array.from({ length: 6 }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: 4 }, (_, i) => `F${i + 1}`);
  const all = [...males, ...females];
  const maleSet = new Set(males);
  const femaleSet = new Set(females);

  for (const seed of [3, 21, 57]) {
    const rounds = withSeededRandom(seed, () => simulateMix(males, females, 2, 5));
    assertMixStructuralInvariants(rounds, males, females, 2);

    const { games } = tallyGamesAndByes(all, rounds);
    const gM = males.map((n) => games[n]);
    const gF = females.map((n) => games[n]);
    assert.ok(
      Math.max(...gM) - Math.min(...gM) <= 1,
      `seed ${seed}: male games spread = ${Math.max(...gM) - Math.min(...gM)} > 1`
    );
    assert.strictEqual(Math.min(...gF), 5, `seed ${seed}: all 4 females should play all 5 rounds`);
    assert.strictEqual(Math.max(...gF), 5, `seed ${seed}: all 4 females should play all 5 rounds`);

    // Partner uniqueness still works within available pool: 6M each have 4
    // games and 4 distinct F opponents; 4F each have 5 games and only 6 M.
    const uniqP = uniquePartnerCounts(all, rounds, maleSet, femaleSet);
    males.forEach((n) => assert.ok(
      uniqP[n] >= 3,
      `seed ${seed}: male ${n} partners ${uniqP[n]} < 3`
    ));
    females.forEach((n) => assert.ok(
      uniqP[n] >= 4,
      `seed ${seed}: female ${n} partners ${uniqP[n]} < 4`
    ));
  }
});

test('Unequal gender 7M+5F / 3c / 5r — caps to 2 courts, all teams M+F, fair within gender', () => {
  // effective courts = min(3, 7/2=3, 5/2=2) = 2 → 4M + 4F per round.
  const males = Array.from({ length: 7 }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: 5 }, (_, i) => `F${i + 1}`);
  const all = [...males, ...females];

  for (const seed of [9, 27, 81]) {
    const rounds = withSeededRandom(seed, () => simulateMix(males, females, 3, 5));
    assertMixStructuralInvariants(rounds, males, females, 2);

    const { games } = tallyGamesAndByes(all, rounds);
    const gM = males.map((n) => games[n]);
    const gF = females.map((n) => games[n]);
    assert.ok(
      Math.max(...gM) - Math.min(...gM) <= 1,
      `seed ${seed}: male games spread > 1 (${JSON.stringify(gM)})`
    );
    assert.ok(
      Math.max(...gF) - Math.min(...gF) <= 1,
      `seed ${seed}: female games spread > 1 (${JSON.stringify(gF)})`
    );
  }
});

test('buildMixFairnessReport surfaces per-gender ranges, repeat counts, and warnings', () => {
  const males = ['Fabio', 'ridel', 'gavin', 'dio', 'fedi'];
  const females = ['pingky', 'filia', 'maria', 'Sharon', 'cindy'];
  const { rounds, report } = buildBestMixCandidateSchedule(
    males, females, 2, 5, { candidateCount: 100, baseSeed: 2024 }
  );
  assert.strictEqual(report.totalPlayers, 10);
  assert.strictEqual(report.totalMales, 5);
  assert.strictEqual(report.totalFemales, 5);
  assert.strictEqual(report.rounds, 5);
  assert.strictEqual(report.matchesPerRound, 2);
  assert.strictEqual(report.maleByePerRound, 1);
  assert.strictEqual(report.femaleByePerRound, 1);
  assert.strictEqual(report.repeatedPartnerPairs, 0);
  assert.strictEqual(report.repeatedPartnerPairCount, 0);
  assert.strictEqual(report.byesRange.diff, 0);
  assert.strictEqual(report.gamesRange.diff, 0);
  assert.strictEqual(report.byesRangeMale.diff, 0);
  assert.strictEqual(report.byesRangeFemale.diff, 0);
  assert.ok(typeof report.totalOpponentRepeats === 'number');
  assert.ok(typeof report.repeatedOpponentPairCount === 'number');
  assert.ok(Array.isArray(report.repeatedOpponentPairsDetail));
  assert.ok(report.minimumUniqueOpponentCount >= 7);
  assert.ok(report.averageUniqueOpponentCount >= 7);
  [...males, ...females].forEach((n) => {
    assert.strictEqual(report.uniquePartnersByPlayer[n], 4);
    assert.ok(report.uniqueOpponentsByPlayer[n] >= 7);
    assert.ok(report.uniqueMeetingsByPlayer[n] >= 7);
  });
});

test('buildMixFairnessReport warns when male and female counts are unequal', () => {
  const males = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
  const females = ['F1', 'F2', 'F3', 'F4'];
  const rounds = withSeededRandom(7, () => simulateMix(males, females, 2, 5));
  const report = buildMixFairnessReport(males, females, rounds, 2);
  assert.ok(
    report.warnings.some((w) => w.includes('Male and female player counts are not equal')),
    `expected gender-imbalance warning, got: ${JSON.stringify(report.warnings)}`
  );
  // Males rotate bye, females play every round.
  assert.strictEqual(report.byesRangeFemale.max, 0);
});

test('Mix optimizer never produces same-gender teams across any configuration', () => {
  const configs = [
    { m: 5, f: 5, c: 2, r: 5 },
    { m: 6, f: 6, c: 3, r: 4 },
    { m: 7, f: 5, c: 3, r: 6 },
    { m: 8, f: 8, c: 4, r: 4 },
    { m: 10, f: 8, c: 4, r: 5 },
  ];
  for (const cfg of configs) {
    const males = Array.from({ length: cfg.m }, (_, i) => `M${i + 1}`);
    const females = Array.from({ length: cfg.f }, (_, i) => `F${i + 1}`);
    const maleSet = new Set(males);
    const femaleSet = new Set(females);
    for (const seed of [1, 2, 3]) {
      const rounds = withSeededRandom(seed * 17, () =>
        simulateMix(males, females, cfg.c, cfg.r)
      );
      for (const rd of rounds) {
        for (const m of rd.matches) {
          const team1Gender = m.team1.map((n) =>
            (maleSet.has(n) ? 'M' : femaleSet.has(n) ? 'F' : '?')
          ).join('');
          const team2Gender = m.team2.map((n) =>
            (maleSet.has(n) ? 'M' : femaleSet.has(n) ? 'F' : '?')
          ).join('');
          assert.ok(
            (team1Gender === 'MF' || team1Gender === 'FM') &&
            (team2Gender === 'MF' || team2Gender === 'FM'),
            `cfg ${JSON.stringify(cfg)} seed ${seed} round ${rd.round}: invalid team genders ${team1Gender}/${team2Gender}`
          );
        }
      }
    }
  }
});

/* ---- Mix Fair Optimizer — 10 to 50 player stress matrix ---- */
console.log('\nMix Fair Optimizer — 10 to 50 player stress matrix');

// Build a player roster of `total` players with an even M/F split (or off-by-one
// when total is odd). Court count is one less than max feasible so the bench
// rotation is exercised. Rounds is total - 1 to keep the test runtime manageable
// while still proving the optimizer scales.
function buildStressRoster (total) {
  const males = Math.floor(total / 2);
  const females = total - males;
  return {
    males: Array.from({ length: males }, (_, i) => `M${i + 1}`),
    females: Array.from({ length: females }, (_, i) => `F${i + 1}`)
  };
}

function feasibleEffectiveCourts (males, females, courts) {
  return Math.min(courts, Math.floor(males.length / 2), Math.floor(females.length / 2));
}

function assertStressFairness (label, males, females, courts, rounds) {
  const effectiveCourts = feasibleEffectiveCourts(males, females, courts);
  if (effectiveCourts <= 0) {
    throw new Error(`${label}: effective courts is 0 (cannot run)`);
  }
  const allPlayers = [...males, ...females];
  const seeded = withSeededRandom(
    1000 + males.length * 13 + females.length * 19 + courts * 7 + rounds,
    () => simulateMix(males, females, courts, rounds)
  );
  assertMixStructuralInvariants(seeded, males, females, effectiveCourts);

  const totalSlotsPerGender = effectiveCourts * 2 * rounds;
  const expectMinM = Math.floor(totalSlotsPerGender / males.length);
  const expectMaxM = Math.ceil(totalSlotsPerGender / males.length);
  const expectMinF = Math.floor(totalSlotsPerGender / females.length);
  const expectMaxF = Math.ceil(totalSlotsPerGender / females.length);

  const { games } = tallyGamesAndByes(allPlayers, seeded);
  const gM = males.map((n) => games[n]);
  const gF = females.map((n) => games[n]);
  assert.ok(
    Math.min(...gM) >= expectMinM && Math.max(...gM) <= expectMaxM,
    `${label}: male games out of [${expectMinM}, ${expectMaxM}], got [${Math.min(...gM)}, ${Math.max(...gM)}]`
  );
  assert.ok(
    Math.min(...gF) >= expectMinF && Math.max(...gF) <= expectMaxF,
    `${label}: female games out of [${expectMinF}, ${expectMaxF}], got [${Math.min(...gF)}, ${Math.max(...gF)}]`
  );

  // No same-gender team (defensive even though structural assertions cover it).
  const maleSet = new Set(males);
  for (const rd of seeded) {
    for (const m of rd.matches) {
      const t1Genders = m.team1.map((n) => (maleSet.has(n) ? 'M' : 'F')).sort().join('');
      const t2Genders = m.team2.map((n) => (maleSet.has(n) ? 'M' : 'F')).sort().join('');
      assert.strictEqual(t1Genders, 'FM', `${label}: team1 not M+F (${JSON.stringify(m.team1)})`);
      assert.strictEqual(t2Genders, 'FM', `${label}: team2 not M+F (${JSON.stringify(m.team2)})`);
    }
  }
}

// Loop through every total player count from 10 through 50 inclusive. For each
// total, exercise a handful of court counts: a small fixed value, a mid value,
// and the maximum feasible courts (capped by smaller gender pool / 2).
for (let total = 10; total <= 50; total++) {
  const { males, females } = buildStressRoster(total);
  const maxFeasibleCourts = Math.min(
    Math.floor(males.length / 2),
    Math.floor(females.length / 2)
  );
  if (maxFeasibleCourts <= 0) continue;

  const courtChoices = new Set();
  courtChoices.add(1);
  if (maxFeasibleCourts >= 2) courtChoices.add(2);
  if (maxFeasibleCourts >= 3) courtChoices.add(Math.ceil(maxFeasibleCourts / 2));
  courtChoices.add(maxFeasibleCourts);

  // Round count = total - 1, capped at 12 to keep the test runtime in check
  // (the optimizer scales well but the BB enumeration grows with court count).
  const rounds = Math.min(total - 1, 12);

  for (const courts of [...courtChoices].sort((a, b) => a - b)) {
    test(`Mix stress: ${total}p (${males.length}M+${females.length}F) / ${courts} courts / ${rounds} rounds`, () => {
      assertStressFairness(
        `${total}p/${courts}c/${rounds}r`,
        males,
        females,
        courts,
        rounds
      );
    });
  }
}

// Unbalanced gender split stress: explicitly test a handful of off-by-one and
// larger gender gaps to verify the optimizer still produces valid M+F teams
// and keeps each gender's games/byes spread <= 1.
const unbalancedConfigs = [
  { m: 6, f: 4, c: 2, r: 5 },
  { m: 7, f: 5, c: 3, r: 6 },
  { m: 9, f: 7, c: 3, r: 7 },
  { m: 10, f: 8, c: 4, r: 7 },
  { m: 12, f: 10, c: 5, r: 8 },
  { m: 14, f: 10, c: 5, r: 8 },
  { m: 15, f: 13, c: 6, r: 8 },
  { m: 17, f: 15, c: 6, r: 8 },
  { m: 20, f: 18, c: 8, r: 8 },
  { m: 22, f: 20, c: 8, r: 8 },
  { m: 25, f: 23, c: 10, r: 8 },
];

for (const cfg of unbalancedConfigs) {
  const males = Array.from({ length: cfg.m }, (_, i) => `M${i + 1}`);
  const females = Array.from({ length: cfg.f }, (_, i) => `F${i + 1}`);
  const effective = feasibleEffectiveCourts(males, females, cfg.c);

  test(`Mix stress unbalanced: ${cfg.m}M+${cfg.f}F / ${cfg.c} courts (eff ${effective}) / ${cfg.r} rounds`, () => {
    assertStressFairness(
      `${cfg.m}M+${cfg.f}F/${cfg.c}c/${cfg.r}r`,
      males,
      females,
      cfg.c,
      cfg.r
    );
  });
}

/* ---- summary ---- */
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
