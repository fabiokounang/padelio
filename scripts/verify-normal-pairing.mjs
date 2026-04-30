/**
 * Mirrors normal-mode round generation from js/script.js (no browser).
 * Run: node scripts/verify-normal-pairing.mjs
 */

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pairKey = (a, b) => {
  const x = String(a || '');
  const y = String(b || '');
  return x < y ? `${x}__${y}` : `${y}__${x}`;
};

function buildMixHistoryFromRounds (rounds) {
  const partnerCount = new Map();
  const opposeCount = new Map();
  rounds.forEach((r) => {
    (r.matches || []).forEach((m) => {
      const t1 = m.team1 || [];
      const t2 = m.team2 || [];
      if (t1.length === 2) {
        const k = pairKey(t1[0], t1[1]);
        partnerCount.set(k, (partnerCount.get(k) || 0) + 1);
      }
      if (t2.length === 2) {
        const k = pairKey(t2[0], t2[1]);
        partnerCount.set(k, (partnerCount.get(k) || 0) + 1);
      }
      t1.forEach((a) => {
        t2.forEach((b) => {
          const k = pairKey(a, b);
          opposeCount.set(k, (opposeCount.get(k) || 0) + 1);
        });
      });
    });
  });
  return { partnerCount, opposeCount };
}

const pairCrossOpposeScore = (pA, pB, opposeCount) => {
  const a1 = pA.m, a2 = pA.f, b1 = pB.m, b2 = pB.f;
  return (
    (opposeCount.get(pairKey(a1, b1)) || 0) +
    (opposeCount.get(pairKey(a1, b2)) || 0) +
    (opposeCount.get(pairKey(a2, b1)) || 0) +
    (opposeCount.get(pairKey(a2, b2)) || 0)
  );
};

const consecutiveBenchStreak = (name, priorRounds) => {
  let streak = 0;
  for (let i = priorRounds.length - 1; i >= 0; i--) {
    const on = new Set();
    (priorRounds[i].matches || []).forEach((m) => {
      for (const x of [...(m.team1 || []), ...(m.team2 || [])]) on.add(x);
    });
    if (on.has(name)) break;
    streak++;
  }
  return streak;
};

const pickActivePlayersNormal = (allNames, slots, priorRounds, roundNo) => {
  const playCount = new Map();
  priorRounds.forEach((r) => {
    (r.matches || []).forEach((m) => {
      for (const name of [...(m.team1 || []), ...(m.team2 || [])]) {
        playCount.set(name, (playCount.get(name) || 0) + 1);
      }
    });
  });
  const n = allNames.length;
  const alphaOrder = [...allNames].sort((a, b) => a.localeCompare(b));
  const pos = new Map(alphaOrder.map((name, i) => [name, i]));
  const rot = ((Number(roundNo) || 1) - 1 + n * 100) % n;
  const keyed = allNames.map((name) => ({
    name,
    played: playCount.get(name) || 0,
    streak: consecutiveBenchStreak(name, priorRounds),
    tieRot: (pos.get(name) - rot + n) % n
  }));
  keyed.sort((a, b) => {
    if (a.played !== b.played) return a.played - b.played;
    if (a.streak !== b.streak) return b.streak - a.streak;
    return a.tieRot - b.tieRot;
  });
  return keyed.slice(0, slots).map((x) => x.name);
};

const buildNormalPairs = (activeNames, partnerCount) => {
  const pool = shuffle(activeNames);
  const pairs = [];
  while (pool.length >= 2) {
    const p = pool.shift();
    let bestJ = 0;
    let bestScore = Infinity;
    for (let j = 0; j < pool.length; j++) {
      const s = partnerCount.get(pairKey(p, pool[j])) || 0;
      if (s < bestScore) {
        bestScore = s;
        bestJ = j;
      }
      if (bestScore === 0) break;
    }
    const q = pool.splice(bestJ, 1)[0];
    pairs.push({ m: p, f: q });
  }
  return pairs;
};

function generateNormalRound (players, courts, priorRounds) {
  const maxCourts = Math.min(courts, Math.floor(players.length / 4));
  const matches = [];
  const roundNo = priorRounds.length + 1;
  if (maxCourts <= 0) return { round: roundNo, matches };

  const slots = maxCourts * 4;
  const active = pickActivePlayersNormal(players, slots, priorRounds, roundNo);
  const { partnerCount, opposeCount } = buildMixHistoryFromRounds(priorRounds);
  const pairObjs = buildNormalPairs(active, partnerCount);
  const matchPool = shuffle(pairObjs);

  for (let c = 0; c < maxCourts; c++) {
    if (matchPool.length < 2) break;
    const p1 = matchPool.shift();
    const candidates = [];
    let best = Infinity;
    for (let j = 0; j < matchPool.length; j++) {
      const s = pairCrossOpposeScore(p1, matchPool[j], opposeCount);
      if (s < best) {
        best = s;
        candidates.length = 0;
        candidates.push(j);
      } else if (s === best) {
        candidates.push(j);
      }
    }
    const pickJ = candidates[Math.floor(Math.random() * candidates.length)];
    const p2 = matchPool.splice(pickJ, 1)[0];
    matches.push({
      court: c + 1,
      team1: [p1.m, p1.f],
      team2: [p2.m, p2.f],
      score1: '',
      score2: ''
    });
  }
  return { round: roundNo, matches };
}

function playCountsAfter (rounds, players) {
  const m = new Map();
  players.forEach((p) => m.set(p, 0));
  rounds.forEach((r) => {
    (r.matches || []).forEach((mat) => {
      for (const name of [...(mat.team1 || []), ...(mat.team2 || [])]) {
        m.set(name, (m.get(name) || 0) + 1);
      }
    });
  });
  return m;
}

function maxPartnerRepeat (rounds) {
  const { partnerCount } = buildMixHistoryFromRounds(rounds);
  let max = 0;
  for (const v of partnerCount.values()) max = Math.max(max, v);
  return max;
}

function maxConsecutiveBenchStreak (rounds, players) {
  let worst = 0;
  for (const name of players) {
    let cur = 0;
    for (const r of rounds) {
      const on = new Set();
      (r.matches || []).forEach((m) => {
        for (const x of [...(m.team1 || []), ...(m.team2 || [])]) on.add(x);
      });
      if (on.has(name)) cur = 0;
      else {
        cur++;
        worst = Math.max(worst, cur);
      }
    }
  }
  return worst;
}

function runTrial (nPlayers, courts, numRounds) {
  const players = Array.from({ length: nPlayers }, (_, i) => `P${i + 1}`);
  const rounds = [];
  for (let i = 0; i < numRounds; i++) {
    rounds.push(generateNormalRound(players, courts, rounds));
  }
  const counts = playCountsAfter(rounds, players);
  const vals = [...counts.values()];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const maxPartner = maxPartnerRepeat(rounds);
  const maxSitStreak = maxConsecutiveBenchStreak(rounds, players);
  return { spread: max - min, min, max, maxPartner, maxSitStreak };
}

const NUM_ROUNDS = 40;
const TRIALS = 12;

console.log(`Normal mode simulation: ${NUM_ROUNDS} rounds × ${TRIALS} trials each (random).\n`);

for (const courts of [1, 2]) {
  console.log(`--- ${courts} court(s) ---`);
  for (let n = 10; n <= 20; n++) {
    const maxCourts = Math.min(courts, Math.floor(n / 4));
    const slots = maxCourts * 4;
    if (slots === 0) continue;

    let worstSpread = 0;
    let worstMaxPartner = 0;
    let worstSitStreak = 0;
    const spreads = [];
    for (let t = 0; t < TRIALS; t++) {
      const r = runTrial(n, courts, NUM_ROUNDS);
      spreads.push(r.spread);
      worstSpread = Math.max(worstSpread, r.spread);
      worstMaxPartner = Math.max(worstMaxPartner, r.maxPartner);
      worstSitStreak = Math.max(worstSitStreak, r.maxSitStreak);
    }
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    console.log(
      `  n=${n}  slots/round=${slots}  bench/round=${n - slots}  ` +
        `play-count spread: avg ${avgSpread.toFixed(2)}  worst ${worstSpread}  ` +
        `worst consecutive sit streak: ${worstSitStreak}  ` +
        `max same-partner (any pair): ${worstMaxPartner}`
    );
  }
  console.log('');
}

console.log('Interpretation: spread should stay 0–1 with fair benching. Partner repeat grows slowly with few opponents.');

/* --- Power level (mirrors js/script.js normal pairing term order) --- */
const DEFAULT_PLAYER_LEVEL = 3;
const MIN_PLAYER_LEVEL = 1;
const MAX_PLAYER_LEVEL = 5;
const POWER_LEVEL_PARTNER_ALPHA = 8;
const POWER_LEVEL_MATCH_BETA = 4;

const clampPlayerLevel = (v) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_PLAYER_LEVEL;
  return Math.max(MIN_PLAYER_LEVEL, Math.min(MAX_PLAYER_LEVEL, n));
};

const getLevelForPairing = (levelByName, name) => {
  if (!levelByName || !levelByName.size) return DEFAULT_PLAYER_LEVEL;
  return levelByName.has(name) ? levelByName.get(name) : DEFAULT_PLAYER_LEVEL;
};

const activeLevelSpread = (activeNames, getL) => {
  if (!activeNames.length) return 0;
  let lo = MAX_PLAYER_LEVEL;
  let hi = MIN_PLAYER_LEVEL;
  for (const n of activeNames) {
    const L = getL(n);
    if (L < lo) lo = L;
    if (L > hi) hi = L;
  }
  return hi - lo;
};

const buildNormalPairsLeveled = (activeNames, partnerCount, lastRoundPartnerSet, levelByName) => {
  const getL = (n) => getLevelForPairing(levelByName, n);
  const spread = levelByName && levelByName.size
    ? activeLevelSpread(activeNames, getL)
    : 0;
  const pool = shuffle([...activeNames]);
  const pairs = [];
  while (pool.length >= 2) {
    const p = pool.shift();
    let bestJ = 0;
    let bestScore = Infinity;
    for (let j = 0; j < pool.length; j++) {
      const q = pool[j];
      const k = pairKey(p, q);
      const partnerSeen = partnerCount.get(k) || 0;
      const repeatedFromLastRound = lastRoundPartnerSet.has(k) ? 1 : 0;
      let s = repeatedFromLastRound * 100000 + partnerSeen * 100;
      if (spread > 0) {
        const d = Math.abs(getL(p) - getL(q));
        s += POWER_LEVEL_PARTNER_ALPHA * Math.max(0, spread - d);
      }
      if (s < bestScore) {
        bestScore = s;
        bestJ = j;
      }
    }
    const q = pool.splice(bestJ, 1)[0];
    pairs.push({ m: p, f: q });
  }
  return pairs;
};

const matchupKeyV = (p1, p2) => {
  const t1 = pairKey(p1.m, p1.f);
  const t2 = pairKey(p2.m, p2.f);
  return t1 < t2 ? `${t1}||${t2}` : `${t2}||${t1}`;
};

/** One court, four players, empty history — must form 3+3 vs 3+3 in level sum for 1,1,5,5. */
const buildOneMatchLeveled = (activeNames, levelByName, partnerCount, opposeCount, matchupCount) => {
  const last = new Set();
  const getL = (n) => getLevelForPairing(levelByName, n);
  const levelSpread = activeLevelSpread(activeNames, getL);
  const neededPairs = 2;
  let best = null;
  const attempts = 200;
  for (let i = 0; i < attempts; i++) {
    const pairs = buildNormalPairsLeveled(activeNames, partnerCount, last, levelByName).slice(0, neededPairs);
    if (pairs.length < 2) continue;
    const p1 = pairs[0];
    const p2 = pairs[1];
    const sOpp = pairCrossOpposeScore(p1, p2, opposeCount);
    const sMatchup = matchupCount.get(matchupKeyV(p1, p2)) || 0;
    let pairScore = sOpp * 10 + sMatchup * 200;
    if (levelSpread > 0) {
      const s1 = getL(p1.m) + getL(p1.f);
      const s2 = getL(p2.m) + getL(p2.f);
      pairScore += POWER_LEVEL_MATCH_BETA * Math.abs(s1 - s2);
    }
    const partnerPenalty =
      (partnerCount.get(pairKey(p1.m, p1.f)) || 0) +
      (partnerCount.get(pairKey(p2.m, p2.f)) || 0);
    const score = partnerPenalty * 50 + pairScore;
    if (!best || score < best.score) best = { score, p1, p2 };
  }
  return best;
};

console.log('\n--- Power level: 1,1,5,5 four players (empty history) ---');
{
  const active = ['A', 'B', 'C', 'D'];
  const levelByName = new Map([
    ['A', 1], ['B', 1], ['C', 5], ['D', 5]
  ]);
  const partnerCount = new Map();
  const opposeCount = new Map();
  const matchupCount = new Map();
  for (let t = 0; t < 500; t++) {
    const b = buildOneMatchLeveled(active, levelByName, partnerCount, opposeCount, matchupCount);
    if (!b) throw new Error('no match');
    const s1 = levelByName.get(b.p1.m) + levelByName.get(b.p1.f);
    const s2 = levelByName.get(b.p2.m) + levelByName.get(b.p2.f);
    if (s1 !== s2) {
      throw new Error(
        `Power level smoke failed: team sums ${s1} vs ${s2} (try ${t}) — expected balanced`
      );
    }
    if (s1 !== 6) {
      throw new Error(`Expected 6+6, got ${s1}+${s2}`);
    }
  }
  console.log('OK: 500/500 trials produced 6+6 level sums (mixed 1+5 partners).');
}
