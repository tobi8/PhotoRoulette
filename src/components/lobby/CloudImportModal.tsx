import React, { useRef, useState } from 'react'
import { Folder, Link, Cloud, Sparkles, X, Check, Database, AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { fisherYatesShuffle } from '../../services/photoVaultService'

interface CloudImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportFiles: (files: File[]) => Promise<void>
  onImportUrls: (urls: Array<{ id: string; url: string; name?: string }>) => Promise<void>
}

export const CloudImportModal: React.FC<CloudImportModalProps> = ({
  isOpen,
  onClose,
  onImportFiles,
  onImportUrls,
}) => {
  const folderInputRef = useRef<HTMLInputElement>(null)
  const driveFilesInputRef = useRef<HTMLInputElement>(null)
  const [pastedLinks, setPastedLinks] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Handle folder selection via webkitdirectory (Google Drive synced folder, iCloud, or local folder)
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const allFiles = Array.from(e.target.files)

      // Filter only image and video files
      const mediaFiles = allFiles.filter((f) => {
        const isMediaMime = f.type.startsWith('image/') || f.type.startsWith('video/')
        const isMediaExt = /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v)$/i.test(f.name)
        return isMediaMime || isMediaExt
      })

      if (mediaFiles.length === 0) {
        setErrorMessage('No photos or videos found in the selected folder.')
        return
      }

      setIsProcessing(true)
      setErrorMessage(null)
      try {
        // Randomly shuffle all files from the folder
        const shuffled = fisherYatesShuffle(mediaFiles)
        await onImportFiles(shuffled)
        setSuccessMessage(`Imported ${mediaFiles.length} photos from folder!`)
        setTimeout(() => {
          onClose()
          setSuccessMessage(null)
          setIsProcessing(false)
        }, 1200)
      } catch (err) {
        setErrorMessage('Failed to import folder photos.')
        setIsProcessing(false)
      }
    }
  }

  // Handle pasted Google Drive or image URLs
  const handleImportLinks = async () => {
    if (!pastedLinks.trim()) return

    setIsProcessing(true)
    setErrorMessage(null)

    try {
      const lines = pastedLinks.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean)
      const importedUrls: Array<{ id: string; url: string; name?: string }> = []

      for (const line of lines) {
        // 1. Google Drive link format: /file/d/FILE_ID or id=FILE_ID
        const driveMatch = line.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || line.match(/id=([a-zA-Z0-9_-]+)/)
        if (driveMatch && driveMatch[1]) {
          const fileId = driveMatch[1]
          // Standard Google Drive high-resolution thumbnail endpoint
          const directUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`
          importedUrls.push({
            id: `gdrive-${fileId}`,
            url: directUrl,
            name: `Google Drive Photo (${fileId.slice(0, 5)})`,
          })
          continue
        }

        // 2. Direct web image link
        if (/^https?:\/\/.+\.(jpe?g|png|webp|gif)/i.test(line) || line.startsWith('https://')) {
          importedUrls.push({
            id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url: line,
          })
        }
      }

      if (importedUrls.length === 0) {
        setErrorMessage('Could not find valid Google Drive file links or image URLs. Make sure links are set to "Anyone with link can view".')
        setIsProcessing(false)
        return
      }

      // Shuffle imported links
      const shuffled = fisherYatesShuffle(importedUrls)
      await onImportUrls(shuffled)

      setSuccessMessage(`Imported ${importedUrls.length} cloud photos!`)
      setTimeout(() => {
        onClose()
        setPastedLinks('')
        setSuccessMessage(null)
        setIsProcessing(false)
      }, 1200)
    } catch (err) {
      setErrorMessage('Failed to load photos from the provided links.')
      setIsProcessing(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Photos from Drive or Folder" maxWidth="md">
      <div className="space-y-4 text-white">
        <p className="text-xs text-gray-300">
          Load a collection of photos directly from a synced folder or Google Drive. The app will randomly select photos for your game deck!
        </p>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
            <Check size={16} className="shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Hidden inputs: Mobile Drive files & Desktop directory */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in HTML5 but missing in React HTMLAttributes
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleFolderSelect}
        />

        <input
          ref={driveFilesInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFolderSelect}
        />

        {/* Option 1: Mobile Phone Google Drive Folder (Android / iPhone) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-teal-950/30 to-slate-900 border border-emerald-500/30 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 text-lg">
              📱
            </div>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <span>Google Drive on Phone / Tablet</span>
                <span className="text-[10px] bg-emerald-500/25 text-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold">
                  Easiest on Mobile
                </span>
              </div>
              <div className="text-[11px] text-gray-300 mt-0.5">
                Android Files / iPhone Files & Google Drive app
              </div>
            </div>
          </div>

          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 text-[11px] text-gray-300 space-y-1">
            <div>🤖 <strong>Android:</strong> Tap below → tap <span className="text-white">Files</span> → open menu (☰) → tap <strong className="text-emerald-300">Google Drive</strong> → open folder → tap <strong>⋮</strong> & <strong>Select all</strong></div>
            <div>🍎 <strong>iPhone:</strong> Tap below → tap <span className="text-white">Choose Files</span> → tap <strong className="text-emerald-300">Google Drive</strong> under Locations → open folder → tap <strong>Select All</strong></div>
          </div>

          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => driveFilesInputRef.current?.click()}
            disabled={isProcessing}
            className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-xs py-3 font-black shadow-lg"
          >
            <span>📱 Open Drive Folder on Phone</span>
          </Button>
        </div>

        {/* Option 2: Desktop Computer Folder (Mac / PC) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-900/30 to-indigo-950/40 border border-violet-500/30 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-400/40 flex items-center justify-center text-violet-300 text-lg">
              💻
            </div>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <span>Entire Folder on Computer (Mac / PC)</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                Picks entire folder via Google Drive for Desktop or local disk
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => folderInputRef.current?.click()}
            disabled={isProcessing}
            className="text-xs py-2.5 font-bold border-violet-500/40 text-violet-200"
          >
            <Folder size={15} />
            <span>💻 Pick Entire Folder on Computer</span>
          </Button>
        </div>

        {/* Option 2: Paste Google Drive Links */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Link size={20} />
            </div>
            <div>
              <div className="font-bold text-sm text-white">
                Paste Google Drive Links / Image URLs
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                Paste shared links (set to "Anyone with the link can view")
              </div>
            </div>
          </div>

          <textarea
            value={pastedLinks}
            onChange={(e) => setPastedLinks(e.target.value)}
            placeholder="https://drive.google.com/file/d/1a2b3c.../view&#10;https://drive.google.com/file/d/4d5e6f.../view"
            rows={3}
            className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 font-mono resize-none"
          />

          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleImportLinks}
            disabled={isProcessing || !pastedLinks.trim()}
            className="text-xs py-2.5 font-bold"
          >
            <Cloud size={15} />
            <span>Import from Links</span>
          </Button>
        </div>

        <div className="pt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
