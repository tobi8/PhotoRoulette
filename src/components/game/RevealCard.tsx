import React from 'react'
import { Sparkles, Zap, Flame, CheckCircle, XCircle } from 'lucide-react'
import { Player } from '../../types/game'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'

interface RevealCardProps {
  correctPlayer: Player
  yourAnswer?: {
    isCorrect: boolean
    points: number
    streak: number
  }
  fastestGuesser?: {
    player: Player
    timeSec: number
  }
  isHostTV?: boolean
}

export const RevealCard: React.FC<RevealCardProps> = ({
  correctPlayer,
  yourAnswer,
  fastestGuesser,
  isHostTV = false,
}) => {
  return (
    <div className="w-full bg-[#171527] border border-violet-500/30 rounded-3xl p-5 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-200">
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
          This photo came from {correctPlayer.name}'s camera roll!
        </p>
      </div>

      {/* User's performance badge (if playing) */}
      {yourAnswer && (
        <div
          className={`p-3 rounded-2xl border flex items-center justify-between ${
            yourAnswer.isCorrect
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {yourAnswer.isCorrect ? (
              <CheckCircle size={20} className="text-emerald-400" />
            ) : (
              <XCircle size={20} className="text-red-400" />
            )}
            <div className="text-left">
              <div className="font-bold text-sm">
                {yourAnswer.isCorrect ? 'Correct Guess!' : 'Wrong Guess!'}
              </div>
              {yourAnswer.streak > 1 && (
                <div className="text-xs text-amber-300 flex items-center gap-1 font-bold">
                  <Flame size={12} />
                  <span>{yourAnswer.streak} Streak in a row!</span>
                </div>
              )}
            </div>
          </div>

          <div className="font-mono font-black text-base sm:text-lg">
            {yourAnswer.isCorrect ? `+${yourAnswer.points}` : '+0'} pts
          </div>
        </div>
      )}

      {/* Fastest Guesser callout */}
      {fastestGuesser && (
        <div className="bg-white/5 rounded-xl p-2.5 flex items-center justify-center gap-2 text-xs text-amber-300 font-semibold border border-amber-500/20">
          <Zap size={14} className="text-amber-400 shrink-0" />
          <span>
            Fastest Guesser: <strong className="text-white">{fastestGuesser.player.name}</strong> ({fastestGuesser.timeSec}s)
          </span>
        </div>
      )}
    </div>
  )
}
