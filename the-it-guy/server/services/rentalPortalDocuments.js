const text = value => String(value ?? '').trim()
const safeHttps = value => {
  try { const url = new URL(text(value)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '' } catch { return '' }
}

// File paths never come from a portal request. Resolve only receipts already
// attached to this exact lease version, payment item or incoming inspection.
export async function loadRentalPortalDocuments(db, { version, lease, tenancy, readiness = [], inspection = {}, inspectionItems = [], media = [], signers = [] }) {
  if (!version?.id) return []
  const versions = await db.from('rental_lease_versions').select('id').eq('lease_id', lease.id).eq('organisation_id', tenancy.organisation_id)
  if (versions.error) throw versions.error
  const [uploads, legacy] = await Promise.all([
    db.from('rental_lease_document_uploads').select('id,organisation_id,lease_version_id,signer_id,kind,storage_bucket,storage_path,file_name,mime_type,created_at').in('lease_version_id', (versions.data || []).map(row => row.id)).eq('organisation_id', tenancy.organisation_id).order('created_at', { ascending: false }),
    db.from('rental_lease_version_documents').select('id,document_label,document_link,created_at').eq('lease_version_id', version.id).order('created_at', { ascending: false }),
  ])
  if (uploads.error || legacy.error) throw uploads.error || legacy.error
  const references = new Map()
  for (const item of readiness) if (item.evidence_link) references.set(item.evidence_link, { category: 'payments', status: item.status })
  for (const item of inspectionItems) if (item.evidence_link) references.set(item.evidence_link, { category: 'inspections', status: item.status })
  for (const item of media) if (item.media_link) references.set(item.media_link, { category: 'inspections', status: inspection.status || 'in_progress' })
  const documents = []
  const uploadRefs = new Set()
  for (const upload of uploads.data || []) {
    const reference = `${upload.storage_bucket}/${upload.storage_path}`
    // Unreviewed agreement drafts and unlinked move-in files remain staff-only.
    const sharedAgreement = upload.kind === 'agreement' && version.terms_json?.agreement_upload_id === upload.id && ['awaiting_tenant', 'awaiting_landlord', 'signed', 'active', 'ended'].includes(lease.status)
    const details = upload.kind === 'signed_agreement' && signers.some(signer => signer.id === upload.signer_id && signer.status === 'signed') ? { category: 'lease', status: 'signed' } : sharedAgreement ? { category: 'lease', status: lease.status } : references.get(reference)
    const prefix = `${tenancy.organisation_id}/${lease.id}/${upload.lease_version_id}/${upload.id}.`
    if (!details || upload.storage_bucket !== 'rental-lease-files' || !text(upload.storage_path).startsWith(prefix) || !/^[a-z0-9]+$/i.test(upload.storage_path.slice(prefix.length))) continue
    uploadRefs.add(reference)
    documents.push({ id: upload.id, label: upload.file_name || 'Uploaded document', createdAt: upload.created_at, ...details, fileType: upload.mime_type === 'application/pdf' ? 'PDF' : 'Document', available: true, storageBucket: upload.storage_bucket, storagePath: upload.storage_path })
  }
  for (const document of legacy.data || []) {
    const link = safeHttps(document.document_link)
    // Historical HTTPS agreements remain usable. Internal bucket references
    // require a verified immutable receipt; unknown references are never sent.
    if (link && !uploadRefs.has(document.document_link)) documents.push({ id: document.id, label: document.document_label || 'Lease document', category: 'lease', status: lease.status, createdAt: document.created_at, available: true, legacyLink: link })
  }
  return documents
}

export function publicRentalPortalDocuments(documents = []) {
  return documents.map(document => ({ id: document.id, label: document.label, category: document.category, status: document.status, createdAt: document.createdAt, fileType: document.fileType, available: document.available }))
}

export async function openRentalPortalDocument(db, documents, documentId) {
  const document = documents.find(row => row.id === text(documentId))
  if (!document) return { status: 404, body: { error: 'This document is unavailable in your portal.' } }
  if (document.legacyLink) return { status: 200, body: { url: document.legacyLink } }
  const result = await db.storage.from(document.storageBucket).createSignedUrl(document.storagePath, 300)
  if (result.error || !safeHttps(result.data?.signedUrl)) return { status: 503, body: { error: 'The saved file could not be opened. Please try again.' } }
  return { status: 200, body: { url: result.data.signedUrl, expiresIn: 300 } }
}
