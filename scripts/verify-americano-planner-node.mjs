/**
 * Node regression checks for js/americano-round-planner.js (VM, no browser).
 * Run from repo root: node scripts/verify-americano-planner-node.mjs
 */

import fs from 'fs';
import vm from 'node:vm';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function mathWithSeed(seed) {
  let s = seed >>> 0;
  return new Proxy(Math, {
    get(target, prop, receiver) {
      if (prop === 'random') {
        return () => {
          s = Math.imul(s ^ (s >>> 13), (s === 0 ? 1 : s) >>> 1);
          return ((s ^ (s << 17)) >>> 0) / 4294967296;
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    }
  });
}

function loadPlanner(seed = null) {
  const plannerPath = join(root, 'js', 'americano-round-planner.js');
  const code = fs.readFileSync(plannerPath, 'utf8');

  const sandbox = {
    console,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Array,
    ArrayBuffer,
    Object,
    String,
    Number,
    BigInt,
    Boolean,
    Date,
    JSON,
    Reflect,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Infinity,
    NaN,
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    DataView,
    parseInt,
    parseFloat,
    isFinite,
    isNaN,
    decodeURIComponent,
    encodeURIComponent,
    undefined
  };
  sandbox.Math = seed == null ? Math : mathWithSeed(seed);
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const api = sandbox.PadelioAmericanoPlanner;
  if (!api?.planAmericanoRound) throw new Error('PadelioAmericanoPlanner.planAmericanoRound missing');
  return api;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function uniqQuartetsFromRounds(rounds, resolve) {
  const keys = new Set();
  for (const r of rounds) {
    for (const m of r.matches || []) {
      const four = [...(m.team1 || []), ...(m.team2 || [])].map(resolve);
      const k = [...new Set(four)].sort((x, y) => String(x).localeCompare(String(y))).join('|');
      keys.add(k);
    }
  }
  return keys.size;
}

console.log('verify-americano-planner-node: loading planner…');

// --- Quartet + matchup stats from one completed round ---
{
  const api = loadPlanner();
  const roster = ['Ada', 'Budi', 'Citra', 'Dewi'];
  const prior = [
    {
      round: 1,
      matches: [
        {
          court: 1,
          team1: ['Ada', 'Budi'],
          team2: ['Citra', 'Dewi'],
          score1: '',
          score2: ''
        }
      ]
    }
  ];
  const st = api.buildSessionStats(roster, prior);
  const qk =
    [...st.quartetCount.keys()].length === 1 ? [...st.quartetCount.keys()][0] : null;
  assert(qk, 'single quartet expected');
  assert(qk.includes('Ada') && qk.includes('Budi'), `quartet key ${qk}`);
  assert((st.partnerCount.get('Ada__Budi') ?? 0) === 1, 'partner tally');
}

// --- Empty history: planner returns exactly one viable court ---
{
  const api = loadPlanner();
  const out = api.planAmericanoRound({
    players: ['Ann', 'Ben', 'Cia', 'Dan'],
    courtCount: 1,
    priorRounds: [],
    roundNo: 1,
    levelByName: null,
    opts: { fixedActiveNames: ['Ann', 'Ben', 'Cia', 'Dan'] }
  });
  assert(!out.error && out.matches?.length === 1, String(out.error));
  const flat = [...out.matches[0].team1, ...out.matches[0].team2].sort().join('|');
  assert(flat === 'Ann|Ben|Cia|Dan', flat);
}

// --- Balanced: 1–1 vs 5–5 must split into equal team sums (empty history) ---
{
  const api = loadPlanner();
  const lvl = new Map([
    ['Ann', 1],
    ['Ben', 1],
    ['Cia', 5],
    ['Dan', 5]
  ]);
  const out = api.planAmericanoRound({
    players: ['Ann', 'Ben', 'Cia', 'Dan'],
    courtCount: 1,
    priorRounds: [],
    roundNo: 1,
    levelByName: lvl,
    opts: { fixedActiveNames: ['Ann', 'Ben', 'Cia', 'Dan'] }
  });
  assert(!out.error && out.matches?.length === 1);
  const m = out.matches[0];
  const sum = (t) =>
    ((lvl.get(t[0]) || 0) + (lvl.get(t[1]) || 0));
  assert(sum(m.team1) === sum(m.team2), `sums ${sum(m.team1)} vs ${sum(m.team2)}`);
}

// --- Seeded reproducibility & 12p×1court session shape ---
{
  const seed = 1337;
  const run = () => {
    const api = loadPlanner(seed);
    const players = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
    const rounds = [];
    const { resolve } = api.buildSessionStats(players, []);
    for (let rno = 1; rno <= 12; rno++) {
      const out = api.planAmericanoRound({
        players,
        courtCount: 1,
        priorRounds: rounds,
        roundNo: rno,
        levelByName: null
      });
      assert(!out.error && out.matches.length === 1, `seed ${seed} rr ${rno} ${out.error}`);
      assert(
        uniqQuartetsFromRounds([{ round: rno, matches: out.matches }], resolve) === 1,
        'one quartet identity per round'
      );
      rounds.push({ round: rno, matches: out.matches });
    }
    return JSON.stringify(rounds.map((rd) => rd.matches.map((mu) => [mu.team1, mu.team2])));
  };

  const a = run();
  const b = run();
  assert(a === b, 'seeded replay should be deterministic');
}

console.log('verify-americano-planner-node: OK');
