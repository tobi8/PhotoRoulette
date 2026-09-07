import { useCallback, useRef, useState } from 'react'
import { ExcludedMediaItem, MediaItem } from '../types/game'
import { compressImage } from '../utils/imageCompression'
import { analyzeImageHeuristics } from '../utils/documentHeuristics'

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

export function useDocumentFilter() {
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress>({ current: 0, total: 0, status: '' })
  const [items, setItems] = useState<Array<ExcludedMediaItem & { dataUrl: string; type: 'image' | 'video' }>>([])

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

    // Try starting ML model in parallel
    const mlPromise = initClassifier()

    const results: Array<ExcludedMediaItem & { dataUrl: string; type: 'image' | 'video' }> = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress({
        current: i + 1,
        total: files.length,
        status: `Analyzing photo ${i + 1} of ${files.length}...`,
      })

      try {
        // 1. Resize and compress photo
        const compressed = await compressImage(file, 1280, 0.75)

        // 2. Run instant Canvas Heuristics
        const heuristic = await analyzeImageHeuristics(compressed.thumbnailUrl)

        let isFlagged = heuristic.isDocument
        let reason = heuristic.reason
        let confidence = heuristic.confidence

        // 3. If canvas heuristic is borderline or clean, test ML classifier if available
        if (!isFlagged && file.type.startsWith('image/')) {
          try {
            const classifier = await mlPromise
            if (classifier) {
              const mlOutput = await classifier(compressed.thumbnailUrl, { topk: 3 })
              if (Array.isArray(mlOutput)) {
                for (const pred of mlOutput) {
                  const label = (pred.label || '').toLowerCase()
                  const score = pred.score || 0
                  const isDocLabel = DOCUMENT_KEYWORDS.some((kw) => label.includes(kw))
                  if (isDocLabel && score > 0.25) {
                    isFlagged = true
                    reason = `AI detected: ${pred.label} (${Math.round(score * 100)}% match)`
                    confidence = Math.max(confidence, score)
                    break
                  }
                }
              }
            }
          } catch (mlErr) {
            // Graceful fallback to heuristic result
          }
        }

        results.push({
          id: `media-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          file,
          previewUrl: compressed.thumbnailUrl,
          dataUrl: compressed.dataUrl,
          type: 'image',
          reason: reason || 'Verified safe party photo',
          confidence,
          isExcluded: isFlagged,
        })
      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err)
      }
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
      }))

    const excluded: ExcludedMediaItem[] = results.filter((item) => item.isExcluded)

    return { accepted, excluded }
  }, [initClassifier])

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

  const acceptedCount = items.filter((i) => !i.isExcluded).length
  const excludedCount = items.filter((i) => i.isExcluded).length

  return {
    isScanning,
    progress,
    items,
    processFiles,
    toggleExclude,
    removePhoto,
    clearPhotos,
    loadMockPhotosWithTestDocument,
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
