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
  isGuaranteed?: boolean
}

export interface ExcludedMediaItem {
  id: string
  file?: File
  previewUrl: string
  reason: string
  confidence: number
  isExcluded: boolean
  isGuaranteed?: boolean
}

export interface GameSettings {
  roundDuration: number
  totalRounds: number
  mediaType: 'photos_only' | 'videos_only' | 'mixed'
  progressiveBlur: boolean
  tvMode: boolean
}


export type GamePhase =
  | 'LANDING'
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'PRECACHE'
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
    isOwner: boolean
  } | null
  correctOwnerId?: string
  correctOwnerName?: string
  duration: number
  startTime: number
  endTime?: number
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
  | 'ROUND_PRELOAD'
  | 'CLIENT_PRELOAD_ACK'
  | 'ROUND_START'
  | 'SUBMIT_GUESS'
  | 'ANSWER_SUBMITTED'
  | 'PANIC_VETO'
  | 'VETO_TRIGGERED'
  | 'ROUND_END'
  | 'LEADERBOARD_BARRIER_SYNC'
  | 'LEADERBOARD_READY_ACK'
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

export interface RoundPreloadPayload {
  roundNumber: number
  totalRounds: number
  duration: number
  media: {
    id: string
    type: 'image' | 'video'
    dataUrl: string
    ownerId: string
  }
}

export interface ClientPreloadAckPayload {
  roundNumber: number
  playerId: string
  success: boolean
}

export interface RoundStartPayload {
  roundNumber: number
  totalRounds: number
  duration: number
  startTime: number
  endTime: number
  media: {
    id: string
    type: 'image' | 'video'
    dataUrl: string
    ownerId: string
  }
  progressiveBlur?: boolean
}

export interface SubmitGuessPayload {
  roundId: number
  playerId: string
  selectedChoice: string
  timestamp: number
  responseTime: number
}

export interface LeaderboardSyncPayload {
  roundNumber: number
  totalRounds: number
  players: Player[]
  barrierDurationMs: number
}

export interface LeaderboardReadyAckPayload {
  roundNumber: number
  playerId: string
}

