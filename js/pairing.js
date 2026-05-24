/* =========================
   Padelio / pairing.js
   Pure functions: player selection, fairness, and round-building algorithms.
   No DOM, no app state — safe for unit testing in Node.js.

   Depends on scoring.js (must be loaded first in browser).

   Browser:  loaded after scoring.js, before script.js → extends window.Padelio
   Node.js:  require('./pairing.js') → returns the exported object
   ========================= */
(() => {
  'use strict';

  /* ---------- scoring dependency ---------- */
  const _scoring = (typeof module !== 'undefined' && module.exports !== undefined)
    ? require('./scoring.js')
    : (window.Padelio || {});

  const computeLeaderboardSorted = _scoring.computeLeaderboardSorted;
  const isMexicanoFamilyMode = _scoring.isMexicanoFamilyMode;

  /* ---------- private utils (local copies, no external deps) ---------- */
  const safeJsonParse = (val, fallback) => {
    if (val == null) return fallback;
    if (typeof val !== 'string') return val;
    try {
      const out = JSON.parse(val);
      return out == null ? fallback : out;
    } catch {
      return fallback;
    }
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const normalizeNameKey = (s) => String(s ?? '').trim().toLowerCase();

  const COMMON_NAME_TYPOS = new Map([['pingku', 'Pingky']]);

  const fixCommonNameTypos = (name) => {
    const t = String(name ?? '').trim();
    const canon = COMMON_NAME_TYPOS.get(normalizeNameKey(t));
    return canon != null ? canon : t;
  };

  const MIN_PLAYER_LEVEL = 1;
  const MAX_PLAYER_LEVEL = 5;
  const DEFAULT_PLAYER_LEVEL = 3;

  const clampPlayerLevel = (v) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return DEFAULT_PLAYER_LEVEL;
    return Math.max(MIN_PLAYER_LEVEL, Math.min(MAX_PLAYER_LEVEL, n));
  };

  const normalizePlayers = (arr) =>
    (Array.isArray(arr) ? arr : []).map((p) => {
      if (typeof p === 'string') {
        return { name: fixCommonNameTypos(p), gender: null, level: DEFAULT_PLAYER_LEVEL };
      }
      return {
        name: fixCommonNameTypos(String(p?.name || '')),
        gender: p?.gender || null,
        level: clampPlayerLevel(p?.level)
      };
    }).filter(p => p.name.trim().length > 0);

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

  const makeRosterNameResolve = (allNames) => {
    const map = new Map();
    (allNames || []).forEach((n) => {
      const display = fixCommonNameTypos(n);
      const k = normalizeNameKey(display);
      if (!map.has(k)) map.set(k, display);
    });
    return (raw) => {
      const fixed = fixCommonNameTypos(raw);
      return map.get(normalizeNameKey(fixed)) ?? fixed;
    };
  };

  /* ---------- round helpers ---------- */
  const getPriorRoundsCompleted = (allRounds, roundNo) =>
    (Array.isArray(allRounds) ? allRounds : [])
      .filter((r) => Number(r.round) < Number(roundNo))
      .sort((a, b) => Number(a.round) - Number(b.round));

  const getPreviousRoundDatum = (allRounds, roundNo) => {
    const want = Number(roundNo) - 1;
    if (want < 1) return null;
    const exact = allRounds.find((r) => Number(r.round) === want);
    if (exact) return exact;
    const prior = getPriorRoundsCompleted(allRounds, roundNo);
    return prior.length ? prior[prior.length - 1] : null;
  };

  /** 1 = team1 won, 2 = team2, 0 = tie or unscored. */
  const getMatchWinSide = (match) => {
    const s1 = match?.score1;
    const s2 = match?.score2;
    const empty1 = s1 === '' || s1 == null;
    const empty2 = s2 === '' || s2 == null;
    if (empty1 && empty2) return 0;
    const n1 = Number(s1) || 0;
    const n2 = Number(s2) || 0;
    if (n1 === 0 && n2 === 0) return 0;
    if (n1 > n2) return 1;
    if (n2 > n1) return 2;
    return 0;
  };

  const countRoundPlayerSlots = (roundsArr) =>
    (Array.isArray(roundsArr) ? roundsArr : []).reduce(
      (sum, r) =>
        sum +
        (r.matches || []).reduce(
          (s, m) => s + (m.team1?.length || 0) + (m.team2?.length || 0),
          0
        ),
      0
    );

  /* ---------- Mexicano court ladder ---------- */
  const getMexicanoTargetCourtsFromPrevRound = (prevRound, maxCourts, resolve) => {
    const target = new Map();
    if (!prevRound || maxCourts < 1) return target;

    (prevRound.matches || []).forEach((m) => {
      const court = Math.min(maxCourts, Math.max(1, Number(m.court) || 1));
      const winSide = getMatchWinSide(m);
      const setTeam = (team, side) => {
        (team || []).forEach((raw) => {
          const name = resolve(raw);
          let next = court;
          if (winSide === side) next = Math.max(1, court - 1);
          else if (winSide && winSide !== side) next = Math.min(maxCourts, court + 1);
          target.set(name, next);
        });
      };
      setTeam(m.team1, 1);
      setTeam(m.team2, 2);
    });
    return target;
  };

  const getMexicanoTeamTargetCourtsFromPrevRound = (prevRound, maxCourts, resolve) => {
    const target = new Map();
    if (!prevRound || maxCourts < 1) return target;

    (prevRound.matches || []).forEach((m) => {
      const court = Math.min(maxCourts, Math.max(1, Number(m.court) || 1));
      const winSide = getMatchWinSide(m);
      const t1 = m.team1 || [];
      const t2 = m.team2 || [];
      if (t1.length < 2 || t2.length < 2) return;
      const k1 = pairKey(resolve(t1[0]), resolve(t1[1]));
      const k2 = pairKey(resolve(t2[0]), resolve(t2[1]));
      const nextFor = (won) => {
        if (!winSide) return court;
        if (won) return Math.max(1, court - 1);
        return Math.min(maxCourts, court + 1);
      };
      target.set(k1, nextFor(winSide === 1));
      target.set(k2, nextFor(winSide === 2));
    });
    return target;
  };

  /** Fill courts 1..N with quads; prefer players whose ladder target matches that court. */
  const orderActiveForMexicanoCourts = (active, targetCourtByName, standingsOrder, maxCourts) => {
    const remaining = [...active];
    const standRank = new Map();
    standingsOrder.forEach((name, i) => standRank.set(name, i));
    remaining.forEach((name, i) => {
      if (!standRank.has(name)) standRank.set(name, standingsOrder.length + i);
    });

    const rankOf = (a, b) => (standRank.get(a) ?? 9999) - (standRank.get(b) ?? 9999);

    const pull = (predicate, count) => {
      remaining.sort(rankOf);
      const picked = [];
      const keep = [];
      for (const name of remaining) {
        if (picked.length < count && predicate(name)) picked.push(name);
        else keep.push(name);
      }
      remaining.length = 0;
      remaining.push(...keep);
      return picked;
    };

    const ordered = [];
    for (let c = 1; c <= maxCourts; c++) {
      let quad = pull((n) => targetCourtByName.get(n) === c, 4);
      if (quad.length < 4) quad = quad.concat(pull(() => true, 4 - quad.length));
      ordered.push(...quad);
    }
    if (remaining.length) ordered.push(...remaining);
    return ordered;
  };

  const orderPairsForMexicanoCourts = (activePairs, targetByPairKey, rankByKey, maxCourts, keyFn) => {
    const remaining = [...activePairs];
    const rankOf = (a, b) => (rankByKey.get(keyFn(a)) ?? 9999) - (rankByKey.get(keyFn(b)) ?? 9999);

    const pull = (predicate, count) => {
      remaining.sort(rankOf);
      const picked = [];
      const keep = [];
      for (const p of remaining) {
        if (picked.length < count && predicate(p)) picked.push(p);
        else keep.push(p);
      }
      remaining.length = 0;
      remaining.push(...keep);
      return picked;
    };

    const ordered = [];
    for (let c = 1; c <= maxCourts; c++) {
      let block = pull((p) => targetByPairKey.get(keyFn(p)) === c, 2);
      if (block.length < 2) block = block.concat(pull(() => true, 2 - block.length));
      ordered.push(...block);
    }
    if (remaining.length) ordered.push(...remaining);
    return ordered;
  };

  /** Swiss-system court ordering for individual players (top of standings -> court 1). */
  const orderActiveByStandings = (active, standingsOrder, rosterOrder) => {
    const standRank = new Map();
    standingsOrder.forEach((name, i) => standRank.set(name, i));
    const rosterRank = new Map();
    (rosterOrder || []).forEach((name, i) => rosterRank.set(name, i));
    return [...active].sort((a, b) => {
      const ra = standRank.get(a);
      const rb = standRank.get(b);
      if (ra != null && rb != null && ra !== rb) return ra - rb;
      if (ra != null && rb == null) return -1;
      if (ra == null && rb != null) return 1;
      const sa = rosterRank.get(a) ?? 9999;
      const sb = rosterRank.get(b) ?? 9999;
      return sa - sb;
    });
  };

  /** Swiss-system court ordering for fixed pairs (top team -> court 1 1st seat, etc.). */
  const orderPairsByTeamPoints = (activePairs, rankByKey, keyFn) => {
    return [...activePairs].sort((a, b) => {
      const ra = rankByKey.get(keyFn(a)) ?? 9999;
      const rb = rankByKey.get(keyFn(b)) ?? 9999;
      return ra - rb;
    });
  };

  const buildFixedPairsMexicanoCourtMatches = (orderedPairs) => {
    const matches = [];
    const numCourts = Math.floor(orderedPairs.length / 2);
    for (let c = 0; c < numCourts; c++) {
      const p1 = orderedPairs[c * 2];
      const p2 = orderedPairs[c * 2 + 1];
      if (!p1 || !p2) break;
      matches.push({
        court: c + 1,
        team1: [p1.m, p1.f],
        team2: [p2.m, p2.f],
        score1: '',
        score2: ''
      });
    }
    return matches;
  };

  /* ---------- pair/matchup keys ---------- */
  const matchupKey = (p1, p2) => {
    const t1 = pairKey(p1.m, p1.f);
    const t2 = pairKey(p2.m, p2.f);
    return t1 < t2 ? `${t1}||${t2}` : `${t2}||${t1}`;
  };

  /* ---------- match history ---------- */
  /**
   * Build partner/opponent/matchup history from completed rounds.
   * @param {Array} rounds  - array of round objects (already parsed, not JSON string)
   */
  const buildMixHistory = (rounds) => {
    const partnerCount = new Map();
    const opposeCount = new Map();
    const matchupCount = new Map();

    (Array.isArray(rounds) ? rounds : []).forEach((r) => {
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

        if (t1.length === 2 && t2.length === 2) {
          const k = matchupKey({ m: t1[0], f: t1[1] }, { m: t2[0], f: t2[1] });
          matchupCount.set(k, (matchupCount.get(k) || 0) + 1);
        }
      });
    });

    return { partnerCount, opposeCount, matchupCount };
  };

  /* ---------- pair scoring helpers ---------- */
  /** Cross-team opposition score for two pairs {m,f}. */
  const pairCrossOpposeScore = (pA, pB, opposeCount) => {
    const a1 = pA.m, a2 = pA.f, b1 = pB.m, b2 = pB.f;
    return (
      (opposeCount.get(pairKey(a1, b1)) || 0) +
      (opposeCount.get(pairKey(a1, b2)) || 0) +
      (opposeCount.get(pairKey(a2, b1)) || 0) +
      (opposeCount.get(pairKey(a2, b2)) || 0)
    );
  };

  const fixedPairMatchupScore = (pA, pB, matchupCount) =>
    matchupCount.get(matchupKey(pA, pB)) || 0;

  const getLastRoundFixedMatchupSet = (lastRound) => {
    const out = new Set();
    if (!lastRound) return out;
    (lastRound.matches || []).forEach((m) => {
      const t1 = m.team1 || [];
      const t2 = m.team2 || [];
      if (t1.length === 2 && t2.length === 2) {
        out.add(matchupKey({ m: t1[0], f: t1[1] }, { m: t2[0], f: t2[1] }));
      }
    });
    return out;
  };

  const scoreFixedPairCourtMatch = (p1, p2, matchupCount, opposeCount, lastRoundMatchups) => {
    let s = fixedPairMatchupScore(p1, p2, matchupCount) * 1000000;
    s += pairCrossOpposeScore(p1, p2, opposeCount) * 25;
    if (lastRoundMatchups?.has(matchupKey(p1, p2))) s += 500000;
    return s;
  };

  const fixedPairMatchingsToCourts = (pairings) =>
    pairings.map(([p1, p2], i) => ({
      court: i + 1,
      team1: [p1.m, p1.f],
      team2: [p2.m, p2.f],
      score1: '',
      score2: ''
    }));

  const enumerateFixedPairMatchings = (pairs, out) => {
    if (pairs.length === 0) { out.push([]); return; }
    if (pairs.length < 2) return;
    const [p0, ...rest] = pairs;
    for (let i = 0; i < rest.length; i++) {
      const p1 = rest[i];
      const remaining = rest.filter((_, idx) => idx !== i);
      const sub = [];
      enumerateFixedPairMatchings(remaining, sub);
      for (const sm of sub) out.push([[p0, p1], ...sm]);
    }
  };

  const buildBestFixedPairMatchesExhaustive = (selectedPairs, matchupCount, opposeCount, lastRoundMatchups) => {
    const k = selectedPairs.length;
    const numCourts = k / 2;
    const all = [];
    enumerateFixedPairMatchings([...selectedPairs], all);
    if (!all.length) return null;

    let bestScore = Infinity;
    const bestPlans = [];

    for (const plan of all) {
      if (plan.length !== numCourts) continue;
      let total = 0;
      for (const [p1, p2] of plan) {
        total += scoreFixedPairCourtMatch(p1, p2, matchupCount, opposeCount, lastRoundMatchups);
      }
      if (total < bestScore) {
        bestScore = total;
        bestPlans.length = 0;
        bestPlans.push(plan);
      } else if (total === bestScore) {
        bestPlans.push(plan);
      }
    }

    if (!bestPlans.length) return null;
    const pick = bestPlans[Math.floor(Math.random() * bestPlans.length)];
    return fixedPairMatchingsToCourts(pick);
  };

  /* ---------- level helpers ---------- */
  const makeLevelByNameMap = (playersFull) => {
    const m = new Map();
    (playersFull || []).forEach((p) => {
      m.set(p.name, clampPlayerLevel(p.level));
    });
    return m;
  };

  const getLevelForPairing = (levelByName, resolve, name) => {
    if (!levelByName || !levelByName.size) return DEFAULT_PLAYER_LEVEL;
    const k = resolve(name);
    return levelByName.has(k) ? levelByName.get(k) : DEFAULT_PLAYER_LEVEL;
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

  const POWER_LEVEL_PARTNER_ALPHA = 8;
  const POWER_LEVEL_MATCH_BETA = 4;

  /* ---------- bench streak helpers ---------- */
  const consecutiveBenchStreak = (name, priorRounds, resolve) => {
    const res = resolve || ((n) => n);
    const canon = res(name);
    let streak = 0;
    for (let i = priorRounds.length - 1; i >= 0; i--) {
      const on = new Set();
      (priorRounds[i].matches || []).forEach((m) => {
        for (const x of [...(m.team1 || []), ...(m.team2 || [])]) on.add(res(x));
      });
      if (on.has(canon)) break;
      streak++;
    }
    return streak;
  };

  const consecutiveBenchStreakForPair = (pair, priorRounds, resolve) => {
    const kWant = pairKey(resolve(pair.m), resolve(pair.f));
    let streak = 0;
    for (let i = priorRounds.length - 1; i >= 0; i--) {
      let on = false;
      (priorRounds[i].matches || []).forEach((m) => {
        for (const t of [m.team1, m.team2]) {
          if (t && t.length === 2) {
            const k = pairKey(resolve(t[0]), resolve(t[1]));
            if (k === kWant) on = true;
          }
        }
      });
      if (on) break;
      streak++;
    }
    return streak;
  };

  const getLastRoundPartnerSet = (prevRoundDatum, resolve) => {
    const res = resolve || ((x) => String(x ?? '').trim());
    const out = new Set();
    if (!prevRoundDatum) return out;
    (prevRoundDatum.matches || []).forEach((m) => {
      const t1 = m.team1 || [];
      const t2 = m.team2 || [];
      if (t1.length === 2) out.add(pairKey(res(t1[0]), res(t1[1])));
      if (t2.length === 2) out.add(pairKey(res(t2[0]), res(t2[1])));
    });
    return out;
  };

  const getFixedPairsOnCourtLastRound = (lastRound, resolve) => {
    const onCourt = new Set();
    if (!lastRound) return onCourt;
    (lastRound.matches || []).forEach((m) => {
      for (const team of [m.team1, m.team2]) {
        if (team && team.length === 2) {
          onCourt.add(pairKey(resolve(team[0]), resolve(team[1])));
        }
      }
    });
    return onCourt;
  };

  /* ---------- fairness tier ---------- */
  const fairnessTierCmp = (a, b) => {
    if (a.played !== b.played) return a.played - b.played;
    if (a.benchedLastRound !== b.benchedLastRound) return a.benchedLastRound ? -1 : 1;
    if (a.streak !== b.streak) return b.streak - a.streak;
    return 0;
  };

  const shuffleFairnessRuns = (rows) => {
    const sorted = [...rows].sort(fairnessTierCmp);
    const out = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && fairnessTierCmp(sorted[i], sorted[j]) === 0) j++;
      const run = sorted.slice(i, j);
      shuffle(run);
      out.push(...run);
      i = j;
    }
    return out;
  };

  /* ---------- player selection ---------- */
  const pickActivePlayersNormal = (allNames, slots, allRounds, roundNo) => {
    const resolve = makeRosterNameResolve(allNames);
    const priorRounds = getPriorRoundsCompleted(allRounds, roundNo);
    const lastRound = getPreviousRoundDatum(allRounds, roundNo);
    const playCount = new Map();
    const playedLastRound = new Set();

    priorRounds.forEach((r) => {
      (r.matches || []).forEach((m) => {
        for (const name of [...(m.team1 || []), ...(m.team2 || [])]) {
          const c = resolve(name);
          playCount.set(c, (playCount.get(c) || 0) + 1);
        }
      });
    });
    if (lastRound) {
      (lastRound.matches || []).forEach((m) => {
        for (const name of [...(m.team1 || []), ...(m.team2 || [])]) {
          playedLastRound.add(resolve(name));
        }
      });
    }

    const keyed = allNames.map((name) => ({
      name,
      played: playCount.get(resolve(name)) ?? playCount.get(name) ?? 0,
      streak: consecutiveBenchStreak(name, priorRounds, resolve),
      benchedLastRound: lastRound ? !playedLastRound.has(resolve(name)) : false
    }));

    if (!lastRound) return allNames.slice(0, slots);

    const ordered = shuffleFairnessRuns(keyed);
    return ordered.slice(0, slots).map((x) => x.name);
  };

  const pickActiveFixedPairs = (allPairs, pairSlots, allRounds, roundNo) => {
    const flatNames = allPairs.flatMap((p) => [p.m, p.f]);
    const resolve = makeRosterNameResolve(flatNames);
    const tKey = (p) => pairKey(resolve(p.m), resolve(p.f));

    const priorRounds = getPriorRoundsCompleted(allRounds, roundNo);
    const lastRound = getPreviousRoundDatum(allRounds, roundNo);
    const playCount = new Map();
    allPairs.forEach((p) => playCount.set(tKey(p), 0));

    priorRounds.forEach((r) => {
      (r.matches || []).forEach((m) => {
        for (const team of [m.team1, m.team2]) {
          if (team && team.length === 2) {
            const k = pairKey(resolve(team[0]), resolve(team[1]));
            if (playCount.has(k)) playCount.set(k, (playCount.get(k) || 0) + 1);
          }
        }
      });
    });

    const playedLastRound = new Set();
    if (lastRound) {
      (lastRound.matches || []).forEach((m) => {
        for (const team of [m.team1, m.team2]) {
          if (team && team.length === 2) {
            playedLastRound.add(pairKey(resolve(team[0]), resolve(team[1])));
          }
        }
      });
    }

    const n = allPairs.length;
    const keyToIdx = new Map(allPairs.map((p, i) => [tKey(p), i]));
    const rot = ((Number(roundNo) || 1) - 1 + n * 100) % n;

    if (!lastRound) return allPairs.slice(0, pairSlots);

    const keyed = allPairs.map((p) => {
      const tk = tKey(p);
      return {
        pair: p,
        key: tk,
        played: playCount.get(tk) || 0,
        streak: consecutiveBenchStreakForPair(p, priorRounds, resolve),
        tieRot: (keyToIdx.get(tk) - rot + n) % n,
        benchedLastRound: lastRound ? !playedLastRound.has(tk) : false
      };
    });

    const byPriority = (a, b) => {
      if (a.benchedLastRound !== b.benchedLastRound) return a.benchedLastRound ? -1 : 1;
      if (a.played !== b.played) return a.played - b.played;
      if (a.streak !== b.streak) return b.streak - a.streak;
      return a.tieRot - b.tieRot;
    };

    const neverPlayed = keyed.filter((x) => x.played === 0).sort(byPriority);
    const selected = neverPlayed.slice(0, pairSlots);
    const selectedKeys = new Set(selected.map((x) => x.key));

    if (selected.length < pairSlots) {
      const needed = pairSlots - selected.length;
      const restPool = keyed.filter((x) => !selectedKeys.has(x.key)).sort(byPriority);
      selected.push(...restPool.slice(0, needed));
    }

    return selected.slice(0, pairSlots).map((x) => x.pair);
  };

  const pickActiveFixedPairsMexicano = (allPairs, pairSlots, allRounds, roundNo) => {
    const flatNames = allPairs.flatMap((p) => [p.m, p.f]);
    const resolve = makeRosterNameResolve(flatNames);
    const tKey = (p) => pairKey(resolve(p.m), resolve(p.f));
    const priorRounds = getPriorRoundsCompleted(allRounds, roundNo);
    const lastRound = getPreviousRoundDatum(allRounds, roundNo);

    const playCount = new Map();
    allPairs.forEach((p) => playCount.set(tKey(p), 0));
    priorRounds.forEach((r) => {
      (r.matches || []).forEach((m) => {
        for (const team of [m.team1, m.team2]) {
          if (team && team.length === 2) {
            const k2 = pairKey(resolve(team[0]), resolve(team[1]));
            if (playCount.has(k2)) playCount.set(k2, (playCount.get(k2) || 0) + 1);
          }
        }
      });
    });

    if (!lastRound || pairSlots <= 0) {
      return allPairs.slice(0, Math.min(pairSlots, allPairs.length));
    }

    const pairsOnCourtLast = getFixedPairsOnCourtLastRound(lastRound, resolve);
    const mustPlay = allPairs.filter((p) => !pairsOnCourtLast.has(tKey(p)));
    if (mustPlay.length > pairSlots) {
      return pickActiveFixedPairs(allPairs, pairSlots, allRounds, roundNo);
    }

    const taken = new Set();
    const selected = [];
    mustPlay.forEach((p) => {
      const k2 = tKey(p);
      if (!taken.has(k2)) { taken.add(k2); selected.push(p); }
    });

    const n = allPairs.length;
    const keyToIdx = new Map(allPairs.map((p, i) => [tKey(p), i]));
    const rot = ((Number(roundNo) || 1) - 1 + n * 100) % n;

    const pool = allPairs.filter((p) => !taken.has(tKey(p)));
    const keyed = pool.map((p) => {
      const tk = tKey(p);
      return {
        pair: p, key: tk,
        played: playCount.get(tk) || 0,
        streak: consecutiveBenchStreakForPair(p, priorRounds, resolve),
        tieRot: (keyToIdx.get(tk) - rot + n) % n
      };
    });
    keyed.sort((a, b) => {
      if (a.played !== b.played) return a.played - b.played;
      if (a.streak !== b.streak) return b.streak - a.streak;
      return a.tieRot - b.tieRot;
    });
    const need = pairSlots - selected.length;
    keyed.slice(0, need).forEach((x) => {
      if (!taken.has(x.key)) { taken.add(x.key); selected.push(x.pair); }
    });

    return selected.slice(0, pairSlots);
  };

  const pickActivePlayersMexicano = (allNames, slots, allRounds, roundNo) => {
    const resolve = makeRosterNameResolve(allNames);
    const priorRounds = getPriorRoundsCompleted(allRounds, roundNo);
    const lastRound = getPreviousRoundDatum(allRounds, roundNo);

    const playCount = new Map();
    allNames.forEach((n) => playCount.set(n, 0));
    priorRounds.forEach((r) => {
      (r.matches || []).forEach((m) => {
        for (const name of [...(m.team1 || []), ...(m.team2 || [])]) {
          const c = resolve(name);
          if (playCount.has(c)) playCount.set(c, (playCount.get(c) || 0) + 1);
        }
      });
    });

    if (!lastRound || slots <= 0) {
      return allNames.slice(0, Math.min(slots, allNames.length));
    }

    const onCourtLast = new Set();
    (lastRound.matches || []).forEach((m) => {
      for (const raw of [...(m.team1 || []), ...(m.team2 || [])]) {
        onCourtLast.add(resolve(raw));
      }
    });

    const mustPlay = allNames.filter((n) => !onCourtLast.has(resolve(n)));
    if (mustPlay.length > slots) {
      return pickActivePlayersNormal(allNames, slots, allRounds, roundNo);
    }

    const taken = new Set();
    const selected = [];
    mustPlay.forEach((n) => {
      if (!taken.has(n)) { taken.add(n); selected.push(n); }
    });

    const n = allNames.length;
    const pos = new Map(allNames.map((name, i) => [name, i]));
    const rot = ((Number(roundNo) || 1) - 1 + n * 100) % n;

    const pool = allNames.filter((name) => !taken.has(name));
    const keyed = pool.map((name) => ({
      name,
      played: playCount.get(name) || 0,
      streak: consecutiveBenchStreak(name, priorRounds, resolve),
      tieRot: (pos.get(name) - rot + n) % n
    }));

    keyed.sort((a, b) => {
      if ((a.played === 0) !== (b.played === 0)) return a.played === 0 ? -1 : 1;
      if (a.played !== b.played) return a.played - b.played;
      if (a.streak !== b.streak) return b.streak - a.streak;
      return a.tieRot - b.tieRot;
    });

    const need = slots - selected.length;
    keyed.slice(0, need).forEach((x) => {
      if (!taken.has(x.name)) { taken.add(x.name); selected.push(x.name); }
    });

    return selected.slice(0, slots);
  };

  /* ---------- match building ---------- */
  const buildNormalPairs = (activeNames, partnerCount, lastRoundPartnerSet, levelByName, rosterNames) => {
    const resolve = makeRosterNameResolve(rosterNames || activeNames);
    const getL = (n) => getLevelForPairing(levelByName, resolve, n);
    const spread = levelByName && levelByName.size
      ? activeLevelSpread(activeNames, getL)
      : 0;
    const pool = shuffle(activeNames);
    const pairs = [];
    while (pool.length >= 2) {
      const p = pool.shift();
      let bestJ = -1;
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
        if (s < bestScore) { bestScore = s; bestJ = j; }
      }
      if (bestJ < 0) bestJ = 0;
      const q = pool.splice(bestJ, 1)[0];
      pairs.push({ m: p, f: q });
    }
    return pairs;
  };

  const buildBestNormalMatches = (activeNames, maxCourts, history, allRounds, roundNo, rosterNames, levelByName) => {
    const { partnerCount, opposeCount, matchupCount } = history;
    const resolve = makeRosterNameResolve(rosterNames || activeNames);
    const prevRound = getPreviousRoundDatum(allRounds, roundNo);
    const lastRoundPartnerSet = getLastRoundPartnerSet(prevRound, resolve);
    const getL = (n) => getLevelForPairing(levelByName, resolve, n);
    const levelSpread = levelByName && levelByName.size
      ? activeLevelSpread(activeNames, getL)
      : 0;
    const neededPairs = maxCourts * 2;
    const attempts = Math.max(80, Math.min(260, activeNames.length * 18));
    let best = null;

    for (let i = 0; i < attempts; i++) {
      const pairs = buildNormalPairs(
        activeNames, partnerCount, lastRoundPartnerSet, levelByName, rosterNames
      ).slice(0, neededPairs);
      if (pairs.length < neededPairs) continue;

      const pool = shuffle([...pairs]);
      const matches = [];
      let score = 0;

      for (let c = 0; c < maxCourts; c++) {
        if (pool.length < 2) break;
        const p1 = pool.shift();
        let bestJ = -1;
        let bestPairScore = Infinity;

        for (let j = 0; j < pool.length; j++) {
          const p2 = pool[j];
          const sOpp = pairCrossOpposeScore(p1, p2, opposeCount);
          const sMatchup = matchupCount.get(matchupKey(p1, p2)) || 0;
          let pairScore = sOpp * 10 + sMatchup * 200;
          if (levelSpread > 0) {
            const s1 = getL(p1.m) + getL(p1.f);
            const s2 = getL(p2.m) + getL(p2.f);
            pairScore += POWER_LEVEL_MATCH_BETA * Math.abs(s1 - s2);
          }
          if (pairScore < bestPairScore) { bestPairScore = pairScore; bestJ = j; }
        }

        if (bestJ < 0) break;
        const p2 = pool.splice(bestJ, 1)[0];
        matches.push({
          court: c + 1,
          team1: [p1.m, p1.f],
          team2: [p2.m, p2.f],
          score1: '',
          score2: ''
        });

        const partnerPenalty =
          (partnerCount.get(pairKey(p1.m, p1.f)) || 0) +
          (partnerCount.get(pairKey(p2.m, p2.f)) || 0);
        const repeatLastRoundPenalty =
          (lastRoundPartnerSet.has(pairKey(p1.m, p1.f)) ? 1 : 0) +
          (lastRoundPartnerSet.has(pairKey(p2.m, p2.f)) ? 1 : 0);
        score += repeatLastRoundPenalty * 100000 + partnerPenalty * 50 + bestPairScore;
      }

      if (matches.length !== maxCourts) continue;
      if (!best || score < best.score) best = { score, matches };
    }

    return best?.matches || [];
  };

  const buildBestFixedPairMatches = (selectedPairs, history, lastRoundMatchups) => {
    const { opposeCount, matchupCount } = history;
    const k = selectedPairs.length;
    if (k < 2 || k % 2 !== 0) return [];
    const numCourts = k / 2;
    const lastMu = lastRoundMatchups || new Set();

    if (k <= 12) {
      const exact = buildBestFixedPairMatchesExhaustive(selectedPairs, matchupCount, opposeCount, lastMu);
      if (exact?.length === numCourts) return exact;
    }

    const attempts = Math.max(120, Math.min(400, k * 28));
    let best = null;

    for (let a = 0; a < attempts; a++) {
      const pool = shuffle([...selectedPairs]);
      const matches = [];
      let totalScore = 0;

      for (let c = 0; c < numCourts; c++) {
        if (pool.length < 2) break;
        const p1 = pool.shift();

        let bestPairScore = Infinity;
        const candidates = [];

        for (let j = 0; j < pool.length; j++) {
          const p2 = pool[j];
          const pairScore = scoreFixedPairCourtMatch(p1, p2, matchupCount, opposeCount, lastMu);
          if (pairScore < bestPairScore) {
            bestPairScore = pairScore;
            candidates.length = 0;
            candidates.push(j);
          } else if (pairScore === bestPairScore) {
            candidates.push(j);
          }
        }

        if (!candidates.length) break;
        const bestJ = candidates[Math.floor(Math.random() * candidates.length)];
        const p2 = pool.splice(bestJ, 1)[0];
        totalScore += bestPairScore;
        matches.push({
          court: c + 1,
          team1: [p1.m, p1.f],
          team2: [p2.m, p2.f],
          score1: '',
          score2: ''
        });
      }

      if (matches.length !== numCourts) continue;
      if (!best || totalScore < best.totalScore) {
        best = { totalScore, matches };
      } else if (totalScore === best.totalScore && Math.random() < 0.35) {
        best = { totalScore, matches };
      }
    }

    return best?.matches || [];
  };

  /* ---------- Mexicano scoring (team-split selection) ---------- */
  const MEXICANO_CLASSIC_SPLIT_BIAS = 38;

  const scoreMexicanoTwoTeams = (team1, team2, history, lastRoundPartnerSet, resolve, levelByName) => {
    const { partnerCount, opposeCount, matchupCount } = history;
    const a1 = resolve(team1[0]);
    const a2 = resolve(team1[1]);
    const b1 = resolve(team2[0]);
    const b2 = resolve(team2[1]);
    const pairA = { m: a1, f: a2 };
    const pairB = { m: b1, f: b2 };
    let s = 0;
    s += (partnerCount.get(pairKey(a1, a2)) || 0) * 50;
    s += (partnerCount.get(pairKey(b1, b2)) || 0) * 50;
    s += (lastRoundPartnerSet.has(pairKey(a1, a2)) ? 80000 : 0);
    s += (lastRoundPartnerSet.has(pairKey(b1, b2)) ? 80000 : 0);
    s += pairCrossOpposeScore(pairA, pairB, opposeCount) * 10;
    s += (matchupCount.get(matchupKey(pairA, pairB)) || 0) * 200;
    if (levelByName && levelByName.size) {
      const sum = (x, y) =>
        getLevelForPairing(levelByName, resolve, x) +
        getLevelForPairing(levelByName, resolve, y);
      s += POWER_LEVEL_MATCH_BETA * Math.abs(sum(a1, a2) - sum(b1, b2));
    }
    return s;
  };

  const pickBestMexicanoQuadSplit = (quadNames, history, lastRoundPartnerSet, resolve, levelByName) => {
    const [a, b, c, d] = quadNames;
    const splits = [
      { classic: true, t1: [a, b], t2: [c, d] },
      { classic: false, t1: [a, c], t2: [b, d] },
      { classic: false, t1: [a, d], t2: [b, c] }
    ];
    let best = null;
    for (const sp of splits) {
      let sc = scoreMexicanoTwoTeams(sp.t1, sp.t2, history, lastRoundPartnerSet, resolve, levelByName);
      if (!sp.classic) sc += MEXICANO_CLASSIC_SPLIT_BIAS;
      if (!best || sc < best.sc) best = { sc, t1: sp.t1, t2: sp.t2 };
    }
    return { team1: best.t1, team2: best.t2 };
  };

  /* ---------- round builders ---------- */
  const buildFixedPairsMexicanoMatches = (allPairObjs, courts, allRounds, roundNo, tournament) => {
    const maxCourts = Math.min(courts, Math.floor(allPairObjs.length / 2));
    if (maxCourts <= 0) return [];
    const needPairs = maxCourts * 2;
    const active = pickActiveFixedPairsMexicano(allPairObjs, needPairs, allRounds, roundNo);
    const flatNames = allPairObjs.flatMap((p) => [p.m, p.f]);
    const resolve = makeRosterNameResolve(flatNames);
    const tKey = (p) => pairKey(resolve(p.m), resolve(p.f));
    const keyToIdx = new Map();
    allPairObjs.forEach((p, i) => { keyToIdx.set(tKey(p), i); });
    const rn = Number(roundNo) || 1;
    const tSub = {
      ...tournament,
      rounds: JSON.stringify(
        safeJsonParse(tournament?.rounds, []).filter((r) => Number(r.round) < rn)
      )
    };
    const board = computeLeaderboardSorted(tSub, 'points');
    const pt = new Map(board.map((r) => [r.name, r.points]));
    const teamPts = (p) => (pt.get(resolve(p.m)) || 0) + (pt.get(resolve(p.f)) || 0);
    const rankByKey = new Map();
    [...active]
      .sort((a, b) => {
        const d = teamPts(b) - teamPts(a);
        if (d !== 0) return d;
        return (keyToIdx.get(tKey(a)) ?? 0) - (keyToIdx.get(tKey(b)) ?? 0);
      })
      .forEach((p, i) => rankByKey.set(tKey(p), i));

    let ordered;
    if (rn === 1) {
      ordered = [...active].sort(
        (a, b) => (keyToIdx.get(tKey(a)) ?? 0) - (keyToIdx.get(tKey(b)) ?? 0)
      );
    } else {
      ordered = orderPairsByTeamPoints(active, rankByKey, tKey);
    }
    return buildFixedPairsMexicanoCourtMatches(ordered);
  };

  /**
   * Mexicano: R1 by roster order; R2+ winners move up toward court 1.
   * @param {string[]} players - name strings
   * @param {number}   courts
   * @param {Array}    rounds  - already parsed round objects
   * @param {number}   roundNo
   * @param {object}   tournament
   * @param {Array}    [playersFull] - [{name,level,...}] for Balanced mode level display
   */
  function buildMexicanoMatches(players, courts, rounds, roundNo, tournament, playersFull) {
    const maxCourts = Math.min(courts, Math.floor(players.length / 4));
    if (maxCourts <= 0) return [];
    const slots = maxCourts * 4;
    const active = pickActivePlayersMexicano(players, slots, rounds, roundNo);

    const rn = Number(roundNo) || 1;
    const tSub = {
      ...tournament,
      rounds: JSON.stringify(
        safeJsonParse(tournament?.rounds, []).filter((r) => Number(r.round) < rn)
      )
    };

    const history = buildMixHistory(rounds);
    const prevRound = getPreviousRoundDatum(rounds, roundNo);
    const resolve = makeRosterNameResolve(players);
    const lastRoundPartnerSet = getLastRoundPartnerSet(prevRound, resolve);
    const levelByName = makeLevelByNameMap(playersFull || []);

    const board = computeLeaderboardSorted(tSub, 'points');
    const standingsOrder = board.map((row) => row.name);

    let ordered = [];
    if (rn === 1) {
      const act = new Set(active);
      ordered = players.filter((n) => act.has(n));
    } else {
      ordered = orderActiveByStandings(active, standingsOrder, players);
    }

    const matches = [];
    for (let c = 0; c < maxCourts; c++) {
      const base = c * 4;
      const quad = ordered.slice(base, base + 4);
      if (quad.length < 4) break;
      const { team1, team2 } = pickBestMexicanoQuadSplit(quad, history, lastRoundPartnerSet, resolve, levelByName);
      matches.push({ court: c + 1, team1, team2, score1: '', score2: '' });
    }
    return matches;
  }

  /**
   * Mix + Mexicano: equal M/F; same benching and per-gender standing order as Mexicano.
   */
  function buildMixMexicanoMatches(playersFull, courts, allRounds, roundNo, tournament) {
    const malesAll = playersFull.filter((p) => p.gender === 'M').map((p) => p.name);
    const femalesAll = playersFull.filter((p) => p.gender === 'F').map((p) => p.name);
    const maxCourts = Math.min(
      courts,
      Math.floor(malesAll.length / 2),
      Math.floor(femalesAll.length / 2)
    );
    if (maxCourts <= 0) return [];
    const need = maxCourts * 2;
    const activeM = pickActivePlayersMexicano(malesAll, need, allRounds, roundNo);
    const activeF = pickActivePlayersMexicano(femalesAll, need, allRounds, roundNo);
    const rn = Number(roundNo) || 1;
    const tSub = {
      ...tournament,
      rounds: JSON.stringify(
        safeJsonParse(tournament?.rounds, []).filter((r) => Number(r.round) < rn)
      )
    };

    const board = computeLeaderboardSorted(tSub, 'points');
    const standingsOrder = board.map((row) => row.name);
    const rosterNames = [...malesAll, ...femalesAll];
    const resolve = makeRosterNameResolve(rosterNames);
    const prevRound = getPreviousRoundDatum(allRounds, roundNo);

    let orderedM;
    let orderedF;
    if (rn === 1) {
      const actM = new Set(activeM);
      const actF = new Set(activeF);
      orderedM = malesAll.filter((n) => actM.has(n));
      orderedF = femalesAll.filter((n) => actF.has(n));
    } else {
      orderedM = orderActiveByStandings(activeM, standingsOrder, malesAll);
      orderedF = orderActiveByStandings(activeF, standingsOrder, femalesAll);
    }

    const history = buildMixHistory(allRounds);
    const lastRoundPartnerSet = getLastRoundPartnerSet(prevRound, resolve);
    const levelByName = makeLevelByNameMap(playersFull);

    const matches = [];
    for (let c = 0; c < maxCourts; c++) {
      const m0 = orderedM[c * 2];
      const m1 = orderedM[c * 2 + 1];
      const f0 = orderedF[c * 2];
      const f1 = orderedF[c * 2 + 1];
      if (!m0 || !m1 || !f0 || !f1) break;
      const A1 = [m0, f0]; const A2 = [m1, f1];
      const B1 = [m0, f1]; const B2 = [m1, f0];
      const sA = scoreMexicanoTwoTeams(A1, A2, history, lastRoundPartnerSet, resolve, levelByName);
      const sB = scoreMexicanoTwoTeams(B1, B2, history, lastRoundPartnerSet, resolve, levelByName);
      const useA = sA <= sB;
      matches.push({
        court: c + 1,
        team1: useA ? A1 : B1,
        team2: useA ? A2 : B2,
        score1: '',
        score2: ''
      });
    }
    return matches;
  }

  /* ---------- dual export ---------- */
  const _exports = {
    pairKey,
    matchupKey,
    makeRosterNameResolve,
    getPriorRoundsCompleted,
    getPreviousRoundDatum,
    getMatchWinSide,
    countRoundPlayerSlots,
    getMexicanoTargetCourtsFromPrevRound,
    getMexicanoTeamTargetCourtsFromPrevRound,
    orderActiveForMexicanoCourts,
    orderPairsForMexicanoCourts,
    orderActiveByStandings,
    orderPairsByTeamPoints,
    buildFixedPairsMexicanoCourtMatches,
    pairCrossOpposeScore,
    fixedPairMatchupScore,
    getLastRoundFixedMatchupSet,
    scoreFixedPairCourtMatch,
    fixedPairMatchingsToCourts,
    enumerateFixedPairMatchings,
    buildBestFixedPairMatchesExhaustive,
    makeLevelByNameMap,
    getLevelForPairing,
    activeLevelSpread,
    consecutiveBenchStreak,
    consecutiveBenchStreakForPair,
    getLastRoundPartnerSet,
    getFixedPairsOnCourtLastRound,
    fairnessTierCmp,
    shuffleFairnessRuns,
    pickActivePlayersNormal,
    pickActiveFixedPairs,
    pickActiveFixedPairsMexicano,
    pickActivePlayersMexicano,
    buildNormalPairs,
    buildBestNormalMatches,
    buildMixHistory,
    scoreMexicanoTwoTeams,
    pickBestMexicanoQuadSplit,
    buildBestFixedPairMatches,
    buildFixedPairsMexicanoMatches,
    buildMexicanoMatches,
    buildMixMexicanoMatches
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = _exports;
  } else {
    window.Padelio = Object.assign(window.Padelio || {}, _exports);
  }
})();
