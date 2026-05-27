/* =========================
   tests/normal-americano-planner.test.js
   Run: node tests/normal-americano-planner.test.js
   ========================= */
'use strict';

const assert = require('assert');
const {
  planNormalAmericanoRound,
  computeRoundCapacity,
  buildHistory,
  pickByeAndActive,
  validateRound,
  buildFairnessReport,
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

/* ---- computeRoundCapacity ---- */
console.log('\ncomputeRoundCapacity');

test('12 players / 2 courts → 8 playing, 4 bye, 2 used', () => {
  const c = computeRoundCapacity(12, 2);
  assert.strictEqual(c.playingPlayersPerRound, 8);
  assert.strictEqual(c.byePlayersPerRound, 4);
  assert.strictEqual(c.usedCourtsPerRound, 2);
});

test('10 players / 3 courts → only 2 courts usable, 2 bye', () => {
  const c = computeRoundCapacity(10, 3);
  assert.strictEqual(c.playingPlayersPerRound, 8);
  assert.strictEqual(c.byePlayersPerRound, 2);
  assert.strictEqual(c.usedCourtsPerRound, 2);
});

test('7 players / 2 courts → 4 playing, 3 bye, 1 used', () => {
  const c = computeRoundCapacity(7, 2);
  assert.strictEqual(c.playingPlayersPerRound, 4);
  assert.strictEqual(c.byePlayersPerRound, 3);
  assert.strictEqual(c.usedCourtsPerRound, 1);
});

test('4 players / 1 court → 4 playing, 0 bye', () => {
  const c = computeRoundCapacity(4, 1);
  assert.strictEqual(c.playingPlayersPerRound, 4);
  assert.strictEqual(c.byePlayersPerRound, 0);
  assert.strictEqual(c.usedCourtsPerRound, 1);
});

test('3 players → 0 playing, 0 used', () => {
  const c = computeRoundCapacity(3, 1);
  assert.strictEqual(c.playingPlayersPerRound, 0);
  assert.strictEqual(c.usedCourtsPerRound, 0);
  assert.strictEqual(c.byePlayersPerRound, 3);
});

test('18 players / 4 courts → 16 playing, 2 bye, 4 used', () => {
  const c = computeRoundCapacity(18, 4);
  assert.strictEqual(c.playingPlayersPerRound, 16);
  assert.strictEqual(c.byePlayersPerRound, 2);
  assert.strictEqual(c.usedCourtsPerRound, 4);
});

/* ---- planNormalAmericanoRound — basic shape ---- */
console.log('\nplanNormalAmericanoRound');

test('rejects when fewer than 4 players', () => {
  const out = planNormalAmericanoRound({
    players: ['A', 'B', 'C'],
    courts: 1,
    priorRounds: [],
    roundNo: 1
  });
  assert.ok(out.error);
  assert.strictEqual(out.matches.length, 0);
  assert.match(out.error, /at least 4 players/i);
});

test('4 players / 1 court → exactly 1 match, 4 unique players, 0 byes', () => {
  const out = planNormalAmericanoRound({
    players: ['A', 'B', 'C', 'D'],
    courts: 1,
    priorRounds: [],
    roundNo: 1
  });
  assert.strictEqual(out.matches.length, 1);
  assert.strictEqual(out.byes.length, 0);
  const m = out.matches[0];
  assert.strictEqual(m.team1.length, 2);
  assert.strictEqual(m.team2.length, 2);
  assert.strictEqual(new Set([...m.team1, ...m.team2]).size, 4);
});

test('10 players / 3 courts → 2 matches, 2 byes', () => {
  const out = planNormalAmericanoRound({
    players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'],
    courts: 3,
    priorRounds: [],
    roundNo: 1
  });
  assert.strictEqual(out.matches.length, 2);
  assert.strictEqual(out.byes.length, 2);
  const seen = new Set();
  for (const m of out.matches) {
    for (const p of [...m.team1, ...m.team2]) {
      assert.ok(!seen.has(p), 'player appears twice in round');
      seen.add(p);
    }
  }
  assert.strictEqual(seen.size, 8);
});

test('7 players / 2 courts → 1 match, 3 byes', () => {
  const out = planNormalAmericanoRound({
    players: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    courts: 2,
    priorRounds: [],
    roundNo: 1
  });
  assert.strictEqual(out.matches.length, 1);
  assert.strictEqual(out.byes.length, 3);
});

test('5 players / 1 court → 1 match, 1 bye, courts capped at 1', () => {
  const out = planNormalAmericanoRound({
    players: ['A', 'B', 'C', 'D', 'E'],
    courts: 1,
    priorRounds: [],
    roundNo: 1
  });
  assert.strictEqual(out.matches.length, 1);
  assert.strictEqual(out.byes.length, 1);
  assert.strictEqual(out.matches[0].court, 1);
});

test('round 1 with no history still produces valid matches', () => {
  const out = planNormalAmericanoRound({
    players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    courts: 2,
    priorRounds: [],
    roundNo: 1
  });
  assert.strictEqual(out.matches.length, 2);
  assert.ok(out.matches[0].court !== out.matches[1].court);
});

/* ---- Simulator helpers ---- */

// Tiny deterministic LCG so test runs are reproducible regardless of how the
// planner uses Math.random for jitter / tie-breaking.
function makeSeededRandom (seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function simulate (players, courts, rounds, seed) {
  const priorRounds = [];
  const rng = seed !== undefined ? makeSeededRandom(seed) : Math.random;
  for (let r = 1; r <= rounds; r++) {
    const out = planNormalAmericanoRound({
      players,
      courts,
      priorRounds,
      roundNo: r,
      opts: { random: rng }
    });
    if (out.error) throw new Error(`Round ${r} failed: ${out.error}`);
    priorRounds.push({ round: r, matches: out.matches });
  }
  return priorRounds;
}

function summarize (players, allRounds) {
  const games = new Map(players.map((p) => [p, 0]));
  const byes = new Map(players.map((p) => [p, 0]));
  const partnerCount = new Map();
  const exactMatchCount = new Map();
  let consecutiveByeViolations = 0;
  let prevByes = null;

  for (const round of allRounds) {
    const played = new Set();
    const byeSet = new Set(players);
    for (const m of round.matches) {
      const [a1, a2] = m.team1;
      const [b1, b2] = m.team2;
      [a1, a2, b1, b2].forEach((n) => {
        games.set(n, games.get(n) + 1);
        played.add(n);
        byeSet.delete(n);
      });
      const k1 = pairKey(a1, a2);
      const k2 = pairKey(b1, b2);
      partnerCount.set(k1, (partnerCount.get(k1) || 0) + 1);
      partnerCount.set(k2, (partnerCount.get(k2) || 0) + 1);
      const mk = [k1, k2].sort().join('||');
      exactMatchCount.set(mk, (exactMatchCount.get(mk) || 0) + 1);
    }
    byeSet.forEach((n) => byes.set(n, byes.get(n) + 1));

    if (prevByes) {
      byeSet.forEach((n) => {
        if (prevByes.has(n)) consecutiveByeViolations++;
      });
    }
    prevByes = byeSet;
  }

  const gArr = [...games.values()];
  const bArr = [...byes.values()];
  return {
    gamesPlayedDiff: Math.max(...gArr) - Math.min(...gArr),
    byeDiff: Math.max(...bArr) - Math.min(...bArr),
    partnerCount,
    exactMatchCount,
    consecutiveByeViolations
  };
}

/* ---- Fairness invariants across matrix ---- */
console.log('\nFairness invariants — multi-round simulations');

const matrix = [
  { n: 4, c: 1, r: 5 },
  { n: 5, c: 1, r: 5 },
  { n: 6, c: 1, r: 6 },
  { n: 7, c: 1, r: 7 },
  { n: 8, c: 1, r: 7 },
  { n: 8, c: 2, r: 7 },
  { n: 9, c: 2, r: 9 },
  { n: 10, c: 3, r: 5 },
  { n: 11, c: 2, r: 11 },
  { n: 12, c: 2, r: 6 },
  { n: 12, c: 3, r: 4 },
  { n: 13, c: 3, r: 13 },
  { n: 15, c: 3, r: 5 },
  { n: 16, c: 3, r: 8 },
  { n: 16, c: 4, r: 7 },
  { n: 17, c: 4, r: 7 },
  { n: 18, c: 4, r: 7 },
  { n: 20, c: 4, r: 5 },
  { n: 24, c: 5, r: 6 }
];

for (const { n, c, r } of matrix) {
  test(`${n} players / ${c} courts / ${r} rounds → valid + fair`, () => {
    const players = Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
    const rounds = simulate(players, c, r);
    const cap = computeRoundCapacity(n, c);

    // Every round matches dynamic capacity exactly.
    rounds.forEach((round, idx) => {
      assert.strictEqual(
        round.matches.length,
        cap.usedCourtsPerRound,
        `round ${idx + 1} expected ${cap.usedCourtsPerRound} matches`
      );
      const seen = new Set();
      round.matches.forEach((m) => {
        assert.strictEqual(m.team1.length, 2);
        assert.strictEqual(m.team2.length, 2);
        const players4 = [...m.team1, ...m.team2];
        assert.strictEqual(new Set(players4).size, 4, 'match must have 4 unique players');
        players4.forEach((p) => {
          assert.ok(!seen.has(p), `player ${p} appears twice in same round`);
          seen.add(p);
        });
      });
      assert.strictEqual(
        seen.size,
        cap.playingPlayersPerRound,
        `round ${idx + 1} expected ${cap.playingPlayersPerRound} active players`
      );
    });

    const sum = summarize(players, rounds);

    // Hard fairness: difference <= 1 (when mathematically achievable).
    assert.ok(
      sum.gamesPlayedDiff <= 1,
      `gamesPlayedDifference=${sum.gamesPlayedDiff} > 1 for ${n}p/${c}c/${r}r`
    );
    assert.ok(
      sum.byeDiff <= 1,
      `byeDifference=${sum.byeDiff} > 1 for ${n}p/${c}c/${r}r`
    );
  });
}

/* ---- Consecutive-bye rule ---- */
console.log('\nConsecutive bye behavior');

test('12p / 2c / 6r → no avoidable consecutive byes', () => {
  // 12 players, 4 bye per round, 6 rounds = 24 bye slots / 12 players = 2 byes each.
  // With 4 byes per round, the bench is fully rotated; no consecutive bye should occur for any player.
  const players = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
  const rounds = simulate(players, 2, 6);
  const sum = summarize(players, rounds);
  assert.strictEqual(sum.consecutiveByeViolations, 0,
    'expected zero consecutive byes when bench is rotatable');
});

test('5p / 1c / 5r → ideal: each player exactly 1 bye, 4 games', () => {
  const players = ['A', 'B', 'C', 'D', 'E'];
  const rounds = simulate(players, 1, 5);
  const sum = summarize(players, rounds);
  assert.strictEqual(sum.gamesPlayedDiff, 0);
  assert.strictEqual(sum.byeDiff, 0);
});

/* ---- buildFairnessReport ---- */
console.log('\nbuildFairnessReport');

test('returns sane report shape', () => {
  const players = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
  const rounds = simulate(players, 2, 4);
  const rep = buildFairnessReport(players, rounds, 2);
  assert.ok(typeof rep.fairnessScore === 'number');
  assert.ok(rep.fairnessScore >= 0 && rep.fairnessScore <= 100);
  assert.strictEqual(rep.totalPlayers, 8);
  assert.strictEqual(rep.totalRounds, 4);
  assert.strictEqual(rep.usedCourtsPerRound, 2);
  assert.ok(['Excellent', 'Good', 'Acceptable', 'Unfair'].includes(rep.rating));
});

/* ---- validateRound ---- */
console.log('\nvalidateRound');

test('detects duplicate player across courts', () => {
  const cap = computeRoundCapacity(8, 2);
  const fake = [
    { court: 1, team1: ['A', 'B'], team2: ['C', 'D'], score1: '', score2: '' },
    { court: 2, team1: ['A', 'E'], team2: ['F', 'G'], score1: '', score2: '' }
  ];
  const history = buildHistory(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], [], 1);
  const v = validateRound(fake, cap, history);
  assert.strictEqual(v.ok, false);
  assert.ok(v.issues.some((s) => s.includes('A')));
});

/* ---- pickByeAndActive — deterministic priorities ---- */
console.log('\npickByeAndActive');

test('does not pick a player who had bye last round when alternatives exist', () => {
  // 8 players, 1 court, 1 bye player per round.
  // Round 1 had Bob on bye. Round 2 should pick someone else.
  const players = ['Ann', 'Bob', 'Cal', 'Dan', 'Eve', 'Fae', 'Gus', 'Hal', 'Ivy'];
  const priorRounds = [{
    round: 1,
    matches: [
      { court: 1, team1: ['Ann', 'Cal'], team2: ['Dan', 'Eve'], score1: '', score2: '' },
      { court: 2, team1: ['Fae', 'Gus'], team2: ['Hal', 'Ivy'], score1: '', score2: '' }
      // Bob is on bye
    ]
  }];
  const cap = computeRoundCapacity(9, 2);
  const history = buildHistory(players, priorRounds, 2);
  const pick = pickByeAndActive(history.canonNames, history, cap, {
    random: () => 0.1
  });
  assert.strictEqual(pick.bye.length, 1);
  assert.notStrictEqual(pick.bye[0], 'Bob');
});

/* ---- Partner / opponent fairness ---- */
console.log('\nPartner and opponent fairness');

const countPartnerRepeats = (sum) =>
  [...sum.partnerCount.values()].reduce((s, c) => s + Math.max(0, c - 1), 0);

test('12p / 2c / 6r → every player gets 4 games, 2 byes, 0 partner repeats', () => {
  const players = Array.from({ length: 12 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const rounds = simulate(players, 2, 6);
  const sum = summarize(players, rounds);
  assert.strictEqual(sum.gamesPlayedDiff, 0, 'every player plays the same number of games');
  assert.strictEqual(sum.byeDiff, 0, 'every player has the same number of byes');
  const repeats = countPartnerRepeats(sum);
  assert.strictEqual(repeats, 0, `expected 0 partner repeats, got ${repeats}`);
});

test('12p / 2c / 5r → bye/games fair and minimal partner repeats', () => {
  const players = Array.from({ length: 12 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const rounds = simulate(players, 2, 5);
  const sum = summarize(players, rounds);
  assert.ok(sum.gamesPlayedDiff <= 1, `gamesPlayedDiff=${sum.gamesPlayedDiff} > 1`);
  assert.ok(sum.byeDiff <= 1, `byeDiff=${sum.byeDiff} > 1`);
  const repeats = countPartnerRepeats(sum);
  assert.ok(repeats <= 2, `expected <= 2 partner repeats, got ${repeats}`);
});

test('Fabio + Gavin regression: never partnered twice when alternatives exist (12p/2c/5r)', () => {
  // Reproduces the original bug: in the user's screenshot, Fabio and Gavin were
  // paired as partners across multiple rounds even though many other partners
  // were still untried.
  const players = ['Fabio', 'Gavin', 'Pingky', 'Filia', 'Maria', 'Esther',
    'Ridel', 'Sharon', 'Senas', 'Cindy', 'Dio', 'Fedi'];
  const rounds = simulate(players, 2, 5);
  const sum = summarize(players, rounds);
  const fg = sum.partnerCount.get(pairKey('Fabio', 'Gavin')) || 0;
  assert.ok(fg <= 1, `Fabio & Gavin partner count = ${fg}, expected <= 1`);
  // Total partner repeats should be near-zero for this configuration.
  const repeats = countPartnerRepeats(sum);
  assert.ok(repeats <= 2, `total partner repeats = ${repeats}, expected <= 2`);
});

test('every player has uniquePartnerCount === gamesPlayed for 12p / 2c / 6r', () => {
  const players = Array.from({ length: 12 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const rounds = simulate(players, 2, 6);
  const rep = buildFairnessReport(players, rounds, 2);
  players.forEach((p) => {
    const games = rep.gamesPlayed[p];
    const unique = rep.uniquePartnerCountByPlayer[p];
    assert.strictEqual(
      unique, games,
      `${p}: uniquePartners=${unique} but games=${games} → partner repetition happened`
    );
  });
});

/* ---- Fairness report extensions ---- */
console.log('\nFairness report extensions');

test('report includes partner / opponent lists per player', () => {
  const players = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
  const rounds = simulate(players, 2, 3);
  const rep = buildFairnessReport(players, rounds, 2);
  assert.ok(rep.partnerListByPlayer && typeof rep.partnerListByPlayer === 'object');
  assert.ok(rep.opponentListByPlayer && typeof rep.opponentListByPlayer === 'object');
  players.forEach((p) => {
    assert.ok(p in rep.partnerListByPlayer, `partnerListByPlayer missing ${p}`);
    assert.ok(p in rep.opponentListByPlayer, `opponentListByPlayer missing ${p}`);
  });
  assert.ok(typeof rep.uniquePartnerCountByPlayer[players[0]] === 'number');
  assert.ok(typeof rep.uniqueOpponentCountByPlayer[players[0]] === 'number');
  assert.ok(typeof rep.minUniquePartners === 'number');
  assert.ok(typeof rep.maxUniquePartners === 'number');
});

test('report flags full-meeting infeasibility for 12p / 2c / 5r', () => {
  const players = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
  const rounds = simulate(players, 2, 5);
  const rep = buildFairnessReport(players, rounds, 2);
  assert.strictEqual(rep.fullMeetingPossible, false);
  assert.strictEqual(rep.expectedMinRoundsForFullMeeting, 6);
  assert.ok(typeof rep.meetingCoverageRecommendation === 'string');
  assert.match(rep.meetingCoverageRecommendation, /at least 6 rounds/i);
});

test('report does NOT flag infeasibility for 12p / 2c / 6r', () => {
  const players = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
  const rounds = simulate(players, 2, 6);
  const rep = buildFairnessReport(players, rounds, 2);
  assert.strictEqual(rep.fullMeetingPossible, true);
  assert.strictEqual(rep.meetingCoverageRecommendation, null);
});

/* ---- Unique meeting optimization ---- */
console.log('\nUnique meeting optimization');

test('15p / 3c / 5r → keeps games and byes perfect', () => {
  const players = Array.from({ length: 15 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const rounds = simulate(players, 3, 5, 0xc0ffee);
  const sum = summarize(players, rounds);
  assert.ok(sum.gamesPlayedDiff <= 1, `gamesPlayedDiff=${sum.gamesPlayedDiff} > 1`);
  assert.ok(sum.byeDiff <= 1, `byeDiff=${sum.byeDiff} > 1`);
});

test('15p / 3c / 5r → pushes every player close to feasible max of 12 meetings', () => {
  const players = Array.from({ length: 15 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const rounds = simulate(players, 3, 5, 0xc0ffee);
  const rep = buildFairnessReport(players, rounds, 3);
  // Each player plays 4 games (5 rounds, 1 bye → 4 matches × 3 = 12 feasible meetings).
  // The optimizer should keep every player within 2 of the feasible cap, and
  // the average should be at least 11 (i.e. most players are at 11 or 12).
  players.forEach((p) => {
    const met = rep.uniqueMeetingCount[p];
    assert.ok(
      met >= 10,
      `${p} unique meetings = ${met}, expected >= 10 (feasible max 12)`
    );
  });
  assert.ok(
    rep.averageUniqueMeetings >= 10.5,
    `averageUniqueMeetings = ${rep.averageUniqueMeetings.toFixed(2)}, expected >= 10.5`
  );
});

test('15p / 3c / 5r → no player drops to poor coverage like 9', () => {
  const players = Array.from({ length: 15 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const rounds = simulate(players, 3, 5, 0xc0ffee);
  const rep = buildFairnessReport(players, rounds, 3);
  assert.ok(
    rep.minUniqueMeetings >= 10,
    `minUniqueMeetings = ${rep.minUniqueMeetings}, expected >= 10`
  );
  assert.strictEqual(
    rep.partnerRepeatPairs, 0,
    `partnerRepeatPairs = ${rep.partnerRepeatPairs}, expected 0`
  );
  assert.strictEqual(
    rep.opponentRepeatPairs, 0,
    `opponentRepeatPairs = ${rep.opponentRepeatPairs}, expected 0`
  );
});

test('report exposes meeting list, max possible, deficit, average, difference, total deficit', () => {
  const players = Array.from({ length: 15 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const rounds = simulate(players, 3, 5, 0xc0ffee);
  const rep = buildFairnessReport(players, rounds, 3);
  assert.ok(rep.uniqueMeetingListByPlayer && typeof rep.uniqueMeetingListByPlayer === 'object');
  players.forEach((p) => {
    assert.ok(Array.isArray(rep.uniqueMeetingListByPlayer[p]),
      `uniqueMeetingListByPlayer[${p}] should be an array`);
    assert.ok(typeof rep.maximumPossibleUniqueMeetingsByPlayer[p] === 'number',
      `maximumPossibleUniqueMeetingsByPlayer[${p}] missing`);
    assert.ok(typeof rep.meetingDeficitByPlayer[p] === 'number',
      `meetingDeficitByPlayer[${p}] missing`);
  });
  assert.ok(typeof rep.averageUniqueMeetings === 'number');
  assert.ok(typeof rep.uniqueMeetingDifference === 'number');
  assert.ok(typeof rep.totalMeetingDeficit === 'number');
  assert.ok(typeof rep.finalSchedulePenalty === 'number');
  assert.ok(rep.averageUniqueMeetings >= rep.minUniqueMeetings);
  assert.ok(rep.averageUniqueMeetings <= rep.maxUniqueMeetings);
  assert.strictEqual(
    rep.uniqueMeetingDifference,
    rep.maxUniqueMeetings - rep.minUniqueMeetings,
    'uniqueMeetingDifference should equal max - min'
  );
});

test('report exposes maximumPossibleUniqueMeetings consistent with feasibility cap', () => {
  const players = Array.from({ length: 15 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const rounds = simulate(players, 3, 5, 0xc0ffee);
  const rep = buildFairnessReport(players, rounds, 3);
  players.forEach((p) => {
    const games = rep.gamesPlayed[p];
    const expected = Math.min(players.length - 1, games * 3);
    assert.strictEqual(
      rep.maximumPossibleUniqueMeetingsByPlayer[p],
      expected,
      `${p}: maxPossible=${rep.maximumPossibleUniqueMeetingsByPlayer[p]} expected ${expected}`
    );
  });
});

/* ---- Summary ---- */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
