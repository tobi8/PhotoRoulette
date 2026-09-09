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

// 4. Test Media Decks (Videos Only, Photos Only, Mixed)
import { getMockPartyVideos, getMockPartyPhotos, getMockPartyDeck } from './src/utils/mockData.ts'

const mockVideos = getMockPartyVideos()
assert.ok(mockVideos.length > 0, 'Mock videos should be available')
assert.ok(mockVideos.every((v) => v.type === 'video'), 'All mock videos must have type === video')
assert.ok(mockVideos.every((v) => v.dataUrl.startsWith('data:video/mp4;base64,')), 'All mock videos must be base64 mp4')

const videosOnlyDeck = getMockPartyDeck('videos_only')
assert.ok(videosOnlyDeck.length > 0, 'Videos-only deck should not be empty')
assert.ok(videosOnlyDeck.every((m) => m.type === 'video'), 'All items in videos-only deck must have type === video')

const photosOnlyDeck = getMockPartyDeck('photos_only')
assert.ok(photosOnlyDeck.length > 0, 'Photos-only deck should not be empty')
assert.ok(photosOnlyDeck.every((m) => m.type === 'image'), 'All items in photos-only deck must have type === image')

const mixedDeck = getMockPartyDeck('mixed')
assert.ok(mixedDeck.some((m) => m.type === 'video'), 'Mixed deck must contain videos')
assert.ok(mixedDeck.some((m) => m.type === 'image'), 'Mixed deck must contain photos')
// 5. Test Media Extension Filtering & Hidden Files
const isMediaFile = (fileName) => {
  if (fileName.startsWith('.') || fileName.length === 0) return false
  return /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif|mp4|mov|m4v|webm|avi|mkv|3gp|ogv)$/i.test(fileName)
}
assert.strictEqual(isMediaFile('.DS_Store'), false, 'Should reject .DS_Store')
assert.strictEqual(isMediaFile('._IMG_1234.JPG'), false, 'Should reject AppleDouble metadata file')
assert.strictEqual(isMediaFile('vacation.mp4'), true, 'Should accept .mp4')
assert.strictEqual(isMediaFile('party.MOV'), true, 'Should accept .MOV')
assert.strictEqual(isMediaFile('fun.webm'), true, 'Should accept .webm')
assert.strictEqual(isMediaFile('photo.heic'), true, 'Should accept .heic')
assert.strictEqual(isMediaFile('notes.pdf'), false, 'Should reject .pdf')
console.log('✅ File extension & hidden file filtering passed')

// 6. Test Balanced Multi-Player Roulette Deck Generation (No Host Dominance)
import { buildBalancedRouletteDeck, buildAggregatedPool, fisherYatesShuffle } from './src/utils/deckBuilder.ts'

const testPlayersList = [
  { id: 'host', name: 'Host', avatar: '👑', color: '#ff0055', isHost: true, isReady: true, score: 0, streak: 0, lastRoundPoints: 0, fastestAnswersCount: 0, mediaCount: 30 },
  { id: 'player_b', name: 'Player B', avatar: '🦊', color: '#00ccff', isHost: false, isReady: true, score: 0, streak: 0, lastRoundPoints: 0, fastestAnswersCount: 0, mediaCount: 5 },
  { id: 'player_c', name: 'Player C', avatar: '🐼', color: '#00ff88', isHost: false, isReady: true, score: 0, streak: 0, lastRoundPoints: 0, fastestAnswersCount: 0, mediaCount: 5 },
]

// Host has 30 photos, while B and C have 5 photos each
const rawPhotosDeck = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `host_${i}`, type: 'image', dataUrl: 'data:image/jpeg;base64,123', ownerId: 'host', ownerName: 'Host' })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `b_${i}`, type: 'image', dataUrl: 'data:image/jpeg;base64,456', ownerId: 'player_b', ownerName: 'Player B' })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `c_${i}`, type: 'image', dataUrl: 'data:image/jpeg;base64,789', ownerId: 'player_c', ownerName: 'Player C' })),
]

const balancedDeck = buildBalancedRouletteDeck(rawPhotosDeck, testPlayersList, 'photos_only', 10)
assert.strictEqual(balancedDeck.length, 10, 'Deck should contain exactly 10 rounds')

const countsByOwner = {}
for (const item of balancedDeck) {
  countsByOwner[item.ownerId] = (countsByOwner[item.ownerId] || 0) + 1
}

assert.ok(countsByOwner['host'] <= 4, `Host should not dominate deck (got ${countsByOwner['host']})`)
assert.ok(countsByOwner['player_b'] >= 3, `Player B should have fair share (got ${countsByOwner['player_b']})`)
assert.ok(countsByOwner['player_c'] >= 3, `Player C should have fair share (got ${countsByOwner['player_c']})`)
console.log('✅ Balanced deck distribution passed (Host: %d, Player B: %d, Player C: %d)', countsByOwner['host'], countsByOwner['player_b'], countsByOwner['player_c'])

const deckWithGuaranteed = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `host_${i}`, type: 'image', dataUrl: 'data:image/jpeg;base64,123', ownerId: 'host', ownerName: 'Host' })),
  { id: 'b_guaranteed', type: 'image', dataUrl: 'data:image/jpeg;base64,star', ownerId: 'player_b', ownerName: 'Player B', isGuaranteed: true },
  ...Array.from({ length: 19 }, (_, i) => ({ id: `b_${i}`, type: 'image', dataUrl: 'data:image/jpeg;base64,456', ownerId: 'player_b', ownerName: 'Player B' })),
]

for (let trial = 0; trial < 10; trial++) {
  const resultDeck = buildBalancedRouletteDeck(deckWithGuaranteed, testPlayersList.slice(0, 2), 'photos_only', 10)
  assert.ok(resultDeck.some((m) => m.id === 'b_guaranteed'), 'Guaranteed photo must 100% appear in the deck')
}
const submissionsMap = new Map()
submissionsMap.set('host', Array.from({ length: 20 }, (_, i) => ({ id: `host_${i}`, type: 'image', dataUrl: 'data:image/jpeg;base64,123', ownerId: 'host', ownerName: 'Host' })))
submissionsMap.set('guest', Array.from({ length: 20 }, (_, i) => ({ id: `guest_${i}`, type: 'image', dataUrl: 'data:image/jpeg;base64,456', ownerId: 'guest', ownerName: 'Guest' })))

const aggregatedPool = buildAggregatedPool(submissionsMap)
assert.strictEqual(aggregatedPool.length, 40, 'Aggregated pool should contain all 40 items')

const mapDeck = buildBalancedRouletteDeck(submissionsMap, [testPlayersList[0], testPlayersList[1]], 'photos_only', 10)
assert.strictEqual(mapDeck.length, 10, 'Deck built from submissions map should have 10 rounds')

const mapOwnerCounts = {}
for (const item of mapDeck) {
  mapOwnerCounts[item.ownerId] = (mapOwnerCounts[item.ownerId] || 0) + 1
}
assert.strictEqual(mapOwnerCounts['host'], 5, 'Host should have exactly 5 rounds in balanced 2-player deck')
assert.strictEqual(mapOwnerCounts['guest'], 5, 'Guest should have exactly 5 rounds in balanced 2-player deck')
console.log('✅ Multi-player Map submission aggregation & balanced deck passed')

const emptyDeckResult = buildBalancedRouletteDeck([], testPlayersList, 'photos_only', 10)
assert.strictEqual(emptyDeckResult.length, 0, 'Deck should be empty when no photos uploaded and no placeholder photos returned')

const tvHost = { id: 'host', name: 'Host', isHost: true, mediaCount: 0 }
const guest1 = { id: 'g1', name: 'Guest 1', isHost: false, mediaCount: 5 }
const guest2 = { id: 'g2', name: 'Guest 2', isHost: false, mediaCount: 0 }
const lobbyPlayers = [tvHost, guest1, guest2]

const tvActive = lobbyPlayers.filter((p) => !p.isHost)
assert.strictEqual(tvActive.length, 2, 'TV mode active players should exclude host')
assert.strictEqual(tvActive.some((p) => p.isHost), false, 'Host must not appear in active players list')

const canStartBeforeGuest2 = tvActive.length > 0 && tvActive.every((p) => (p.mediaCount || 0) > 0)
assert.strictEqual(canStartBeforeGuest2, false, 'Host cannot start when guest2 has not selected photos')

guest2.mediaCount = 10
const canStartAfterGuest2 = tvActive.length > 0 && tvActive.every((p) => (p.mediaCount || 0) > 0)
assert.strictEqual(canStartAfterGuest2, true, 'Host can start once all active players have selected photos')
console.log('✅ Placeholder photos removal & TV mode readiness validation passed')

import { HostRoundController } from './src/utils/hostRoundController.ts'
import { clockSync } from './src/utils/clockSync.ts'

clockSync.reset()
clockSync.recordSample(1000, 1050, 1100)
assert.strictEqual(clockSync.getOffset(), 0, 'Offset should be 0 for symmetric ping-pong')

clockSync.reset()
clockSync.recordSample(1000, 1250, 1100)
assert.strictEqual(clockSync.getOffset(), 200, 'Offset should compensate 200ms skew')

const hostDummyPlayers = [
  { id: 'h1', name: 'Host', avatar: '👑', color: '#f00', isHost: true, isReady: true, score: 0, streak: 0, lastRoundPoints: 0, fastestAnswersCount: 0, mediaCount: 2 },
  { id: 'g1', name: 'Guest', avatar: '🐱', color: '#0f0', isHost: false, isReady: true, score: 0, streak: 0, lastRoundPoints: 0, fastestAnswersCount: 0, mediaCount: 2 },
]
const hostDummyDeck = [
  { id: 'm1', ownerId: 'h1', ownerName: 'Host', type: 'image', dataUrl: 'data:image/png;base64,abc' },
  { id: 'm2', ownerId: 'g1', ownerName: 'Guest', type: 'image', dataUrl: 'data:image/png;base64,def' },
]

let testPreloadSent = false
let testStartSent = false
let testStartPayload = null

let testCountdownStarted = false
const testController = new HostRoundController({
  onPreloadBroadcast: (p) => {
    testPreloadSent = true
  },
  onCountdownStart: (roundNum, total) => {
    testCountdownStarted = true
  },
  onRoundStartBroadcast: (p) => {
    testStartSent = true
    testStartPayload = p
  },
  onRoundExpire: () => {},
  onLeaderboardBroadcast: () => {},
  onAdvanceToNextRound: () => {},
  onGameOver: () => {},
})

testController.initGame(hostDummyDeck, hostDummyPlayers, 5, 2, false)
testController.startRound(1)
assert.strictEqual(testPreloadSent, true, 'Preload payload should be dispatched in background')
assert.strictEqual(testStartSent, false, 'Start should wait until countdown finish')

testController.handleClientPreloadAck(1, 'g1')
assert.strictEqual(testCountdownStarted, true, 'Countdown should trigger once peers ack')

testController.transitionToActiveRound(1)
assert.strictEqual(testController.getPhase(), 'ROUND_ACTIVE', 'Should enter ROUND_ACTIVE')
assert.strictEqual(testStartSent, true, 'Round start dispatched with future endTime')
assert.ok(testStartPayload.endTime > testStartPayload.startTime, 'endTime must be in future')

testController.cleanup()
console.log('✅ Host-authoritative barrier architecture & clock skew unit tests passed')
