import { MediaItem, Player } from '../types/game'

export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function buildAggregatedPool(
  submissions: Map<string, MediaItem[]> | Record<string, MediaItem[]>
): MediaItem[] {
  const pool: MediaItem[] = []
  const entries =
    submissions instanceof Map
      ? Array.from(submissions.entries())
      : Object.entries(submissions)

  for (const [playerId, items] of entries) {
    if (!Array.isArray(items)) continue
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const id = item.id || `${playerId}_${i}`
      const dataUrl = item.dataUrl || ''
      pool.push({
        id,
        dataUrl,
        type: item.type || 'image',
        ownerId: item.ownerId || playerId,
        ownerName: item.ownerName || 'Player',
        isGuaranteed: Boolean(item.isGuaranteed),
      })
    }
  }

  return pool
}

export function buildBalancedRouletteDeck(
  rawDeckOrSubmissions: MediaItem[] | Map<string, MediaItem[]>,
  players: Player[],
  mediaType: 'photos_only' | 'videos_only' | 'mixed' = 'photos_only',
  totalRoundsRequested: number = 10
): MediaItem[] {
  const rawDeck: MediaItem[] =
    rawDeckOrSubmissions instanceof Map
      ? buildAggregatedPool(rawDeckOrSubmissions)
      : rawDeckOrSubmissions

  let eligibleDeck = rawDeck.filter((m) => {
    if (mediaType === 'videos_only') return m.type === 'video'
    if (mediaType === 'photos_only') return m.type === 'image'
    return m.type === 'image' || m.type === 'video'
  })

  if (eligibleDeck.length === 0) {
    return []
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

  let roundCounter = 0
  while (selectedItems.length < maxRounds && activeContributorIds.length > 0) {
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
    if (roundCounter > 200) break
  }

  return fisherYatesShuffle(selectedItems)
}
