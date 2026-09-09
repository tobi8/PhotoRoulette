import React, { useEffect, useState } from 'react'
import { ShieldAlert, AlertTriangle, ImageOff } from 'lucide-react'

interface MediaViewerProps {
  media: {
    id: string
    type: 'image' | 'video'
    dataUrl: string
  }
  progressiveBlur?: boolean
  durationSec?: number
  isVetoed?: boolean
  isTimeUp?: boolean
  isHostTV?: boolean
  isMuted?: boolean
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  media,
  progressiveBlur = false,
  durationSec = 5,
  isVetoed = false,
  isHostTV = false,
}) => {
  const [blurAmount, setBlurAmount] = useState(progressiveBlur ? 24 : 0)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [media.id, media.dataUrl])

  useEffect(() => {
    if (!progressiveBlur) {
      setBlurAmount(0)
      return
    }

    setBlurAmount(24)
    const timer = setTimeout(() => {
      setBlurAmount(0)
    }, 50)

    return () => clearTimeout(timer)
  }, [progressiveBlur, media.id])

  return (
    <div
      className={`relative w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black/90 border border-white/15 shadow-2xl flex items-center justify-center ${
        isHostTV ? 'h-[55vh] max-h-[600px]' : 'h-[26vh] sm:h-[34vh] max-h-[280px]'
      }`}
    >
      {!isVetoed ? (
        hasError ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-violet-950/80 via-purple-900/60 to-indigo-950/80 text-white">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-3 backdrop-blur-md border border-white/20 shadow-inner">
              <ImageOff size={32} className="text-violet-300" />
            </div>
            <p className="font-bold text-base text-white">Party Media</p>
            <p className="text-xs text-violet-300/80 mt-1 max-w-xs">
              Who took this mysterious shot? Cast your guess!
            </p>
          </div>
        ) : (
          <img
            src={media.dataUrl}
            alt="Roulette Photo"
            onError={() => setHasError(true)}
            className="w-full h-full object-contain select-none pointer-events-none"
            style={{
              filter: `blur(${blurAmount}px)`,
              transition: `filter ${durationSec * 0.85}s cubic-bezier(0.2, 0.8, 0.2, 1)`,
            }}
          />
        )
      ) : null}

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
