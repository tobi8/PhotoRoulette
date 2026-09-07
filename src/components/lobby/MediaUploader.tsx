import React, { useRef, useState } from 'react'
import { Upload, Sparkles, ShieldCheck, ShieldAlert, Eye, Check, AlertCircle } from 'lucide-react'
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
    acceptedCount,
    excludedCount,
    getApprovedMedia,
  } = useDocumentFilter()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files)
      const { accepted } = await processFiles(filesArray)
      onMediaReady(accepted)
    }
  }

  const handleDemoLoad = async () => {
    await loadMockPhotosWithTestDocument()
    // Give state a tick to update
    setTimeout(() => {
      onMediaReady(getApprovedMedia())
    }, 100)
  }

  const handleConfirmReview = () => {
    setIsPreviewModalOpen(false)
    onMediaReady(getApprovedMedia())
  }

  return (
    <div className="w-full bg-[#171527] border border-white/10 rounded-3xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
        <div>
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <span>Contribute Photos</span>
            <span className="text-xl">📸</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Select 5 to 30 photos for the roulette pool
          </p>
        </div>

        {acceptedCount > 0 && (
          <Badge variant="success" size="md">
            {acceptedCount} In Pool
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

      {/* Upload Buttons */}
      {items.length === 0 && !isScanning && (
        <div className="space-y-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-violet-500/40 hover:border-violet-400 bg-violet-950/20 hover:bg-violet-950/30 rounded-2xl p-6 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-2.5"
          >
            <div className="p-3 bg-violet-600/30 rounded-full text-violet-300">
              <Upload size={24} />
            </div>
            <div>
              <div className="font-bold text-white text-sm">Tap to Select Camera Photos</div>
              <div className="text-xs text-gray-400 mt-0.5">
                Local AI filters out receipts, IDs & documents automatically
              </div>
            </div>
          </div>

          <div className="text-center">
            <span className="text-xs text-gray-500 font-medium">OR</span>
          </div>

          {/* Quick Demo Pack button */}
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleDemoLoad}
            className="border-violet-500/20 text-xs text-violet-200"
          >
            <Sparkles size={16} className="text-amber-400" />
            <span>Load Quick Demo Pack (Includes Simulated Receipt)</span>
          </Button>
        </div>
      )}

      {/* Uploaded state summary */}
      {items.length > 0 && !isScanning && (
        <div className="space-y-3">
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                <span>{acceptedCount} Photos Approved</span>
              </div>
              {excludedCount > 0 ? (
                <div className="text-xs text-amber-300 flex items-center gap-1.5 mt-0.5">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>{excludedCount} sensitive documents excluded</span>
                </div>
              ) : (
                <div className="text-xs text-gray-400 mt-0.5">
                  Privacy filter verified clean
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
              <Upload size={14} /> Add More
            </Button>
            <Button
              variant={isReady ? 'success' : 'primary'}
              size="md"
              className="flex-2"
              onClick={() => {
                onMediaReady(getApprovedMedia())
                onToggleReady()
              }}
            >
              <Check size={16} />
              {isReady ? "Ready! (Click to cancel)" : "I'm Ready in Lobby"}
            </Button>
          </div>
        </div>
      )}

      {/* Review Modal */}
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
