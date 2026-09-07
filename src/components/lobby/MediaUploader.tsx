import React, { useRef, useState } from 'react'
import {
  Upload,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Check,
  Shuffle,
  Camera,
  RotateCw,
  X,
  PlayCircle,
} from 'lucide-react'
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

  const {
    isScanning,
    progress,
    items,
    processFiles,
    toggleExclude,
    removePhoto,
    loadMockPhotosWithTestDocument,
    rerollDeck,
    acceptedCount,
    excludedCount,
    getApprovedMedia,
  } = useDocumentFilter()

  // Handle camera roll selection: automatically pick random subset, filter, and mark ready!
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let filesArray = Array.from(e.target.files)

      // Automatically sample a random subset of up to 15-20 photos/videos
      if (filesArray.length > 15) {
        filesArray = filesArray.sort(() => Math.random() - 0.5).slice(0, 15)
      }

      const { accepted } = await processFiles(filesArray)
      onMediaReady(accepted)

      // Automatically mark ready
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
      onMediaReady(approved)
      if (!isReady) {
        onToggleReady()
      }
    }, 150)
  }

  // Reroll photos in roulette pool (like in the real Photo Roulette)
  const handleReroll = () => {
    rerollDeck()
    setTimeout(() => {
      onMediaReady(getApprovedMedia())
    }, 50)
  }

  const handleRemoveSingle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removePhoto(id)
    setTimeout(() => {
      onMediaReady(getApprovedMedia())
    }, 50)
  }

  const handleConfirmReview = () => {
    setIsPreviewModalOpen(false)
    const approved = getApprovedMedia()
    onMediaReady(approved)
  }

  const approvedItems = items.filter((i) => !i.isExcluded)

  return (
    <div className="w-full bg-[#171527] border border-white/10 rounded-3xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <span>Camera Roll Roulette</span>
            <span className="text-xl">📸</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Auto-selects photos & videos • AI drops sensitive documents
          </p>
        </div>

        {acceptedCount > 0 && (
          <Badge variant="success" size="md">
            {acceptedCount} In Deck
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
                Select your photos/videos — the app automatically samples 15 random items and drops private documents!
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
            <span>⚡ 1-Tap Instant Auto-Roll (Pre-Loaded Memories)</span>
          </Button>
        </div>
      )}

      {/* Once loaded: Shows REROLL deck preview, auto-ready status, and review option */}
      {items.length > 0 && !isScanning && (
        <div className="space-y-3">
          {/* Real Photo Roulette Deck Preview Carousel */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-300 font-bold mb-1.5 px-1">
              <span>YOUR ROULETTE POOL ({approvedItems.length})</span>
              <span className="text-[11px] text-gray-400">Tap ✕ to remove sensitive items</span>
            </div>

            {/* Horizontal thumbnail scroller */}
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {approvedItems.map((item) => (
                <div
                  key={item.id}
                  className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-white/20 group bg-black/60"
                >
                  <img
                    src={item.previewUrl || item.dataUrl}
                    alt="Deck photo"
                    className="w-full h-full object-cover"
                  />
                  {item.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                      <PlayCircle size={18} className="text-white drop-shadow" />
                    </div>
                  )}
                  {/* Single Photo Remove */}
                  <button
                    onClick={(e) => handleRemoveSingle(item.id, e)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                    title="Remove this photo from game"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Reroll Button (Real Photo Roulette Style) */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              className="flex-1 text-xs border-amber-500/30 text-amber-200"
              onClick={handleReroll}
            >
              <RotateCw size={14} className="text-amber-400" />
              <span>🎲 Reroll Photos</span>
            </Button>

            <Button
              size="md"
              variant="outline"
              onClick={() => setIsPreviewModalOpen(true)}
              className="text-xs"
            >
              <Eye size={14} />
              <span>Review ({excludedCount} filtered)</span>
            </Button>
          </div>

          {/* Privacy summary */}
          {excludedCount > 0 ? (
            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
              <ShieldAlert size={16} className="shrink-0" />
              <span>
                {excludedCount} receipts/documents were automatically excluded for privacy.
              </span>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <ShieldCheck size={16} className="shrink-0" />
              <span>Privacy filter verified: all photos look safe to share!</span>
            </div>
          )}

          {/* Ready & Upload More Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} /> Add More
            </Button>
            <Button
              variant={isReady ? 'success' : 'primary'}
              size="md"
              className="flex-2 text-xs"
              onClick={onToggleReady}
            >
              <Check size={16} />
              {isReady ? 'Ready in Lobby (Tap to Cancel)' : "I'm Ready"}
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
