import React from 'react'
import { Settings, Clock, Layers, Eye, Tv } from 'lucide-react'
import { GameSettings } from '../../types/game'

interface SettingsDrawerProps {
  settings: GameSettings
  onUpdateSettings: (newSettings: GameSettings) => void
  isHost: boolean
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  settings,
  onUpdateSettings,
  isHost,
}) => {
  const roundDurations = [3, 5, 8, 10]
  const totalRoundsOptions = [5, 10, 15, 20]

  return (
    <div className="w-full bg-[#171527] border border-white/10 rounded-3xl p-5 shadow-xl">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
        <Settings size={18} className="text-violet-400" />
        <h3 className="font-bold text-white text-base">Game Rules & Settings</h3>
        {!isHost && (
          <span className="text-xs text-gray-400 ml-auto">(Host Controls)</span>
        )}
      </div>

      <div className="space-y-4 text-sm">

        {/* Round Duration */}
        <div>
          <label className="text-gray-300 font-semibold mb-2 flex items-center gap-1.5">
            <Clock size={15} className="text-pink-400" />
            <span>Round Duration</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {roundDurations.map((sec) => (
              <button
                key={sec}
                disabled={!isHost}
                onClick={() => onUpdateSettings({ ...settings, roundDuration: sec })}
                className={`py-2 rounded-xl font-bold transition-all ${
                  settings.roundDuration === sec
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-900/40 border border-violet-400/40'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/5'
                } ${!isHost ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>

        {/* Total Rounds */}
        <div>
          <label className="text-gray-300 font-semibold mb-2 flex items-center gap-1.5">
            <Layers size={15} className="text-amber-400" />
            <span>Total Rounds</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {totalRoundsOptions.map((rounds) => (
              <button
                key={rounds}
                disabled={!isHost}
                onClick={() => onUpdateSettings({ ...settings, totalRounds: rounds })}
                className={`py-2 rounded-xl font-bold transition-all ${
                  settings.totalRounds === rounds
                    ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-900/40 border border-pink-400/40'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/5'
                } ${!isHost ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {rounds}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="pt-2 border-t border-white/10 space-y-3">
          {/* Progressive blur reveal */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye size={16} className="text-teal-400" />
              <div>
                <div className="font-semibold text-white text-xs sm:text-sm">
                  Progressive Blur Reveal
                </div>
                <div className="text-[11px] text-gray-400">
                  Starts heavily blurred and sharpens over time
                </div>
              </div>
            </div>

            <button
              disabled={!isHost}
              onClick={() =>
                onUpdateSettings({ ...settings, progressiveBlur: !settings.progressiveBlur })
              }
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                settings.progressiveBlur ? 'bg-emerald-500' : 'bg-white/20'
              } ${!isHost ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                  settings.progressiveBlur ? 'left-6.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* TV Big Screen Mode */}
          {isHost && (
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <Tv size={16} className="text-indigo-400" />
                <div>
                  <div className="font-semibold text-white text-xs sm:text-sm">
                    Host TV Screen Mode
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Host screen acts purely as party board / TV display
                  </div>
                </div>
              </div>

              <button
                onClick={() => onUpdateSettings({ ...settings, tvMode: !settings.tvMode })}
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                  settings.tvMode ? 'bg-indigo-600' : 'bg-white/20'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                    settings.tvMode ? 'left-6.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
