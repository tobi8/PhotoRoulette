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
  let eligibleDeck = [...rawDeck]
  if (mediaType === 'photos_only') {
    eligibleDeck = eligibleDeck.filter((m) => m.type === 'image')
  } else if (mediaType === 'videos_only') {
    eligibleDeck = eligibleDeck.filter((m) => m.type === 'video')
  }

  // If no media uploaded, fallback to party packs
  if (eligibleDeck.length === 0) {
    if (mediaType === 'videos_only') {
      return getMockPartyVideos().slice(0, totalRoundsRequested).map((v, idx) => ({
        ...v,
        ownerId: players[idx % players.length]?.id || 'host',
        ownerName: players[idx % players.length]?.name || 'Player',
      }))
    }
    if (mediaType === 'mixed') {
      return getMockPartyDeck('mixed').slice(0, totalRoundsRequested).map((m, idx) => ({
        ...m,
        ownerId: players[idx % players.length]?.id || 'host',
        ownerName: players[idx % players.length]?.name || 'Player',
      }))
    }
    return getMockPartyPhotos().slice(0, totalRoundsRequested).map((p, idx) => ({
      ...p,
      ownerId: players[idx % players.length]?.id || 'host',
      ownerName: players[idx % players.length]?.name || 'Player',
    }))
  }

  if (mediaType === 'mixed') {
    // If user chose mixed mode, ensure both photos and videos are present in the eligible deck
    const hasPhotos = eligibleDeck.some((m) => m.type === 'image')
    const hasVideos = eligibleDeck.some((m) => m.type === 'video')

    if (!hasVideos) {
      const mockVideos = getMockPartyVideos().map((v, idx) => ({
        ...v,
        ownerId: players[idx % players.length]?.id || 'host',
        ownerName: players[idx % players.length]?.name || 'Player',
      }))
      eligibleDeck = [...eligibleDeck, ...mockVideos]
    }
    if (!hasPhotos) {
      const mockPhotos = getMockPartyPhotos().map((p, idx) => ({
        ...p,
        ownerId: players[idx % players.length]?.id || 'host',
        ownerName: players[idx % players.length]?.name || 'Player',
      }))
      eligibleDeck = [...eligibleDeck, ...mockPhotos]
    }
  }

  // Group media by player ownerId
  const playerMediaMap = new Map<string, MediaItem[]>()
  for (const item of eligibleDeck) {
    const list = playerMediaMap.get(item.ownerId) || []
    list.push(item)
    playerMediaMap.set(item.ownerId, list)
  }

  // Shuffle each player's individual pool so their own selected items are random
  for (const [pId, items] of playerMediaMap.entries()) {
    playerMediaMap.set(pId, fisherYatesShuffle(items))
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
