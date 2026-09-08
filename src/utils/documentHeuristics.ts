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
export async function analyzeImageHeuristics(
  imageSource: HTMLImageElement | string,
  fileName?: string
): Promise<HeuristicScanResult> {
  return new Promise((resolve) => {
    // Fast check: If filename indicates document, receipt, or invoice
    if (fileName && /\b(receipt|invoice|beleg|rechnung|kontoauszug|tax|steuer|boarding_pass|formular|bill|statement|check|ticket)\b/i.test(fileName)) {
      return resolve({
        isDocument: true,
        confidence: 0.98,
        reason: 'Lame document/receipt identified from filename',
        details: { monochromeRatio: 1, edgeDensity: 1, textLineScore: 1, saturationMean: 0 },
      })
    }

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
      let paperBgCount = 0
      let textInkCount = 0
      let nonPaperDarkCount = 0
      const gray = new Uint8Array(totalPixels)

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]

        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        gray[i] = lum

        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const sat = max === 0 ? 0 : (max - min) / max
        totalSaturation += sat

        if (sat < 0.25) {
          monochromeCount++
        }

        if (lum > 175 && sat < 0.22) {
          paperBgCount++
        }

        if (lum < 110 && sat < 0.35) {
          textInkCount++
        } else if (lum < 110) {
          nonPaperDarkCount++
        }
      }

      const monochromeRatio = monochromeCount / totalPixels
      const saturationMean = totalSaturation / totalPixels
      const paperBgRatio = paperBgCount / totalPixels
      const textInkRatio = textInkCount / totalPixels

      let edgeCount = 0
      let horizontalTransitions = 0
      let highDensityLineCount = 0

      for (let y = 1; y < height - 1; y++) {
        let rowTransitions = 0
        const rowOffset = y * width
        for (let x = 1; x < width - 1; x++) {
          const current = gray[rowOffset + x]
          const right = gray[rowOffset + x + 1]
          const bottom = gray[(y + 1) * width + x]

          const diffH = Math.abs(current - right)
          const diffV = Math.abs(current - bottom)

          if (diffH > 25 || diffV > 25) {
            edgeCount++
          }

          if (diffH > 35) {
            rowTransitions++
          }
        }
        if (rowTransitions >= 6) {
          horizontalTransitions++
        }
        if (rowTransitions >= 16) {
          highDensityLineCount++
        }
      }

      const edgeDensity = edgeCount / ((width - 2) * (height - 2))
      const textLineScore = horizontalTransitions / height
      const textLineDensity = highDensityLineCount / height

      let isDocument = false
      let confidence = 0
      let reason = ''

      const isLongReceipt = (height / width > 1.6 || width / height > 1.6) && paperBgRatio > 0.35 && (textLineScore > 0.15 || edgeDensity > 0.08)

      if (isLongReceipt) {
        isDocument = true
        confidence = 0.95
        reason = 'Receipt, slip, or ticket format detected'
      } else if (paperBgRatio > 0.38 && (textLineScore > 0.20 || edgeDensity > 0.08) && saturationMean < 0.25) {
        isDocument = true
        confidence = 0.94
        reason = 'White paper document or page scan detected'
      } else if (paperBgRatio > 0.50 && textInkRatio > 0.005) {
        isDocument = true
        confidence = 0.92
        reason = 'Document page or printed sheet detected'
      } else if (monochromeRatio > 0.70 && paperBgRatio > 0.30 && (textLineDensity > 0.08 || edgeDensity > 0.12)) {
        isDocument = true
        confidence = 0.90
        reason = 'Text page, form, or document scan detected'
      } else if (monochromeRatio > 0.75 && edgeDensity > 0.15 && saturationMean < 0.18) {
        isDocument = true
        confidence = 0.88
        reason = 'Document, invoice, or screenshot detected'
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
