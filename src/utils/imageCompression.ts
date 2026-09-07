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
 */
export async function compressImage(file: File, maxDim = 960, quality = 0.70): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => {
        // Fallback for tricky image formats
        resolve({
          dataUrl: e.target?.result as string,
          thumbnailUrl: e.target?.result as string,
          width: 800,
          height: 600,
          sizeBytes: file.size,
          type: 'image',
        })
      }
      img.onload = () => {
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
          return reject(new Error('Canvas 2D context unavailable'))
        }

        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)

        // Generate small thumbnail for review modal
        const thumbCanvas = document.createElement('canvas')
        const thumbScale = Math.min(240 / width, 240 / height)
        thumbCanvas.width = Math.round(width * thumbScale)
        thumbCanvas.height = Math.round(height * thumbScale)
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
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
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
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
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
      if (!ctx) {
        return resolve({
          dataUrl: url,
          thumbnailUrl: url,
          width: 800,
          height: 600,
          sizeBytes: 50000,
          type: 'image',
        })
      }
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
    }
    img.onerror = () => {
      resolve({
        dataUrl: url,
        thumbnailUrl: url,
        width: 800,
        height: 600,
        sizeBytes: 50000,
        type: 'image',
      })
    }
    img.src = url
  })
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
