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
    <div className="w-full">
      {hasAnswered ? (
        <div className="flex flex-col items-center justify-center gap-1 py-2.5 px-4 rounded-2xl bg-[#171527]/90 backdrop-blur-md border border-violet-500/40 text-center shadow-2xl animate-in zoom-in-95 duration-150">
          <div className="flex items-center gap-1.5 text-xs text-violet-300 font-extrabold">
            <Lock size={14} className="text-violet-400" />
            <span>Answer Locked In!</span>
          </div>
          <div className="text-[11px] text-gray-300">
            Waiting for timer to reveal the owner...
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[11px] sm:text-xs font-extrabold text-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] tracking-wider uppercase">
            Whose photo is this? Tap to guess!
          </div>

          <div className="grid grid-cols-2 gap-2">
            {players.map((player) => {
              const isSelected = selectedPlayerId === player.id
              const isYou = player.id === currentPlayerId

              return (
                <button
                  key={player.id}
                  disabled={disabled || hasAnswered}
                  onClick={() => onSelectPlayer(player.id)}
                  className={`relative flex items-center gap-2 p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border text-left transition-all duration-150 cursor-pointer active:scale-95 disabled:active:scale-100 backdrop-blur-md shadow-lg ${
                    isSelected
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border-violet-400 text-white shadow-violet-900/50 ring-2 ring-violet-400/60'
                      : 'bg-[#171527]/85 border-white/20 hover:border-white/40 hover:bg-[#201d36]/95 text-white'
                  }`}
                >
                  <Avatar avatar={player.avatar} color={player.color} size="sm" />

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs sm:text-sm truncate">
                      {player.name}
                    </div>
                    {isYou && (
                      <span className="text-[10px] text-gray-400 block -mt-0.5">
                        (You)
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
        </div>
      )}
    </div>
  )
}
