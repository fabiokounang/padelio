/* =========================
   Padelio / Padel Americano
   Refactor: cleaner state, safer JSON, debounced saves, stable round viewing
   ========================= */

(() => {
  'use strict';

  /* ---------- DOM helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ---------- small utils ---------- */
  let adsInitialized = false;

  function updateAdVisibility(page) {
    const adWrap = document.getElementById('content-ad-wrap');
    const contentPages = ['home', 'about', 'privacy', 'terms'];

    if (!adWrap) return;

    const shouldShowAd = contentPages.includes(page);

    if (!shouldShowAd) {
      adWrap.classList.add('hidden');
      return;
    }

    adWrap.classList.remove('hidden');

    if (!adsInitialized && window.adsbygoogle) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        adsInitialized = true;
      } catch (err) {
        console.error('AdSense init error:', err);
      }
    }
  }
  
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const safeJsonParse = (val, fallback) => {
    if (val == null) return fallback;
    if (typeof val !== 'string') return val; // already object/array
    try {
      const out = JSON.parse(val);
      return out == null ? fallback : out;
    } catch {
      return fallback;
    }
  };

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  };

  const TOAST_DURATION_MS = 3200;
  const toast = (message) => {
    const prev = document.getElementById('app-toast');
    if (prev) prev.remove();

    const wrap = document.createElement('div');
    wrap.id = 'app-toast';
    wrap.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]';

    const card = document.createElement('div');
    card.className =
      'relative min-w-[260px] max-w-[88vw] px-4 py-3 pr-10 rounded-2xl border border-emerald-300/35 bg-emerald-500/20 backdrop-blur-md text-emerald-50 shadow-[0_14px_38px_-14px_rgba(16,185,129,0.65)]';
    card.style.opacity = '0';
    card.style.transition = 'opacity 180ms ease';

    const text = document.createElement('div');
    text.className = 'font-semibold text-sm leading-snug';
    text.textContent = String(message || '');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.className =
      'absolute top-1.5 right-1.5 w-7 h-7 rounded-full text-emerald-100/90 hover:text-white hover:bg-emerald-400/25 transition-colors text-base leading-none';
    closeBtn.textContent = '×';

    const timer = document.createElement('div');
    timer.className =
      'absolute left-2 right-2 bottom-1 h-0.5 rounded-full bg-emerald-200/80 origin-left';
    timer.style.width = '100%';
    timer.style.transition = `width ${TOAST_DURATION_MS}ms linear`;

    card.appendChild(text);
    card.appendChild(closeBtn);
    card.appendChild(timer);
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    let closed = false;
    const removeToast = () => {
      if (closed) return;
      closed = true;
      clearTimeout(removeTimer);
      wrap.remove();
    };

    closeBtn.addEventListener('click', removeToast, { once: true });
    const removeTimer = setTimeout(removeToast, TOAST_DURATION_MS);

    requestAnimationFrame(() => {
      card.style.opacity = '1';
      timer.style.width = '0%';
    });

  };
  const TOAST_AFTER_RELOAD_KEY = 'padelio_toast_after_reload';
  const queueToastAfterReload = (message) => {
    try {
      sessionStorage.setItem(TOAST_AFTER_RELOAD_KEY, String(message || '').trim());
    } catch {}
  };
  const flushQueuedToast = () => {
    try {
      const msg = sessionStorage.getItem(TOAST_AFTER_RELOAD_KEY);
      if (!msg) return;
      sessionStorage.removeItem(TOAST_AFTER_RELOAD_KEY);
      setTimeout(() => toast(msg), 160);
    } catch {}
  };

  const debounce = (fn, wait) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const normalizeNameKey = (s) => String(s ?? '').trim().toLowerCase();

  /** Known display typos → canonical name (case as shown). */
  const COMMON_NAME_TYPOS = new Map([['pingku', 'Pingky']]);

  const fixCommonNameTypos = (name) => {
    const t = String(name ?? '').trim();
    const canon = COMMON_NAME_TYPOS.get(normalizeNameKey(t));
    return canon != null ? canon : t;
  };

  const normalizePlayers = (arr) =>
    (Array.isArray(arr) ? arr : []).map((p) => {
      if (typeof p === 'string') return { name: fixCommonNameTypos(p), gender: null };
      return { name: fixCommonNameTypos(String(p?.name || '')), gender: p?.gender || null };
    }).filter(p => p.name.trim().length > 0);

  /** Same key for roster + add flow: trim, typo map, then case-insensitive compare. */
  const playerNameDuplicateKey = (name) =>
    normalizeNameKey(fixCommonNameTypos(String(name ?? '').trim()));

  const hasDuplicatePlayerNames = (arr) => {
    const seen = new Set();
    for (const p of normalizePlayers(arr)) {
      const k = playerNameDuplicateKey(p.name);
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  };

  const countGender = (players) => {
    const norm = normalizePlayers(players);
    let m = 0, f = 0;
    norm.forEach(p => {
      if (p.gender === 'M') m++;
      if (p.gender === 'F') f++;
    });
    return { m, f, total: norm.length };
  };

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

  /** Map match / roster spelling to one canonical roster label (incl. common typos). */
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

  const getPriorRoundsCompleted = (allRounds, roundNo) =>
    [...(Array.isArray(allRounds) ? allRounds : [])]
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

  const matchupKey = (p1, p2) => {
    const t1 = pairKey(p1.m, p1.f);
    const t2 = pairKey(p2.m, p2.f);
    return t1 < t2 ? `${t1}||${t2}` : `${t2}||${t1}`;
  };

  const getPlayersFull = () => {
    const raw = safeJsonParse(state.currentTournament?.players, []);
    return normalizePlayers(raw); // [{name, gender}]
  };

  const buildMixHistory = () => {
    const rounds = getRounds();
    const partnerCount = new Map();  // key: pairKey(M,F) => times partnered
    const opposeCount = new Map();   // key: pairKey(A,B) => times opposed (any gender)
    const matchupCount = new Map();  // key: matchupKey(pair,pair) => times faced as full pairs

    rounds.forEach((r) => {
      (r.matches || []).forEach((m) => {
        const t1 = m.team1 || [];
        const t2 = m.team2 || [];

        // partners
        if (t1.length === 2) {
          const k = pairKey(t1[0], t1[1]);
          partnerCount.set(k, (partnerCount.get(k) || 0) + 1);
        }
        if (t2.length === 2) {
          const k = pairKey(t2[0], t2[1]);
          partnerCount.set(k, (partnerCount.get(k) || 0) + 1);
        }

        // opponents: everyone in t1 vs everyone in t2
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

  /** Cross-team opposition score for two pairs {m,f} (names; gender not required). */
  const pairCrossOpposeScore = (pA, pB, opposeCount) => {
    const a1 = pA.m, a2 = pA.f, b1 = pB.m, b2 = pB.f;
    return (
      (opposeCount.get(pairKey(a1, b1)) || 0) +
      (opposeCount.get(pairKey(a1, b2)) || 0) +
      (opposeCount.get(pairKey(a2, b1)) || 0) +
      (opposeCount.get(pairKey(a2, b2)) || 0)
    );
  };

  /** Consecutive rounds benched, counting only from the latest round backward. */
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

  /** Teammate pairs from the immediately previous round (by round number). */
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

  /** Fresh selection logic: never-played first, then benched-last-round first, then low play count. */
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

    const n = allNames.length;
    const pos = new Map(allNames.map((name, i) => [name, i]));
    const rot = ((Number(roundNo) || 1) - 1 + n * 100) % n;

    const keyed = allNames.map((name) => ({
      name,
      played: playCount.get(name) || 0,
      streak: consecutiveBenchStreak(name, priorRounds, resolve),
      tieRot: (pos.get(name) - rot + n) % n,
      benchedLastRound: lastRound ? !playedLastRound.has(name) : false
    }));

    // Round 1 is deterministic: first listed players enter first.
    if (!lastRound) return allNames.slice(0, slots);

    const byPriority = (a, b) => {
      if (a.benchedLastRound !== b.benchedLastRound) return a.benchedLastRound ? -1 : 1;
      if (a.played !== b.played) return a.played - b.played;
      if (a.streak !== b.streak) return b.streak - a.streak;
      return a.tieRot - b.tieRot;
    };

    // Hard fairness rule: anyone with zero games must be selected first.
    const neverPlayed = keyed.filter((x) => x.played === 0).sort(byPriority);
    const selected = neverPlayed.slice(0, slots);
    const selectedNames = new Set(selected.map((x) => x.name));

    if (selected.length < slots) {
      const needed = slots - selected.length;
      const restPool = keyed
        .filter((x) => !selectedNames.has(x.name))
        .sort(byPriority);
      selected.push(...restPool.slice(0, needed));
    }

    return selected.slice(0, slots).map((x) => x.name);
  };

  /**
   * Mexicano bench fairness: everyone who sat out last round MUST play this round (when n > slots).
   * Remaining slots: lowest total games, then longest bench streak, then rotation tie-break.
   */
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
      if (!taken.has(n)) {
        taken.add(n);
        selected.push(n);
      }
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
      if (a.played !== b.played) return a.played - b.played;
      if (a.streak !== b.streak) return b.streak - a.streak;
      return a.tieRot - b.tieRot;
    });

    const need = slots - selected.length;
    keyed.slice(0, need).forEach((x) => {
      if (!taken.has(x.name)) {
        taken.add(x.name);
        selected.push(x.name);
      }
    });

    return selected.slice(0, slots);
  };

  /**
   * Build teams with hard anti-repeat guard:
   * avoid using an exact teammate pair from previous round whenever possible.
   */
  const buildNormalPairs = (activeNames, partnerCount, lastRoundPartnerSet) => {
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
        const s = repeatedFromLastRound * 100000 + partnerSeen * 100;
        if (s < bestScore) {
          bestScore = s;
          bestJ = j;
        }
      }
      if (bestJ < 0) bestJ = 0;
      const q = pool.splice(bestJ, 1)[0];
      pairs.push({ m: p, f: q });
    }
    return pairs;
  };

  const buildBestNormalMatches = (activeNames, maxCourts, history, allRounds, roundNo, rosterNames) => {
    const { partnerCount, opposeCount, matchupCount } = history;
    const resolve = makeRosterNameResolve(rosterNames || activeNames);
    const prevRound = getPreviousRoundDatum(allRounds, roundNo);
    const lastRoundPartnerSet = getLastRoundPartnerSet(prevRound, resolve);
    const neededPairs = maxCourts * 2;
    const attempts = Math.max(80, Math.min(260, activeNames.length * 18));
    let best = null;

    for (let i = 0; i < attempts; i++) {
      const pairs = buildNormalPairs(activeNames, partnerCount, lastRoundPartnerSet).slice(0, neededPairs);
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
          const pairScore = sOpp * 10 + sMatchup * 200;
          if (pairScore < bestPairScore) {
            bestPairScore = pairScore;
            bestJ = j;
          }
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

  function selectMode (mode) {
    if (mode === 'mix') state.newTournament.mode = 'mix';
    else if (mode === 'mexicano') state.newTournament.mode = 'mexicano';
    else state.newTournament.mode = 'normal';
    state.playerGenderDraft = 'M';
    updateGenderUI();
    navigateTo('new-title');
  };

  function setPlayerGender (g) {
    state.playerGenderDraft = (g === 'F') ? 'F' : 'M';
    updateGenderUI();
  };

  function toggleGenderDraft () {
    state.playerGenderDraft = (state.playerGenderDraft === 'M') ? 'F' : 'M';
    updateGenderUI();
  };

  function updateGenderUI () {
    const isMix = state.newTournament.mode === 'mix';

    const btn = $('gender-toggle');
    const txt = $('gender-toggle-text');
    const hint = $('gender-balance-hint');

    if (btn) btn.classList.toggle('hidden', !isMix);

    if (txt) {
      txt.textContent = (state.playerGenderDraft === 'F') ? 'Female' : 'Male';
    }

    if (hint) {
      hint.classList.toggle('hidden', !isMix);
      if (isMix) {
        const { m, f } = countGender(state.newTournament.players);
        hint.textContent = `Current: Male ${m} • Female ${f} (must be equal to start)`;
      }
    }
  };

  /* ---------- App state ---------- */
  const state = {
    isEditingScore: false,
    lastRoundsView: null,
    viewingRound: null,
    deferredInstallPrompt: null,
    /** Read-only spectator mode when opening #p=… share link (no create/edit/delete). */
    shareViewerMode: false,
    shareViewerData: null,

    tournaments: [],
    currentTournament: null,

    playerGenderDraft: 'M',

    newTournament: {
      mode: 'normal', // 'normal' | 'mix' | 'mexicano'
      title: '',
      courts: 0,
      points: 0,
      players: []
    },

    /** Leaderboard sub-view: detailed cards vs compact screenshot-friendly list. */
    hostLeaderboardLayout: 'standard',
    shareLeaderboardLayout: 'standard',
    /** Ranking: total points (Americano default) vs win rate % for display order. */
    hostLeaderboardSort: 'points',
    shareLeaderboardSort: 'points'
  };

  /** Bump when you ship user-visible fixes or features (shown on home). */
  const APP_VERSION = '1.4.11';

  const defaultConfig = { app_title: 'Padelio' };

  const refreshAppVersionLabel = () => {
    const el = $('app-version');
    if (el) el.textContent = `Version ${APP_VERSION}`;
  };

  /* ---------- Round helpers ---------- */
  const syncCurrentTournament = () => {
    if (state.shareViewerMode) return;
    if (!state.currentTournament) return;
    const fresh = state.tournaments.find(
      (t) => t.__backendId === state.currentTournament.__backendId
    );
    if (!fresh) return;

    const curR = safeJsonParse(state.currentTournament.rounds, []);
    const freshR = safeJsonParse(fresh.rounds, []);
    const wCur = countRoundPlayerSlots(curR);
    const wFresh = countRoundPlayerSlots(freshR);

    // Avoid clobbering in-memory round history with a stale list copy (e.g. before onDataChanged).
    if (wFresh < wCur || freshR.length < curR.length) {
      state.currentTournament = {
        ...fresh,
        rounds: state.currentTournament.rounds,
        current_round: String(
          Math.max(Number(state.currentTournament.current_round) || 1, Number(fresh.current_round) || 1)
        )
      };
      return;
    }

    state.currentTournament = fresh;
  };

  const getRounds = () =>
    safeJsonParse(state.currentTournament?.rounds, []);

  const setRounds = (roundsArr) => {
    if (!state.currentTournament) return;
    state.currentTournament.rounds = JSON.stringify(roundsArr);
  };

  const getPlayers = () => {
    const raw = safeJsonParse(state.currentTournament?.players, []);
    const norm = normalizePlayers(raw);
    return norm.map(p => p.name);
  };

  const getMaxRoundNumber = () => {
    if (!state.currentTournament) return 1;
    const rounds = getRounds();
    const maxFromRounds = rounds.reduce(
      (m, r) => Math.max(m, Number(r.round) || 1),
      1
    );
    const cr = Number(state.currentTournament.current_round) || 1;
    return Math.max(cr, maxFromRounds, 1);
  };

  const ensureViewingRoundValid = () => {
    if (!state.currentTournament) return;
    const maxRound = getMaxRoundNumber();
    if (state.viewingRound == null) state.viewingRound = state.currentTournament.current_round;
    state.viewingRound = clamp(Number(state.viewingRound) || 1, 1, maxRound);
  };

  /* ---------- Persist ---------- */
  const saveCurrentTournament = async () => {
    if (state.shareViewerMode) return;
    if (!state.currentTournament || !window.dataSdk) return;

    const result = await window.dataSdk.update(state.currentTournament);

    // keep reference fresh if SDK returns updated object
    if (result && result.isOk && result.data) {
      state.currentTournament = result.data;
      const i = state.tournaments.findIndex(
        (t) => t.__backendId === result.data.__backendId
      );
      if (i >= 0) state.tournaments[i] = result.data;
    }
    return result;
  };

  const debouncedSaveTournament = debounce(() => {
    // fire & forget (no await) to keep typing smooth
    saveCurrentTournament().catch(() => {});
  }, 250);

  /* ---------- Data SDK handler ---------- */
  const dataHandler = {
    onDataChanged(data) {
      if (state.shareViewerMode) return;
      state.tournaments = Array.isArray(data) ? data : [];

      // sync currentTournament to latest object
      syncCurrentTournament();

      renderTournamentList();

      // If rounds page visible, re-render the *viewingRound* safely
      const roundsPageVisible = !$('page-rounds')?.classList.contains('hidden');
      if (roundsPageVisible && state.currentTournament) {
        ensureViewingRoundValid();
        if (!state.isEditingScore) {
          renderSpecificRound(state.viewingRound);
        }
      }
    }
  };

  /* ---------- Element SDK init ---------- */
  if (window.elementSdk) {
    window.elementSdk.init({
      defaultConfig,
      onConfigChange: async (config) => {
        const title = (config?.app_title || defaultConfig.app_title);
        const el = $('main-title');
        if (el) el.textContent = title;
      },
      mapToCapabilities: () => ({
        recolorables: [],
        borderables: [],
        fontEditable: undefined,
        fontSizeable: undefined
      }),
      mapToEditPanelValues: (config) =>
        new Map([['app_title', config?.app_title || defaultConfig.app_title]])
    });
  }

  /* ---------- Data SDK init ---------- */
  const initApp = async () => {
    if (!window.dataSdk) return;
    const result = await window.dataSdk.init(dataHandler);
    if (!result?.isOk) console.error('Failed to initialize data SDK');
  };
  initApp();
  updateAdVisibility('home');
  refreshAppVersionLabel();
  flushQueuedToast();

  /** After long home list scroll, opening a tournament should start at the top of the rounds view. */
  const scrollAppToTop = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const app = $('app');
    if (app) app.scrollTop = 0;
  };

  const navigateTo = (page) => {
    const target = $('page-' + page);
    if (!target) {
      // Fallback for standalone pages (about/privacy/terms) where SPA sections
      // are not present in the DOM.
      const fallbackPath = {
        home: 'index.html',
        about: 'about.html',
        privacy: 'privacy-policy.html',
        terms: 'terms.html',
        contact: 'contact.html',
        guides: 'guides.html'
      }[page];

      if (fallbackPath) window.location.href = fallbackPath;
      return;
    }

    $$('.page').forEach((p) => p.classList.add('hidden'));
    target.classList.remove('hidden');
    target.classList.add('slide-in');

    if (page === 'home' && !state.shareViewerMode) {
      resetNewTournament();
      refreshAppVersionLabel();
    }

    updateAdVisibility(page);
  };

  /* ---------- New tournament flow ---------- */
  const resetNewTournament = () => {
    state.newTournament = { mode: 'normal', title: '', courts: 0, points: 0, players: [] };
    state.playerGenderDraft = 'M';

    const t = $('tournament-title');
    if (t) t.value = '';

    $$('.court-btn').forEach((b) => b.classList.remove('border-emerald-400', 'bg-emerald-600'));
    $$('.points-btn').forEach((b) => b.classList.remove('border-emerald-400', 'bg-emerald-600'));

    const list = $('players-list');
    if (list) list.innerHTML = '';

    const count = $('player-count');
    if (count) count.textContent = '0 players added';

    updateMinPlayersText();
    updateGenderUI();
    updateButtonStates();
  };

  const updateButtonStates = () => {
    const btnToPoints = $('btn-to-points');
    const btnToPlayers = $('btn-to-players');
    const btnStart = $('btn-start');

    const setDisabled = (btn, disabled) => {
      if (!btn) return;
      btn.disabled = !!disabled;
      btn.classList.toggle('opacity-50', !!disabled);
      btn.classList.toggle('cursor-not-allowed', !!disabled);
    };

    setDisabled(btnToPoints, !(state.newTournament.courts > 0));
    setDisabled(btnToPlayers, !(state.newTournament.points > 0));

    const courts = Number(state.newTournament.courts) || 0;
    const minPlayers = Math.max(4, courts * 4);
    const normPlayers = normalizePlayers(state.newTournament.players);

    let canStart = normPlayers.length >= minPlayers;

    if (state.newTournament.mode === 'mix') {
      const { m, f, total } = countGender(normPlayers);
      canStart = canStart && total % 2 === 0 && m === f; // balanced
    }

    setDisabled(btnStart, !canStart);
  };

  const goToCourts = () => {
    const input = $('tournament-title');
    const title = input?.value?.trim() || '';
    if (!title) {
      input?.focus?.();
      return;
    }
    state.newTournament.title = title;
    navigateTo('new-courts');
  };

  const selectCourts = (num) => {
    state.newTournament.courts = Number(num) || 0;
    $$('.court-btn').forEach((b) => {
      b.classList.remove('border-emerald-400', 'bg-emerald-600');
      if (Number(b.dataset.courts) === state.newTournament.courts) {
        b.classList.add('border-emerald-400', 'bg-emerald-600');
      }
    });
    updateMinPlayersText();
    updateButtonStates();
  };

  const goToPoints = () => {
    if (state.newTournament.courts > 0) navigateTo('new-points');
  };

  const selectPoints = (num) => {
    state.newTournament.points = Number(num) || 0;
    $$('.points-btn').forEach((b) => {
      b.classList.remove('border-emerald-400', 'bg-emerald-600');
      if (Number(b.dataset.points) === state.newTournament.points) {
        b.classList.add('border-emerald-400', 'bg-emerald-600');
      }
    });
    updateButtonStates();
  };

  const updateGenderBalanceWarning = () => {
    const warn = $('gender-balance-warning');
    if (!warn) return;

    if (state.newTournament.mode !== 'mix') {
      warn.classList.add('hidden');
      return;
    }

    const players = normalizePlayers(state.newTournament.players);
    const total = players.length;

    const male = players.filter(p => p.gender === 'M').length;
    const female = players.filter(p => p.gender === 'F').length;

    if (total === 0) {
      warn.classList.add('hidden');
      return;
    }

    const expected = Math.floor(total / 2);

    if (male !== female) {
      warn.textContent = `⚠ Balance needed: should be ${expected} Male and ${expected} Female`;
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  };

  const syncMexicanoPlayersHint = () => {
    const el = $('mexicano-players-hint');
    if (!el) return;
    el.classList.toggle('hidden', state.newTournament.mode !== 'mexicano');
  };

  const goToPlayers = () => {
    if (state.newTournament.points > 0) {
      navigateTo('new-players');
      updateGenderUI(); // ✅ supaya toggle muncul kalau mix
      syncMexicanoPlayersHint();
    }
  };

  const renderPlayersList = () => {
    const list = $('players-list');
    if (!list) return;

    const players = normalizePlayers(state.newTournament.players);

    list.innerHTML = players
      .map((p, i) => `
        <div class="flex items-center justify-between bg-emerald-800/50 rounded-2xl border border-emerald-600/40 px-4 py-3 slide-in shadow-cozy-sm">
          <div class="flex items-center gap-2">
            <span class="font-medium">${escapeHtml(p.name)}</span>

            ${state.newTournament.mode === 'mix'
              ? `
                <button
                  type="button"
                  onclick="togglePlayerGender(${i})"
                  class="text-xs px-2 py-1 rounded-full bg-emerald-900/50 border border-emerald-700 text-emerald-200
         hover:border-emerald-300 hover:bg-emerald-900/80 transition-all
         cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                  title="Tap to switch gender"
                >
                  ${p.gender === 'F' ? 'Female' : 'Male'}
                  <span class="ml-1 opacity-70">↺</span>
                </button>
              `
              : ''
            }
          </div>

          <button onclick="removePlayer(${i})" class="text-emerald-400 hover:text-red-400 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `)
      .join('');

    const count = $('player-count');
    if (count) count.textContent = `${players.length} players added`;
    syncMexicanoPlayersHint();
  };

  const addPlayer = () => {
    const input = $('player-name');
    const raw = input?.value?.trim() || '';
    if (!raw) return;

    state.newTournament.players = normalizePlayers(state.newTournament.players);
    const resolved = fixCommonNameTypos(raw);
    if (state.newTournament.players.some(
      (p) => playerNameDuplicateKey(p.name) === playerNameDuplicateKey(resolved)
    )) {
      toast('That name is already in the list.');
      return;
    }

    const name = resolved.charAt(0).toUpperCase() + resolved.slice(1);

    const isMix = state.newTournament.mode === 'mix';
    const gender = isMix ? state.playerGenderDraft : null;

    state.newTournament.players.push({ name, gender });

    input.value = '';
    input.focus();

    renderPlayersList();
    updateGenderBalanceWarning();
    updateGenderUI();
    updateButtonStates();
  };

  const removePlayer = (index) => {
    const norm = normalizePlayers(state.newTournament.players);
    norm.splice(index, 1);
    state.newTournament.players = norm;
    renderPlayersList();
    updateGenderBalanceWarning();
    updateGenderUI();
    updateButtonStates();
  };

  const togglePlayerGender = (index) => {
    if (state.newTournament.mode !== 'mix') return;

    const norm = normalizePlayers(state.newTournament.players);
    const p = norm[index];
    if (!p) return;

    p.gender = (p.gender === 'F') ? 'M' : 'F';
    state.newTournament.players = norm;

    renderPlayersList();
    updateGenderBalanceWarning();
    updateGenderUI();
    updateButtonStates();
  };

  const startTournament = async () => {
    const btn = $('btn-start');

    try {
      if (state.newTournament.players.length < 4) return;

      if (hasDuplicatePlayerNames(state.newTournament.players)) {
        toast('Duplicate player names. Remove duplicates before starting.');
        return;
      }

      const totalPlayers = normalizePlayers(state.newTournament.players).length;
      const totalCourts = state.newTournament.courts;
      const minPlayers = totalCourts * 4;

      if (totalPlayers < minPlayers) {
        toast(`Minimum ${minPlayers} players required for ${totalCourts} court(s).`);
        return;
      }

      if (state.newTournament.mode === 'mix') {
        const { m, f, total } = countGender(state.newTournament.players);
        if (total % 2 !== 0 || m !== f) {
          toast(`Mix Americano requires balanced gender. Male ${m} / Female ${f}.`);
          return;
        }
      }

      if (!window.dataSdk) return;

      if (state.tournaments.length >= 999) {
        toast('Maximum tournaments reached');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.dataset.originalText = btn.dataset.originalText || btn.textContent || 'Start Tournament';
        btn.innerHTML = '<span class="animate-pulse">Creating...</span>';
        btn.classList.add('opacity-50', 'cursor-not-allowed');
      }

      const tournament = {
        id: Date.now().toString(),
        title: state.newTournament.title,
        mode: state.newTournament.mode,
        courts: state.newTournament.courts,
        points_to_win: state.newTournament.points,
        players: JSON.stringify(normalizePlayers(state.newTournament.players)),
        rounds: JSON.stringify([]),
        current_round: 1,
        created_at: new Date().toISOString()
      };

      const result = await window.dataSdk.create(tournament);

      if (!result?.isOk) {
        toast('Failed to create tournament');
        return;
      }

      // ✅ sukses: balik home + reset flow
      resetNewTournament();
      navigateTo('home');

    } catch (e) {
      toast('Failed to create tournament');
    } finally {
      // ✅ tombol selalu balik normal walau sudah pindah page
      const b = $('btn-start');
      if (b) {
        b.disabled = false;
        b.textContent = b.dataset.originalText || 'Start Tournament';
        b.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }
  };

  const updateMinPlayersText = () => {
    const el = $('min-players-text');
    if (!el) return;

    const courts = state.newTournament.courts || 1;
    const minPlayers = courts * 4;

    el.textContent = `Minimum ${minPlayers} players required`;
  };

  /* ---------- Tournament list ---------- */
  function renderTournamentList () {
    const list = $('tournament-list');
    if (!list) return;

    if (state.tournaments.length === 0) {
      list.innerHTML = '<p class="text-emerald-400 text-center py-8 text-sm">No tournaments yet</p>';
      return;
    }

    list.innerHTML = state.tournaments
      .map((t) => {
        const players = safeJsonParse(t.players, []);
        const md = t.mode || 'normal';
        const modeLabel =
          md === 'mexicano' ? 'Mexicano' : md === 'mix' ? 'Mix' : 'Americano';
        return `
          <button onclick="openTournament('${t.__backendId}')" class="w-full bg-emerald-800/50 hover:bg-emerald-700/50 border border-emerald-600/50 rounded-3xl p-4 text-left transition-all slide-in shadow-cozy-sm">
            <h3 class="font-semibold text-lg mb-1">${escapeHtml(t.title)}</h3>
            <div class="flex items-center gap-4 text-sm text-emerald-300 flex-wrap">
              <span>${modeLabel}</span>
              <span>•</span>
              <span>${t.courts} court${t.courts > 1 ? 's' : ''}</span>
              <span>•</span>
              <span>${players.length} players</span>
              <span>•</span>
              <span>Round ${t.current_round}</span>
            </div>
          </button>
        `;
      })
      .join('');
  };

  /* ---------- Rounds generation/render ---------- */
  const renderCourts = (roundData) => {
    const container = $('courts-container');
    if (!container) return;

    container.innerHTML = roundData.matches
      .map(
        (match, idx) => `
        <div class="bg-emerald-800/50 rounded-3xl p-4 border border-emerald-600/45 shadow-cozy-sm">
          <div class="text-center text-sm text-emerald-400 mb-3 font-medium">Court ${match.court}</div>

          <div class="flex items-center gap-4">
            <!-- Team 1 -->
            <div class="flex-1 text-center">
              <div class="text-sm mb-2 space-y-1">
                <div class="font-medium">${escapeHtml(fixCommonNameTypos(match.team1[0]))}</div>
                <div class="font-medium">${escapeHtml(fixCommonNameTypos(match.team1[1]))}</div>
              </div>
              <div class="flex items-center justify-center gap-2">
                <input type="number" id="score-input-${idx}-1" value="${match.score1 ?? ''}" min="0"
                  onfocus="setEditingScore(true)"
                  oninput="updateScoreLive(${idx}, 1)"
                  onblur="commitScore(${idx}, 1)"
                  class="w-16 bg-emerald-700/90 border border-emerald-500/50 rounded-xl text-center text-xl font-bold text-white focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-400/25">
              </div>
            </div>

            <div class="text-2xl text-emerald-300 font-extrabold">vs</div>

            <!-- Team 2 -->
            <div class="flex-1 text-center">
              <div class="text-sm mb-2 space-y-1">
                <div class="font-medium">${escapeHtml(fixCommonNameTypos(match.team2[0]))}</div>
                <div class="font-medium">${escapeHtml(fixCommonNameTypos(match.team2[1]))}</div>
              </div>
              <div class="flex items-center justify-center gap-2">
                <input type="number" id="score-input-${idx}-2" value="${match.score2 ?? ''}" min="0"
                  onfocus="setEditingScore(true)"
                  oninput="updateScoreLive(${idx}, 2)"
                  onblur="commitScore(${idx}, 2)"
                  class="w-16 bg-emerald-700/90 border border-emerald-500/50 rounded-xl text-center text-xl font-bold text-white focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-400/25">
              </div>
            </div>
          </div>
        </div>
      `
      )
      .join('');
  };

  /**
   * Mexicano: round 1 pairs follow roster order (A+B vs C+D per block of 4).
   * Later rounds: active players ordered by standings, same block pairing (1st+2nd vs 3rd+4th in each block).
   */
  function buildMexicanoMatches (players, courts, rounds, roundNo, tournament) {
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

    let ordered = [];
    if (rn === 1) {
      const act = new Set(active);
      ordered = players.filter((n) => act.has(n));
    } else {
      const board = computeLeaderboardSorted(tSub, 'points');
      const act = new Set(active);
      ordered = board.map((row) => row.name).filter((n) => act.has(n));
      active.forEach((n) => {
        if (!ordered.includes(n)) ordered.push(n);
      });
    }

    const matches = [];
    for (let c = 0; c < maxCourts; c++) {
      const base = c * 4;
      const quad = ordered.slice(base, base + 4);
      if (quad.length < 4) break;
      matches.push({
        court: c + 1,
        team1: [quad[0], quad[1]],
        team2: [quad[2], quad[3]],
        score1: '',
        score2: ''
      });
    }
    return matches;
  }

  const generateRound = async () => {
    syncCurrentTournament();
    if (!state.currentTournament) return;

    const mode = state.currentTournament.mode || 'normal';
    const courts = Number(state.currentTournament.courts) || 1;
    const rounds = getRounds();
    const roundNo = Number(state.currentTournament.current_round) || 1;

    let roundData = rounds.find((r) => Number(r.round) === roundNo);
    if (roundData) {
      renderCourts(roundData);
      return;
    }

    // ---------- MIX MODE (rotation + fairness) ----------
    if (mode === 'mix') {
      const playersFull = getPlayersFull();
      const malesAll = playersFull.filter(p => p.gender === 'M').map(p => p.name);
      const femalesAll = playersFull.filter(p => p.gender === 'F').map(p => p.name);

      // how many courts can we actually fill in mix (needs 2M+2F per court)
      const maxCourtsByGender = Math.min(
        courts,
        Math.floor(malesAll.length / 2),
        Math.floor(femalesAll.length / 2)
      );

      if (maxCourtsByGender <= 0) {
        roundData = { round: roundNo, matches: [] };
        rounds.push(roundData);
        setRounds(rounds);
        await saveCurrentTournament();
        renderCourts(roundData);
        return;
      }

      const neededM = maxCourtsByGender * 2;
      const neededF = maxCourtsByGender * 2;

      // bench rotation: alternate who sits out by using round number offset
      const shift = (arr, k) => {
        const n = arr.length;
        if (n === 0) return [];
        const s = ((k % n) + n) % n;
        return arr.slice(s).concat(arr.slice(0, s));
      };

      const males = shift(malesAll, roundNo - 1);
      const females = shift(femalesAll, roundNo - 1);

      const activeM = males.slice(0, neededM);
      const activeF = females.slice(0, neededF);

      // fairness: try to minimize repeated partners and opponents
      const { partnerCount, opposeCount } = buildMixHistory();

      // Build MF pairs with scoring: prefer pairs with fewer past partnerings
      const pairs = [];
      const fPool = [...activeF];

      // simple greedy: for each male, pick a female that has min partnerCount with him
      activeM.forEach((m) => {
        let bestIdx = -1;
        let bestScore = Infinity;

        for (let i = 0; i < fPool.length; i++) {
          const f = fPool[i];
          const s = (partnerCount.get(pairKey(m, f)) || 0);
          if (s < bestScore) {
            bestScore = s;
            bestIdx = i;
          }
          if (bestScore === 0) break; // can't get better than 0
        }

        if (bestIdx >= 0) {
          const f = fPool.splice(bestIdx, 1)[0];
          pairs.push({ m, f });
        }
      });

      // ensure we have enough pairs for matches
      // (each court needs 2 pairs)
      const neededPairs = maxCourtsByGender * 2;
      const usablePairs = pairs.slice(0, neededPairs);

      // now pair-vs-pair, try to avoid repeated opponents (random tie-break)
      const pool = shuffle([...usablePairs]);
      const matches = [];

      for (let c = 0; c < maxCourtsByGender; c++) {
        if (pool.length < 2) break;

        const p1 = pool.shift();

        const candidates = [];
        let best = Infinity;
        for (let j = 0; j < pool.length; j++) {
          const s = pairCrossOpposeScore(p1, pool[j], opposeCount);
          if (s < best) {
            best = s;
            candidates.length = 0;
            candidates.push(j);
          } else if (s === best) {
            candidates.push(j);
          }
        }
        const bestJ = candidates[Math.floor(Math.random() * candidates.length)];
        const p2 = pool.splice(bestJ, 1)[0];

        matches.push({
          court: c + 1,
          team1: [p1.m, p1.f],
          team2: [p2.m, p2.f],
          score1: '',
          score2: ''
        });
      }

      roundData = { round: roundNo, matches };
      rounds.push(roundData);
      setRounds(rounds);
      await saveCurrentTournament();
      renderCourts(roundData);
      return;
    }

    if (mode === 'mexicano') {
      const players = getPlayers();
      const maxCourts = Math.min(courts, Math.floor(players.length / 4));
      let matches = [];
      if (maxCourts > 0) {
        matches = buildMexicanoMatches(players, courts, rounds, roundNo, state.currentTournament);
      }
      roundData = { round: roundNo, matches };
      rounds.push(roundData);
      setRounds(rounds);
      await saveCurrentTournament();
      renderCourts(roundData);
      return;
    }

    // ---------- NORMAL MODE (fair bench + partner/opponent variety) ----------
    {
      const players = getPlayers();
      const maxCourts = Math.min(courts, Math.floor(players.length / 4));
      let matches = [];

      if (maxCourts > 0) {
        const slots = maxCourts * 4;
        const active = pickActivePlayersNormal(players, slots, rounds, roundNo);
        const history = buildMixHistory();
        matches = buildBestNormalMatches(active, maxCourts, history, rounds, roundNo, players);
      }

      roundData = { round: roundNo, matches };
      rounds.push(roundData);
      setRounds(rounds);
      await saveCurrentTournament();
      renderCourts(roundData);
    }
  };

  const renderSpecificRound = (roundNumber) => {
    syncCurrentTournament();
    if (!state.currentTournament) return;

    const rounds = getRounds();
    const rn = Number(roundNumber) || 1;
    const roundData = rounds.find((r) => Number(r.round) === rn);

    const ind = $('round-indicator');
    if (ind) ind.textContent = `Round ${rn}`;

    if (!roundData) {
      const c = $('courts-container');
      if (c) {
        c.innerHTML = `
          <div class="bg-emerald-800/50 rounded-3xl p-6 border border-emerald-600/45 text-center text-emerald-200 shadow-cozy-sm">
            No data for Round ${rn} yet.
          </div>
        `;
      }
      updateRoundArrowState();
      return;
    }

    renderCourts(roundData);
    updateRoundArrowState();
  };

  /* ---------- Score editing ---------- */
  const setEditingScore = (v) => {
    state.isEditingScore = !!v;
  };

  const updateScoreLive = (matchIdx, team) => {
    syncCurrentTournament();
    if (!state.currentTournament) return;

    ensureViewingRoundValid();

    const rounds = getRounds();
    const activeRound = state.viewingRound ?? state.currentTournament.current_round;
    const roundData = rounds.find((r) => Number(r.round) === Number(activeRound));
    if (!roundData) return;

    const match = roundData.matches?.[matchIdx];
    if (!match) return;

    const maxPoints = Number(state.currentTournament.points_to_win) || 21;

    const input1 = $(`score-input-${matchIdx}-1`);
    const input2 = $(`score-input-${matchIdx}-2`);
    if (!input1 || !input2) return;

    const raw = (team === 1 ? input1.value : input2.value).trim();

    // empty => clear both, debounce save
    if (raw === '') {
      match.score1 = '';
      match.score2 = '';
      if (team === 1) input2.value = '';
      else input1.value = '';

      setRounds(rounds);
      debouncedSaveTournament();
      return;
    }

    let s = parseInt(raw, 10);
    if (!Number.isFinite(s) || s < 0) return;
    s = clamp(s, 0, maxPoints);

    const opp = Math.max(0, maxPoints - s);

    // don't rewrite the input being typed (cursor-safe)
    if (team === 1) {
      match.score1 = s;
      match.score2 = opp;
      input2.value = String(opp);
    } else {
      match.score2 = s;
      match.score1 = opp;
      input1.value = String(opp);
    }

    setRounds(rounds);
    debouncedSaveTournament();
  };

  const commitScore = (matchIdx, team) => {
    state.isEditingScore = false;

    syncCurrentTournament();
    if (!state.currentTournament) return;

    ensureViewingRoundValid();

    const rounds = getRounds();
    const activeRound = state.viewingRound ?? state.currentTournament.current_round;
    const roundData = rounds.find((r) => Number(r.round) === Number(activeRound));
    if (!roundData) return;

    const match = roundData.matches?.[matchIdx];
    if (!match) return;

    const maxPoints = Number(state.currentTournament.points_to_win) || 21;

    const input1 = $(`score-input-${matchIdx}-1`);
    const input2 = $(`score-input-${matchIdx}-2`);
    if (!input1 || !input2) return;

    const raw = (team === 1 ? input1.value : input2.value).trim();

    if (raw === '') {
      match.score1 = '';
      match.score2 = '';
      input1.value = '';
      input2.value = '';
    } else {
      let s = parseInt(raw, 10);
      if (!Number.isFinite(s) || s < 0) s = 0;
      s = clamp(s, 0, maxPoints);

      const opp = Math.max(0, maxPoints - s);

      if (team === 1) {
        match.score1 = s;
        match.score2 = opp;
      } else {
        match.score2 = s;
        match.score1 = opp;
      }

      input1.value = match.score1 === '' ? '' : String(match.score1);
      input2.value = match.score2 === '' ? '' : String(match.score2);
    }

    setRounds(rounds);
    // final save once
    saveCurrentTournament().catch(() => {});
  };

  /* ---------- Round navigation ---------- */
  const updateRoundArrowState = () => {
    if (!state.currentTournament) return;

    const maxRound = getMaxRoundNumber();
    const activeRound = Number(state.viewingRound ?? state.currentTournament.current_round) || 1;

    const prevBtn = $('btn-prev-round');
    const nextBtn = $('btn-next-round');
    if (!prevBtn || !nextBtn) return;

    const prevDisabled = activeRound <= 1;
    const nextDisabled = activeRound >= maxRound;

    prevBtn.classList.toggle('opacity-30', prevDisabled);
    prevBtn.classList.toggle('cursor-not-allowed', prevDisabled);

    nextBtn.classList.toggle('opacity-30', nextDisabled);
    nextBtn.classList.toggle('cursor-not-allowed', nextDisabled);
  };

  const prevRoundView = () => {
    if (!state.currentTournament) return;
    syncCurrentTournament();

    const maxRound = getMaxRoundNumber();
    const activeRound = Number(state.viewingRound ?? maxRound) || 1;
    if (activeRound <= 1) return;

    state.viewingRound = activeRound - 1;
    renderSpecificRound(state.viewingRound);
  };

  const nextRoundView = () => {
    if (!state.currentTournament) return;
    syncCurrentTournament();

    const maxRound = getMaxRoundNumber();
    const activeRound = Number(state.viewingRound ?? maxRound) || 1;
    if (activeRound >= maxRound) return;

    state.viewingRound = activeRound + 1;
    renderSpecificRound(state.viewingRound);
  };

  const nextRound = async () => {
    syncCurrentTournament();
    if (!state.currentTournament) return;

    state.currentTournament.current_round = (Number(state.currentTournament.current_round) || 1) + 1;
    state.viewingRound = state.currentTournament.current_round;

    const ind = $('round-indicator');
    if (ind) ind.textContent = `Round ${state.viewingRound}`;

    await saveCurrentTournament();
    await generateRound();

    state.viewingRound = state.currentTournament.current_round;
    renderSpecificRound(state.viewingRound);
  };

  /* ---------- Open tournament ---------- */
  const openTournament = async (id) => {
    state.currentTournament = state.tournaments.find((t) => t.__backendId === id) || null;
    if (!state.currentTournament) return;

    state.viewingRound = state.currentTournament.current_round;

    const title = $('round-title');
    const ind = $('round-indicator');
    const tm = state.currentTournament.title || '';
    const md = state.currentTournament.mode || 'normal';
    const modeSuffix =
      md === 'mexicano' ? ' · Mexicano' : md === 'mix' ? ' · Mix' : '';
    if (title) title.textContent = tm + modeSuffix;
    if (ind) ind.textContent = `Round ${state.currentTournament.current_round}`;

    await generateRound();
    navigateTo('rounds');
    requestAnimationFrame(() => {
      scrollAppToTop();
    });
    ensureViewingRoundValid();
    updateRoundArrowState();
  };

  /* ---------- Menu ---------- */
  const toggleMenu = () => {
    const menu = $('dropdown-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
  };

  document.addEventListener('click', (e) => {
    const menu = $('dropdown-menu');
    if (!menu) return;
    if (!e.target.closest('#dropdown-menu') && !e.target.closest('[onclick="toggleMenu()"]')) {
      menu.classList.add('hidden');
    }
  });

  const confirmDelete = () => {
    $('dropdown-menu')?.classList.add('hidden');
    $('delete-confirm')?.classList.remove('hidden');
  };

  const cancelDelete = () => {
    $('delete-confirm')?.classList.add('hidden');
  };

  const deleteTournament = async () => {
    if (!state.currentTournament || !window.dataSdk) return;

    const result = await window.dataSdk.delete(state.currentTournament);
    if (result?.isOk) {
      state.currentTournament = null;
      navigateTo('home');
    } else {
      toast('Failed to delete tournament');
    }
    cancelDelete();
  };

  const installApp = async () => {
    const evt = state.deferredInstallPrompt;
    if (!evt) {
      const ua = navigator.userAgent || '';
      const isiOS = /iPhone|iPad|iPod/i.test(ua);
      if (isiOS) {
        window.alert(
          'Safari iPhone does not show an automatic install popup.\n\n' +
          'To install Padelio:\n' +
          '1) Tap Share (square + arrow)\n' +
          '2) Choose "Add to Home Screen"\n' +
          '3) Tap Add'
        );
      } else {
        window.alert('Install prompt unavailable. Use browser menu: Install app / Add to Home Screen.');
      }
      return;
    }
    try {
      evt.prompt();
      await evt.userChoice;
    } catch (err) {
      console.error('Install prompt failed', err);
      toast('Failed to show install prompt.');
    } finally {
      state.deferredInstallPrompt = null;
    }
  };

  const clearAppCacheOnly = async () => {
    if (state.shareViewerMode) return;
    const ok = window.confirm(
      'Clear app cache only? Tournament data will stay safe. App will reload after cache is cleared.'
    );
    if (!ok) return;
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      queueToastAfterReload('Cache cleared. Running latest update.');
      setTimeout(() => window.location.reload(), 200);
    } catch (err) {
      console.error('Clear cache failed', err);
      window.alert('Failed to clear app cache on this browser.');
    }
  };

  const clearAllTournamentData = async () => {
    if (state.shareViewerMode) return;
    const ok1 = window.confirm(
      'WARNING: This will delete ALL tournaments and ALL match history on this device. Continue?'
    );
    if (!ok1) return;
    const ok2 = window.confirm(
      'Final confirm: this will clear ALL data and cache on this device. Continue?'
    );
    if (!ok2) return;

    try {
      let deletedCount = 0;
      let deleteFailed = 0;

      if (window.dataSdk) {
        for (const t of [...state.tournaments]) {
          try {
            const r = await window.dataSdk.delete(t);
            if (r?.isOk) deletedCount++;
            else deleteFailed++;
          } catch (err) {
            console.error('Failed deleting tournament', err);
            deleteFailed++;
          }
        }
      }

      state.tournaments = [];
      state.currentTournament = null;
      resetNewTournament();

      // Clear web storage keys.
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}

      // Clear cache entries and service workers.
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }

      if (deleteFailed > 0) {
        window.alert(
          `Data clear finished with ${deleteFailed} failed delete(s).\nPlease refresh and try again.`
        );
        return;
      }

      queueToastAfterReload(`Cleared ${deletedCount} tournament(s), cache, and app data.`);
      renderTournamentList();
      navigateTo('home');
      setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      console.error('Clear data failed', err);
      window.alert('Failed to clear tournament data on this browser.');
    }
  };

  /* ---------- Share link (spectator / view-only, data in URL hash) ---------- */
  const SHARE_PAYLOAD_VERSION = 1;
  /** Compact on-wire JSON (gzip); expands to canonical v1 for the viewer. */
  const SHARE_WIRE_COMPACT_VERSION = 2;
  const MAX_SHARE_URL_CHARS = 95000;
  /** Legacy plain base64url(JSON). New links use gzip (#p=z…); JSON still has v:1. */
  const SHARE_HASH_GZIP_PREFIX = 'z';

  const canUseGzipSharePayload = () =>
    typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

  const uint8ToBase64Url = (u8) => {
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < u8.length; i += chunk) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const base64UrlToUint8 = (str) => {
    let b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  const encodeShareMode = (mode) => {
    const m = mode || 'normal';
    if (m === 'mexicano') return 'e';
    if (m === 'mix') return 'i';
    return 'n';
  };

  const decodeShareMode = (c) => {
    if (c === 'e') return 'mexicano';
    if (c === 'i') return 'mix';
    return 'normal';
  };

  const packShareScore = (s) => {
    if (s === '' || s == null) return '';
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  };

  const unpackShareScore = (s) => {
    if (s === '' || s == null) return '';
    if (typeof s === 'number') return s;
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  };

  /**
   * Compact share payload: short keys + player indices in matches (names once in P).
   * Loses nothing vs canonical; expands to same shape the app already expects.
   */
  const buildCompactSharePayload = (t) => {
    const playersArr = [];
    const nameToIdx = new Map();

    const idxForRaw = (raw) => {
      const display = fixCommonNameTypos(String(raw ?? ''));
      const k = normalizeNameKey(display);
      if (!k) return -1;
      if (nameToIdx.has(k)) return nameToIdx.get(k);
      const idx = playersArr.length;
      playersArr.push({ name: display, gender: null });
      nameToIdx.set(k, idx);
      return idx;
    };

    normalizePlayers(safeJsonParse(t.players, [])).forEach((p) => {
      const display = fixCommonNameTypos(String(p?.name ?? ''));
      const k = normalizeNameKey(display);
      if (!k) return;
      if (nameToIdx.has(k)) {
        const i = nameToIdx.get(k);
        if (p?.gender != null && p.gender !== '' && playersArr[i]) {
          playersArr[i].gender = p.gender;
        }
        return;
      }
      nameToIdx.set(k, playersArr.length);
      playersArr.push({
        name: display,
        gender: p?.gender != null && p.gender !== '' ? p.gender : null
      });
    });

    const roundsArr = safeJsonParse(t.rounds, []);
    const R = roundsArr.map((r) => {
      const matches = (r.matches || []).map((m) => {
        const t1 = m.team1 || [];
        const t2 = m.team2 || [];
        return [
          m.court,
          idxForRaw(t1[0]),
          idxForRaw(t1[1]),
          idxForRaw(t2[0]),
          idxForRaw(t2[1]),
          packShareScore(m.score1),
          packShareScore(m.score2)
        ];
      });
      return [Number(r.round) || 1, matches];
    });

    const hasGender = playersArr.some((p) => p.gender);
    const payload = {
      v: SHARE_WIRE_COMPACT_VERSION,
      t: t.title || 'Tournament',
      m: encodeShareMode(t.mode || 'normal'),
      c: t.courts,
      w: t.points_to_win,
      cr: t.current_round,
      P: playersArr.map((p) => p.name),
      R
    };
    if (hasGender) payload.G = playersArr.map((p) => p.gender);
    return payload;
  };

  const expandSharePayloadV2 = (w) => {
    const P = w.P;
    if (!Array.isArray(P)) throw new Error('bad P');
    const G = w.G;
    const names = P.map((n) => fixCommonNameTypos(String(n ?? '')));
    const idxToName = (idx) => {
      if (typeof idx !== 'number' || idx < 0 || idx >= names.length) return '';
      return names[idx] || '';
    };

    const playersExpanded = P.map((name, i) => ({
      name: fixCommonNameTypos(String(name ?? '')),
      gender:
        Array.isArray(G) && i < G.length && G[i] != null && G[i] !== ''
          ? G[i]
          : null
    }));

    const R = w.R;
    if (!Array.isArray(R)) throw new Error('bad R');
    const roundsExpanded = R.map((item) => {
      const rn = Number(item[0]) || 1;
      const mx = item[1];
      if (!Array.isArray(mx)) return { round: rn, matches: [] };
      return {
        round: rn,
        matches: mx.map((row) => {
          const [court, a, b, c, d, s1, s2] = row;
          return {
            court,
            team1: [idxToName(a), idxToName(b)],
            team2: [idxToName(c), idxToName(d)],
            score1: unpackShareScore(s1),
            score2: unpackShareScore(s2)
          };
        })
      };
    });

    return {
      v: SHARE_PAYLOAD_VERSION,
      title: String(w.t ?? 'Tournament'),
      mode: decodeShareMode(w.m),
      courts: w.c,
      points_to_win: w.w,
      current_round: w.cr,
      players: JSON.stringify(playersExpanded),
      rounds: JSON.stringify(roundsExpanded)
    };
  };

  const normalizeIncomingSharePayload = (obj) => {
    if (!obj || typeof obj !== 'object') throw new Error('bad payload');
    const ver = Number(obj.v);
    if (ver === SHARE_WIRE_COMPACT_VERSION) return expandSharePayloadV2(obj);
    if (ver === SHARE_PAYLOAD_VERSION) return obj;
    throw new Error('bad payload version');
  };

  /** Uncompressed base64url (UTF-8 JSON); kept for old links and fallback. */
  const encodeSharePayload = (obj) => {
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const encodeSharePayloadGzip = async (obj) => {
    const json = JSON.stringify(obj);
    const input = new TextEncoder().encode(json);
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    return SHARE_HASH_GZIP_PREFIX + uint8ToBase64Url(new Uint8Array(buf));
  };

  const decodeSharePayload = (str) => {
    let b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  };

  const decodeSharePayloadGzip = async (b64urlBody) => {
    const bytes = base64UrlToUint8(b64urlBody);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const outBuf = await new Response(stream).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(outBuf));
  };

  const buildShareUrlFromTournament = async (t) => {
    const canonical = {
      v: SHARE_PAYLOAD_VERSION,
      title: t.title || 'Tournament',
      mode: t.mode || 'normal',
      courts: t.courts,
      points_to_win: t.points_to_win,
      players: t.players,
      rounds: t.rounds,
      current_round: t.current_round
    };
    const compact = buildCompactSharePayload(t);

    const plain = encodeSharePayload(canonical);
    let best = plain;

    if (canUseGzipSharePayload()) {
      const tryGz = async (obj) => {
        try {
          return await encodeSharePayloadGzip(obj);
        } catch {
          return null;
        }
      };
      const gzCanon = await tryGz(canonical);
      const gzCompact = await tryGz(compact);
      for (const cand of [gzCanon, gzCompact]) {
        if (cand && cand.length < best.length) best = cand;
      }
    }

    const base = `${location.origin}${location.pathname}`;
    const url = `${base}#p=${best}`;
    if (url.length > MAX_SHARE_URL_CHARS) {
      const err = new Error('TOO_LARGE');
      throw err;
    }
    return url;
  };

  const sortLeaderboardRows = (rows, sortMode) => {
    const byWinRate = sortMode === 'winRate';
    return [...rows].sort((a, b) => {
      if (byWinRate) {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.points !== a.points) return b.points - a.points;
        if (b.matches !== a.matches) return b.matches - a.matches;
        return String(a.name).localeCompare(String(b.name));
      }
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return String(a.name).localeCompare(String(b.name));
    });
  };

  /**
   * @param {'points'|'winRate'} [sortMode] Points = Americano-style total; winRate = rank by W/M % (ties: wins, points, games).
   */
  const computeLeaderboardSorted = (tournamentLike, sortMode = 'points') => {
    const players = normalizePlayers(safeJsonParse(tournamentLike?.players, [])).map((p) => p.name);
    const rounds = safeJsonParse(tournamentLike?.rounds, []);
    const rosterResolve = makeRosterNameResolve(players);

    const scores = {};
    players.forEach((p) => {
      scores[p] = { points: 0, wins: 0, losses: 0, ties: 0, matches: 0 };
    });

    rounds.forEach((round) => {
      (round.matches || []).forEach((match) => {
        const s1 = match.score1;
        const s2 = match.score2;

        const hasScore =
          (s1 !== '' && s1 != null) || (s2 !== '' && s2 != null);

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
          apply((p) => {
            scores[p].ties++;
          });
        }

        apply((p) => {
          scores[p].matches++;
        });
      });
    });

    const rows = Object.entries(scores).map(([name, data]) => {
      const winRate = data.matches > 0 ? (data.wins / data.matches) * 100 : 0;
      return { name, ...data, winRate };
    });
    return sortLeaderboardRows(rows, sortMode);
  };

  const renderLeaderboardHtml = (sorted, sortMode = 'points') => {
    const byWinRate = sortMode === 'winRate';
    return sorted
      .map(
        (p, i) => `
          <div class="flex items-center bg-emerald-800/50 rounded-3xl p-4 shadow-cozy-sm ${
            i === 0 ? 'border-2 border-amber-300'
            : i === 1 ? 'border-2 border-slate-300'
            : i === 2 ? 'border-2 border-orange-400/90'
            : 'border border-emerald-600/45'
          }">
            <div class="w-8 h-8 flex items-center justify-center rounded-full ${
              i === 0 ? 'bg-gradient-to-br from-amber-200 to-amber-400 text-slate-900'
              : i === 1 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 shadow-sm ring-1 ring-white/30'
              : i === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-white'
              : 'bg-emerald-700 text-white'
            } text-sm font-extrabold mr-3 shadow-sm">
              ${i + 1}
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold">${escapeHtml(fixCommonNameTypos(p.name))}</div>
              <div class="text-sm text-emerald-300">
                Match: ${p.matches} | W: ${p.wins} | L: ${p.losses} | T: ${p.ties}
              </div>
              ${
                byWinRate
                  ? `<div class="text-xs text-emerald-400 mt-1">Total points: ${p.points}</div>`
                  : `<div class="text-xs text-emerald-400 mt-1">Win rate: ${p.winRate.toFixed(1)}%</div>`
              }
            </div>
            <div class="text-right shrink-0">
              ${
                byWinRate
                  ? `<div class="text-2xl font-bold text-teal-300">${p.winRate.toFixed(1)}%</div>
                     <div class="text-xs text-teal-400/90">win rate</div>`
                  : `<div class="text-2xl font-bold text-emerald-400">${p.points}</div>
                     <div class="text-xs text-emerald-400">points</div>`
              }
            </div>
          </div>
        `
      )
      .join('');
  };

  /** Compact standings for screenshots: 2-column grid, full stats per row. */
  const renderLeaderboardScreenshotHtml = (sorted, title, sortMode = 'points') => {
    const byWinRate = sortMode === 'winRate';
    const t = title != null && String(title).trim() ? escapeHtml(String(title).trim()) : '';
    const sub = byWinRate ? 'Rank · win rate' : 'Rank · total points';
    const heading = t
      ? `<div class="text-center mb-3 pb-3 border-b border-white/10 col-span-2">
           <div class="text-lg font-extrabold text-white tracking-tight">${t}</div>
           <div class="text-[11px] font-semibold uppercase tracking-wider text-teal-400/90 mt-1">Leaderboard</div>
           <div class="text-[10px] text-slate-400 mt-0.5">${sub}</div>
         </div>`
      : `<div class="text-center mb-3 pb-3 border-b border-white/10 col-span-2">
           <div class="text-[11px] font-semibold uppercase tracking-wider text-teal-400/90">Standings</div>
           <div class="text-[10px] text-slate-400 mt-0.5">${sub}</div>
         </div>`;

    const cells = sorted
      .map((p, i) => {
        const statLine = `${p.matches}M ${p.wins}-${p.losses}-${p.ties} · ${p.points} pts · ${p.winRate.toFixed(0)}% WR`;
        const rankGrad =
          i === 0
            ? 'from-amber-200 to-amber-400 text-slate-900'
            : i === 1
              ? 'from-slate-200 to-slate-400 text-slate-900 ring-1 ring-white/25'
              : i === 2
                ? 'from-orange-300 to-orange-500 text-white'
                : 'bg-emerald-800 text-white';
        const rowRing =
          i === 0
            ? 'ring-1 ring-amber-300/50'
            : i === 1
              ? 'ring-1 ring-slate-400/40'
              : i === 2
                ? 'ring-1 ring-orange-400/45'
                : '';
        const primaryNum = byWinRate ? p.winRate.toFixed(0) : String(p.points);
        const primaryCls = byWinRate
          ? 'text-sm sm:text-base font-bold text-teal-200 tabular-nums leading-none'
          : 'text-sm sm:text-base font-bold text-emerald-300 tabular-nums leading-none';
        const subLblCls = byWinRate ? 'text-[6px] sm:text-[7px] text-teal-500/85 leading-none' : 'text-[6px] sm:text-[7px] text-emerald-500/80 leading-none';
        const subLbl = byWinRate ? '%' : 'pts';
        return `
          <div class="flex items-center gap-1 rounded-xl px-1.5 py-1 sm:px-2 sm:py-1.5 bg-emerald-950/50 border border-emerald-800/40 min-w-0 ${rowRing}">
            <div class="w-5 h-5 sm:w-6 sm:h-6 shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br ${rankGrad} text-[9px] sm:text-[10px] font-extrabold shadow-sm tabular-nums">
              ${i + 1}
            </div>
            <div class="flex-1 min-w-0 overflow-hidden">
              <div class="font-semibold text-[10px] sm:text-[11px] leading-tight truncate">${escapeHtml(fixCommonNameTypos(p.name))}</div>
              <div class="text-[7px] sm:text-[8px] text-emerald-300/90 tabular-nums leading-none mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis" title="${statLine}">
                ${statLine}
              </div>
            </div>
            <div class="shrink-0 w-7 sm:w-8 flex flex-col items-end justify-center text-right">
              <div class="${primaryCls}">${primaryNum}</div>
              <div class="${subLblCls} leading-none">${subLbl}</div>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="rounded-3xl border border-teal-400/25 bg-gradient-to-b from-slate-900/95 to-slate-950 p-2 sm:p-4 shadow-cozy-sm">
        <div class="grid grid-cols-2 gap-x-1.5 gap-y-1 sm:gap-x-3 sm:gap-y-2">
          ${heading}
          ${cells}
        </div>
      </div>
    `;
  };

  const LB_TAB_ACTIVE =
    'flex-1 text-xs font-bold py-2.5 rounded-2xl border border-teal-400/40 bg-teal-500/15 text-teal-50';
  const LB_TAB_IDLE =
    'flex-1 text-xs font-bold py-2.5 rounded-2xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors';

  const applyHostLeaderboardLayoutUi = () => {
    const layout = state.hostLeaderboardLayout === 'screenshot' ? 'screenshot' : 'standard';
    const std = $('leaderboard-panel-standard');
    const shot = $('leaderboard-panel-screenshot');
    const b1 = $('host-lb-tab-standard');
    const b2 = $('host-lb-tab-screenshot');
    const onShot = layout === 'screenshot';
    if (std) std.classList.toggle('hidden', onShot);
    if (shot) shot.classList.toggle('hidden', !onShot);
    if (b1) b1.className = !onShot ? LB_TAB_ACTIVE : LB_TAB_IDLE;
    if (b2) b2.className = onShot ? LB_TAB_ACTIVE : LB_TAB_IDLE;
  };

  const applyShareLeaderboardLayoutUi = () => {
    const layout = state.shareLeaderboardLayout === 'screenshot' ? 'screenshot' : 'standard';
    const std = $('share-leaderboard-standard-wrap');
    const shot = $('share-leaderboard-screenshot-wrap');
    const b1 = $('share-lb-sub-standard');
    const b2 = $('share-lb-sub-screenshot');
    const onShot = layout === 'screenshot';
    if (std) std.classList.toggle('hidden', onShot);
    if (shot) shot.classList.toggle('hidden', !onShot);
    if (b1) b1.className = !onShot ? LB_TAB_ACTIVE : LB_TAB_IDLE;
    if (b2) b2.className = onShot ? LB_TAB_ACTIVE : LB_TAB_IDLE;
  };

  const applyHostLeaderboardSortUi = () => {
    const mode = state.hostLeaderboardSort === 'winRate' ? 'winRate' : 'points';
    const b1 = $('host-lb-sort-points');
    const b2 = $('host-lb-sort-winrate');
    if (b1) b1.className = mode === 'points' ? LB_TAB_ACTIVE : LB_TAB_IDLE;
    if (b2) b2.className = mode === 'winRate' ? LB_TAB_ACTIVE : LB_TAB_IDLE;
  };

  const applyShareLeaderboardSortUi = () => {
    const mode = state.shareLeaderboardSort === 'winRate' ? 'winRate' : 'points';
    const b1 = $('share-lb-sort-points');
    const b2 = $('share-lb-sort-winrate');
    if (b1) b1.className = mode === 'points' ? LB_TAB_ACTIVE : LB_TAB_IDLE;
    if (b2) b2.className = mode === 'winRate' ? LB_TAB_ACTIVE : LB_TAB_IDLE;
  };

  const populateLeaderboardPanels = (tournamentLike, title) => {
    const hSort = state.hostLeaderboardSort === 'winRate' ? 'winRate' : 'points';
    const sSort = state.shareLeaderboardSort === 'winRate' ? 'winRate' : 'points';
    const hostSorted = computeLeaderboardSorted(tournamentLike, hSort);
    const shareSorted = computeLeaderboardSorted(tournamentLike, sSort);

    const hostStd = $('leaderboard-list');
    const hostShot = $('leaderboard-screenshot-panel');
    if (hostStd) hostStd.innerHTML = renderLeaderboardHtml(hostSorted, hSort);
    if (hostShot) hostShot.innerHTML = renderLeaderboardScreenshotHtml(hostSorted, title, hSort);

    const shareStd = $('share-leaderboard-list');
    const shareShot = $('share-leaderboard-screenshot-panel');
    if (shareStd) shareStd.innerHTML = renderLeaderboardHtml(shareSorted, sSort);
    if (shareShot) shareShot.innerHTML = renderLeaderboardScreenshotHtml(shareSorted, title, sSort);

    applyHostLeaderboardLayoutUi();
    applyShareLeaderboardLayoutUi();
    applyHostLeaderboardSortUi();
    applyShareLeaderboardSortUi();
  };

  const switchHostLeaderboardLayout = (layout) => {
    state.hostLeaderboardLayout = layout === 'screenshot' ? 'screenshot' : 'standard';
    applyHostLeaderboardLayoutUi();
  };

  const switchShareLeaderboardLayout = (layout) => {
    state.shareLeaderboardLayout = layout === 'screenshot' ? 'screenshot' : 'standard';
    applyShareLeaderboardLayoutUi();
  };

  const switchHostLeaderboardSort = (sort) => {
    state.hostLeaderboardSort = sort === 'winRate' ? 'winRate' : 'points';
    applyHostLeaderboardSortUi();
    if (state.currentTournament) {
      populateLeaderboardPanels(state.currentTournament, state.currentTournament.title || '');
    }
  };

  const switchShareLeaderboardSort = (sort) => {
    state.shareLeaderboardSort = sort === 'winRate' ? 'winRate' : 'points';
    applyShareLeaderboardSortUi();
    if (state.shareViewerData) {
      populateLeaderboardPanels(state.shareViewerData, state.shareViewerData.title || '');
    }
  };

  /** Inline onclick looks up globals; assign early + use listeners so tabs always work. */
  window.switchHostLeaderboardLayout = switchHostLeaderboardLayout;
  window.switchShareLeaderboardLayout = switchShareLeaderboardLayout;
  window.switchHostLeaderboardSort = switchHostLeaderboardSort;
  window.switchShareLeaderboardSort = switchShareLeaderboardSort;

  /** Text nodes have no .closest — normalize target before delegating. */
  const clickTargetButton = (e) => {
    let n = e.target;
    if (n && n.nodeType === Node.TEXT_NODE) n = n.parentElement;
    return n && typeof n.closest === 'function' ? n.closest('button') : null;
  };

  /**
   * Sort buttons: use document capture so clicks always reach us (some overlays / bubbling
   * edge cases prevented host-only delegation from firing reliably).
   */
  const wireLeaderboardSortClicks = () => {
    if (document.documentElement.dataset.padLbSortWired === '1') return;
    document.documentElement.dataset.padLbSortWired = '1';
    document.addEventListener(
      'click',
      (e) => {
        const id = clickTargetButton(e)?.id;
        if (id === 'host-lb-sort-points') {
          e.preventDefault();
          switchHostLeaderboardSort('points');
        } else if (id === 'host-lb-sort-winrate') {
          e.preventDefault();
          switchHostLeaderboardSort('winRate');
        } else if (id === 'share-lb-sort-points') {
          e.preventDefault();
          switchShareLeaderboardSort('points');
        } else if (id === 'share-lb-sort-winrate') {
          e.preventDefault();
          switchShareLeaderboardSort('winRate');
        }
      },
      true
    );
  };

  /** Delegation + tabs live outside scroll on host / share to avoid touch stacking bugs. */
  const wireLeaderboardLayoutTabs = () => {
    const hostPage = $('page-leaderboard');
    if (hostPage && !hostPage.dataset.lbTabDelegate) {
      hostPage.dataset.lbTabDelegate = '1';
      hostPage.addEventListener('click', (e) => {
        const id = clickTargetButton(e)?.id;
        if (id === 'host-lb-tab-standard') {
          e.preventDefault();
          switchHostLeaderboardLayout('standard');
        } else if (id === 'host-lb-tab-screenshot') {
          e.preventDefault();
          switchHostLeaderboardLayout('screenshot');
        }
      });
    }
    const shareLb = $('share-panel-leaderboard');
    if (shareLb && !shareLb.dataset.lbTabDelegate) {
      shareLb.dataset.lbTabDelegate = '1';
      shareLb.addEventListener('click', (e) => {
        const id = clickTargetButton(e)?.id;
        if (id === 'share-lb-sub-standard') {
          e.preventDefault();
          switchShareLeaderboardLayout('standard');
        } else if (id === 'share-lb-sub-screenshot') {
          e.preventDefault();
          switchShareLeaderboardLayout('screenshot');
        }
      });
    }
    const shareSubBar = $('share-lb-subtabs');
    if (shareSubBar && !shareSubBar.dataset.lbTabDelegate) {
      shareSubBar.dataset.lbTabDelegate = '1';
      shareSubBar.addEventListener('click', (e) => {
        const id = clickTargetButton(e)?.id;
        if (id === 'share-lb-sub-standard') {
          e.preventDefault();
          switchShareLeaderboardLayout('standard');
        } else if (id === 'share-lb-sub-screenshot') {
          e.preventDefault();
          switchShareLeaderboardLayout('screenshot');
        }
      });
    }
  };
  wireLeaderboardLayoutTabs();
  wireLeaderboardSortClicks();

  const copySpectatorLinkForHost = async () => {
    syncCurrentTournament();
    if (!state.currentTournament) return;
    let url;
    try {
      url = await buildShareUrlFromTournament(state.currentTournament);
    } catch (e) {
      if (e && e.message === 'TOO_LARGE') {
        toast('Tournament is too large for one link. Share a screenshot or split sessions.');
        return;
      }
      toast('Could not build share link.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Spectator link copied (read-only). Share again after you change scores for the latest standings.');
    } catch {
      window.prompt('Copy this spectator link:', url);
    }
  };

  const shareSpectatorLinkForHost = async () => {
    syncCurrentTournament();
    if (!state.currentTournament) return;
    let url;
    try {
      url = await buildShareUrlFromTournament(state.currentTournament);
    } catch (e) {
      if (e && e.message === 'TOO_LARGE') {
        toast('Tournament is too large for one link.');
        return;
      }
      toast('Could not build share link.');
      return;
    }
    const title = state.currentTournament.title || 'Padelio';
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${title} — Padelio`,
          text: 'View live standings (read-only)',
          url
        });
      } else {
        await copySpectatorLinkForHost();
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      await copySpectatorLinkForHost();
    }
  };

  /** Inline onclick on leaderboard header; assign early so globals exist even if later init throws. */
  window.copySpectatorLinkForHost = copySpectatorLinkForHost;
  window.shareSpectatorLinkForHost = shareSpectatorLinkForHost;

  const renderShareRoundsReadOnly = (rounds) => {
    const el = $('share-rounds-container');
    if (!el) return;
    const list = Array.isArray(rounds) ? rounds : [];
    if (list.length === 0) {
      el.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">No rounds yet.</p>';
      return;
    }
    el.innerHTML = list
      .sort((a, b) => Number(a.round) - Number(b.round))
      .map((round) => {
        const matches = (round.matches || [])
          .map(
            (match) => `
          <div class="bg-emerald-900/40 rounded-2xl p-3 border border-emerald-700/40 mb-3">
            <div class="text-center text-xs text-emerald-400 mb-2 font-medium">Court ${match.court}</div>
            <div class="flex items-center gap-3 text-sm">
              <div class="flex-1 text-center space-y-1">
                <div class="font-medium">${escapeHtml(fixCommonNameTypos(match.team1?.[0]))}</div>
                <div class="font-medium">${escapeHtml(fixCommonNameTypos(match.team1?.[1]))}</div>
                <div class="text-lg font-bold text-emerald-300 mt-1">${escapeHtml(String(match.score1 ?? '—'))}</div>
              </div>
              <div class="text-emerald-500 font-extrabold text-xs">vs</div>
              <div class="flex-1 text-center space-y-1">
                <div class="font-medium">${escapeHtml(fixCommonNameTypos(match.team2?.[0]))}</div>
                <div class="font-medium">${escapeHtml(fixCommonNameTypos(match.team2?.[1]))}</div>
                <div class="text-lg font-bold text-emerald-300 mt-1">${escapeHtml(String(match.score2 ?? '—'))}</div>
              </div>
            </div>
          </div>
        `
          )
          .join('');
        return `
          <div class="mb-8">
            <h3 class="text-sm font-extrabold text-white mb-3 sticky top-0 bg-slate-950/90 py-2 border-b border-white/10">Round ${Number(round.round) || '?'}</h3>
            ${matches}
          </div>
        `;
      })
      .join('');
  };

  const switchShareTab = (tab) => {
    const lb = $('share-panel-leaderboard');
    const rd = $('share-panel-rounds');
    const t1 = $('share-tab-lb');
    const t2 = $('share-tab-rd');
    const subBar = $('share-lb-subtabs');
    if (!lb || !rd) return;
    const onLb = tab === 'leaderboard';
    lb.classList.toggle('hidden', !onLb);
    rd.classList.toggle('hidden', onLb);
    if (subBar) subBar.classList.toggle('hidden', !onLb);
    const sortRow = $('share-lb-sort-row');
    if (sortRow) sortRow.classList.toggle('hidden', !onLb);
    const active =
      'flex-1 text-xs font-bold py-2.5 rounded-2xl border border-teal-400/40 bg-teal-500/15 text-teal-50';
    const idle =
      'flex-1 text-xs font-bold py-2.5 rounded-2xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors';
    if (t1) t1.className = onLb ? active : idle;
    if (t2) t2.className = !onLb ? active : idle;
    if (onLb) {
      applyShareLeaderboardLayoutUi();
      requestAnimationFrame(() => {
        $('share-leaderboard-scroll')?.focus({ preventScroll: true });
      });
    }
  };

  const copyCurrentSpectatorUrl = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Page link copied — share to Instagram, TikTok, etc.');
    } catch {
      window.prompt('Copy this link:', location.href);
    }
  };

  const shareCurrentSpectatorUrl = async () => {
    const url = location.href;
    const title = state.shareViewerData?.title || 'Padelio';
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${title} — Padelio`,
          text: 'View tournament standings (read-only)',
          url
        });
      } else {
        await copyCurrentSpectatorUrl();
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      await copyCurrentSpectatorUrl();
    }
  };

  const renderShareViewer = () => {
    const data = state.shareViewerData;
    if (!data) return;

    const titleEl = $('share-view-title');
    if (titleEl) titleEl.textContent = data.title || 'Tournament';

    populateLeaderboardPanels(data, data.title || '');

    const rounds = safeJsonParse(data.rounds, []);
    renderShareRoundsReadOnly(rounds);

    switchShareTab('leaderboard');
    wireLeaderboardLayoutTabs();

    document.title = `${data.title || 'Padelio'} | Padelio (view)`;
  };

  const exitShareViewer = () => {
    state.shareViewerMode = false;
    state.shareViewerData = null;
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    } catch {}
    window.location.reload();
  };

  const tryOpenShareFromHash = async () => {
    const h = (location.hash || '').trim();
    if (!h.startsWith('#p=')) return false;
    const raw = h.slice(3);
    if (!raw) return false;
    let data;
    try {
      let parsed;
      if (raw[0] === SHARE_HASH_GZIP_PREFIX) {
        if (!canUseGzipSharePayload()) {
          toast('This share link needs a newer browser (gzip).');
          return false;
        }
        parsed = await decodeSharePayloadGzip(raw.slice(1));
      } else {
        parsed = decodeSharePayload(raw);
      }
      data = normalizeIncomingSharePayload(parsed);
    } catch (e) {
      console.error(e);
      toast('Invalid or broken share link.');
      return false;
    }
    if (Number(data.v) !== SHARE_PAYLOAD_VERSION || data.players == null || data.rounds == null) {
      toast('Invalid share link format.');
      return false;
    }
    state.shareViewerMode = true;
    state.shareViewerData = data;
    return true;
  };

  /* ---------- Leaderboard ---------- */
  const showLeaderboard = () => {
    syncCurrentTournament();
    if (!state.currentTournament) return;

    state.lastRoundsView = (state.viewingRound ?? state.currentTournament.current_round);
    $('dropdown-menu')?.classList.add('hidden');

    // ensure latest stored object
    const fresh = state.tournaments.find((t) => t.__backendId === state.currentTournament.__backendId);
    if (fresh) state.currentTournament = fresh;

    const title = state.currentTournament.title || '';
    populateLeaderboardPanels(state.currentTournament, title);

    navigateTo('leaderboard');
    wireLeaderboardLayoutTabs();
    requestAnimationFrame(() => {
      $('host-leaderboard-scroll')?.focus({ preventScroll: true });
    });
  };

  const backToRounds = () => {
    syncCurrentTournament();
    if (!state.currentTournament) return;

    navigateTo('rounds');

    const maxRound = getMaxRoundNumber();
    state.viewingRound = state.lastRoundsView ?? state.viewingRound ?? state.currentTournament.current_round;
    state.viewingRound = clamp(Number(state.viewingRound) || 1, 1, maxRound);

    renderSpecificRound(state.viewingRound);
    updateRoundArrowState();
  };

  /* ---------- Service Worker: reload once on update ---------- */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js');

        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;

          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });

        reg.update();
      } catch (err) {
        console.error('SW failed', err);
      }
    });
  }

  /* ---------- expose globals (for inline handlers) ---------- */
  window.escapeHtml = escapeHtml;

  window.setEditingScore = setEditingScore;

  window.navigateTo = navigateTo;

  window.resetNewTournament = resetNewTournament;
  window.goToCourts = goToCourts;
  window.selectCourts = selectCourts;
  window.goToPoints = goToPoints;
  window.selectPoints = selectPoints;
  window.goToPlayers = goToPlayers;

  window.selectMode = selectMode;
  window.setPlayerGender = setPlayerGender;
  window.toggleGenderDraft = toggleGenderDraft;

  window.addPlayer = addPlayer;
  window.removePlayer = removePlayer;
  window.startTournament = startTournament;

  window.openTournament = openTournament;

  window.updateScoreLive = updateScoreLive;
  window.commitScore = commitScore;

  window.prevRoundView = prevRoundView;
  window.nextRoundView = nextRoundView;
  window.nextRound = nextRound;

  window.toggleMenu = toggleMenu;
  window.installApp = installApp;
  window.clearAppCacheOnly = clearAppCacheOnly;
  window.clearAllTournamentData = clearAllTournamentData;
  window.confirmDelete = confirmDelete;
  window.cancelDelete = cancelDelete;
  window.deleteTournament = deleteTournament;

  window.showLeaderboard = showLeaderboard;
  window.backToRounds = backToRounds;
  window.togglePlayerGender = togglePlayerGender;
  window.updateGenderBalanceWarning = updateGenderBalanceWarning;

  window.switchShareTab = switchShareTab;
  window.exitShareViewer = exitShareViewer;
  window.copyCurrentSpectatorUrl = copyCurrentSpectatorUrl;
  window.shareCurrentSpectatorUrl = shareCurrentSpectatorUrl;

  void (async () => {
    if (await tryOpenShareFromHash()) {
      $$('.page').forEach((p) => p.classList.add('hidden'));
      const sh = $('page-share-view');
      if (sh) {
        sh.classList.remove('hidden');
        sh.classList.add('slide-in');
      }
      renderShareViewer();
      updateAdVisibility('share-view');
    }
  })();
})();