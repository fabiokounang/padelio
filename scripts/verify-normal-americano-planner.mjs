/**
 * Dynamic fairness verification for Normal Americano planner.
 * Runs a matrix of (players, courts, rounds) and prints fairness stats.
 * Exit code != 0 if any hard invariant fails.
 *
 * Run: node scripts/verify-normal-americano-planner.mjs
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const {
  planNormalAmericanoRound,
  computeRoundCapacity,
  buildFairnessReport
} = require(join(__dirname, '../js/normal-americano-planner.js'));

const cases = [
  { n: 4, c: 1, r: 5 },
  { n: 5, c: 1, r: 5 },
  { n: 6, c: 1, r: 6 },
  { n: 7, c: 1, r: 7 },
  { n: 8, c: 1, r: 8 },
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

const extraRoundCounts = [3, 4, 5, 6, 7, 9, 10, 12];

const playersOf = (n) =>
  Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);

let failures = 0;
let total = 0;

function runOne (n, c, r) {
  total++;
  const players = playersOf(n);
  const priorRounds = [];
  for (let i = 1; i <= r; i++) {
    const out = planNormalAmericanoRound({
      players,
      courts: c,
      priorRounds,
      roundNo: i
    });
    if (out.error) {
      console.error(`FAIL ${n}p/${c}c/${r}r round ${i}: ${out.error}`);
      failures++;
      return;
    }
    priorRounds.push({ round: i, matches: out.matches });
  }

  const cap = computeRoundCapacity(n, c);
  const seenCourts = new Set();
  for (const round of priorRounds) {
    if (round.matches.length !== cap.usedCourtsPerRound) {
      console.error(
        `FAIL ${n}p/${c}c/${r}r: round ${round.round} match count ${round.matches.length} != ${cap.usedCourtsPerRound}`
      );
      failures++;
      return;
    }
    const ps = new Set();
    for (const m of round.matches) {
      if (m.team1.length !== 2 || m.team2.length !== 2) {
        console.error(`FAIL ${n}p/${c}c/${r}r: invalid match shape`);
        failures++;
        return;
      }
      [...m.team1, ...m.team2].forEach((p) => {
        if (ps.has(p)) {
          console.error(`FAIL ${n}p/${c}c/${r}r: duplicate player ${p} in round ${round.round}`);
          failures++;
        }
        ps.add(p);
      });
      seenCourts.add(m.court);
    }
  }

  const report = buildFairnessReport(players, priorRounds, c);

  const totalSlots = r * cap.playingPlayersPerRound;
  const totalBye = r * cap.byePlayersPerRound;
  const fmt = (x) => x.toFixed(2);

  const ok = report.gamesPlayedDifference <= 1 && report.byeDifference <= 1;
  const status = ok ? 'OK  ' : 'WARN';
  if (!ok) failures++;

  const partnerRepeats = report.partnerRepeats.reduce(
    (s, x) => s + (x.count - 1),
    0
  );
  const opponentRepeats = report.opponentRepeats.reduce(
    (s, x) => s + (x.count - 1),
    0
  );
  const feasibility = report.fullMeetingPossible ? 'fullMeet' : `needR>=${report.expectedMinRoundsForFullMeeting}`;

  console.log(
    `[${status}] n=${String(n).padStart(2)} c=${c} r=${String(r).padStart(2)} ` +
    `used=${cap.usedCourtsPerRound} ` +
    `Gmin/max=${report.minGamesPlayed}/${report.maxGamesPlayed} ` +
    `Bmin/max=${report.minByeCount}/${report.maxByeCount} ` +
    `gDiff=${report.gamesPlayedDifference} bDiff=${report.byeDifference} ` +
    `Pdup=${partnerRepeats} Odup=${opponentRepeats} ` +
    `Mmin/max=${report.minUniqueMeetings}/${report.maxUniqueMeetings} ` +
    `Mavg=${fmt(report.averageUniqueMeetings)} ` +
    `Mdiff=${report.uniqueMeetingDifference} ` +
    `Mdef=${report.totalMeetingDeficit} ` +
    `ideal=${fmt(totalSlots / n)} byeIdeal=${fmt(totalBye / n)} ` +
    `${feasibility} pen=${report.finalSchedulePenalty} ` +
    `score=${report.fairnessScore} ${report.rating}`
  );
}

console.log('=== Primary matrix ===');
for (const { n, c, r } of cases) runOne(n, c, r);

console.log('\n=== Round-count sweep at 12p/2c ===');
extraRoundCounts.forEach((r) => runOne(12, 2, r));

console.log('\n=== Round-count sweep at 16p/3c ===');
extraRoundCounts.forEach((r) => runOne(16, 3, r));

console.log(`\nTotal cases: ${total}, failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
