/* =========================
   tests/scoring.test.js
   Run: node tests/scoring.test.js
   ========================= */
'use strict';

const assert = require('assert');
const {
  isMexicanoFamilyMode,
  gamesNeededToWinMatch,
  gamesOppFromEntered,
  isMexGamesScoreTie,
  isMexMatchComplete,
  normalizeMexGamesScores,
  getTournamentScoringProfile,
  formatLeaderboardDiff,
  sortLeaderboardRows,
  computeLeaderboardSorted,
  MIN_PLAYER_LEVEL,
  MAX_PLAYER_LEVEL,
  DEFAULT_PLAYER_LEVEL,
} = require('../js/scoring.js');

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

/* ---- isMexicanoFamilyMode ---- */
console.log('\nisMexicanoFamilyMode');
test('mexicano is a mexicano-family mode', () => assert.strictEqual(isMexicanoFamilyMode('mexicano'), true));
test('mixmex is a mexicano-family mode', () => assert.strictEqual(isMexicanoFamilyMode('mixmex'), true));
test('fixedmex is a mexicano-family mode', () => assert.strictEqual(isMexicanoFamilyMode('fixedmex'), true));
test('normal is not mexicano-family', () => assert.strictEqual(isMexicanoFamilyMode('normal'), false));
test('mix is not mexicano-family', () => assert.strictEqual(isMexicanoFamilyMode('mix'), false));
test('balanced is not mexicano-family', () => assert.strictEqual(isMexicanoFamilyMode('balanced'), false));

/* ---- gamesNeededToWinMatch ---- */
console.log('\ngamesNeededToWinMatch');
test('best-of-3 needs 2 wins', () => assert.strictEqual(gamesNeededToWinMatch(3), 2));
test('best-of-5 needs 3 wins', () => assert.strictEqual(gamesNeededToWinMatch(5), 3));
test('best-of-7 needs 4 wins', () => assert.strictEqual(gamesNeededToWinMatch(7), 4));
test('best-of-1 needs 1 win', () => assert.strictEqual(gamesNeededToWinMatch(1), 1));
test('default (NaN) gives 2 wins', () => assert.strictEqual(gamesNeededToWinMatch(NaN), 2));

/* ---- isMexGamesScoreTie ---- */
console.log('\nisMexGamesScoreTie');
test('1-1 is a tie', () => assert.strictEqual(isMexGamesScoreTie(1, 1), true));
test('2-2 is a tie', () => assert.strictEqual(isMexGamesScoreTie(2, 2), true));
test('0-0 is NOT a tie', () => assert.strictEqual(isMexGamesScoreTie(0, 0), false));
test('2-1 is not a tie', () => assert.strictEqual(isMexGamesScoreTie(2, 1), false));

/* ---- isMexMatchComplete ---- */
console.log('\nisMexMatchComplete');
const bo3 = { gamesTarget: 2, bestOf: 3 };
const bo5 = { gamesTarget: 3, bestOf: 5 };

// In this scoring system all bestOf games are played (no early stop).
// A match is complete when all 3 games are done (2-1, 3-0 etc.) — 2-0 is mid-match.
test('bo3: 2-1 is complete (all 3 games played, winner has 2)', () => assert.strictEqual(isMexMatchComplete(2, 1, bo3), true));
test('bo3: 1-2 is complete', () => assert.strictEqual(isMexMatchComplete(1, 2, bo3), true));
test('bo3: 3-0 is complete (all 3 games played)', () => assert.strictEqual(isMexMatchComplete(3, 0, bo3), true));
test('bo3: 0-3 is complete', () => assert.strictEqual(isMexMatchComplete(0, 3, bo3), true));
test('bo3: 2-0 is NOT complete (only 2 of 3 games played)', () => assert.strictEqual(isMexMatchComplete(2, 0, bo3), false));
test('bo3: 1-1 tie is NOT complete', () => assert.strictEqual(isMexMatchComplete(1, 1, bo3), false));
test('bo3: 1-0 is not complete', () => assert.strictEqual(isMexMatchComplete(1, 0, bo3), false));
test('bo5: 3-2 is complete (all 5 games played)', () => assert.strictEqual(isMexMatchComplete(3, 2, bo5), true));
test('bo5: 5-0 is complete', () => assert.strictEqual(isMexMatchComplete(5, 0, bo5), true));
test('bo5: 2-2 tie is NOT complete', () => assert.strictEqual(isMexMatchComplete(2, 2, bo5), false));
test('bo5: 2-1 is not complete (only 3 of 5 played)', () => assert.strictEqual(isMexMatchComplete(2, 1, bo5), false));

/* ---- normalizeMexGamesScores ---- */
console.log('\nnormalizeMexGamesScores');
test('bo3: 2-0 stays 2-0', () => {
  const r = normalizeMexGamesScores(2, 0, bo3);
  assert.deepStrictEqual(r, { g1: 2, g2: 0 });
});
test('bo3: 1-1 tie is kept as-is', () => {
  const r = normalizeMexGamesScores(1, 1, bo3);
  assert.deepStrictEqual(r, { g1: 1, g2: 1 });
});
test('bo3: over-capped 5-5 is normalized to fit within bestOf', () => {
  const r = normalizeMexGamesScores(5, 5, bo3);
  assert.ok(r.g1 + r.g2 <= bo3.bestOf, 'sum must not exceed bestOf');
});

/* ---- gamesOppFromEntered ---- */
console.log('\ngamesOppFromEntered');
// When you enter W (gamesTarget=2) the system auto-fills opp as W-1 (giving a 2-1 final).
// When you enter bestOf (3) the opp gets 0 (a 3-0 sweep).
test('bo3: entering W (2) auto-fills opp as W-1 (1)', () => assert.strictEqual(gamesOppFromEntered(2, bo3), 1));
test('bo3: entering 0, opp is W (2)', () => assert.strictEqual(gamesOppFromEntered(0, bo3), 2));
test('bo3: entering bestOf (3) gives opp 0', () => assert.strictEqual(gamesOppFromEntered(3, bo3), 0));

/* ---- getTournamentScoringProfile ---- */
console.log('\ngetTournamentScoringProfile');
test('normal mode gives rally profile', () => {
  const p = getTournamentScoringProfile({ mode: 'normal', points_to_win: 21 });
  assert.strictEqual(p.style, 'rally');
  assert.strictEqual(p.rallyCap, 21);
  assert.strictEqual(p.mirrorOpp, true);
});
test('mexicano rally mode gives rally profile', () => {
  const p = getTournamentScoringProfile({ mode: 'mexicano', mex_score_kind: 'rally', points_to_win: 24 });
  assert.strictEqual(p.style, 'rally');
  assert.strictEqual(p.rallyCap, 24);
});
test('mexicano games mode gives games profile with bestOf', () => {
  const p = getTournamentScoringProfile({ mode: 'mexicano', mex_score_kind: 'games', mex_best_of_games: 5 });
  assert.strictEqual(p.style, 'games');
  assert.strictEqual(p.bestOf, 5);
  assert.strictEqual(p.gamesTarget, 3);
  assert.strictEqual(p.mirrorOpp, false);
});
test('missing mode defaults to rally', () => {
  const p = getTournamentScoringProfile({});
  assert.strictEqual(p.style, 'rally');
});

/* ---- formatLeaderboardDiff ---- */
console.log('\nformatLeaderboardDiff');
test('positive diff has + prefix', () => assert.strictEqual(formatLeaderboardDiff(5), '+5'));
test('zero diff has no prefix', () => assert.strictEqual(formatLeaderboardDiff(0), '0'));
test('negative diff is plain negative', () => assert.strictEqual(formatLeaderboardDiff(-3), '-3'));

/* ---- sortLeaderboardRows ---- */
console.log('\nsortLeaderboardRows');
const sampleRows = [
  { name: 'Alice', points: 30, diff: 10, wins: 3, winRate: 75, matches: 4 },
  { name: 'Bob',   points: 30, diff: 15, wins: 3, winRate: 75, matches: 4 },
  { name: 'Carol', points: 40, diff: 20, wins: 4, winRate: 100, matches: 4 },
];
test('points mode: highest points first', () => {
  const sorted = sortLeaderboardRows(sampleRows, 'points');
  assert.strictEqual(sorted[0].name, 'Carol');
});
test('points mode: diff breaks tie when points equal', () => {
  const sorted = sortLeaderboardRows(sampleRows, 'points');
  assert.strictEqual(sorted[1].name, 'Bob');
  assert.strictEqual(sorted[2].name, 'Alice');
});
test('winRate mode: highest winRate first', () => {
  const sorted = sortLeaderboardRows(sampleRows, 'winRate');
  assert.strictEqual(sorted[0].name, 'Carol');
});
test('sortLeaderboardRows does not mutate input', () => {
  const copy = [...sampleRows];
  sortLeaderboardRows(sampleRows, 'points');
  assert.deepStrictEqual(sampleRows.map(r => r.name), copy.map(r => r.name));
});

/* ---- computeLeaderboardSorted ---- */
console.log('\ncomputeLeaderboardSorted');

const makeTournament = (players, rounds) => ({
  players: JSON.stringify(players),
  rounds: JSON.stringify(rounds),
});

test('empty tournament returns a row per player with zero stats', () => {
  const t = makeTournament(['Alice', 'Bob'], []);
  const rows = computeLeaderboardSorted(t);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every(r => r.points === 0 && r.matches === 0));
});

test('single match: winner has 1 win and scored points', () => {
  const t = makeTournament(['Alice', 'Bob', 'Carol', 'Dave'], [
    {
      round: 1,
      matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], score1: 21, score2: 15 }],
    },
  ]);
  const rows = computeLeaderboardSorted(t);
  const alice = rows.find(r => r.name === 'Alice');
  const carol = rows.find(r => r.name === 'Carol');
  assert.strictEqual(alice.wins, 1);
  assert.strictEqual(alice.losses, 0);
  assert.strictEqual(alice.points, 21);
  assert.strictEqual(carol.losses, 1);
  assert.strictEqual(carol.points, 15);
});

test('0-0 score is ignored (match not yet played)', () => {
  const t = makeTournament(['Alice', 'Bob', 'Carol', 'Dave'], [
    {
      round: 1,
      matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], score1: 0, score2: 0 }],
    },
  ]);
  const rows = computeLeaderboardSorted(t);
  assert.ok(rows.every(r => r.matches === 0));
});

test('tie match increments ties counter', () => {
  const t = makeTournament(['Alice', 'Bob', 'Carol', 'Dave'], [
    {
      round: 1,
      matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], score1: 21, score2: 21 }],
    },
  ]);
  const rows = computeLeaderboardSorted(t);
  assert.ok(rows.every(r => r.ties === 1));
  assert.ok(rows.every(r => r.wins === 0 && r.losses === 0));
});

test('multi-round accumulation: points sum across rounds', () => {
  const t = makeTournament(['Alice', 'Bob', 'Carol', 'Dave'], [
    {
      round: 1,
      matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], score1: 21, score2: 10 }],
    },
    {
      round: 2,
      matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], score1: 18, score2: 21 }],
    },
  ]);
  const rows = computeLeaderboardSorted(t);
  const alice = rows.find(r => r.name === 'Alice');
  assert.strictEqual(alice.points, 21 + 18);
  assert.strictEqual(alice.wins, 1);
  assert.strictEqual(alice.losses, 1);
  assert.strictEqual(alice.matches, 2);
});

test('leaderboard sorted by points descending', () => {
  const t = makeTournament(['Alice', 'Bob', 'Carol', 'Dave'], [
    {
      round: 1,
      matches: [{ team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], score1: 21, score2: 10 }],
    },
  ]);
  const rows = computeLeaderboardSorted(t);
  for (let i = 0; i < rows.length - 1; i++) {
    assert.ok(rows[i].points >= rows[i + 1].points, 'rows must be sorted points desc');
  }
});

/* ---- constants ---- */
console.log('\nconstants');
test('MIN_PLAYER_LEVEL is 1', () => assert.strictEqual(MIN_PLAYER_LEVEL, 1));
test('MAX_PLAYER_LEVEL is 5', () => assert.strictEqual(MAX_PLAYER_LEVEL, 5));
test('DEFAULT_PLAYER_LEVEL is 3', () => assert.strictEqual(DEFAULT_PLAYER_LEVEL, 3));

/* ---- summary ---- */
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
