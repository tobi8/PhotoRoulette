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
  clearVault,
  fisherYatesShuffle,
} from '../../services/photoVaultService'

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
  const [isSecretMode, setIsSecretMode] = useState<boolean>(true)
  const [vaultMessage, setVaultMessage] = useState<string | null>(null)

  const {
    isScanning,
    progress,
    items,
    processFiles,
    processUrls,
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

  // Handle Google Drive links / cloud image URLs import
  const handleImportUrls = async (urlItems: Array<{ id: string; url: string; name?: string }>) => {
    const accepted = await processUrls(urlItems)
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

      setVaultMessage(`🎉 ${accepted.length} cloud photos imported & saved to Vault! Total pool: ${updatedCount}`)
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

          {/* Quick iOS Swipe Tip */}
          <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[11px] text-gray-400 text-center leading-relaxed">
            💡 <strong className="text-violet-300">iPhone Pro-Tip:</strong> In Apple Photos, tap <span className="text-white">"Select"</span> and slide your finger across rows to grab 50+ photos in 2 seconds!
          </div>

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
          {/* Deck Preview Carousel with Secret Blind Mode */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-300 font-bold mb-1.5 px-1">
              <div className="flex items-center gap-1.5">
                {isSecretMode ? (
                  <>
                    <Lock size={13} className="text-violet-400" />
                    <span className="text-violet-300">SECRET MYSTERY DECK ({approvedItems.length})</span>
                  </>
                ) : (
                  <>
                    <Eye size={13} className="text-amber-400" />
                    <span>UNMASKED DECK ({approvedItems.length})</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setIsSecretMode(!isSecretMode)}
                className="text-[11px] text-violet-400 hover:text-violet-200 flex items-center gap-1 cursor-pointer font-medium"
              >
                {isSecretMode ? (
                  <>
                    <Eye size={12} /> Peek to Veto
                  </>
                ) : (
                  <>
                    <EyeOff size={12} /> Hide for Surprise
                  </>
                )}
              </button>
            </div>

            {/* Horizontal thumbnail scroller */}
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {approvedItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-white/20 group bg-black/60 shadow-md"
                >
                  <img
                    src={item.previewUrl || item.dataUrl}
                    alt="Deck photo"
                    className={`w-full h-full object-cover transition-all duration-300 ${
                      isSecretMode
                        ? 'blur-md brightness-50 contrast-125 scale-110'
                        : 'blur-none brightness-100'
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

                  {/* Single Photo Remove (Available in peek mode) */}
                  {!isSecretMode && (
                    <button
                      onClick={(e) => handleRemoveSingle(item.id, e)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                      title="Remove this photo from game"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isSecretMode && (
              <p className="text-[11px] text-violet-300/70 italic px-1 pt-0.5">
                🤫 Photos are secretly scrambled to keep rounds a total surprise!
              </p>
            )}
          </div>

          {/* Reroll & Review Buttons */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              className="flex-1 text-xs border-amber-500/30 text-amber-200"
              onClick={handleReroll}
            >
              <RotateCw size={14} className="text-amber-400" />
              <span>🎲 Reroll 15 Photos</span>
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
              <span>
                {vaultCount > 0
                  ? `Active deck ready from your ${vaultCount} saved Vault photos!`
                  : 'Privacy filter verified: all photos look safe to share!'}
              </span>
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
              title="Import photos from folder or Google Drive links"
            >
              <Folder size={14} /> Drive
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
        onImportUrls={handleImportUrls}
      />
    </div>
  )
}
