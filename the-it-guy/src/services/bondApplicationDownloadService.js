import { buildBondApplicationDownloadPlan, createBondApplicationDownload, BOND_DOWNLOAD_LIMITS } from '../modules/bond/application/exports/bondApplicationDownloadPack.js'
import { hashBondApplicationSnapshot } from '../modules/bond/application/submission/bondApplicationSnapshotHash.js'

export async function readBoundedDownload(url, { maximumBytes = BOND_DOWNLOAD_LIMITS.fileBytes, fetchFile = fetch } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetchFile(url, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw new Error('A file could not be downloaded. Refresh the application and retry.')
    if (Number(response.headers.get('content-length')) > maximumBytes) throw new Error('A file exceeds the pack size limit.')
    if (!response.body) throw new Error('The file download returned no content.')
    const reader = response.body.getReader()
    const chunks = []
    let length = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.length
        if (length > maximumBytes) throw new Error('A file exceeds the pack size limit.')
        chunks.push(value)
      }
    } catch (error) { await reader.cancel(); throw error } finally { reader.releaseLock() }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return bytes
  } finally { clearTimeout(timeout) }
}

async function logoData(url) {
  if (!url) return null
  const bytes = await readBoundedDownload(url, { maximumBytes: 5 * 1024 * 1024 })
  const prefix = new TextDecoder().decode(bytes.slice(0, 1000))
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: prefix.includes('<svg') ? 'image/svg+xml' : bytes[0] === 0x89 ? 'image/png' : 'image/jpeg' }))
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 600 / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(objectUrl) }
}

export async function downloadBondApplication({ transactionId, mode, brand } = {}) {
  const api = await import('../lib/api.js')
  const { renderBondApplicationPackPdf } = await import('../modules/bond/application/exports/bondApplicationPackPdf.js')
  const context = await api.fetchBondApplicationDownloadContext({ transactionId })
  const plan = buildBondApplicationDownloadPlan({ ...context, mode })
  const branding = { ...brand }
  if (!branding.name && mode === 'final') throw new Error('Assign the originator before preparing a final application download.')
  if (branding.logoUrl) {
    try { branding.logoData = await logoData(branding.logoUrl) } catch (error) {
      if (mode === 'final') throw error
      plan.warnings.push('The originator logo could not be loaded for this draft.')
    }
  }
  let bytes, filename, type
  if (mode === 'final') {
    const pack = await createBondApplicationDownload({ plan, brand: branding, renderPdf: renderBondApplicationPackPdf, loadFile: async (document) => {
      const url = await api.fetchBondApplicationPackDocumentUrl({ transactionId, documentId: document.id, expectedPath: document.file_path || document.storage_path, expectedBucket: document.file_bucket || document.bucket })
      return readBoundedDownload(url)
    } })
    // Changes or revoked access while files were being downloaded invalidate the export.
    const latest = await api.fetchBondApplicationDownloadContext({ transactionId })
    const latestPlan = buildBondApplicationDownloadPlan({ ...latest, mode })
    const fileVersions = (value) => JSON.stringify(value.files.map((entry) => [entry.id, entry.document.file_path || entry.document.storage_path, entry.document.file_bucket || entry.document.bucket || '', entry.document.updated_at || '', entry.document.review_status || entry.document.status]).sort((a, b) => a[0].localeCompare(b[0])))
    if (!latest.readiness.ready || latest.submission?.id !== context.submission?.id || latest.submission?.snapshot_hash !== pack.manifest.snapshotHash || fileVersions(plan) !== fileVersions(latestPlan)) throw new Error('The application or supporting documents changed while the pack was being prepared. Refresh and retry.')
    bytes = pack.zip; filename = `${pack.filename}.zip`; type = 'application/zip'
  } else {
    bytes = await renderBondApplicationPackPdf({ snapshot: plan.snapshot, brand: branding, readiness: plan.readiness, manifest: {
      mode: 'draft', transactionId, generatedAt: new Date().toISOString(), snapshotHash: await hashBondApplicationSnapshot(plan.snapshot), files: [], warnings: ['Supporting files are not attached to this draft PDF.', ...plan.warnings],
    } })
    filename = `${plan.filename}.pdf`; type = 'application/pdf'
  }
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; document.body.appendChild(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000) }
  return { filename }
}
