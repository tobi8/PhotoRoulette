import React, { useState, useMemo, useRef, useEffect } from "react"
import {
  Smartphone,
  Clipboard,
  Image as ImageIcon,
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
  hasAndroidBridge,
  pickRandom20Android,
  requestAndroidGalleryPermission,
  openAndroidAppSettings,
} from "../../services/nativeMediaService"
import { compressImage, processVideo } from "../../utils/imageCompression"

interface MediaUploaderProps {
  onMediaReady: (mediaItems: Array<{ id: string; type: "image" | "video"; dataUrl: string }>) => void
  isReady: boolean
  onToggleReady: () => void
  mediaType?: "photos_only" | "videos_only" | "mixed"
  roomId?: string
  userId?: string
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  onMediaReady,
  isReady,
  onToggleReady,
  mediaType = "mixed",
  roomId = "DEFAULT_ROOM",
  userId = "anonymous",
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const isNativeAndroid = useMemo(() => hasAndroidBridge(), [])

  const {
    items,
    loadExistingMedia,
    toggleExclude,
    removePhoto,
    getApprovedMedia,
  } = useDocumentFilter()

  // Listen for global Ctrl+V / Cmd+V paste events
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items
      if (!clipboardItems || clipboardItems.length === 0) return

      const files: File[] = []
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith("image/")) {
          const file = clipboardItems[i].getAsFile()
          if (file) files.push(file)
        }
      }

      if (files.length > 0) {
        e.preventDefault()
        await processAndLoadFiles(files)
      }
    }

    window.addEventListener("paste", handleGlobalPaste)
    return () => window.removeEventListener("paste", handleGlobalPaste)
  }, [items, isReady, onMediaReady, onToggleReady, loadExistingMedia])

  // Process a list of File objects locally with Canvas GPU compression
  const processAndLoadFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return
    setIsPreparing(true)
    setStatusMessage(`⚡ Loading ${fileList.length} items on device...`)

    try {
      // Pick up to 20 random items if more than 20 were selected
      const shuffled = fileList.sort(() => Math.random() - 0.5).slice(0, 20)

      const processed = await Promise.all(
        shuffled.map(async (file, idx) => {
          const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name)
          if (isVideo) {
            const res = await processVideo(file)
            return {
              id: `local_${Date.now()}_${idx}`,
              type: "video" as const,
              dataUrl: res.dataUrl,
            }
          } else {
            const res = await compressImage(file, 800, 0.65)
            return {
              id: `local_${Date.now()}_${idx}`,
              type: "image" as const,
              dataUrl: res.dataUrl,
            }
          }
        })
      )

      loadExistingMedia(processed)
      onMediaReady(processed)
      if (!isReady) {
        onToggleReady()
      }
      setStatusMessage(`🎉 ${processed.length} items loaded instantly! (0s upload)`)
    } catch (err) {
      console.error("Processing error:", err)
      setStatusMessage("Failed to process media files.")
    } finally {
      setIsPreparing(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // Handle direct file input change (<input type="file">)
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    e.target.value = ""
    await processAndLoadFiles(fileArray)
  }

  // Handle clipboard paste button (navigator.clipboard.read())
  const handlePasteFromClipboard = async () => {
    setIsPreparing(true)
    setStatusMessage("Reading photos from clipboard...")
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setStatusMessage("Clipboard API not supported in this browser. Use 'Select from Library'.")
        setIsPreparing(false)
        return
      }

      const clipboardItems = await navigator.clipboard.read()
      const files: File[] = []

      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i]
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type)
            const ext = type.split("/")[1] || "jpg"
            files.push(new File([blob], `pasted_${i}.${ext}`, { type }))
            break
          }
        }
      }

      if (files.length === 0) {
        setStatusMessage("⚠️ No photos on clipboard! In Photos app: Select photos → Share → Copy.")
        setIsPreparing(false)
        return
      }

      await processAndLoadFiles(files)
    } catch (err: any) {
      console.warn("Clipboard read error:", err)
      setStatusMessage("Clipboard access denied or empty. Tap allow or copy photos from Photos app first.")
      setIsPreparing(false)
    }
  }

  // Android Native 1-Tap pick (only inside APK)
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

      const assets = await pickRandom20Android(roomId, userId, "", mediaType)
      if (assets && assets.length > 0) {
        const mapped = assets.map((a, idx) => ({
          id: a.id || String(idx),
          type: a.type,
          dataUrl: a.dataUrl,
        }))
        loadExistingMedia(mapped)
        onMediaReady(mapped)
        if (!isReady) {
          onToggleReady()
        }
        setStatusMessage(`🎉 ${mapped.length} items picked from Android device!`)
      } else {
        setStatusMessage("No media returned from device.")
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

  const approvedItems = useMemo(() => {
    let list = items.filter((i) => !i.isExcluded)
    if (mediaType === "videos_only") {
      list = list.filter((i) => i.type === "video")
    } else if (mediaType === "photos_only") {
      list = list.filter((i) => i.type === "image")
    }
    return list
  }, [items, mediaType])

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
      {/* Hidden native file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={
          mediaType === "videos_only"
            ? "video/*,.mp4,.mov,.m4v,.webm"
            : mediaType === "photos_only"
            ? "image/*,.heic,.heif"
            : "image/*,video/*,.heic,.heif,.mp4,.mov,.m4v,.webm"
        }
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <span>Photo Setup</span>
            <span className="text-xl">
              {mediaType === "videos_only" ? "🎥" : mediaType === "photos_only" ? "📸" : "✨"}
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Instant local loading • Zero network upload • 100% private
          </p>
        </div>

        {items.length > 0 && (
          <Badge variant="success" size="md">
            {approvedItems.length} Ready
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
              <div className="text-sm font-bold text-white">Preparing your media...</div>
              <div className="text-xs text-gray-400">Processing on device in milliseconds...</div>
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

      {items.length === 0 ? (
        <div className="space-y-3">
          {/* OPTION 1: Android Native Button (Only inside APK) */}
          {isNativeAndroid && (
            <>
              {permissionDenied && (
                <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-amber-400 shrink-0" />
                    <span>Gallery permission is required to access your photos.</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleAndroidNativePick20}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
                    >
                      Grant Access
                    </button>
                    <button
                      type="button"
                      onClick={openAndroidAppSettings}
                      className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
                    >
                      Settings
                    </button>
                  </div>
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
                      ⚡ 1-Tap Pick 20 from Gallery
                    </div>
                    <div className="text-xs text-emerald-200/90 font-normal mt-0.5">
                      Direct random pick on device • Instant
                    </div>
                  </div>
                </div>
                <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0">
                  Pick 20
                </span>
              </button>
            </>
          )}

          {/* OPTION 2: 📋 Instant Paste from Clipboard (iOS & Web) */}
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            disabled={isPreparing}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 border border-blue-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 cursor-pointer shadow-lg shadow-blue-950/40 active:scale-98 text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                <Clipboard size={24} />
              </div>
              <div>
                <div className="font-extrabold text-white text-base">
                  📋 Paste 20 Photos from Clipboard
                </div>
                <div className="text-xs text-blue-200/90 font-normal mt-0.5">
                  Copy photos in Photos app → Tap here • 0s upload
                </div>
              </div>
            </div>
            <span className="text-xs bg-white/20 text-white px-3 py-1.5 rounded-full font-bold shrink-0">
              Paste
            </span>
          </button>

          {/* OPTION 3: 📱 Select from Library (Direct in Safari/Chrome) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPreparing}
            className="w-full p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center justify-between gap-3 transition-all active:scale-98 cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-600/30 border border-violet-400/30 flex items-center justify-center text-violet-300 shrink-0">
                <ImageIcon size={18} />
              </div>
              <div>
                <div className="font-bold text-white text-sm">📱 Select from Photo Library</div>
                <div className="text-[11px] text-gray-400 font-normal mt-0.5">
                  Choose photos or album • Auto-picks 20 random items
                </div>
              </div>
            </div>
            <span className="text-[10px] bg-white/10 text-gray-300 px-2.5 py-1 rounded-full font-bold shrink-0">
              Browse
            </span>
          </button>

          {/* Helpful 3-Step Shortcut tip for iOS users */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 text-[11px] text-gray-400 space-y-1.5">
            <div className="font-bold text-violet-300 flex items-center gap-1.5 text-xs">
              <span>💡 For 100% Random 20 Photos on iPhone:</span>
            </div>
            <ol className="list-decimal list-inside space-y-0.5 text-gray-300">
              <li>In Apple Shortcuts: <b>Find Photos</b> (Random, Limit 20)</li>
              <li>Add action: <b>Copy to Clipboard</b></li>
              <li>Switch back here & tap <b>Paste</b> above!</li>
            </ol>
          </div>
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
            <span>{approvedItems.length} items ready. All stored locally on your device.</span>
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
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => fileInputRef.current?.click()}
                className="border-white/10 text-gray-300 hover:text-white text-xs py-2"
              >
                <ImageIcon size={14} /> Add More Photos
              </Button>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={handlePasteFromClipboard}
                className="border-blue-500/30 text-blue-300 hover:bg-blue-950/30 text-xs py-2"
              >
                <Clipboard size={14} /> Paste New
              </Button>
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
