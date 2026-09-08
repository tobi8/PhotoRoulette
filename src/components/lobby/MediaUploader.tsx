import React, { useState, useMemo, useRef, useEffect } from "react"
import {
  Smartphone,
  Clipboard,
  RotateCw,
  Check,
  Sparkles,
  ShieldCheck,
  Trash2,
  Eye,
  PlayCircle,
  ExternalLink,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react"
import { Button } from "../ui/Button"
import { Badge } from "../ui/Badge"
import { ImagePreviewModal } from "../ml/ImagePreviewModal"
import { useDocumentFilter } from "../../hooks/useDocumentFilter"
import {
  isAndroid,
  hasAndroidBridge,
  pickRandom20Android,
  rerollAndroid,
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

const SHORTCUT_INSTALL_URL = "https://www.icloud.com/shortcuts/cc52cea3e6534daf9097c564c3bd99f7"
const SHORTCUT_NAME = "PhotoRouletteUpload"

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  onMediaReady,
  isReady,
  onToggleReady,
  mediaType = "mixed",
  roomId,
  userId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isPendingPaste, setIsPendingPaste] = useState<boolean>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search)
      if (searchParams.get("source") === "shortcut") return true
      return sessionStorage.getItem("pending_paste") === "true"
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search)
      if (searchParams.get("source") === "shortcut" || sessionStorage.getItem("pending_paste") === "true") {
        setIsPendingPaste(true)
      }
    } catch {}
  }, [])

  const handleLaunchShortcut = () => {
    try {
      sessionStorage.setItem("pending_paste", "true")
      setIsPendingPaste(true)
      const shortcutUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`
      window.location.href = shortcutUrl
    } catch (err) {
      console.error(err)
    }
  }

  const isAndroidDevice = useMemo(() => isAndroid(), [])

  const {
    items,
    loadExistingMedia,
    toggleExclude,
    removePhoto,
    getApprovedMedia,
  } = useDocumentFilter()

  const processAndLoadFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return
    setIsPreparing(true)
    setStatusMessage("Processing media...")

    try {
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
      setStatusMessage(`${processed.length} items loaded!`)
    } catch (err) {
      console.error(err)
      setStatusMessage("Failed to process media.")
    } finally {
      setIsPreparing(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    e.target.value = ""
    await processAndLoadFiles(fileArray)
  }

  const handleNativePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (items && items.length > 0) {
      const extractedFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === "file") {
          const f = item.getAsFile()
          if (f && (f.type.startsWith("image/") || f.type.startsWith("video/"))) {
            extractedFiles.push(f)
          }
        }
      }
      if (extractedFiles.length > 0) {
        e.preventDefault()
        await processAndLoadFiles(extractedFiles)
        return
      }
    }

    const clipboardFiles = e.clipboardData?.files
    if (clipboardFiles && clipboardFiles.length > 0) {
      const validFiles = Array.from(clipboardFiles).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
      )
      if (validFiles.length > 0) {
        e.preventDefault()
        await processAndLoadFiles(validFiles)
        return
      }
    }

    const text = e.clipboardData?.getData("text/plain")
    if (text) {
      e.preventDefault()
      handlePastedText(text)
    }
  }

  const sanitizeBase64String = (str: string): string => {
    let cleaned = str.trim()
    cleaned = cleaned.replace(/^['"]+|['"]+$/g, "")
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, "")

    let mime = "image/jpeg"
    if (cleaned.startsWith("data:")) {
      const commaIdx = cleaned.indexOf(",")
      if (commaIdx !== -1) {
        const prefix = cleaned.substring(0, commaIdx)
        const match = prefix.match(/data:([^;]+)/)
        if (match) mime = match[1]
        cleaned = cleaned.substring(commaIdx + 1)
      }
    }

    cleaned = cleaned.replace(/[\r\n\s\t]+/g, "")
    return `data:${mime};base64,${cleaned}`
  }

  const handlePastedText = (text: string) => {
    const rawCandidates: string[] = []
    const trimmed = text.trim().replace(/^[\u200B-\u200D\uFEFF]+|[\u200B-\u200D\uFEFF]+$/g, "")

    try {
      let candidate = trimmed
      if (!candidate.startsWith("[") && candidate.includes("[")) {
        candidate = candidate.substring(candidate.indexOf("["))
      }
      if (!candidate.endsWith("]") && candidate.lastIndexOf("]") !== -1) {
        candidate = candidate.substring(0, candidate.lastIndexOf("]") + 1)
      }
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === "string") {
            rawCandidates.push(entry)
          } else if (entry && typeof entry === "object") {
            const val = entry.data || entry.base64 || entry.url
            if (val && typeof val === "string") rawCandidates.push(val)
          }
        }
      }
    } catch {}

    if (rawCandidates.length === 0 && trimmed.includes("data:image")) {
      let searchIdx = 0
      while (searchIdx < trimmed.length) {
        const found = trimmed.indexOf("data:image", searchIdx)
        if (found === -1) break
        const nextData = trimmed.indexOf("data:image", found + 10)
        let endIdx = trimmed.indexOf('"', found)
        const singleQuoteEnd = trimmed.indexOf("'", found)
        const newlineEnd = trimmed.indexOf("\n", found)

        let candidateEnd = nextData !== -1 ? nextData : trimmed.length
        if (endIdx !== -1 && endIdx < candidateEnd) candidateEnd = endIdx
        if (singleQuoteEnd !== -1 && singleQuoteEnd < candidateEnd) candidateEnd = singleQuoteEnd
        if (newlineEnd !== -1 && newlineEnd < candidateEnd) candidateEnd = newlineEnd

        let segment = trimmed.substring(found, candidateEnd).trim()
        if (segment.endsWith(",")) segment = segment.slice(0, -1).trim()
        if (segment.length > 50) {
          rawCandidates.push(segment)
        }
        searchIdx = candidateEnd + 1
      }
    }

    if (rawCandidates.length === 0) {
      const parts = trimmed.includes("\n") ? trimmed.split(/[\r\n]+/) : trimmed.split(",")
      for (const part of parts) {
        const trimmedPart = part.trim()
        if (trimmedPart.length > 50) {
          rawCandidates.push(trimmedPart)
        }
      }
    }

    const dataUrls = rawCandidates
      .slice(0, 20)
      .map(sanitizeBase64String)
      .filter((s) => s.length > 100)

    if (dataUrls.length > 0) {
      try {
        sessionStorage.removeItem("pending_paste")
        setIsPendingPaste(false)
      } catch {}
      const selected = dataUrls.slice(0, 20)
      const mapped = selected.map((url, idx) => ({
        id: `paste_${Date.now()}_${idx}`,
        type: "image" as const,
        dataUrl: url,
      }))
      loadExistingMedia(mapped)
      onMediaReady(mapped)
      if (!isReady) {
        onToggleReady()
      }
      setStatusMessage(`${mapped.length} photos ready!`)
    } else {
      setStatusMessage("Could not decode photos from clipboard.")
    }
  }

  const handlePasteFromClipboard = async () => {
    setIsPreparing(true)
    setStatusMessage("Reading photos from clipboard...")
    try {
      const dataUrls: string[] = []

      if (navigator.clipboard && navigator.clipboard.read) {
        try {
          const clipboardItems = await navigator.clipboard.read()
          for (const item of clipboardItems) {
            for (const type of item.types) {
              if (type === "text/plain" || type === "text/uri-list") {
                const blob = await item.getType(type)
                const text = await blob.text()
                handlePastedText(text)
                return
              } else if (type.startsWith("image/")) {
                const blob = await item.getType(type)
                const file = new File([blob], `pasted_${Date.now()}_${dataUrls.length}.jpg`, { type: blob.type })
                const compressed = await compressImage(file, 800, 0.65)
                dataUrls.push(compressed.dataUrl)
              }
            }
          }
        } catch (e) {
          console.warn(e)
        }
      }

      if (dataUrls.length === 0 && navigator.clipboard && navigator.clipboard.readText) {
        try {
          const text = await navigator.clipboard.readText()
          if (text) {
            handlePastedText(text)
            return
          }
        } catch (e) {
          console.warn(e)
        }
      }

      if (dataUrls.length > 0) {
        const selected = dataUrls.slice(0, 20)
        const mapped = selected.map((url, idx) => ({
          id: `paste_${Date.now()}_${idx}`,
          type: "image" as const,
          dataUrl: url,
        }))
        loadExistingMedia(mapped)
        onMediaReady(mapped)
        if (!isReady) {
          onToggleReady()
        }
        setStatusMessage(`${mapped.length} photos ready!`)
      } else {
        setStatusMessage("Tap button and select 'Paste' (Einsetzen) from popup.")
      }
    } catch (err: any) {
      console.error(err)
      setStatusMessage("Tap button and select 'Paste' (Einsetzen) from popup.")
    } finally {
      setIsPreparing(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleAndroidPick = async () => {
    setIsPreparing(true)
    setPermissionDenied(false)
    setStatusMessage("Picking 20 random media...")
    try {
      if (hasAndroidBridge()) {
        const granted = await requestAndroidGalleryPermission()
        if (!granted) {
          setPermissionDenied(true)
          setStatusMessage("Gallery permission required.")
          setIsPreparing(false)
          return
        }

        const assets = await pickRandom20Android(mediaType)
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
          setStatusMessage("20 items picked!")
          setIsPreparing(false)
          return
        }
        setStatusMessage("No media found on device.")
      } else {
        setStatusMessage("Android native gallery bridge not available.")
      }
    } catch (e: any) {
      console.error(e)
      setStatusMessage("Failed to pick media automatically.")
    } finally {
      setIsPreparing(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleAndroidReroll = async () => {
    setIsPreparing(true)
    setStatusMessage("Rerolling 20 items...")
    try {
      if (hasAndroidBridge()) {
        const assets = await rerollAndroid(mediaType)
        if (assets && assets.length > 0) {
          const mapped = assets.map((a, idx) => ({
            id: a.id || String(idx),
            type: a.type,
            dataUrl: a.dataUrl,
          }))
          loadExistingMedia(mapped)
          onMediaReady(mapped)
          setStatusMessage("Rerolled 20 items!")
          setIsPreparing(false)
          return
        }
        setStatusMessage("No media found on device.")
      } else {
        setStatusMessage("Android native gallery bridge not available.")
      }
    } catch (e: any) {
      console.error(e)
      setStatusMessage("Failed to reroll media.")
    } finally {
      setIsPreparing(false)
      setTimeout(() => setStatusMessage(null), 4000)
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
        <h3 className="font-bold text-white text-base">Media Selection</h3>
        {items.length > 0 && (
          <Badge variant="success" size="md">
            {approvedItems.length} Ready
          </Badge>
        )}
      </div>

      {isPreparing && (
        <div className="w-full bg-[#1e1b38] border border-violet-500/30 rounded-2xl p-4 shadow-xl flex items-center gap-3">
          <RotateCw size={18} className="text-violet-400 animate-spin" />
          <div className="text-sm font-bold text-white">Loading media...</div>
        </div>
      )}

      {statusMessage && (
        <div className="p-3 rounded-xl bg-violet-950/80 border border-violet-500/50 text-xs text-violet-200 flex items-center gap-2">
          <Sparkles size={16} className="text-amber-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="space-y-3">
          {isAndroidDevice ? (
            <>
              {permissionDenied && (
                <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-amber-400 shrink-0" />
                    <span>Permission required.</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleAndroidPick}
                      className="px-3 py-1.5 bg-amber-500 text-black font-bold rounded-lg text-xs"
                    >
                      Grant Access
                    </button>
                    <button
                      type="button"
                      onClick={openAndroidAppSettings}
                      className="px-2.5 py-1.5 bg-white/10 text-white font-medium rounded-lg text-xs"
                    >
                      Settings
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleAndroidPick}
                disabled={isPreparing}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 active:scale-98 text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                    <Smartphone size={24} />
                  </div>
                  <div className="font-extrabold text-white text-base">
                    Pick 20 Random Media
                  </div>
                </div>
                <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0">
                  Pick 20
                </span>
              </button>
            </>
          ) : (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 active:scale-98 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                    <ImageIcon size={24} />
                  </div>
                  <div>
                    <div className="font-extrabold text-white text-base">
                      Select Photos from Device
                    </div>
                    <div className="text-xs text-emerald-200/90 font-normal mt-0.5">
                      Choose from Photo Library
                    </div>
                  </div>
                </div>
                <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0">
                  Select
                </span>
              </button>

              {isPendingPaste ? (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onPaste={handleNativePaste}
                  onClick={handlePasteFromClipboard}
                  className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 border border-blue-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 active:scale-98 text-left cursor-pointer outline-none shadow-lg shadow-blue-500/20 animate-pulse"
                >
                  <div className="flex items-center gap-3 pointer-events-none">
                    <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                      <Clipboard size={24} />
                    </div>
                    <div>
                      <div className="font-extrabold text-white text-base">
                        Paste 20 Photos
                      </div>
                      <div className="text-xs text-blue-200/90 font-normal mt-0.5">
                        Tap here to paste from Shortcut
                      </div>
                    </div>
                  </div>
                  <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0 pointer-events-none">
                    Paste Now
                  </span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleLaunchShortcut}
                    className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 border border-blue-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 active:scale-98 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                        <Sparkles size={24} />
                      </div>
                      <div>
                        <div className="font-extrabold text-white text-base">
                          Get 20 Photos from Shortcut
                        </div>
                        <div className="text-xs text-blue-200/90 font-normal mt-0.5">
                          Picks random photos via iOS Shortcut
                        </div>
                      </div>
                    </div>
                    <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0">
                      Get 20
                    </span>
                  </button>

                  <a
                    href={SHORTCUT_INSTALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-3.5 rounded-2xl bg-violet-950/50 hover:bg-violet-900/60 border border-violet-500/30 text-violet-200 text-xs font-bold flex items-center justify-between gap-3 transition-all active:scale-98"
                  >
                    <span className="text-sm font-bold text-white">Install Shortcut (First Time Only)</span>
                    <span className="text-xs bg-violet-500/20 text-violet-300 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
                      Install <ExternalLink size={12} />
                    </span>
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-300 font-bold mb-1 px-1">
            <span className="text-violet-300 font-black">
              Selected Items ({approvedItems.length})
            </span>
            <button
              type="button"
              onClick={() => setIsPreviewModalOpen(true)}
              className="text-xs text-violet-400 hover:text-white flex items-center gap-1 font-bold"
            >
              <Eye size={14} /> Review
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
                    alt="Selected media"
                    className="w-full h-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => handleRemoveSingle(item.id, e)}
                  className="absolute top-1 right-1 p-1 rounded-md bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
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

            {isAndroidDevice ? (
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={handleAndroidReroll}
                disabled={isPreparing}
                className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30 text-xs py-2"
              >
                <RefreshCw size={14} /> Reroll
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={() => fileInputRef.current?.click()}
                  className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30 text-xs py-2"
                >
                  <ImageIcon size={14} /> Select Different
                </Button>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onPaste={handleNativePaste}
                  onClick={handlePasteFromClipboard}
                  className="w-full p-2.5 rounded-xl border border-blue-500/30 text-blue-300 hover:bg-blue-950/30 text-xs flex items-center justify-center gap-2 cursor-pointer font-bold outline-none"
                >
                  <Clipboard size={14} className="pointer-events-none" />
                  <span className="pointer-events-none">Paste New</span>
                </div>
              </div>
            )}
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
