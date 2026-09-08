import { useCallback, useRef, useState } from 'react'
import { ExcludedMediaItem, MediaItem } from '../types/game'
import { processMediaFile, compressImageUrl } from '../utils/imageCompression'
import { analyzeImageHeuristics } from '../utils/documentHeuristics'
import { fisherYatesShuffle } from '../services/photoVaultService'

const DOCUMENT_KEYWORDS = [
  'document',
  'receipt',
  'invoice',
  'screenshot',
  'paper',
  'page',
  'letter',
  'text',
  'form',
  'passport',
  'identification',
  'credit card',
  'bill',
  'menu',
  'contract',
  'check',
  'ticket',
]

export interface ScanProgress {
  current: number
  total: number
  status: string
}

export type FilterResultItem = ExcludedMediaItem & { dataUrl: string; type: 'image' | 'video' }

export function useDocumentFilter() {
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress>({ current: 0, total: 0, status: '' })
  const [items, setItems] = useState<FilterResultItem[]>([])

  /**
   * Process uploaded files with automatic AI document analysis
   */
  const processFiles = useCallback(async (files: File[]): Promise<{
    accepted: MediaItem[]
    excluded: ExcludedMediaItem[]
  }> => {
    setIsScanning(true)
    setProgress({ current: 0, total: files.length, status: 'Preparing scanner...' })

    const results: Array<ExcludedMediaItem & { dataUrl: string; type: 'image' | 'video' }> = []

    // Process 2 files at a time to prevent mobile browser memory exhaustion
    const BATCH_SIZE = 2
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      setProgress({
        current: Math.min(i + batch.length, files.length),
        total: files.length,
        status: `Analyzing photos (${Math.min(i + batch.length, files.length)} of ${files.length})...`,
      })

      const batchResults = await Promise.all(
        batch.map(async (file, batchIdx) => {
          const fileIndex = i + batchIdx
          try {
            // 1. Compress media to JPEG
            const compressed = await processMediaFile(file)

            // 2. Run instant Canvas Heuristic AI analysis
            const heuristic = await analyzeImageHeuristics(compressed.thumbnailUrl, file.name)
            const isFlagged = compressed.type !== 'video' && heuristic.isDocument && heuristic.confidence >= 0.90
            const reason = isFlagged ? heuristic.reason : 'Verified safe photo'

            return {
              id: `media-${Date.now()}-${fileIndex}-${Math.random().toString(36).slice(2, 6)}`,
              file,
              previewUrl: compressed.thumbnailUrl,
              dataUrl: compressed.dataUrl,
              type: compressed.type,
              reason,
              confidence: heuristic.confidence,
              isExcluded: isFlagged,
            }
          } catch (err) {
            console.error(`Error processing file ${file.name}:`, err)
            return null
          }
        })
      )

      for (const res of batchResults) {
        if (res) results.push(res)
      }

      await new Promise((resolve) => setTimeout(resolve, 15))
    }

    setItems(results)
    setIsScanning(false)
    setProgress({ current: files.length, total: files.length, status: 'Scan complete!' })

    const accepted: MediaItem[] = results
      .filter((item) => !item.isExcluded)
      .map((item) => ({
        id: item.id,
        ownerId: '',
        ownerName: '',
        type: item.type,
        dataUrl: item.dataUrl,
        previewUrl: item.previewUrl,
      }))

    const excluded: ExcludedMediaItem[] = results.filter((item) => item.isExcluded)

    return { accepted, excluded }
  }, [])

  /**
   * Manually run AI document analysis only when explicitly requested by the user
   */
  const runAiScan = useCallback(async (): Promise<number> => {
    if (items.length === 0) return 0
    setIsScanning(true)
    setProgress({ current: 0, total: items.length, status: 'Scanning photos for documents...' })

    let foundDocuments = 0
    const updatedItems: FilterResultItem[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      setProgress({
        current: i + 1,
        total: items.length,
        status: `Checking photo ${i + 1} of ${items.length}...`,
      })

      try {
        const heuristic = await analyzeImageHeuristics(item.previewUrl || item.dataUrl, item.file?.name)
        const isDoc = item.type !== 'video' && heuristic.isDocument && heuristic.confidence >= 0.90
        if (isDoc) foundDocuments++
        updatedItems.push({
          ...item,
          isExcluded: isDoc,
          reason: isDoc ? heuristic.reason : 'Verified photo',
          confidence: heuristic.confidence,
        })
      } catch {
        updatedItems.push(item)
      }

      await new Promise((r) => setTimeout(r, 10))
    }

    setItems(updatedItems)
    setIsScanning(false)
    setProgress({ current: items.length, total: items.length, status: 'Document scan complete!' })
    return foundDocuments
  }, [items])

  /**
   * Process a list of image URLs (such as Google Drive direct links) without AI scanning
   */
  const processUrls = useCallback(async (urlItems: Array<{ id: string; url: string; name?: string }>): Promise<MediaItem[]> => {
    const accepted: MediaItem[] = []
    const newItems: FilterResultItem[] = []

    for (let i = 0; i < urlItems.length; i++) {
      try {
        const compressed = await compressImageUrl(urlItems[i].url)
        accepted.push({
          id: urlItems[i].id,
          ownerId: '',
          ownerName: '',
          type: 'image',
          dataUrl: compressed.dataUrl,
          previewUrl: compressed.thumbnailUrl,
        })
        newItems.push({
          id: urlItems[i].id,
          previewUrl: compressed.thumbnailUrl,
          dataUrl: compressed.dataUrl,
          type: 'image',
          reason: 'Cloud photo',
          confidence: 0,
          isExcluded: false,
        })
      } catch (err) {
        console.error('Failed to import URL:', urlItems[i].url, err)
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    setItems(newItems)
    return accepted
  }, [])

  /**
   * Allows user to un-exclude (restore) or manually exclude a photo in the review UI
   */
  const toggleExclude = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isExcluded: !item.isExcluded } : item))
    )
  }, [])

  /**
   * Delete a photo permanently from the pool
   */
  const removePhoto = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  /**
   * Clear all loaded photos
   */
  const clearPhotos = useCallback(() => {
    setItems([])
    setProgress({ current: 0, total: 0, status: '' })
  }, [])

  /**
   * Load mock demo photos (including one mock receipt) with automatic AI scan
   */
  const loadMockPhotosWithTestDocument = useCallback(async () => {
    setIsScanning(true)
    setProgress({ current: 0, total: 6, status: 'Generating demo party deck...' })

    const { getMockPartyPhotos, generateMockPhoto } = await import('../utils/mockData')
    const partyItems = getMockPartyPhotos().slice(0, 5)

    // Generate one simulated receipt
    const mockReceipt = {
      id: `mock-doc-${Date.now()}`,
      type: 'image' as const,
      dataUrl: generateMockPhoto('Mock Receipt', '#ffffff', '🧾', true),
    }

    const allToScan = [...partyItems, mockReceipt]
    const scanned: Array<ExcludedMediaItem & { dataUrl: string; type: 'image' | 'video' }> = []

    for (let i = 0; i < allToScan.length; i++) {
      const item = allToScan[i]
      setProgress({
        current: i + 1,
        total: allToScan.length,
        status: `Analyzing photo ${i + 1} of ${allToScan.length}...`,
      })
      const heuristic = await analyzeImageHeuristics(item.dataUrl)
      scanned.push({
        id: item.id,
        previewUrl: item.dataUrl,
        dataUrl: item.dataUrl,
        type: item.type,
        reason: heuristic.isDocument
          ? 'Store receipt / invoice automatically detected by document scanner'
          : 'Verified safe photo',
        confidence: heuristic.confidence,
        isExcluded: heuristic.isDocument,
      })
    }

    setItems(scanned)
    setIsScanning(false)
    setProgress({ current: allToScan.length, total: allToScan.length, status: 'Demo pack loaded!' })
  }, [])

  /**
   * Loads pre-approved photos/videos (e.g. from local Persistent Vault) directly into state
   */
  const loadExistingMedia = useCallback(
    (mediaItems: Array<{ id: string; type: 'image' | 'video'; dataUrl: string; previewUrl?: string }>) => {
      setItems(
        mediaItems.map((item) => ({
          id: item.id,
          previewUrl: item.previewUrl || item.dataUrl,
          dataUrl: item.dataUrl,
          type: item.type,
          reason: 'Loaded from local vault',
          confidence: 0,
          isExcluded: false,
        }))
      )
    },
    []
  )

  /**
   * Reroll: Shuffles items in current deck using uniform Fisher-Yates
   */
  const rerollDeck = useCallback(() => {
    setItems((prev) => fisherYatesShuffle(prev))
  }, [])

  const acceptedCount = items.filter((i) => !i.isExcluded).length
  const excludedCount = items.filter((i) => i.isExcluded).length

  return {
    isScanning,
    progress,
    items,
    processFiles,
    processUrls,
    runAiScan,
    loadExistingMedia,
    toggleExclude,
    removePhoto,
    clearPhotos,
    loadMockPhotosWithTestDocument,
    rerollDeck,
    acceptedCount,
    excludedCount,
    getApprovedMedia: (): MediaItem[] =>
      items
        .filter((i) => !i.isExcluded)
        .map((i) => ({
          id: i.id,
          ownerId: '',
          ownerName: '',
          type: i.type,
          dataUrl: i.dataUrl,
        })),
  }
}
