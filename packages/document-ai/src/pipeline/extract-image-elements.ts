import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageKind, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFPageProxy } from 'pdfjs-dist'
import { PNG } from 'pngjs'

import type { ImageElement } from '../types'
import { trackCtm } from './track-ctm'
import type { OperatorList, PageViewport } from './pdfjs-types'
import { boundingBoxFromLocalCorners } from './viewport-geometry'

const IMAGE_PAINT_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObject,
])

// Image XObjects are always painted into the unit square, positioned and
// scaled entirely by the CTM in effect at paint time.
const UNIT_SQUARE_CORNERS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

/**
 * Extracts embedded raster images: bounding box (same viewport space as
 * other elements) plus a PNG written to disk next to the source PDF, at
 * `<pdf-dir>/<pdf-name>.images/page-<n>-image-<i>.png`.
 *
 * Only RGB (`RGB_24BPP`) and already-RGBA (`RGBA_32BPP`) source data are
 * decoded — those are the two kinds verified against a real Cambridge PDF.
 * `GRAYSCALE_1BPP` (packed 1-bit masks) is skipped with a warning rather
 * than guessing at the bit-unpacking without a real sample to check against.
 */
export async function extractImageElements(
  page: PDFPageProxy,
  operatorList: OperatorList,
  viewport: PageViewport,
  pageNumber: number,
  sourcePdfPath: string
): Promise<ImageElement[]> {
  const ctmByIndex = trackCtm(operatorList)
  const outputDir = imagesDirFor(sourcePdfPath)

  const paintOps = operatorList.fnArray.flatMap((fn, index) => {
    if (!IMAGE_PAINT_OPS.has(fn)) {
      return []
    }
    const name = operatorList.argsArray[index]?.[0]
    if (typeof name !== 'string') {
      return []
    }
    return [{ name, ctm: ctmByIndex[index] }]
  })

  const elements = await Promise.all(
    paintOps.map(async ({ name, ctm }, index) => {
      const imageData = await getImageObject(page, name)
      if (!imageData) {
        console.warn(
          `[document-ai] skipping image "${name}" on page ${pageNumber}: object never resolved`
        )
        return null
      }

      const pngBuffer = toPngBuffer(imageData)
      if (!pngBuffer) {
        console.warn(
          `[document-ai] skipping image "${name}" on page ${pageNumber}: unsupported or undecodable kind`
        )
        return null
      }

      await mkdir(outputDir, { recursive: true })
      const fileName = `page-${pageNumber}-image-${index}.png`
      const imagePath = path.join(outputDir, fileName)
      await writeFile(imagePath, pngBuffer)

      const boundingBox = boundingBoxFromLocalCorners(
        UNIT_SQUARE_CORNERS,
        ctm,
        viewport
      )

      const element: ImageElement = {
        id: `${pageNumber}-image-${index}`,
        pageNumber,
        boundingBox,
        imagePath,
        width: imageData.width,
        height: imageData.height,
      }
      return element
    })
  )

  return elements.filter((element): element is ImageElement => element !== null)
}

function imagesDirFor(sourcePdfPath: string): string {
  const dir = path.dirname(sourcePdfPath)
  const name = path.parse(sourcePdfPath).name
  return path.join(dir, `${name}.images`)
}

interface DecodedImage {
  width: number
  height: number
  kind: number
  data: Uint8ClampedArray
}

// `page.objs.get(name, callback)` calls back once pdfjs resolves the named
// object — but for images referenced only from inside a nested Form XObject
// group (name prefixed "g_..."), that resolution is only ever triggered by
// the full canvas-render pipeline, which we never run (we only call
// getOperatorList/getTextContent). Without a timeout, those callbacks simply
// never fire and this hangs forever — confirmed against a real Cambridge
// examiner report where several pages have exactly this kind of reference.
const IMAGE_OBJECT_TIMEOUT_MS = 3000

function getImageObject(
  page: PDFPageProxy,
  name: string
): Promise<DecodedImage | null> {
  return new Promise((resolve) => {
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve(null)
      }
    }, IMAGE_OBJECT_TIMEOUT_MS)

    page.objs.get(name, (value: DecodedImage) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(value)
      }
    })
  })
}

function toPngBuffer(image: DecodedImage): Buffer | null {
  const rgba = toRgba(image)
  if (!rgba) {
    return null
  }

  const png = new PNG({ width: image.width, height: image.height })
  png.data = rgba
  return PNG.sync.write(png)
}

function toRgba(image: DecodedImage): Buffer | null {
  if (image.kind === ImageKind.RGBA_32BPP) {
    return Buffer.from(image.data)
  }

  if (image.kind === ImageKind.RGB_24BPP) {
    const pixelCount = image.width * image.height
    const rgba = Buffer.alloc(pixelCount * 4)
    // Page images run to millions of pixels; writing into a preallocated
    // Buffer by index is the natural (and fast) shape here, not a map/reduce
    // building an intermediate array.
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      rgba[pixel * 4] = image.data[pixel * 3]
      rgba[pixel * 4 + 1] = image.data[pixel * 3 + 1]
      rgba[pixel * 4 + 2] = image.data[pixel * 3 + 2]
      rgba[pixel * 4 + 3] = 255
    }
    return rgba
  }

  return null
}
