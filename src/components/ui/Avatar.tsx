import React from 'react'

interface AvatarProps {
  avatar: string
  color: string
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  isReady?: boolean
  showReadyStatus?: boolean
  className?: string
}

export const Avatar: React.FC<AvatarProps> = ({
  avatar,
  color,
  size = 'md',
  isReady = false,
  showReadyStatus = false,
  className = '',
}) => {
  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-base',
    md: 'w-12 h-12 text-2xl',
    lg: 'w-16 h-16 text-3xl',
    xl: 'w-24 h-24 text-5xl',
  }

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center shadow-md font-bold select-none border-2 border-white/20`}
        style={{ backgroundColor: color }}
      >
        <span>{avatar}</span>
      </div>
      {showReadyStatus && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0d0b18] ${
            isReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
          }`}
          title={isReady ? 'Ready' : 'Not ready'}
        />
      )}
    </div>
  )
}
