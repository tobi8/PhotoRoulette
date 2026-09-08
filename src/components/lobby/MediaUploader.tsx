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
  Star,
  ExternalLink,
  RefreshCw,
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
import { compressImage } from "../../utils/imageCompression"
import { analyzeImageHeuristics } from "../../utils/documentHeuristics"

interface MediaUploaderProps {
  onMediaReady: (mediaItems: Array<{ id: string; type: "image" | "video"; dataUrl: string; isGuaranteed?: boolean }>) => void
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
  const guaranteedInputRef = useRef<HTMLInputElement>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isPendingPaste, setIsPendingPaste] = useState<boolean>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search)
      if (searchParams.get("source") === "shortcut") return true
      const storedTime = sessionStorage.getItem("pending_paste_time")
      if (storedTime && Date.now() - parseInt(storedTime, 10) < 300000) {
        return sessionStorage.getItem("pending_paste") === "true"
      }
      sessionStorage.removeItem("pending_paste")
      sessionStorage.removeItem("pending_paste_time")
      return false
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search)
      if (searchParams.get("source") === "shortcut") {
        setIsPendingPaste(true)
      } else {
        const storedTime = sessionStorage.getItem("pending_paste_time")
        if (storedTime && Date.now() - parseInt(storedTime, 10) < 300000 && sessionStorage.getItem("pending_paste") === "true") {
          setIsPendingPaste(true)
        } else {
          sessionStorage.removeItem("pending_paste")
          sessionStorage.removeItem("pending_paste_time")
          setIsPendingPaste(false)
        }
      }
    } catch {}
  }, [])

  const handleLaunchShortcut = () => {
    try {
      sessionStorage.setItem("pending_paste", "true")
      sessionStorage.setItem("pending_paste_time", Date.now().toString())
      setIsPendingPaste(true)
      const currentOrigin = window.location.origin
      const currentPath = window.location.pathname
      const effectiveRoom = roomId || "ROOM"
      const effectiveUser = userId || "USER"
      const returnUrl = `${currentOrigin}${currentPath}?room=${encodeURIComponent(effectiveRoom)}&user=${encodeURIComponent(effectiveUser)}&source=shortcut#${encodeURIComponent(effectiveRoom)}`
      const shortcutUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(returnUrl)}`
      window.location.href = shortcutUrl
    } catch (err) {
      console.error(err)
    }
  }

  const isAndroidDevice = useMemo(() => isAndroid(), [])

  const {
    items,
    loadExistingMedia,
    setGuaranteedPhoto,
    excludeDocuments,
    toggleExclude,
    removePhoto,
    replaceExcludedMedia,
    getApprovedMedia,
  } = useDocumentFilter()

  const hasGuaranteed = useMemo(() => items.some((i) => i.isGuaranteed), [items])

  useEffect(() => {
    if (items.length > 0) {
      const approved = getApprovedMedia(mediaType)
      onMediaReady(approved)
    }
  }, [items, mediaType, getApprovedMedia, onMediaReady])

  const handleGuaranteedPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setIsPreparing(true)
    setStatusMessage("Processing guaranteed photo...")
    try {
      const res = await compressImage(file, 800, 0.65)
      const guaranteedItem = {
        id: `guaranteed_${Date.now()}`,
        type: "image" as const,
        dataUrl: res.dataUrl,
      }
      setGuaranteedPhoto(guaranteedItem)
      if (!isReady) {
        onToggleReady()
      }
      setStatusMessage("1 Guaranteed photo selected!")
    } catch (err) {
      console.error(err)
      setStatusMessage("Failed to process photo.")
    } finally {
      setIsPreparing(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const autoExcludeBoringDocuments = async (mediaList: Array<{ id: string; type: 'image' | 'video'; dataUrl: string }>) => {
    try {
      const results = await Promise.all(
        mediaList.map(async (item) => {
          try {
            const res = await analyzeImageHeuristics(item.dataUrl)
            return res.isDocument ? item.id : null
          } catch {
            return null
          }
        })
      )
      const docIds = results.filter((id): id is string => id !== null)
      if (docIds.length > 0) {
        excludeDocuments(docIds)
        setStatusMessage(`AI auto-excluded ${docIds.length} boring document${docIds.length > 1 ? 's' : ''}!`)
      }
    } catch {}
  }

  const processAndLoadFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return
    setIsPreparing(true)
    setStatusMessage("Processing photos...")

    try {
      const imageFiles = fileList.filter((f) => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name))
      const shuffled = imageFiles.sort(() => Math.random() - 0.5).slice(0, 20)
      const processed = await Promise.all(
        shuffled.map(async (file, idx) => {
          const res = await compressImage(file, 800, 0.65)
          return {
            id: `local_${Date.now()}_${idx}`,
            type: "image" as const,
            dataUrl: res.dataUrl,
          }
        })
      )

      loadExistingMedia(processed)
      onMediaReady(processed)
      if (!isReady) {
        onToggleReady()
      }
      setStatusMessage(`${processed.length} photos loaded!`)
      await autoExcludeBoringDocuments(processed)
    } catch (err) {
      console.error(err)
      setStatusMessage("Failed to process photos.")
    } finally {
      setIsPreparing(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleNativePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (items && items.length > 0) {
      const extractedFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === "file") {
          const f = item.getAsFile()
          if (f && f.type.startsWith("image/")) {
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
        (f) => f.type.startsWith("image/")
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
    cleaned = cleaned.replace(/^,+|,+$/g, "")
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

  const handlePastedText = async (text: string) => {
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
        const quoteIdx = trimmed.indexOf('"', found)
        const singleQuoteIdx = trimmed.indexOf("'", found)

        let candidateEnd = trimmed.length

        if (quoteIdx !== -1 && (nextData === -1 || quoteIdx < nextData)) {
          candidateEnd = quoteIdx
        } else if (singleQuoteIdx !== -1 && (nextData === -1 || singleQuoteIdx < nextData)) {
          candidateEnd = singleQuoteIdx
        } else if (nextData !== -1) {
          candidateEnd = nextData
        } else {
          const bracket = trimmed.lastIndexOf("]")
          if (bracket > found) {
            candidateEnd = bracket
          }
        }

        const segment = trimmed.substring(found, candidateEnd).trim()
        if (segment.length > 50) {
          rawCandidates.push(segment)
        }

        searchIdx = nextData !== -1 ? nextData : (candidateEnd + 1)
      }
    }

    if (rawCandidates.length === 0) {
      const lines = trimmed.split(/[\r\n]+/)
      for (const line of lines) {
        const trimmedLine = line.trim()
        if (trimmedLine.length > 50) {
          rawCandidates.push(trimmedLine)
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
        sessionStorage.removeItem("pending_paste_time")
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
      await autoExcludeBoringDocuments(mapped)
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
        await autoExcludeBoringDocuments(mapped)
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
          await autoExcludeBoringDocuments(mapped)
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
          await autoExcludeBoringDocuments(mapped)
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

  const handleAndroidReplaceExcluded = async () => {
    const excludedCount = items.filter((i) => i.isExcluded).length
    if (excludedCount === 0) {
      setStatusMessage("No excluded photos to replace!")
      setTimeout(() => setStatusMessage(null), 3000)
      return
    }

    setIsPreparing(true)
    setStatusMessage(`Replacing ${excludedCount} excluded photo${excludedCount > 1 ? "s" : ""}...`)
    try {
      if (hasAndroidBridge()) {
        const assets = await rerollAndroid(mediaType)
        if (assets && assets.length > 0) {
          const currentIds = new Set(items.map((i) => i.id))
          const fresh = assets.filter((a) => !currentIds.has(a.id)).slice(0, excludedCount)
          const replacements = (fresh.length > 0 ? fresh : assets.slice(0, excludedCount)).map((a, idx) => ({
            id: `rep_${Date.now()}_${idx}`,
            type: a.type,
            dataUrl: a.dataUrl,
          }))
          replaceExcludedMedia(replacements)
          setStatusMessage(`Replaced ${replacements.length} photo${replacements.length > 1 ? "s" : ""}!`)
          await autoExcludeBoringDocuments(replacements)
          setIsPreparing(false)
          return
        }
        setStatusMessage("No replacement media found.")
      } else {
        setStatusMessage("Android gallery bridge not available.")
      }
    } catch (e: any) {
      console.error(e)
      setStatusMessage("Failed to replace excluded photos.")
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
    <div className="w-full bg-[#171527] border border-white/10 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-xl space-y-3 sm:space-y-4">
      <input
        ref={guaranteedInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={handleGuaranteedPhotoChange}
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
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 active:scale-98 text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <div className="font-extrabold text-white text-base">
                      Pick 20 Random Photos
                    </div>
                    <div className="text-xs text-emerald-200/90 font-normal mt-0.5">
                      Instantly selects 20 photos automatically
                    </div>
                  </div>
                </div>
                <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0">
                  Pick 20
                </span>
              </button>
            </>
          ) : (
            <div className="space-y-2.5">
              {!isPendingPaste ? (
                <button
                  type="button"
                  onClick={handleLaunchShortcut}
                  className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 border border-blue-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 active:scale-98 text-left cursor-pointer shadow-lg shadow-blue-500/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <div className="font-extrabold text-white text-base">
                        Upload
                      </div>
                      <div className="text-xs text-blue-200/90 font-normal mt-0.5">
                        Picks 20 random photos via Shortcut
                      </div>
                    </div>
                  </div>
                  <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0">
                    Upload
                  </span>
                </button>
              ) : (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onPaste={handleNativePaste}
                  onClick={handlePasteFromClipboard}
                  className="w-full p-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-400/40 text-white font-bold transition-all flex items-center justify-between gap-3 active:scale-98 text-left cursor-pointer outline-none shadow-lg shadow-indigo-500/20"
                >
                  <div className="flex items-center gap-3 pointer-events-none">
                    <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                      <Clipboard size={24} />
                    </div>
                    <div>
                      <div className="font-extrabold text-white text-base">
                        Paste
                      </div>
                      <div className="text-xs text-indigo-200/90 font-normal mt-0.5">
                        Tap here to paste from Shortcut
                      </div>
                    </div>
                  </div>
                  <span className="text-xs bg-white/20 text-white px-3.5 py-1.5 rounded-full font-bold shrink-0 pointer-events-none">
                    Paste
                  </span>
                </div>
              )}

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
              className="text-xs text-violet-400 hover:text-white flex items-center gap-1 font-bold cursor-pointer"
            >
              <Eye size={14} /> Review
            </button>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-2.5 p-2 bg-black/30 rounded-2xl border border-white/5">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => toggleExclude(item.id)}
                className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all active:scale-95 group border bg-slate-800 ${
                  item.isGuaranteed
                    ? "border-amber-400/80 ring-2 ring-amber-400/50"
                    : item.isExcluded
                    ? "border-red-500/50 opacity-40 grayscale"
                    : "border-white/15 hover:border-white/40"
                }`}
              >
                <img
                  src={item.dataUrl}
                  alt="Selected media"
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
                {item.isGuaranteed && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-black flex items-center gap-0.5 shadow-md">
                    <Star size={9} className="fill-slate-950" />
                    <span>100%</span>
                  </div>
                )}
                {item.isExcluded && (
                  <div className="absolute inset-0 bg-red-950/60 flex items-center justify-center">
                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-bold shadow">
                      Excluded
                    </span>
                  </div>
                )}
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
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={() => guaranteedInputRef.current?.click()}
                  className="border-amber-500/40 text-amber-300 hover:bg-amber-950/30 text-xs py-2.5 font-bold"
                >
                  <Star size={14} className={hasGuaranteed ? "fill-amber-400 text-amber-400" : ""} />
                  <span className="truncate">{hasGuaranteed ? "Change Guaranteed Photo" : "1 Guaranteed Photo"}</span>
                </Button>
                <div className="grid grid-cols-2 gap-2">
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
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={handleAndroidReplaceExcluded}
                    disabled={isPreparing || !items.some((i) => i.isExcluded)}
                    className="border-blue-500/30 text-blue-300 hover:bg-blue-950/30 text-xs py-2 disabled:opacity-40"
                  >
                    <Sparkles size={14} /> Replace Excluded
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={() => guaranteedInputRef.current?.click()}
                  className="border-amber-500/40 text-amber-300 hover:bg-amber-950/30 text-xs py-2.5 font-bold"
                >
                  <Star size={14} className={hasGuaranteed ? "fill-amber-400 text-amber-400" : ""} />
                  <span className="truncate">{hasGuaranteed ? "Change Guaranteed Photo" : "1 Guaranteed Photo"}</span>
                </Button>
                {!isPendingPaste ? (
                  <button
                    type="button"
                    onClick={handleLaunchShortcut}
                    className="w-full p-2.5 rounded-xl border border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/30 text-xs flex items-center justify-center gap-1.5 cursor-pointer font-bold transition-all"
                  >
                    <Sparkles size={14} />
                    <span>Upload</span>
                  </button>
                ) : (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onPaste={handleNativePaste}
                    onClick={handlePasteFromClipboard}
                    className="w-full p-2.5 rounded-xl border border-blue-500/30 text-blue-300 hover:bg-blue-950/30 text-xs flex items-center justify-center gap-1.5 cursor-pointer font-bold outline-none transition-all"
                  >
                    <Clipboard size={14} className="pointer-events-none" />
                    <span className="pointer-events-none">Paste</span>
                  </div>
                )}
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
