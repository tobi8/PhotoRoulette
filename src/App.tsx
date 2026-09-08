import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Users,
  Sparkles,
  Zap,
  ArrowRight,
  Crown,
} from 'lucide-react'
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

// UI Components
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { SoundToggle } from './components/ui/SoundToggle'
import { Badge } from './components/ui/Badge'

// Lobby Components
import { QRCodeDisplay } from './components/lobby/QRCodeDisplay'
import { PlayerList } from './components/lobby/PlayerList'
import { SettingsDrawer } from './components/lobby/SettingsDrawer'
import { MediaUploader } from './components/lobby/MediaUploader'

// Game Components
import { MediaViewer } from './components/game/MediaViewer'
import { TimerBar } from './components/game/TimerBar'
import { PlayerGrid } from './components/game/PlayerGrid'
import { PanicButton } from './components/game/PanicButton'
import { RevealCard } from './components/game/RevealCard'

// Scoreboard Components
import { LeaderboardRace } from './components/scoreboard/LeaderboardRace'
import { Podium } from './components/scoreboard/Podium'

const DEFAULT_SETTINGS: GameSettings = {
  roundDuration: 5,
  totalRounds: 10,
  mediaType: 'mixed',
  progressiveBlur: false,
  tvMode: false,
}

export default function App() {
  // Sound system
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

  // Game Engine State
  const [phase, setPhase] = useState<GamePhase>('LANDING')
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [countdownNum, setCountdownNum] = useState<number>(3)

  // Local media deck uploaded by this client
  const [isReady, setIsReady] = useState<boolean>(false)

  // Host-only aggregated media pool & game history
  const mediaDeckRef = useRef<MediaItem[]>([])
  const roundHistoryRef = useRef<
    Array<{
      roundNumber: number
      ownerId: string
      answers: Record<string, { guessedPlayerId: string; isCorrect: boolean; responseTime: number }>
    }>
  >([])
  const currentRoundIndexRef = useRef<number>(0)
  const autoAdvanceTimerRef = useRef<any>(null)

  // Active round state (synchronized across host & players)
  const [activeRound, setActiveRound] = useState<ActiveRoundState>({
    roundNumber: 0,
    totalRounds: 0,
    activeMedia: null,
    duration: 5,
    startTime: 0,
    isVetoed: false,
    hasAnswered: false,
  })

  // Final Awards
  const [gameAwards, setGameAwards] = useState<GameAwards>({})

  // Form states on landing
  const [inputName, setInputName] = useState('')
  const [inputRoomCode, setInputRoomCode] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_EMOJIS[0])
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0])
  const [landingMode, setLandingMode] = useState<'SELECT' | 'HOST_SETUP' | 'JOIN_SETUP'>('SELECT')

  // Ref to hold current state for peer message handlers without stale closures
  const stateRef = useRef({
    phase,
    players,
    currentPlayer,
    settings,
    activeRound,
  })
  stateRef.current = { phase, players, currentPlayer, settings, activeRound }

  // Clear any running auto timer
  const clearAutoTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => clearAutoTimer()
  }, [clearAutoTimer])

  // --------------------------------------------------------------------------
  // Message Handlers (WebRTC P2P)
  // --------------------------------------------------------------------------
  const handlePeerMessage = useCallback(
    (msg: PeerMessage, fromPeerId: string) => {
      const { type, payload } = msg

      switch (type) {
        // [HOST HANDLER] New player requests to join
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

            // Accept player and send welcome packet
            peerConnection.sendToPeer(fromPeerId, {
              type: 'JOIN_ACCEPTED',
              senderId: peerConnection.peerId,
              payload: {
                player: newPlayer,
                settings: stateRef.current.settings,
                players: updated,
              },
            })

            // Broadcast updated player list to all clients
            peerConnection.broadcast({
              type: 'STATE_SYNC',
              senderId: peerConnection.peerId,
              payload: { players: updated, settings: stateRef.current.settings },
            })

            return updated
          })

          playPop()
          break
        }

        // [CLIENT HANDLER] Host accepted our join request
        case 'JOIN_ACCEPTED': {
          setCurrentPlayer(payload.player)
          setSettings(payload.settings)
          setPlayers(payload.players)
          setPhase('LOBBY')
          playPop()
          break
        }

        // [HOST HANDLER] Player contributed their media photos
        case 'MEDIA_CONTRIBUTION': {
          if (!stateRef.current.currentPlayer?.isHost) return
          const items: Array<{ id: string; type: 'image' | 'video'; dataUrl: string }> = payload.items || []
          const contributorId = payload.playerId || fromPeerId

          const mapped: MediaItem[] = items.map((item) => ({
            ...item,
            ownerId: contributorId,
            ownerName: stateRef.current.players.find((p) => p.id === contributorId)?.name || 'Player',
          }))

          // Merge into host master media deck
          mediaDeckRef.current = [...mediaDeckRef.current.filter((m) => m.ownerId !== contributorId), ...mapped]

          // Update player's mediaCount
          setPlayers((prev) => {
            const updated = prev.map((p) => (p.id === contributorId ? { ...p, mediaCount: items.length } : p))
            peerConnection.broadcast({
              type: 'STATE_SYNC',
              senderId: peerConnection.peerId,
              payload: { players: updated, settings: stateRef.current.settings },
            })
            return updated
          })
          break
        }

        // [HOST HANDLER] Player ready toggle
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
            return updated
          })
          playPop()
          break
        }

        // [CLIENT & HOST HANDLER] State synchronization
        case 'STATE_SYNC': {
          if (payload.players) setPlayers(payload.players)
          if (payload.settings) setSettings(payload.settings)
          break
        }

        // [CLIENT HANDLER] Round countdown broadcast
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

        // [CLIENT HANDLER] Active round started
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
            isVetoed: false,
            hasAnswered: false,
          })
          break
        }

        // [HOST HANDLER] Player submitted answer
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

        // [HOST HANDLER] Photo owner hit panic / veto button
        case 'PANIC_VETO': {
          if (!stateRef.current.currentPlayer?.isHost) return
          triggerVetoSequence()
          break
        }

        // [CLIENT HANDLER] Veto triggered broadcast
        case 'VETO_TRIGGERED': {
          playPanic()
          setActiveRound((prev) => ({ ...prev, isVetoed: true }))
          break
        }

        // [CLIENT HANDLER] Round ended, reveal owner & results
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
            results: payload.results,
          }))

          setPlayers(payload.updatedPlayers)
          break
        }

        // [CLIENT HANDLER] Leaderboard view
        case 'LEADERBOARD_VIEW': {
          setPhase('LEADERBOARD')
          setPlayers(payload.players)
          break
        }

        // [CLIENT HANDLER] Game Over Podium
        case 'GAME_OVER': {
          setPhase('GAME_OVER')
          setPlayers(payload.players)
          setGameAwards(payload.awards || {})
          playVictory()
          break
        }

        // [CLIENT HANDLER] Return to lobby
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
    setPlayers((prev) => prev.filter((p) => p.id !== disconnectedId))
  }, [])

  const peerConnection = usePeerConnection(handlePeerMessage, handlePeerDisconnected)

  // --------------------------------------------------------------------------
  // Auto-fill room code from URL hash (e.g. #ROOM12)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const hash = window.location.hash.replace('#', '').trim()
    if (hash && hash.length >= 4) {
      setInputRoomCode(formatRoomCode(hash))
      setLandingMode('JOIN_SETUP')
    }
  }, [])

  // --------------------------------------------------------------------------
  // Host Game Logic & Transitions
  // --------------------------------------------------------------------------
  const startHostGame = async () => {
    const code = generateRoomCode()
    const { peerId: generatedPeerId } = await peerConnection.createRoom(code)

    const hostPlayer: Player = {
      id: generatedPeerId,
      name: inputName.trim() || 'Host',
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
    playPop()
  }

  // Client joins existing room
  const joinExistingGame = async () => {
    if (!inputRoomCode.trim()) return

    const { peerId: generatedPeerId } = await peerConnection.joinRoom(inputRoomCode)

    const clientPlayer: Player = {
      id: generatedPeerId,
      name: inputName.trim() || `Player ${Math.floor(Math.random() * 900 + 100)}`,
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

    // Send Join Request to Host
    peerConnection.sendToHost({
      type: 'JOIN_REQUEST',
      senderId: generatedPeerId,
      payload: clientPlayer,
    })
  }

  // Host adds a simulated bot player for quick testing
  const addSimulatedBot = () => {
    const botTemplate = MOCK_BOT_PLAYERS[players.length % MOCK_BOT_PLAYERS.length]
    const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    // Generate mock media for this bot matching the selected mediaType
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
    mediaDeckRef.current = [...mediaDeckRef.current, ...botRawMedia]

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

  // Host updates settings and broadcasts
  const handleUpdateSettings = (newSettings: GameSettings) => {
    setSettings(newSettings)
    peerConnection.broadcast({
      type: 'STATE_SYNC',
      senderId: peerConnection.peerId,
      payload: { settings: newSettings, players },
    })
  }

  // Player contributes photos (auto-called by MediaUploader)
  const handleMediaContribute = (items: Array<{ id: string; type: 'image' | 'video'; dataUrl: string }>) => {
    const myId = currentPlayer?.id || peerConnection.peerId

    if (currentPlayer?.isHost) {
      // Host adds directly to deck
      const hostItems: MediaItem[] = items.map((i) => ({
        ...i,
        ownerId: myId,
        ownerName: currentPlayer?.name || 'Host',
      }))
      mediaDeckRef.current = [
        ...mediaDeckRef.current.filter((m) => m.ownerId !== myId),
        ...hostItems,
      ]
      setPlayers((prev) =>
        prev.map((p) => (p.id === myId ? { ...p, mediaCount: items.length } : p))
      )
    } else {
      // Client sends to host
      peerConnection.sendToHost({
        type: 'MEDIA_CONTRIBUTION',
        senderId: myId,
        payload: { playerId: myId, items },
      })
    }
  }

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

  // --------------------------------------------------------------------------
  // Game Loop Coordination (Host-Authoritative with 3s Hands-Free Automation)
  // --------------------------------------------------------------------------
  const startFullGame = () => {
    clearAutoTimer()

    let currentDeck = [...mediaDeckRef.current]

    if (settings.mediaType === 'photos_only') {
      currentDeck = currentDeck.filter((m) => m.type === 'image')
      if (currentDeck.length === 0) {
        currentDeck = getMockPartyPhotos().map((p, idx) => ({
          ...p,
          ownerId: players[idx % players.length]?.id || players[0]?.id || 'host',
          ownerName: players[idx % players.length]?.name || players[0]?.name || 'Player',
        }))
      }
    } else if (settings.mediaType === 'videos_only') {
      currentDeck = currentDeck.filter((m) => m.type === 'video')
      // If no videos uploaded by players, automatically populate with mock party videos!
      if (currentDeck.length === 0) {
        currentDeck = getMockPartyVideos().map((v, idx) => ({
          ...v,
          ownerId: players[idx % players.length]?.id || players[0]?.id || 'host',
          ownerName: players[idx % players.length]?.name || players[0]?.name || 'Player',
        }))
      }
    } else {
      // 'mixed' mode: Ensure BOTH photos and videos are present and interleaved!
      let photos = currentDeck.filter((m) => m.type === 'image')
      let videos = currentDeck.filter((m) => m.type === 'video')

      // If no videos uploaded, mix in mock party videos!
      if (videos.length === 0) {
        videos = getMockPartyVideos().map((v, idx) => ({
          ...v,
          ownerId: players[idx % players.length]?.id || players[0]?.id || 'host',
          ownerName: players[idx % players.length]?.name || players[0]?.name || 'Player',
        }))
      }
      // If no photos uploaded, mix in mock photos!
      if (photos.length === 0) {
        photos = getMockPartyPhotos().map((p, idx) => ({
          ...p,
          ownerId: players[idx % players.length]?.id || players[0]?.id || 'host',
          ownerName: players[idx % players.length]?.name || players[0]?.name || 'Player',
        }))
      }

      // Interleave videos and photos so players experience both in mixed mode
      const shuffledP = [...photos].sort(() => Math.random() - 0.5)
      const shuffledV = [...videos].sort(() => Math.random() - 0.5)
      const mixedInterleaved: MediaItem[] = []
      let pIdx = 0, vIdx = 0
      while (pIdx < shuffledP.length || vIdx < shuffledV.length) {
        if (pIdx < shuffledP.length) mixedInterleaved.push(shuffledP[pIdx++])
        if (vIdx < shuffledV.length) mixedInterleaved.push(shuffledV[vIdx++])
      }
      currentDeck = mixedInterleaved
    }

    // Set media deck
    mediaDeckRef.current = currentDeck

    // Reset scores & streaks
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

    runNextRound(1, resetPlayers)
  }

  // Runs round with 3-second countdown
  const runNextRound = (roundNum: number, currentPlayersList: Player[]) => {
    clearAutoTimer()
    const totalRounds = Math.min(settings.totalRounds, mediaDeckRef.current.length)

    if (roundNum > totalRounds || currentRoundIndexRef.current >= mediaDeckRef.current.length) {
      // Game Over!
      const awards = calculateAwards(currentPlayersList, roundHistoryRef.current)
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

    // Step 1: Countdown Phase (3, 2, 1)
    setPhase('COUNTDOWN')
    setCountdownNum(3)
    playCountdownBeep(false)

    peerConnection.broadcast({
      type: 'ROUND_COUNTDOWN',
      senderId: peerConnection.peerId,
      payload: { count: 3, roundNumber: roundNum, totalRounds },
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
          payload: { count, roundNumber: roundNum, totalRounds },
        })
      } else {
        clearInterval(countdownTimer)
        playCountdownBeep(true)
        launchActiveRound(roundNum, totalRounds, currentPlayersList)
      }
    }, 1000)
  }

  // Step 2: Launch Active Round
  const launchActiveRound = (roundNum: number, totalRounds: number, currentPlayersList: Player[]) => {
    clearAutoTimer()
    const media = mediaDeckRef.current[currentRoundIndexRef.current]
    if (!media) return

    roundHistoryRef.current.push({
      roundNumber: roundNum,
      ownerId: media.ownerId,
      answers: {},
    })

    const startTime = Date.now()
    const duration = settings.roundDuration

    const isOwner = media.ownerId === currentPlayer?.id

    setPhase('ACTIVE_ROUND')
    playWhoosh()

    setActiveRound({
      roundNumber: roundNum,
      totalRounds,
      activeMedia: {
        id: media.id,
        type: media.type,
        dataUrl: media.dataUrl,
        isOwner,
      },
      duration,
      startTime,
      isVetoed: false,
      hasAnswered: false,
    })

    // Broadcast active round to players
    peerConnection.broadcast({
      type: 'ROUND_START',
      senderId: peerConnection.peerId,
      payload: {
        roundNumber: roundNum,
        totalRounds,
        media: {
          id: media.id,
          type: media.type,
          dataUrl: media.dataUrl,
          ownerId: media.ownerId,
        },
        duration,
        startTime,
        progressiveBlur: settings.progressiveBlur,
      },
    })

    // Simulate bot answers with realistic human delays
    currentPlayersList.forEach((p) => {
      if (p.id.startsWith('bot-')) {
        const botDelay = 1200 + Math.random() * (duration * 1000 - 1500)
        setTimeout(() => {
          const isCorrect = Math.random() > 0.35 // 65% accuracy
          const guessedId = isCorrect
            ? media.ownerId
            : currentPlayersList.find((other) => other.id !== media.ownerId)?.id || media.ownerId

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
  }

  // Step 3: Handle Timer Expiry & Auto-Advance after 3 seconds
  const handleRoundTimerExpire = () => {
    if (!currentPlayer?.isHost || phase !== 'ACTIVE_ROUND') return

    const media = mediaDeckRef.current[currentRoundIndexRef.current]
    if (!media) return

    const history = roundHistoryRef.current[currentRoundIndexRef.current] || {
      roundNumber: activeRound.roundNumber,
      ownerId: media.ownerId,
      answers: {},
    }

    // Calculate scores for all players independently
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

    // Find fastest correct answer
    Object.entries(history.answers).forEach(([playerId, ans]) => {
      if (ans.isCorrect && ans.responseTime < fastestTime) {
        fastestTime = ans.responseTime
        fastestPlayerId = playerId
      }
    })

    const updatedPlayers = players.map((p) => {
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

    const fastestPlayer = players.find((p) => p.id === fastestPlayerId)

    const roundResults = {
      correctPlayerId: media.ownerId,
      answers: calculatedAnswers,
      fastestGuesserId: fastestPlayerId,
    }

    setPhase('REVEAL')
    const myResult = calculatedAnswers[currentPlayer.id]
    if (myResult) {
      if (myResult.isCorrect) playCorrect()
      else playWrong()
    }

    setActiveRound((prev) => ({
      ...prev,
      correctOwnerId: media.ownerId,
      results: roundResults,
    }))

    peerConnection.broadcast({
      type: 'ROUND_END',
      senderId: peerConnection.peerId,
      payload: {
        correctPlayerId: media.ownerId,
        results: roundResults,
        updatedPlayers,
        fastestPlayer,
      },
    })

    // AUTOMATIC TRANSITION: Advance to Scoreboard after 3.5 seconds!
    clearAutoTimer()
    autoAdvanceTimerRef.current = setTimeout(() => {
      advanceToScoreboard(updatedPlayers)
    }, 3500)
  }

  // Emergency Panic / Veto trigger
  const triggerVetoSequence = () => {
    clearAutoTimer()
    playPanic()
    setActiveRound((prev) => ({ ...prev, isVetoed: true }))

    peerConnection.broadcast({
      type: 'VETO_TRIGGERED',
      senderId: peerConnection.peerId,
      payload: { reason: 'CENSORED_BY_OWNER' },
    })

    // Advance to next round automatically after 2.5s
    setTimeout(() => {
      advanceToScoreboard(players)
    }, 2500)
  }

  // Step 4: Advance to Leaderboard Race & Auto-Advance after 5 seconds
  const advanceToScoreboard = (currentPlayersList?: Player[]) => {
    clearAutoTimer()
    const activePlayers = currentPlayersList || players
    setPhase('LEADERBOARD')
    setPlayers(activePlayers)

    peerConnection.broadcast({
      type: 'LEADERBOARD_VIEW',
      senderId: peerConnection.peerId,
      payload: { players: activePlayers },
    })

    // AUTOMATIC TRANSITION: Advance to Next Round after 5 seconds!
    autoAdvanceTimerRef.current = setTimeout(() => {
      currentRoundIndexRef.current++
      runNextRound(activeRound.roundNumber + 1, activePlayers)
    }, 5000)
  }

  // Manual fallback override if host wants to advance immediately
  const handleNextRoundFromLeaderboard = () => {
    clearAutoTimer()
    currentRoundIndexRef.current++
    runNextRound(activeRound.roundNumber + 1, players)
  }

  // Restart / Play Again
  const handlePlayAgain = () => {
    clearAutoTimer()
    setPhase('LOBBY')
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

  // --------------------------------------------------------------------------
  // Player Interaction (Submit Guess & Veto)
  // --------------------------------------------------------------------------
  const handleAnswerSubmit = (guessedPlayerId: string) => {
    if (activeRound.hasAnswered || activeRound.isVetoed) return

    const responseTime = Date.now() - activeRound.startTime
    setActiveRound((prev) => ({
      ...prev,
      hasAnswered: true,
      selectedPlayerId: guessedPlayerId,
    }))

    const myPlayerId = currentPlayer?.id || peerConnection.peerId

    if (currentPlayer?.isHost) {
      // Record answer directly in host's round history
      const history = roundHistoryRef.current[currentRoundIndexRef.current]
      if (history) {
        history.answers[myPlayerId] = {
          guessedPlayerId,
          isCorrect: guessedPlayerId === history.ownerId,
          responseTime,
        }
      }
    } else {
      // Send answer with explicit playerId to host
      peerConnection.sendToHost({
        type: 'ANSWER_SUBMITTED',
        senderId: myPlayerId,
        payload: { playerId: myPlayerId, guessedPlayerId, responseTime },
      })
    }
  }

  const handlePanicVetoClick = () => {
    if (currentPlayer?.isHost) {
      triggerVetoSequence()
    } else {
      peerConnection.sendToHost({
        type: 'PANIC_VETO',
        senderId: currentPlayer?.id || peerConnection.peerId,
        payload: { roundNumber: activeRound.roundNumber },
      })
    }
  }

  // --------------------------------------------------------------------------
  // Render Views
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen w-full bg-[#0d0b18] text-gray-100 flex flex-col justify-between selection:bg-violet-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="w-full max-w-4xl mx-auto px-4 py-3 flex items-center justify-between z-30">
        <div
          onClick={() => phase !== 'ACTIVE_ROUND' && setPhase('LANDING')}
          className="flex items-center gap-2 cursor-pointer select-none"
        >
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-violet-600 to-pink-500 flex items-center justify-center text-xl shadow-lg shadow-violet-900/40 border border-white/20">
            📸
          </div>
          <span className="font-black text-lg sm:text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-200 to-violet-300">
            PHOTO ROULETTE
          </span>
        </div>

        <div className="flex items-center gap-2">
          {peerConnection.roomCode && (
            <Badge variant="primary" size="sm" className="font-mono">
              Room: {peerConnection.roomCode}
            </Badge>
          )}

          <SoundToggle isMuted={isMuted} onToggle={toggleMute} />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-3xl mx-auto px-4 py-2 flex-1 flex flex-col justify-center">
        {/* ==================================================================== */}
        {/* 1. LANDING SCREEN */}
        {/* ==================================================================== */}
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

            {/* Mode Selector */}
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
              </div>
            )}

            {/* Host Profile Setup */}
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
                    Your Nickname
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="Enter your name..."
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white text-sm font-semibold focus:outline-none focus:border-violet-500"
                  />
                </div>

                {/* Avatar emoji picker */}
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

                {/* Color picker */}
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
                    onClick={() => setLandingMode('SELECT')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    className="flex-2"
                    isLoading={peerConnection.isConnecting}
                    onClick={landingMode === 'HOST_SETUP' ? startHostGame : joinExistingGame}
                  >
                    <span>{landingMode === 'HOST_SETUP' ? 'Launch Room 🚀' : 'Join 🎮'}</span>
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* 2. LOBBY SCREEN */}
        {/* ==================================================================== */}
        {phase === 'LOBBY' && (
          <div className="w-full space-y-6 py-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: QR Code & Settings */}
              <div className="md:col-span-5 space-y-4">
                <QRCodeDisplay roomCode={peerConnection.roomCode} />

                <SettingsDrawer
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  isHost={!!currentPlayer?.isHost}
                />
              </div>

              {/* Right Column: Player List & Media Uploader */}
              <div className="md:col-span-7 space-y-4">
                {/* Photo Contribution Section (Auto-Selects & Auto-Readies) */}
                <MediaUploader
                  onMediaReady={handleMediaContribute}
                  isReady={isReady}
                  onToggleReady={handleToggleReady}
                  mediaType={settings.mediaType}
                />

                {/* Player List */}
                <PlayerList players={players} currentPlayerId={currentPlayer?.id} />

                {/* Host Control Actions */}
                {currentPlayer?.isHost && (
                  <div className="space-y-2 pt-2">

                    <Button
                      size="xl"
                      variant="primary"
                      fullWidth
                      disabled={players.length < 1}
                      onClick={startFullGame}
                      className="text-base font-black shadow-violet-900/50"
                    >
                      <span>Start Photo Roulette! (Fully Automated ⚡)</span>
                    </Button>
                    <p className="text-[11px] text-gray-400 text-center">
                      Rounds, owner reveals and scoreboards will automatically transition every 3 seconds hands-free!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* 3. 3-SECOND COUNTDOWN */}
        {/* ==================================================================== */}
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

        {/* ==================================================================== */}
        {/* 4. ACTIVE ROUND SCREEN */}
        {/* ==================================================================== */}
        {phase === 'ACTIVE_ROUND' && activeRound.activeMedia && (
          <div className="w-full max-w-xl mx-auto space-y-4 py-2 animate-in fade-in duration-200">
            {/* Round info & Timer Bar */}
            <div className="flex items-center justify-between text-xs text-gray-400 px-1">
              <span className="font-bold text-violet-300">
                Round {activeRound.roundNumber} of {activeRound.totalRounds}
              </span>
              <span className="font-semibold text-gray-400">
                {players.length} players in game
              </span>
            </div>

            <TimerBar
              durationSec={activeRound.duration}
              startTime={activeRound.startTime}
              onExpire={handleRoundTimerExpire}
              isPaused={activeRound.isVetoed}
            />

            {/* Media Viewer */}
            <MediaViewer
              media={activeRound.activeMedia}
              progressiveBlur={settings.progressiveBlur}
              durationSec={activeRound.duration}
              isVetoed={activeRound.isVetoed}
              isTimeUp={phase !== 'ACTIVE_ROUND'}
              isHostTV={settings.tvMode && currentPlayer?.isHost}
              isMuted={isMuted}
            />

            {/* Owner Panic Button (visible ONLY to the owner of this active photo) */}
            {activeRound.activeMedia.isOwner && !activeRound.isVetoed && (
              <PanicButton onPanicVeto={handlePanicVetoClick} />
            )}

            {/* Answer Grid (Hidden on Host TV mode if Host is not playing) */}
            {(!settings.tvMode || !currentPlayer?.isHost) && !activeRound.isVetoed && (
              <PlayerGrid
                players={players}
                selectedPlayerId={activeRound.selectedPlayerId}
                hasAnswered={activeRound.hasAnswered}
                onSelectPlayer={handleAnswerSubmit}
                currentPlayerId={currentPlayer?.id}
              />
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* 5. REVEAL SCREEN (Automatically advances to scoreboard in 3s) */}
        {/* ==================================================================== */}
        {phase === 'REVEAL' && activeRound.correctOwnerId && (
          <div className="w-full max-w-md mx-auto space-y-5 py-4 animate-in fade-in duration-200">
            <RevealCard
              correctPlayer={
                players.find((p) => p.id === activeRound.correctOwnerId) || players[0]
              }
              players={players}
              results={activeRound.results}
              currentPlayerId={currentPlayer?.id}
              isHostTV={settings.tvMode && currentPlayer?.isHost}
              autoAdvanceSeconds={3}
            />
          </div>
        )}

        {/* ==================================================================== */}
        {/* 6. LEADERBOARD SCREEN (Automatically advances to next round in 5s) */}
        {/* ==================================================================== */}
        {phase === 'LEADERBOARD' && (
          <div className="w-full max-w-lg mx-auto space-y-4 py-4 animate-in fade-in duration-200">
            <LeaderboardRace
              players={players}
              currentPlayerId={currentPlayer?.id}
              roundNumber={activeRound.roundNumber}
              totalRounds={activeRound.totalRounds}
              autoAdvanceSeconds={5}
            />
          </div>
        )}

        {/* ==================================================================== */}
        {/* 7. GAME OVER / PODIUM SCREEN */}
        {/* ==================================================================== */}
        {phase === 'GAME_OVER' && (
          <div className="w-full py-4 animate-in fade-in duration-300">
            <Podium
              players={players}
              awards={gameAwards}
              onPlayAgain={handlePlayAgain}
              isHost={!!currentPlayer?.isHost}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto px-4 py-3 text-center text-xs text-gray-500">
        <span>Photo Roulette • WebRTC P2P Party Game • Serverless on GitHub Pages</span>
      </footer>
    </div>
  )
}
