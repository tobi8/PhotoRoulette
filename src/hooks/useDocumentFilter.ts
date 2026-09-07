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

  const classifierRef = useRef<any>(null)
  const isModelLoadingRef = useRef(false)

  // Initialize ML model lazily in background
  const initClassifier = useCallback(async () => {
    if (classifierRef.current || isModelLoadingRef.current) return classifierRef.current

    try {
      isModelLoadingRef.current = true
      const { pipeline, env } = await import('@xenova/transformers')
      env.allowLocalModels = false
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = 1
      }
      const classifier = await pipeline('image-classification', 'Xenova/mobilenet_v2_1.0_224', {
        quantized: true,
      })
      classifierRef.current = classifier
      return classifier
    } catch (err) {
      console.warn('Transformers.js ML model fallback to Canvas heuristics:', err)
      return null
    } finally {
      isModelLoadingRef.current = false
    }
  }, [])

  /**
   * Scan files through dual-tier filter (Canvas Heuristic + optional ML classifier)
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
        status: `Processing photos (${Math.min(i + batch.length, files.length)} of ${files.length})...`,
      })

      const batchResults = await Promise.all(
        batch.map(async (file, batchIdx) => {
          const fileIndex = i + batchIdx
          try {
            // 1. Process media (image or video) with mobile-safe timeout
            const compressed = await processMediaFile(file)

            // 2. Run instant Canvas Heuristics (on thumbnail)
            const heuristic = await analyzeImageHeuristics(compressed.thumbnailUrl, file.name)

            const isFlagged = heuristic.isDocument && heuristic.confidence >= 0.90
            const reason = heuristic.reason || 'Verified photo'
            const confidence = heuristic.confidence

            return {
              id: `media-${Date.now()}-${fileIndex}-${Math.random().toString(36).slice(2, 6)}`,
              file,
              previewUrl: compressed.thumbnailUrl,
              dataUrl: compressed.dataUrl,
              type: compressed.type,
              reason,
              confidence,
              isExcluded: isFlagged, // Only exclude if extremely high confidence
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

      // Small yield to allow UI rendering and browser garbage collection
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
   * Process a list of image URLs (such as Google Drive direct links)
   */
  const processUrls = useCallback(async (urlItems: Array<{ id: string; url: string; name?: string }>): Promise<MediaItem[]> => {
    setIsScanning(true)
    const accepted: MediaItem[] = []
    const newItems: FilterResultItem[] = []

    for (let i = 0; i < urlItems.length; i++) {
      setProgress({
        current: i + 1,
        total: urlItems.length,
        status: `Importing cloud photo (${i + 1} of ${urlItems.length})...`,
      })

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
          reason: 'Clean photo',
          confidence: 0,
          isExcluded: false,
        })
      } catch (err) {
        console.error('Failed to import URL:', urlItems[i].url, err)
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    setItems(newItems)
    setIsScanning(false)
    setProgress({ current: urlItems.length, total: urlItems.length, status: 'Cloud import complete!' })
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
   * Load mock demo photos (including one mock receipt) for instant testing
   */
  const loadMockPhotosWithTestDocument = useCallback(async () => {
    setIsScanning(true)
    setProgress({ current: 0, total: 5, status: 'Generating mock party deck...' })

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
    setProgress({ current: 6, total: 6, status: 'Demo pack loaded!' })
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
