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
 * Resizes and compresses an image file to max 1280x720, JPEG ~75%, kept small for P2P WebRTC transfer.
 */
export async function compressImage(file: File, maxDim = 1280, quality = 0.75): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
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

        // Full resolution canvas
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

        // Approximate bytes
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
 * Process a short video (< 5 seconds) or capture its poster frame
 */
export async function processVideo(file: File): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const blobUrl = URL.createObjectURL(file)
    video.src = blobUrl

    video.onloadedmetadata = () => {
      // Seek to 1s or middle to get representative thumbnail
      const seekTime = Math.min(1.0, video.duration / 2)
      video.currentTime = seekTime
    }

    video.onseeked = () => {
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

      // If video file is small (< 1.5MB), read as base64 dataUrl, otherwise use poster
      if (file.size <= 2 * 1024 * 1024) {
        const reader = new FileReader()
        reader.onload = () => {
          URL.revokeObjectURL(blobUrl)
          resolve({
            dataUrl: reader.result as string,
            thumbnailUrl: posterDataUrl,
            width,
            height,
            sizeBytes: file.size,
            type: 'video',
          })
        }
        reader.readAsDataURL(file)
      } else {
        URL.revokeObjectURL(blobUrl)
        resolve({
          dataUrl: posterDataUrl,
          thumbnailUrl: posterDataUrl,
          width,
          height,
          sizeBytes: Math.round((posterDataUrl.length * 3) / 4),
          type: 'image',
        })
      }
    }

    video.onerror = () => {
      URL.revokeObjectURL(blobUrl)
      reject(new Error('Failed to load video file'))
    }
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
