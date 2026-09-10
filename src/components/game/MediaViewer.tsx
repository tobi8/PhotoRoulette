import React, { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'

interface MediaViewerProps {
  media: {
    id: string
    type: 'image' | 'video'
    dataUrl: string
  }
  progressiveBlur?: boolean
  durationSec?: number
  isTimeUp?: boolean
  isHostTV?: boolean
  isMuted?: boolean
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  media,
  progressiveBlur = false,
  durationSec = 5,
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
      className={`relative w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black/95 border border-white/15 shadow-2xl flex items-center justify-center ${
        isHostTV ? 'h-[75vh] sm:h-[78vh] max-h-[880px]' : 'h-[36vh] sm:h-[40vh] md:h-[44vh] max-h-[440px]'
      }`}
    >
      {hasError ? (
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
      )}
    </div>
  )
}
