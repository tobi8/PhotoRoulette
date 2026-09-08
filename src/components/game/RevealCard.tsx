import React, { useEffect, useState } from 'react'
import { Sparkles, Zap, Flame, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Player } from '../../types/game'
import { Avatar } from '../ui/Avatar'

interface RevealCardProps {
  correctPlayer: Player
  players: Player[]
  results?: {
    correctPlayerId: string
    answers: Record<
      string,
      {
        guessedPlayerId: string
        isCorrect: boolean
        points: number
        responseTime: number
        newTotal: number
        streak: number
      }
    >
    fastestGuesserId?: string
  }
  currentPlayerId?: string
  isHostTV?: boolean
  autoAdvanceSeconds?: number
}

export const RevealCard: React.FC<RevealCardProps> = ({
  correctPlayer,
  players,
  results,
  currentPlayerId,
  isHostTV = false,
  autoAdvanceSeconds = 3,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(autoAdvanceSeconds)

  useEffect(() => {
    setSecondsLeft(autoAdvanceSeconds)
    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [autoAdvanceSeconds])

  const myAnswer =
    results?.answers[currentPlayerId || ''] ||
    (currentPlayerId
      ? Object.entries(results?.answers || {}).find(([id]) => id === currentPlayerId)?.[1]
      : undefined) ||
    Object.values(results?.answers || {})[0]

  const myGuessedPlayer = myAnswer?.guessedPlayerId
    ? players.find((p) => p.id === myAnswer.guessedPlayerId) ||
      players.find((p) => p.name.toLowerCase() === myAnswer.guessedPlayerId.toLowerCase())
    : undefined

  const fastestPlayer = results?.fastestGuesserId
    ? players.find((p) => p.id === results.fastestGuesserId)
    : undefined
  const fastestTimeSec = results?.fastestGuesserId && results.answers[results.fastestGuesserId]
    ? (results.answers[results.fastestGuesserId].responseTime / 1000).toFixed(2)
    : undefined

  return (
    <div className="w-full bg-[#171527] border border-violet-500/30 rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-center">
      <div className="text-xs font-bold tracking-widest text-violet-400 uppercase">
        PHOTO OWNER REVEALED
      </div>

      {/* Owner highlight */}
      <div className="flex flex-col items-center justify-center gap-2">
        <div className="relative">
          <Avatar
            avatar={correctPlayer.avatar}
            color={correctPlayer.color}
            size={isHostTV ? 'xl' : 'lg'}
          />
          <div className="absolute -top-2 -right-2 p-1 bg-amber-400 text-black rounded-full shadow-lg">
            <Sparkles size={16} />
          </div>
        </div>

        <div className="text-2xl sm:text-3xl font-black text-white">
          {correctPlayer.name}
        </div>
        <p className="text-xs text-gray-400">
          This photo was taken by <strong>{correctPlayer.name}</strong>!
        </p>
      </div>

      {/* Your Personal Guess & Score Result */}
      {myAnswer && (
        <div
          className={`p-3.5 rounded-2xl border text-left flex items-center justify-between ${
            myAnswer.isCorrect
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {myAnswer.isCorrect ? (
              <CheckCircle size={24} className="text-emerald-400 shrink-0" />
            ) : (
              <XCircle size={24} className="text-red-400 shrink-0" />
            )}
            <div>
              <div className="font-extrabold text-sm flex items-center gap-1.5">
                <span>{myAnswer.isCorrect ? 'You Guessed Correctly!' : 'Wrong Guess!'}</span>
                {myAnswer.streak > 1 && (
                  <span className="text-xs text-amber-300 flex items-center gap-0.5 font-bold">
                    <Flame size={12} /> {myAnswer.streak}x
                  </span>
                )}
              </div>
              <div className="text-xs opacity-80 mt-0.5">
                You picked:{' '}
                <strong className="text-white">
                  {myGuessedPlayer ? myGuessedPlayer.name : 'Unknown'}
                </strong>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="font-mono font-black text-lg">
              {myAnswer.isCorrect ? `+${myAnswer.points}` : '+0'}
            </div>
            <div className="text-[10px] text-gray-400 font-mono">pts</div>
          </div>
        </div>
      )}

      {/* Fastest Guesser callout */}
      {fastestPlayer && (
        <div className="bg-white/5 rounded-xl p-2.5 flex items-center justify-center gap-2 text-xs text-amber-300 font-semibold border border-amber-500/20">
          <Zap size={14} className="text-amber-400 shrink-0" />
          <span>
            Lightning Reflexes: <strong className="text-white">{fastestPlayer.name}</strong>{' '}
            ({fastestTimeSec}s)
          </span>
        </div>
      )}

      {/* Who Guessed Whom Breakdown */}
      {results && results.answers && Object.keys(results.answers).length > 0 && (
        <div className="pt-2 border-t border-white/10 text-left">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Player Guesses This Round:
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {players.map((p) => {
              const ans = results.answers[p.id]
              if (!ans) return null
              const guessedP =
                players.find((item) => item.id === ans.guessedPlayerId) ||
                players.find((item) => item.name.toLowerCase() === ans.guessedPlayerId.toLowerCase())

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs p-2 rounded-xl bg-white/5 border border-white/5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar avatar={p.avatar} color={p.color} size="sm" />
                    <span className="font-bold text-white truncate max-w-[90px]">
                      {p.name}
                    </span>
                    <span className="text-gray-400 text-[11px]">guessed</span>
                    <span
                      className={`font-semibold truncate max-w-[90px] ${
                        ans.isCorrect ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {guessedP ? guessedP.name : 'Nobody'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 font-mono font-bold shrink-0">
                    {ans.isCorrect ? (
                      <span className="text-emerald-400">+{ans.points}</span>
                    ) : (
                      <span className="text-gray-500">+0</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Auto-Advance countdown banner */}
      <div className="pt-2 flex items-center justify-center gap-2 text-xs text-gray-400">
        <Clock size={13} className="text-violet-400 animate-spin" />
        <span>
          Continuing automatically in <strong className="text-white">{secondsLeft}s</strong>...
        </span>
      </div>
    </div>
  )
}
