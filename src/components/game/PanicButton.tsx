import React from 'react'
import { ShieldAlert, Zap } from 'lucide-react'

interface PanicButtonProps {
  onPanicVeto: () => void
  disabled?: boolean
}

export const PanicButton: React.FC<PanicButtonProps> = ({
  onPanicVeto,
  disabled = false,
}) => {
  return (
    <div className="w-full animate-in fade-in zoom-in-95 duration-200">
      <button
        onClick={onPanicVeto}
        disabled={disabled}
        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white font-black text-sm sm:text-base tracking-wider uppercase shadow-xl shadow-red-900/60 border-2 border-red-400/80 flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 transition-all animate-panic"
      >
        <ShieldAlert size={22} className="animate-pulse text-white" />
        <span>🚨 THIS IS MY PHOTO — VETO / BURST!</span>
        <Zap size={18} className="text-yellow-300" />
      </button>
      <p className="text-[11px] text-center text-red-300/80 mt-1">
        Only you can see this button because you own this photo. Pressing it blanks the screen for everyone!
      </p>
    </div>
  )
}
