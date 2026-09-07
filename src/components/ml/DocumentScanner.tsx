import React from 'react'
import { ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react'
import { ScanProgress } from '../../hooks/useDocumentFilter'

interface DocumentScannerProps {
  progress: ScanProgress
  isScanning: boolean
}

export const DocumentScanner: React.FC<DocumentScannerProps> = ({
  progress,
  isScanning,
}) => {
  if (!isScanning) return null

  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="w-full bg-[#1e1b38] border border-violet-500/30 rounded-2xl p-4 shadow-xl mb-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-violet-300 font-semibold text-sm">
          <Sparkles size={18} className="animate-spin text-violet-400" />
          <span>Document & Receipt Privacy Scanner</span>
        </div>
        <span className="text-xs text-gray-400 font-mono">
          {progress.current} / {progress.total} ({percent}%)
        </span>
      </div>

      {/* Animated progress bar */}
      <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-violet-500 via-pink-500 to-amber-400 transition-all duration-200 rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="truncate">{progress.status}</span>
        <span className="shrink-0 text-violet-300/80">Checking for receipts & documents</span>
      </div>
    </div>
  )
}
