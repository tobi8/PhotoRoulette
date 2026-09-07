import React, { useEffect, useRef, useState } from 'react'
import {
  Upload,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Check,
  Shuffle,
  Camera,
  RotateCw,
  X,
  PlayCircle,
  Database,
  Lock,
  Trash2,
  Sparkles,
  Plus,
  Folder,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { DocumentScanner } from '../ml/DocumentScanner'
import { ImagePreviewModal } from '../ml/ImagePreviewModal'
import { CloudImportModal } from './CloudImportModal'
import { useDocumentFilter } from '../../hooks/useDocumentFilter'
import { isNativeApp, queryNativeCameraRoll } from '../../services/nativeMediaService'
import {
  getVaultCount,
  savePhotosToVault,
  sampleRandomFromVault,
  getAllVaultPhotos,
  clearVault,
  fisherYatesShuffle,
} from '../../services/photoVaultService'
import { createFallbackPhotoCard } from '../../utils/imageCompression'

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
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false)
  const [vaultCount, setVaultCount] = useState<number>(0)
  const [isSecretMode, setIsSecretMode] = useState<boolean>(false)
  const [vaultMessage, setVaultMessage] = useState<string | null>(null)

  const {
    isScanning,
    progress,
    items,
    processFiles,
    loadExistingMedia,
    toggleExclude,
    removePhoto,
    loadMockPhotosWithTestDocument,
    rerollDeck,
    acceptedCount,
    excludedCount,
    getApprovedMedia,
  } = useDocumentFilter()


  // Check saved vault status on mount
  useEffect(() => {
    refreshVaultCount()
  }, [])

  const refreshVaultCount = async () => {
    const count = await getVaultCount()
    setVaultCount(count)
  }

  // Handle camera roll selection: supports 50–100 photos at once, saves to IndexedDB Vault, and samples 15
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let filesArray = Array.from(e.target.files)

      // Randomly shuffle all incoming files first using Fisher-Yates
      filesArray = fisherYatesShuffle(filesArray)

      // Support up to 100 photos in one upload batch
      if (filesArray.length > 100) {
        filesArray = filesArray.slice(0, 100)
      }

      // Process and filter files (downscaling + document heuristics + safety filter)
      const { accepted } = await processFiles(filesArray)

      if (accepted.length > 0) {
        // Automatically save all clean accepted photos into device's persistent IndexedDB vault
        await savePhotosToVault(
          accepted.map((m) => ({
            id: m.id,
            type: m.type,
            dataUrl: m.dataUrl,
          }))
        )
        const updatedCount = await getVaultCount()
        setVaultCount(updatedCount)

        // Sample 15 for the current active game using Fisher-Yates
        const activeSample = await sampleRandomFromVault(15)
        loadExistingMedia(activeSample)

        const mapped = activeSample.map((s) => ({
          id: s.id,
          ownerId: '',
          ownerName: '',
          type: s.type,
          dataUrl: s.dataUrl,
        }))
        onMediaReady(mapped)

        // Automatically mark ready
        if (!isReady) {
          onToggleReady()
        }

        setVaultMessage(`🎉 ${accepted.length} photos saved to your Vault! Total pool: ${updatedCount} photos.`)
        setTimeout(() => setVaultMessage(null), 4500)
      }
    }
  }

  // Handle folder import (local folder, Google Drive synced folder, iCloud)
  const handleImportFolderFiles = async (files: File[]) => {
    let filesArray = fisherYatesShuffle(files)
    if (filesArray.length > 100) {
      filesArray = filesArray.slice(0, 100)
    }

    const { accepted } = await processFiles(filesArray)
    if (accepted.length > 0) {
      await savePhotosToVault(
        accepted.map((m) => ({
          id: m.id,
          type: m.type,
          dataUrl: m.dataUrl,
        }))
      )
      const updatedCount = await getVaultCount()
      setVaultCount(updatedCount)

      const activeSample = await sampleRandomFromVault(15)
      loadExistingMedia(activeSample)

      const mapped = activeSample.map((s) => ({
        id: s.id,
        ownerId: '',
        ownerName: '',
        type: s.type,
        dataUrl: s.dataUrl,
      }))
      onMediaReady(mapped)

      if (!isReady) {
        onToggleReady()
      }

      setVaultMessage(`🎉 ${accepted.length} photos imported from folder & saved to Vault! Total pool: ${updatedCount}`)
      setTimeout(() => setVaultMessage(null), 4500)
    }
  }


  // 1-Tap Mystery Roll from persistent IndexedDB Vault
  const handleRollFromVault = async () => {
    const sampled = await sampleRandomFromVault(15)
    if (sampled.length > 0) {
      loadExistingMedia(sampled)
      const mapped = sampled.map((s) => ({
        id: s.id,
        ownerId: '',
        ownerName: '',
        type: s.type,
        dataUrl: s.dataUrl,
      }))
      onMediaReady(mapped)
      if (!isReady) {
        onToggleReady()
      }
      setVaultMessage(`🎲 Rolled 15 Mystery Photos from your ${vaultCount} saved photos!`)
      setTimeout(() => setVaultMessage(null), 3000)
    }
  }

  // Clear local device vault
  const handleClearVault = async () => {
    if (window.confirm('Delete all saved photos from this device? You can upload a new batch anytime.')) {
      await clearVault()
      await refreshVaultCount()
      setVaultMessage('Photo Vault cleared successfully.')
      setTimeout(() => setVaultMessage(null), 3000)
    }
  }

  // 1-Tap Instant Auto-Roll (Demo / Mock)
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

  // Reroll photos in roulette pool
  const handleReroll = async () => {
    if (vaultCount >= 15) {
      // Re-sample 15 random photos from the vault pool
      const freshSample = await sampleRandomFromVault(15)
      loadExistingMedia(freshSample)
      const mapped = freshSample.map((s) => ({
        id: s.id,
        ownerId: '',
        ownerName: '',
        type: s.type,
        dataUrl: s.dataUrl,
      }))
      onMediaReady(mapped)
    } else {
      rerollDeck()
      setTimeout(() => {
        onMediaReady(getApprovedMedia())
      }, 50)
    }
  }

  const handleRemoveSingle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removePhoto(id)

    // If there are more photos in the vault, immediately draw a replacement so player still has a full deck
    if (vaultCount > items.length) {
      const allPhotos = await getAllVaultPhotos()
      const currentIds = new Set(items.map((i) => i.id))
      const available = allPhotos.filter((p) => !currentIds.has(p.id) && p.id !== id)
      if (available.length > 0) {
        const replacement = available[Math.floor(Math.random() * available.length)]
        const remaining = items.filter((i) => i.id !== id)
        loadExistingMedia([...remaining, replacement])
        setTimeout(() => {
          onMediaReady(getApprovedMedia())
        }, 50)
        return
      }
    }

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

  const handleCameraRollClick = async () => {
    if (isNativeApp()) {
      const nativeMedia = await queryNativeCameraRoll(15)
      if (nativeMedia.length > 0) {
        const mapped = nativeMedia.map((m) => ({
          id: m.id,
          type: m.type,
          dataUrl: m.dataUrl,
        }))
        onMediaReady(mapped)
        if (!isReady) onToggleReady()
        return
      }
    }
    fileInputRef.current?.click()
  }

  return (
    <div className="w-full bg-[#171527] border border-white/10 rounded-3xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <span>Persistent Photo Vault</span>
            <span className="text-xl">💾</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Upload once • 100% private in browser storage • 1-tap play forever
          </p>
        </div>

        {vaultCount > 0 && (
          <Badge variant="success" size="md">
            💾 {vaultCount} in Vault
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

      {/* Temporary vault notification */}
      {vaultMessage && (
        <div className="p-2.5 rounded-xl bg-violet-950/80 border border-violet-500/50 text-xs text-violet-200 flex items-center gap-2 animate-in fade-in duration-300">
          <Sparkles size={16} className="text-amber-400 shrink-0" />
          <span>{vaultMessage}</span>
        </div>
      )}

      {/* Active Scanning Bar */}
      <DocumentScanner progress={progress} isScanning={isScanning} />

      {/* Initial state: No deck loaded yet */}
      {items.length === 0 && !isScanning && (
        <div className="space-y-3">
          {/* PERSISTENT VAULT CARD: If user previously saved photos */}
          {vaultCount > 0 ? (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-teal-950/50 to-slate-900/60 border border-emerald-500/40 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 text-lg shadow-inner">
                    💾
                  </div>
                  <div>
                    <div className="text-sm font-black text-white flex items-center gap-2">
                      <span>Saved Photo Vault</span>
                      <span className="px-2 py-0.5 text-xs bg-emerald-500/25 text-emerald-300 rounded-full font-mono font-bold border border-emerald-500/30">
                        {vaultCount} Photos
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-200/70">
                      Saved safely on this device • Zero upload delay
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleClearVault}
                  className="text-gray-400 hover:text-red-400 p-2 rounded-xl hover:bg-white/5 transition-colors"
                  title="Clear saved vault"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* 1-Tap Mystery Roll Button */}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleRollFromVault}
                className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-teal-500 text-sm py-3.5 font-black shadow-lg shadow-emerald-950/60 active:scale-98"
              >
                <Sparkles size={18} className="text-amber-300 animate-pulse" />
                <span>⚡ Roll 15 Mystery Photos</span>
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-white/10 text-xs py-2 text-gray-300 hover:text-white"
                >
                  <Plus size={14} /> Add Photos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCloudModalOpen(true)}
                  className="border-violet-500/30 bg-violet-950/20 text-xs py-2 text-violet-300 hover:text-violet-200 hover:border-violet-500/50"
                >
                  <Folder size={14} /> Drive / Folder
                </Button>
              </div>
            </div>
          ) : (
            /* First Time Setup: Upload 50-100 Photos into Vault */
            <div className="space-y-2">
              <button
                onClick={handleCameraRollClick}
                className="w-full p-6 rounded-2xl bg-gradient-to-br from-violet-900/40 via-purple-900/30 to-indigo-900/40 hover:from-violet-900/60 hover:to-indigo-900/60 border-2 border-dashed border-violet-400/50 hover:border-violet-300 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer shadow-lg shadow-violet-950/40 active:scale-98"
              >
                <div className="w-14 h-14 rounded-2xl bg-violet-600/40 flex items-center justify-center text-violet-200 border border-violet-400/40 shadow-inner">
                  <Camera size={28} className="animate-pulse" />
                </div>
                <div className="text-center">
                  <div className="font-black text-white text-base">
                    📱 Select 50–100 Photos (Upload Once)
                  </div>
                  <div className="text-xs text-violet-300/80 mt-1 max-w-xs">
                    Swipe-select photos once. Stored locally in your browser's Photo Vault for instant 1-tap play forever!
                  </div>
                </div>
              </button>

              <Button
                variant="outline"
                size="md"
                fullWidth
                onClick={() => setIsCloudModalOpen(true)}
                className="border-violet-500/30 bg-violet-950/30 text-xs text-violet-200 py-3 hover:bg-violet-900/40 font-bold"
              >
                <Folder size={16} className="text-violet-400" />
                <span>📂 Import from Google Drive or Folder</span>
              </Button>
            </div>
          )}


          <div className="flex items-center gap-2">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-[10px] text-gray-500 font-bold uppercase">OR</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          {/* Instant 1-tap auto roll (demo mode) */}
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleInstantAutoRoll}
            className="border-violet-500/30 text-xs text-violet-200 py-3"
          >
            <Shuffle size={16} className="text-amber-400" />
            <span>⚡ Instant Demo Memories (Try Game Now)</span>
          </Button>
        </div>
      )}

      {/* Once loaded: Shows SECRET MYSTERY DECK preview, auto-ready status, and review option */}
      {items.length > 0 && !isScanning && (
        <div className="space-y-3">
          {/* Deck Preview Carousel with Clear Visual Previews Beforehand */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-300 font-bold mb-1.5 px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-violet-300 font-black">
                  📸 Selected Photos ({approvedItems.length})
                </span>
                <span className="text-[10px] text-gray-400 font-normal">
                  (tap to enlarge)
                </span>
              </div>
              <button
                onClick={() => setIsSecretMode(!isSecretMode)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
                  isSecretMode
                    ? 'bg-violet-900/60 border-violet-400/50 text-violet-200 hover:bg-violet-800/60'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {isSecretMode ? (
                  <>
                    <Eye size={12} className="text-amber-400" />
                    <span>Show Photos</span>
                  </>
                ) : (
                  <>
                    <EyeOff size={12} className="text-violet-400" />
                    <span>Blindfold Mode</span>
                  </>
                )}
              </button>
            </div>

            {/* Horizontal thumbnail scroller */}
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {approvedItems.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => setIsPreviewModalOpen(true)}
                  className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-white/20 group bg-slate-900 shadow-md cursor-pointer hover:border-violet-400 transition-all active:scale-95"
                  title="Click to inspect beforehand"
                >
                  <img
                    src={item.previewUrl || item.dataUrl}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.src = createFallbackPhotoCard(`Photo #${idx + 1}`)
                    }}
                    className={`w-full h-full object-cover transition-all duration-300 ${
                      isSecretMode
                        ? 'blur-md brightness-50 contrast-125 scale-110'
                        : 'blur-none brightness-100 group-hover:scale-105'
                    }`}
                  />

                  {/* Secret Mode Mystery Overlay */}
                  {isSecretMode && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-violet-950/40 text-violet-200 font-black text-xs pointer-events-none">
                      <span className="text-sm">🎲</span>
                      <span className="text-[10px] text-white/70 font-mono">#{idx + 1}</span>
                    </div>
                  )}

                  {!isSecretMode && item.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                      <PlayCircle size={18} className="text-white drop-shadow" />
                    </div>
                  )}

                  {/* Single Photo Veto / Remove button */}
                  <button
                    onClick={(e) => handleRemoveSingle(item.id, e)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center text-xs transition-colors cursor-pointer shadow-md"
                    title="Veto photo (swap with another)"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

          </div>

          {/* Reroll & Review Buttons */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              className="flex-1 text-xs border-violet-500/30 text-violet-200 font-bold bg-violet-950/30 hover:bg-violet-900/40"
              onClick={() => setIsPreviewModalOpen(true)}
            >
              <Eye size={15} className="text-violet-400" />
              <span>🔍 Inspect Photos ({approvedItems.length})</span>
            </Button>

            <Button
              variant="outline"
              size="md"
              className="flex-1 text-xs border-amber-500/30 text-amber-200 hover:bg-amber-950/20"
              onClick={handleReroll}
            >
              <RotateCw size={14} className="text-amber-400" />
              <span>🎲 Reroll 15 Photos</span>
            </Button>
          </div>

          {/* Privacy summary - Automatic AI document filtering */}
          {excludedCount > 0 ? (
            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="shrink-0" />
                <span>
                  {excludedCount} document{excludedCount > 1 ? 's' : ''}/receipt{excludedCount > 1 ? 's' : ''} automatically filtered out.
                </span>
              </div>
              <button
                onClick={() => setIsPreviewModalOpen(true)}
                className="text-[11px] underline font-bold hover:text-white shrink-0 cursor-pointer"
              >
                Review & Restore
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-xs text-gray-300 flex items-center gap-2">
              <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
              <span>All photos verified safe. Documents & receipts automatically filtered out.</span>
            </div>
          )}

          {/* Ready & Upload More Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs shrink-0"
              onClick={() => fileInputRef.current?.click()}
              title="Add more photos from camera roll"
            >
              <Upload size={14} /> Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs shrink-0 text-violet-300 border-violet-500/30 hover:border-violet-400"
              onClick={() => setIsCloudModalOpen(true)}
              title="Import photos from folder or Google Drive"
            >
              <Folder size={14} /> Drive / Folder
            </Button>
            <Button
              variant={isReady ? 'success' : 'primary'}
              size="md"
              className="flex-1 text-xs font-bold"
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

      {/* Cloud & Drive Import Modal */}
      <CloudImportModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        onImportFiles={handleImportFolderFiles}
      />
    </div>
  )
}
