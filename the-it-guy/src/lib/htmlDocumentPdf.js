function toPdfFileName(value = '', fallback = 'document.pdf') {
  const raw = String(value || fallback || 'document.pdf').trim() || 'document.pdf'
  return `${raw.replace(/\.(html?|pdf)$/i, '')}.pdf`
}

function ensureBrowser() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof window.DOMParser !== 'function') {
    throw new Error('PDF downloads are only available in the browser.')
  }
}

/**
 * Renders a stored HTML document as a local browser PDF. It neither uploads
 * the file nor changes its document/signing state, which keeps it safe for
 * review-only seller onboarding drafts.
 */
export async function downloadHtmlDocumentPdf(markup = '', fileName = 'document.pdf', { stageName = 'generated-document' } = {}) {
  ensureBrowser()
  const html = String(markup || '').trim()
  if (!html) throw new Error('This document does not have a printable draft yet.')

  let pdfStage = null
  let styleElement = null
  try {
    const { default: html2pdf } = await import('html2pdf.js/src/index.js')
    const pdfDocument = new window.DOMParser().parseFromString(html, 'text/html')
    const style = pdfDocument.head.querySelector('style')
    styleElement = document.createElement('style')
    styleElement.setAttribute(`data-${stageName}-pdf-style`, 'true')
    styleElement.textContent = style?.textContent || ''
    pdfStage = document.createElement('div')
    pdfStage.setAttribute(`data-${stageName}-pdf-stage`, 'true')
    pdfStage.style.position = 'fixed'
    pdfStage.style.left = '-10000px'
    pdfStage.style.top = '0'
    pdfStage.style.width = '210mm'
    pdfStage.style.background = '#ffffff'
    pdfStage.style.pointerEvents = 'none'
    pdfStage.innerHTML = pdfDocument.body.innerHTML
    document.head.appendChild(styleElement)
    document.body.appendChild(pdfStage)

    const imageLoads = Array.from(pdfStage.querySelectorAll('img')).map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise((resolve) => {
        image.onload = resolve
        image.onerror = resolve
      })
    })
    await Promise.all(imageLoads)
    await new Promise((resolve) => window.requestAnimationFrame(resolve))

    await html2pdf()
      .set({
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
      })
      .from(pdfStage)
      .save()
  } finally {
    pdfStage?.remove()
    styleElement?.remove()
  }
}

export { toPdfFileName }
