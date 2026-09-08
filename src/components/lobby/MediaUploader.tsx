import React, { useEffect, useRef, useState, useMemo } from 'react'
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
  Film,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { DocumentScanner } from '../ml/DocumentScanner'
import { ImagePreviewModal } from '../ml/ImagePreviewModal'
import { useDocumentFilter } from '../../hooks/useDocumentFilter'
import {
  getVaultCount,
  savePhotosToVault,
  sampleRandomFromVault,
  getAllVaultPhotos,
  clearVault,
  fisherYatesShuffle,
} from '../../services/photoVaultService'
import { createFallbackPhotoCard } from '../../utils/imageCompression'
import { getMockPartyPhotos, getMockPartyVideos, getMockPartyDeck } from '../../utils/mockData'

interface MediaUploaderProps {
  onMediaReady: (mediaItems: Array<{ id: string; type: 'image' | 'video'; dataUrl: string }>) => void
  isReady: boolean
  onToggleReady: () => void
  mediaType?: 'photos_only' | 'videos_only' | 'mixed'
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  onMediaReady,
  isReady,
  onToggleReady,
  mediaType = 'mixed',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [vaultCount, setVaultCount] = useState<number>(0)
  const [isSecretMode, setIsSecretMode] = useState<boolean>(false)
  const [vaultMessage, setVaultMessage] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState<boolean>(false)

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


  // Check saved vault status on mount and whenever mediaType changes
  useEffect(() => {
    refreshVaultCount()
  }, [mediaType])

  const refreshVaultCount = async () => {
    const count = await getVaultCount(mediaType)
    setVaultCount(count)
  }

  // Align active deck when mediaType setting changes (Photos Only, Videos Only, Mixed)
  useEffect(() => {
    if (items.length > 0) {
      if (mediaType === 'videos_only') {
        const onlyVideos = items.filter((i) => !i.isExcluded && i.type === 'video')
        if (onlyVideos.length > 0) {
          onMediaReady(onlyVideos.map((v) => ({ id: v.id, ownerId: '', ownerName: '', type: v.type, dataUrl: v.dataUrl })))
        } else {
          sampleRandomFromVault(15, 'videos_only').then((vaultVideos) => {
            if (vaultVideos.length > 0) {
              loadExistingMedia(vaultVideos)
              onMediaReady(vaultVideos.map((v) => ({ id: v.id, ownerId: '', ownerName: '', type: v.type, dataUrl: v.dataUrl })))
            } else {
              const mockVids = getMockPartyVideos()
              loadExistingMedia(mockVids)
              onMediaReady(mockVids.map((v) => ({ id: v.id, ownerId: '', ownerName: '', type: v.type, dataUrl: v.dataUrl })))
            }
          })
        }
      } else if (mediaType === 'photos_only') {
        const onlyPhotos = items.filter((i) => !i.isExcluded && i.type === 'image')
        if (onlyPhotos.length > 0) {
          onMediaReady(onlyPhotos.map((p) => ({ id: p.id, ownerId: '', ownerName: '', type: p.type, dataUrl: p.dataUrl })))
        } else {
          sampleRandomFromVault(15, 'photos_only').then((vaultPhotos) => {
            if (vaultPhotos.length > 0) {
              loadExistingMedia(vaultPhotos)
              onMediaReady(vaultPhotos.map((p) => ({ id: p.id, ownerId: '', ownerName: '', type: p.type, dataUrl: p.dataUrl })))
            } else {
              const mockPhotos = getMockPartyPhotos()
              loadExistingMedia(mockPhotos)
              onMediaReady(mockPhotos.map((p) => ({ id: p.id, ownerId: '', ownerName: '', type: p.type, dataUrl: p.dataUrl })))
            }
          })
        }
      } else {
        // 'mixed' mode: Ensure BOTH photos and videos are present in active deck
        const hasVideos = items.some((i) => !i.isExcluded && i.type === 'video')
        const hasPhotos = items.some((i) => !i.isExcluded && i.type === 'image')
        if (!hasVideos || !hasPhotos) {
          sampleRandomFromVault(15, 'mixed').then((mixed) => {
            if (mixed.length > 0 && mixed.some((m) => m.type === 'video') && mixed.some((m) => m.type === 'image')) {
              loadExistingMedia(mixed)
              onMediaReady(mixed.map((m) => ({ id: m.id, ownerId: '', ownerName: '', type: m.type, dataUrl: m.dataUrl })))
            } else {
              const mixedMock = getMockPartyDeck('mixed')
              loadExistingMedia(mixedMock)
              onMediaReady(mixedMock.map((m) => ({ id: m.id, ownerId: '', ownerName: '', type: m.type, dataUrl: m.dataUrl })))
            }
          })
        } else {
          const approved = items.filter((i) => !i.isExcluded)
          onMediaReady(approved.map((m) => ({ id: m.id, ownerId: '', ownerName: '', type: m.type, dataUrl: m.dataUrl })))
        }
      }
    }
  }, [mediaType])

  // Handle camera roll selection: supports unlimited photos/videos at once, saves to IndexedDB Vault, and samples 15
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let filesArray = Array.from(e.target.files)
      // Reset input value so user can select again without needing to reload
      e.target.value = ''

      // Show loading indicator immediately while preparing files
      setIsPreparing(true)

      // Randomly shuffle all incoming files first using Fisher-Yates
      filesArray = fisherYatesShuffle(filesArray)

      // Small delay to let the UI render the loading indicator
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Process and filter files (downscaling + document heuristics + safety filter)
      // Always use turbo mode for fastest possible processing
      const { accepted } = await processFiles(filesArray, { turbo: true })

      setIsPreparing(false)

      if (accepted.length > 0) {
        // Automatically save all clean accepted media into device's persistent IndexedDB vault
        await savePhotosToVault(
          accepted.map((m) => ({
            id: m.id,
            type: m.type,
            dataUrl: m.dataUrl,
          }))
        )
        await refreshVaultCount()

        // Sample 15 matching mediaType for the current active game
        const activeSample = await sampleRandomFromVault(15, mediaType)
        const filteredAccepted = accepted.filter((m) =>
          mediaType === 'videos_only' ? m.type === 'video' : mediaType === 'photos_only' ? m.type === 'image' : true
        )
        const finalDeck = activeSample.length > 0 ? activeSample : filteredAccepted.slice(0, 15)
        loadExistingMedia(finalDeck)

        const mapped = finalDeck.map((s) => ({
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

        const label = mediaType === 'videos_only' ? 'videos' : mediaType === 'photos_only' ? 'photos' : 'items'
        setVaultMessage(`🎉 ${accepted.length} ${label} saved to your Vault! Total pool: ${vaultCount + accepted.length}`)
        setTimeout(() => setVaultMessage(null), 4500)
      }
    }
  }

  // 1-Tap Mystery Roll from persistent IndexedDB Vault
  const handleRollFromVault = async () => {
    const sampled = await sampleRandomFromVault(15, mediaType)
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
      const label = mediaType === 'videos_only' ? 'Videos' : mediaType === 'photos_only' ? 'Photos' : 'Photos & Videos'
      setVaultMessage(`🎲 Rolled ${sampled.length} Mystery ${label} from your saved vault!`)
      setTimeout(() => setVaultMessage(null), 3000)
    } else {
      // If vault doesn't have media matching this type, load built-in party pack!
      if (mediaType === 'videos_only') {
        const mockVids = getMockPartyVideos()
        loadExistingMedia(mockVids)
        onMediaReady(mockVids.map((v) => ({ id: v.id, ownerId: '', ownerName: '', type: v.type, dataUrl: v.dataUrl })))
        if (!isReady) onToggleReady()
        setVaultMessage(`🎬 Rolled Party Videos! (Upload your own videos anytime)`)
        setTimeout(() => setVaultMessage(null), 3500)
      } else if (mediaType === 'mixed') {
        const mockMixed = getMockPartyDeck('mixed')
        loadExistingMedia(mockMixed)
        onMediaReady(mockMixed.map((m) => ({ id: m.id, ownerId: '', ownerName: '', type: m.type, dataUrl: m.dataUrl })))
        if (!isReady) onToggleReady()
        setVaultMessage(`✨ Rolled Mystery Mixed Deck (Photos + Videos)!`)
        setTimeout(() => setVaultMessage(null), 3500)
      } else {
        const mockPhotos = getMockPartyPhotos()
        loadExistingMedia(mockPhotos)
        onMediaReady(mockPhotos.map((p) => ({ id: p.id, ownerId: '', ownerName: '', type: p.type, dataUrl: p.dataUrl })))
        if (!isReady) onToggleReady()
      }
    }
  }

  // Clear local device vault
  const handleClearVault = async () => {
    if (window.confirm('Delete all saved photos & videos from this device? You can upload a new batch anytime.')) {
      await clearVault()
      await refreshVaultCount()
      setVaultMessage('Photo Vault cleared successfully.')
      setTimeout(() => setVaultMessage(null), 3000)
    }
  }


  // Reroll photos in roulette pool
  const handleReroll = async () => {
    const freshSample = await sampleRandomFromVault(15, mediaType)
    if (freshSample.length > 0) {
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
        onMediaReady(getApprovedMedia(mediaType))
      }, 50)
    }
  }

  const handleRemoveSingle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removePhoto(id)

    // If there are more items in the vault, immediately draw a replacement
    if (vaultCount > items.length) {
      const allMedia = await getAllVaultPhotos()
      const currentIds = new Set(items.map((i) => i.id))
      const available = allMedia.filter(
        (p) =>
          !currentIds.has(p.id) &&
          p.id !== id &&
          (mediaType === 'videos_only' ? p.type === 'video' : mediaType === 'photos_only' ? p.type === 'image' : true)
      )
      if (available.length > 0) {
        const replacement = available[Math.floor(Math.random() * available.length)]
        const remaining = items.filter((i) => i.id !== id)
        loadExistingMedia([...remaining, replacement])
        setTimeout(() => {
          onMediaReady(getApprovedMedia(mediaType))
        }, 50)
        return
      }
    }

    setTimeout(() => {
      onMediaReady(getApprovedMedia(mediaType))
    }, 50)
  }

  const handleConfirmReview = () => {
    setIsPreviewModalOpen(false)
    const approved = getApprovedMedia(mediaType)
    onMediaReady(approved)
  }

  const approvedItems = useMemo(() => {
    let list = items.filter((i) => !i.isExcluded)
    if (mediaType === 'videos_only') {
      list = list.filter((i) => i.type === 'video')
    } else if (mediaType === 'photos_only') {
      list = list.filter((i) => i.type === 'image')
    }
    return list
  }, [items, mediaType])

  const handleCameraRollClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="w-full bg-[#171527] border border-white/10 rounded-3xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <span>
              {mediaType === 'videos_only'
                ? 'Persistent Video Vault'
                : mediaType === 'photos_only'
                ? 'Persistent Photo Vault'
                : 'Persistent Media Vault'}
            </span>
            <span className="text-xl">
              {mediaType === 'videos_only' ? '🎥' : mediaType === 'photos_only' ? '💾' : '✨'}
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Upload once • 100% private in browser storage • 1-tap play forever
          </p>
        </div>

        {vaultCount > 0 && (
          <Badge variant="success" size="md">
            {mediaType === 'videos_only'
              ? `🎥 ${vaultCount} Videos`
              : mediaType === 'photos_only'
              ? `💾 ${vaultCount} Photos`
              : `✨ ${vaultCount} Items`}{' '}
            in Vault
          </Badge>
        )}
      </div>

      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={
          mediaType === 'videos_only'
            ? 'video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv'
            : mediaType === 'photos_only'
            ? 'image/*,.heic,.heif'
            : 'image/*,video/*,.heic,.heif,.mp4,.mov,.m4v,.webm'
        }
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Preparing files indicator (shown immediately after file picker closes, before scan starts) */}
      {isPreparing && !isScanning && (
        <div className="w-full bg-[#1e1b38] border border-violet-500/30 rounded-2xl p-4 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
              <RotateCw size={18} className="text-violet-400 animate-spin" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Preparing your photos...</div>
              <div className="text-xs text-gray-400">Loading selected files, this may take a moment</div>
            </div>
          </div>
        </div>
      )}

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
                    {mediaType === 'videos_only' ? '🎥' : mediaType === 'photos_only' ? '💾' : '✨'}
                  </div>
                  <div>
                    <div className="text-sm font-black text-white flex items-center gap-2">
                      <span>
                        {mediaType === 'videos_only'
                          ? 'Saved Video Vault'
                          : mediaType === 'photos_only'
                          ? 'Saved Photo Vault'
                          : 'Saved Media Vault'}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-emerald-500/25 text-emerald-300 rounded-full font-mono font-bold border border-emerald-500/30">
                        {vaultCount} {mediaType === 'videos_only' ? 'Videos' : mediaType === 'photos_only' ? 'Photos' : 'Items'}
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
                <span>
                  {mediaType === 'videos_only'
                    ? '⚡ Roll 15 Mystery Videos'
                    : mediaType === 'photos_only'
                    ? '⚡ Roll 15 Mystery Photos'
                    : '⚡ Roll 15 Mystery Media (Mixed)'}
                </span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => fileInputRef.current?.click()}
                className="border-white/10 text-xs py-2 text-gray-300 hover:text-white"
              >
                <Plus size={14} /> {mediaType === 'videos_only' ? '+ Add More Videos from Photo App' : mediaType === 'photos_only' ? '+ Add More Photos from Photo App' : '+ Add More Media from Photo App'}
              </Button>
            </div>
          ) : (
            /* First Time Setup: Upload Photos/Videos into Vault */
            <button
              onClick={handleCameraRollClick}
              className="w-full p-6 rounded-2xl bg-gradient-to-br from-violet-900/40 via-purple-900/30 to-indigo-900/40 hover:from-violet-900/60 hover:to-indigo-900/60 border-2 border-dashed border-violet-400/50 hover:border-violet-300 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer shadow-lg shadow-violet-950/40 active:scale-98"
            >
              <div className="w-14 h-14 rounded-2xl bg-violet-600/40 flex items-center justify-center text-violet-200 border border-violet-400/40 shadow-inner">
                {mediaType === 'videos_only' ? <Film size={28} className="animate-pulse" /> : <Camera size={28} className="animate-pulse" />}
              </div>
              <div className="text-center">
                <div className="font-black text-white text-base">
                  {mediaType === 'videos_only'
                    ? '🎥 Select Videos from Photo App (No Limit)'
                    : mediaType === 'photos_only'
                    ? '📱 Select Photos from Photo App (No Limit)'
                    : '✨ Select Photos & Videos from Photo App (No Limit)'}
                </div>
                <div className="text-xs text-violet-300/80 mt-1 max-w-xs">
                  {mediaType === 'videos_only'
                    ? "Select videos from your photo library. Stored locally in your device's Video Vault for instant 1-tap play!"
                    : "Select photos from your photo library. Stored locally in your browser's Photo Vault for instant 1-tap play forever!"}
                </div>
              </div>
            </button>
          )}

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
                  {mediaType === 'videos_only'
                    ? `🎬 Selected Videos (${approvedItems.length})`
                    : mediaType === 'photos_only'
                    ? `📸 Selected Photos (${approvedItems.length})`
                    : `✨ Selected Media (${approvedItems.length})`}
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
                    <span>Show Media</span>
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
                      e.currentTarget.src = createFallbackPhotoCard(item.type === 'video' ? `Video #${idx + 1}` : `Photo #${idx + 1}`)
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
                    title="Veto item (swap with another)"
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
              <span>
                {mediaType === 'videos_only'
                  ? `🔍 Inspect Videos (${approvedItems.length})`
                  : mediaType === 'photos_only'
                  ? `🔍 Inspect Photos (${approvedItems.length})`
                  : `🔍 Inspect Media (${approvedItems.length})`}
              </span>
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

    </div>
  )
}
