/**
 * Mix Americano schedule: teams are always M+F; cover all M–F partner pairs, then all opponent pairs.
 * Requires equal male/female counts. Exposed as globalThis.PadelioMixAmericanoSchedule.
 */
(function (root) {
  'use strict';

  function parseMixRoster(players) {
    if (!Array.isArray(players) || players.length < 4) {
      throw new Error('Minimal 4 players required.');
    }

    const names = players.map((p) => String(p?.name ?? p ?? '').trim());
    const maleIdx = [];
    const femaleIdx = [];

    players.forEach((p, i) => {
      const g = p?.gender === 'F' ? 'F' : 'M';
      if (g === 'F') femaleIdx.push(i);
      else maleIdx.push(i);
    });

    if (maleIdx.length !== femaleIdx.length) {
      throw new Error('Mix Americano requires equal male and female counts.');
    }
    if (maleIdx.length < 2 || femaleIdx.length < 2) {
      throw new Error('Mix Americano needs at least 2 male and 2 female players.');
    }

    return { names, maleIdx, femaleIdx, n: names.length };
  }

  function getMfPairs(maleIdx, femaleIdx) {
    const pairs = [];
    for (const m of maleIdx) {
      for (const f of femaleIdx) {
        pairs.push([m, f]);
      }
    }
    return pairs;
  }

  function getAllPairs(n) {
    const pairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    }
    return pairs;
  }

  function pairKey(pair) {
    const [a, b] = pair;
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  function matchKey(match) {
    const p1 = pairKey(match.teamA);
    const p2 = pairKey(match.teamB);
    return [p1, p2].sort().join('|');
  }

  function quartetKey(match) {
    return [...match.teamA, ...match.teamB].sort((a, b) => a - b).join('-');
  }

  function rememberQuartet(match, quartetCount, recentQuartetKeys, limit) {
    const key = quartetKey(match);
    quartetCount.set(key, (quartetCount.get(key) || 0) + 1);
    recentQuartetKeys.push(key);
    while (recentQuartetKeys.length > limit) recentQuartetKeys.shift();
  }

  function hasOverlap(pairA, pairB) {
    return (
      pairA[0] === pairB[0] ||
      pairA[0] === pairB[1] ||
      pairA[1] === pairB[0] ||
      pairA[1] === pairB[1]
    );
  }

  function getOpponentPairs(match) {
    const [a, b] = match.teamA;
    const [c, d] = match.teamB;
    return [
      [a, c],
      [a, d],
      [b, c],
      [b, d]
    ];
  }

  function countNewOpponents(match, opponentSeen) {
    return getOpponentPairs(match).filter((pair) => !opponentSeen.has(pairKey(pair))).length;
  }

  function generateMixAmericanoSchedule(players, courts, options = {}) {
    const {
      maxRetries = 200,
      maxExtraMatches = 1000,
      verbose = false,
      recentQuartetLimit = 8
    } = options;

    const roster = parseMixRoster(players);
    const { names, maleIdx, femaleIdx, n } = roster;
    const effectiveCourts = Math.min(courts, Math.floor(maleIdx.length / 2), Math.floor(femaleIdx.length / 2));

    if (effectiveCourts < 1) {
      throw new Error('At least 1 court is required.');
    }

    let bestResult = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = buildScheduleAttempt(
        names,
        maleIdx,
        femaleIdx,
        n,
        effectiveCourts,
        maxExtraMatches,
        recentQuartetLimit
      );

      if (!bestResult || result.score > bestResult.score) {
        bestResult = result;
      }

      if (result.partnerComplete && result.opponentComplete) {
        if (verbose) console.log(`Mix schedule success at attempt ${attempt}`);
        return result;
      }
    }

    return bestResult;
  }

  function buildScheduleAttempt(
    names,
    maleIdx,
    femaleIdx,
    n,
    courts,
    maxExtraMatches,
    recentQuartetLimit
  ) {
    const mfPairs = getMfPairs(maleIdx, femaleIdx);
    const mfPairKeys = new Set(mfPairs.map(pairKey));
    const allOppPairKeys = new Set(getAllPairs(n).map(pairKey));

    const remainingPartnerPairs = new Set(mfPairKeys);
    const partnerSeen = new Set();
    const opponentSeen = new Set();
    const usedMatchKeys = new Set();
    const quartetCount = new Map();
    const recentQuartetKeys = [];

    const playCount = Array(n).fill(0);
    const partnerRepeatCount = new Map();
    const matches = [];

    while (remainingPartnerPairs.size > 0) {
      const match = pickBestMatch({
        mfPairs,
        remainingPartnerPairs,
        partnerSeen,
        opponentSeen,
        usedMatchKeys,
        quartetCount,
        recentQuartetKeys,
        recentQuartetLimit,
        playCount,
        mode: 'partner-first'
      });
      if (!match) break;
      addMatch({
        match,
        matches,
        remainingPartnerPairs,
        partnerSeen,
        opponentSeen,
        usedMatchKeys,
        quartetCount,
        recentQuartetKeys,
        recentQuartetLimit,
        playCount,
        partnerRepeatCount
      });
    }

    let extra = 0;
    while (!isComplete(opponentSeen, allOppPairKeys) && extra < maxExtraMatches) {
      const match = pickBestMatch({
        mfPairs,
        remainingPartnerPairs,
        partnerSeen,
        opponentSeen,
        usedMatchKeys,
        quartetCount,
        recentQuartetKeys,
        recentQuartetLimit,
        playCount,
        mode: 'opponent-first'
      });
      if (!match) break;
      if (countNewOpponents(match, opponentSeen) === 0) break;
      addMatch({
        match,
        matches,
        remainingPartnerPairs,
        partnerSeen,
        opponentSeen,
        usedMatchKeys,
        quartetCount,
        recentQuartetKeys,
        recentQuartetLimit,
        playCount,
        partnerRepeatCount
      });
      extra++;
    }

    const rounds = packMatchesIntoRounds(matches, courts);
    const partnerComplete = isComplete(partnerSeen, mfPairKeys);
    const opponentComplete = isComplete(opponentSeen, allOppPairKeys);

    return {
      players: names,
      courts,
      totalPlayers: n,
      males: maleIdx.length,
      females: femaleIdx.length,
      totalMatches: matches.length,
      totalRounds: rounds.length,
      minimumPartnerMatches: Math.ceil(mfPairs.length / 2),
      partnerComplete,
      opponentComplete,
      partnerCoverage: {
        totalRequired: mfPairKeys.size,
        totalCovered: partnerSeen.size,
        missing: getMissingPairs(mfPairKeys, partnerSeen, names)
      },
      opponentCoverage: {
        totalRequired: allOppPairKeys.size,
        totalCovered: opponentSeen.size,
        missing: getMissingPairs(allOppPairKeys, opponentSeen, names)
      },
      playStats: buildPlayStats(names, playCount),
      rounds,
      score: calculateResultScore({
        partnerSeen,
        opponentSeen,
        mfPairKeys,
        allOppPairKeys,
        matches,
        rounds,
        playCount
      })
    };
  }

  function pickBestMatch({
    mfPairs,
    remainingPartnerPairs,
    partnerSeen,
    opponentSeen,
    usedMatchKeys,
    quartetCount,
    recentQuartetKeys,
    recentQuartetLimit,
    playCount,
    mode
  }) {
    let bestScore = -Infinity;
    const bestCandidates = [];
    const remainingSize = remainingPartnerPairs.size;

    for (const teamA of mfPairs) {
      const teamAKey = pairKey(teamA);
      const teamANew = remainingPartnerPairs.has(teamAKey);

      if (mode === 'partner-first' && remainingSize > 0 && !teamANew) continue;

      for (const teamB of mfPairs) {
        if (hasOverlap(teamA, teamB)) continue;

        const teamBKey = pairKey(teamB);
        const teamBNew = remainingPartnerPairs.has(teamBKey);

        if (mode === 'partner-first') {
          if (remainingSize > 1 && !teamBNew) continue;
          if (remainingSize === 1 && teamBNew) continue;
        }

        const match = { teamA, teamB };
        const mKey = matchKey(match);
        if (usedMatchKeys.has(mKey)) continue;

        const newPartnerCount = [teamAKey, teamBKey].filter((key) => !partnerSeen.has(key)).length;
        const repeatedPartnerCount = 2 - newPartnerCount;
        const newOpponentCount = countNewOpponents(match, opponentSeen);
        const qKey = quartetKey(match);
        const priorQuartetCount = quartetCount.get(qKey) || 0;
        const recentQuartetIndex = recentQuartetKeys.lastIndexOf(qKey);
        const isRecentQuartet = recentQuartetIndex >= 0;
        const recentQuartetAge = isRecentQuartet
          ? recentQuartetKeys.length - recentQuartetIndex
          : 0;

        const playersInMatch = [teamA[0], teamA[1], teamB[0], teamB[1]];
        const currentMinPlay = Math.min(...playCount);
        const matchPlayCounts = playersInMatch.map((i) => playCount[i]);
        const totalPlayCount = matchPlayCounts.reduce((s, c) => s + c, 0);
        const maxPlayCount = Math.max(...matchPlayCounts);
        const minPlayCount = Math.min(...matchPlayCounts);
        const playersAboveCurrentMin = matchPlayCounts.filter((c) => c > currentMinPlay).length;
        const totalDistanceFromMin = matchPlayCounts.reduce(
          (s, c) => s + Math.max(0, c - currentMinPlay),
          0
        );

        const balancePenalty =
          playersAboveCurrentMin * 1000000 +
          totalDistanceFromMin * 500000 +
          Math.max(0, maxPlayCount - currentMinPlay) * 250000 +
          totalPlayCount * 50 +
          (maxPlayCount - minPlayCount) * 5000;

        let score = 0;

        if (mode === 'partner-first') {
          score += newPartnerCount * 100000;
          score += newOpponentCount * 1000;
          score -= repeatedPartnerCount * 5000;
          score -= balancePenalty;
        }

        if (mode === 'opponent-first') {
          score += newOpponentCount * 100000;
          score -= repeatedPartnerCount * 3000;
          score -= balancePenalty;
        }

        score -= priorQuartetCount * 250000;
        if (isRecentQuartet) score -= (recentQuartetLimit - recentQuartetAge + 1) * 350000;
        score += Math.random() * 100;

        if (score > bestScore) {
          bestScore = score;
          bestCandidates.length = 0;
          bestCandidates.push(match);
        } else if (score === bestScore) {
          bestCandidates.push(match);
        }
      }
    }

    if (bestCandidates.length === 0) return null;
    return bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
  }

  function addMatch({
    match,
    matches,
    remainingPartnerPairs,
    partnerSeen,
    opponentSeen,
    usedMatchKeys,
    quartetCount,
    recentQuartetKeys,
    recentQuartetLimit,
    playCount,
    partnerRepeatCount
  }) {
    const teamAKey = pairKey(match.teamA);
    const teamBKey = pairKey(match.teamB);

    partnerSeen.add(teamAKey);
    partnerSeen.add(teamBKey);
    remainingPartnerPairs.delete(teamAKey);
    remainingPartnerPairs.delete(teamBKey);

    partnerRepeatCount.set(teamAKey, (partnerRepeatCount.get(teamAKey) || 0) + 1);
    partnerRepeatCount.set(teamBKey, (partnerRepeatCount.get(teamBKey) || 0) + 1);

    for (const oppPair of getOpponentPairs(match)) {
      opponentSeen.add(pairKey(oppPair));
    }

    usedMatchKeys.add(matchKey(match));
    rememberQuartet(match, quartetCount, recentQuartetKeys, recentQuartetLimit);

    for (const playerIndex of [match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1]]) {
      playCount[playerIndex]++;
    }

    matches.push(match);
  }

  function packMatchesIntoRounds(matches, courts) {
    const rounds = [];

    for (const match of matches) {
      let placed = false;

      for (const round of rounds) {
        if (round.matches.length >= courts) continue;

        const usedPlayers = new Set();
        for (const existingMatch of round.matches) {
          usedPlayers.add(existingMatch.teamA[0]);
          usedPlayers.add(existingMatch.teamA[1]);
          usedPlayers.add(existingMatch.teamB[0]);
          usedPlayers.add(existingMatch.teamB[1]);
        }

        const playersInCurrentMatch = [
          match.teamA[0],
          match.teamA[1],
          match.teamB[0],
          match.teamB[1]
        ];

        if (!playersInCurrentMatch.some((i) => usedPlayers.has(i))) {
          round.matches.push(match);
          placed = true;
          break;
        }
      }

      if (!placed) {
        rounds.push({ roundNumber: rounds.length + 1, matches: [match] });
      }
    }

    return rounds;
  }

  function isComplete(seenSet, allKeys) {
    for (const key of allKeys) {
      if (!seenSet.has(key)) return false;
    }
    return true;
  }

  function getMissingPairs(allPairKeys, seenSet, players) {
    const missing = [];
    for (const key of allPairKeys) {
      if (!seenSet.has(key)) {
        const [a, b] = key.split('-').map(Number);
        missing.push({ playerA: players[a], playerB: players[b] });
      }
    }
    return missing;
  }

  function buildPlayStats(players, playCount) {
    return players.map((name, index) => ({ player: name, matches: playCount[index] }));
  }

  function calculateResultScore({
    partnerSeen,
    opponentSeen,
    mfPairKeys,
    allOppPairKeys,
    matches,
    rounds,
    playCount
  }) {
    const partnerScore = partnerSeen.size / mfPairKeys.size;
    const opponentScore = opponentSeen.size / allOppPairKeys.size;
    const maxPlay = Math.max(...playCount);
    const minPlay = Math.min(...playCount);

    return (
      partnerScore * 100000 +
      opponentScore * 100000 -
      matches.length * 10 -
      rounds.length * 5 -
      (maxPlay - minPlay) * 1000
    );
  }

  function serializeScheduleRounds(result) {
    return result.rounds.map((round) => ({
      round: round.roundNumber,
      matches: round.matches.map((match) => ({
        teamA: match.teamA,
        teamB: match.teamB
      }))
    }));
  }

  root.PadelioMixAmericanoSchedule = {
    generateMixAmericanoSchedule,
    serializeScheduleRounds
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
