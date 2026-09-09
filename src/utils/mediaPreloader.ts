export interface PreloadResult {
  success: boolean
  url: string
  durationMs: number
  error?: string
}

const memoryAssetCache = new Map<string, HTMLImageElement | HTMLVideoElement>()

export async function preloadMediaAsset(
  url: string,
  type: 'image' | 'video' = 'image',
  timeoutMs: number = 8000
): Promise<PreloadResult> {
  const start = performance.now()

  if (memoryAssetCache.has(url)) {
    return {
      success: true,
      url,
      durationMs: Math.round(performance.now() - start),
    }
  }

  return new Promise((resolve) => {
    let hasSettled = false

    const timer = setTimeout(() => {
      if (!hasSettled) {
        hasSettled = true
        resolve({
          success: false,
          url,
          durationMs: Math.round(performance.now() - start),
          error: 'Asset pre-cache timeout exceeded',
        })
      }
    }, timeoutMs)

    if (type === 'image') {
      const img = new Image()
      img.decoding = 'async'

      img.onload = () => {
        if ('decode' in img && typeof img.decode === 'function') {
          img
            .decode()
            .then(() => {
              if (!hasSettled) {
                hasSettled = true
                clearTimeout(timer)
                memoryAssetCache.set(url, img)
                resolve({
                  success: true,
                  url,
                  durationMs: Math.round(performance.now() - start),
                })
              }
            })
            .catch(() => {
              if (!hasSettled) {
                hasSettled = true
                clearTimeout(timer)
                memoryAssetCache.set(url, img)
                resolve({
                  success: true,
                  url,
                  durationMs: Math.round(performance.now() - start),
                })
              }
            })
        } else {
          if (!hasSettled) {
            hasSettled = true
            clearTimeout(timer)
            memoryAssetCache.set(url, img)
            resolve({
              success: true,
              url,
              durationMs: Math.round(performance.now() - start),
            })
          }
        }
      }

      img.onerror = () => {
        if (!hasSettled) {
          hasSettled = true
          clearTimeout(timer)
          resolve({
            success: false,
            url,
            durationMs: Math.round(performance.now() - start),
            error: 'Image failed to load',
          })
        }
      }

      img.src = url
    } else {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true

      const onCanPlay = () => {
        if (!hasSettled) {
          hasSettled = true
          clearTimeout(timer)
          memoryAssetCache.set(url, video)
          cleanup()
          resolve({
            success: true,
            url,
            durationMs: Math.round(performance.now() - start),
          })
        }
      }

      const onError = () => {
        if (!hasSettled) {
          hasSettled = true
          clearTimeout(timer)
          cleanup()
          resolve({
            success: false,
            url,
            durationMs: Math.round(performance.now() - start),
            error: 'Video failed to load',
          })
        }
      }

      const cleanup = () => {
        video.removeEventListener('canplaythrough', onCanPlay)
        video.removeEventListener('loadeddata', onCanPlay)
        video.removeEventListener('error', onError)
      }

      video.addEventListener('canplaythrough', onCanPlay, { once: true })
      video.addEventListener('loadeddata', onCanPlay, { once: true })
      video.addEventListener('error', onError, { once: true })

      video.src = url
      video.load()
    }
  })
}

export function clearAssetCache(): void {
  memoryAssetCache.clear()
}
