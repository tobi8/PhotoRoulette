import React from 'react'
import { Flame, ArrowUp, ArrowDown } from 'lucide-react'
import { Player } from '../../types/game'
import { Avatar } from '../ui/Avatar'

interface LeaderboardRaceProps {
  players: Player[]
  currentPlayerId?: string
  roundNumber?: number
  totalRounds?: number
}

export const LeaderboardRace: React.FC<LeaderboardRaceProps> = ({
  players,
  currentPlayerId,
  roundNumber,
  totalRounds,
}) => {
  // Sort players descending by score
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const maxScore = Math.max(1, sortedPlayers[0]?.score || 1)

  return (
    <div className="w-full bg-[#171527] border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div>
          <h3 className="font-extrabold text-white text-base tracking-wide flex items-center gap-2">
            <span>Scoreboard</span>
            <span>🏆</span>
          </h3>
          {roundNumber && totalRounds && (
            <span className="text-xs text-gray-400">
              Round {roundNumber} of {totalRounds}
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-violet-400">LEADERBOARD</span>
      </div>

      {/* Players race bars */}
      <div className="space-y-3">
        {sortedPlayers.map((player, index) => {
          const rank = index + 1
          const isYou = player.id === currentPlayerId
          const barWidth = Math.max(12, Math.round((player.score / maxScore) * 100))

          const rankColors = [
            'bg-amber-400 text-black', // 1st
            'bg-slate-300 text-black', // 2nd
            'bg-amber-700 text-white', // 3rd
          ]
          const defaultRankColor = 'bg-white/10 text-gray-300'

          return (
            <div key={player.id} className="relative group">
              <div
                className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-300 ${
                  isYou
                    ? 'bg-violet-950/40 border-violet-500/50 shadow-md'
                    : 'bg-white/5 border-white/5'
                }`}
              >
                {/* Left: Rank & Info */}
                <div className="flex items-center gap-3 z-10 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-full font-mono text-xs font-black flex items-center justify-center shrink-0 ${
                      rankColors[index] || defaultRankColor
                    }`}
                  >
                    {rank}
                  </div>

                  <Avatar avatar={player.avatar} color={player.color} size="sm" />

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-sm text-white truncate">
                      <span className="truncate">{player.name}</span>
                      {isYou && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-violet-600 text-violet-100">
                          YOU
                        </span>
                      )}
                    </div>
                    {player.streak > 1 && (
                      <div className="text-[11px] text-amber-300 flex items-center gap-1 font-semibold">
                        <Flame size={12} />
                        <span>{player.streak} streak</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Points */}
                <div className="text-right z-10 shrink-0">
                  <div className="font-mono font-black text-sm text-white">
                    {player.score.toLocaleString()} pts
                  </div>
                  {player.lastRoundPoints > 0 && (
                    <div className="text-[11px] text-emerald-400 font-bold">
                      +{player.lastRoundPoints}
                    </div>
                  )}
                </div>

                {/* Background Progress Fill */}
                <div
                  className={`absolute top-0 bottom-0 left-0 rounded-2xl opacity-20 transition-all duration-700 ease-out pointer-events-none ${
                    rank === 1
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-300'
                      : isYou
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-500'
                      : 'bg-white/20'
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
