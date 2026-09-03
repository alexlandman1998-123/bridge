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
