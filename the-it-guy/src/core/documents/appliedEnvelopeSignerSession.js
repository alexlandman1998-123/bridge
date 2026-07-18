function text(value) { return typeof value === 'string' ? value.trim() : '' }

function key(field = {}) {
  return [
    text(field.signerRole || field.signer_role).toLowerCase(),
    text(field.fieldType || field.field_type).toLowerCase(),
    Number(field.pageNumber ?? field.page_number),
    Number(field.xPosition ?? field.x_position),
    Number(field.yPosition ?? field.y_position),
    Number(field.width),
    Number(field.height),
    field.required !== false,
  ].join(':')
}

export function assessAppliedEnvelopeSignerSession({ version = {}, layout = {}, dispatch = {}, signer = {}, fields = [] } = {}) {
  const reasons = []
  const role = text(signer.signerRole || signer.signer_role).toLowerCase()
  const email = text(signer.signerEmail || signer.signer_email).toLowerCase()
  if (!version.transactionPdfPersisted && !version.transaction_pdf_persisted) reasons.push('F1_CERTIFIED_PDF_MISSING')
  if (!version.nativePdfVerified && !version.native_pdf_verified) reasons.push('F1_NATIVE_PDF_UNVERIFIED')
  if (text(layout.status).toLowerCase() !== 'applied' || !(layout.placementVerified || layout.placement_verified)) reasons.push('F1_APPLIED_LAYOUT_INVALID')
  if (text(dispatch.status).toLowerCase() !== 'delivered') reasons.push('F1_DELIVERED_DISPATCH_MISSING')
  if (text(dispatch.layoutId || dispatch.layout_id) !== text(layout.id)) reasons.push('F1_DISPATCH_LAYOUT_MISMATCH')
  const target = text(dispatch.targetSignerRole || dispatch.target_signer_role).toLowerCase()
  if (target && target !== role) reasons.push('F1_DISPATCH_RECIPIENT_MISMATCH')
  if (!text(signer.id) || !['sent', 'viewed'].includes(text(signer.status).toLowerCase())) reasons.push('F1_SIGNER_INACTIVE')
  const scoped = (Array.isArray(fields) ? fields : []).filter((field) => {
    const fieldRole = text(field.signerRole || field.signer_role).toLowerCase()
    const fieldEmail = text(field.signerEmail || field.signer_email).toLowerCase()
    return fieldRole === role && (!fieldEmail || fieldEmail === email)
  })
  const layoutKeys = new Set((Array.isArray(layout.fields) ? layout.fields : []).map(key))
  if (!scoped.length) reasons.push('F1_SCOPED_FIELDS_MISSING')
  if (!scoped.some((field) => (field.required !== false) && text(field.fieldType || field.field_type).toLowerCase() === 'signature')) reasons.push('F1_REQUIRED_SIGNATURE_MISSING')
  if (scoped.some((field) => !layoutKeys.has(key(field)))) reasons.push('F1_SCOPED_FIELD_MISMATCH')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], signerRole: role, scopedFieldCount: scoped.length }
}
