import { normalizeOnboardingLogoUrl } from './onboardingBranding.js'
import { paginateSellerMandateReview } from './sellerMandateReviewPagination.js'

function toPdfFileName(value = '', fallback = 'document.pdf') {
  const raw = String(value || fallback || 'document.pdf').trim() || 'document.pdf'
  return `${raw.replace(/\.(html?|pdf)$/i, '')}.pdf`
}

function ensureBrowser() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof window.DOMParser !== 'function') {
    throw new Error('PDF downloads are only available in the browser.')
  }
}

async function sizePrintableSvg(dataUrl) {
  if (!/^data:image\/svg\+xml(?:;|,)/i.test(dataUrl)) return dataUrl
  const separator = dataUrl.indexOf(',')
  const encoded = dataUrl.slice(separator + 1)
  const markup = /;base64$/i.test(dataUrl.slice(0, separator))
    ? new TextDecoder().decode(Uint8Array.from(window.atob(encoded), character => character.charCodeAt(0)))
    : decodeURIComponent(encoded)
  const svgDocument = new window.DOMParser().parseFromString(markup, 'image/svg+xml')
  const svg = svgDocument.documentElement
  if (svg.localName !== 'svg' || svgDocument.querySelector('parsererror')) throw new Error('Invalid SVG')
  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) return dataUrl
  const absoluteDimension = /^((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|cm|mm|in|pt|pc)?$/i
  const width = svg.getAttribute('width')?.trim().match(absoluteDimension)
  const height = svg.getAttribute('height')?.trim().match(absoluteDimension)
  if (width && height) return dataUrl
  // A viewBox-only SVG displays correctly in an <img>, but canvas drawImage
  // can crop its source rectangle using the browser's fallback intrinsic size.
  // Give the export copy an explicit viewport, preserving its aspect ratio.
  if (width) svg.setAttribute('height', `${Number(width[1]) * viewBox[3] / viewBox[2]}${width[2] || ''}`)
  else if (height) svg.setAttribute('width', `${Number(height[1]) * viewBox[2] / viewBox[3]}${height[2] || ''}`)
  else {
    svg.setAttribute('width', String(viewBox[2]))
    svg.setAttribute('height', String(viewBox[3]))
  }
  const blob = new Blob([new window.XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Invalid SVG'))
    reader.readAsDataURL(blob)
  })
}

async function printableImage(source, timeoutMs) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const maxBytes = 5 * 1024 * 1024
  try {
    let dataUrl = source
    if (!/^data:image\//i.test(source)) {
      const url = new URL(source, window.location.href)
      if (!['http:', 'https:', 'blob:'].includes(url.protocol)) throw new Error('Unsupported image source')
      // Old public agency-logo links can be made durable. Private document
      // and signature links keep their existing access contract.
      const imageUrl = url.pathname.startsWith('/storage/v1/object/sign/organisation-branding/')
        ? normalizeOnboardingLogoUrl(url.toString()) : url.toString()
      const response = await fetch(imageUrl, { mode: 'cors', credentials: 'omit', signal: controller.signal })
      if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) throw new Error('Image unavailable')
      const blob = await response.blob()
      if (!blob.type.startsWith('image/') || blob.size > maxBytes) throw new Error('Invalid image')
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Invalid image'))
        reader.readAsDataURL(blob)
      })
    }
    if (dataUrl.length > maxBytes * 1.4) throw new Error('Image is too large')
    dataUrl = await sizePrintableSvg(dataUrl)
    await new Promise((resolve, reject) => {
      const image = new Image()
      const finish = error => {
        image.onload = image.onerror = null
        controller.signal.removeEventListener('abort', abort)
        if (error) { image.src = ''; reject(error) } else resolve()
      }
      const abort = () => finish(new Error('Image timed out'))
      image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? null : new Error('Invalid image'))
      image.onerror = () => finish(new Error('Invalid image'))
      controller.signal.addEventListener('abort', abort, { once: true })
      if (controller.signal.aborted) abort()
      else image.src = dataUrl
    })
    return dataUrl
  } catch {
    throw new Error('The document logo or signature could not be loaded. Reload and try again. If it still fails, ask your agent to check the document images.')
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Renders a stored HTML document as a local browser PDF. It neither uploads
 * the file nor changes its document/signing state, which keeps it safe for
 * review-only seller onboarding drafts.
 */
export async function downloadHtmlDocumentPdf(markup = '', fileName = 'document.pdf', { stageName = 'generated-document', imageTimeoutMs = 15000 } = {}) {
  ensureBrowser()
  const html = String(markup || '').trim()
  if (!html) throw new Error('This document does not have a printable draft yet.')
  if (!Number.isFinite(imageTimeoutMs) || imageTimeoutMs <= 0) throw new Error('Invalid document image timeout.')

  let pdfHost = null
  let styleElement = null
  try {
    const { default: html2pdf } = await import('html2pdf.js/src/index.js')
    const pdfDocument = new window.DOMParser().parseFromString(html, 'text/html')
    const style = pdfDocument.head.querySelector('style')
    styleElement = document.createElement('style')
    styleElement.setAttribute(`data-${stageName}-pdf-style`, 'true')
    styleElement.textContent = style?.textContent || ''
    // Keep the source off-screen without copying that positioning into
    // html2pdf's capture container. A fixed source has no layout height
    // in the clone and produces a blank PDF.
    pdfHost = document.createElement('div')
    pdfHost.style.position = 'fixed'
    pdfHost.style.left = '-10000px'
    pdfHost.style.top = '0'
    pdfHost.style.pointerEvents = 'none'
    const pdfStage = document.createElement('div')
    pdfStage.setAttribute(`data-${stageName}-pdf-stage`, 'true')
    pdfStage.style.position = 'relative'
    pdfStage.style.width = '210mm'
    pdfStage.style.background = '#ffffff'
    pdfStage.style.pointerEvents = 'none'
    pdfStage.innerHTML = pdfDocument.body.innerHTML
    document.head.appendChild(styleElement)
    pdfHost.appendChild(pdfStage)
    document.body.appendChild(pdfHost)

    // Review layouts measure the available A4 space before image embedding and
    // capture. Existing approved/frozen documents retain their stored pages.
    await document.fonts?.ready
    pdfStage.querySelectorAll('[data-review-layout="seller-mandate-review"]').forEach(paginateSellerMandateReview)

    // Embed validated bytes in the export stage so html2canvas cannot silently
    // omit a loaded-but-uncapturable cross-origin logo. Deduplicate within this
    // download only; approved HTML and other agencies' assets stay untouched.
    const images = new Map()
    const imageLoads = Array.from(pdfStage.querySelectorAll('img')).map(async image => {
      const source = String(image.getAttribute('src') || '').trim()
      if (!images.has(source)) images.set(source, printableImage(source, imageTimeoutMs))
      image.src = await images.get(source)
    })
    await Promise.all(imageLoads)
    await new Promise((resolve) => window.requestAnimationFrame(resolve))

    const options = {
        margin: 0,
        filename: toPdfFileName(fileName),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: 794,
          windowHeight: 1123,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      }
    const reviewPages = pdfStage.querySelectorAll('.mandate-review-document[data-review-paginated="true"] > .mandate-review-page')
    if (reviewPages.length) {
      // Capture measured review pages individually. A single canvas for long
      // schedules can exceed browser limits and silently produce blank pages.
      let pdf
      for (const page of reviewPages) {
        // Preserve the scoped font, palette and box sizing in the capture clone.
        const pageStage = page.parentElement.cloneNode(false)
        pageStage.append(page.cloneNode(true))
        const worker = html2pdf().set({ ...options, pagebreak: { mode: [] } }).from(pageStage).toCanvas()
        const canvas = await worker.get('canvas')
        if (!pdf) pdf = await worker.toPdf().get('pdf')
        else {
          pdf.addPage()
          pdf.addImage(canvas.toDataURL('image/jpeg', options.image.quality), 'JPEG', 0, 0, 210, canvas.height * 210 / canvas.width)
        }
        canvas.width = canvas.height = 0
      }
      await pdf.save(options.filename, { returnPromise: true })
    } else {
      await html2pdf().set(options).from(pdfStage).save()
    }
  } finally {
    pdfHost?.remove()
    styleElement?.remove()
  }
}

export { toPdfFileName }
