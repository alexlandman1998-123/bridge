const DOCUMENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'otp',
    packetType: 'otp',
    kind: 'standard',
    label: 'Offer to Purchase',
    shortLabel: 'OTP',
    description: 'Automatically adapts to the buyer, seller, property and finance.',
  }),
  Object.freeze({
    key: 'mandate',
    packetType: 'mandate',
    kind: 'standard',
    label: 'Sales Mandate',
    shortLabel: 'Mandate',
    description: 'Automatically adapts to the seller and property type.',
  }),
  Object.freeze({
    key: 'purchase_price_addendum',
    packetType: 'otp',
    kind: 'addendum',
    addendumType: 'purchase_price_addendum',
    label: 'Purchase Price Addendum',
    shortLabel: 'Price Addendum',
    description: 'Adjusts the purchase price and related terms.',
  }),
  Object.freeze({
    key: 'occupation_addendum',
    packetType: 'otp',
    kind: 'addendum',
    addendumType: 'occupation_addendum',
    label: 'Occupation Date Addendum',
    shortLabel: 'Occupation Addendum',
    description: 'Adjusts the proposed occupation date and related terms.',
  }),
])

export const LEGAL_DOCUMENT_EDITOR_SCOPES = Object.freeze([
  'all',
  'standard',
  'situations',
  'signing',
])

export function listLegalDocumentDefinitions({ packetTypes = [] } = {}) {
  const allowed = new Set((Array.isArray(packetTypes) ? packetTypes : []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))
  return DOCUMENT_DEFINITIONS.filter((definition) => !allowed.size || allowed.has(definition.packetType))
}

export function getLegalDocumentDefinition(documentKey = '') {
  const normalized = String(documentKey || '').trim().toLowerCase()
  return DOCUMENT_DEFINITIONS.find((definition) => definition.key === normalized) || null
}

export function normalizeLegalDocumentEditorScope(scope = 'all') {
  const normalized = String(scope || '').trim().toLowerCase()
  return LEGAL_DOCUMENT_EDITOR_SCOPES.includes(normalized) ? normalized : 'all'
}

export function isLegalDocumentDefinition(value = '') {
  return Boolean(getLegalDocumentDefinition(value))
}
