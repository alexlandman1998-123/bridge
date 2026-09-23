import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const MAX_SITE_PLAN_FILE_BYTES = 25 * 1024 * 1024
const MAX_RENDER_DIMENSION = 2400

function fileName(value = '') {
  return String(value || 'site-plan').trim() || 'site-plan'
}

export function isPdfSitePlanFile(file) {
  const name = fileName(file?.name).toLowerCase()
  return String(file?.type || '').toLowerCase() === 'application/pdf' || name.endsWith('.pdf')
}

export function isSvgSitePlanFile(file) {
  const name = fileName(file?.name).toLowerCase()
  return String(file?.type || '').toLowerCase() === 'image/svg+xml' || name.endsWith('.svg')
}

// SVG plans retain the source labels and their exact drawing coordinates. This
// lets availability mapping offer safe suggestions instead of asking users to
// manually pin every residence.
export async function extractSitePlanSvgTextAnchors(file) {
  if (!isSvgSitePlanFile(file)) return []
  const source = await file.text()
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (document.querySelector('parsererror')) throw new Error('This SVG site plan could not be read.')
  const root = document.documentElement
  const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number)
  const width = Number(viewBox[2]) || Number.parseFloat(root.getAttribute('width')) || 0
  const height = Number(viewBox[3]) || Number.parseFloat(root.getAttribute('height')) || 0
  const originX = Number(viewBox[0]) || 0
  const originY = Number(viewBox[1]) || 0
  if (!width || !height) return []
  return [...document.querySelectorAll('text')].flatMap((node) => {
    const label = String(node.textContent || '').trim()
    const x = Number.parseFloat(node.getAttribute('x') || '')
    const y = Number.parseFloat(node.getAttribute('y') || '')
    if (!label || !Number.isFinite(x) || !Number.isFinite(y)) return []
    return [{ label, x: Math.max(3, Math.min(97, ((x - originX) / width) * 100)), y: Math.max(3, Math.min(97, ((y - originY) / height) * 100)) }]
  })
}

export function validateSitePlanFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Choose an image or PDF site plan before uploading.')
  }
  if (Number(file.size || 0) > MAX_SITE_PLAN_FILE_BYTES) {
    throw new Error('Site plans must be smaller than 25 MB.')
  }
  if (!isPdfSitePlanFile(file) && !String(file.type || '').toLowerCase().startsWith('image/')) {
    throw new Error('Upload an image or PDF site plan.')
  }
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not create an image from this PDF site plan.'))
    }, 'image/png')
  })
}

export async function renderSitePlanPdfFirstPage(file) {
  validateSitePlanFile(file)
  if (!isPdfSitePlanFile(file)) return file

  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({ data: bytes })

  try {
    const document = await loadingTask.promise
    const page = await document.getPage(1)
    const naturalViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(2, MAX_RENDER_DIMENSION / Math.max(naturalViewport.width, naturalViewport.height, 1))
    const viewport = page.getViewport({ scale })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Your browser could not prepare this PDF site plan.')

    await page.render({ canvasContext: context, viewport }).promise
    const blob = await canvasToPng(canvas)
    page.cleanup()
    document.destroy()
    const sourceName = fileName(file.name).replace(/\.pdf$/i, '')
    return new File([blob], `${sourceName}-map.png`, {
      type: 'image/png',
      lastModified: file.lastModified || Date.now(),
    })
  } catch (error) {
    throw new Error(error?.message || 'Could not convert the first PDF page into a site-plan image.')
  } finally {
    await loadingTask.destroy()
  }
}

export async function renderSitePlanUploadImage(file) {
  validateSitePlanFile(file)
  // Keep SVGs as their original vector files. Storage permits this media type
  // and the editor can use its labels for suggestions without pixelation.
  if (isSvgSitePlanFile(file)) return file
  if (!isSvgSitePlanFile(file)) return renderSitePlanPdfFirstPage(file)

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Could not convert this SVG site plan into an image.'))
      nextImage.src = objectUrl
    })
    const scale = Math.min(1, MAX_RENDER_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight, 1))
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not prepare this SVG site plan.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToPng(canvas)
    return new File([blob], `${fileName(file.name).replace(/\.svg$/i, '')}-map.png`, {
      type: 'image/png', lastModified: file.lastModified || Date.now(),
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function extractSitePlanPdfTextAnchors(file) {
  validateSitePlanFile(file)
  if (!isPdfSitePlanFile(file)) return []

  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({ data: bytes })

  try {
    const document = await loadingTask.promise
    const page = await document.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()
    const anchors = (textContent.items || []).flatMap((item) => {
      const label = String(item?.str || '').trim()
      const x = Number(item?.transform?.[4])
      const y = Number(item?.transform?.[5])
      if (!label || !Number.isFinite(x) || !Number.isFinite(y) || !viewport.width || !viewport.height) return []
      return [{
        label,
        x: Math.max(3, Math.min(97, (x / viewport.width) * 100)),
        y: Math.max(3, Math.min(97, 100 - ((y / viewport.height) * 100))),
      }]
    })
    page.cleanup()
    document.destroy()
    return anchors
  } catch (error) {
    throw new Error(error?.message || 'Could not read unit labels from this PDF site plan.')
  } finally {
    await loadingTask.destroy()
  }
}
