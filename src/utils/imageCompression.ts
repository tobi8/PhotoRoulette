/**
 * Utilities to compress images and prepare media for fast WebRTC P2P transmission
 */

export interface CompressionResult {
  dataUrl: string
  thumbnailUrl: string
  width: number
  height: number
  sizeBytes: number
  type: 'image' | 'video'
}

/**
 * Resizes and compresses an image file to max 960x960, JPEG ~70%, kept small for P2P WebRTC transfer and IndexedDB storage.
 * Seamlessly handles iPhone HEIC/HEIF files and uses fast Object URLs.
 */
export async function compressImage(file: File, maxDim = 960, quality = 0.70): Promise<CompressionResult> {
  // 1. Detect and convert iPhone HEIC/HEIF files to JPEG
  let blobToProcess: Blob = file
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif'

  if (isHeic && typeof window !== 'undefined') {
    try {
      const heic2anyModule = await import('heic2any')
      const heic2any = (heic2anyModule as any).default || heic2anyModule
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.85,
      })
      blobToProcess = Array.isArray(converted) ? converted[0] : converted
    } catch (err) {
      console.warn('heic2any conversion fallback for', file.name, err)
    }
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blobToProcess)
    const img = new Image()

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      // If decoding fails, generate an attractive fallback photo memory card so it NEVER renders broken
      const fallbackUrl = createFallbackPhotoCard(file.name)
      resolve({
        dataUrl: fallbackUrl,
        thumbnailUrl: fallbackUrl,
        width: 800,
        height: 600,
        sizeBytes: fallbackUrl.length,
        type: 'image',
      })
    }

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img

      // Maintain aspect ratio
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        const fallback = createFallbackPhotoCard(file.name)
        return resolve({
          dataUrl: fallback,
          thumbnailUrl: fallback,
          width: 800,
          height: 600,
          sizeBytes: fallback.length,
          type: 'image',
        })
      }

      ctx.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)

      // Generate small thumbnail for review modal
      const thumbCanvas = document.createElement('canvas')
      const thumbScale = Math.min(240 / width, 240 / height)
      thumbCanvas.width = Math.max(1, Math.round(width * thumbScale))
      thumbCanvas.height = Math.max(1, Math.round(height * thumbScale))
      const thumbCtx = thumbCanvas.getContext('2d')
      let thumbUrl = dataUrl
      if (thumbCtx) {
        thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height)
        thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.6)
      }

      const sizeBytes = Math.round((dataUrl.length * 3) / 4)

      resolve({
        dataUrl,
        thumbnailUrl: thumbUrl,
        width,
        height,
        sizeBytes,
        type: 'image',
      })
    }

    img.src = objectUrl
  })
}

/**
 * Creates a clean, attractive photo card canvas for files that cannot be decoded directly
 */
export function createFallbackPhotoCard(label = 'Photo Memory'): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 600
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const grad = ctx.createLinearGradient(0, 0, 600, 600)
  grad.addColorStop(0, '#3b0764')
  grad.addColorStop(0.5, '#4338ca')
  grad.addColorStop(1, '#065f46')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 600, 600)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.font = 'bold 54px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('📸', 300, 270)

  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif'
  const displayLabel = label.length > 22 ? label.slice(0, 20) + '...' : label
  ctx.fillText(displayLabel, 300, 340)

  ctx.font = '16px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.fillText('Roulette Photo', 300, 380)

  return canvas.toDataURL('image/jpeg', 0.8)
}

/**
 * Generate a poster canvas for videos that cannot be decoded directly on mobile
 */
function createVideoFallbackPoster(label = 'Video Clip 🎥'): string {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const grad = ctx.createLinearGradient(0, 0, 640, 480)
  grad.addColorStop(0, '#1e1b4b')
  grad.addColorStop(1, '#0f172a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 640, 480)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, 320, 220)

  ctx.fillStyle = '#a5b4fc'
  ctx.font = '18px sans-serif'
  ctx.fillText('Tap to Play', 320, 270)

  return canvas.toDataURL('image/jpeg', 0.8)
}

/**
 * Process a short video (< 5 seconds) or capture its poster frame.
 * Includes a strict 2-second timeout so it NEVER freezes on Android/Pixel!
 */
export async function processVideo(file: File): Promise<CompressionResult> {
  return new Promise((resolve) => {
    let isResolved = false
    const blobUrl = URL.createObjectURL(file)

    const fallbackResolve = () => {
      if (isResolved) return
      isResolved = true
      URL.revokeObjectURL(blobUrl)

      const poster = createVideoFallbackPoster(file.name || 'Video Clip 🎥')

      // Read as base64 or blob URL
      if (file.size <= 3 * 1024 * 1024) {
        const reader = new FileReader()
        reader.onload = () => {
          resolve({
            dataUrl: reader.result as string,
            thumbnailUrl: poster,
            width: 640,
            height: 480,
            sizeBytes: file.size,
            type: 'video',
          })
        }
        reader.onerror = () => {
          resolve({
            dataUrl: poster,
            thumbnailUrl: poster,
            width: 640,
            height: 480,
            sizeBytes: poster.length,
            type: 'image',
          })
        }
        reader.readAsDataURL(file)
      } else {
        resolve({
          dataUrl: poster,
          thumbnailUrl: poster,
          width: 640,
          height: 480,
          sizeBytes: poster.length,
          type: 'image',
        })
      }
    }

    // 2-second timeout guard against mobile browser seek stalls
    const timeout = setTimeout(fallbackResolve, 2000)

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = blobUrl

    video.onloadedmetadata = () => {
      try {
        const seekTime = Math.min(1.0, video.duration / 2) || 0.1
        video.currentTime = seekTime
      } catch {
        clearTimeout(timeout)
        fallbackResolve()
      }
    }

    video.onseeked = () => {
      if (isResolved) return
      clearTimeout(timeout)
      isResolved = true

      try {
        const maxDim = 800
        let width = video.videoWidth || 640
        let height = video.videoHeight || 480

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height)
        }
        const posterDataUrl = canvas.toDataURL('image/jpeg', 0.7)

        URL.revokeObjectURL(blobUrl)

        if (file.size <= 2.5 * 1024 * 1024) {
          const reader = new FileReader()
          reader.onload = () => {
            resolve({
              dataUrl: reader.result as string,
              thumbnailUrl: posterDataUrl,
              width,
              height,
              sizeBytes: file.size,
              type: 'video',
            })
          }
          reader.onerror = fallbackResolve
          reader.readAsDataURL(file)
        } else {
          resolve({
            dataUrl: posterDataUrl,
            thumbnailUrl: posterDataUrl,
            width,
            height,
            sizeBytes: posterDataUrl.length,
            type: 'image',
          })
        }
      } catch {
        fallbackResolve()
      }
    }

    video.onerror = () => {
      clearTimeout(timeout)
      fallbackResolve()
    }
  })
}

/**
 * Universal media processor: handles both images and videos safely on all devices
 */
export async function processMediaFile(file: File): Promise<CompressionResult> {
  if (file.type.startsWith('video/')) {
    return processVideo(file)
  }
  return compressImage(file)
}

/**
 * Loads an image from a URL (such as Google Drive direct CDN links) and compresses it
 */
export async function compressImageUrl(url: string, maxDim = 960, quality = 0.70): Promise<CompressionResult> {
  const tryLoad = (src: string, useCors = true): Promise<CompressionResult | null> => {
    return new Promise((resolve) => {
      const img = new Image()
      if (useCors) img.crossOrigin = 'anonymous'

      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        try {
          ctx.drawImage(img, 0, 0, width, height)
          const dataUrl = canvas.toDataURL('image/jpeg', quality)
          resolve({
            dataUrl,
            thumbnailUrl: dataUrl,
            width,
            height,
            sizeBytes: Math.round((dataUrl.length * 3) / 4),
            type: 'image',
          })
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = src
    })
  }

  // 1. Try direct load with CORS
  let res = await tryLoad(url, true)
  if (res) return res

  // 2. Try loading via reliable CORS image proxy
  const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${maxDim}&q=${Math.round(quality * 100)}&output=jpg`
  res = await tryLoad(proxyUrl, true)
  if (res) return res

  // 3. Fallback: return a clean rendered card canvas so broken image never displays
  const fallback = createFallbackPhotoCard('Cloud Photo')
  return {
    dataUrl: fallback,
    thumbnailUrl: fallback,
    width: 600,
    height: 600,
    sizeBytes: fallback.length,
    type: 'image',
  }
}

/**
 * WebRTC chunking helper: Splits a large message string into 16KB chunks
 */
export const CHUNK_SIZE = 16 * 1024 // 16 KB safe chunk size

export function splitIntoChunks(dataStr: string, messageId: string) {
  const totalChunks = Math.ceil(dataStr.length / CHUNK_SIZE)
  const chunks = []
  for (let i = 0; i < totalChunks; i++) {
    const chunk = dataStr.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    chunks.push({
      messageId,
      index: i,
      total: totalChunks,
      data: chunk,
    })
  }
  return chunks
}
