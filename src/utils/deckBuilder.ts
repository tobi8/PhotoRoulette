import { MediaItem, Player } from '../types/game'
import { getMockPartyPhotos, getMockPartyVideos, getMockPartyDeck } from './mockData'

/**
 * Modern Fisher-Yates shuffle
 */
export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Fairly and evenly distributes rounds across ALL participating players who contributed media.
 * Avoids host dominance: if multiple players uploaded media, rounds alternate fairly among them,
 * and the sequence is thoroughly randomized using Fisher-Yates shuffle.
 */
export function buildBalancedRouletteDeck(
  rawDeck: MediaItem[],
  players: Player[],
  mediaType: 'photos_only' | 'videos_only' | 'mixed' = 'photos_only',
  totalRoundsRequested: number = 10
): MediaItem[] {
  let eligibleDeck = rawDeck.filter((m) => m.type === 'image')

  if (eligibleDeck.length === 0) {
    return getMockPartyPhotos().slice(0, totalRoundsRequested).map((p, idx) => ({
      ...p,
      ownerId: players[idx % players.length]?.id || 'host',
      ownerName: players[idx % players.length]?.name || 'Player',
    }))
  }

  const playerMediaMap = new Map<string, MediaItem[]>()
  for (const item of eligibleDeck) {
    const list = playerMediaMap.get(item.ownerId) || []
    list.push(item)
    playerMediaMap.set(item.ownerId, list)
  }

  for (const [pId, items] of playerMediaMap.entries()) {
    const guaranteed = items.filter((m) => m.isGuaranteed)
    const nonGuaranteed = fisherYatesShuffle(items.filter((m) => !m.isGuaranteed))
    playerMediaMap.set(pId, [...guaranteed, ...nonGuaranteed])
  }

  const activeContributorIds = Array.from(playerMediaMap.keys()).filter(
    (id) => (playerMediaMap.get(id)?.length || 0) > 0
  )

  const selectedItems: MediaItem[] = []
  const maxRounds = Math.min(totalRoundsRequested, eligibleDeck.length)

  // Cyclically pick 1 item from each player until maxRounds is reached
  let roundCounter = 0
  while (selectedItems.length < maxRounds && activeContributorIds.length > 0) {
    // Randomize player order within each round cycle so it doesn't follow a predictable turn order
    const cycleOrder = fisherYatesShuffle([...activeContributorIds])
    for (const pId of cycleOrder) {
      if (selectedItems.length >= maxRounds) break
      const pool = playerMediaMap.get(pId)
      if (pool && pool.length > 0) {
        selectedItems.push(pool.shift()!)
        if (pool.length === 0) {
          const idx = activeContributorIds.indexOf(pId)
          if (idx !== -1) activeContributorIds.splice(idx, 1)
        }
      }
    }
    roundCounter++
    if (roundCounter > 200) break // Safety exit
  }

  // Final Fisher-Yates shuffle on the balanced deck so rounds are totally unpredictable
  return fisherYatesShuffle(selectedItems)
}
