import React, { useEffect, useState } from 'react'

interface TimerBarProps {
  durationSec: number
  startTime: number
  onExpire?: () => void
  isPaused?: boolean
}

export const TimerBar: React.FC<TimerBarProps> = ({
  durationSec,
  startTime,
  onExpire,
  isPaused = false,
}) => {
  const [timeLeftMs, setTimeLeftMs] = useState(durationSec * 1000)

  useEffect(() => {
    if (isPaused) return

    const totalMs = durationSec * 1000
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, totalMs - elapsed)
      setTimeLeftMs(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        onExpire?.()
      }
    }, 40)

    return () => clearInterval(interval)
  }, [durationSec, startTime, isPaused, onExpire])

  const totalMs = durationSec * 1000
  const progressPercent = Math.max(0, Math.min(100, (timeLeftMs / totalMs) * 100))
  const secondsLeft = (timeLeftMs / 1000).toFixed(1)
  const isUrgent = timeLeftMs <= 2000

  // Points decay estimate: 1000 down to 500
  const currentPointsEst = Math.round(500 + 500 * (timeLeftMs / totalMs))

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-xs font-mono font-bold px-1">
        <span
          className={`transition-colors ${
            isUrgent ? 'text-red-400 animate-pulse text-sm' : 'text-violet-300'
          }`}
        >
          ⏱️ {secondsLeft}s
        </span>
        <span className="text-amber-400">
          +{currentPointsEst} pts
        </span>
      </div>

      {/* Bar container */}
      <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10 p-0.5">
        <div
          className={`h-full rounded-full transition-all duration-75 ${
            isUrgent
              ? 'bg-gradient-to-r from-red-600 to-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'
              : progressPercent < 50
              ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
              : 'bg-gradient-to-r from-violet-500 via-pink-500 to-indigo-500'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}
