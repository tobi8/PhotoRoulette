import { Capacitor, registerPlugin } from '@capacitor/core'
import { Media } from '@capacitor-community/media'

export interface NativeMediaAsset {
  id: string
  dataUrl: string
  type: 'image' | 'video'
}

interface NativeGalleryPlugin {
  getMedias(options?: { quantity?: number; types?: 'photos' | 'videos' | 'all' }): Promise<{
    medias: Array<{
      identifier: string
      uri?: string
      type: 'image' | 'video'
      duration?: number
      data: string
    }>
  }>
}

const AndroidGallery = registerPlugin<NativeGalleryPlugin>('NativeGallery')

/**
 * Checks if the app is currently running as an installed native iOS or Android app
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Silently queries the user's native camera roll in the background without any file picker dialog!
 * Works seamlessly across both iOS (via PhotoKit) and Android (via MediaStore ContentResolver).
 * Pulls recent photos/videos, randomizes them, and returns items for the roulette deck.
 */
export async function queryNativeCameraRoll(quantity = 15): Promise<NativeMediaAsset[]> {
  if (!isNativeApp()) {
    return []
  }

  const platform = Capacitor.getPlatform()

  try {
    // 1. Android Native Flow
    if (platform === 'android') {
      const result = await AndroidGallery.getMedias({ quantity, types: 'all' })
      if (!result || !result.medias || result.medias.length === 0) {
        return []
      }

      return result.medias.map((item) => ({
        id: item.identifier || `android-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dataUrl: item.data,
        type: item.type,
      }))
    }

    // 2. iOS Native Flow (PhotoKit via Media plugin)
    if (platform === 'ios') {
      const result = await Media.getMedias({
        quantity: 50, // fetch recent 50 to randomly sample from
        types: 'all',
        thumbnailWidth: 800,
        thumbnailHeight: 600,
        thumbnailQuality: 75,
      })

      if (!result || !result.medias || result.medias.length === 0) {
        return []
      }

      // Randomly shuffle and take up to `quantity` items
      const shuffled = [...result.medias].sort(() => Math.random() - 0.5).slice(0, quantity)
      const assets: NativeMediaAsset[] = []

      for (const item of shuffled) {
        const isVideo = item.duration !== undefined && item.duration > 0
        const base64Data = item.data?.startsWith('data:')
          ? item.data
          : `data:${isVideo ? 'video/mp4' : 'image/jpeg'};base64,${item.data}`

        assets.push({
          id: item.identifier || `ios-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          dataUrl: base64Data,
          type: isVideo ? 'video' : 'image',
        })
      }

      return assets
    }

    return []
  } catch (error) {
    console.error('Failed to silently query native camera roll:', error)
    return []
  }
}
