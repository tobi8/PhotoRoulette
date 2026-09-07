import React from 'react'
import { Check, Lock } from 'lucide-react'
import { Player } from '../../types/game'
import { Avatar } from '../ui/Avatar'

interface PlayerGridProps {
  players: Player[]
  selectedPlayerId?: string
  hasAnswered: boolean
  onSelectPlayer: (playerId: string) => void
  disabled?: boolean
  currentPlayerId?: string
}

export const PlayerGrid: React.FC<PlayerGridProps> = ({
  players,
  selectedPlayerId,
  hasAnswered,
  onSelectPlayer,
  disabled = false,
  currentPlayerId,
}) => {
  return (
    <div className="w-full space-y-2">
      <div className="text-xs font-bold text-center text-gray-400 tracking-wider uppercase">
        {hasAnswered ? 'Answer Locked In! 🔒' : 'Whose photo is this? Tap to guess!'}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {players.map((player) => {
          const isSelected = selectedPlayerId === player.id
          const isYou = player.id === currentPlayerId

          return (
            <button
              key={player.id}
              disabled={disabled || hasAnswered}
              onClick={() => onSelectPlayer(player.id)}
              className={`relative flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer active:scale-95 disabled:active:scale-100 ${
                isSelected
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border-violet-400 text-white shadow-lg shadow-violet-900/40 ring-2 ring-violet-400/50'
                  : hasAnswered
                  ? 'bg-[#171527]/50 border-white/5 opacity-50 cursor-not-allowed'
                  : 'bg-[#171527] border-white/10 hover:border-white/25 hover:bg-[#201d36] text-white shadow-md'
              }`}
            >
              <Avatar avatar={player.avatar} color={player.color} size="sm" />

              <div className="min-w-0 flex-1">
                <div className="font-bold text-xs sm:text-sm truncate">
                  {player.name}
                </div>
                {isYou && (
                  <span className="text-[10px] text-gray-400 block -mt-0.5">
                    (Your Photo?)
                  </span>
                )}
              </div>

              {isSelected && (
                <div className="p-1 rounded-full bg-white/20 text-white shrink-0">
                  <Check size={14} />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {hasAnswered && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-violet-300 font-semibold py-1 animate-pulse">
          <Lock size={12} />
          <span>Waiting for timer to reveal the owner...</span>
        </div>
      )}
    </div>
  )
}
