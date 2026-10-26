const text = value => String(value || '').trim()
const otpKeys = new Set(['uploaded_otp', 'signed_otp', 'buyer_otp', 'offer_to_purchase', 'otp'])

export function getBuyerSignedOtpDocuments({ lead = {}, uploads = [], requirements = [] } = {}) {
  let raw = lead.rawEnquiryPayload || lead.raw_enquiry_payload || {}
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { raw = {} }
  }
  const legacy = [lead, raw].flatMap(source => [
    source?.buyerOtpDocument, source?.buyer_otp_document,
    source?.buyerOfferDocument, source?.buyer_offer_document,
    ...(Array.isArray(source?.buyerOtpDocuments) ? source.buyerOtpDocuments : []),
    ...(Array.isArray(source?.buyerOfferDocuments) ? source.buyerOfferDocuments : []),
  ])
  const rows = [...uploads, ...requirements].filter(row =>
    otpKeys.has(text(row.key || row.requirementKey || row.requirement_key || row.documentType || row.document_type).toLowerCase()),
  )
  const seen = new Set()
  return [...rows, ...legacy].filter(Boolean).flatMap(row => {
    const uploaded = row.uploadedDocument || row.original?.document || {}
    const storagePath = text(row.storagePath || row.storage_path || row.file_path || uploaded.file_path)
    const storageBucket = text(row.storageBucket || row.storage_bucket || row.bucket || uploaded.storage_bucket)
    const candidateUrl = text(row.url || row.fileUrl || row.file_url || row.downloadUrl || row.download_url)
    const url = /^https?:\/\//i.test(candidateUrl) ? candidateUrl : ''
    const key = storagePath ? `storage:${storageBucket || 'documents'}:${storagePath}` : url
    if (!key || seen.has(key)) return []
    seen.add(key)
    return [{ ...row, storagePath, storageBucket, url,
      fileName: text(row.fileName || row.file_name || row.uploadedFileName || uploaded.file_name) || 'Signed offer to purchase',
      id: row.id || key,
    }]
  })
}
