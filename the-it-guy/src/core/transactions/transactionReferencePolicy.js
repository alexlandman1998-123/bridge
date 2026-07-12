export const TRANSACTION_REFERENCE_TYPES = Object.freeze({
  bridgeMatterNumber: 'bridge_matter_number',
  transactionReference: 'transaction_reference',
  transferAttorneyMatterNumber: 'transfer_attorney_matter_number',
  bondAttorneyMatterNumber: 'bond_attorney_matter_number',
  cancellationAttorneyMatterNumber: 'cancellation_attorney_matter_number',
  bondOriginatorApplicationReference: 'bond_originator_application_reference',
  bankApplicationReference: 'bank_application_reference',
})

export const TRANSACTION_REFERENCE_SCOPES = Object.freeze({
  transaction: 'transaction',
  attorneyAssignment: 'attorney_assignment',
  bondApplication: 'bond_application',
})

export const TRANSACTION_REFERENCE_SOURCE_VALUES = Object.freeze([
  'manual',
  'partner_portal',
  'partner_api',
  'import',
  'system',
  'legacy',
  'correction',
])

const SYSTEM_CORRECTION_ROLES = Object.freeze(['internal_admin', 'platform_admin'])
const TRANSACTION_TEAM_CORRECTION_ROLES = Object.freeze(['agency_admin', 'developer', 'internal_admin', 'platform_admin'])
const ATTORNEY_FIRM_ADMIN_ROLES = Object.freeze(['firm_admin', 'director_partner', 'internal_admin', 'platform_admin'])

const ATTORNEY_MATTER_REFERENCE_PROVENANCE_TARGETS = Object.freeze({
  sourceTarget: 'transaction_attorney_assignments.matter_reference_source',
  updatedByTarget: 'transaction_attorney_assignments.matter_reference_updated_by',
  updatedAtTarget: 'transaction_attorney_assignments.matter_reference_updated_at',
})

const TRANSACTION_REFERENCE_SOURCE_LABELS = Object.freeze({
  manual: 'Manual',
  partner_portal: 'Partner portal',
  partner_api: 'Partner API',
  import: 'Import',
  system: 'System',
  legacy: 'Legacy',
  correction: 'Correction',
})

export const TRANSACTION_REFERENCE_DISPLAY_ORDER = Object.freeze([
  TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber,
  TRANSACTION_REFERENCE_TYPES.transactionReference,
  TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber,
  TRANSACTION_REFERENCE_TYPES.bondAttorneyMatterNumber,
  TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber,
  TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference,
  TRANSACTION_REFERENCE_TYPES.bankApplicationReference,
])

export const SHARED_TRANSACTION_REFERENCE_AUDIENCE = Object.freeze({
  agent: TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber,
  buyer: TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber,
  seller: TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber,
  client: TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber,
})

export const TRANSACTION_REFERENCE_POLICIES = Object.freeze({
  [TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber]: Object.freeze({
    type: TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber,
    label: 'Bridge Matter No',
    description: 'System-generated reference for the whole transaction. This is the shared reference agents, buyers, and sellers should see.',
    scope: TRANSACTION_REFERENCE_SCOPES.transaction,
    ownerRole: 'system',
    storageTarget: 'transactions.matter_number',
    editable: false,
    correctionRoles: SYSTEM_CORRECTION_ROLES,
    visibleTo: ['agent', 'buyer', 'seller', 'client', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator', 'developer', 'internal_admin'],
    auditRequired: true,
  }),
  [TRANSACTION_REFERENCE_TYPES.transactionReference]: Object.freeze({
    type: TRANSACTION_REFERENCE_TYPES.transactionReference,
    label: 'Transaction Ref',
    description: 'Legacy or agency-facing transaction reference. It is not a separate buyer or seller number.',
    scope: TRANSACTION_REFERENCE_SCOPES.transaction,
    ownerRole: 'system',
    storageTarget: 'transactions.transaction_reference',
    editable: false,
    correctionRoles: TRANSACTION_TEAM_CORRECTION_ROLES,
    visibleTo: ['agent', 'buyer', 'seller', 'client', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator', 'developer', 'internal_admin'],
    auditRequired: true,
  }),
  [TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber]: Object.freeze({
    type: TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber,
    label: 'Transfer Matter No',
    description: 'External matter number supplied by the transfer attorney firm for the transfer lane.',
    scope: TRANSACTION_REFERENCE_SCOPES.attorneyAssignment,
    ownerRole: 'transfer_attorney',
    assignmentRole: 'transfer_attorney',
    assignmentTypeFallbacks: ['transfer', 'transfer_and_bond'],
    storageTarget: 'transaction_attorney_assignments.matter_reference',
    ...ATTORNEY_MATTER_REFERENCE_PROVENANCE_TARGETS,
    editable: true,
    editableRoles: ['transfer_attorney', ...ATTORNEY_FIRM_ADMIN_ROLES],
    visibleTo: ['agent', 'buyer', 'seller', 'client', 'transfer_attorney', 'developer', 'internal_admin'],
    auditRequired: true,
  }),
  [TRANSACTION_REFERENCE_TYPES.bondAttorneyMatterNumber]: Object.freeze({
    type: TRANSACTION_REFERENCE_TYPES.bondAttorneyMatterNumber,
    label: 'Bond Matter No',
    description: 'External matter number supplied by the bond attorney firm for the bond registration lane.',
    scope: TRANSACTION_REFERENCE_SCOPES.attorneyAssignment,
    ownerRole: 'bond_attorney',
    assignmentRole: 'bond_attorney',
    assignmentTypeFallbacks: ['bond', 'transfer_and_bond'],
    storageTarget: 'transaction_attorney_assignments.matter_reference',
    ...ATTORNEY_MATTER_REFERENCE_PROVENANCE_TARGETS,
    editable: true,
    editableRoles: ['bond_attorney', ...ATTORNEY_FIRM_ADMIN_ROLES],
    visibleTo: ['agent', 'buyer', 'client', 'bond_attorney', 'bond_originator', 'developer', 'internal_admin'],
    auditRequired: true,
  }),
  [TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber]: Object.freeze({
    type: TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber,
    label: 'Cancellation Matter No',
    description: 'External matter number supplied by the cancellation attorney firm for seller bond cancellation.',
    scope: TRANSACTION_REFERENCE_SCOPES.attorneyAssignment,
    ownerRole: 'cancellation_attorney',
    assignmentRole: 'cancellation_attorney',
    assignmentTypeFallbacks: ['cancellation'],
    storageTarget: 'transaction_attorney_assignments.matter_reference',
    ...ATTORNEY_MATTER_REFERENCE_PROVENANCE_TARGETS,
    editable: true,
    editableRoles: ['cancellation_attorney', ...ATTORNEY_FIRM_ADMIN_ROLES],
    visibleTo: ['agent', 'seller', 'client', 'cancellation_attorney', 'transfer_attorney', 'developer', 'internal_admin'],
    auditRequired: true,
  }),
  [TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference]: Object.freeze({
    type: TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference,
    label: 'Bond Originator App Ref',
    description: 'External application reference supplied by the appointed bond originator.',
    scope: TRANSACTION_REFERENCE_SCOPES.bondApplication,
    ownerRole: 'bond_originator',
    storageTarget: 'transaction_bond_applications.application_reference',
    editable: true,
    editableRoles: ['bond_originator', ...TRANSACTION_TEAM_CORRECTION_ROLES],
    visibleTo: ['agent', 'buyer', 'client', 'bond_originator', 'bond_attorney', 'developer', 'internal_admin'],
    auditRequired: true,
  }),
  [TRANSACTION_REFERENCE_TYPES.bankApplicationReference]: Object.freeze({
    type: TRANSACTION_REFERENCE_TYPES.bankApplicationReference,
    label: 'Bank Application Ref',
    description: 'Bank-specific reference for an individual bank application submission.',
    scope: TRANSACTION_REFERENCE_SCOPES.bondApplication,
    ownerRole: 'bond_originator',
    storageTarget: 'transaction_bond_applications.reference_number',
    editable: true,
    editableRoles: ['bond_originator', ...TRANSACTION_TEAM_CORRECTION_ROLES],
    visibleTo: ['agent', 'buyer', 'client', 'bond_originator', 'bond_attorney', 'developer', 'internal_admin'],
    auditRequired: true,
  }),
})

const ROLE_ALIASES = Object.freeze({
  admin: 'internal_admin',
  platform: 'platform_admin',
  platform_admin: 'platform_admin',
  agency_principal: 'agency_admin',
  principal: 'agency_admin',
  conveyancer: 'transfer_attorney',
  attorney: 'transfer_attorney',
  transferring_attorney: 'transfer_attorney',
  bond_registration_attorney: 'bond_attorney',
  registration_attorney: 'bond_attorney',
  cancellation: 'cancellation_attorney',
  bond_cancellation_attorney: 'cancellation_attorney',
  purchaser: 'buyer',
  client_buyer: 'buyer',
  vendor: 'seller',
})

export function normalizeTransactionReferenceRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ROLE_ALIASES[normalized] || normalized
}

export function normalizeTransactionReferenceSource(source = 'manual') {
  const normalized = String(source || 'manual').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return TRANSACTION_REFERENCE_SOURCE_VALUES.includes(normalized) ? normalized : 'manual'
}

function normalizeReferenceDisplayValue(value = '') {
  return String(value || '').trim()
}

function firstReferenceValue(...values) {
  for (const value of values) {
    const normalized = normalizeReferenceDisplayValue(value)
    if (normalized) return normalized
  }
  return ''
}

function normalizeReferenceRows(rows = []) {
  return Array.isArray(rows) ? rows.filter(Boolean) : []
}

function buildReferenceItem({
  policy,
  value = '',
  source = 'manual',
  updatedAt = null,
  updatedBy = null,
  entityId = null,
  entityType = '',
  role = '',
  storageTarget = '',
  isPrimary = false,
  isFallback = false,
  fallbackStorageTarget = '',
} = {}) {
  const normalizedValue = normalizeReferenceDisplayValue(value)
  if (!policy || !normalizedValue) return null
  const normalizedSource = normalizeTransactionReferenceSource(source)
  return {
    type: policy.type,
    label: policy.label,
    value: normalizedValue,
    displayValue: normalizedValue,
    description: policy.description,
    ownerRole: policy.ownerRole,
    scope: policy.scope,
    storageTarget: storageTarget || policy.storageTarget,
    source: normalizedSource,
    sourceLabel: TRANSACTION_REFERENCE_SOURCE_LABELS[normalizedSource] || normalizedSource,
    updatedAt: updatedAt || null,
    updatedBy: updatedBy || null,
    entityId: entityId || null,
    entityType: entityType || policy.scope,
    role: normalizeTransactionReferenceRole(role || policy.assignmentRole || policy.ownerRole),
    isPrimary: Boolean(isPrimary),
    isEditable: Boolean(policy.editable),
    isBridgeOwned: policy.ownerRole === 'system',
    isPartnerOwned: policy.ownerRole !== 'system',
    isFallback: Boolean(isFallback),
    fallbackStorageTarget: fallbackStorageTarget || null,
  }
}

function hasAudienceAccess(policy = null, audienceRole = '') {
  if (!policy) return false
  const normalizedRole = normalizeTransactionReferenceRole(audienceRole || '')
  if (!normalizedRole) return true
  return (policy.visibleTo || []).map(normalizeTransactionReferenceRole).includes(normalizedRole)
}

function getAssignmentMatterReferenceItems(assignments = []) {
  return normalizeReferenceRows(assignments)
    .map((assignment) => {
      const role = assignment.attorneyRole || assignment.attorney_role || assignment.role || assignment.assignmentRole || assignment.assignment_role
      const referenceType = getAttorneyMatterReferenceTypeForRole(role)
      const policy = getTransactionReferencePolicy(referenceType)
      return buildReferenceItem({
        policy,
        value: assignment.matterReference || assignment.matter_reference || assignment.reference || assignment.referenceNumber || assignment.reference_number,
        source: assignment.matterReferenceSource || assignment.matter_reference_source || assignment.referenceSource || assignment.reference_source || 'partner_portal',
        updatedAt: assignment.matterReferenceUpdatedAt || assignment.matter_reference_updated_at || assignment.updatedAt || assignment.updated_at,
        updatedBy: assignment.matterReferenceUpdatedBy || assignment.matter_reference_updated_by || assignment.updatedBy || assignment.updated_by,
        entityId: assignment.id || assignment.assignmentId || assignment.assignment_id,
        entityType: 'transaction_attorney_assignment',
        role,
      })
    })
    .filter(Boolean)
}

function getBondApplicationReferenceItems(applications = []) {
  return normalizeReferenceRows(applications)
    .flatMap((application) => {
      const entityId = application.id || application.applicationId || application.application_id
      const common = {
        source: application.referenceSource || application.reference_source || application.applicationReferenceSource || application.application_reference_source || 'partner_portal',
        updatedAt: application.updatedAt || application.updated_at || application.createdAt || application.created_at,
        updatedBy: application.updatedBy || application.updated_by || application.createdBy || application.created_by,
        entityId,
        entityType: 'transaction_bond_application',
        role: 'bond_originator',
      }
      return [
        buildReferenceItem({
          policy: getTransactionReferencePolicy(TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference),
          value: application.applicationReference || application.application_reference,
          ...common,
        }),
        buildReferenceItem({
          policy: getTransactionReferencePolicy(TRANSACTION_REFERENCE_TYPES.bankApplicationReference),
          value: application.referenceNumber || application.reference_number,
          ...common,
        }),
      ]
    })
    .filter(Boolean)
}

export function getTransactionReferencePolicy(referenceType = '') {
  return TRANSACTION_REFERENCE_POLICIES[String(referenceType || '').trim()] || null
}

export function getTransactionReferenceDisplayPolicies() {
  return TRANSACTION_REFERENCE_DISPLAY_ORDER
    .map((referenceType) => getTransactionReferencePolicy(referenceType))
    .filter(Boolean)
}

export function getSharedTransactionReferenceTypeForAudience(role = '') {
  const normalizedRole = normalizeTransactionReferenceRole(role)
  return SHARED_TRANSACTION_REFERENCE_AUDIENCE[normalizedRole] || TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber
}

export function canViewTransactionReference(referenceType = '', role = '') {
  return hasAudienceAccess(getTransactionReferencePolicy(referenceType), role)
}

export function canEditTransactionReference(referenceType = '', role = '') {
  const policy = getTransactionReferencePolicy(referenceType)
  const normalizedRole = normalizeTransactionReferenceRole(role)
  if (!policy || !normalizedRole) return false
  if (policy.editable && (policy.editableRoles || []).includes(normalizedRole)) return true
  if (!policy.editable && (policy.correctionRoles || []).includes(normalizedRole)) return true
  return false
}

export function canCorrectTransactionReference(referenceType = '', role = '') {
  const policy = getTransactionReferencePolicy(referenceType)
  const normalizedRole = normalizeTransactionReferenceRole(role)
  if (!policy || policy.editable || !normalizedRole) return false
  return (policy.correctionRoles || []).includes(normalizedRole)
}

export function getEditableTransactionReferenceTypesForRole(role = '') {
  return getTransactionReferenceDisplayPolicies()
    .filter((policy) => canEditTransactionReference(policy.type, role))
    .map((policy) => policy.type)
}

export function getCorrectableTransactionReferenceTypesForRole(role = '') {
  return getTransactionReferenceDisplayPolicies()
    .filter((policy) => canCorrectTransactionReference(policy.type, role))
    .map((policy) => policy.type)
}

export function isSystemOwnedTransactionReference(referenceType = '') {
  const policy = getTransactionReferencePolicy(referenceType)
  return policy?.ownerRole === 'system'
}

export function isAttorneyMatterReferenceType(referenceType = '') {
  return getTransactionReferencePolicy(referenceType)?.scope === TRANSACTION_REFERENCE_SCOPES.attorneyAssignment
}

export function isBondApplicationReferenceType(referenceType = '') {
  return getTransactionReferencePolicy(referenceType)?.scope === TRANSACTION_REFERENCE_SCOPES.bondApplication
}

export function getAttorneyMatterReferenceTypeForRole(role = '') {
  const normalizedRole = normalizeTransactionReferenceRole(role)
  if (normalizedRole === 'bond_attorney') return TRANSACTION_REFERENCE_TYPES.bondAttorneyMatterNumber
  if (normalizedRole === 'cancellation_attorney') return TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber
  return TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber
}

export function buildTransactionReferenceDisplayModel({
  transaction = {},
  attorneyAssignments = [],
  bondApplications = [],
  transactionFinanceWorkflow = null,
  audienceRole = 'agent',
  includeSystemReferences = false,
} = {}) {
  const transactionRow = transaction || {}
  const primaryPolicy = getTransactionReferencePolicy(getSharedTransactionReferenceTypeForAudience(audienceRole))
  const bridgeMatterNumber = firstReferenceValue(transactionRow.matterNumber, transactionRow.matter_number)
  const transactionReference = firstReferenceValue(transactionRow.transactionReference, transactionRow.transaction_reference, transactionRow.reference)
  const fallbackTransactionReference = transactionRow.id
    ? `TX-${String(transactionRow.id).replaceAll('-', '').slice(0, 8).toUpperCase()}`
    : ''
  const primaryValue = firstReferenceValue(bridgeMatterNumber, transactionReference, fallbackTransactionReference)
  const primary = buildReferenceItem({
    policy: primaryPolicy,
    value: primaryValue,
    source: bridgeMatterNumber ? 'system' : transactionReference ? 'legacy' : 'system',
    updatedAt: transactionRow.updatedAt || transactionRow.updated_at || transactionRow.createdAt || transactionRow.created_at,
    updatedBy: transactionRow.updatedBy || transactionRow.updated_by || transactionRow.createdBy || transactionRow.created_by,
    entityId: transactionRow.id || transactionRow.transactionId || transactionRow.transaction_id,
    entityType: 'transaction',
    isPrimary: true,
    isFallback: !bridgeMatterNumber,
    fallbackStorageTarget: bridgeMatterNumber ? '' : transactionReference ? 'transactions.transaction_reference' : 'transactions.id',
  })

  const systemItems = [
    includeSystemReferences && transactionReference && transactionReference !== primaryValue
      ? buildReferenceItem({
          policy: getTransactionReferencePolicy(TRANSACTION_REFERENCE_TYPES.transactionReference),
          value: transactionReference,
          source: 'legacy',
          updatedAt: transactionRow.updatedAt || transactionRow.updated_at || transactionRow.createdAt || transactionRow.created_at,
          updatedBy: transactionRow.updatedBy || transactionRow.updated_by || transactionRow.createdBy || transactionRow.created_by,
          entityId: transactionRow.id || transactionRow.transactionId || transactionRow.transaction_id,
          entityType: 'transaction',
        })
      : null,
  ].filter(Boolean)

  const workflowApplications = Array.isArray(transactionFinanceWorkflow?.applications)
    ? transactionFinanceWorkflow.applications
    : []
  const partnerItems = [
    ...getAssignmentMatterReferenceItems(attorneyAssignments),
    ...getBondApplicationReferenceItems([...normalizeReferenceRows(bondApplications), ...workflowApplications]),
  ]

  const visibleItems = [primary, ...systemItems, ...partnerItems]
    .filter(Boolean)
    .filter((item) => hasAudienceAccess(getTransactionReferencePolicy(item.type), audienceRole))
  const seen = new Set()
  const items = visibleItems.filter((item) => {
    const key = `${item.type}:${item.entityId || item.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    audienceRole: normalizeTransactionReferenceRole(audienceRole),
    primary,
    items,
    partnerItems: items.filter((item) => item.isPartnerOwned),
    systemItems: items.filter((item) => item.isBridgeOwned),
    hasPartnerReferences: items.some((item) => item.isPartnerOwned),
  }
}
