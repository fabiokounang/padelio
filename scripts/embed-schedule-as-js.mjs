import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const data = fs.readFileSync(join(root, 'js', 'normal-social-schedule-12p1.json'), 'utf8');
const hdr =
  '/**\n * Precomputed 33-round doubles schedule: 12 players × 1 court (Normal mode).\n' +
  ' * Index i = player row in tournament roster at creation time.\n */\n';

const wrap =
  hdr +
  "(function(root){\n'use strict';\n" +
  'root.__PADELIO_NORMAL_SOCIAL_12x1_ROUND33 = ' +
  data.trim() +
  ';\n})(typeof globalThis !== "undefined" ? globalThis : window);\n';

fs.writeFileSync(join(root, 'js', 'normal-social-schedule-12p1.js'), wrap);
console.log('wrote js/normal-social-schedule-12p1.js');
