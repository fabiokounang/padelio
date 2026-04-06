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

  const toast = (message) => {
    const el = document.createElement('div');
    el.className =
      'fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 slide-in';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
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
    state.newTournament.mode = (mode === 'mix') ? 'mix' : 'normal';
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

    tournaments: [],
    currentTournament: null,

    playerGenderDraft: 'M',

    newTournament: {
      mode: 'normal', // 'normal' | 'mix'
      title: '',
      courts: 0,
      points: 0,
      players: []
    }
  };

  /** Bump when you ship user-visible fixes or features (shown on home). */
  const APP_VERSION = '1.3.4';

  const defaultConfig = { app_title: 'Padelio' };

  const refreshAppVersionLabel = () => {
    const el = $('app-version');
    if (el) el.textContent = `Version ${APP_VERSION}`;
  };

  /* ---------- Round helpers ---------- */
  const syncCurrentTournament = () => {
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

    if (page === 'home') {
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

  const goToPlayers = () => {
    if (state.newTournament.points > 0) {
      navigateTo('new-players');
      updateGenderUI(); // ✅ supaya toggle muncul kalau mix
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
  };

  const addPlayer = () => {
    const input = $('player-name');
    let name = input?.value?.trim() || '';
    if (!name) return;

    name = name.charAt(0).toUpperCase() + name.slice(1);

    const isMix = state.newTournament.mode === 'mix';
    const gender = isMix ? state.playerGenderDraft : null;

    state.newTournament.players = normalizePlayers(state.newTournament.players);
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
        return `
          <button onclick="openTournament('${t.__backendId}')" class="w-full bg-emerald-800/50 hover:bg-emerald-700/50 border border-emerald-600/50 rounded-3xl p-4 text-left transition-all slide-in shadow-cozy-sm">
            <h3 class="font-semibold text-lg mb-1">${escapeHtml(t.title)}</h3>
            <div class="flex items-center gap-4 text-sm text-emerald-300">
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

    // ---------- NORMAL MODE (fair bench + partner/opponent variety) ----------
    if (mode !== 'mix') {
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
      return;
    }

    // ---------- MIX MODE (rotation + fairness) ----------
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
    if (title) title.textContent = state.currentTournament.title;
    if (ind) ind.textContent = `Round ${state.currentTournament.current_round}`;

    await generateRound();
    navigateTo('rounds');
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

  /* ---------- Leaderboard ---------- */
  const showLeaderboard = () => {
    syncCurrentTournament();
    if (!state.currentTournament) return;

    state.lastRoundsView = (state.viewingRound ?? state.currentTournament.current_round);
    $('dropdown-menu')?.classList.add('hidden');

    // ensure latest stored object
    const fresh = state.tournaments.find((t) => t.__backendId === state.currentTournament.__backendId);
    if (fresh) state.currentTournament = fresh;

    const players = getPlayers();
    const rounds = getRounds();
    const rosterResolve = makeRosterNameResolve(players);

    const scores = {};
    players.forEach((p) => {
      scores[p] = { points: 0, wins: 0, losses: 0, ties: 0, matches: 0 };
    });

    rounds.forEach((round) => {
      (round.matches || []).forEach((match) => {
        const s1 = match.score1;
        const s2 = match.score2;

        // Only count if there is a real score input (exclude empty/blank)
        const hasScore =
          (s1 !== '' && s1 != null) || (s2 !== '' && s2 != null);

        if (!hasScore) return;

        // Keep old behavior: ignore 0-0
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

    const sorted = Object.entries(scores)
      .map(([name, data]) => {
        const winRate = data.matches > 0 ? (data.wins / data.matches) * 100 : 0;
        return { name, ...data, winRate };
      })
      .sort((a, b) => b.points - a.points || b.wins - a.wins || b.winRate - a.winRate);

    const list = $('leaderboard-list');
    if (list) {
      list.innerHTML = sorted
        .map((p, i) => `
          <div class="flex items-center bg-emerald-800/50 rounded-3xl p-4 shadow-cozy-sm ${
            i === 0 ? 'border-2 border-amber-300'
            : i === 1 ? 'border-2 border-slate-300'
            : i === 2 ? 'border-2 border-orange-400/90'
            : 'border border-emerald-600/45'
          }">
            <div class="w-8 h-8 flex items-center justify-center rounded-full ${
              i === 0 ? 'bg-gradient-to-br from-amber-200 to-amber-400 text-slate-900'
              : i === 1 ? 'bg-slate-300 text-slate-800'
              : i === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-white'
              : 'bg-emerald-700 text-white'
            } text-sm font-extrabold mr-3 shadow-sm">
              ${i + 1}
            </div>
            <div class="flex-1">
              <div class="font-semibold">${escapeHtml(fixCommonNameTypos(p.name))}</div>
              <div class="text-sm text-emerald-300">
                Match: ${p.matches} | W: ${p.wins} | L: ${p.losses} | T: ${p.ties}
              </div>
              <div class="text-xs text-emerald-400 mt-1">
                Win Rate: ${p.winRate.toFixed(1)}%
              </div>
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold text-emerald-400">${p.points}</div>
              <div class="text-xs text-emerald-400">points</div>
            </div>
          </div>
        `)
        .join('');
    }

    navigateTo('leaderboard');
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
  window.confirmDelete = confirmDelete;
  window.cancelDelete = cancelDelete;
  window.deleteTournament = deleteTournament;

  window.showLeaderboard = showLeaderboard;
  window.backToRounds = backToRounds;
  window.togglePlayerGender = togglePlayerGender;
  window.updateGenderBalanceWarning = updateGenderBalanceWarning;
})();