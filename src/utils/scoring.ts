import { Player } from '../types/game'

export interface ScoreCalculationResult {
  isCorrect: boolean
  points: number
  streak: number
  streakBonus: number
  newTotal: number
}

/**
 * Kahoot-style speed decay scoring:
 * Max 1000 pts for instant answer, decaying linearly to 500 pts at round timer expiration.
 * Additional streak bonus added.
 */
export function calculateScore(
  isCorrect: boolean,
  responseTimeMs: number,
  roundDurationSec: number,
  currentScore: number,
  currentStreak: number,
  maxPoints = 1000,
  minPoints = 500
): ScoreCalculationResult {
  if (!isCorrect) {
    return {
      isCorrect: false,
      points: 0,
      streak: 0,
      streakBonus: 0,
      newTotal: currentScore,
    }
  }

  const durationMs = roundDurationSec * 1000
  const clampedTime = Math.min(Math.max(0, responseTimeMs), durationMs)
  const timeFactor = 1 - clampedTime / durationMs

  const basePoints = Math.round(minPoints + (maxPoints - minPoints) * timeFactor)

  const newStreak = currentStreak + 1
  let streakBonus = 0
  if (newStreak >= 4) {
    streakBonus = 300
  } else if (newStreak === 3) {
    streakBonus = 200
  } else if (newStreak === 2) {
    streakBonus = 100
  }

  const totalRoundPoints = basePoints + streakBonus

  return {
    isCorrect: true,
    points: totalRoundPoints,
    streak: newStreak,
    streakBonus,
    newTotal: currentScore + totalRoundPoints,
  }
}

export interface GameAwards {
  fastestGuesser?: { player: Player; stat: string }
  chameleon?: { player: Player; stat: string }
  eagleEye?: { player: Player; stat: string }
}

/**
 * Calculates fun post-game awards
 */
export function calculateAwards(
  players: Player[],
  roundHistory: Array<{
    ownerId: string
    answers: Record<string, { guessedPlayerId: string; isCorrect: boolean; responseTime: number }>
  }>
): GameAwards {
  if (players.length === 0) return {}

  // 1. Fastest Guesser: player with highest count of fastest answers or lowest avg response time
  let fastestPlayer: Player | undefined = undefined
  let maxFastestCount = -1

  for (const player of players) {
    if (player.fastestAnswersCount > maxFastestCount) {
      maxFastestCount = player.fastestAnswersCount
      fastestPlayer = player
    }
  }

  // 2. Chameleon: The player whose photos had the fewest correct guesses (fooled the most friends)
  const fooledCountMap: Record<string, { totalGuesses: number; wrongGuesses: number }> = {}
  players.forEach((p) => {
    fooledCountMap[p.id] = { totalGuesses: 0, wrongGuesses: 0 }
  })

  for (const round of roundHistory) {
    if (fooledCountMap[round.ownerId]) {
      Object.entries(round.answers).forEach(([guesserId, ans]) => {
        if (guesserId !== round.ownerId) {
          fooledCountMap[round.ownerId].totalGuesses++
          if (!ans.isCorrect) {
            fooledCountMap[round.ownerId].wrongGuesses++
          }
        }
      })
    }
  }

  let bestChameleon: Player | undefined = undefined
  let highestBluffRate = -1

  for (const player of players) {
    const stat = fooledCountMap[player.id]
    if (stat && stat.totalGuesses >= 2) {
      const rate = stat.wrongGuesses / stat.totalGuesses
      if (rate > highestBluffRate) {
        highestBluffRate = rate
        bestChameleon = player
      }
    }
  }

  // 3. Eagle Eye: highest score or highest streak
  let bestStreakPlayer = [...players].sort((a, b) => b.score - a.score)[0]

  return {
    fastestGuesser: fastestPlayer && maxFastestCount > 0
      ? { player: fastestPlayer, stat: `${maxFastestCount} lightning-fast answers` }
      : undefined,
    chameleon: bestChameleon && highestBluffRate > 0.4
      ? { player: bestChameleon, stat: `Fooled ${Math.round(highestBluffRate * 100)}% of players` }
      : undefined,
    eagleEye: bestStreakPlayer
      ? { player: bestStreakPlayer, stat: `${bestStreakPlayer.score.toLocaleString()} total points` }
      : undefined,
  }
}
