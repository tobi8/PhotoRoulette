import { MediaItem, Player, RoundStartPayload, RoundPreloadPayload, LeaderboardSyncPayload } from '../types/game'

export type RoundControllerPhase = 'IDLE' | 'PRECACHE' | 'ROUND_ACTIVE' | 'LEADERBOARD_BARRIER'

export interface HostRoundControllerCallbacks {
  onPreloadBroadcast: (payload: RoundPreloadPayload) => void
  onRoundStartBroadcast: (payload: RoundStartPayload) => void
  onRoundExpire: () => void
  onLeaderboardBroadcast: (payload: LeaderboardSyncPayload) => void
  onAdvanceToNextRound: (nextRoundNumber: number) => void
  onGameOver: () => void
}

export class HostRoundController {
  private phase: RoundControllerPhase = 'IDLE'
  private currentRoundIndex: number = 0
  private totalRounds: number = 0
  private roundDurationSec: number = 5
  private progressiveBlur: boolean = false
  private deck: MediaItem[] = []
  private players: Player[] = []
  private callbacks: HostRoundControllerCallbacks

  private precacheAcks: Set<string> = new Set()
  private precacheTimeoutId: any = null

  private activeRoundTimerId: any = null

  private leaderboardAcks: Set<string> = new Set()
  private leaderboardBaseTimeoutId: any = null
  private leaderboardSafetyTimeoutId: any = null
  private isBaseDurationElapsed: boolean = false

  constructor(callbacks: HostRoundControllerCallbacks) {
    this.callbacks = callbacks
  }

  public initGame(deck: MediaItem[], players: Player[], roundDurationSec: number, totalRounds: number, progressiveBlur: boolean = false): void {
    this.cleanup()
    this.deck = deck
    this.players = players
    this.roundDurationSec = roundDurationSec
    this.totalRounds = Math.min(totalRounds, deck.length)
    this.progressiveBlur = progressiveBlur
    this.currentRoundIndex = 0
  }

  public setPlayers(players: Player[]): void {
    this.players = players
  }

  public startRound(roundNumber: number): void {
    this.cleanupTimers()

    if (roundNumber > this.totalRounds || this.currentRoundIndex >= this.deck.length) {
      this.phase = 'IDLE'
      this.callbacks.onGameOver()
      return
    }

    const media = this.deck[this.currentRoundIndex]
    if (!media) {
      this.phase = 'IDLE'
      this.callbacks.onGameOver()
      return
    }

    this.phase = 'PRECACHE'
    this.precacheAcks.clear()

    const preloadPayload: RoundPreloadPayload = {
      roundNumber,
      totalRounds: this.totalRounds,
      duration: this.roundDurationSec,
      media: {
        id: media.id,
        type: media.type,
        dataUrl: media.dataUrl,
        ownerId: media.ownerId,
      },
    }

    this.callbacks.onPreloadBroadcast(preloadPayload)

    this.precacheTimeoutId = setTimeout(() => {
      this.transitionToActiveRound(roundNumber)
    }, 6000)
  }

  public handleClientPreloadAck(roundNumber: number, playerId: string): void {
    if (this.phase !== 'PRECACHE') return
    const expectedRound = this.currentRoundIndex + 1
    if (roundNumber !== expectedRound) return

    this.precacheAcks.add(playerId)

    const nonHostConnectedPeers = this.players.filter((p) => !p.isHost && !p.id.startsWith('bot-'))
    const allAcknowledged = nonHostConnectedPeers.every((p) => this.precacheAcks.has(p.id))

    if (allAcknowledged) {
      if (this.precacheTimeoutId) {
        clearTimeout(this.precacheTimeoutId)
        this.precacheTimeoutId = null
      }
      this.transitionToActiveRound(roundNumber)
    }
  }

  private transitionToActiveRound(roundNumber: number): void {
    if (this.phase !== 'PRECACHE') return
    this.cleanupTimers()

    const media = this.deck[this.currentRoundIndex]
    if (!media) return

    this.phase = 'ROUND_ACTIVE'

    const networkBufferMs = 150
    const roundDurationMs = this.roundDurationSec * 1000
    const now = Date.now()
    const startTime = now + networkBufferMs
    const endTime = startTime + roundDurationMs

    const startPayload: RoundStartPayload = {
      roundNumber,
      totalRounds: this.totalRounds,
      duration: this.roundDurationSec,
      startTime,
      endTime,
      media: {
        id: media.id,
        type: media.type,
        dataUrl: media.dataUrl,
        ownerId: media.ownerId,
      },
      progressiveBlur: this.progressiveBlur,
    }

    this.callbacks.onRoundStartBroadcast(startPayload)

    const totalDelay = Math.max(0, endTime - Date.now() + 50)
    this.activeRoundTimerId = setTimeout(() => {
      if (this.phase === 'ROUND_ACTIVE') {
        this.callbacks.onRoundExpire()
      }
    }, totalDelay)
  }

  public enterLeaderboardBarrier(roundNumber: number, updatedPlayers: Player[], baseDurationMs: number = 4000, safetyBufferMs: number = 2000): void {
    this.cleanupTimers()
    this.phase = 'LEADERBOARD_BARRIER'
    this.players = updatedPlayers
    this.leaderboardAcks.clear()
    this.isBaseDurationElapsed = false

    const syncPayload: LeaderboardSyncPayload = {
      roundNumber,
      totalRounds: this.totalRounds,
      players: updatedPlayers,
      barrierDurationMs: baseDurationMs,
    }

    this.callbacks.onLeaderboardBroadcast(syncPayload)

    this.leaderboardBaseTimeoutId = setTimeout(() => {
      this.isBaseDurationElapsed = true
      this.checkLeaderboardBarrierCompletion(roundNumber)
    }, baseDurationMs)

    this.leaderboardSafetyTimeoutId = setTimeout(() => {
      this.proceedToNextRound(roundNumber)
    }, baseDurationMs + safetyBufferMs)
  }

  public handleLeaderboardAck(roundNumber: number, playerId: string): void {
    if (this.phase !== 'LEADERBOARD_BARRIER') return
    const expectedRound = this.currentRoundIndex + 1
    if (roundNumber !== expectedRound) return

    this.leaderboardAcks.add(playerId)
    if (this.isBaseDurationElapsed) {
      this.checkLeaderboardBarrierCompletion(roundNumber)
    }
  }

  private checkLeaderboardBarrierCompletion(roundNumber: number): void {
    const nonHostConnectedPeers = this.players.filter((p) => !p.isHost && !p.id.startsWith('bot-'))
    const allAcknowledged = nonHostConnectedPeers.every((p) => this.leaderboardAcks.has(p.id))

    if (allAcknowledged) {
      this.proceedToNextRound(roundNumber)
    }
  }

  public proceedToNextRound(completedRoundNumber: number): void {
    if (this.phase !== 'LEADERBOARD_BARRIER') return
    this.cleanupTimers()
    this.currentRoundIndex++
    this.phase = 'IDLE'
    this.callbacks.onAdvanceToNextRound(completedRoundNumber + 1)
  }

  public cleanupTimers(): void {
    if (this.precacheTimeoutId) {
      clearTimeout(this.precacheTimeoutId)
      this.precacheTimeoutId = null
    }
    if (this.activeRoundTimerId) {
      clearTimeout(this.activeRoundTimerId)
      this.activeRoundTimerId = null
    }
    if (this.leaderboardBaseTimeoutId) {
      clearTimeout(this.leaderboardBaseTimeoutId)
      this.leaderboardBaseTimeoutId = null
    }
    if (this.leaderboardSafetyTimeoutId) {
      clearTimeout(this.leaderboardSafetyTimeoutId)
      this.leaderboardSafetyTimeoutId = null
    }
  }

  public cleanup(): void {
    this.cleanupTimers()
    this.phase = 'IDLE'
    this.precacheAcks.clear()
    this.leaderboardAcks.clear()
    this.isBaseDurationElapsed = false
  }

  public getPhase(): RoundControllerPhase {
    return this.phase
  }

  public getCurrentRoundIndex(): number {
    return this.currentRoundIndex
  }
}
