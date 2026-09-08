import React, { useEffect, useRef, useState, useMemo } from 'react'
import {
  Upload,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Check,
  Camera,
  RotateCw,
  X,
  PlayCircle,
  Trash2,
  Sparkles,
  Plus,
  Film,
  Smartphone,
  Send,
  Download,
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
import {
  isAndroid,
  isIOS,
  hasAndroidBridge,
  pickRandom20Android,
} from '../../services/nativeMediaService'
import { createFallbackPhotoCard } from '../../utils/imageCompression'
import { getMockPartyPhotos, getMockPartyVideos, getMockPartyDeck } from '../../utils/mockData'

interface MediaUploaderProps {
  onMediaReady: (mediaItems: Array<{ id: string; type: 'image' | 'video'; dataUrl: string }>) => void
  isReady: boolean
  onToggleReady: () => void
  mediaType?: 'photos_only' | 'videos_only' | 'mixed'
  roomId?: string
  userId?: string
  workerUrl?: string
  shortcutInstallUrl?: string
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  onMediaReady,
  isReady,
  onToggleReady,
  mediaType = 'mixed',
  roomId = 'DEFAULT_ROOM',
  userId = 'anonymous',
  workerUrl = 'https://photoroulette-worker.workers.dev',
  shortcutInstallUrl = 'https://www.icloud.com/shortcuts/',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [vaultCount, setVaultCount] = useState<number>(0)
  const [isSecretMode, setIsSecretMode] = useState<boolean>(false)
  const [vaultMessage, setVaultMessage] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState<boolean>(false)
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState<boolean>(false)
  const [isWaitingForShortcut, setIsWaitingForShortcut] = useState<boolean>(false)
  const [customShortcutUrl, setCustomShortcutUrl] = useState<string>(() => {
    return localStorage.getItem('photoroulette_shortcut_url') || shortcutInstallUrl
  })
  const [isEditingUrl, setIsEditingUrl] = useState<boolean>(false)
  const [inputUrl, setInputUrl] = useState<string>(customShortcutUrl)

  const handleSaveUrl = () => {
    const trimmed = inputUrl.trim()
    if (trimmed) {
      setCustomShortcutUrl(trimmed)
      localStorage.setItem('photoroulette_shortcut_url', trimmed)
      setIsEditingUrl(false)
    }
  }

  const isAndroidPlatform = useMemo(() => isAndroid() || hasAndroidBridge(), [])
  const isIOSPlatform = useMemo(() => isIOS(), [])

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

  useEffect(() => {
    refreshVaultCount()
  }, [mediaType])

  const refreshVaultCount = async () => {
    const count = await getVaultCount(mediaType)
    setVaultCount(count)
  }

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let filesArray = Array.from(e.target.files)
      e.target.value = ''
      setIsPreparing(true)
      filesArray = fisherYatesShuffle(filesArray)

      await new Promise((resolve) => setTimeout(resolve, 50))
      const { accepted } = await processFiles(filesArray, { turbo: true })
      setIsPreparing(false)

      if (accepted.length > 0) {
        await savePhotosToVault(
          accepted.map((m) => ({
            id: m.id,
            type: m.type,
            dataUrl: m.dataUrl,
          }))
        )
        await refreshVaultCount()

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

        if (!isReady) {
          onToggleReady()
        }

        const label = mediaType === 'videos_only' ? 'videos' : mediaType === 'photos_only' ? 'photos' : 'items'
        setVaultMessage(`🎉 ${accepted.length} ${label} saved to your Vault! Total pool: ${vaultCount + accepted.length}`)
        setTimeout(() => setVaultMessage(null), 4500)
      }
    }
  }

  const handleAndroidNativePick20 = async () => {
    setIsPreparing(true)
    setVaultMessage('⚡ Querying 20 random photos/videos from Android MediaStore...')
    try {
      const assets = await pickRandom20Android(roomId, userId, `${workerUrl}/upload`)
      if (assets.length > 0) {
        await savePhotosToVault(assets.map((a) => ({ id: a.id, type: a.type, dataUrl: a.dataUrl })))
        await refreshVaultCount()
        loadExistingMedia(assets)
        onMediaReady(assets)
        if (!isReady) {
          onToggleReady()
        }
        setVaultMessage(`🎉 20 items picked and prepared automatically!`)
      } else {
        setVaultMessage('No media returned or gallery permission required.')
      }
    } catch {
      setVaultMessage('Failed to access Android MediaStore.')
    } finally {
      setIsPreparing(false)
      setTimeout(() => setVaultMessage(null), 4500)
    }
  }

  const startPollingWorkerForMedia = () => {
    setIsWaitingForShortcut(true)
    let attempts = 0
    const maxAttempts = 45

    const interval = setInterval(async () => {
      attempts++
      try {
        const response = await fetch(`${workerUrl}/media?room=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}`)
        if (response.ok) {
          const data = await response.json()
          if (data.items && data.items.length > 0) {
            clearInterval(interval)
            setIsWaitingForShortcut(false)
            setIsShortcutModalOpen(false)

            const mapped = data.items.map((i: { id: string; type: 'image' | 'video'; url: string }) => ({
              id: i.id,
              type: i.type,
              dataUrl: i.url,
            }))

            await savePhotosToVault(mapped)
            await refreshVaultCount()
            loadExistingMedia(mapped)
            onMediaReady(mapped)

            if (!isReady) {
              onToggleReady()
            }

            setVaultMessage(`🎉 ${mapped.length} items imported successfully via iOS Shortcut!`)
            setTimeout(() => setVaultMessage(null), 4500)
            return
          }
        }
      } catch {}

      if (attempts >= maxAttempts) {
        clearInterval(interval)
        setIsWaitingForShortcut(false)
      }
    }, 2000)
  }

  const handleIOSShortcutTrigger = () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        room: roomId,
        userId: userId,
        endpoint: `${workerUrl}/upload`,
      })
    )
    window.location.href = `shortcuts://run-shortcut?name=PhotoRouletteUpload&input=text&text=${payload}`
    startPollingWorkerForMedia()
  }

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
      if (mediaType === 'videos_only') {
        const mockVids = getMockPartyVideos()
        loadExistingMedia(mockVids)
        onMediaReady(mockVids.map((v) => ({ id: v.id, ownerId: '', ownerName: '', type: v.type, dataUrl: v.dataUrl })))
        if (!isReady) onToggleReady()
        setVaultMessage(`🎬 Rolled Party Videos!`)
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

  const handleClearVault = async () => {
    if (window.confirm('Delete all saved photos & videos from this device? You can upload a new batch anytime.')) {
      await clearVault()
      await refreshVaultCount()
      setVaultMessage('Photo Vault cleared successfully.')
      setTimeout(() => setVaultMessage(null), 3000)
    }
  }

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

      {isPreparing && !isScanning && (
        <div className="w-full bg-[#1e1b38] border border-violet-500/30 rounded-2xl p-4 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
              <RotateCw size={18} className="text-violet-400 animate-spin" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Preparing your media...</div>
              <div className="text-xs text-gray-400">Loading and randomizing items...</div>
            </div>
          </div>
        </div>
      )}

      {vaultMessage && (
        <div className="p-2.5 rounded-xl bg-violet-950/80 border border-violet-500/50 text-xs text-violet-200 flex items-center gap-2 animate-in fade-in duration-300">
          <Sparkles size={16} className="text-amber-400 shrink-0" />
          <span>{vaultMessage}</span>
        </div>
      )}

      <DocumentScanner progress={progress} isScanning={isScanning} />

      {items.length === 0 && !isScanning && (
        <div className="space-y-3">
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

              <div className="grid grid-cols-2 gap-2 pt-1">
                {isAndroidPlatform && (
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={handleAndroidNativePick20}
                    className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30 text-xs py-2"
                  >
                    <Smartphone size={14} /> ⚡ Android Pick 20
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={() => setIsShortcutModalOpen(true)}
                  className="border-teal-500/30 text-teal-300 hover:bg-teal-950/30 text-xs py-2"
                >
                  <Send size={14} /> 📲 iOS Shortcut
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => fileInputRef.current?.click()}
                className="border-white/10 text-xs py-2 text-gray-300 hover:text-white"
              >
                <Plus size={14} /> Add More Files Manually
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {isAndroidPlatform && (
                <button
                  onClick={handleAndroidNativePick20}
                  className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-900/50 via-teal-900/40 to-cyan-900/50 hover:from-emerald-900/70 hover:to-cyan-900/70 border border-emerald-400/40 transition-all flex items-center justify-between gap-3 cursor-pointer shadow-lg shadow-emerald-950/40 active:scale-98"
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-12 h-12 rounded-xl bg-emerald-600/30 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0">
                      <Smartphone size={24} />
                    </div>
                    <div>
                      <div className="font-black text-white text-sm">⚡ Pick Random 20 (Android Native)</div>
                      <div className="text-xs text-emerald-300/80">Silent 1-tap random selection without picker dialog</div>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full font-bold border border-emerald-500/30">
                    1-Tap
                  </span>
                </button>
              )}

              <div className="flex gap-2">
                <a
                  href={customShortcutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-3.5 rounded-2xl bg-violet-900/40 hover:bg-violet-900/60 border border-violet-400/40 text-violet-200 text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-all active:scale-98"
                  title="Install Apple Shortcut on your phone"
                >
                  <Download size={16} />
                  <span>Get Shortcut</span>
                </a>

                <button
                  onClick={() => setIsShortcutModalOpen(true)}
                  className="flex-1 p-3 rounded-2xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-violet-900/40 hover:from-blue-900/60 hover:to-violet-900/60 border border-blue-400/40 transition-all flex items-center justify-between gap-3 cursor-pointer shadow-lg shadow-blue-950/40 active:scale-98 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 shrink-0">
                      <Send size={18} />
                    </div>
                    <div>
                      <div className="font-black text-white text-xs">Import 20 via iOS Shortcut</div>
                      <div className="text-[11px] text-blue-300/80">Auto-pick 20 random items on iOS</div>
                    </div>
                  </div>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold border border-blue-500/30">
                    iOS
                  </span>
                </button>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 rounded-2xl bg-gradient-to-br from-violet-900/40 via-purple-900/30 to-indigo-900/40 hover:from-violet-900/60 hover:to-indigo-900/60 border-2 border-dashed border-violet-400/50 hover:border-violet-300 transition-all flex items-center justify-between gap-3 cursor-pointer shadow-lg shadow-violet-950/40 active:scale-98"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-12 h-12 rounded-xl bg-violet-600/40 flex items-center justify-center text-violet-200 border border-violet-400/40 shrink-0">
                    {mediaType === 'videos_only' ? <Film size={24} /> : <Camera size={24} />}
                  </div>
                  <div>
                    <div className="font-black text-white text-sm">
                      {mediaType === 'videos_only'
                        ? 'Select Videos Manually'
                        : mediaType === 'photos_only'
                        ? 'Select Photos Manually'
                        : 'Select Photos & Videos Manually'}
                    </div>
                    <div className="text-xs text-violet-300/80">Choose items directly from your photo library</div>
                  </div>
                </div>
                <span className="text-xs bg-violet-500/20 text-violet-300 px-2.5 py-1 rounded-full font-bold border border-violet-500/30">
                  Manual
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {items.length > 0 && !isScanning && (
        <div className="space-y-3">
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

                  <button
                    onClick={(e) => handleRemoveSingle(item.id, e)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center text-xs transition-colors cursor-pointer shadow-md"
                    title="Veto item"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              className="flex-1 text-xs border-violet-500/30 text-violet-200 font-bold bg-violet-950/30 hover:bg-violet-900/40"
              onClick={() => setIsPreviewModalOpen(true)}
            >
              <Eye size={15} className="text-violet-400" />
              <span>Inspect ({approvedItems.length})</span>
            </Button>

            <Button
              variant="outline"
              size="md"
              className="flex-1 text-xs border-amber-500/30 text-amber-200 hover:bg-amber-950/20"
              onClick={handleReroll}
            >
              <RotateCw size={14} className="text-amber-400" />
              <span>Reroll Deck</span>
            </Button>
          </div>

          {excludedCount > 0 ? (
            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="shrink-0" />
                <span>
                  {excludedCount} document{excludedCount > 1 ? 's' : ''}/receipt{excludedCount > 1 ? 's' : ''} filtered.
                </span>
              </div>
              <button
                onClick={() => setIsPreviewModalOpen(true)}
                className="text-[11px] underline font-bold hover:text-white shrink-0 cursor-pointer"
              >
                Review
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-xs text-gray-300 flex items-center gap-2">
              <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
              <span>Safe media verified. Documents & receipts automatically filtered out.</span>
            </div>
          )}

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

      {isShortcutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1b1730] border border-violet-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Send size={18} className="text-blue-400" />
                <span>iOS Shortcut Integration</span>
              </div>
              <button
                onClick={() => setIsShortcutModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-300">
              <p>
                Use the Apple Shortcut to automatically pick 20 random photos/videos, optimize them, and upload directly to room {roomId}.
              </p>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Download size={14} className="text-violet-400" />
                    <span>Step 1: Install Shortcut on iPhone</span>
                  </div>
                  <button
                    onClick={() => setIsEditingUrl(!isEditingUrl)}
                    className="text-[11px] text-violet-300 hover:text-white underline cursor-pointer"
                  >
                    {isEditingUrl ? 'Cancel' : 'Paste Shortcut Link'}
                  </button>
                </div>

                {isEditingUrl ? (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      placeholder="https://www.icloud.com/shortcuts/..."
                      className="w-full px-3 py-2 text-xs bg-black/50 border border-violet-500/40 rounded-lg text-white placeholder-gray-500 outline-none focus:border-violet-400"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={handleSaveUrl}
                      className="text-xs font-bold"
                    >
                      Save Predefined Shortcut Link
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-gray-300">
                      Tap below to add the pre-built &ldquo;PhotoRouletteUpload&rdquo; shortcut to your Apple Shortcuts library.
                    </p>
                    <a
                      href={customShortcutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 text-center text-xs"
                    >
                      <Download size={15} />
                      <span>📥 Install Predefined Shortcut to iPhone</span>
                    </a>
                  </>
                )}
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1 font-mono text-[11px] text-gray-400">
                <div>Room: <span className="text-violet-300 font-bold">{roomId}</span></div>
                <div>User ID: <span className="text-emerald-300 font-bold">{userId}</span></div>
                <div>Endpoint: <span className="text-cyan-300 truncate block">{workerUrl}/upload</span></div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleIOSShortcutTrigger}
                className="bg-blue-600 hover:bg-blue-500 text-sm py-3 font-bold"
              >
                <Send size={16} />
                <span>⚡ Run Shortcut for Room ({roomId})</span>
              </Button>

              {isWaitingForShortcut && (
                <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-center gap-2 text-xs text-blue-200 animate-pulse">
                  <RotateCw size={14} className="animate-spin text-blue-400" />
                  <span>Waiting for Shortcut to upload media...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
