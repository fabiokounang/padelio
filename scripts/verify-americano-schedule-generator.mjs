/**
 * Regression: 12 players × 1 court — full partner + opponent coverage.
 * Run: node scripts/verify-americano-schedule-generator.mjs
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const players = [
  'Fabio',
  'Pingky',
  'Maria',
  'Gavin',
  'Ridel',
  'Filia',
  'Dio',
  'Sharon',
  'Jesse',
  'Tessa',
  'Edwin',
  'Senas'
];

globalThis.window = globalThis;
require(join(__dirname, '../js/americano-schedule-generator.js'));

const { generateAmericanoSchedule } = globalThis.PadelioAmericanoSchedule;

const result = generateAmericanoSchedule(players, 1, { maxRetries: 300 });

if (!result) {
  console.error('FAIL: no result');
  process.exit(1);
}

if (!result.partnerComplete || !result.opponentComplete) {
  console.error('FAIL: incomplete coverage');
  console.error('partner missing:', result.partnerCoverage.missing.length);
  console.error('opponent missing:', result.opponentCoverage.missing.length);
  process.exit(1);
}

const expectedPairs = (12 * 11) / 2;
if (result.partnerCoverage.totalCovered !== expectedPairs) {
  console.error('FAIL: partner count', result.partnerCoverage.totalCovered);
  process.exit(1);
}
if (result.opponentCoverage.totalCovered !== expectedPairs) {
  console.error('FAIL: opponent count', result.opponentCoverage.totalCovered);
  process.exit(1);
}

console.log(
  'OK:',
  result.totalRounds,
  'rounds,',
  result.totalMatches,
  'matches,',
  'min partner matches',
  result.minimumPartnerMatches
);
