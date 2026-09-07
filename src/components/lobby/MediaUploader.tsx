import React, { useRef, useState } from 'react'
import { Upload, Sparkles, ShieldCheck, ShieldAlert, Eye, Check, Shuffle, Camera } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { DocumentScanner } from '../ml/DocumentScanner'
import { ImagePreviewModal } from '../ml/ImagePreviewModal'
import { useDocumentFilter } from '../../hooks/useDocumentFilter'

interface MediaUploaderProps {
  onMediaReady: (mediaItems: Array<{ id: string; type: 'image' | 'video'; dataUrl: string }>) => void
  isReady: boolean
  onToggleReady: () => void
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  onMediaReady,
  isReady,
  onToggleReady,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [autoSelectedCount, setAutoSelectedCount] = useState<number>(0)

  const {
    isScanning,
    progress,
    items,
    processFiles,
    toggleExclude,
    removePhoto,
    loadMockPhotosWithTestDocument,
    acceptedCount,
    excludedCount,
    getApprovedMedia,
  } = useDocumentFilter()

  // Handle camera roll selection: automatically pick random 15-20 items, filter, and mark ready!
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let filesArray = Array.from(e.target.files)

      // Automatically sample a random subset of up to 15-20 photos/videos
      if (filesArray.length > 15) {
        filesArray = filesArray.sort(() => Math.random() - 0.5).slice(0, 15)
      }

      setAutoSelectedCount(filesArray.length)

      const { accepted } = await processFiles(filesArray)
      onMediaReady(accepted)

      // Automatically mark ready without requiring manual click!
      if (!isReady && accepted.length > 0) {
        onToggleReady()
      }
    }
  }

  // 1-Tap Instant Auto-Roll
  const handleInstantAutoRoll = async () => {
    await loadMockPhotosWithTestDocument()
    setTimeout(() => {
      const approved = getApprovedMedia()
      setAutoSelectedCount(approved.length)
      onMediaReady(approved)
      if (!isReady) {
        onToggleReady()
      }
    }, 150)
  }

  const handleConfirmReview = () => {
    setIsPreviewModalOpen(false)
    const approved = getApprovedMedia()
    onMediaReady(approved)
  }

  return (
    <div className="w-full bg-[#171527] border border-white/10 rounded-3xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <span>Camera Roll Roulette</span>
            <span className="text-xl">📸</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Auto-selects photos & videos • AI filters documents
          </p>
        </div>

        {acceptedCount > 0 && (
          <Badge variant="success" size="md">
            {acceptedCount} Auto-Selected
          </Badge>
        )}
      </div>

      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Active Scanning Bar */}
      <DocumentScanner progress={progress} isScanning={isScanning} />

      {/* Initial state: Tap to open Camera Roll with automatic selection */}
      {items.length === 0 && !isScanning && (
        <div className="space-y-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-6 rounded-2xl bg-gradient-to-br from-violet-900/40 via-purple-900/30 to-indigo-900/40 hover:from-violet-900/60 hover:to-indigo-900/60 border-2 border-dashed border-violet-400/50 hover:border-violet-300 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer shadow-lg shadow-violet-950/40 active:scale-98"
          >
            <div className="w-14 h-14 rounded-2xl bg-violet-600/40 flex items-center justify-center text-violet-200 border border-violet-400/40 shadow-inner">
              <Camera size={28} className="animate-pulse" />
            </div>
            <div className="text-center">
              <div className="font-black text-white text-base">
                📱 Auto-Select from Camera Roll
              </div>
              <div className="text-xs text-violet-300/80 mt-1 max-w-xs">
                Tap to grant access — the app will automatically pick 15 random photos & videos from your gallery!
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-[10px] text-gray-500 font-bold uppercase">OR</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          {/* Instant 1-tap auto roll */}
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleInstantAutoRoll}
            className="border-violet-500/30 text-xs text-violet-200 py-3"
          >
            <Shuffle size={16} className="text-amber-400" />
            <span>⚡ 1-Tap Instant Auto-Roll (Pre-Loaded Camera Roll)</span>
          </Button>
        </div>
      )}

      {/* Once loaded: Shows summary, auto-ready status, and review option */}
      {items.length > 0 && !isScanning && (
        <div className="space-y-3">
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                <span>{acceptedCount} Photos/Videos In Game</span>
              </div>
              {excludedCount > 0 ? (
                <div className="text-xs text-amber-300 flex items-center gap-1.5 mt-0.5">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>{excludedCount} receipts/documents automatically dropped</span>
                </div>
              ) : (
                <div className="text-xs text-gray-400 mt-0.5">
                  Camera roll automatically shuffled & verified safe
                </div>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPreviewModalOpen(true)}
              className="text-xs shrink-0"
            >
              <Eye size={14} /> Review
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} /> Change Photos
            </Button>
            <Button
              variant={isReady ? 'success' : 'primary'}
              size="md"
              className="flex-2"
              onClick={onToggleReady}
            >
              <Check size={16} />
              {isReady ? 'Ready in Lobby (Click to Unready)' : "I'm Ready"}
            </Button>
          </div>
        </div>
      )}

      {/* Review & Exclusion Modal */}
      <ImagePreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        items={items}
        onToggleExclude={toggleExclude}
        onRemovePhoto={removePhoto}
        onConfirm={handleConfirmReview}
      />
    </div>
  )
}
