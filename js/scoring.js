/* =========================
   Padelio / scoring.js
   Pure functions: match scoring profiles, leaderboard computation.
   No DOM, no state — safe for unit testing in Node.js.

   Browser:  loaded before script.js → populates window.Padelio
   Node.js:  require('./scoring.js') → returns the same object
   ========================= */
(() => {
  'use strict';

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

  /* ---------- mode helpers ---------- */
  const isMexicanoFamilyMode = (m) =>
    m === 'mexicano' || m === 'mixmex' || m === 'fixedmex';

  /* ---------- games scoring (Mexicano best-of-N) ---------- */
  const gamesNeededToWinMatch = (bestOf) =>
    Math.max(1, Math.ceil((Number(bestOf) || 3) / 2));

  const gamesOppFromEntered = (entered, profile) => {
    const W = profile.gamesTarget;
    const max = profile.bestOf;
    const s = clamp(Number(entered), 0, max);
    if (s === max) return 0;
    if (s === W) return Math.max(0, W - 1);
    if (s === 0) return W;
    return null;
  };

  const isMexGamesScoreTie = (g1, g2) => {
    const a = Number(g1) || 0;
    const b = Number(g2) || 0;
    return a === b && a > 0;
  };

  const isMexMatchComplete = (g1, g2, profile) => {
    const W = profile.gamesTarget;
    const maxTotal = profile.bestOf;
    const a = Number(g1) || 0;
    const b = Number(g2) || 0;
    if (isMexGamesScoreTie(a, b)) return false;
    if (a + b >= maxTotal) return true;
    const leader = Math.max(a, b);
    const trailer = Math.min(a, b);
    if (leader >= W && trailer >= W - 1) return true;
    if (leader >= W && leader > trailer && trailer >= 1 && a + b >= maxTotal - 1) return true;
    return false;
  };

  const mexGamesScoreHint = (profile) => {
    const W = profile.gamesTarget;
    const n = profile.bestOf;
    const ex = [`${W}-0`];
    if (n > W) ex.push(`${W}-1`, `${n}-0`, `0-${n}`);
    return `First to ${W} games (best of ${n}) · ${ex.join(', ')} · seri = skor sama (mis. 1-1)`;
  };

  const normalizeMexGamesScores = (g1, g2, profile) => {
    const W = profile.gamesTarget;
    const maxTotal = profile.bestOf;
    let a = Math.max(0, Math.floor(Number(g1) || 0));
    let b = Math.max(0, Math.floor(Number(g2) || 0));

    a = Math.min(a, maxTotal);
    b = Math.min(b, maxTotal);

    if (a === b && a > 0 && a < W && a + b <= maxTotal) {
      return { g1: a, g2: b };
    }

    if (a >= W && b >= W) {
      if (a >= b) b = Math.min(b, W - 1, Math.max(0, maxTotal - a));
      else a = Math.min(a, W - 1, Math.max(0, maxTotal - b));
    }
    if (a >= W) b = Math.min(b, Math.max(0, maxTotal - a));
    if (b >= W) a = Math.min(a, Math.max(0, maxTotal - b));

    while (a + b > maxTotal) {
      if (a >= b && a > 0) a--;
      else if (b > 0) b--;
      else break;
    }

    return { g1: a, g2: b };
  };

  const applyMexGamesScoresToMatch = (match, profile, g1, g2) => {
    const norm = normalizeMexGamesScores(g1, g2, profile);
    match.score1 = norm.g1;
    match.score2 = norm.g2;
    return norm;
  };

  const canAwardMexGame = (match, profile) => {
    const g1 = Number(match.score1) || 0;
    const g2 = Number(match.score2) || 0;
    if (isMexGamesScoreTie(g1, g2)) return false;
    return !isMexMatchComplete(g1, g2, profile);
  };

  /* ---------- scoring profile ---------- */
  const getTournamentScoringProfile = (t) => {
    const mode = t?.mode || 'normal';
    if (!isMexicanoFamilyMode(mode)) {
      return {
        style: 'rally',
        rallyCap: Number(t?.points_to_win) || 21,
        gamesTarget: null,
        bestOf: null,
        mirrorOpp: true
      };
    }
    if (t?.mex_score_kind === 'games') {
      const bestOf = Math.min(7, Math.max(3, Number(t?.mex_best_of_games) || 3));
      return {
        style: 'games',
        rallyCap: null,
        gamesTarget: gamesNeededToWinMatch(bestOf),
        bestOf,
        mirrorOpp: false
      };
    }
    return {
      style: 'rally',
      rallyCap: Number(t?.points_to_win) || 21,
      gamesTarget: null,
      bestOf: null,
      mirrorOpp: true
    };
  };

  /* ---------- leaderboard ---------- */
  const formatLeaderboardDiff = (diff) => {
    const n = Number(diff) || 0;
    return n > 0 ? `+${n}` : String(n);
  };

  const sortLeaderboardRows = (rows, sortMode) => {
    const byWinRate = sortMode === 'winRate';
    return [...rows].sort((a, b) => {
      if (byWinRate) {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        if (b.matches !== a.matches) return b.matches - a.matches;
        return String(a.name).localeCompare(String(b.name));
      }
      if (b.points !== a.points) return b.points - a.points;
      if (b.diff !== a.diff) return b.diff - a.diff;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return String(a.name).localeCompare(String(b.name));
    });
  };

  /**
   * @param {object} tournamentLike  - object with .players (JSON string) and .rounds (JSON string)
   * @param {'points'|'winRate'} [sortMode]
   */
  const computeLeaderboardSorted = (tournamentLike, sortMode = 'points') => {
    const players = normalizePlayers(safeJsonParse(tournamentLike?.players, [])).map((p) => p.name);
    const rounds = safeJsonParse(tournamentLike?.rounds, []);
    const rosterResolve = makeRosterNameResolve(players);

    const scores = {};
    players.forEach((p) => {
      scores[p] = { points: 0, conceded: 0, wins: 0, losses: 0, ties: 0, matches: 0 };
    });

    rounds.forEach((round) => {
      (round.matches || []).forEach((match) => {
        const s1 = match.score1;
        const s2 = match.score2;

        const hasScore = (s1 !== '' && s1 != null) || (s2 !== '' && s2 != null);
        if (!hasScore) return;
        if (Number(s1) === 0 && Number(s2) === 0) return;

        const score1 = Number(s1) || 0;
        const score2 = Number(s2) || 0;

        const apply = (fn) => {
          match.team1?.forEach((raw) => {
            const p = rosterResolve(raw);
            if (scores[p]) fn(p, 1);
          });
          match.team2?.forEach((raw) => {
            const p = rosterResolve(raw);
            if (scores[p]) fn(p, 2);
          });
        };

        apply((p, side) => {
          scores[p].points += side === 1 ? score1 : score2;
          scores[p].conceded += side === 1 ? score2 : score1;
        });

        if (score1 > score2) {
          apply((p, side) => {
            if (side === 1) scores[p].wins++;
            else scores[p].losses++;
          });
        } else if (score2 > score1) {
          apply((p, side) => {
            if (side === 2) scores[p].wins++;
            else scores[p].losses++;
          });
        } else {
          apply((p) => { scores[p].ties++; });
        }

        apply((p) => { scores[p].matches++; });
      });
    });

    const rows = Object.entries(scores).map(([name, data]) => {
      const winRate = data.matches > 0 ? (data.wins / data.matches) * 100 : 0;
      const diff = data.points - data.conceded;
      return { name, ...data, winRate, diff };
    });
    return sortLeaderboardRows(rows, sortMode);
  };

  /* ---------- dual export ---------- */
  const _exports = {
    isMexicanoFamilyMode,
    gamesNeededToWinMatch,
    gamesOppFromEntered,
    isMexGamesScoreTie,
    isMexMatchComplete,
    mexGamesScoreHint,
    normalizeMexGamesScores,
    applyMexGamesScoresToMatch,
    canAwardMexGame,
    getTournamentScoringProfile,
    formatLeaderboardDiff,
    sortLeaderboardRows,
    computeLeaderboardSorted,
    MIN_PLAYER_LEVEL,
    MAX_PLAYER_LEVEL,
    DEFAULT_PLAYER_LEVEL
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = _exports;
  } else {
    window.Padelio = Object.assign(window.Padelio || {}, _exports);
  }
})();
