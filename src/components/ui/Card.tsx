import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  glow?: 'purple' | 'pink' | 'amber' | 'none'
  onClick?: () => void
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  glow = 'none',
  onClick,
}) => {
  const glowClasses = {
    purple: 'border-violet-500/30 shadow-[0_0_25px_-5px_rgba(139,92,246,0.3)]',
    pink: 'border-pink-500/30 shadow-[0_0_25px_-5px_rgba(236,72,153,0.3)]',
    amber: 'border-amber-500/30 shadow-[0_0_25px_-5px_rgba(245,158,11,0.3)]',
    none: 'border-white/10 shadow-xl',
  }

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-3xl bg-[#171527]/85 backdrop-blur-xl border
        p-5 transition-all duration-200
        ${glowClasses[glow]}
        ${onClick ? 'cursor-pointer hover:border-white/30 active:scale-[0.99]' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
