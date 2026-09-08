import { useCallback, useState } from 'react'
import { ExcludedMediaItem, MediaItem } from '../types/game'

export type FilterResultItem = ExcludedMediaItem & { dataUrl: string; type: 'image' | 'video' }

export function useDocumentFilter() {
  const [items, setItems] = useState<FilterResultItem[]>([])

  const loadExistingMedia = useCallback(
    (mediaItems: Array<{ id: string; type: 'image' | 'video'; dataUrl: string; previewUrl?: string; isGuaranteed?: boolean }>) => {
      setItems(
        mediaItems.map((item) => ({
          id: item.id,
          previewUrl: item.previewUrl || item.dataUrl,
          dataUrl: item.dataUrl,
          type: item.type,
          reason: 'Loaded media',
          confidence: 0,
          isExcluded: false,
          isGuaranteed: item.isGuaranteed || false,
        }))
      )
    },
    []
  )

  const setGuaranteedPhoto = useCallback(
    (photo: { id: string; type: 'image' | 'video'; dataUrl: string }) => {
      setItems((prev) => {
        const withoutOldGuaranteed = prev.filter((item) => !item.isGuaranteed)
        const newItem: FilterResultItem = {
          id: photo.id,
          previewUrl: photo.dataUrl,
          dataUrl: photo.dataUrl,
          type: photo.type,
          reason: 'Guaranteed Photo',
          confidence: 0,
          isExcluded: false,
          isGuaranteed: true,
        }
        return [newItem, ...withoutOldGuaranteed]
      })
    },
    []
  )

  const excludeDocuments = useCallback((excludedIds: string[]) => {
    setItems((prev) =>
      prev.map((item) =>
        excludedIds.includes(item.id)
          ? { ...item, isExcluded: true, reason: 'AI detected document' }
          : item
      )
    )
  }, [])

  const toggleExclude = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isExcluded: !item.isExcluded } : item))
    )
  }, [])

  const removePhoto = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

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
        isGuaranteed: i.isGuaranteed,
      }))
    },
    [items]
  )

  return {
    items,
    loadExistingMedia,
    setGuaranteedPhoto,
    excludeDocuments,
    toggleExclude,
    removePhoto,
    clearPhotos,
    acceptedCount,
    excludedCount,
    getApprovedMedia,
  }
}
