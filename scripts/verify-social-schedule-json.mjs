import rounds from '../js/normal-social-schedule-12p1.json' with { type: 'json' };

const N = 12;
const pairKey = (a, b) => (a < b ? a + '_' + b : b + '_' + a);

function splitQuad(q, s) {
  const [w, x, y, z] = q;
  return s === 0
    ? [[w, x], [y, z]]
    : s === 1
      ? [[w, y], [x, z]]
      : [[w, z], [x, y]];
}

const partner = new Set();
const oppose = new Map();

for (const r of rounds) {
  const [t1, t2] = splitQuad(r.quad, r.split);
  partner.add(pairKey(t1[0], t1[1]));
  partner.add(pairKey(t2[0], t2[1]));
  for (const a of t1)
    for (const b of t2) oppose.set(pairKey(a, b), (oppose.get(pairKey(a, b)) || 0) + 1);
}

let minOpp = Infinity;
let maxOpp = 0;
let miss = [];
for (let i = 0; i < N; i++)
  for (let j = i + 1; j < N; j++) {
    const k = pairKey(i, j);
    const v = oppose.get(k) || 0;
    if (!v) miss.push(k);
    minOpp = Math.min(minOpp, v || 999);
    maxOpp = Math.max(maxOpp, v);
  }

console.log('rounds:', rounds.length, 'partner edges:', partner.size, '/66');
console.log(
  'missing partner edges:',
  66 -
    partner.size
);
console.log(
  'oppose misses:',
  miss.length,
  miss.slice(0, 5),
  minOpp,
  maxOpp
);
if (partner.size !== 66 || miss.length) process.exit(1);
