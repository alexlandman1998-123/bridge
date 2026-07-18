const FIELD_TYPES = new Set(['signature', 'initial'])
const SIGNER_ROLES = new Set(['purchaser_1', 'purchaser_2', 'buyer_spouse', 'seller', 'seller_spouse', 'agent', 'contractor', 'witness_1', 'witness_2', 'other'])
const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function finite(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function createSigningFieldBlock({ fieldType = 'signature', signerRole = 'seller', index = 0 } = {}) {
  const type = FIELD_TYPES.has(text(fieldType).toLowerCase()) ? text(fieldType).toLowerCase() : 'signature'
  const role = SIGNER_ROLES.has(text(signerRole).toLowerCase()) ? text(signerRole).toLowerCase() : 'other'
  const width = type === 'initial' ? 72 : 180
  const height = type === 'initial' ? 32 : 48
  const row = Math.max(0, Number(index) || 0)
  const x = type === 'initial' ? 451 : 72
  const y = Math.min(780 - (row * 58), PAGE_HEIGHT - height)
  return {
    id: globalThis.crypto?.randomUUID?.() || `field_${Date.now()}_${row}`,
    fieldType: type,
    signerRole: role,
    pageNumber: 1,
    xPosition: x,
    yPosition: Math.max(36, y),
    width,
    height,
    required: true,
    label: `${role.replace(/_/g, ' ')} ${type}`,
  }
}

export function normalizeSigningFieldLayout(fields = []) {
  return (Array.isArray(fields) ? fields : []).map((field, index) => ({
    id: text(field?.id) || `field_${index + 1}`,
    fieldType: text(field?.fieldType || field?.field_type).toLowerCase(),
    signerRole: text(field?.signerRole || field?.signer_role).toLowerCase(),
    pageNumber: Math.trunc(finite(field?.pageNumber ?? field?.page_number, 1)),
    xPosition: finite(field?.xPosition ?? field?.x_position),
    yPosition: finite(field?.yPosition ?? field?.y_position),
    width: finite(field?.width),
    height: finite(field?.height),
    required: field?.required !== false,
    label: text(field?.label) || `Field ${index + 1}`,
  }))
}

export function assessSigningFieldLayout(fields = []) {
  const normalized = normalizeSigningFieldLayout(fields)
  const reasons = []
  if (!normalized.length) reasons.push('E1_SIGNING_LAYOUT_EMPTY')
  if (normalized.length > 100) reasons.push('E1_SIGNING_LAYOUT_TOO_LARGE')
  const ids = new Set()
  normalized.forEach((field, index) => {
    if (ids.has(field.id)) reasons.push('E1_FIELD_ID_DUPLICATE')
    ids.add(field.id)
    if (!FIELD_TYPES.has(field.fieldType)) reasons.push(`E1_FIELD_TYPE_INVALID:${index}`)
    if (!SIGNER_ROLES.has(field.signerRole)) reasons.push(`E1_SIGNER_ROLE_INVALID:${index}`)
    if (field.pageNumber < 1) reasons.push(`E1_PAGE_NUMBER_INVALID:${index}`)
    if (field.width < 24 || field.height < 18) reasons.push(`E1_FIELD_SIZE_INVALID:${index}`)
    if (field.xPosition < 0 || field.yPosition < 0 || field.xPosition + field.width > PAGE_WIDTH || field.yPosition + field.height > PAGE_HEIGHT) {
      reasons.push(`E1_FIELD_OUTSIDE_PAGE:${index}`)
    }
  })
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      const a = normalized[left]
      const b = normalized[right]
      if (a.pageNumber !== b.pageNumber) continue
      const overlaps = a.xPosition < b.xPosition + b.width && a.xPosition + a.width > b.xPosition && a.yPosition < b.yPosition + b.height && a.yPosition + a.height > b.yPosition
      if (overlaps) reasons.push(`E2_FIELD_COLLISION:${left}:${right}`)
    }
  }
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], fields: normalized, page: { width: PAGE_WIDTH, height: PAGE_HEIGHT } }
}

export function assertSigningFieldLayout(fields = []) {
  const assessment = assessSigningFieldLayout(fields)
  if (assessment.ready) return assessment.fields
  const error = new Error('Signature field layout contains invalid blocks.')
  error.code = 'E1_SIGNING_FIELD_LAYOUT_INVALID'
  error.details = assessment
  throw error
}
