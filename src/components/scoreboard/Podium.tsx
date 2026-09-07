import React from 'react'
import { Trophy, Medal, Sparkles, Zap, Flame, Eye, RotateCcw } from 'lucide-react'
import { Player } from '../../types/game'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { ConfettiEffect } from './ConfettiEffect'
import { GameAwards } from '../../utils/scoring'

interface PodiumProps {
  players: Player[]
  awards?: GameAwards
  onPlayAgain: () => void
  isHost: boolean
}

export const Podium: React.FC<PodiumProps> = ({
  players,
  awards,
  onPlayAgain,
  isHost,
}) => {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  const first = sorted[0]
  const second = sorted[1]
  const third = sorted[2]

  return (
    <div className="w-full max-w-xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">
      <ConfettiEffect />

      {/* Header */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold border border-amber-400/30 mb-2">
          <Trophy size={14} />
          <span>GAME OVER • FINAL PODIUM</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-pink-400 to-violet-400">
          Victory Celebration! 🎉
        </h2>
        <p className="text-xs sm:text-sm text-gray-400">
          The roulette has completed. Here are your ultimate champions!
        </p>
      </div>

      {/* 3-Step Podium */}
      <div className="pt-8 pb-4 flex items-end justify-center gap-2 sm:gap-4 px-2">
        {/* 2nd Place */}
        {second && (
          <div className="flex-1 flex flex-col items-center animate-in slide-in-from-bottom-8 duration-500 delay-100">
            <div className="relative mb-2">
              <Avatar avatar={second.avatar} color={second.color} size="md" />
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-300 text-black text-xs font-black flex items-center justify-center shadow-md">
                2
              </div>
            </div>
            <div className="font-bold text-xs sm:text-sm text-white truncate max-w-[90px] text-center">
              {second.name}
            </div>
            <div className="text-[11px] font-mono text-gray-300 mb-2">
              {second.score.toLocaleString()} pts
            </div>
            {/* Step Block */}
            <div className="w-full h-28 bg-gradient-to-t from-slate-800 to-slate-700 rounded-t-2xl border-t-2 border-slate-400 shadow-xl flex items-center justify-center text-slate-300 font-black text-2xl">
              2nd
            </div>
          </div>
        )}

        {/* 1st Place */}
        {first && (
          <div className="flex-1 flex flex-col items-center -mt-6 animate-in slide-in-from-bottom-12 duration-500">
            <div className="relative mb-2">
              <div className="p-1 rounded-full bg-amber-400/40 animate-pulse">
                <Avatar avatar={first.avatar} color={first.color} size="lg" />
              </div>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl animate-bounce">
                👑
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-400 text-black text-xs font-black flex items-center justify-center shadow-lg border-2 border-[#171527]">
                1
              </div>
            </div>
            <div className="font-extrabold text-sm sm:text-base text-amber-300 truncate max-w-[110px] text-center">
              {first.name}
            </div>
            <div className="text-xs font-mono font-bold text-white mb-2">
              {first.score.toLocaleString()} pts
            </div>
            {/* Step Block */}
            <div className="w-full h-38 bg-gradient-to-t from-amber-600 via-amber-500 to-yellow-400 rounded-t-2xl border-t-2 border-yellow-200 shadow-2xl shadow-amber-500/20 flex flex-col items-center justify-center text-black font-black text-3xl">
              <span>1st</span>
              <Sparkles size={18} className="text-yellow-900 animate-spin mt-1" />
            </div>
          </div>
        )}

        {/* 3rd Place */}
        {third && (
          <div className="flex-1 flex flex-col items-center animate-in slide-in-from-bottom-6 duration-500 delay-200">
            <div className="relative mb-2">
              <Avatar avatar={third.avatar} color={third.color} size="md" />
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-700 text-white text-xs font-black flex items-center justify-center shadow-md">
                3
              </div>
            </div>
            <div className="font-bold text-xs sm:text-sm text-white truncate max-w-[90px] text-center">
              {third.name}
            </div>
            <div className="text-[11px] font-mono text-gray-300 mb-2">
              {third.score.toLocaleString()} pts
            </div>
            {/* Step Block */}
            <div className="w-full h-20 bg-gradient-to-t from-amber-950 to-amber-900 rounded-t-2xl border-t-2 border-amber-600 shadow-lg flex items-center justify-center text-amber-500 font-black text-xl">
              3rd
            </div>
          </div>
        )}
      </div>

      {/* Fun Special Awards */}
      {awards && (awards.fastestGuesser || awards.chameleon || awards.eagleEye) && (
        <div className="bg-[#171527] border border-white/10 rounded-3xl p-4 shadow-xl space-y-3">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center">
            Party Awards & Honors 🎖️
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {awards.fastestGuesser && (
              <div className="bg-white/5 rounded-2xl p-3 border border-amber-500/20 text-center">
                <div className="inline-flex p-2 rounded-xl bg-amber-500/20 text-amber-400 mb-1">
                  <Zap size={18} />
                </div>
                <div className="text-xs font-bold text-white">Fastest Guesser</div>
                <div className="text-xs font-semibold text-amber-300 truncate">
                  {awards.fastestGuesser.player.name}
                </div>
                <div className="text-[10px] text-gray-400">{awards.fastestGuesser.stat}</div>
              </div>
            )}

            {awards.chameleon && (
              <div className="bg-white/5 rounded-2xl p-3 border border-purple-500/20 text-center">
                <div className="inline-flex p-2 rounded-xl bg-purple-500/20 text-purple-400 mb-1">
                  <Eye size={18} />
                </div>
                <div className="text-xs font-bold text-white">Sneakiest Chameleon</div>
                <div className="text-xs font-semibold text-purple-300 truncate">
                  {awards.chameleon.player.name}
                </div>
                <div className="text-[10px] text-gray-400">{awards.chameleon.stat}</div>
              </div>
            )}

            {awards.eagleEye && (
              <div className="bg-white/5 rounded-2xl p-3 border border-emerald-500/20 text-center">
                <div className="inline-flex p-2 rounded-xl bg-emerald-500/20 text-emerald-400 mb-1">
                  <Flame size={18} />
                </div>
                <div className="text-xs font-bold text-white">Point Champion</div>
                <div className="text-xs font-semibold text-emerald-300 truncate">
                  {awards.eagleEye.player.name}
                </div>
                <div className="text-[10px] text-gray-400">{awards.eagleEye.stat}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Play Again Button */}
      <div className="pt-2 text-center">
        {isHost ? (
          <Button
            size="lg"
            variant="primary"
            onClick={onPlayAgain}
            className="w-full max-w-sm text-base"
          >
            <RotateCcw size={18} />
            Play Another Game!
          </Button>
        ) : (
          <div className="p-3 bg-white/5 rounded-2xl text-xs text-gray-400 border border-white/10">
            Waiting for Host to start a new game...
          </div>
        )}
      </div>
    </div>
  )
}
