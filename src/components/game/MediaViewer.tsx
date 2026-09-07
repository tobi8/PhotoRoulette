import React, { useEffect, useState } from 'react'
import { ShieldAlert, AlertTriangle } from 'lucide-react'

interface MediaViewerProps {
  media: {
    id: string
    type: 'image' | 'video'
    dataUrl: string
  }
  progressiveBlur?: boolean
  durationSec?: number
  isVetoed?: boolean
  isHostTV?: boolean
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  media,
  progressiveBlur = false,
  durationSec = 5,
  isVetoed = false,
  isHostTV = false,
}) => {
  const [blurAmount, setBlurAmount] = useState(progressiveBlur ? 24 : 0)

  useEffect(() => {
    if (!progressiveBlur) {
      setBlurAmount(0)
      return
    }

    // Progressively reduce blur from 24px to 0px
    const start = Date.now()
    const totalMs = durationSec * 1000

    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const factor = Math.min(1, elapsed / (totalMs * 0.85)) // reach full clarity at 85% time
      const currentBlur = Math.max(0, 24 * (1 - factor))
      setBlurAmount(currentBlur)

      if (factor >= 1) {
        clearInterval(interval)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [progressiveBlur, durationSec, media.id])

  return (
    <div
      className={`relative w-full rounded-3xl overflow-hidden bg-black/90 border border-white/15 shadow-2xl flex items-center justify-center ${
        isHostTV ? 'h-[55vh] max-h-[600px]' : 'h-[36vh] max-h-[320px]'
      }`}
    >
      {/* Active Media */}
      {!isVetoed ? (
        media.type === 'video' ? (
          <video
            src={media.dataUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-contain"
            style={{
              filter: `blur(${blurAmount}px)`,
              transition: 'filter 0.08s linear',
            }}
          />
        ) : (
          <img
            src={media.dataUrl}
            alt="Roulette Photo"
            className="w-full h-full object-contain select-none pointer-events-none"
            style={{
              filter: `blur(${blurAmount}px)`,
              transition: 'filter 0.08s linear',
            }}
          />
        )
      ) : null}

      {/* Veto / Censored Overlay */}
      {isVetoed && (
        <div className="absolute inset-0 bg-red-950/95 border-4 border-red-600 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-150 z-20">
          <div className="p-4 bg-red-600 rounded-full text-white mb-3 animate-bounce shadow-2xl shadow-red-500">
            <ShieldAlert size={48} />
          </div>

          <div className="text-3xl sm:text-4xl font-black text-white tracking-widest uppercase mb-1 drop-shadow-md">
            CENSORED BY OWNER!
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/50 border border-red-500/40 text-red-200 text-xs sm:text-sm font-semibold mb-2">
            <AlertTriangle size={14} />
            <span>EMERGENCY VETO TRIGGERED</span>
          </div>

          <p className="text-xs sm:text-sm text-red-300/90 max-w-sm">
            The owner invoked privacy veto! 0 points awarded this round.
          </p>

          {/* Hazard diagonal stripes bottom bar */}
          <div
            className="absolute bottom-0 left-0 right-0 h-4 bg-repeat-x opacity-70"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, #ef4444, #ef4444 15px, #000 15px, #000 30px)',
            }}
          />
        </div>
      )}
    </div>
  )
}
