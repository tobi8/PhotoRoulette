// Standalone test suite for Photo Roulette core logic

import assert from 'node:assert'
import { calculateScore, calculateAwards } from './src/utils/scoring.ts'
import { formatRoomCode, generateRoomCode } from './src/hooks/usePeerConnection.ts'

console.log('🧪 Starting core logic unit tests...')

// 1. Test Room Code Generation
const code = generateRoomCode()
assert.strictEqual(code.length, 5, 'Room code should be 5 chars')
assert.strictEqual(code, code.toUpperCase(), 'Room code should be uppercase')
assert.strictEqual(formatRoomCode('  ab-cd 1 '), 'ABCD1', 'formatRoomCode should sanitize cleanly')
console.log('✅ Room code generation & formatting passed')

// 2. Test Scoring Math (Kahoot-Style Speed Decay)
// Instant answer (0ms elapsed on 5s round)
const instantScore = calculateScore(true, 0, 5, 0, 0)
assert.strictEqual(instantScore.points, 1000, 'Instant answer should award 1000 points')
assert.strictEqual(instantScore.streak, 1, 'Streak should increment to 1')
assert.strictEqual(instantScore.newTotal, 1000, 'New total should be 1000')

// Half-time answer (2.5s elapsed on 5s round)
const halfTimeScore = calculateScore(true, 2500, 5, 0, 0)
assert.strictEqual(halfTimeScore.points, 750, 'Half-time answer should award 750 points')

// Last-moment answer (5000ms elapsed on 5s round)
const lastMomentScore = calculateScore(true, 5000, 5, 0, 0)
assert.strictEqual(lastMomentScore.points, 500, 'Last-moment answer should award 500 points')

// Incorrect answer
const wrongScore = calculateScore(false, 1000, 5, 1500, 3)
assert.strictEqual(wrongScore.points, 0, 'Wrong answer should award 0 points')
assert.strictEqual(wrongScore.streak, 0, 'Wrong answer should reset streak to 0')
assert.strictEqual(wrongScore.newTotal, 1500, 'Total score should remain unchanged')

// Streak bonus test
const streak2 = calculateScore(true, 0, 5, 1000, 1) // 2nd in a row
assert.strictEqual(streak2.streakBonus, 100, 'Streak 2 should award +100 bonus')
assert.strictEqual(streak2.points, 1100, 'Total round points should be 1000 + 100 = 1100')

const streak3 = calculateScore(true, 0, 5, 2100, 2) // 3rd in a row
assert.strictEqual(streak3.streakBonus, 200, 'Streak 3 should award +200 bonus')
assert.strictEqual(streak3.points, 1200, 'Total round points should be 1000 + 200 = 1200')

console.log('✅ Kahoot speed decay scoring and streaks passed')

// 3. Test Awards Calculation
const testPlayers = [
  { id: 'p1', name: 'Alice', avatar: '🦊', color: '#f00', isHost: true, isReady: true, score: 3200, streak: 3, lastRoundPoints: 500, fastestAnswersCount: 4, mediaCount: 5 },
  { id: 'p2', name: 'Bob', avatar: '🐼', color: '#0f0', isHost: false, isReady: true, score: 2100, streak: 0, lastRoundPoints: 0, fastestAnswersCount: 1, mediaCount: 5 },
]

const testHistory = [
  {
    ownerId: 'p2',
    answers: {
      p1: { guessedPlayerId: 'p1', isCorrect: false, responseTime: 1200 },
    },
  },
  {
    ownerId: 'p2',
    answers: {
      p1: { guessedPlayerId: 'p1', isCorrect: false, responseTime: 900 },
    },
  },
]

const awards = calculateAwards(testPlayers, testHistory)
assert.strictEqual(awards.fastestGuesser?.player.id, 'p1', 'Alice should be fastest guesser')
assert.strictEqual(awards.chameleon?.player.id, 'p2', 'Bob should be chameleon (fooled Alice)')
assert.strictEqual(awards.eagleEye?.player.id, 'p1', 'Alice should have highest points')

console.log('✅ Post-game awards logic passed')
console.log('🎉 All automated tests passed successfully!')
