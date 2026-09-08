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
 * Decodes iPhone HEIC/HEIF files to raw pixel data using libheif (heic-decode and direct libheif-js)
 * and renders to a canvas JPEG.
 */
async function decodeHeicFile(file: File, maxDim = 960, quality = 0.70): Promise<CompressionResult | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)
    let decodedWidth = 0
    let decodedHeight = 0
    let decodedData: Uint8ClampedArray | null = null

    // Engine 1: Try heic-decode
    try {
      const decodeModule = await import('heic-decode')
      const decode = (decodeModule as any).default || decodeModule
      const res = await decode({ buffer })
      if (res && res.width && res.height && res.data) {
        decodedWidth = res.width
        decodedHeight = res.height
        decodedData = new Uint8ClampedArray(res.data)
      }
    } catch (e1) {
      console.warn('heic-decode primary attempt failed, trying libheif direct:', e1)
    }

    // Engine 2: Direct libheif-js fallback (handles all brands and raw containers)
    if (!decodedData) {
      try {
        const libheifModule = await import('libheif-js/wasm-bundle')
        const libheif = (libheifModule as any).default || libheifModule
        if (libheif.ready) await libheif.ready
        const decoder = new libheif.HeifDecoder()
        const images = decoder.decode(buffer)
        if (images && images.length > 0) {
          const image = images[0]
          decodedWidth = image.get_width()
          decodedHeight = image.get_height()
          const displayData = await new Promise<any>((resolve) => {
            try {
              image.display({ data: new Uint8ClampedArray(decodedWidth * decodedHeight * 4), width: decodedWidth, height: decodedHeight }, (res: any) => {
                resolve(res)
              })
            } catch {
              resolve(null)
            }
          })
          for (const img of images) img.free()
          decoder.decoder.delete()
          if (displayData && displayData.data) {
            decodedData = new Uint8ClampedArray(displayData.data)
          }
        }
      } catch (e2) {
        console.warn('libheif direct decode attempt failed:', e2)
      }
    }

    if (!decodedData || !decodedWidth || !decodedHeight) {
      return null
    }

    // Create intermediate canvas for the decoded RGBA image
    const rawCanvas = document.createElement('canvas')
    rawCanvas.width = decodedWidth
    rawCanvas.height = decodedHeight
    const rawCtx = rawCanvas.getContext('2d')
    if (!rawCtx) return null

    const imageData = rawCtx.createImageData(decodedWidth, decodedHeight)
    imageData.data.set(decodedData)
    rawCtx.putImageData(imageData, 0, 0)

    // Calculate scaled dimensions
    let outWidth = decodedWidth
    let outHeight = decodedHeight
    if (outWidth > maxDim || outHeight > maxDim) {
      if (outWidth > outHeight) {
        outHeight = Math.round((outHeight * maxDim) / outWidth)
        outWidth = maxDim
      } else {
        outWidth = Math.round((outWidth * maxDim) / outHeight)
        outHeight = maxDim
      }
    }

    const outCanvas = document.createElement('canvas')
    outCanvas.width = outWidth
    outCanvas.height = outHeight
    const outCtx = outCanvas.getContext('2d')
    if (!outCtx) return null

    outCtx.drawImage(rawCanvas, 0, 0, outWidth, outHeight)
    const dataUrl = outCanvas.toDataURL('image/jpeg', quality)

    // Small thumbnail
    const thumbScale = Math.min(240 / outWidth, 240 / outHeight)
    const thumbW = Math.max(1, Math.round(outWidth * thumbScale))
    const thumbH = Math.max(1, Math.round(outHeight * thumbScale))
    const thumbCanvas = document.createElement('canvas')
    thumbCanvas.width = thumbW
    thumbCanvas.height = thumbH
    const thumbCtx = thumbCanvas.getContext('2d')
    let thumbUrl = dataUrl
    if (thumbCtx) {
      thumbCtx.drawImage(outCanvas, 0, 0, thumbW, thumbH)
      thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.6)
    }

    return {
      dataUrl,
      thumbnailUrl: thumbUrl,
      width: outWidth,
      height: outHeight,
      sizeBytes: Math.round((dataUrl.length * 3) / 4),
      type: 'image',
    }
  } catch (err) {
    console.error('HEIC decode error for', file.name, err)
    return null
  }
}

/**
 * Tries hardware-accelerated native browser image decoding via createImageBitmap
 * or URL.createObjectURL(file) + new Image().
 * On iOS/macOS Safari and WebKit, iPhone photos are decoded in GPU hardware in ~5ms.
 */
async function tryNativeDecode(
  file: File,
  maxDim = 540,
  quality = 0.48,
  timeoutMs = 1500
): Promise<CompressionResult | null> {
  // Method 1: Offscreen hardware decode via createImageBitmap (fastest on modern Safari & Chromium)
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file)
      let { width, height } = bitmap
      if (width > 0 && height > 0) {
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
          ctx.drawImage(bitmap, 0, 0, width, height)
          bitmap.close()
          const dataUrl = canvas.toDataURL('image/jpeg', quality)

          // Small thumbnail for preview modal
          const thumbScale = Math.min(180 / width, 180 / height)
          const thumbW = Math.max(1, Math.round(width * thumbScale))
          const thumbH = Math.max(1, Math.round(height * thumbScale))
          const thumbCanvas = document.createElement('canvas')
          thumbCanvas.width = thumbW
          thumbCanvas.height = thumbH
          const thumbCtx = thumbCanvas.getContext('2d')
          let thumbUrl = dataUrl
          if (thumbCtx) {
            thumbCtx.drawImage(canvas, 0, 0, thumbW, thumbH)
            thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.45)
          }

          return {
            dataUrl,
            thumbnailUrl: thumbUrl,
            width,
            height,
            sizeBytes: Math.round((dataUrl.length * 3) / 4),
            type: 'image',
          }
        }
      }
    } catch {
      // Fall through to Image element fallback
    }
  }

  // Method 2: new Image() with object URL
  return new Promise((resolve) => {
    let settled = false
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        URL.revokeObjectURL(objectUrl)
        resolve(null)
      }
    }, timeoutMs)

    img.onerror = () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        URL.revokeObjectURL(objectUrl)
        resolve(null)
      }
    }

    img.onload = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img
      if (!width || !height) return resolve(null)

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
      if (!ctx) return resolve(null)

      try {
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)

        // Generate small thumbnail for review modal
        const thumbCanvas = document.createElement('canvas')
        const thumbScale = Math.min(180 / width, 180 / height)
        thumbCanvas.width = Math.max(1, Math.round(width * thumbScale))
        thumbCanvas.height = Math.max(1, Math.round(height * thumbScale))
        const thumbCtx = thumbCanvas.getContext('2d')
        let thumbUrl = dataUrl
        if (thumbCtx) {
          thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
          thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.45)
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
      } catch {
        resolve(null)
      }
    }

    img.src = objectUrl
  })
}

/**
 * Resizes and compresses an image file to max 540x540, JPEG ~48%, kept compact (~20KB)
 * for ultra-fast P2P WebRTC transfer and instantaneous loading on mobile devices.
 */
export async function compressImage(
  file: File,
  maxDim = 540,
  quality = 0.48
): Promise<CompressionResult> {
  const isHeic =
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'

  // 1. Try instant hardware-accelerated native decode (GPU-accelerated, ~5ms)
  const nativeResult = await tryNativeDecode(file, maxDim, quality, isHeic ? 800 : 1500)
  if (nativeResult) {
    return nativeResult
  }

  // 2. Fallback for browsers lacking native HEIC support (e.g. desktop Windows Chrome)
  if (isHeic && typeof window !== 'undefined') {
    const heicResult = await decodeHeicFile(file, maxDim, quality)
    if (heicResult) return heicResult
  }

  // 3. Fallback: generate an attractive card so broken image icon is never shown
  const fallbackUrl = createFallbackPhotoCard(file.name)
  return {
    dataUrl: fallbackUrl,
    thumbnailUrl: fallbackUrl,
    width: 600,
    height: 450,
    sizeBytes: fallbackUrl.length,
    type: 'image',
  }
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
 * Extract a crisp thumbnail frame from a video file quickly and safely.
 * Includes a strict 2-second timeout to prevent stalling.
 */
export async function extractVideoPoster(file: File): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return createVideoFallbackPoster(file.name)
  }

  return new Promise((resolve) => {
    const blobUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    let isDone = false
    const finish = (posterUrl: string) => {
      if (isDone) return
      isDone = true
      URL.revokeObjectURL(blobUrl)
      video.removeAttribute('src')
      video.load()
      resolve(posterUrl)
    }

    // Safety timeout: 2 seconds max
    const timer = setTimeout(() => {
      finish(createVideoFallbackPoster(file.name))
    }, 2000)

    video.onloadeddata = () => {
      try {
        video.currentTime = 0.5
      } catch {
        // seek failed
      }
    }

    video.onseeked = () => {
      try {
        clearTimeout(timer)
        const canvas = document.createElement('canvas')
        const width = video.videoWidth || 640
        const height = video.videoHeight || 480
        const maxDim = 480
        const scale = Math.min(maxDim / width, maxDim / height, 1)
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          finish(canvas.toDataURL('image/jpeg', 0.7))
        } else {
          finish(createVideoFallbackPoster(file.name))
        }
      } catch {
        finish(createVideoFallbackPoster(file.name))
      }
    }

    video.onerror = () => {
      clearTimeout(timer)
      finish(createVideoFallbackPoster(file.name))
    }

    video.src = blobUrl
    video.load()
  })
}

/**
 * Process video: Extracts poster and prepares media for seamless WebRTC play.
 * Constrains playback to the first 10 seconds via media fragment (#t=0,10)
 * and never slices binary data so video files are never corrupted.
 */
export async function processVideo(file: File): Promise<CompressionResult> {
  const poster = await extractVideoPoster(file)

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      let dataUrl = reader.result as string
      // Append #t=0,10 to enforce 10s playback constraint natively in all HTML5 players
      if (!dataUrl.includes('#t=')) {
        dataUrl = `${dataUrl}#t=0,10`
      }
      resolve({
        dataUrl,
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
        type: 'video',
      })
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Universal media processor: handles both images and videos safely on all devices
 */
export async function processMediaFile(
  file: File,
  options?: { maxDim?: number; quality?: number }
): Promise<CompressionResult> {
  // Skip hidden system files (.DS_Store, AppleDouble metadata ._foo.jpg, empty files)
  if (file.name.startsWith('.') || file.size === 0) {
    throw new Error('Ignored hidden or empty system file')
  }

  const isVideo =
    file.type.startsWith('video/') ||
    /\.(mp4|mov|m4v|webm|avi|mkv|3gp|ogv)$/i.test(file.name)

  if (isVideo) {
    return processVideo(file)
  }
  return compressImage(file, options?.maxDim ?? 540, options?.quality ?? 0.48)
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
