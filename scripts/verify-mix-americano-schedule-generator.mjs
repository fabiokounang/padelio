/**
 * Mix: 12 players (6M/6F), 1 court — all M–F partners + all opponent pairs.
 * Run: node scripts/verify-mix-americano-schedule-generator.mjs
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const players = [
  { name: 'Fabio', gender: 'M' },
  { name: 'Pingky', gender: 'F' },
  { name: 'Maria', gender: 'F' },
  { name: 'Gavin', gender: 'M' },
  { name: 'Ridel', gender: 'M' },
  { name: 'Filia', gender: 'F' },
  { name: 'Dio', gender: 'M' },
  { name: 'Sharon', gender: 'F' },
  { name: 'Jesse', gender: 'M' },
  { name: 'Tessa', gender: 'F' },
  { name: 'Edwin', gender: 'M' },
  { name: 'Senas', gender: 'F' }
];

globalThis.window = globalThis;
require(join(__dirname, '../js/mix-americano-schedule-generator.js'));

const { generateMixAmericanoSchedule } = globalThis.PadelioMixAmericanoSchedule;

const result = generateMixAmericanoSchedule(players, 1, { maxRetries: 300 });

if (!result?.partnerComplete || !result?.opponentComplete) {
  console.error('FAIL: incomplete', {
    partner: result?.partnerCoverage,
    opponent: result?.opponentCoverage
  });
  process.exit(1);
}

const mfRequired = 36;
const oppRequired = 66;

if (result.partnerCoverage.totalCovered !== mfRequired) {
  console.error('FAIL: MF partners', result.partnerCoverage.totalCovered);
  process.exit(1);
}
if (result.opponentCoverage.totalCovered !== oppRequired) {
  console.error('FAIL: opponents', result.opponentCoverage.totalCovered);
  process.exit(1);
}

console.log('OK:', result.totalRounds, 'rounds,', result.totalMatches, 'matches');
