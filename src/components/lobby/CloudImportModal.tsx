import React, { useRef, useState, useEffect } from 'react'
import { Folder, Cloud, Sparkles, Check, AlertCircle, HardDrive, UploadCloud, Settings, Key } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { fisherYatesShuffle } from '../../services/photoVaultService'
import {
  openGoogleDriveOnlinePicker,
  getSavedGoogleClientId,
  saveGoogleClientId,
} from '../../services/googleDrivePickerService'

interface CloudImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportFiles: (files: File[]) => Promise<void>
}

export const CloudImportModal: React.FC<CloudImportModalProps> = ({
  isOpen,
  onClose,
  onImportFiles,
}) => {
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pickerStatus, setPickerStatus] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Google OAuth Client ID setup state
  const [savedClientId, setSavedClientId] = useState('')
  const [clientIdInput, setClientIdInput] = useState('')
  const [showClientIdSetup, setShowClientIdSetup] = useState(false)

  useEffect(() => {
    const id = getSavedGoogleClientId()
    setSavedClientId(id)
    setClientIdInput(id)
  }, [isOpen])

  // Handle folder selection via webkitdirectory (Google Drive synced folder, iCloud, or local disk)
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const allFiles = Array.from(e.target.files)

      // Filter only image and video files (including HEIC / HEIF)
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
        const shuffled = fisherYatesShuffle(mediaFiles)
        await onImportFiles(shuffled)
        setSuccessMessage(`Imported ${mediaFiles.length} photos from folder!`)
        setTimeout(() => {
          onClose()
          setSuccessMessage(null)
          setIsProcessing(false)
        }, 1200)
      } catch {
        setErrorMessage('Failed to import folder photos.')
        setIsProcessing(false)
      }
    }
  }

  // Handle Drag & Drop from Google Drive or Desktop
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    setIsProcessing(true)
    setErrorMessage(null)
    setPickerStatus('Reading dropped files...')

    try {
      const files: File[] = []
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const items = Array.from(e.dataTransfer.items)
        for (const item of items) {
          const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null
          if (entry) {
            await readEntryRecursive(entry, files)
          } else {
            const f = item.getAsFile()
            if (f) files.push(f)
          }
        }
      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        files.push(...Array.from(e.dataTransfer.files))
      }

      const mediaFiles = files.filter((f) => {
        const isMediaMime = f.type.startsWith('image/') || f.type.startsWith('video/')
        const isMediaExt = /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v)$/i.test(f.name)
        return isMediaMime || isMediaExt
      })

      if (mediaFiles.length === 0) {
        setErrorMessage('No photos found in the dropped items.')
        setIsProcessing(false)
        setPickerStatus(null)
        return
      }

      const shuffled = fisherYatesShuffle(mediaFiles)
      await onImportFiles(shuffled)
      setSuccessMessage(`Imported ${mediaFiles.length} photos successfully!`)
      setTimeout(() => {
        onClose()
        setSuccessMessage(null)
        setIsProcessing(false)
        setPickerStatus(null)
      }, 1200)
    } catch {
      setErrorMessage('Failed to read dropped files.')
      setIsProcessing(false)
      setPickerStatus(null)
    }
  }

  const readEntryRecursive = async (entry: any, outFiles: File[]): Promise<void> => {
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            outFiles.push(file)
            resolve()
          },
          () => resolve()
        )
      })
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader()
      const readNextBatch = async (): Promise<any[]> => {
        return new Promise((resolve) => {
          dirReader.readEntries(
            (entries: any[]) => resolve(entries),
            () => resolve([])
          )
        })
      }
      let batch = await readNextBatch()
      while (batch && batch.length > 0) {
        for (const child of batch) {
          await readEntryRecursive(child, outFiles)
        }
        batch = await readNextBatch()
      }
    }
  }

  // Handle Online Google Drive Picker
  const handleOpenGoogleDrive = async () => {
    const activeClientId = clientIdInput.trim() || savedClientId
    if (!activeClientId) {
      setShowClientIdSetup(true)
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)
    setPickerStatus('Connecting to Google Drive...')

    try {
      const files = await openGoogleDriveOnlinePicker({
        clientId: activeClientId,
        onProgress: (status) => setPickerStatus(status),
      })

      if (!files || files.length === 0) {
        setIsProcessing(false)
        setPickerStatus(null)
        return
      }

      const shuffled = fisherYatesShuffle(files)
      await onImportFiles(shuffled)
      setSuccessMessage(`Imported ${files.length} photos from Google Drive!`)
      setTimeout(() => {
        onClose()
        setSuccessMessage(null)
        setIsProcessing(false)
        setPickerStatus(null)
      }, 1200)
    } catch (err: any) {
      console.error('Google Drive error:', err)
      if (err.message === 'MISSING_CLIENT_ID') {
        setShowClientIdSetup(true)
      } else {
        setErrorMessage(err.message || 'Failed to load photos from Google Drive.')
      }
      setIsProcessing(false)
      setPickerStatus(null)
    }
  }

  const handleSaveClientId = () => {
    saveGoogleClientId(clientIdInput)
    setSavedClientId(clientIdInput.trim())
    setShowClientIdSetup(false)
    if (clientIdInput.trim()) {
      handleOpenGoogleDrive()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Photos from Google Drive or Folder" maxWidth="md">
      <div className="space-y-4 text-white">
        <p className="text-xs text-gray-300 leading-relaxed">
          Select photos or entire folders directly from Google Drive online or your computer. The app randomly selects mystery photos for your game deck!
        </p>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {pickerStatus && (
          <div className="p-3 rounded-xl bg-violet-950/50 border border-violet-500/40 text-xs text-violet-200 flex items-center gap-2 animate-pulse">
            <Sparkles size={16} className="shrink-0 text-amber-400" />
            <span>{pickerStatus}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
            <Check size={16} className="shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Hidden directory input */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in modern browsers
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleFolderSelect}
        />

        {/* Option 1: Google Drive Online Cloud Picker */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-950/40 via-indigo-950/30 to-slate-900 border border-blue-500/30 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 text-xl shadow-inner">
                🌐
              </div>
              <div>
                <div className="font-bold text-sm text-white flex items-center gap-2">
                  <span>Google Drive Online</span>
                  <span className="text-[10px] bg-blue-500/25 text-blue-300 px-2 py-0.5 rounded-full font-mono font-bold">
                    Cloud
                  </span>
                </div>
                <div className="text-[11px] text-gray-300 mt-0.5">
                  Browse your online Google Drive folders and see all files
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowClientIdSetup(!showClientIdSetup)}
              className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              title="Google Drive Settings"
            >
              <Settings size={15} />
            </button>
          </div>

          {/* Client ID Configuration Drawer */}
          {showClientIdSetup && (
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 text-xs text-gray-300">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Key size={13} className="text-amber-400" />
                <span>Google OAuth Client ID</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-tight">
                To connect directly to Google Drive online in your browser, enter your Google Cloud OAuth Client ID:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                  className="flex-1 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                />
                <Button variant="secondary" size="sm" onClick={handleSaveClientId} className="text-xs shrink-0">
                  Save
                </Button>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={handleOpenGoogleDrive}
            disabled={isProcessing}
            className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 text-xs py-3 font-black shadow-lg"
          >
            <UploadCloud size={16} />
            <span>🌐 Browse Google Drive Online</span>
          </Button>
        </div>

        {/* Option 2: Drag and Drop from Google Drive or Desktop */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`p-4 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer ${
            isDragging
              ? 'border-emerald-400 bg-emerald-950/30'
              : 'border-white/15 bg-white/[0.02] hover:border-violet-400/50 hover:bg-violet-950/10'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-400/30 flex items-center justify-center text-violet-300">
            <HardDrive size={20} />
          </div>
          <div>
            <div className="font-bold text-xs text-white">
              Drag & Drop Photos or Folders Here
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Drag photos straight from your online Google Drive tab or your files
            </div>
          </div>
        </div>

        {/* Option 3: Synced Google Drive Folder / Desktop Folder */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-900/30 to-indigo-950/40 border border-violet-500/30 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-400/40 flex items-center justify-center text-violet-300 text-xl">
              💻
            </div>
            <div>
              <div className="font-bold text-sm text-white">
                Synced Google Drive / Computer Folder
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

        <div className="pt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
