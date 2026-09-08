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
  pickRandom20(options?: {
    room?: string
    userId?: string
    uploadUrl?: string
  }): Promise<{
    medias?: Array<{
      identifier: string
      type: 'image' | 'video'
      data: string
    }>
    success?: boolean
    response?: string
  }>
}

const AndroidGallery = registerPlugin<NativeGalleryPlugin>('NativeGallery')

declare global {
  interface Window {
    AndroidBridge?: {
      pickRandom20: (roomId: string, userId: string, uploadUrl: string) => void
    }
    onNativeMediaEvent?: (payload: { type: string; status: string; progress: number }) => void
    onNativeMediaSuccess?: (payload: unknown) => void
    onNativeMediaError?: (payload: { type: string; message: string }) => void
  }
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android' || typeof window.AndroidBridge !== 'undefined'
}

export function isIOS(): boolean {
  return Capacitor.getPlatform() === 'ios' || (/iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window))
}

export function hasAndroidBridge(): boolean {
  return typeof window.AndroidBridge !== 'undefined' || Capacitor.isPluginAvailable('NativeGallery')
}

export async function pickRandom20Android(
  roomId: string,
  userId: string,
  uploadUrl?: string
): Promise<NativeMediaAsset[]> {
  try {
    const result = await AndroidGallery.pickRandom20({
      room: roomId,
      userId: userId,
      uploadUrl: uploadUrl || '',
    })

    if (result && result.medias && result.medias.length > 0) {
      return result.medias.map((item) => ({
        id: item.identifier || `android-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dataUrl: item.data,
        type: item.type,
      }))
    }
  } catch (error) {
    console.error('Failed calling Android pickRandom20:', error)
  }

  return queryNativeCameraRoll(20)
}

export async function queryNativeCameraRoll(quantity = 20): Promise<NativeMediaAsset[]> {
  if (!isNativeApp()) {
    return []
  }

  const platform = Capacitor.getPlatform()

  try {
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

    if (platform === 'ios') {
      const result = await Media.getMedias({
        quantity: 60,
        types: 'all',
        thumbnailWidth: 1280,
        thumbnailHeight: 1280,
        thumbnailQuality: 75,
      })

      if (!result || !result.medias || result.medias.length === 0) {
        return []
      }

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
    console.error('Failed to query native camera roll:', error)
    return []
  }
}
