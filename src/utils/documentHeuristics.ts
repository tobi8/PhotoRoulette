/**
 * Fast Client-side Canvas Heuristic Scanner
 * Detects documents, receipts, text papers, forms, and screenshots without server or heavy ML downloads.
 */

export interface HeuristicScanResult {
  isDocument: boolean
  confidence: number
  reason: string
  details: {
    monochromeRatio: number
    edgeDensity: number
    textLineScore: number
    saturationMean: number
  }
}

/**
 * Analyzes an HTML5 Image/Canvas for document and text characteristics
 */
export async function analyzeImageHeuristics(imageSource: HTMLImageElement | string): Promise<HeuristicScanResult> {
  return new Promise((resolve) => {
    const runAnalysis = (img: HTMLImageElement) => {
      // Downscale to 256x256 for rapid (< 25ms) pixel analysis
      const width = 256
      const height = Math.round((img.height / img.width) * width) || 256
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (!ctx) {
        return resolve({
          isDocument: false,
          confidence: 0,
          reason: 'Could not inspect image context',
          details: { monochromeRatio: 0, edgeDensity: 0, textLineScore: 0, saturationMean: 0 },
        })
      }

      ctx.drawImage(img, 0, 0, width, height)
      const imgData = ctx.getImageData(0, 0, width, height)
      const data = imgData.data
      const totalPixels = width * height

      let monochromeCount = 0
      let totalSaturation = 0
      let brightBgCount = 0
      let darkTextCount = 0

      // Grayscale luminance buffer
      const gray = new Uint8Array(totalPixels)

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]

        // Luminance
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        gray[i] = lum

        // Saturation calculation
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const sat = max === 0 ? 0 : (max - min) / max
        totalSaturation += sat

        // Low saturation = black/white/gray
        if (sat < 0.18) {
          monochromeCount++
        }

        // White paper background vs dark ink
        if (lum > 210) brightBgCount++
        if (lum < 60) darkTextCount++
      }

      const monochromeRatio = monochromeCount / totalPixels
      const saturationMean = totalSaturation / totalPixels
      const brightBgRatio = brightBgCount / totalPixels
      const darkTextRatio = darkTextCount / totalPixels

      // Edge detection (Horizontal Sobel gradient to detect text lines)
      let edgeCount = 0
      let horizontalTransitions = 0

      for (let y = 1; y < height - 1; y++) {
        let rowTransitions = 0
        const rowOffset = y * width
        for (let x = 1; x < width - 1; x++) {
          const current = gray[rowOffset + x]
          const right = gray[rowOffset + x + 1]
          const bottom = gray[(y + 1) * width + x]

          const diffH = Math.abs(current - right)
          const diffV = Math.abs(current - bottom)

          if (diffH > 35 || diffV > 35) {
            edgeCount++
          }

          // Count sharp transitions indicative of typed characters
          if (diffH > 50) {
            rowTransitions++
          }
        }
        if (rowTransitions > 12) {
          horizontalTransitions++
        }
      }

      const edgeDensity = edgeCount / ((width - 2) * (height - 2))
      const textLineScore = horizontalTransitions / height

      // Heuristic Scoring Rules:
      // 1. High monochrome + bright background + dark text = standard printed document / receipt / invoice / book page
      // 2. High text line score + low saturation = screenshot of chat / code / web article
      // 3. Very high edge density + monochrome = spreadsheet or tabular document

      let isDocument = false
      let confidence = 0
      let reason = ''

      if (monochromeRatio > 0.72 && brightBgRatio > 0.40 && darkTextRatio > 0.05) {
        isDocument = true
        confidence = Math.min(0.95, 0.7 + (monochromeRatio - 0.7) * 0.8)
        reason = 'Printed document or receipt detected (high-contrast monochrome text on light background)'
      } else if (monochromeRatio > 0.65 && textLineScore > 0.35) {
        isDocument = true
        confidence = Math.min(0.92, 0.65 + textLineScore * 0.5)
        reason = 'Text screenshot or page detected (dense horizontal text lines)'
      } else if (edgeDensity > 0.18 && monochromeRatio > 0.60) {
        isDocument = true
        confidence = 0.85
        reason = 'Spreadsheet, form, or structured document detected'
      } else if (saturationMean < 0.12 && (brightBgRatio > 0.55 || darkTextRatio > 0.3)) {
        isDocument = true
        confidence = 0.80
        reason = 'Black-and-white scan or ID document detected'
      }

      resolve({
        isDocument,
        confidence: Math.round(confidence * 100) / 100,
        reason,
        details: {
          monochromeRatio: Math.round(monochromeRatio * 100) / 100,
          edgeDensity: Math.round(edgeDensity * 100) / 100,
          textLineScore: Math.round(textLineScore * 100) / 100,
          saturationMean: Math.round(saturationMean * 100) / 100,
        },
      })
    }

    if (typeof imageSource === 'string') {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => runAnalysis(img)
      img.onerror = () => {
        resolve({
          isDocument: false,
          confidence: 0,
          reason: 'Failed to load image',
          details: { monochromeRatio: 0, edgeDensity: 0, textLineScore: 0, saturationMean: 0 },
        })
      }
      img.src = imageSource
    } else {
      if (imageSource.complete) {
        runAnalysis(imageSource)
      } else {
        imageSource.onload = () => runAnalysis(imageSource)
      }
    }
  })
}
