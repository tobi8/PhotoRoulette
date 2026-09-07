export interface Player {
  id: string
  name: string
  avatar: string
  color: string
  isHost: boolean
  isReady: boolean
  score: number
  streak: number
  lastRoundPoints: number
  fastestAnswersCount: number
  mediaCount: number
}

export interface MediaItem {
  id: string
  ownerId: string
  ownerName: string
  type: 'image' | 'video'
  dataUrl: string
  previewUrl?: string
  aspectRatio?: number
  duration?: number
}

export interface ExcludedMediaItem {
  id: string
  file?: File
  previewUrl: string
  reason: string
  confidence: number
  isExcluded: boolean
}

export interface GameSettings {
  roundDuration: number // 3, 5, 8, 10 seconds
  totalRounds: number   // 10, 15, 20
  mediaType: 'photos_only' | 'videos_only' | 'mixed'
  progressiveBlur: boolean // Sharpen over time vs instant reveal
  tvMode: boolean       // Host operates as TV/Big screen board
}

export type GamePhase =
  | 'LANDING'
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'ACTIVE_ROUND'
  | 'REVEAL'
  | 'LEADERBOARD'
  | 'GAME_OVER'

export interface ActiveRoundState {
  roundNumber: number
  totalRounds: number
  activeMedia: {
    id: string
    type: 'image' | 'video'
    dataUrl: string
    isOwner: boolean // true if current player owns it (enables Panic Button)
  } | null
  correctOwnerId?: string
  correctOwnerName?: string
  duration: number
  startTime: number
  isVetoed: boolean
  hasAnswered: boolean
  selectedPlayerId?: string
  results?: {
    correctPlayerId: string
    answers: Record<string, {
      guessedPlayerId: string
      isCorrect: boolean
      points: number
      responseTime: number
      newTotal: number
      streak: number
    }>
    fastestGuesserId?: string
  }
}

export type MessageType =
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPTED'
  | 'JOIN_REJECTED'
  | 'MEDIA_CONTRIBUTION'
  | 'PLAYER_READY'
  | 'SETTINGS_UPDATE'
  | 'STATE_SYNC'
  | 'ROUND_COUNTDOWN'
  | 'ROUND_START'
  | 'ANSWER_SUBMITTED'
  | 'PANIC_VETO'
  | 'VETO_TRIGGERED'
  | 'ROUND_END'
  | 'LEADERBOARD_VIEW'
  | 'GAME_OVER'
  | 'PLAY_AGAIN'
  | 'PING'
  | 'PONG'
  | 'DATA_CHUNK'

export interface PeerMessage {
  type: MessageType
  senderId: string
  payload: any
  timestamp?: number
}
