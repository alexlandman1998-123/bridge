import { DOCUMENT_REQUEST_CANONICAL_MATRIX } from './documentRequestCanonicalMatrix.js'

export const DOCUMENT_REQUEST_UPLOAD_OWNERSHIP_MODEL_VERSION = 'document_request_upload_ownership_model_v1'

const CLIENT_ROLES = new Set(['buyer', 'seller'])
const ATTORNEY_ROLES = new Set(['attorney', 'transfer_attorney', 'cancellation_attorney'])
const PROFESSIONAL_ROLES = new Set(['agent', 'attorney', 'transfer_attorney', 'cancellation_attorney', 'bond_originator'])

const PROFESSIONAL_ONLY_KEYS = new Set([
  'transfer_duty_information',
  'transfer_documents',
  'bond_cancellation_figures',
])

const BOND_ORIGINATOR_ASSISTED_KEYS = new Set([
  'bond_approval',
  'grant_signed',
  'income_affordability_documents',
])

export const SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS = Object.freeze([
  'electrical_compliance_certificate',
  'gas_compliance_certificate',
  'electric_fence_certificate',
  'water_installation_certificate',
  'beetle_certificate',
  'solar_compliance_documents',
  'approved_building_plans',
  'occupation_certificate',
  'vat_status_confirmation',
])
const SELLER_EXTERNAL_UPLOAD_KEYS = new Set(SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS)

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function normalizeRole(value = '', fallback = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (normalized === 'client') return 'buyer'
  if (normalized === 'bond' || normalized === 'originator') return 'bond_originator'
  if (normalized === 'conveyancer') return 'transfer_attorney'
  return normalized
}

function normalizeVisibility(value = '') {
  const normalized = normalizeKey(value)
  if (normalized === 'client' || normalized === 'client_visible') return 'client_visible'
  if (normalized === 'shared' || normalized === 'shared_role_players' || normalized === 'professional_shared') return 'professional_shared'
  if (normalized === 'internal' || normalized === 'internal_only') return 'internal_only'
  return normalized || 'client_visible'
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

export function resolveDocumentRequestUploadOwnership(input = {}) {
  const documentKey = normalizeKey(
    input.documentKey ||
      input.document_key ||
      input.canonicalKey ||
      input.canonicalDocumentRequestKey ||
      input.canonical_document_request_key ||
      input.key,
  )
  const ownerRole = normalizeRole(input.ownerRole || input.owner_role || input.requestedByRole || input.requested_by_role)
  const requestedFrom = normalizeRole(input.requestedFrom || input.requested_from || input.assignedToRole || input.assigned_to_role, ownerRole || 'buyer')
  const visibility = normalizeVisibility(input.visibility || input.visibility_scope)
  const professionalOnly = PROFESSIONAL_ONLY_KEYS.has(documentKey) ||
    (PROFESSIONAL_ROLES.has(ownerRole) && !CLIENT_ROLES.has(requestedFrom))
  const sellerExternalUpload = SELLER_EXTERNAL_UPLOAD_KEYS.has(documentKey)
  const bondOriginatorAssisted = BOND_ORIGINATOR_ASSISTED_KEYS.has(documentKey)
  const responsiblePartyRole = sellerExternalUpload
    ? 'seller'
    : professionalOnly
      ? ownerRole || requestedFrom
      : CLIENT_ROLES.has(requestedFrom)
        ? requestedFrom
        : ownerRole || requestedFrom

  const uploadableByRoles = []
  if (CLIENT_ROLES.has(responsiblePartyRole)) {
    uploadableByRoles.push(responsiblePartyRole, 'agent')
    if (bondOriginatorAssisted) uploadableByRoles.push('bond_originator')
  } else if (responsiblePartyRole === 'bond_originator') {
    uploadableByRoles.push('bond_originator')
  } else if (ATTORNEY_ROLES.has(responsiblePartyRole)) {
    uploadableByRoles.push(responsiblePartyRole, 'attorney')
  } else if (responsiblePartyRole === 'agent') {
    uploadableByRoles.push('agent')
  } else if (responsiblePartyRole) {
    uploadableByRoles.push(responsiblePartyRole)
  }

  const clientUploadDebt = CLIENT_ROLES.has(responsiblePartyRole) && !professionalOnly
  const clientVisibleUploadDebt = clientUploadDebt && visibility === 'client_visible'
  const uploadOnBehalfAllowed = CLIENT_ROLES.has(responsiblePartyRole)

  return Object.freeze({
    version: DOCUMENT_REQUEST_UPLOAD_OWNERSHIP_MODEL_VERSION,
    documentKey,
    ownerRole: ownerRole || responsiblePartyRole,
    requestedFrom,
    responsiblePartyRole,
    uploadableByRoles: Object.freeze(unique(uploadableByRoles)),
    uploadOnBehalfAllowed,
    agentMayUploadOnBehalf: uploadOnBehalfAllowed,
    clientUploadDebt,
    clientVisibleUploadDebt,
    professionalOnly,
    sellerExternalUpload,
    bondOriginatorAssisted,
    uploadMode: professionalOnly
      ? 'professional_upload'
      : clientUploadDebt
        ? bondOriginatorAssisted
          ? 'client_upload_with_bond_originator_assist'
          : 'client_upload'
        : 'internal_or_professional_upload',
  })
}

export function buildDocumentRequestUploadOwnershipMatrix(requirements = DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements) {
  return Object.freeze((requirements || []).map((requirement) =>
    resolveDocumentRequestUploadOwnership({
      key: requirement.key,
      ownerRole: requirement.ownerRole,
      requestedFrom: requirement.requestedFrom,
      visibility: requirement.visibility,
    }),
  ))
}

export function buildDocumentRequestUploadOwnershipAudit(requirements = DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements) {
  const ownership = buildDocumentRequestUploadOwnershipMatrix(requirements)
  const failures = []
  const warnings = []

  for (const item of ownership) {
    if (!item.documentKey) {
      failures.push({ code: 'missing_document_key', documentKey: item.documentKey })
    }
    if (!item.responsiblePartyRole) {
      failures.push({ code: 'missing_responsible_party', documentKey: item.documentKey })
    }
    if (!item.uploadableByRoles.length) {
      failures.push({ code: 'missing_uploadable_roles', documentKey: item.documentKey })
    }
    if (CLIENT_ROLES.has(item.responsiblePartyRole) && !item.uploadableByRoles.includes('agent')) {
      failures.push({ code: 'client_upload_without_agent_on_behalf', documentKey: item.documentKey })
    }
    if (SELLER_EXTERNAL_UPLOAD_KEYS.has(item.documentKey) && item.responsiblePartyRole !== 'seller') {
      failures.push({ code: 'seller_external_document_not_seller_owned', documentKey: item.documentKey })
    }
    if (PROFESSIONAL_ONLY_KEYS.has(item.documentKey) && item.clientUploadDebt) {
      failures.push({ code: 'professional_document_marked_as_client_upload_debt', documentKey: item.documentKey })
    }
    if (item.documentKey === 'vat_status_confirmation' && !item.clientVisibleUploadDebt) {
      warnings.push({
        code: 'seller_owned_professional_shared_visibility',
        documentKey: item.documentKey,
        message: 'VAT status confirmation is seller-owned for upload purposes but still professional-shared in the current visibility policy.',
      })
    }
  }

  const byResponsibleParty = ownership.reduce((acc, item) => {
    acc[item.responsiblePartyRole] = (acc[item.responsiblePartyRole] || 0) + 1
    return acc
  }, {})
  const byUploadMode = ownership.reduce((acc, item) => {
    acc[item.uploadMode] = (acc[item.uploadMode] || 0) + 1
    return acc
  }, {})

  return Object.freeze({
    version: DOCUMENT_REQUEST_UPLOAD_OWNERSHIP_MODEL_VERSION,
    total: ownership.length,
    ownership,
    byResponsibleParty: Object.freeze(byResponsibleParty),
    byUploadMode: Object.freeze(byUploadMode),
    clientUploadDebtCount: ownership.filter((item) => item.clientUploadDebt).length,
    professionalOnlyCount: ownership.filter((item) => item.professionalOnly).length,
    agentOnBehalfCount: ownership.filter((item) => item.agentMayUploadOnBehalf).length,
    sellerExternalUploadKeys: SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS,
    bondOriginatorAssistedKeys: Object.freeze([...BOND_ORIGINATOR_ASSISTED_KEYS]),
    professionalOnlyKeys: Object.freeze([...PROFESSIONAL_ONLY_KEYS]),
    failures: Object.freeze(failures),
    warnings: Object.freeze(warnings),
    ok: failures.length === 0,
  })
}
