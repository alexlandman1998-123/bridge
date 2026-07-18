function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function fieldKey(field = {}) {
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

export function assessAppliedEnvelopeDispatch({ version = {}, layout = {}, fields = [] } = {}) {
  const reasons = []
  const planned = Array.isArray(layout.fields || layout.fields_json) ? (layout.fields || layout.fields_json) : []
  const materialized = Array.isArray(fields) ? fields : []
  if (layout.status !== 'applied') reasons.push('E4_APPLIED_LAYOUT_REQUIRED')
  if (layout.placementVerified !== true && layout.placement_verified !== true) reasons.push('E4_PLACEMENT_NOT_VERIFIED')
  if (version.transaction_pdf_persisted !== true && version.transactionPdfPersisted !== true) reasons.push('E4_CERTIFIED_PDF_REQUIRED')
  if (planned.length !== materialized.length) reasons.push('E4_APPLIED_LAYOUT_FIELD_COUNT_MISMATCH')
  const activeKeys = new Set(materialized.map(fieldKey))
  if (planned.some((field) => !activeKeys.has(fieldKey(field)))) reasons.push('E4_APPLIED_LAYOUT_FIELD_MISMATCH')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], fieldCount: materialized.length }
}
