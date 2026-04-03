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
