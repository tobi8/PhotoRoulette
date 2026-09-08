import { Capacitor, registerPlugin } from '@capacitor/core'

export interface NativeMediaAsset {
  id: string
  dataUrl: string
  type: 'image' | 'video'
}

interface NativeGalleryPlugin {
  pickRandom20(options?: {
    types?: 'photos' | 'videos' | 'all'
  }): Promise<{
    medias?: Array<{
      identifier: string
      type: 'image' | 'video'
      data: string
    }>
  }>
  reroll(options?: {
    types?: 'photos' | 'videos' | 'all'
  }): Promise<{
    medias?: Array<{
      identifier: string
      type: 'image' | 'video'
      data: string
    }>
  }>
  checkGalleryPermission(): Promise<{ granted: boolean }>
  requestGalleryPermission(): Promise<{ granted: boolean }>
  openSettings(): Promise<void>
}

const AndroidGallery = registerPlugin<NativeGalleryPlugin>('NativeGallery')

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function isAndroidApp(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export function hasAndroidBridge(): boolean {
  return Capacitor.isPluginAvailable('NativeGallery')
}

export async function checkAndroidGalleryPermission(): Promise<boolean> {
  try {
    if (Capacitor.isPluginAvailable('NativeGallery')) {
      const res = await AndroidGallery.checkGalleryPermission()
      return !!res.granted
    }
  } catch {}
  return true
}

export async function requestAndroidGalleryPermission(): Promise<boolean> {
  try {
    if (Capacitor.isPluginAvailable('NativeGallery')) {
      const res = await AndroidGallery.requestGalleryPermission()
      return !!res.granted
    }
  } catch {}
  return true
}

export async function openAndroidAppSettings(): Promise<void> {
  try {
    if (Capacitor.isPluginAvailable('NativeGallery')) {
      await AndroidGallery.openSettings()
    }
  } catch {}
}

export async function pickRandom20Android(
  mediaType: 'photos_only' | 'videos_only' | 'mixed' = 'mixed'
): Promise<NativeMediaAsset[]> {
  const types = mediaType === 'videos_only' ? 'videos' : mediaType === 'photos_only' ? 'photos' : 'all'
  try {
    const result = await AndroidGallery.pickRandom20({ types })
    if (result && result.medias && result.medias.length > 0) {
      return result.medias.map((item) => ({
        id: item.identifier || `android-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dataUrl: item.data,
        type: item.type,
      }))
    }
  } catch (error) {
    console.error(error)
  }
  return []
}

export async function rerollAndroid(
  mediaType: 'photos_only' | 'videos_only' | 'mixed' = 'mixed'
): Promise<NativeMediaAsset[]> {
  const types = mediaType === 'videos_only' ? 'videos' : mediaType === 'photos_only' ? 'photos' : 'all'
  try {
    const result = await AndroidGallery.reroll({ types })
    if (result && result.medias && result.medias.length > 0) {
      return result.medias.map((item) => ({
        id: item.identifier || `android-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dataUrl: item.data,
        type: item.type,
      }))
    }
  } catch (error) {
    console.error(error)
  }
  return []
}
