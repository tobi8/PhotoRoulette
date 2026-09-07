import React from 'react'
import { Volume2, VolumeX } from 'lucide-react'

interface SoundToggleProps {
  isMuted: boolean
  onToggle: () => void
  className?: string
}

export const SoundToggle: React.FC<SoundToggleProps> = ({
  isMuted,
  onToggle,
  className = '',
}) => {
  return (
    <button
      onClick={onToggle}
      className={`p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/15 text-gray-200 transition-all duration-150 cursor-pointer shadow-md ${className}`}
      title={isMuted ? 'Unmute game audio' : 'Mute game audio'}
      aria-label="Toggle Sound"
    >
      {isMuted ? <VolumeX size={20} className="text-red-400" /> : <Volume2 size={20} className="text-violet-400" />}
    </button>
  )
}
