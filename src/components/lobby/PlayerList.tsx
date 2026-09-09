import React from 'react'
import { Crown, Image, Check, Clock, UserX } from 'lucide-react'
import { Player } from '../../types/game'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'

interface PlayerListProps {
  players: Player[]
  currentPlayerId?: string
  isHost?: boolean
  onRemovePlayer?: (playerId: string) => void
}

export const PlayerList: React.FC<PlayerListProps> = ({
  players,
  currentPlayerId,
  isHost = false,
  onRemovePlayer,
}) => {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold tracking-wider text-gray-300 uppercase">
          Players In Room ({players.length})
        </h3>
        <span className="text-xs text-gray-400">
          {players.filter((p) => p.isReady).length}/{players.length} Ready
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {players.map((player) => {
          const isYou = player.id === currentPlayerId
          const canRemove = isHost && !player.isHost

          return (
            <div
              key={player.id}
              className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-150 ${
                isYou
                  ? 'bg-violet-950/40 border-violet-500/40 shadow-md shadow-violet-900/10'
                  : 'bg-[#171527] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  avatar={player.avatar}
                  color={player.color}
                  size="md"
                  isReady={player.isReady}
                  showReadyStatus
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-white truncate">
                      {player.name}
                    </span>
                    {player.isHost && (
                      <span title="Host">
                        <Crown size={14} className="text-amber-400 shrink-0" />
                      </span>
                    )}
                    {isYou && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-600/60 text-violet-200">
                        YOU
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Image size={12} />
                      <span>{player.mediaCount || 0} photos</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {player.isReady ? (
                  <Badge variant="success" size="sm">
                    <Check size={12} /> Ready
                  </Badge>
                ) : (
                  <Badge variant="warning" size="sm">
                    <Clock size={12} /> Picking
                  </Badge>
                )}

                {canRemove && onRemovePlayer && (
                  <button
                    onClick={() => onRemovePlayer(player.id)}
                    className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all cursor-pointer"
                    title={`Remove ${player.name}`}
                  >
                    <UserX size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
