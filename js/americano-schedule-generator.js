/**
 * Americano schedule builder: cover all partner pairs, then all opponent pairs.
 * Exposed as globalThis.PadelioAmericanoSchedule (browser) for Padelio Normal mode.
 */
(function (root) {
  'use strict';

  function generateAmericanoSchedule(players, courts, options = {}) {
    const {
      maxRetries = 200,
      maxExtraMatches = 1000,
      verbose = false,
      recentQuartetLimit = 8
    } = options;

    if (!Array.isArray(players) || players.length < 4) {
      throw new Error('Minimal 4 players required.');
    }

    const n = players.length;
    const effectiveCourts = Math.min(courts, Math.floor(n / 4));

    if (effectiveCourts < 1) {
      throw new Error('At least 1 court is required.');
    }

    let bestResult = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = buildScheduleAttempt(players, effectiveCourts, maxExtraMatches, recentQuartetLimit);

      if (!bestResult || result.score > bestResult.score) {
        bestResult = result;
      }

      if (result.partnerComplete && result.opponentComplete) {
        if (verbose) {
          console.log(`Success at attempt ${attempt}`);
        }
        return result;
      }
    }

    return bestResult;
  }

  function buildScheduleAttempt(players, courts, maxExtraMatches, recentQuartetLimit = 8) {
    const n = players.length;

    const allPairs = getAllPairs(n);
    const allPairKeys = new Set(allPairs.map(pairKey));

    const remainingPartnerPairs = new Set(allPairs.map(pairKey));
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
        allPairs,
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

    while (!isOpponentComplete(opponentSeen, allPairKeys) && extra < maxExtraMatches) {
      const match = pickBestMatch({
        allPairs,
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

      const newOpponentCount = countNewOpponents(match, opponentSeen);

      if (newOpponentCount === 0) break;

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

    const partnerComplete = isPartnerComplete(partnerSeen, allPairKeys);
    const opponentComplete = isOpponentComplete(opponentSeen, allPairKeys);

    return {
      players,
      courts,
      totalPlayers: n,
      totalMatches: matches.length,
      totalRounds: rounds.length,
      minimumPartnerMatches: Math.ceil(allPairs.length / 2),
      partnerComplete,
      opponentComplete,
      partnerCoverage: {
        totalRequired: allPairKeys.size,
        totalCovered: partnerSeen.size,
        missing: getMissingPairs(allPairKeys, partnerSeen, players)
      },
      opponentCoverage: {
        totalRequired: allPairKeys.size,
        totalCovered: opponentSeen.size,
        missing: getMissingPairs(allPairKeys, opponentSeen, players)
      },
      playStats: buildPlayStats(players, playCount),
      rounds,
      score: calculateResultScore({
        partnerSeen,
        opponentSeen,
        allPairKeys,
        matches,
        rounds,
        playCount
      })
    };
  }

  function getAllPairs(n) {
    const pairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push([i, j]);
      }
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

  function pickBestMatch({
    allPairs,
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

    for (const teamA of allPairs) {
      const teamAKey = pairKey(teamA);
      const teamANew = remainingPartnerPairs.has(teamAKey);

      if (mode === 'partner-first' && remainingSize > 0 && !teamANew) {
        continue;
      }

      for (const teamB of allPairs) {
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
        const currentMaxPlay = Math.max(...playCount);
        const matchPlayCounts = playersInMatch.map((playerIndex) => playCount[playerIndex]);
        const totalPlayCount = matchPlayCounts.reduce((sum, count) => sum + count, 0);
        const maxPlayCount = Math.max(...matchPlayCounts);
        const minPlayCount = Math.min(...matchPlayCounts);

        /**
         * VERY IMPORTANT:
         * Fairness must beat partner/opponent scoring.
         * Example 8 players, 1 court:
         * after 3 rounds, 4 players have played 2x and 4 players have played 1x.
         * Round 4 must pick the four 1x players, otherwise someone stays at 1x.
         */
        const playersAboveCurrentMin = matchPlayCounts.filter((count) => count > currentMinPlay).length;
        const totalDistanceFromMin = matchPlayCounts.reduce(
          (sum, count) => sum + Math.max(0, count - currentMinPlay),
          0
        );

        const strictFairnessPenalty =
          playersAboveCurrentMin * 1000000 +
          totalDistanceFromMin * 500000 +
          Math.max(0, maxPlayCount - currentMinPlay) * 250000;

        const softBalancePenalty =
          totalPlayCount * 50 +
          (maxPlayCount - minPlayCount) * 5000 +
          (currentMaxPlay - currentMinPlay) * 100;

        const balancePenalty = strictFairnessPenalty + softBalancePenalty;

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

        // Anti-predictable rotation: strongly avoid reusing the same 4-player group.
        // This prevents A+B vs C+D, then A+C vs B+D, then A+D vs B+C happening close together.
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

    const playersInMatch = [match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1]];

    for (const playerIndex of playersInMatch) {
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

        const hasConflict = playersInCurrentMatch.some((playerIndex) =>
          usedPlayers.has(playerIndex)
        );

        if (!hasConflict) {
          round.matches.push(match);
          placed = true;
          break;
        }
      }

      if (!placed) {
        rounds.push({
          roundNumber: rounds.length + 1,
          matches: [match]
        });
      }
    }

    return rounds;
  }

  function isPartnerComplete(partnerSeen, allPairKeys) {
    for (const key of allPairKeys) {
      if (!partnerSeen.has(key)) return false;
    }
    return true;
  }

  function isOpponentComplete(opponentSeen, allPairKeys) {
    for (const key of allPairKeys) {
      if (!opponentSeen.has(key)) return false;
    }
    return true;
  }

  function getMissingPairs(allPairKeys, seenSet, players) {
    const missing = [];
    for (const key of allPairKeys) {
      if (!seenSet.has(key)) {
        const [a, b] = key.split('-').map(Number);
        missing.push({
          playerA: players[a],
          playerB: players[b]
        });
      }
    }
    return missing;
  }

  function buildPlayStats(players, playCount) {
    return players.map((name, index) => ({
      player: name,
      matches: playCount[index]
    }));
  }

  function calculateResultScore({
    partnerSeen,
    opponentSeen,
    allPairKeys,
    matches,
    rounds,
    playCount
  }) {
    const partnerScore = partnerSeen.size / allPairKeys.size;
    const opponentScore = opponentSeen.size / allPairKeys.size;
    const maxPlay = Math.max(...playCount);
    const minPlay = Math.min(...playCount);
    const balancePenalty = maxPlay - minPlay;

    return (
      partnerScore * 100000 +
      opponentScore * 100000 -
      matches.length * 10 -
      rounds.length * 5 -
      balancePenalty * 1000
    );
  }

  function formatScheduleResult(result) {
    return result.rounds.map((round) => ({
      round: round.roundNumber,
      courts: round.matches.map((match, index) => ({
        court: index + 1,
        teamA: [result.players[match.teamA[0]], result.players[match.teamA[1]]],
        teamB: [result.players[match.teamB[0]], result.players[match.teamB[1]]]
      }))
    }));
  }

  /** Compact storage: player indices only (roster order at creation). */
  function serializeScheduleRounds(result) {
    return result.rounds.map((round) => ({
      round: round.roundNumber,
      matches: round.matches.map((match) => ({
        teamA: match.teamA,
        teamB: match.teamB
      }))
    }));
  }

  root.PadelioAmericanoSchedule = {
    generateAmericanoSchedule,
    formatScheduleResult,
    serializeScheduleRounds
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
