import React, { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, Share2 } from 'lucide-react'
import { Button } from '../ui/Button'

interface QRCodeDisplayProps {
  roomCode: string
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ roomCode }) => {
  const [copied, setCopied] = useState(false)

  // Construct URL with hash for instant join
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#${roomCode}`
    : `https://photoroulette.app/#${roomCode}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      // Fallback
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Photo Roulette game!',
          text: `Join Room ${roomCode} on Photo Roulette!`,
          url: joinUrl,
        })
      } catch (err) {}
    } else {
      handleCopy()
    }
  }

  return (
    <div className="flex flex-col items-center p-6 bg-[#171527] border border-violet-500/20 rounded-3xl shadow-2xl">
      <span className="text-xs font-bold tracking-widest text-violet-400 uppercase mb-1">
        ROOM CODE
      </span>

      {/* Big bold room code */}
      <div className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-pink-400 to-amber-300 tracking-wider mb-4 font-mono select-all">
        {roomCode}
      </div>

      {/* QR Code Container */}
      <div className="p-3 bg-white rounded-2xl shadow-xl mb-4">
        <QRCodeSVG
          value={joinUrl}
          size={180}
          level="M"
          includeMargin={false}
        />
      </div>

      <p className="text-xs text-gray-400 text-center max-w-[220px] mb-3">
        Scan with camera or share link with friends to join
      </p>

      {/* Action buttons */}
      <div className="flex gap-2 w-full max-w-[240px]">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1 text-xs"
          onClick={handleCopy}
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy Link'}
        </Button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button
            size="sm"
            variant="outline"
            className="p-2"
            onClick={handleShare}
            title="Share room link"
          >
            <Share2 size={15} />
          </Button>
        )}
      </div>
    </div>
  )
}
