import React, { useState, useMemo, useRef, useEffect, useCallback } from "react"
import {
  Smartphone,
  Send,
  Download,
  RotateCw,
  Check,
  Sparkles,
  ShieldCheck,
  Trash2,
  Eye,
  PlayCircle,
} from "lucide-react"
import { Button } from "../ui/Button"
import { Badge } from "../ui/Badge"
import { ImagePreviewModal } from "../ml/ImagePreviewModal"
import { useDocumentFilter } from "../../hooks/useDocumentFilter"
import {
  isAndroid,
  hasAndroidBridge,
  pickRandom20Android,
  requestAndroidGalleryPermission,
} from "../../services/nativeMediaService"
import { getOrCreateDeviceId } from "../../utils/deviceId"

interface MediaUploaderProps {
  onMediaReady: (mediaItems: Array<{ id: string; type: "image" | "video"; dataUrl: string }>) => void
  isReady: boolean
  onToggleReady: () => void
  mediaType?: "photos_only" | "videos_only" | "mixed"
  roomId?: string
  userId?: string
  workerUrl?: string
}

const SHORTCUT_LINKS: Record<string, { name: string; url: string; label: string }> = {
  photos_only: {
    name: "PhotoRouletteUpload",
    url: "https://www.icloud.com/shortcuts/bb1707211c824566ab3e70263be68c57",
    label: "Photos",
  },
  videos_only: {
    name: "PhotoRouletteUpload(Videos)",
    url: "https://www.icloud.com/shortcuts/84b4fa92547643efba2a581f15ddfd94",
    label: "Videos",
  },
  mixed: {
    name: "PhotoRouletteUpload(Mixed)",
    url: "https://www.icloud.com/shortcuts/fb672669f9364dc2acfffcd770067137",
    label: "Mixed",
  },
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  onMediaReady,
  isReady,
  onToggleReady,
  mediaType = "mixed",
  roomId = "DEFAULT_ROOM",
  userId = "anonymous",
  workerUrl = "https://photoroulette-worker.thomasblthsr.workers.dev",
}) => {
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isWaitingForShortcut, setIsWaitingForShortcut] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const pollingRef = useRef<any>(null)

  const effectiveUserId = useMemo(() => {
    return getOrCreateDeviceId()
  }, [])

  const isAndroidDevice = useMemo(() => isAndroid(), [])
  const activeShortcut = SHORTCUT_LINKS[mediaType] || SHORTCUT_LINKS.mixed

  const {
    items,
    loadExistingMedia,
    toggleExclude,
    removePhoto,
    getApprovedMedia,
  } = useDocumentFilter()

  const checkWorkerMedia = useCallback(async () => {
    try {
      const response = await fetch(
        `${workerUrl}/media?room=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(effectiveUserId)}`
      )
      if (response.ok) {
        const data = await response.json()
        if (data.items && data.items.length > 0) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setIsWaitingForShortcut(false)

          const mapped = data.items.map((i: { id: string; type: "image" | "video"; url: string }) => ({
            id: i.id,
            type: i.type,
            dataUrl: i.url,
          }))

          loadExistingMedia(mapped)
          onMediaReady(mapped)

          try {
            sessionStorage.setItem(`pr_media_${roomId}_${effectiveUserId}`, JSON.stringify(mapped))
          } catch {}

          if (!isReady) {
            onToggleReady()
          }

          setStatusMessage(`🎉 ${mapped.length} items loaded!`)
          setTimeout(() => setStatusMessage(null), 4000)
          return true
        }
      }
    } catch {}
    return false
  }, [roomId, effectiveUserId, workerUrl, isReady, onToggleReady, onMediaReady, loadExistingMedia])

  // Restore cached media on mount
  useEffect(() => {
    try {
      const cachedRaw = sessionStorage.getItem(`pr_media_${roomId}_${effectiveUserId}`)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw)
        if (Array.isArray(cached) && cached.length > 0) {
          loadExistingMedia(cached)
          onMediaReady(cached)
        }
      }
    } catch {}

    // Also check worker immediately on mount
    checkWorkerMedia()
  }, [roomId, effectiveUserId, checkWorkerMedia, loadExistingMedia, onMediaReady])

  // Check immediately when switching back into the browser from the Shortcuts app
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkWorkerMedia()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleVisibility)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleVisibility)
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [checkWorkerMedia])

  const approvedItems = useMemo(() => {
    let list = items.filter((i) => !i.isExcluded)
    if (mediaType === "videos_only") {
      list = list.filter((i) => i.type === "video")
    } else if (mediaType === "photos_only") {
      list = list.filter((i) => i.type === "image")
    }
    return list
  }, [items, mediaType])

  const handleAndroidNativePick20 = async () => {
    setIsPreparing(true)
    setPermissionDenied(false)
    setStatusMessage("Requesting gallery access & picking 20 items...")
    try {
      const granted = await requestAndroidGalleryPermission()
      if (!granted) {
        setPermissionDenied(true)
        setStatusMessage("⚠️ Gallery permission needed to pick photos.")
        setIsPreparing(false)
        return
      }

      const assets = await pickRandom20Android(
        roomId,
        effectiveUserId,
        `${workerUrl}/upload`,
        mediaType
      )
      if (assets && assets.length > 0) {
        const mapped = assets.map((a, idx) => ({
          id: a.id || String(idx),
          type: a.type,
          dataUrl: a.dataUrl,
        }))
        loadExistingMedia(mapped)
        onMediaReady(mapped)
        try {
          sessionStorage.setItem(`pr_media_${roomId}_${effectiveUserId}`, JSON.stringify(mapped))
        } catch {}
        if (!isReady) {
          onToggleReady()
        }
        setStatusMessage("🎉 20 items picked from Android device!")
      } else {
        const found = await checkWorkerMedia()
        if (found) {
          setStatusMessage("🎉 20 items loaded!")
        } else {
          setPermissionDenied(true)
          setStatusMessage("No media returned or gallery permission required.")
        }
      }
    } catch (e: any) {
      console.error("Android media pick error:", e)
      setPermissionDenied(true)
      setStatusMessage("Failed to access Android gallery.")
    } finally {
      setIsPreparing(false)
      setTimeout(() => setStatusMessage(null), 5000)
    }
  }

  const startPollingWorkerForMedia = () => {
    setIsWaitingForShortcut(true)
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    let attempts = 0
    const maxAttempts = 60

    pollingRef.current = setInterval(async () => {
      attempts++
      const found = await checkWorkerMedia()
      if (found || attempts >= maxAttempts) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        setIsWaitingForShortcut(false)
      }
    }, 2000)
  }

  const handleIOSShortcutTrigger = () => {
    const uploadEndpoint = `${workerUrl}/upload-single?room=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(effectiveUserId)}`
    const payload = encodeURIComponent(
      JSON.stringify({
        room: roomId,
        userId: effectiveUserId,
        endpoint: uploadEndpoint,
        total: 20,
      })
    )
    const shortcutName = encodeURIComponent(activeShortcut.name)
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
    window.location.href = `shortcuts://run-shortcut?name=${shortcutName}&input=text&text=${payload}`
    startPollingWorkerForMedia()
  }

  const handleRemoveSingle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removePhoto(id)
    setTimeout(() => {
      onMediaReady(getApprovedMedia(mediaType))
    }, 50)
  }

  const handleConfirmReview = () => {
    setIsPreviewModalOpen(false)
    const approved = getApprovedMedia(mediaType)
    onMediaReady(approved)
  }

  return (
    <div className="w-full bg-[#171527] border border-white/10 rounded-3xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <span>{isAndroidDevice ? "Device Gallery" : activeShortcut.label} Media Setup</span>
            <span className="text-xl">
              {mediaType === "videos_only" ? "🎥" : mediaType === "photos_only" ? "📸" : "✨"}
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {isAndroidDevice
              ? "Auto-pick 20 random items from your gallery"
              : "Auto-pick 20 random items via iOS Shortcut"}
          </p>
        </div>

        {items.length > 0 && (
          <Badge variant="success" size="md">
            {approvedItems.length} Loaded
          </Badge>
        )}
      </div>

      {isPreparing && (
        <div className="w-full bg-[#1e1b38] border border-violet-500/30 rounded-2xl p-4 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
              <RotateCw size={18} className="text-violet-400 animate-spin" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Preparing random media...</div>
              <div className="text-xs text-gray-400">Loading 20 random items from gallery...</div>
            </div>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="p-3 rounded-xl bg-violet-950/80 border border-violet-500/50 text-xs text-violet-200 flex items-center gap-2 animate-in fade-in duration-300">
          <Sparkles size={16} className="text-amber-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {!isAndroidDevice && isWaitingForShortcut && (
        <div className="p-3.5 rounded-2xl bg-blue-950/60 border border-blue-500/40 flex items-center gap-2.5 text-xs text-blue-200 animate-pulse shadow-lg">
          <RotateCw size={16} className="animate-spin text-blue-400 shrink-0" />
          <div className="flex-1">
            <div className="font-bold">Waiting for iOS Shortcut...</div>
            <div className="text-[11px] text-blue-300/80">
              {activeShortcut.name} is uploading 20 items to room {roomId}
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="space-y-3">
          {isAndroidDevice ? (
            <>
              {permissionDenied && (
                <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-amber-400 shrink-0" />
                    <span>Gallery permission is required to access your photos.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAndroidNativePick20}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
                  >
                    Grant Access
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleAndroidNativePick20}
                disabled={isPreparing}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-violet-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 cursor-pointer shadow-lg shadow-emerald-950/40 active:scale-98 text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <div className="font-extrabold text-white text-base">
                      {mediaType === "videos_only"
                        ? "⚡ Pick 20 Random Videos"
                        : mediaType === "photos_only"
                        ? "⚡ Pick 20 Random Photos"
                        : "⚡ Pick 20 Random Items"}
                    </div>
                    <div className="text-xs text-emerald-200/90 font-normal mt-0.5">
                      Direct 1-tap random pick from device gallery
                    </div>
                  </div>
                </div>
                <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0">
                  Pick 20
                </span>
              </button>
            </>
          ) : (
            <>
              {/* Button 1: Automatically triggers shortcut */}
              <button
                type="button"
                onClick={handleIOSShortcutTrigger}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 border border-blue-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 cursor-pointer shadow-lg shadow-blue-950/40 active:scale-98 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                    <Send size={22} />
                  </div>
                  <div>
                    <div className="font-extrabold text-white text-base">
                      📲 Import 20 via iOS Shortcut
                    </div>
                    <div className="text-xs text-blue-200/90 font-normal mt-0.5">
                      Auto-picks 20 random {activeShortcut.label.toLowerCase()} on iPhone
                    </div>
                  </div>
                </div>
                <span className="text-xs bg-white/20 text-white px-3 py-1 rounded-full font-bold shrink-0">
                  Run
                </span>
              </button>

              {/* Button 2: Installs shortcut */}
              <a
                href={activeShortcut.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full p-3.5 rounded-2xl bg-violet-950/40 hover:bg-violet-900/50 border border-violet-500/30 text-violet-200 text-xs font-bold flex items-center justify-between gap-3 transition-all active:scale-98 shadow-md cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-600/25 border border-violet-400/30 flex items-center justify-center text-violet-300 shrink-0">
                    <Download size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">📥 Install Apple Shortcut</div>
                    <div className="text-[11px] text-violet-300/70 font-normal mt-0.5">
                      Add &ldquo;{activeShortcut.name}&rdquo; to your Shortcuts
                    </div>
                  </div>
                </div>
                <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2.5 py-1 rounded-full font-bold shrink-0">
                  {activeShortcut.label}
                </span>
              </a>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-300 font-bold mb-1 px-1">
            <span className="text-violet-300 font-black">
              {mediaType === "videos_only"
                ? `🎬 Selected Videos (${approvedItems.length})`
                : mediaType === "photos_only"
                ? `📸 Selected Photos (${approvedItems.length})`
                : `✨ Selected Media (${approvedItems.length})`}
            </span>
            <button
              type="button"
              onClick={() => setIsPreviewModalOpen(true)}
              className="text-xs text-violet-400 hover:text-white flex items-center gap-1 font-bold cursor-pointer"
            >
              <Eye size={14} /> Review & Edit
            </button>
          </div>

          <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1.5 bg-black/30 rounded-2xl border border-white/5">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative aspect-square rounded-xl overflow-hidden group border border-white/10 bg-slate-800"
              >
                {item.type === "video" ? (
                  <div className="w-full h-full flex items-center justify-center bg-violet-950/60">
                    <PlayCircle size={20} className="text-violet-300" />
                  </div>
                ) : (
                  <img
                    src={item.dataUrl}
                    alt="Selected thumbnail"
                    className="w-full h-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => handleRemoveSingle(item.id, e)}
                  className="absolute top-1 right-1 p-1 rounded-md bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-xs text-gray-300 flex items-center gap-2">
            <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
            <span>20 items ready. Screenshots and receipts filtered out automatically.</span>
          </div>

          <div className="space-y-2 pt-1">
            <Button
              variant={isReady ? "success" : "primary"}
              size="lg"
              fullWidth
              className="text-sm font-bold py-3.5"
              onClick={onToggleReady}
            >
              <Check size={18} />
              <span>{isReady ? "Ready in Lobby (Tap to Cancel)" : "I'm Ready!"}</span>
            </Button>

            <div className="flex gap-2">
              {isAndroidDevice ? (
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={handleAndroidNativePick20}
                  className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30 text-xs py-2"
                >
                  <Smartphone size={14} /> ⚡ Pick 20 Again
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={handleIOSShortcutTrigger}
                  className="border-blue-500/30 text-blue-300 hover:bg-blue-950/30 text-xs py-2"
                >
                  <Send size={14} /> 📲 Re-run Shortcut
                </Button>
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

