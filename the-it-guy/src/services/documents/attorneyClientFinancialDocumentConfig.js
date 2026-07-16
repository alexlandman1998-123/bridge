export const ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_CONFIG_VERSION = 'attorney_client_financial_documents_v1'

export const ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS = Object.freeze({
  buyerTransferCostInvoice: 'buyer_transfer_cost_invoice',
  sellerAttorneyInvoice: 'seller_attorney_invoice',
  buyerFinalStatement: 'buyer_final_statement',
  sellerFinalStatement: 'seller_final_statement',
})

export const LEGACY_ATTORNEY_FINANCIAL_DOCUMENT_KEYS = Object.freeze([
  'attorney_invoice',
  'attorney_statement',
])

const DEFAULTS = Object.freeze([
  Object.freeze({
    documentDefinitionKey: ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS.buyerTransferCostInvoice,
    recipientRole: 'buyer',
    requirementLevel: 'required',
    stageGate: 'lodgement_ready',
    lodgementBlocking: false,
    closeoutBlocking: false,
    dueBusinessDays: 0,
  }),
  Object.freeze({
    documentDefinitionKey: ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS.sellerAttorneyInvoice,
    recipientRole: 'seller',
    requirementLevel: 'optional',
    stageGate: 'registration_ready',
    lodgementBlocking: false,
    closeoutBlocking: false,
    dueBusinessDays: null,
  }),
  Object.freeze({
    documentDefinitionKey: ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS.buyerFinalStatement,
    recipientRole: 'buyer',
    requirementLevel: 'required',
    stageGate: 'registration_ready',
    lodgementBlocking: false,
    closeoutBlocking: true,
    dueBusinessDays: 2,
  }),
  Object.freeze({
    documentDefinitionKey: ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_KEYS.sellerFinalStatement,
    recipientRole: 'seller',
    requirementLevel: 'required',
    stageGate: 'registration_ready',
    lodgementBlocking: false,
    closeoutBlocking: true,
    dueBusinessDays: 2,
  }),
])

export function listAttorneyClientFinancialDocumentDefaults() {
  return DEFAULTS.map((item) => ({
    ...item,
    isEnabled: true,
    uploadVisibilityDefault: 'internal',
    publicationRequired: true,
  }))
}

export function isLegacyAttorneyFinancialDocumentKey(value) {
  return LEGACY_ATTORNEY_FINANCIAL_DOCUMENT_KEYS.includes(String(value || '').trim().toLowerCase())
}

function readOverride(row, camelKey, snakeKey, fallback) {
  if (Object.prototype.hasOwnProperty.call(row, camelKey)) return row[camelKey]
  if (Object.prototype.hasOwnProperty.call(row, snakeKey)) return row[snakeKey]
  return fallback
}

export function resolveAttorneyClientFinancialDocumentSettings(rows = []) {
  const overrides = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [
      String(row.documentDefinitionKey || row.document_definition_key || '').trim().toLowerCase(),
      row,
    ]),
  )

  return listAttorneyClientFinancialDocumentDefaults().map((fallback) => {
    const row = overrides.get(fallback.documentDefinitionKey)
    if (!row) return fallback

    return {
      ...fallback,
      requirementLevel: readOverride(row, 'requirementLevel', 'requirement_level', fallback.requirementLevel),
      isEnabled: readOverride(row, 'isEnabled', 'is_enabled', fallback.isEnabled),
      lodgementBlocking: readOverride(row, 'lodgementBlocking', 'lodgement_blocking', fallback.lodgementBlocking),
      closeoutBlocking: readOverride(row, 'closeoutBlocking', 'closeout_blocking', fallback.closeoutBlocking),
      dueBusinessDays: readOverride(row, 'dueBusinessDays', 'due_business_days', fallback.dueBusinessDays),
      uploadVisibilityDefault: 'internal',
      publicationRequired: readOverride(row, 'publicationRequired', 'publication_required', true),
    }
  })
}
