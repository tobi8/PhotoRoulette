import React, { useEffect, useRef, useState } from 'react'
import { ShieldAlert, AlertTriangle, Film, ImageOff } from 'lucide-react'

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
  isTimeUp = false,
  isHostTV = false,
  isMuted = false,
}) => {
  const [blurAmount, setBlurAmount] = useState(progressiveBlur ? 24 : 0)
  const [hasError, setHasError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setHasError(false)
  }, [media.id, media.dataUrl])

  // Manage video playback: automatically pauses when time expires, vetoed, or reaches 10s
  useEffect(() => {
    if (media.type === 'video' && videoRef.current) {
      if (isTimeUp || isVetoed) {
        videoRef.current.pause()
      } else {
        videoRef.current.currentTime = 0
        videoRef.current.muted = isMuted
        videoRef.current.play().catch(() => {
          // Guaranteed fallback if browser requires muted autoplay
          if (videoRef.current) {
            videoRef.current.muted = true
            videoRef.current.play().catch(() => {})
          }
        })
      }
    }
  }, [media.type, isTimeUp, isVetoed, media.id, isMuted])

  // Sync mute dynamically when user toggles global sound during video playback
  useEffect(() => {
    if (media.type === 'video' && videoRef.current) {
      videoRef.current.muted = isMuted
    }
  }, [isMuted, media.type])

  const handleTimeUpdate = () => {
    // Strictly cap playback at 10 seconds max
    if (videoRef.current && videoRef.current.currentTime >= 10) {
      videoRef.current.pause()
    }
  }

  // Progressive blur animation
  useEffect(() => {
    if (!progressiveBlur) {
      setBlurAmount(0)
      return
    }

    const start = Date.now()
    const totalMs = durationSec * 1000

    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const factor = Math.min(1, elapsed / (totalMs * 0.85))
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
        ) : media.type === 'video' ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={media.dataUrl}
              autoPlay
              playsInline
              muted={isMuted}
              onError={() => setHasError(true)}
              onTimeUpdate={handleTimeUpdate}
              className="w-full h-full object-contain"
              style={{
                filter: `blur(${blurAmount}px)`,
                transition: 'filter 0.08s linear',
              }}
            />

            {/* Video Badge */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white/90 text-xs font-semibold shadow-lg pointer-events-none z-10">
              <Film size={12} className="text-violet-400" />
              <span>Video (Max 10s)</span>
            </div>
          </div>
        ) : (
          <img
            src={media.dataUrl}
            alt="Roulette Photo"
            onError={() => setHasError(true)}
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
