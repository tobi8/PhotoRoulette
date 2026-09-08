import { useCallback, useState } from 'react'
import { ExcludedMediaItem, MediaItem } from '../types/game'

export type FilterResultItem = ExcludedMediaItem & { dataUrl: string; type: 'image' | 'video' }

export function useDocumentFilter() {
  const [items, setItems] = useState<FilterResultItem[]>([])

  /**
   * Loads media items (e.g. from iOS Shortcut or Android bridge) directly into state
   */
  const loadExistingMedia = useCallback(
    (mediaItems: Array<{ id: string; type: 'image' | 'video'; dataUrl: string; previewUrl?: string }>) => {
      setItems(
        mediaItems.map((item) => ({
          id: item.id,
          previewUrl: item.previewUrl || item.dataUrl,
          dataUrl: item.dataUrl,
          type: item.type,
          reason: 'Loaded via shortcut',
          confidence: 0,
          isExcluded: false,
        }))
      )
    },
    []
  )

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
  }, [])

  const acceptedCount = items.filter((i) => !i.isExcluded).length
  const excludedCount = items.filter((i) => i.isExcluded).length

  const getApprovedMedia = useCallback(
    (mediaType?: 'photos_only' | 'videos_only' | 'mixed'): MediaItem[] => {
      let unexcluded = items.filter((i) => !i.isExcluded)
      if (mediaType === 'videos_only') {
        unexcluded = unexcluded.filter((i) => i.type === 'video')
      } else if (mediaType === 'photos_only') {
        unexcluded = unexcluded.filter((i) => i.type === 'image')
      }
      return unexcluded.map((i) => ({
        id: i.id,
        ownerId: '',
        ownerName: '',
        type: i.type,
        dataUrl: i.dataUrl,
      }))
    },
    [items]
  )

  return {
    items,
    loadExistingMedia,
    toggleExclude,
    removePhoto,
    clearPhotos,
    acceptedCount,
    excludedCount,
    getApprovedMedia,
  }
}
