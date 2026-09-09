import { MediaItem, Player, RoundStartPayload, RoundPreloadPayload, LeaderboardSyncPayload } from '../types/game'

export type RoundControllerPhase = 'IDLE' | 'PRECACHE' | 'COUNTDOWN' | 'ROUND_ACTIVE' | 'LEADERBOARD_BARRIER'

export interface HostRoundControllerCallbacks {
  onPreloadBroadcast: (payload: RoundPreloadPayload) => void
  onCountdownStart: (roundNumber: number, totalRounds: number) => void
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

  public preloadRound(roundNumber: number): void {
    if (roundNumber > this.totalRounds || this.currentRoundIndex >= this.deck.length) {
      return
    }

    const media = this.deck[this.currentRoundIndex]
    if (!media) return

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
      },
    }

    this.callbacks.onPreloadBroadcast(preloadPayload)
  }

  public handleClientPreloadAck(roundNumber: number, playerId: string): void {
    const expectedRound = this.currentRoundIndex + 1
    if (roundNumber !== expectedRound) return

    this.precacheAcks.add(playerId)
    if (this.phase === 'PRECACHE') {
      const nonHostConnectedPeers = this.players.filter((p) => !p.isHost && !p.id.startsWith('bot-'))
      const allAcknowledged = nonHostConnectedPeers.every((p) => this.precacheAcks.has(p.id))
      if (allAcknowledged) {
        if (this.precacheTimeoutId) {
          clearTimeout(this.precacheTimeoutId)
          this.precacheTimeoutId = null
          this.startCountdown(roundNumber)
        }
      }
    }
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

    const nonHostConnectedPeers = this.players.filter((p) => !p.isHost && !p.id.startsWith('bot-'))
    const allAcknowledged = nonHostConnectedPeers.every((p) => this.precacheAcks.has(p.id))

    if (allAcknowledged) {
      this.startCountdown(roundNumber)
    } else {
      this.phase = 'PRECACHE'
      this.preloadRound(roundNumber)
      this.precacheTimeoutId = setTimeout(() => {
        this.startCountdown(roundNumber)
      }, 2500)
    }
  }

  public startCountdown(roundNumber: number): void {
    if (this.precacheTimeoutId) {
      clearTimeout(this.precacheTimeoutId)
      this.precacheTimeoutId = null
    }
    this.phase = 'COUNTDOWN'
    this.callbacks.onCountdownStart(roundNumber, this.totalRounds)
  }

  public transitionToActiveRound(roundNumber: number): void {
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

    const nextRoundIndex = this.currentRoundIndex + 1
    if (nextRoundIndex < this.deck.length && nextRoundIndex < this.totalRounds) {
      const nextMedia = this.deck[nextRoundIndex]
      if (nextMedia) {
        this.precacheAcks.clear()
        const preloadPayload: RoundPreloadPayload = {
          roundNumber: nextRoundIndex + 1,
          totalRounds: this.totalRounds,
          duration: this.roundDurationSec,
          media: {
            id: nextMedia.id,
            type: nextMedia.type,
            dataUrl: nextMedia.dataUrl,
          },
        }
        this.callbacks.onPreloadBroadcast(preloadPayload)
      }
    }

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

  public getCurrentSecret(): { currentRound: number; correctOwnerId: string; correctOwnerName: string } | null {
    const media = this.deck[this.currentRoundIndex]
    if (!media) return null
    return {
      currentRound: this.currentRoundIndex + 1,
      correctOwnerId: media.ownerId,
      correctOwnerName: media.ownerName,
    }
  }

  public getCurrentMedia(): MediaItem | null {
    return this.deck[this.currentRoundIndex] || null
  }
}
