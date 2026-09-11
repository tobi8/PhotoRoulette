import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Users,
  Sparkles,
  Zap,
  ArrowRight,
  Crown,
  Tv,
  Download,
} from 'lucide-react'
import { isNativeApp } from './services/nativeMediaService'
import {
  ActiveRoundState,
  GamePhase,
  GameSettings,
  MediaItem,
  PeerMessage,
  Player,
} from './types/game'
import { usePeerConnection, generateRoomCode, formatRoomCode } from './hooks/usePeerConnection'
import { useSoundEffects } from './hooks/useSoundEffects'
import { calculateAwards, calculateScore, GameAwards } from './utils/scoring'
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  getMockPartyPhotos,
  getMockPartyVideos,
  getMockPartyDeck,
  MOCK_BOT_PLAYERS,
} from './utils/mockData'
import { buildBalancedRouletteDeck, buildAggregatedPool } from './utils/deckBuilder'

import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { SoundToggle } from './components/ui/SoundToggle'
import { Badge } from './components/ui/Badge'

import { QRCodeDisplay } from './components/lobby/QRCodeDisplay'
import { PlayerList } from './components/lobby/PlayerList'
import { SettingsDrawer } from './components/lobby/SettingsDrawer'
import { MediaUploader } from './components/lobby/MediaUploader'

import { MediaViewer } from './components/game/MediaViewer'
import { TimerBar } from './components/game/TimerBar'
import { PlayerGrid } from './components/game/PlayerGrid'
import { RevealCard } from './components/game/RevealCard'

import { LeaderboardRace } from './components/scoreboard/LeaderboardRace'
import { Podium } from './components/scoreboard/Podium'
import { HostRoundController } from './utils/hostRoundController'
import { preloadMediaAsset } from './utils/mediaPreloader'
import { clockSync } from './utils/clockSync'
import { RoundPreloadPayload, RoundStartPayload, SubmitGuessPayload, LeaderboardSyncPayload, LeaderboardReadyAckPayload } from './types/game'


const DEFAULT_SETTINGS: GameSettings = {
  roundDuration: 5,
  totalRounds: 10,
  mediaType: 'photos_only',
  progressiveBlur: false,
  tvMode: false,
}

interface ActiveSession {
  roomCode: string
  isHost: boolean
  player: Player
  players?: Player[]
  settings?: GameSettings
  phase?: GamePhase
  timestamp: number
}

const SESSION_STORAGE_KEY = 'pr_active_game_session'

function saveGameSession(data: Partial<ActiveSession>) {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    const prev = raw ? JSON.parse(raw) : {}
    const merged = { ...prev, ...data, timestamp: Date.now() }
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(merged))
  } catch {}
}

function clearGameSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  } catch {}
}

export default function App() {
 
  const {
    isMuted,
    toggleMute,
    playPop,
    playCountdownBeep,
    playWhoosh,
    playCorrect,
    playWrong,
    playPanic,
    playVictory,
  } = useSoundEffects()

 
  const [phase, setPhase] = useState<GamePhase>('LANDING')
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [countdownNum, setCountdownNum] = useState<number>(3)

  const activePlayers = useMemo(
    () => (settings.tvMode ? players.filter((p) => !p.isHost) : players),
    [players, settings.tvMode]
  )
  const allPlayersHavePhotos = useMemo(
    () => activePlayers.length > 0 && activePlayers.every((p) => (p.mediaCount || 0) > 0),
    [activePlayers]
  )

 
  const [isReady, setIsReady] = useState<boolean>(false)

 
  const mediaDeckRef = useRef<MediaItem[]>([])
  const playerSubmissionsRef = useRef<Map<string, MediaItem[]>>(new Map())
  const isUploadingMediaRef = useRef<boolean>(false)
  const roundHistoryRef = useRef<
    Array<{
      roundNumber: number
      ownerId: string
      answers: Record<string, { guessedPlayerId: string; isCorrect: boolean; responseTime: number }>
    }>
  >([])
  const currentRoundIndexRef = useRef<number>(0)
  const autoAdvanceTimerRef = useRef<any>(null)
  const hostRoundControllerRef = useRef<HostRoundController | null>(null)
  const [isPreloading, setIsPreloading] = useState<boolean>(false)


 
  const [activeRound, setActiveRound] = useState<ActiveRoundState>({
    roundNumber: 0,
    totalRounds: 0,
    activeMedia: null,
    duration: 5,
    startTime: 0,
    isVetoed: false,
    hasAnswered: false,
  })

 
  const [gameAwards, setGameAwards] = useState<GameAwards>({})

  const [inputName, setInputName] = useState(() => {
    try {
      return localStorage.getItem('photo_roulette_username') || ''
    } catch {
      return ''
    }
  })
  const [inputRoomCode, setInputRoomCode] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_EMOJIS[0])
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0])
  const [landingMode, setLandingMode] = useState<'SELECT' | 'HOST_SETUP' | 'JOIN_SETUP'>('SELECT')

 
  const stateRef = useRef({
    phase,
    players,
    currentPlayer,
    settings,
    activeRound,
  })
  stateRef.current = { phase, players, currentPlayer, settings, activeRound }

 
  const clearAutoTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearAutoTimer()
      hostRoundControllerRef.current?.cleanup()
    }
  }, [clearAutoTimer])

 
 
 
  const handlePeerMessage = useCallback(
    (msg: PeerMessage, fromPeerId: string) => {
      const { type, payload } = msg

      switch (type) {
       
        case 'JOIN_REQUEST': {
          if (!stateRef.current.currentPlayer?.isHost) return

          const assignedId = payload.id || fromPeerId
          const newPlayer: Player = {
            id: assignedId,
            name: payload.name || `Player ${stateRef.current.players.length + 1}`,
            avatar: payload.avatar || '🐱',
            color: payload.color || AVATAR_COLORS[1],
            isHost: false,
            isReady: !!payload.isReady,
            score: 0,
            streak: 0,
            lastRoundPoints: 0,
            fastestAnswersCount: 0,
            mediaCount: 0,
          }

          setPlayers((prev) => {
            const exists = prev.some((p) => p.id === newPlayer.id)
            const updated = exists ? prev.map((p) => (p.id === newPlayer.id ? newPlayer : p)) : [...prev, newPlayer]

           
            peerConnection.sendToPeer(fromPeerId, {
              type: 'JOIN_ACCEPTED',
              senderId: peerConnection.peerId,
              payload: {
                player: newPlayer,
                settings: stateRef.current.settings,
                players: updated,
              },
            })

           
            peerConnection.broadcast({
              type: 'STATE_SYNC',
              senderId: peerConnection.peerId,
              payload: { players: updated, settings: stateRef.current.settings },
            })

            saveGameSession({ players: updated })
            return updated
          })

          playPop()
          break
        }

       
        case 'JOIN_ACCEPTED': {
          setCurrentPlayer(payload.player)
          setSettings(payload.settings)
          setPlayers(payload.players)
          setPhase('LOBBY')
          saveGameSession({
            roomCode: peerConnection.roomCode,
            isHost: false,
            player: payload.player,
            players: payload.players,
            settings: payload.settings,
            phase: 'LOBBY',
          })
          playPop()
          break
        }

        case 'MEDIA_CONTRIBUTION': {
          if (!stateRef.current.currentPlayer?.isHost) return
          const items: Array<{ id: string; type: 'image' | 'video'; dataUrl: string; isGuaranteed?: boolean }> = payload.items || []
          const contributorId = payload.playerId || fromPeerId
          const isInitial = payload.isInitialBatch ?? (payload.batchIndex === 0)
          const contributorName = stateRef.current.players.find((p) => p.id === contributorId)?.name || 'Player'

          const mapped: MediaItem[] = items.map((item, idx) => ({
            id: item.id || `${contributorId}_${Date.now()}_${idx}`,
            type: item.type || 'image',
            dataUrl: item.dataUrl,
            ownerId: contributorId,
            ownerName: contributorName,
            isGuaranteed: Boolean(item.isGuaranteed),
          }))

          const existing = playerSubmissionsRef.current.get(contributorId) || []
          let updatedList: MediaItem[]
          if (isInitial && (!existing.length || payload.batchIndex === 0)) {
            updatedList = [...mapped]
          } else {
            const existingIds = new Set(existing.map((m) => m.id))
            const newItems = mapped.filter((m) => !existingIds.has(m.id))
            updatedList = [...existing, ...newItems]
          }

          playerSubmissionsRef.current.set(contributorId, updatedList)
          mediaDeckRef.current = buildAggregatedPool(playerSubmissionsRef.current)

          const currentCount = updatedList.length

          setPlayers((prev) => {
            const updated = prev.map((p) => (p.id === contributorId ? { ...p, mediaCount: currentCount } : p))
            peerConnection.broadcast({
              type: 'STATE_SYNC',
              senderId: peerConnection.peerId,
              payload: { players: updated, settings: stateRef.current.settings },
            })
            saveGameSession({ players: updated })
            return updated
          })
          break
        }

       
        case 'PLAYER_READY': {
          if (!stateRef.current.currentPlayer?.isHost) return
          const readyPlayerId = payload.playerId || fromPeerId
          setPlayers((prev) => {
            const updated = prev.map((p) => (p.id === readyPlayerId ? { ...p, isReady: payload.isReady } : p))
            peerConnection.broadcast({
              type: 'STATE_SYNC',
              senderId: peerConnection.peerId,
              payload: { players: updated, settings: stateRef.current.settings },
            })
            saveGameSession({ players: updated })
            return updated
          })
          playPop()
          break
        }

       
        case 'STATE_SYNC': {
          if (payload.players) {
            setPlayers(payload.players)
            saveGameSession({ players: payload.players })
          }
          if (payload.settings) {
            setSettings(payload.settings)
            saveGameSession({ settings: payload.settings })
          }
          break
        }

       
                case 'ROUND_PRELOAD': {
          setIsPreloading(true)
          const preloadData = payload as RoundPreloadPayload
          preloadMediaAsset(preloadData.media.dataUrl, preloadData.media.type).then((res) => {
            setIsPreloading(false)
            peerConnection.sendToHost({
              type: 'CLIENT_PRELOAD_ACK',
              senderId: stateRef.current.currentPlayer?.id || peerConnection.peerId,
              payload: {
                roundNumber: preloadData.roundNumber,
                playerId: stateRef.current.currentPlayer?.id || peerConnection.peerId,
                success: res.success,
              },
            })
          })
          break
        }

        case 'CLIENT_PRELOAD_ACK': {
          if (!stateRef.current.currentPlayer?.isHost) return
          hostRoundControllerRef.current?.handleClientPreloadAck(payload.roundNumber, payload.playerId || fromPeerId)
          break
        }

        case 'LEADERBOARD_READY_ACK': {
          if (!stateRef.current.currentPlayer?.isHost) return
          hostRoundControllerRef.current?.handleLeaderboardAck(payload.roundNumber, payload.playerId || fromPeerId)
          break
        }

        case 'LEADERBOARD_BARRIER_SYNC': {
          setPhase('LEADERBOARD')
          if (payload.players) setPlayers(payload.players)
          setTimeout(() => {
            peerConnection.sendToHost({
              type: 'LEADERBOARD_READY_ACK',
              senderId: stateRef.current.currentPlayer?.id || peerConnection.peerId,
              payload: {
                roundNumber: payload.roundNumber,
                playerId: stateRef.current.currentPlayer?.id || peerConnection.peerId,
              },
            })
          }, 1500)
          break
        }

        case 'SUBMIT_GUESS': {
          if (!stateRef.current.currentPlayer?.isHost) return
          const guessData = payload as SubmitGuessPayload
          const effPlayerId = guessData.playerId || fromPeerId
          const roundIdx = currentRoundIndexRef.current
          const hist = roundHistoryRef.current[roundIdx]
          if (hist) {
            const isCorrect = guessData.selectedChoice === hist.ownerId
            hist.answers[effPlayerId] = {
              guessedPlayerId: guessData.selectedChoice,
              isCorrect,
              responseTime: guessData.responseTime,
            }
          }
          break
        }
        case 'ROUND_COUNTDOWN': {
          setPhase('COUNTDOWN')
          setCountdownNum(payload.count)
          if (payload.count > 0) {
            playCountdownBeep(false)
          } else {
            playCountdownBeep(true)
          }
          break
        }

       
        case 'ROUND_START': {
          setPhase('ACTIVE_ROUND')
          playWhoosh()
          const isOwner = payload.media.ownerId === stateRef.current.currentPlayer?.id

          setActiveRound({
            roundNumber: payload.roundNumber,
            totalRounds: payload.totalRounds,
            activeMedia: {
              id: payload.media.id,
              type: payload.media.type,
              dataUrl: payload.media.dataUrl,
              isOwner,
            },
            duration: payload.duration,
            startTime: payload.startTime,
            endTime: payload.endTime,
            isVetoed: false,
            hasAnswered: false,
            selectedPlayerId: undefined,
          })
          break
        }

       
        case 'ANSWER_SUBMITTED': {
          if (!stateRef.current.currentPlayer?.isHost) return
          const { playerId, guessedPlayerId, responseTime } = payload
          const effectivePlayerId = playerId || fromPeerId

          const roundIndex = currentRoundIndexRef.current
          const history = roundHistoryRef.current[roundIndex]
          if (history) {
            const isCorrect = guessedPlayerId === history.ownerId
            history.answers[effectivePlayerId] = {
              guessedPlayerId,
              isCorrect,
              responseTime,
            }
          }
          break
        }

       
        case 'PLAYER_KICKED': {
          if (payload.playerId === stateRef.current.currentPlayer?.id) {
            clearGameSession()
            peerConnection.disconnect()
            setCurrentPlayer(null)
            setPlayers([])
            setPhase('LANDING')
            setLandingMode('SELECT')
          }
          break
        }

       
        case 'ROUND_END': {
          setPhase('REVEAL')
          const myId = stateRef.current.currentPlayer?.id || ''
          const myResult = payload.results?.answers?.[myId]

          if (myResult) {
            if (myResult.isCorrect) playCorrect()
            else playWrong()
          }

          setActiveRound((prev) => ({
            ...prev,
            correctOwnerId: payload.correctPlayerId,
            correctOwnerName: payload.correctOwnerName,
            results: payload.results,
          }))

          setPlayers(payload.updatedPlayers)
          break
        }

       
        case 'LEADERBOARD_VIEW': {
          setPhase('LEADERBOARD')
          setPlayers(payload.players)
          break
        }

       
        case 'GAME_OVER': {
          setPhase('GAME_OVER')
          setPlayers(payload.players)
          setGameAwards(payload.awards || {})
          playVictory()
          break
        }

       
        case 'PLAY_AGAIN': {
          setPhase('LOBBY')
          setActiveRound({
            roundNumber: 0,
            totalRounds: 0,
            activeMedia: null,
            duration: 5,
            startTime: 0,
            isVetoed: false,
            hasAnswered: false,
          })
          break
        }
      }
    },
    [playPop, playCountdownBeep, playWhoosh, playCorrect, playWrong, playPanic, playVictory]
  )

  const handlePeerDisconnected = useCallback((disconnectedId: string) => {
    playerSubmissionsRef.current.delete(disconnectedId)
    mediaDeckRef.current = buildAggregatedPool(playerSubmissionsRef.current)
    setPlayers((prev) => prev.filter((p) => p.id !== disconnectedId))
  }, [])

  const peerConnection = usePeerConnection(handlePeerMessage, handlePeerDisconnected)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const queryRoom = searchParams.get('room')
    const queryUser = searchParams.get('user')
    const hash = window.location.hash.replace('#', '').trim()
    const targetRoom = queryRoom || hash

    if (targetRoom && targetRoom.length >= 4) {
      const formatted = formatRoomCode(targetRoom)

      try {
        const savedRaw = sessionStorage.getItem(SESSION_STORAGE_KEY)
        if (savedRaw) {
          const saved: ActiveSession = JSON.parse(savedRaw)
          if (
            saved &&
            saved.roomCode === formatted &&
            Date.now() - (saved.timestamp || 0) < 7200000
          ) {
            console.log('Restoring active game session for room:', formatted, 'isHost:', saved.isHost)
            if (saved.isHost) {
              peerConnection
                .createRoom(formatted)
                .then(({ peerId }) => {
                  const restoredHost: Player = {
                    ...(saved.player || {}),
                    id: queryUser || peerId,
                    isHost: true,
                  }
                  setCurrentPlayer(restoredHost)
                  setPlayers(
                    saved.players && saved.players.length > 0
                      ? saved.players
                      : [restoredHost]
                  )
                  if (saved.settings) setSettings(saved.settings)
                  setPhase(
                    saved.phase && saved.phase !== 'LANDING' ? saved.phase : 'LOBBY'
                  )
                })
                .catch((err) => {
                  console.warn('Failed to restore host room:', err)
                  setInputRoomCode(formatted)
                  setLandingMode('JOIN_SETUP')
                })
              return
            } else {
              peerConnection
                .joinRoom(formatted)
                .then(({ peerId }) => {
                  const restoredClient: Player = {
                    ...(saved.player || {}),
                    id: queryUser || peerId,
                    isHost: false,
                  }
                  setCurrentPlayer(restoredClient)
                  if (saved.settings) setSettings(saved.settings)
                  setPhase('LOBBY')
                  peerConnection.sendToHost({
                    type: 'JOIN_REQUEST',
                    senderId: peerId,
                    payload: restoredClient,
                  })
                })
                .catch((err) => {
                  console.warn('Failed to re-join room:', err)
                  setInputRoomCode(formatted)
                  setLandingMode('JOIN_SETUP')
                })
              return
            }
          }
        }
      } catch (e) {
        console.warn('Session restore error:', e)
      }

      setInputRoomCode(formatted)
      setLandingMode('JOIN_SETUP')
    }
  }, [])

 
 
 
  const startHostGame = async () => {
    const trimmed = inputName.trim()
    if (!trimmed) return

    try {
      localStorage.setItem('photo_roulette_username', trimmed)
    } catch {}

    const code = generateRoomCode()
    const { peerId: generatedPeerId } = await peerConnection.createRoom(code)

    const hostPlayer: Player = {
      id: generatedPeerId,
      name: trimmed,
      avatar: selectedAvatar,
      color: selectedColor,
      isHost: true,
      isReady: true,
      score: 0,
      streak: 0,
      lastRoundPoints: 0,
      fastestAnswersCount: 0,
      mediaCount: 0,
    }

    setCurrentPlayer(hostPlayer)
    setPlayers([hostPlayer])
    setPhase('LOBBY')
    window.location.hash = `#${code}`
    saveGameSession({
      roomCode: code,
      isHost: true,
      player: hostPlayer,
      players: [hostPlayer],
      settings,
      phase: 'LOBBY',
    })
    playPop()
  }

  const joinExistingGame = async () => {
    if (!inputRoomCode.trim()) return

    const trimmed = inputName.trim()
    if (!trimmed) return

    try {
      localStorage.setItem('photo_roulette_username', trimmed)
    } catch {}

    const formattedCode = formatRoomCode(inputRoomCode)
    const { peerId: generatedPeerId } = await peerConnection.joinRoom(formattedCode)

    const clientPlayer: Player = {
      id: generatedPeerId,
      name: trimmed,
      avatar: selectedAvatar,
      color: selectedColor,
      isHost: false,
      isReady: false,
      score: 0,
      streak: 0,
      lastRoundPoints: 0,
      fastestAnswersCount: 0,
      mediaCount: 0,
    }

    setCurrentPlayer(clientPlayer)
    window.location.hash = `#${formattedCode}`
    saveGameSession({
      roomCode: formattedCode,
      isHost: false,
      player: clientPlayer,
      players: [clientPlayer],
      settings,
      phase: 'LOBBY',
    })

    peerConnection.sendToHost({
      type: 'JOIN_REQUEST',
      senderId: generatedPeerId,
      payload: clientPlayer,
    })
  }

 
  const addSimulatedBot = () => {
    const botTemplate = MOCK_BOT_PLAYERS[players.length % MOCK_BOT_PLAYERS.length]
    const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

   
    const botRawMedia = (
      settings.mediaType === 'videos_only'
        ? getMockPartyVideos().slice(0, 4)
        : settings.mediaType === 'mixed'
        ? getMockPartyDeck('mixed').slice(0, 4)
        : getMockPartyPhotos().slice(0, 4)
    ).map((p) => ({
      ...p,
      ownerId: botId,
      ownerName: botTemplate.name,
    }))
    playerSubmissionsRef.current.set(botId, botRawMedia)
    mediaDeckRef.current = buildAggregatedPool(playerSubmissionsRef.current)

    const newBot: Player = {
      ...botTemplate,
      id: botId,
      isHost: false,
      isReady: true,
      score: 0,
      streak: 0,
      lastRoundPoints: 0,
      fastestAnswersCount: 0,
      mediaCount: botRawMedia.length,
    }

    setPlayers((prev) => {
      const updated = [...prev, newBot]
      peerConnection.broadcast({
        type: 'STATE_SYNC',
        senderId: peerConnection.peerId,
        payload: { players: updated, settings },
      })
      return updated
    })
    playPop()
  }

 
  const handleUpdateSettings = (newSettings: GameSettings) => {
    setSettings(newSettings)
    if (newSettings.tvMode && currentPlayer?.isHost) {
      playerSubmissionsRef.current.delete(currentPlayer.id)
      mediaDeckRef.current = buildAggregatedPool(playerSubmissionsRef.current)
      setPlayers((prev) => {
        const updated = prev.map((p) => (p.isHost ? { ...p, mediaCount: 0 } : p))
        peerConnection.broadcast({
          type: 'STATE_SYNC',
          senderId: peerConnection.peerId,
          payload: { settings: newSettings, players: updated },
        })
        saveGameSession({ settings: newSettings, players: updated })
        return updated
      })
      return
    }

    peerConnection.broadcast({
      type: 'STATE_SYNC',
      senderId: peerConnection.peerId,
      payload: { settings: newSettings, players },
    })
    saveGameSession({ settings: newSettings })
  }

  const handleMediaContribute = useCallback(
    (items: Array<{ id: string; type: 'image' | 'video'; dataUrl: string; isGuaranteed?: boolean }>) => {
      const myId = currentPlayer?.id || peerConnection.peerId

      if (currentPlayer?.isHost) {
        const hostItems: MediaItem[] = items.map((i, idx) => ({
          ...i,
          id: i.id || `${myId}_${Date.now()}_${idx}`,
          ownerId: myId,
          ownerName: currentPlayer?.name || 'Host',
          isGuaranteed: Boolean(i.isGuaranteed),
        }))
        playerSubmissionsRef.current.set(myId, hostItems)
        mediaDeckRef.current = buildAggregatedPool(playerSubmissionsRef.current)
        setPlayers((prev) =>
          prev.map((p) => (p.id === myId ? { ...p, mediaCount: items.length } : p))
        )
      } else {
        const BATCH_SIZE = 2
        const sendBatches = async () => {
          if (isUploadingMediaRef.current) return
          isUploadingMediaRef.current = true
          try {
            const totalBatches = Math.ceil(items.length / BATCH_SIZE)
            for (let i = 0; i < items.length; i += BATCH_SIZE) {
              const batch = items.slice(i, i + BATCH_SIZE)
              const batchIndex = Math.floor(i / BATCH_SIZE)
              await peerConnection.sendToHost({
                type: 'MEDIA_CONTRIBUTION',
                senderId: myId,
                payload: {
                  playerId: myId,
                  items: batch,
                  batchIndex,
                  totalBatches,
                  isInitialBatch: i === 0,
                },
              })
            }
          } finally {
            isUploadingMediaRef.current = false
          }
        }
        sendBatches()
      }
    },
    [currentPlayer?.id, currentPlayer?.isHost, currentPlayer?.name, peerConnection]
  )

  const handleToggleReady = () => {
    const nextReady = !isReady
    setIsReady(nextReady)
    const myId = currentPlayer?.id || peerConnection.peerId

    if (currentPlayer?.isHost) {
      setPlayers((prev) =>
        prev.map((p) => (p.id === myId ? { ...p, isReady: nextReady } : p))
      )
    } else {
      peerConnection.sendToHost({
        type: 'PLAYER_READY',
        senderId: myId,
        payload: { playerId: myId, isReady: nextReady },
      })
    }
    playPop()
  }

 
 
 
    const initHostRoundController = useCallback(() => {
    if (hostRoundControllerRef.current) {
      hostRoundControllerRef.current.cleanup()
    }

    hostRoundControllerRef.current = new HostRoundController({
      onPreloadBroadcast: (payload: RoundPreloadPayload) => {
        peerConnection.broadcast({
          type: 'ROUND_PRELOAD',
          senderId: peerConnection.peerId,
          payload,
        })
        preloadMediaAsset(payload.media.dataUrl, payload.media.type).then(() => {
          hostRoundControllerRef.current?.handleClientPreloadAck(payload.roundNumber, peerConnection.peerId)
        })
      },
      onCountdownStart: (roundNumber: number, totalRounds: number) => {
        setPhase('COUNTDOWN')
        setCountdownNum(3)
        playCountdownBeep(false)

        peerConnection.broadcast({
          type: 'ROUND_COUNTDOWN',
          senderId: peerConnection.peerId,
          payload: { count: 3, roundNumber, totalRounds },
        })

        let count = 3
        const countdownTimer = setInterval(() => {
          count--
          if (count > 0) {
            setCountdownNum(count)
            playCountdownBeep(false)
            peerConnection.broadcast({
              type: 'ROUND_COUNTDOWN',
              senderId: peerConnection.peerId,
              payload: { count, roundNumber, totalRounds },
            })
          } else {
            clearInterval(countdownTimer)
            playCountdownBeep(true)
            hostRoundControllerRef.current?.transitionToActiveRound(roundNumber)
          }
        }, 1000)
      },
      onRoundStartBroadcast: (payload: RoundStartPayload) => {
        setPhase('ACTIVE_ROUND')
        playWhoosh()
        const isOwner = payload.media.ownerId === stateRef.current.currentPlayer?.id

        setActiveRound({
          roundNumber: payload.roundNumber,
          totalRounds: payload.totalRounds,
          activeMedia: {
            id: payload.media.id,
            type: payload.media.type,
            dataUrl: payload.media.dataUrl,
            isOwner,
          },
          duration: payload.duration,
          startTime: payload.startTime,
          endTime: payload.endTime,
          isVetoed: false,
          hasAnswered: false,
          selectedPlayerId: undefined,
        })

        peerConnection.broadcast({
          type: 'ROUND_START',
          senderId: peerConnection.peerId,
          payload,
        })

        const activeDeck = mediaDeckRef.current
        const roundMedia = activeDeck[currentRoundIndexRef.current]
        const currentList = stateRef.current.players

        currentList.forEach((p) => {
          if (p.id.startsWith('bot-')) {
            const botDelay = 1200 + Math.random() * (payload.duration * 1000 - 1500)
            setTimeout(() => {
              const isCorrect = Math.random() > 0.35
              const guessedId = isCorrect
                ? (roundMedia ? roundMedia.ownerId : p.id)
                : currentList.find((other) => other.id !== roundMedia?.ownerId)?.id || roundMedia?.ownerId || p.id

              const history = roundHistoryRef.current[currentRoundIndexRef.current]
              if (history) {
                history.answers[p.id] = {
                  guessedPlayerId: guessedId,
                  isCorrect,
                  responseTime: botDelay,
                }
              }
            }, botDelay)
          }
        })
      },
      onRoundExpire: () => {
        handleRoundTimerExpire()
      },
      onLeaderboardBroadcast: (payload: LeaderboardSyncPayload) => {
        setPhase('LEADERBOARD')
        setPlayers(payload.players)
        peerConnection.broadcast({
          type: 'LEADERBOARD_BARRIER_SYNC',
          senderId: peerConnection.peerId,
          payload,
        })
      },
      onAdvanceToNextRound: (nextRoundNumber: number) => {
        currentRoundIndexRef.current++
        runNextRound(nextRoundNumber, stateRef.current.players)
      },
      onGameOver: () => {
        const scoringPlayers = stateRef.current.settings.tvMode
          ? stateRef.current.players.filter((p) => !p.isHost)
          : stateRef.current.players
        const awards = calculateAwards(scoringPlayers, roundHistoryRef.current)
        setGameAwards(awards)
        setPhase('GAME_OVER')
        playVictory()
        peerConnection.broadcast({
          type: 'GAME_OVER',
          senderId: peerConnection.peerId,
          payload: { players: stateRef.current.players, awards },
        })
      },
    })
  }, [peerConnection, playWhoosh, playVictory])

  const startFullGame = () => {
    clearAutoTimer()

    const poolSource =
      playerSubmissionsRef.current.size > 0
        ? playerSubmissionsRef.current
        : mediaDeckRef.current

    const gamePlayers = settings.tvMode ? players.filter((p) => !p.isHost) : players

    const currentDeck = buildBalancedRouletteDeck(
      poolSource,
      gamePlayers,
      settings.mediaType,
      settings.totalRounds || 10
    )

    if (currentDeck.length === 0) return

    mediaDeckRef.current = currentDeck

    const resetPlayers = players.map((p) => ({
      ...p,
      score: 0,
      streak: 0,
      lastRoundPoints: 0,
      fastestAnswersCount: 0,
    }))
    setPlayers(resetPlayers)

    roundHistoryRef.current = []
    currentRoundIndexRef.current = 0

    initHostRoundController()
    hostRoundControllerRef.current?.initGame(
      currentDeck,
      resetPlayers,
      settings.roundDuration,
      settings.totalRounds || 10,
      settings.progressiveBlur
    )

    runNextRound(1, resetPlayers)
  }

    const runNextRound = (roundNum: number, currentPlayersList: Player[]) => {
    clearAutoTimer()
    const totalRounds = Math.min(settings.totalRounds, mediaDeckRef.current.length)

    if (roundNum > totalRounds || currentRoundIndexRef.current >= mediaDeckRef.current.length) {
      const scoringPlayers = settings.tvMode
        ? currentPlayersList.filter((p) => !p.isHost)
        : currentPlayersList
      const awards = calculateAwards(scoringPlayers, roundHistoryRef.current)
      setGameAwards(awards)
      setPhase('GAME_OVER')
      playVictory()

      peerConnection.broadcast({
        type: 'GAME_OVER',
        senderId: peerConnection.peerId,
        payload: { players: currentPlayersList, awards },
      })
      return
    }

    const media = mediaDeckRef.current[currentRoundIndexRef.current]
    if (!media) return

    roundHistoryRef.current.push({
      roundNumber: roundNum,
      ownerId: media.ownerId,
      answers: {},
    })

    hostRoundControllerRef.current?.startRound(roundNum)
  }

  const handleRoundTimerExpire = () => {
    if (!stateRef.current.currentPlayer?.isHost || stateRef.current.phase !== 'ACTIVE_ROUND') return

    const media = mediaDeckRef.current[currentRoundIndexRef.current]
    if (!media) return

    const history = roundHistoryRef.current[currentRoundIndexRef.current] || {
      roundNumber: activeRound.roundNumber,
      ownerId: media.ownerId,
      answers: {},
    }

    let fastestTime = 999999
    let fastestPlayerId = ''

    const calculatedAnswers: Record<
      string,
      {
        guessedPlayerId: string
        isCorrect: boolean
        points: number
        responseTime: number
        newTotal: number
        streak: number
      }
    > = {}

    Object.entries(history.answers).forEach(([playerId, ans]) => {
      if (ans.isCorrect && ans.responseTime < fastestTime) {
        fastestTime = ans.responseTime
        fastestPlayerId = playerId
      }
    })

    const updatedPlayers = stateRef.current.players.map((p) => {
      const ans = history.answers[p.id]
      if (ans && ans.isCorrect) {
        const scoreResult = calculateScore(
          true,
          ans.responseTime,
          settings.roundDuration,
          p.score,
          p.streak
        )

        const isFastest = p.id === fastestPlayerId

        calculatedAnswers[p.id] = {
          guessedPlayerId: ans.guessedPlayerId,
          isCorrect: true,
          points: scoreResult.points,
          responseTime: ans.responseTime,
          newTotal: scoreResult.newTotal,
          streak: scoreResult.streak,
        }

        return {
          ...p,
          score: scoreResult.newTotal,
          streak: scoreResult.streak,
          lastRoundPoints: scoreResult.points,
          fastestAnswersCount: isFastest ? p.fastestAnswersCount + 1 : p.fastestAnswersCount,
        }
      } else {
        calculatedAnswers[p.id] = {
          guessedPlayerId: ans?.guessedPlayerId || '',
          isCorrect: false,
          points: 0,
          responseTime: ans?.responseTime || settings.roundDuration * 1000,
          newTotal: p.score,
          streak: 0,
        }

        return {
          ...p,
          streak: 0,
          lastRoundPoints: 0,
        }
      }
    })

    setPlayers(updatedPlayers)

    const fastestPlayer = stateRef.current.players.find((p) => p.id === fastestPlayerId)

    const correctOwnerId = media.ownerId
    const correctOwnerName =
      media.ownerName ||
      stateRef.current.players.find((p) => p.id === correctOwnerId)?.name ||
      'Player'

    const roundResults = {
      correctPlayerId: correctOwnerId,
      answers: calculatedAnswers,
      fastestGuesserId: fastestPlayerId,
    }

    setPhase('REVEAL')
    const myResult = calculatedAnswers[stateRef.current.currentPlayer?.id || '']
    if (myResult) {
      if (myResult.isCorrect) playCorrect()
      else playWrong()
    }

    setActiveRound((prev) => ({
      ...prev,
      correctOwnerId,
      correctOwnerName,
      results: roundResults,
    }))

    peerConnection.broadcast({
      type: 'ROUND_END',
      senderId: peerConnection.peerId,
      payload: {
        correctPlayerId: correctOwnerId,
        correctOwnerName,
        results: roundResults,
        updatedPlayers,
        fastestPlayer,
      },
    })

    clearAutoTimer()
    autoAdvanceTimerRef.current = setTimeout(() => {
      advanceToScoreboard(updatedPlayers)
    }, 3500)
  }

  const advanceToScoreboard = (currentPlayersList?: Player[]) => {
    clearAutoTimer()
    const activePlayers = currentPlayersList || stateRef.current.players
    hostRoundControllerRef.current?.enterLeaderboardBarrier(activeRound.roundNumber, activePlayers, 4000, 2000)
  }

 
  const handleNextRoundFromLeaderboard = () => {
    clearAutoTimer()
    currentRoundIndexRef.current++
    runNextRound(activeRound.roundNumber + 1, players)
  }

 
  const handlePlayAgain = () => {
    clearAutoTimer()
    setPhase('LOBBY')
    saveGameSession({ phase: 'LOBBY' })
    setIsReady(false)
    setActiveRound({
      roundNumber: 0,
      totalRounds: 0,
      activeMedia: null,
      duration: 5,
      startTime: 0,
      isVetoed: false,
      hasAnswered: false,
    })

    peerConnection.broadcast({
      type: 'PLAY_AGAIN',
      senderId: peerConnection.peerId,
      payload: {},
    })
  }

 
  const handleLeaveGame = () => {
    if (phase === 'ACTIVE_ROUND') return
    clearGameSession()
    peerConnection.disconnect()
    setCurrentPlayer(null)
    setPlayers([])
    setPhase('LANDING')
    setLandingMode('SELECT')
  }

 
 
 
  const handleRemovePlayer = (targetPlayerId: string) => {
    if (!currentPlayer?.isHost || targetPlayerId === currentPlayer.id) return

    playerSubmissionsRef.current.delete(targetPlayerId)
    mediaDeckRef.current = buildAggregatedPool(playerSubmissionsRef.current)

    peerConnection.sendToPeer(targetPlayerId, {
      type: 'PLAYER_KICKED',
      senderId: peerConnection.peerId,
      payload: { playerId: targetPlayerId },
    })

    peerConnection.kickPeer?.(targetPlayerId)

    setPlayers((prev) => {
      const updated = prev.filter((p) => p.id !== targetPlayerId)
      peerConnection.broadcast({
        type: 'STATE_SYNC',
        senderId: peerConnection.peerId,
        payload: { players: updated, settings: stateRef.current.settings },
      })
      saveGameSession({ players: updated })
      return updated
    })
  }

  const handleAnswerSubmit = (guessedPlayerId: string) => {
    if (activeRound.hasAnswered) return

    const now = clockSync.now()
    const responseTime = Math.max(0, now - activeRound.startTime)
    setActiveRound((prev) => ({
      ...prev,
      hasAnswered: true,
      selectedPlayerId: guessedPlayerId,
    }))

    const myPlayerId = currentPlayer?.id || peerConnection.peerId

    if (currentPlayer?.isHost) {
      const history = roundHistoryRef.current[currentRoundIndexRef.current]
      if (history) {
        history.answers[myPlayerId] = {
          guessedPlayerId,
          isCorrect: guessedPlayerId === history.ownerId,
          responseTime,
        }
      }
    } else {
      const guessPayload: SubmitGuessPayload = {
        roundId: activeRound.roundNumber,
        playerId: myPlayerId,
        selectedChoice: guessedPlayerId,
        timestamp: now,
        responseTime,
      }
      peerConnection.sendToHost({
        type: 'SUBMIT_GUESS',
        senderId: myPlayerId,
        payload: guessPayload,
      })
      peerConnection.sendToHost({
        type: 'ANSWER_SUBMITTED',
        senderId: myPlayerId,
        payload: { playerId: myPlayerId, guessedPlayerId, responseTime },
      })
    }
  }

  const handleClientTimerExpire = () => {
    if (!activeRound.hasAnswered) {
      handleAnswerSubmit('')
    }
    if (currentPlayer?.isHost) {
      handleRoundTimerExpire()
    }
  }

 
 
 
  return (
    <div className="min-h-screen w-full bg-[#0d0b18] text-gray-100 flex flex-col justify-between selection:bg-violet-600 selection:text-white">
      {}
      <header className="w-full max-w-4xl mx-auto px-4 pt-2 sm:pt-4 pb-1.5 flex items-center justify-between z-30 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div
          onClick={handleLeaveGame}
          className="flex items-center gap-2 cursor-pointer select-none"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-gradient-to-tr from-violet-600 to-pink-500 flex items-center justify-center text-lg sm:text-xl shadow-lg shadow-violet-900/40 border border-white/20">
            📸
          </div>
          <span className="font-black text-base sm:text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-200 to-violet-300">
            PHOTO ROULETTE
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!isNativeApp() && (
            <a
              href="./PhotoRoulette.apk"
              download="PhotoRoulette.apk"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Download Android APK"
            >
              <Download size={13} className="text-emerald-400" />
              <span className="hidden xs:inline sm:inline">Android APK</span>
            </a>
          )}

          {peerConnection.roomCode && (
            <Badge variant="primary" size="sm" className="font-mono">
              Room: {peerConnection.roomCode}
            </Badge>
          )}

          <SoundToggle isMuted={isMuted} onToggle={toggleMute} />
        </div>
      </header>

      {}
      <main className="w-full max-w-3xl mx-auto px-3 sm:px-4 py-1 flex-1 flex flex-col justify-center">
        {}
        {}
        {}
        {phase === 'LANDING' && (
          <div className="w-full max-w-md mx-auto space-y-6 py-6 animate-in fade-in duration-300">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-600/20 text-violet-300 text-xs font-bold border border-violet-500/30">
                <Sparkles size={14} className="text-pink-400" />
                <span>Zero Server Costs • 100% Client-Side Privacy</span>
              </div>
              <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                Guess Whose Photo It Is!
              </h1>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                Kahoot-style party game with your friend group's camera rolls.
              </p>
            </div>

            {}
            {landingMode === 'SELECT' && (
              <div className="space-y-3">
                <Button
                  size="xl"
                  variant="primary"
                  fullWidth
                  onClick={() => setLandingMode('HOST_SETUP')}
                  className="text-base"
                >
                  <Crown size={20} className="text-amber-300" />
                  <span>Create Game (Host)</span>
                </Button>

                <Button
                  size="xl"
                  variant="secondary"
                  fullWidth
                  onClick={() => setLandingMode('JOIN_SETUP')}
                  className="text-base border-violet-500/30"
                >
                  <Users size={20} className="text-violet-400" />
                  <span>Join Game (Player)</span>
                </Button>

                {!isNativeApp() && (
                  <a
                    href="./PhotoRoulette.apk"
                    download="PhotoRoulette.apk"
                    className="w-full py-3 px-4 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/60 to-teal-950/60 hover:from-emerald-900/70 hover:to-teal-900/70 text-emerald-300 font-bold text-sm flex items-center justify-between gap-3 transition-all shadow-lg active:scale-98 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Download size={16} />
                      </div>
                      <div className="text-left">
                        <div className="text-white text-xs font-bold">Download Android APK</div>
                        <div className="text-[10px] text-emerald-300/80 font-normal">Fastest camera roll access & 1-tap auto pick</div>
                      </div>
                    </div>
                    <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full font-bold">
                      Download
                    </span>
                  </a>
                )}
              </div>
            )}

            {}
            {(landingMode === 'HOST_SETUP' || landingMode === 'JOIN_SETUP') && (
              <Card glow="purple" className="space-y-4">
                <h3 className="font-bold text-white text-base text-center">
                  {landingMode === 'HOST_SETUP' ? 'Create Game Room' : 'Join Game Room'}
                </h3>

                {landingMode === 'JOIN_SETUP' && (
                  <div>
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-1">
                      Room Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. ABCD5"
                      value={inputRoomCode}
                      onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                      className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white font-mono text-center text-xl font-bold tracking-widest uppercase focus:outline-none focus:border-violet-500"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-1">
                    Your Nickname <span className="text-pink-400">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    required
                    placeholder="Enter your name (required)..."
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white text-sm font-semibold focus:outline-none focus:border-violet-500"
                  />
                  {!inputName.trim() && (
                    <span className="text-[10px] text-pink-400 font-medium block mt-1">
                      Nickname is required to continue
                    </span>
                  )}
                </div>

                {}
                <div>
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-1.5">
                    Choose Avatar
                  </label>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {AVATAR_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setSelectedAvatar(emoji)}
                        className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all cursor-pointer ${
                          selectedAvatar === emoji
                            ? 'bg-violet-600 ring-2 ring-violet-300 scale-110'
                            : 'bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {}
                <div>
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-1.5">
                    Choose Color
                  </label>
                  <div className="flex gap-2 justify-center">
                    {AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        style={{ backgroundColor: color }}
                        className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                          selectedColor === color ? 'ring-3 ring-white scale-125' : 'opacity-70 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {peerConnection.error && (
                  <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300 text-center">
                    {peerConnection.error}
                  </div>
                )}

                <div className="pt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    size="md"
                    className="flex-1"
                    onClick={() => {
                      setLandingMode('SELECT')
                      clearGameSession()
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    className="flex-2"
                    isLoading={peerConnection.isConnecting}
                    disabled={
                      !inputName.trim() ||
                      (landingMode === 'JOIN_SETUP' && !inputRoomCode.trim())
                    }
                    onClick={landingMode === 'HOST_SETUP' ? startHostGame : joinExistingGame}
                  >
                    <span>{landingMode === 'HOST_SETUP' ? 'Launch Room 🚀' : 'Join 🎮'}</span>
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {}
        {}
        {}
        {phase === 'LOBBY' && (
          <div className="w-full space-y-4 sm:space-y-6 py-2 sm:py-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-6">
              {}
              <div className="md:col-span-5 space-y-3 sm:space-y-4">
                <QRCodeDisplay roomCode={peerConnection.roomCode} />

                <SettingsDrawer
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  isHost={!!currentPlayer?.isHost}
                />
              </div>

              {}
              <div className="md:col-span-7 space-y-4">
                {(!settings.tvMode || !currentPlayer?.isHost) ? (
                  <MediaUploader
                    onMediaReady={handleMediaContribute}
                    isReady={isReady}
                    onToggleReady={handleToggleReady}
                    mediaType={settings.mediaType}
                    roomId={peerConnection.roomCode || 'ROOM'}
                    userId={currentPlayer?.id || peerConnection.peerId}
                  />
                ) : (
                  <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-center space-y-2 animate-in fade-in duration-200">
                    <div className="inline-flex p-2.5 rounded-full bg-indigo-500/20 text-indigo-300">
                      <Tv size={24} />
                    </div>
                    <div className="font-bold text-white text-base">
                      Host TV Screen Mode Active
                    </div>
                    <p className="text-xs text-indigo-200/70 max-w-sm mx-auto">
                      This screen acts purely as the party display and TV scoreboard. Join on your mobile devices using the room code or QR code to select photos and play!
                    </p>
                  </div>
                )}

                <PlayerList
                  players={activePlayers}
                  currentPlayerId={currentPlayer?.id}
                  isHost={!!currentPlayer?.isHost}
                  onRemovePlayer={handleRemovePlayer}
                />

                {currentPlayer?.isHost && (
                  <div className="space-y-2 pt-2">
                    <Button
                      size="xl"
                      variant="primary"
                      fullWidth
                      disabled={!allPlayersHavePhotos}
                      onClick={startFullGame}
                      className="text-base font-black shadow-violet-900/50 tracking-wider"
                    >
                      <span>START</span>
                    </Button>
                    <p className="text-[11px] text-gray-400 text-center">
                      {activePlayers.length === 0
                        ? 'Waiting for players to join...'
                        : !allPlayersHavePhotos
                        ? `Waiting for all players to select photos (${activePlayers.filter((p) => (p.mediaCount || 0) > 0).length}/${activePlayers.length} ready)...`
                        : 'All players have selected photos! Press START to begin.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {}
        {}
        {}
        {phase === 'COUNTDOWN' && (
          <div className="w-full max-w-md mx-auto text-center space-y-4 py-16 animate-in zoom-in-90 duration-200">
            <div className="text-xs font-bold tracking-widest text-violet-400 uppercase">
              GET READY!
            </div>
            <div className="text-8xl sm:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-violet-400 via-pink-400 to-amber-300 font-mono animate-bounce drop-shadow-2xl">
              {countdownNum}
            </div>
            <p className="text-sm text-gray-300">
              Look closely at the photo and guess the owner fast!
            </p>
          </div>
        )}

        {}
        {}
        {}
        {phase === 'ACTIVE_ROUND' && activeRound.activeMedia && (
          <div className="w-full max-w-xl mx-auto space-y-1.5 sm:space-y-2.5 py-0.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs text-gray-400 px-1">
              <span className="font-bold text-violet-300">
                Round {activeRound.roundNumber} of {activeRound.totalRounds}
              </span>
              <span className="font-semibold text-gray-400">
                {activePlayers.length} players in game
              </span>
            </div>

            <TimerBar
              durationSec={activeRound.duration}
              startTime={activeRound.startTime}
              endTime={activeRound.endTime}
              onExpire={handleClientTimerExpire}
            />

            <MediaViewer
              media={activeRound.activeMedia}
              progressiveBlur={settings.progressiveBlur}
              durationSec={activeRound.duration}
              isTimeUp={phase !== 'ACTIVE_ROUND'}
              isHostTV={settings.tvMode && currentPlayer?.isHost}
              isMuted={isMuted}
            />

            {(!settings.tvMode || !currentPlayer?.isHost) && (
              <PlayerGrid
                players={activePlayers}
                selectedPlayerId={activeRound.selectedPlayerId}
                hasAnswered={activeRound.hasAnswered}
                onSelectPlayer={handleAnswerSubmit}
                currentPlayerId={currentPlayer?.id}
              />
            )}
          </div>
        )}

        {}
        {}
        {}
        {phase === 'REVEAL' && (activeRound.correctOwnerId || activeRound.correctOwnerName) && (
          <div className="w-full max-w-md mx-auto space-y-5 py-4 animate-in fade-in duration-200">
            <RevealCard
              correctPlayer={
                players.find((p) => p.id === activeRound.correctOwnerId) ||
                (activeRound.correctOwnerName
                  ? players.find((p) => p.name.toLowerCase() === activeRound.correctOwnerName?.toLowerCase())
                  : undefined)
              }
              correctOwnerName={activeRound.correctOwnerName}
              players={activePlayers}
              results={activeRound.results}
              currentPlayerId={currentPlayer?.id}
              isHostTV={settings.tvMode && currentPlayer?.isHost}
              autoAdvanceSeconds={3}
            />
          </div>
        )}

        {}
        {}
        {}
        {phase === 'LEADERBOARD' && (
          <div className="w-full max-w-lg mx-auto space-y-4 py-4 animate-in fade-in duration-200">
            <LeaderboardRace
              players={activePlayers}
              currentPlayerId={currentPlayer?.id}
              roundNumber={activeRound.roundNumber}
              totalRounds={activeRound.totalRounds}
              autoAdvanceSeconds={5}
            />
          </div>
        )}

        {}
        {}
        {}
        {phase === 'GAME_OVER' && (
          <div className="w-full py-4 animate-in fade-in duration-300">
            <Podium
              players={activePlayers}
              awards={gameAwards}
              onPlayAgain={handlePlayAgain}
              isHost={!!currentPlayer?.isHost}
            />
          </div>
        )}
      </main>

      {}
      <footer className="w-full max-w-4xl mx-auto px-4 py-3 text-center text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>Photo Roulette • WebRTC P2P Party Game • Serverless on GitHub Pages</span>
        {!isNativeApp() && (
          <a
            href="./PhotoRoulette.apk"
            download="PhotoRoulette.apk"
            className="text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Download size={13} />
            <span>Download Android APK</span>
          </a>
        )}
      </footer>
    </div>
  )
}
