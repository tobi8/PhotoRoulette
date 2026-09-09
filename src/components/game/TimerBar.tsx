import React, { useEffect, useRef, useState } from 'react'
import { clockSync } from '../../utils/clockSync'

interface TimerBarProps {
  durationSec: number
  startTime: number
  endTime?: number
  onExpire?: () => void
  isPaused?: boolean
}

export const TimerBar: React.FC<TimerBarProps> = ({
  durationSec,
  startTime,
  endTime,
  onExpire,
  isPaused = false,
}) => {
  const barRef = useRef<HTMLDivElement>(null)
  const targetEndTime = endTime || startTime + durationSec * 1000
  const totalDurationMs = durationSec * 1000
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  const [secondsDisplay, setSecondsDisplay] = useState(() => {
    const initialRemaining = Math.max(0, targetEndTime - clockSync.now())
    return (initialRemaining / 1000).toFixed(1)
  })
  const [pointsDisplay, setPointsDisplay] = useState(() => {
    const initialRemaining = Math.max(0, targetEndTime - clockSync.now())
    const fraction = totalDurationMs > 0 ? initialRemaining / totalDurationMs : 0
    return Math.round(500 + 500 * Math.max(0, Math.min(1, fraction)))
  })
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    if (isPaused) {
      if (barRef.current) {
        const computed = window.getComputedStyle(barRef.current)
        const currentWidth = computed.getPropertyValue('width')
        barRef.current.style.transition = 'none'
        barRef.current.style.width = currentWidth
      }
      return
    }

    const now = clockSync.now()
    const remainingMs = Math.max(0, targetEndTime - now)
    const initialPercent = totalDurationMs > 0 ? Math.min(100, Math.max(0, (remainingMs / totalDurationMs) * 100)) : 0

    if (barRef.current) {
      barRef.current.style.transition = 'none'
      barRef.current.style.width = `${initialPercent}%`
      void barRef.current.offsetWidth

      if (remainingMs > 0) {
        barRef.current.style.transition = `width ${remainingMs}ms linear`
        barRef.current.style.width = '0%'
      } else {
        barRef.current.style.width = '0%'
      }
    }

    let hasExpired = false
    let animationFrameId: number

    const tick = () => {
      const currentNow = clockSync.now()
      const currentRemaining = Math.max(0, targetEndTime - currentNow)
      const fraction = totalDurationMs > 0 ? currentRemaining / totalDurationMs : 0

      setSecondsDisplay((currentRemaining / 1000).toFixed(1))
      setPointsDisplay(Math.round(500 + 500 * Math.max(0, Math.min(1, fraction))))
      setIsUrgent(currentRemaining <= 2000)

      if (currentRemaining <= 0) {
        if (!hasExpired) {
          hasExpired = true
          onExpireRef.current?.()
        }
      } else {
        animationFrameId = requestAnimationFrame(tick)
      }
    }

    animationFrameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [targetEndTime, totalDurationMs, isPaused])

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-xs font-mono font-bold px-1">
        <span
          className={`transition-colors ${
            isUrgent ? 'text-red-400 animate-pulse text-sm' : 'text-violet-300'
          }`}
        >
          ⏱️ {secondsDisplay}s
        </span>
        <span className="text-amber-400">
          +{pointsDisplay} pts
        </span>
      </div>

      <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10 p-0.5">
        <div
          ref={barRef}
          className={`h-full rounded-full ${
            isUrgent
              ? 'bg-gradient-to-r from-red-600 to-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'
              : 'bg-gradient-to-r from-violet-500 via-pink-500 to-indigo-500'
          }`}
          style={{ width: '100%', willChange: 'width' }}
        />
      </div>
    </div>
  )
}
