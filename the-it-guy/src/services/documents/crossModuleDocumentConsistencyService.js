import {
  CROSS_MODULE_DOCUMENT_DEFINITION_BY_KEY,
  CROSS_MODULE_DOCUMENT_KEY_MAP_VERSION,
  listCrossModuleDocumentDefinitions,
  normalizeCrossModuleDocumentKey,
  resolveCrossModuleDocumentReference,
} from './crossModuleDocumentKeyMapService.js'

export const CROSS_MODULE_DOCUMENT_CONSISTENCY_VERSION = 'cross_module_document_consistency_v1'
export const CROSS_MODULE_DOCUMENT_CONSISTENCY_GATE_VERSION = 'cross_module_document_consistency_gate_v1'
export const CROSS_MODULE_DOCUMENT_CONSISTENCY_REVIEW_PACKET_VERSION = 'cross_module_document_consistency_review_packet_v1'

export const CROSS_MODULE_DOCUMENT_TOUCHPOINTS = Object.freeze({
  seller_portal: Object.freeze({
    key: 'seller_portal',
    label: 'Seller Portal',
    moduleKey: 'seller_portal',
    context: Object.freeze({ requestedFromRole: 'seller', ownerRole: 'seller' }),
  }),
  listing_documents: Object.freeze({
    key: 'listing_documents',
    label: 'Listing Documents',
    moduleKey: 'listing_documents',
    context: Object.freeze({ requestedFromRole: 'seller' }),
  }),
  seller_leads: Object.freeze({
    key: 'seller_leads',
    label: 'Seller Leads',
    moduleKey: 'seller_leads',
    context: Object.freeze({ requestedFromRole: 'seller', ownerRole: 'seller' }),
  }),
  buyer_agency: Object.freeze({
    key: 'buyer_agency',
    label: 'Buyer Agency',
    moduleKey: 'buyer_agency',
    context: Object.freeze({ requestedFromRole: 'buyer' }),
  }),
  buyer_onboarding: Object.freeze({
    key: 'buyer_onboarding',
    label: 'Buyer Onboarding',
    moduleKey: 'buyer_onboarding',
    context: Object.freeze({ requestedFromRole: 'buyer', ownerRole: 'buyer' }),
  }),
  transaction_documents: Object.freeze({
    key: 'transaction_documents',
    label: 'Transaction Documents',
    moduleKey: 'transaction_documents',
    context: Object.freeze({ requestedFromRole: 'buyer' }),
  }),
  attorney_transfer: Object.freeze({
    key: 'attorney_transfer',
    label: 'Transfer Attorney',
    moduleKey: 'attorney_transfer',
    context: Object.freeze({ requestedFromRole: 'transfer_attorney' }),
  }),
  bond_attorney: Object.freeze({
    key: 'bond_attorney',
    label: 'Bond Attorney',
    moduleKey: 'bond_attorney',
    context: Object.freeze({ requestedFromRole: 'bond_attorney' }),
  }),
  bond_cancellation: Object.freeze({
    key: 'bond_cancellation',
    label: 'Cancellation Attorney',
    moduleKey: 'bond_cancellation',
    context: Object.freeze({ requestedFromRole: 'cancellation_attorney' }),
  }),
  bond_originator: Object.freeze({
    key: 'bond_originator',
    label: 'Bond Originator',
    moduleKey: 'bond_originator',
    context: Object.freeze({ requestedFromRole: 'bond_originator' }),
  }),
})

const DEFAULT_PARITY_ROWS = Object.freeze([
  Object.freeze({
    touchpointKey: 'seller_portal',
    documentKey: 'id_document',
    groupKey: 'seller_identity_fica',
    parityGroup: 'seller_identity.id_document',
    expectedCanonicalDocumentKey: 'seller_id_document',
  }),
  Object.freeze({
    touchpointKey: 'listing_documents',
    documentKey: 'id_document',
    groupKey: 'seller_identity_fica',
    parityGroup: 'seller_identity.id_document',
    expectedCanonicalDocumentKey: 'seller_id_document',
  }),
  Object.freeze({
    touchpointKey: 'seller_leads',
    documentKey: 'seller_fica',
    groupKey: 'seller_identity_fica',
    parityGroup: 'seller_identity.id_document',
    expectedCanonicalDocumentKey: 'seller_id_document',
  }),
  Object.freeze({
    touchpointKey: 'attorney_transfer',
    documentKey: 'seller_fica',
    visibleSection: 'seller_documents',
    parityGroup: 'seller_identity.id_document',
    expectedCanonicalDocumentKey: 'seller_id_document',
  }),

  Object.freeze({
    touchpointKey: 'seller_portal',
    documentKey: 'proof_of_address',
    groupKey: 'seller_identity_fica',
    parityGroup: 'seller_identity.proof_of_address',
    expectedCanonicalDocumentKey: 'seller_proof_of_address',
  }),
  Object.freeze({
    touchpointKey: 'listing_documents',
    documentKey: 'proof_of_address',
    groupKey: 'seller_identity_fica',
    parityGroup: 'seller_identity.proof_of_address',
    expectedCanonicalDocumentKey: 'seller_proof_of_address',
  }),
  Object.freeze({
    touchpointKey: 'seller_leads',
    documentKey: 'seller_address',
    groupKey: 'seller_identity_fica',
    parityGroup: 'seller_identity.proof_of_address',
    expectedCanonicalDocumentKey: 'seller_proof_of_address',
  }),

  Object.freeze({
    touchpointKey: 'seller_portal',
    documentKey: 'title_deed',
    groupKey: 'property_ownership',
    parityGroup: 'seller_property.title_deed',
    expectedCanonicalDocumentKey: 'title_deed_copy',
  }),
  Object.freeze({
    touchpointKey: 'listing_documents',
    documentKey: 'title_deed_reference',
    groupKey: 'property_ownership',
    parityGroup: 'seller_property.title_deed',
    expectedCanonicalDocumentKey: 'title_deed_copy',
  }),
  Object.freeze({
    touchpointKey: 'attorney_transfer',
    documentKey: 'final_title_deed_copy',
    visibleSection: 'transfer_documents',
    parityGroup: 'seller_property.title_deed',
    expectedCanonicalDocumentKey: 'title_deed_copy',
  }),

  Object.freeze({
    touchpointKey: 'listing_documents',
    documentKey: 'property_condition_disclosure',
    groupKey: 'property_compliance',
    parityGroup: 'property_disclosure.condition',
    expectedCanonicalDocumentKey: 'property_condition_disclosure',
  }),
  Object.freeze({
    touchpointKey: 'buyer_agency',
    documentKey: 'defects_declaration',
    groupKey: 'property_compliance',
    parityGroup: 'property_disclosure.condition',
    expectedCanonicalDocumentKey: 'property_condition_disclosure',
  }),
  Object.freeze({
    touchpointKey: 'attorney_transfer',
    documentKey: 'property_condition_disclosure',
    visibleSection: 'transfer_documents',
    parityGroup: 'property_disclosure.condition',
    expectedCanonicalDocumentKey: 'property_condition_disclosure',
  }),

  Object.freeze({
    touchpointKey: 'buyer_agency',
    documentKey: 'id_document',
    groupKey: 'buyer_fica',
    parityGroup: 'buyer_identity.id_document',
    expectedCanonicalDocumentKey: 'buyer_id_document',
  }),
  Object.freeze({
    touchpointKey: 'buyer_onboarding',
    documentKey: 'buyer_fica',
    groupKey: 'buyer_fica',
    parityGroup: 'buyer_identity.id_document',
    expectedCanonicalDocumentKey: 'buyer_id_document',
  }),
  Object.freeze({
    touchpointKey: 'transaction_documents',
    documentKey: 'purchaser_id',
    visibleSection: 'buyer_documents',
    parityGroup: 'buyer_identity.id_document',
    expectedCanonicalDocumentKey: 'buyer_id_document',
  }),
  Object.freeze({
    touchpointKey: 'attorney_transfer',
    documentKey: 'buyer_fica',
    visibleSection: 'buyer_documents',
    parityGroup: 'buyer_identity.id_document',
    expectedCanonicalDocumentKey: 'buyer_id_document',
  }),

  Object.freeze({
    touchpointKey: 'buyer_agency',
    documentKey: 'proof_of_address',
    groupKey: 'buyer_fica',
    parityGroup: 'buyer_identity.proof_of_address',
    expectedCanonicalDocumentKey: 'buyer_proof_of_address',
  }),
  Object.freeze({
    touchpointKey: 'buyer_onboarding',
    documentKey: 'purchaser_proof_of_address',
    groupKey: 'buyer_fica',
    parityGroup: 'buyer_identity.proof_of_address',
    expectedCanonicalDocumentKey: 'buyer_proof_of_address',
  }),
  Object.freeze({
    touchpointKey: 'transaction_documents',
    documentKey: 'proof_of_address',
    visibleSection: 'buyer_documents',
    parityGroup: 'buyer_identity.proof_of_address',
    expectedCanonicalDocumentKey: 'buyer_proof_of_address',
  }),

  Object.freeze({
    touchpointKey: 'buyer_agency',
    documentKey: 'company_resolution',
    groupKey: 'buyer_fica',
    parityGroup: 'buyer_entity.company_registration',
    expectedCanonicalDocumentKey: 'buyer_company_registration',
  }),
  Object.freeze({
    touchpointKey: 'buyer_onboarding',
    documentKey: 'cipc_registration',
    groupKey: 'buyer_fica',
    parityGroup: 'buyer_entity.company_registration',
    expectedCanonicalDocumentKey: 'buyer_company_registration',
  }),
  Object.freeze({
    touchpointKey: 'attorney_transfer',
    documentKey: 'buyer_company_registration_documents',
    visibleSection: 'buyer_documents',
    parityGroup: 'buyer_entity.company_registration',
    expectedCanonicalDocumentKey: 'buyer_company_registration',
  }),

  Object.freeze({
    touchpointKey: 'buyer_agency',
    documentKey: 'trust_deed',
    groupKey: 'buyer_fica',
    parityGroup: 'buyer_entity.trust_deed',
    expectedCanonicalDocumentKey: 'buyer_trust_deed',
  }),
  Object.freeze({
    touchpointKey: 'buyer_onboarding',
    documentKey: 'buyer_trustee_resolution',
    groupKey: 'buyer_fica',
    parityGroup: 'buyer_entity.trust_deed',
    expectedCanonicalDocumentKey: 'buyer_trust_deed',
  }),
  Object.freeze({
    touchpointKey: 'attorney_transfer',
    documentKey: 'buyer_trust_beneficial_ownership',
    visibleSection: 'buyer_documents',
    parityGroup: 'buyer_entity.trust_deed',
    expectedCanonicalDocumentKey: 'buyer_trust_deed',
  }),

  Object.freeze({
    touchpointKey: 'transaction_documents',
    documentKey: 'sale_agreement_or_otp',
    visibleSection: 'transfer_documents',
    parityGroup: 'transaction_sale.signed_otp',
    expectedCanonicalDocumentKey: 'signed_otp',
  }),
  Object.freeze({
    touchpointKey: 'attorney_transfer',
    documentKey: 'otp_signed',
    visibleSection: 'transfer_documents',
    parityGroup: 'transaction_sale.signed_otp',
    expectedCanonicalDocumentKey: 'signed_otp',
  }),

  Object.freeze({
    touchpointKey: 'transaction_documents',
    documentKey: 'transfer_duty_information',
    visibleSection: 'transfer_documents',
    parityGroup: 'attorney_transfer.transfer_documents',
    expectedCanonicalDocumentKey: 'transfer_documents',
  }),
  Object.freeze({
    touchpointKey: 'attorney_transfer',
    documentKey: 'developer_sale_pack',
    visibleSection: 'transfer_documents',
    parityGroup: 'attorney_transfer.transfer_documents',
    expectedCanonicalDocumentKey: 'transfer_documents',
  }),

  Object.freeze({
    touchpointKey: 'transaction_documents',
    documentKey: 'bond_grant_letter',
    visibleSection: 'bond_registration_documents',
    parityGroup: 'bond_finance.grant_letter',
    expectedCanonicalDocumentKey: 'grant_letter',
  }),
  Object.freeze({
    touchpointKey: 'bond_attorney',
    documentKey: 'grant_signed',
    visibleSection: 'bond_registration_documents',
    parityGroup: 'bond_finance.grant_letter',
    expectedCanonicalDocumentKey: 'grant_letter',
  }),
  Object.freeze({
    touchpointKey: 'bond_originator',
    documentKey: 'bond_grant_letter',
    groupKey: 'buyer_finance',
    parityGroup: 'bond_finance.grant_letter',
    expectedCanonicalDocumentKey: 'grant_letter',
  }),

  Object.freeze({
    touchpointKey: 'transaction_documents',
    documentKey: 'bond_instruction',
    visibleSection: 'bond_registration_documents',
    parityGroup: 'bond_finance.instruction',
    expectedCanonicalDocumentKey: 'bond_instruction_to_attorneys',
  }),
  Object.freeze({
    touchpointKey: 'bond_attorney',
    documentKey: 'buyer_signed_bond_documents',
    visibleSection: 'bond_registration_documents',
    parityGroup: 'bond_finance.instruction',
    expectedCanonicalDocumentKey: 'bond_instruction_to_attorneys',
  }),
  Object.freeze({
    touchpointKey: 'bond_originator',
    documentKey: 'bond_instruction',
    groupKey: 'bond_originator',
    parityGroup: 'bond_finance.instruction',
    expectedCanonicalDocumentKey: 'bond_instruction_to_attorneys',
  }),

  Object.freeze({
    touchpointKey: 'transaction_documents',
    documentKey: 'cancellation_instruction',
    visibleSection: 'bond_cancellation_documents',
    parityGroup: 'bond_cancellation.notice',
    expectedCanonicalDocumentKey: 'bond_cancellation_notice',
  }),
  Object.freeze({
    touchpointKey: 'bond_cancellation',
    documentKey: 'bank_cancellation_documents',
    visibleSection: 'bond_cancellation_documents',
    parityGroup: 'bond_cancellation.notice',
    expectedCanonicalDocumentKey: 'bond_cancellation_notice',
  }),
])

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value, fallback = 100) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function normalizeIssueCode(value) {
  return normalizeCrossModuleDocumentKey(value)
}

function getTouchpoint(value) {
  const key = normalizeCrossModuleDocumentKey(value)
  return CROSS_MODULE_DOCUMENT_TOUCHPOINTS[key] || {
    key,
    label: key ? key.replace(/_/g, ' ') : 'Unknown touchpoint',
    moduleKey: key,
    context: {},
  }
}

function getRowDocumentKey(row = {}) {
  return row.canonicalDocumentKey ||
    row.canonical_document_key ||
    row.documentDefinitionKey ||
    row.document_definition_key ||
    row.documentKey ||
    row.document_key ||
    row.requirementKey ||
    row.requirement_key ||
    row.key ||
    row.type ||
    row.documentType ||
    row.document_type ||
    ''
}

function getRowContext(row = {}, touchpoint = {}) {
  return {
    ...(touchpoint.context || {}),
    groupKey: row.groupKey || row.group_key,
    packKey: row.packKey || row.pack_key || row.requirementGroup || row.requirement_group,
    requestedFromRole: row.requestedFromRole || row.requested_from_role || row.requiredFromRole || row.required_from_role || row.expectedFromRole || row.expected_from_role,
    ownerRole: row.ownerRole || row.owner_role || row.documentOwnerRole || row.document_owner_role,
    visibleSection: row.visibleSection || row.visible_section,
    portalWorkspaceCategory: row.portalWorkspaceCategory || row.portal_workspace_category,
  }
}

function getCanonicalRequirementInstanceId(row = {}) {
  return normalizeText(row.canonicalRequirementInstanceId || row.canonical_requirement_instance_id)
}

function normalizeTouchpointInput(input = {}) {
  if (Array.isArray(input)) {
    return input.reduce((accumulator, row) => {
      const touchpointKey = normalizeCrossModuleDocumentKey(row?.touchpointKey || row?.touchpoint || row?.surfaceKey || row?.moduleKey)
      if (!touchpointKey) return accumulator
      accumulator[touchpointKey] = [...(accumulator[touchpointKey] || []), row]
      return accumulator
    }, {})
  }
  return Object.entries(input || {}).reduce((accumulator, [touchpointKey, rows]) => {
    accumulator[normalizeCrossModuleDocumentKey(touchpointKey)] = Array.isArray(rows) ? rows : []
    return accumulator
  }, {})
}

function buildDefaultTouchpointInput() {
  return normalizeTouchpointInput(DEFAULT_PARITY_ROWS)
}

function buildIssue({
  severity = 'warning',
  code,
  message,
  touchpointKey = '',
  documentKey = '',
  canonicalDocumentKey = '',
  parityGroup = '',
  details = {},
} = {}) {
  return {
    severity,
    code: normalizeIssueCode(code),
    message,
    touchpointKey,
    documentKey,
    canonicalDocumentKey,
    parityGroup,
    details,
  }
}

function normalizeExpectedKey(value) {
  return normalizeCrossModuleDocumentKey(value)
}

function buildTouchpointRows(touchpointKey, rows = []) {
  const touchpoint = getTouchpoint(touchpointKey)
  const issues = []

  const resolvedRows = (Array.isArray(rows) ? rows : []).map((row, index) => {
    const documentKey = normalizeCrossModuleDocumentKey(getRowDocumentKey(row))
    const reference = resolveCrossModuleDocumentReference(documentKey, getRowContext(row, touchpoint))
    const definition = CROSS_MODULE_DOCUMENT_DEFINITION_BY_KEY[reference.canonicalDocumentKey] || null
    const expectedCanonicalDocumentKey = normalizeExpectedKey(row.expectedCanonicalDocumentKey || row.expected_canonical_document_key)
    const expectedOwnerRole = normalizeCrossModuleDocumentKey(row.expectedOwnerRole || row.expected_owner_role)
    const expectedPackKey = normalizeCrossModuleDocumentKey(row.expectedPackKey || row.expected_pack_key)
    const parityGroup = normalizeCrossModuleDocumentKey(row.parityGroup || row.parity_group || reference.canonicalDocumentKey)
    const moduleSupported = Boolean(!definition || !touchpoint.moduleKey || definition.modules.includes(touchpoint.moduleKey))

    if (!documentKey) {
      issues.push(buildIssue({
        severity: 'critical',
        code: 'missing_document_key',
        message: `${touchpoint.label} row ${index + 1} does not expose a document key.`,
        touchpointKey: touchpoint.key,
        parityGroup,
      }))
    }

    if (!reference.crossModuleDocumentKnown) {
      issues.push(buildIssue({
        severity: 'critical',
        code: 'unknown_document_key',
        message: `${touchpoint.label} document key ${documentKey || 'unknown'} is not covered by the cross-module document map.`,
        touchpointKey: touchpoint.key,
        documentKey,
        canonicalDocumentKey: reference.canonicalDocumentKey,
        parityGroup,
      }))
    }

    if (expectedCanonicalDocumentKey && reference.canonicalDocumentKey !== expectedCanonicalDocumentKey) {
      issues.push(buildIssue({
        severity: 'critical',
        code: 'canonical_document_mismatch',
        message: `${touchpoint.label} document key ${documentKey} resolved to ${reference.canonicalDocumentKey}, expected ${expectedCanonicalDocumentKey}.`,
        touchpointKey: touchpoint.key,
        documentKey,
        canonicalDocumentKey: reference.canonicalDocumentKey,
        parityGroup,
        details: { expectedCanonicalDocumentKey },
      }))
    }

    if (expectedOwnerRole && reference.documentOwnerRole !== expectedOwnerRole) {
      issues.push(buildIssue({
        severity: 'warning',
        code: 'document_owner_mismatch',
        message: `${touchpoint.label} document key ${documentKey} is owned by ${reference.documentOwnerRole || 'unknown'}, expected ${expectedOwnerRole}.`,
        touchpointKey: touchpoint.key,
        documentKey,
        canonicalDocumentKey: reference.canonicalDocumentKey,
        parityGroup,
        details: { expectedOwnerRole },
      }))
    }

    if (expectedPackKey && reference.documentPackKey !== expectedPackKey) {
      issues.push(buildIssue({
        severity: 'warning',
        code: 'document_pack_mismatch',
        message: `${touchpoint.label} document key ${documentKey} belongs to ${reference.documentPackKey || 'unknown'}, expected ${expectedPackKey}.`,
        touchpointKey: touchpoint.key,
        documentKey,
        canonicalDocumentKey: reference.canonicalDocumentKey,
        parityGroup,
        details: { expectedPackKey },
      }))
    }

    if (!moduleSupported) {
      issues.push(buildIssue({
        severity: 'warning',
        code: 'document_module_not_declared',
        message: `${touchpoint.label} uses ${reference.canonicalDocumentKey}, but the canonical definition does not list ${touchpoint.moduleKey}.`,
        touchpointKey: touchpoint.key,
        documentKey,
        canonicalDocumentKey: reference.canonicalDocumentKey,
        parityGroup,
        details: { modules: definition?.modules || [] },
      }))
    }

    return {
      rowIndex: index,
      touchpointKey: touchpoint.key,
      touchpointLabel: touchpoint.label,
      moduleKey: touchpoint.moduleKey,
      sourceTable: row.sourceTable || row.source_table || '',
      sourceId: row.sourceId || row.source_id || row.id || '',
      entityType: row.entityType || row.entity_type || '',
      entityId: row.entityId || row.entity_id || row.private_listing_id || row.transaction_id || '',
      canonicalRequirementInstanceId: getCanonicalRequirementInstanceId(row),
      documentKey,
      originalDocumentKey: reference.originalDocumentKey,
      canonicalDocumentKey: reference.canonicalDocumentKey,
      crossModuleDocumentKey: reference.crossModuleDocumentKey,
      crossModuleDocumentKnown: reference.crossModuleDocumentKnown,
      crossModuleDocumentMapVersion: reference.crossModuleDocumentMapVersion,
      documentOwnerRole: reference.documentOwnerRole,
      documentResponsibleRoles: reference.documentResponsibleRoles,
      documentPackKey: reference.documentPackKey,
      documentCategory: reference.documentCategory,
      documentLabel: reference.documentLabel,
      moduleSupported,
      expectedCanonicalDocumentKey,
      parityGroup,
    }
  })

  const canonicalKeys = unique(resolvedRows.map((row) => row.canonicalDocumentKey))
  const unknownRows = resolvedRows.filter((row) => !row.crossModuleDocumentKnown)
  const unsupportedModuleRows = resolvedRows.filter((row) => !row.moduleSupported)

  return {
    touchpoint,
    rows: resolvedRows,
    issues,
    summary: {
      totalRows: resolvedRows.length,
      knownRows: resolvedRows.length - unknownRows.length,
      unknownRows: unknownRows.length,
      unsupportedModuleRows: unsupportedModuleRows.length,
      canonicalDocumentKeys: canonicalKeys,
    },
  }
}

function buildParityGroups(rows = []) {
  const byGroup = new Map()
  for (const row of rows) {
    const key = row.parityGroup || row.canonicalDocumentKey
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(row)
  }

  return [...byGroup.entries()].map(([parityGroup, groupRows]) => {
    const canonicalDocumentKeys = unique(groupRows.map((row) => row.canonicalDocumentKey))
    const touchpointKeys = unique(groupRows.map((row) => row.touchpointKey))
    const expectedCanonicalKeys = unique(groupRows.map((row) => row.expectedCanonicalDocumentKey))
    return {
      parityGroup,
      totalRows: groupRows.length,
      consistent: canonicalDocumentKeys.length <= 1 && expectedCanonicalKeys.length <= 1,
      canonicalDocumentKeys,
      expectedCanonicalKeys,
      touchpointKeys,
      rows: groupRows,
    }
  }).sort((left, right) => left.parityGroup.localeCompare(right.parityGroup))
}

function buildParityIssues(parityGroups = []) {
  return parityGroups.flatMap((group) => {
    const issues = []
    if (group.canonicalDocumentKeys.length > 1) {
      issues.push(buildIssue({
        severity: 'critical',
        code: 'parity_group_canonical_split',
        message: `${group.parityGroup} resolves to multiple canonical document keys.`,
        parityGroup: group.parityGroup,
        canonicalDocumentKey: group.canonicalDocumentKeys.join(', '),
        details: {
          canonicalDocumentKeys: group.canonicalDocumentKeys,
          touchpointKeys: group.touchpointKeys,
        },
      }))
    }
    if (group.expectedCanonicalKeys.length > 1) {
      issues.push(buildIssue({
        severity: 'critical',
        code: 'parity_group_expected_key_split',
        message: `${group.parityGroup} has conflicting expected canonical document keys.`,
        parityGroup: group.parityGroup,
        details: {
          expectedCanonicalKeys: group.expectedCanonicalKeys,
          touchpointKeys: group.touchpointKeys,
        },
      }))
    }
    return issues
  })
}

function buildDefinitionCoverageIssues() {
  return listCrossModuleDocumentDefinitions().flatMap((definition) => {
    const issues = []
    if (!definition.modules.length) {
      issues.push(buildIssue({
        severity: 'warning',
        code: 'canonical_definition_without_modules',
        message: `${definition.canonicalKey} does not declare any module touchpoints.`,
        canonicalDocumentKey: definition.canonicalKey,
      }))
    }
    if (!definition.ownerRole) {
      issues.push(buildIssue({
        severity: 'critical',
        code: 'canonical_definition_without_owner',
        message: `${definition.canonicalKey} does not declare a document owner role.`,
        canonicalDocumentKey: definition.canonicalKey,
      }))
    }
    if (!definition.packKey) {
      issues.push(buildIssue({
        severity: 'warning',
        code: 'canonical_definition_without_pack',
        message: `${definition.canonicalKey} does not declare a document pack key.`,
        canonicalDocumentKey: definition.canonicalKey,
      }))
    }
    return issues
  })
}

export function getDefaultCrossModuleDocumentTouchpointRows() {
  return DEFAULT_PARITY_ROWS.map((row) => ({ ...row }))
}

export function buildCrossModuleDocumentConsistencyAudit(input = {}) {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const hasTouchpointsInput = Object.prototype.hasOwnProperty.call(input, 'touchpoints')
  const touchpointInput = hasTouchpointsInput
    ? normalizeTouchpointInput(input.touchpoints)
    : buildDefaultTouchpointInput()

  const touchpointReports = Object.entries(touchpointInput)
    .map(([touchpointKey, rows]) => buildTouchpointRows(touchpointKey, rows))
    .sort((left, right) => left.touchpoint.key.localeCompare(right.touchpoint.key))

  const rows = touchpointReports.flatMap((report) => report.rows)
  const parityGroups = buildParityGroups(rows)
  const rowIssues = touchpointReports.flatMap((report) => report.issues)
  const parityIssues = buildParityIssues(parityGroups)
  const definitionIssues = input.includeDefinitionCoverage === false ? [] : buildDefinitionCoverageIssues()
  const issues = [...rowIssues, ...parityIssues, ...definitionIssues]
  const criticalCount = issues.filter((issue) => issue.severity === 'critical').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const status = criticalCount ? 'blocked' : warningCount ? 'attention' : 'healthy'
  const canonicalDocumentKeys = unique(rows.map((row) => row.canonicalDocumentKey))
  const unknownRows = rows.filter((row) => !row.crossModuleDocumentKnown)
  const unsupportedModuleRows = rows.filter((row) => !row.moduleSupported)
  const inconsistentParityGroups = parityGroups.filter((group) => !group.consistent)

  return {
    contractVersion: CROSS_MODULE_DOCUMENT_CONSISTENCY_VERSION,
    crossModuleDocumentMapVersion: CROSS_MODULE_DOCUMENT_KEY_MAP_VERSION,
    generatedAt,
    status,
    summary: {
      status,
      touchpointCount: touchpointReports.length,
      rowCount: rows.length,
      canonicalDocumentCount: canonicalDocumentKeys.length,
      parityGroupCount: parityGroups.length,
      inconsistentParityGroupCount: inconsistentParityGroups.length,
      unknownRowCount: unknownRows.length,
      unsupportedModuleRowCount: unsupportedModuleRows.length,
      issueCount: issues.length,
      criticalCount,
      warningCount,
    },
    touchpoints: touchpointReports.map((report) => ({
      ...report.touchpoint,
      summary: report.summary,
      rows: report.rows,
    })),
    parityGroups,
    issues,
  }
}

export function summarizeCrossModuleDocumentConsistencyAudit(audit = {}) {
  const summary = audit.summary || {}
  const status = summary.status || audit.status || 'unknown'
  const checked = Number(summary.rowCount || 0)
  const touchpoints = Number(summary.touchpointCount || 0)
  const critical = Number(summary.criticalCount || 0)
  const warnings = Number(summary.warningCount || 0)
  if (status === 'healthy') return `${checked} document rows across ${touchpoints} touchpoints are consistent.`
  return `${checked} document rows across ${touchpoints} touchpoints need review: ${critical} critical, ${warnings} warning.`
}

export function buildCrossModuleDocumentConsistencyActionQueues(audit = {}) {
  const issues = getArray(audit.issues)
  const queryWarnings = getArray(audit.queryWarnings)
  const criticalIssues = issues.filter((issue) => issue.severity === 'critical')
  const warningIssues = issues.filter((issue) => issue.severity !== 'critical')

  return {
    canonicalMismatches: criticalIssues.filter((issue) => [
      'canonical_document_mismatch',
      'parity_group_canonical_split',
      'parity_group_expected_key_split',
    ].includes(issue.code)),
    mapCoverage: criticalIssues.filter((issue) => [
      'missing_document_key',
      'unknown_document_key',
      'canonical_definition_without_owner',
    ].includes(issue.code)),
    moduleWarnings: warningIssues.filter((issue) => [
      'document_module_not_declared',
      'canonical_definition_without_modules',
      'canonical_definition_without_pack',
      'document_owner_mismatch',
      'document_pack_mismatch',
    ].includes(issue.code)),
    queryWarnings,
    criticalIssues,
    warningIssues,
  }
}

export function buildCrossModuleDocumentConsistencyGate(audit = {}, options = {}) {
  const summary = audit.summary || {}
  const actionQueues = buildCrossModuleDocumentConsistencyActionQueues(audit)
  const criticalCount = Number(summary.criticalCount || actionQueues.criticalIssues.length || 0)
  const warningCount = Number(summary.warningCount || actionQueues.warningIssues.length || 0)
  const queryWarningCount = Number(summary.queryWarningCount || actionQueues.queryWarnings.length || 0)
  const rowCount = Number(summary.rowCount || 0)
  const failOnCritical = options.failOnCritical !== false
  const failOnWarning = options.failOnWarning === true
  const failOnQueryWarning = options.failOnQueryWarning === true
  const failOnEmpty = options.failOnEmpty === true
  const blockers = []
  const warnings = []

  if (criticalCount > 0) {
    const message = `${criticalCount} critical cross-module document consistency issue${criticalCount === 1 ? '' : 's'} found.`
    if (failOnCritical) blockers.push(message)
    else warnings.push(message)
  }
  if (warningCount > 0) {
    const message = `${warningCount} cross-module document consistency warning${warningCount === 1 ? '' : 's'} found.`
    if (failOnWarning) blockers.push(message)
    else warnings.push(message)
  }
  if (queryWarningCount > 0) {
    const message = `${queryWarningCount} live document consistency quer${queryWarningCount === 1 ? 'y' : 'ies'} returned partial data.`
    if (failOnQueryWarning) blockers.push(message)
    else warnings.push(message)
  }
  if (!rowCount) {
    const message = 'No cross-module document rows were checked.'
    if (failOnEmpty) blockers.push(message)
    else warnings.push(message)
  }

  const status = blockers.length ? 'fail' : warnings.length ? 'warning' : 'pass'
  return {
    contractVersion: CROSS_MODULE_DOCUMENT_CONSISTENCY_GATE_VERSION,
    phase: '6',
    status,
    exitCode: status === 'fail' ? 1 : 0,
    releaseReady: status !== 'fail',
    generatedAt: audit.generatedAt || new Date().toISOString(),
    dryRun: true,
    mutatedData: false,
    source: audit.source || 'static_contract',
    summary: {
      status: audit.status || summary.status || 'unknown',
      rowCount,
      touchpointCount: Number(summary.touchpointCount || 0),
      parityGroupCount: Number(summary.parityGroupCount || 0),
      inconsistentParityGroupCount: Number(summary.inconsistentParityGroupCount || 0),
      criticalCount,
      warningCount,
      queryWarningCount,
      scopedListingCount: Number(summary.scopedListingCount || 0),
      scopedTransactionCount: Number(summary.scopedTransactionCount || 0),
    },
    actionQueues,
    blockers,
    warnings,
    reason: blockers[0] || warnings[0] || 'Cross-module document consistency gate is clean.',
  }
}

function buildCrossModuleDocumentGateScopeArgs(options = {}) {
  const organisationId = normalizeText(options.organisationId)
  const listingIds = getArray(options.listingIds).map(normalizeText).filter(Boolean)
  const transactionIds = getArray(options.transactionIds).map(normalizeText).filter(Boolean)
  if (organisationId) return `--organisation-id=${organisationId}`
  if (listingIds.length) return `--listing-ids=${listingIds.join(',')}`
  if (transactionIds.length) return `--transaction-ids=${transactionIds.join(',')}`
  return '--organisation-id=<uuid>'
}

export function buildCrossModuleDocumentConsistencyGateCommands(options = {}) {
  const scopeArgs = buildCrossModuleDocumentGateScopeArgs(options)
  return [
    `npm run verify:cross-module-documents -- ${scopeArgs}`,
    `npm run verify:cross-module-documents -- ${scopeArgs} --markdown`,
    `npm run prepare:cross-module-documents -- ${scopeArgs} --output-dir=<output-dir>`,
    `npm run test:cross-module-document-live-consistency`,
  ]
}

export function renderCrossModuleDocumentConsistencyGateMarkdown({
  audit = {},
  gate = buildCrossModuleDocumentConsistencyGate(audit),
  options = {},
} = {}) {
  const summary = gate.summary || {}
  const actionQueues = gate.actionQueues || {}
  const commands = buildCrossModuleDocumentConsistencyGateCommands(options)
  const lines = [
    '# Cross-Module Document Consistency Gate',
    '',
    `Generated: ${gate.generatedAt || audit.generatedAt || ''}`,
    `Status: ${gate.status || 'unknown'}`,
    `Release ready: ${gate.releaseReady ? 'yes' : 'no'}`,
    `Reason: ${gate.reason || ''}`,
    `Mutated data: ${gate.mutatedData ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Source: ${gate.source || audit.source || 'static_contract'}`,
    `- Rows checked: ${summary.rowCount || 0}`,
    `- Touchpoints: ${summary.touchpointCount || 0}`,
    `- Parity groups: ${summary.parityGroupCount || 0}`,
    `- Critical issues: ${summary.criticalCount || 0}`,
    `- Warnings: ${summary.warningCount || 0}`,
    `- Query warnings: ${summary.queryWarningCount || 0}`,
    `- Scoped listings: ${summary.scopedListingCount || 0}`,
    `- Scoped transactions: ${summary.scopedTransactionCount || 0}`,
    '',
    '## Blockers',
    '',
  ]

  if (gate.blockers?.length) {
    gate.blockers.forEach((blocker) => lines.push(`- ${blocker}`))
  } else {
    lines.push('No blocking issues.')
  }

  lines.push('', '## Warnings', '')
  if (gate.warnings?.length) {
    gate.warnings.forEach((warning) => lines.push(`- ${warning}`))
  } else {
    lines.push('No warnings.')
  }

  lines.push('', '## Canonical Mismatches', '')
  const mismatchRows = getArray(actionQueues.canonicalMismatches)
  if (!mismatchRows.length) {
    lines.push('No canonical mismatch issues.')
  } else {
    lines.push('| Code | Touchpoint | Document | Expected/Actual |')
    lines.push('| --- | --- | --- | --- |')
    for (const issue of mismatchRows.slice(0, 25)) {
      lines.push(`| ${issue.code || '-'} | ${issue.touchpointKey || '-'} | ${issue.documentKey || issue.parityGroup || '-'} | ${issue.details?.expectedCanonicalDocumentKey || issue.canonicalDocumentKey || '-'} |`)
    }
  }

  lines.push('', '## Operator Commands', '')
  commands.forEach((command) => lines.push(`- \`${command}\``))
  lines.push(
    '',
    '## Guardrails',
    '',
    '- This gate is read-only and does not mutate document rows.',
    '- Fix canonical map gaps, wrong requirement-instance links, or module metadata before treating the workspace as consistent.',
    '- Rerun `npm run verify:cross-module-documents` after every repair batch.',
    '',
    '## Versions',
    '',
    `- Gate: ${gate.contractVersion || CROSS_MODULE_DOCUMENT_CONSISTENCY_GATE_VERSION}`,
    `- Consistency: ${audit.contractVersion || CROSS_MODULE_DOCUMENT_CONSISTENCY_VERSION}`,
    `- Map: ${audit.crossModuleDocumentMapVersion || CROSS_MODULE_DOCUMENT_KEY_MAP_VERSION}`,
    '',
  )

  return lines.join('\n')
}

function getCrossModuleDocumentConsistencyReviewPacketStatus(gate = {}) {
  if (gate.status === 'fail') return 'blocked'
  if (gate.status === 'warning') return 'needs_review'
  return 'ready'
}

function normalizeCrossModuleDocumentConsistencyIssue(issue = {}, recommendedAction = 'review_cross_module_document_consistency') {
  return {
    severity: normalizeText(issue.severity) || 'warning',
    code: normalizeText(issue.code),
    touchpointKey: normalizeText(issue.touchpointKey),
    documentKey: normalizeText(issue.documentKey),
    canonicalDocumentKey: normalizeText(issue.canonicalDocumentKey),
    expectedCanonicalDocumentKey: normalizeText(issue.details?.expectedCanonicalDocumentKey || issue.expectedCanonicalDocumentKey),
    parityGroup: normalizeText(issue.parityGroup),
    message: normalizeText(issue.message),
    recommendedAction,
    details: issue.details || {},
  }
}

function buildCrossModuleDocumentConsistencyChecklist(gate = {}, actionQueues = {}) {
  const canonicalMismatchCount = getArray(actionQueues.canonicalMismatches).length
  const mapCoverageCount = getArray(actionQueues.mapCoverage).length
  const moduleWarningCount = getArray(actionQueues.moduleWarnings).length
  const queryWarningCount = getArray(actionQueues.queryWarnings).length
  return [
    {
      key: 'review_phase_6_gate',
      done: gate.status === 'pass',
      label: 'Review the Phase 6 cross-module document consistency gate.',
      detail: gate.reason || 'No gate reason recorded.',
    },
    {
      key: 'resolve_canonical_mismatches',
      done: canonicalMismatchCount === 0,
      label: 'Resolve canonical mismatch rows before release.',
      detail: `${canonicalMismatchCount} canonical mismatch${canonicalMismatchCount === 1 ? '' : 'es'}.`,
    },
    {
      key: 'close_map_coverage_gaps',
      done: mapCoverageCount === 0,
      label: 'Close document key-map coverage gaps.',
      detail: `${mapCoverageCount} map coverage gap${mapCoverageCount === 1 ? '' : 's'}.`,
    },
    {
      key: 'review_module_metadata_warnings',
      done: moduleWarningCount === 0,
      label: 'Review module, owner, and pack metadata warnings.',
      detail: `${moduleWarningCount} metadata warning${moduleWarningCount === 1 ? '' : 's'}.`,
    },
    {
      key: 'verify_live_query_completeness',
      done: queryWarningCount === 0,
      label: 'Verify live workspace query completeness.',
      detail: `${queryWarningCount} query warning${queryWarningCount === 1 ? '' : 's'}.`,
    },
    {
      key: 'rerun_release_gate',
      done: gate.status === 'pass',
      label: 'Rerun the cross-module document release gate after repair.',
      detail: `Current gate status: ${gate.status || 'unknown'}.`,
    },
  ]
}

function buildCrossModuleDocumentConsistencyReviewQueues(actionQueues = {}) {
  return {
    canonicalMismatches: getArray(actionQueues.canonicalMismatches).map((issue) =>
      normalizeCrossModuleDocumentConsistencyIssue(issue, 'repair_requirement_instance_or_touchpoint_key')),
    mapCoverage: getArray(actionQueues.mapCoverage).map((issue) =>
      normalizeCrossModuleDocumentConsistencyIssue(issue, 'extend_cross_module_document_key_map')),
    moduleWarnings: getArray(actionQueues.moduleWarnings).map((issue) =>
      normalizeCrossModuleDocumentConsistencyIssue(issue, 'align_module_owner_pack_metadata')),
    queryWarnings: getArray(actionQueues.queryWarnings).map((warning) => ({
      table: normalizeText(warning.table),
      code: normalizeText(warning.code),
      message: normalizeText(warning.message),
      recommendedAction: 'verify_live_query_scope_or_schema',
    })),
  }
}

export function buildCrossModuleDocumentConsistencyReviewPacket(audit = {}, options = {}) {
  const generatedAt = options.generatedAt || audit.generatedAt || new Date().toISOString()
  const gate = options.gate || audit.gate || buildCrossModuleDocumentConsistencyGate(audit, options)
  const actionQueues = gate.actionQueues || buildCrossModuleDocumentConsistencyActionQueues(audit)
  const reviewQueues = buildCrossModuleDocumentConsistencyReviewQueues(actionQueues)
  const canonicalMismatchCount = reviewQueues.canonicalMismatches.length
  const mapCoverageCount = reviewQueues.mapCoverage.length
  const moduleWarningCount = reviewQueues.moduleWarnings.length
  const queryWarningCount = reviewQueues.queryWarnings.length

  return {
    version: CROSS_MODULE_DOCUMENT_CONSISTENCY_REVIEW_PACKET_VERSION,
    phase: '7',
    generatedAt,
    source: normalizeText(options.source || audit.source) || 'cross_module_document_consistency_audit',
    status: getCrossModuleDocumentConsistencyReviewPacketStatus(gate),
    dryRun: true,
    mutatedData: false,
    gate,
    summary: {
      ...(audit.summary || {}),
      canonicalMismatchCount,
      mapCoverageCount,
      moduleWarningCount,
      queryWarningCount,
    },
    repairPlan: {
      canonicalMismatchCount,
      mapCoverageCount,
      moduleWarningCount,
      queryWarningCount,
      canonicalMismatches: reviewQueues.canonicalMismatches,
      mapCoverage: reviewQueues.mapCoverage,
      moduleWarnings: reviewQueues.moduleWarnings,
      queryWarnings: reviewQueues.queryWarnings,
    },
    checklist: buildCrossModuleDocumentConsistencyChecklist(gate, actionQueues),
    operatorCommands: buildCrossModuleDocumentConsistencyGateCommands(options),
    artifacts: [
      'cross-module-document-consistency-packet.json',
      'cross-module-document-consistency-audit.json',
      'cross-module-document-consistency-canonical-mismatches.json',
      'cross-module-document-consistency-map-coverage.json',
      'cross-module-document-consistency-module-warnings.json',
      'cross-module-document-consistency-query-warnings.json',
      'cross-module-document-consistency-runbook.md',
    ],
    consistencyReport: audit,
  }
}

export function renderCrossModuleDocumentConsistencyReviewRunbook(packet = {}) {
  const summary = packet.summary || {}
  const gate = packet.gate || {}
  const checklist = Array.isArray(packet.checklist) ? packet.checklist : []
  const commands = Array.isArray(packet.operatorCommands) ? packet.operatorCommands : []
  const repairPlan = packet.repairPlan || {}
  const canonicalMismatches = getArray(repairPlan.canonicalMismatches)
  const mapCoverage = getArray(repairPlan.mapCoverage)
  const moduleWarnings = getArray(repairPlan.moduleWarnings)
  const queryWarnings = getArray(repairPlan.queryWarnings)
  const lines = [
    '# Cross-Module Document Consistency Review Packet',
    '',
    `Generated: ${packet.generatedAt || ''}`,
    `Status: ${packet.status || 'unknown'}`,
    `Gate: ${gate.status || 'unknown'} - ${gate.reason || ''}`,
    `Mutated data: ${packet.mutatedData ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Source: ${packet.source || 'unknown'}`,
    `- Rows checked: ${Number(summary.rowCount || 0)}`,
    `- Touchpoints: ${Number(summary.touchpointCount || 0)}`,
    `- Parity groups: ${Number(summary.parityGroupCount || 0)}`,
    `- Canonical mismatches: ${canonicalMismatches.length}`,
    `- Map coverage gaps: ${mapCoverage.length}`,
    `- Module warnings: ${moduleWarnings.length}`,
    `- Query warnings: ${queryWarnings.length}`,
    '',
    '## Checklist',
    '',
    ...checklist.map((item) => `- [${item.done ? 'x' : ' '}] ${item.label} ${item.detail || ''}`),
    '',
    '## Operator Commands',
    '',
    ...commands.map((command) => `- \`${command}\``),
    '',
    '## Canonical Mismatches',
    '',
  ]

  if (!canonicalMismatches.length) {
    lines.push('No canonical mismatch rows in this packet.', '')
  } else {
    lines.push('| Touchpoint | Document | Parity group | Expected | Actual | Action |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    for (const row of canonicalMismatches.slice(0, 50)) {
      lines.push(`| ${row.touchpointKey || '-'} | ${row.documentKey || '-'} | ${row.parityGroup || '-'} | ${row.expectedCanonicalDocumentKey || '-'} | ${row.canonicalDocumentKey || '-'} | ${row.recommendedAction || '-'} |`)
    }
    lines.push('')
  }

  lines.push('## Map Coverage', '')
  if (!mapCoverage.length) {
    lines.push('No document key-map coverage gaps in this packet.', '')
  } else {
    for (const row of mapCoverage.slice(0, 50)) {
      lines.push(`- ${row.touchpointKey || 'unknown touchpoint'} ${row.documentKey || row.canonicalDocumentKey || 'unknown document'}: ${row.message || 'map coverage required'}`)
    }
    lines.push('')
  }

  lines.push('## Metadata Warnings', '')
  if (!moduleWarnings.length) {
    lines.push('No module metadata warnings in this packet.', '')
  } else {
    for (const row of moduleWarnings.slice(0, 50)) {
      lines.push(`- ${row.touchpointKey || 'unknown touchpoint'} ${row.documentKey || row.canonicalDocumentKey || 'unknown document'}: ${row.message || 'metadata review required'}`)
    }
    lines.push('')
  }

  lines.push('## Query Warnings', '')
  if (!queryWarnings.length) {
    lines.push('No live query warnings in this packet.', '')
  } else {
    for (const row of queryWarnings.slice(0, 50)) {
      lines.push(`- ${row.table || 'unknown table'} ${row.code || 'query_warning'}: ${row.message || 'query returned partial data'}`)
    }
    lines.push('')
  }

  lines.push(
    '## Guardrails',
    '',
    '- This packet is dry-run evidence only and does not mutate document rows, requirement instances, or canonical map definitions.',
    '- Do not use the packet generator to apply repairs.',
    '- Fix source rows in the owning module, then regenerate the packet.',
    '- Rerun `npm run verify:cross-module-documents` after every repair batch.',
    '',
    '## Versions',
    '',
    `- Packet: ${packet.version || CROSS_MODULE_DOCUMENT_CONSISTENCY_REVIEW_PACKET_VERSION}`,
    `- Consistency: ${packet.consistencyReport?.contractVersion || CROSS_MODULE_DOCUMENT_CONSISTENCY_VERSION}`,
    `- Gate: ${gate.contractVersion || CROSS_MODULE_DOCUMENT_CONSISTENCY_GATE_VERSION}`,
    `- Map: ${packet.consistencyReport?.crossModuleDocumentMapVersion || CROSS_MODULE_DOCUMENT_KEY_MAP_VERSION}`,
    '',
  )

  return lines.join('\n')
}

function isMissingTableError(error, tableName = '') {
  if (!error) return false
  const message = String(error.message || error.details || error.hint || '').toLowerCase()
  const code = String(error.code || '').toUpperCase()
  const table = normalizeText(tableName).toLowerCase()
  return code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    (table && message.includes(table) && message.includes('schema cache'))
}

function isMissingColumnError(error, columnName = '') {
  if (!error) return false
  const message = String(error.message || error.details || error.hint || '').toLowerCase()
  const code = String(error.code || '').toUpperCase()
  const column = normalizeText(columnName).toLowerCase()
  return code === '42703' ||
    code === 'PGRST204' ||
    message.includes('column') && (message.includes('does not exist') || message.includes('schema cache')) ||
    Boolean(column && message.includes(column) && message.includes('could not find'))
}

function getArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function getStringArray(value) {
  if (Array.isArray(value)) return value.map(normalizeCrossModuleDocumentKey).filter(Boolean)
  return normalizeCrossModuleDocumentKey(value) ? [normalizeCrossModuleDocumentKey(value)] : []
}

function getInstanceById(instancesById, id = '') {
  return instancesById.get(normalizeText(id)) || null
}

function buildLiveParityGroup(row = {}, expectedCanonicalDocumentKey = '') {
  const instanceId = getCanonicalRequirementInstanceId(row)
  if (instanceId) return `requirement_instance.${instanceId}`
  const entityType = normalizeCrossModuleDocumentKey(row.entityType || row.entity_type || row.sourceTable || row.source_table || row.touchpointKey)
  const entityId = normalizeCrossModuleDocumentKey(row.entityId || row.entity_id || row.private_listing_id || row.transaction_id || 'workspace')
  const canonicalKey = normalizeCrossModuleDocumentKey(expectedCanonicalDocumentKey || row.canonicalDocumentKey || row.documentKey || row.document_key || row.requirementKey || row.requirement_key)
  return [entityType, entityId, canonicalKey].filter(Boolean).join('.')
}

function inferTransactionTouchpoint(row = {}) {
  const visibleSection = normalizeCrossModuleDocumentKey(row.visibleSection || row.visible_section)
  const requestedFromRole = normalizeCrossModuleDocumentKey(row.requestedFromRole || row.requested_from_role || row.requested_from)
  const responsibleRole = normalizeCrossModuleDocumentKey(row.responsibleRole || row.responsible_role)
  const uploadedByParty = normalizeCrossModuleDocumentKey(row.uploadedByParty || row.uploaded_by_party || row.uploaded_by_role)
  const relatedEntityType = normalizeCrossModuleDocumentKey(row.relatedEntityType || row.related_entity_type)
  const financeLane = normalizeCrossModuleDocumentKey(row.financeLane || row.finance_lane)
  const roleSignal = [visibleSection, requestedFromRole, responsibleRole, uploadedByParty, relatedEntityType, financeLane].join(' ')

  if (roleSignal.includes('cancellation')) return 'bond_cancellation'
  if (roleSignal.includes('bond_originator')) return 'bond_originator'
  if (roleSignal.includes('bond_attorney') || visibleSection.includes('bond_registration')) return 'bond_attorney'
  if (roleSignal.includes('transfer_attorney') || roleSignal.includes('transferring_attorney') || visibleSection.includes('transfer')) return 'attorney_transfer'
  if (visibleSection.includes('seller')) return 'seller_portal'
  if (visibleSection.includes('buyer') || roleSignal.includes('buyer')) return 'buyer_agency'
  return 'transaction_documents'
}

function inferPrivateListingTouchpoints(row = {}) {
  const visibility = normalizeCrossModuleDocumentKey(row.documentVisibility || row.document_visibility || row.visibility)
  const touchpoints = ['listing_documents']
  if (visibility.includes('seller') || visibility.includes('shared')) touchpoints.push('seller_portal')
  return touchpoints
}

function getExpectedCanonicalDocumentKey(row = {}, instancesById = new Map()) {
  const instance = getInstanceById(instancesById, getCanonicalRequirementInstanceId(row))
  return normalizeCrossModuleDocumentKey(
    row.expectedCanonicalDocumentKey ||
      row.expected_canonical_document_key ||
      row.documentDefinitionKey ||
      row.document_definition_key ||
      instance?.document_definition_key,
  )
}

function getInstanceContext(row = {}) {
  const contextType = normalizeCrossModuleDocumentKey(row.context_type || row.contextType)
  const requestedFromRole = normalizeCrossModuleDocumentKey(row.requested_from_role || row.requestedFromRole)
  const visibleRoles = getStringArray(row.visible_to_roles || row.visibleToRoles)
  const uploadableRoles = getStringArray(row.uploadable_by_roles || row.uploadableByRoles)
  const roles = unique([requestedFromRole, ...visibleRoles, ...uploadableRoles])
  return {
    contextType,
    roles,
    visibleRoles,
    uploadableRoles,
  }
}

function inferInstanceTouchpoints(row = {}) {
  const { contextType, roles } = getInstanceContext(row)
  if (contextType === 'private_listing') {
    const touchpoints = ['listing_documents']
    if (roles.some((role) => role.includes('seller'))) touchpoints.push('seller_portal')
    return touchpoints
  }
  if (roles.some((role) => role.includes('cancellation'))) return ['bond_cancellation']
  if (roles.some((role) => role.includes('bond_originator'))) return ['bond_originator']
  if (roles.some((role) => role.includes('bond_attorney'))) return ['bond_attorney']
  if (roles.some((role) => role.includes('transfer') || role.includes('attorney'))) return ['attorney_transfer']
  if (roles.some((role) => role.includes('buyer'))) return ['buyer_agency']
  if (roles.some((role) => role.includes('seller'))) return ['seller_portal']
  return contextType === 'transaction' ? ['transaction_documents'] : ['listing_documents']
}

function buildLiveRow({
  row = {},
  touchpointKey,
  documentKey,
  entityType,
  entityId,
  sourceTable,
  sourceId,
  expectedCanonicalDocumentKey = '',
  context = {},
} = {}) {
  return {
    ...row,
    ...context,
    touchpointKey,
    documentKey,
    entityType,
    entityId,
    sourceTable,
    sourceId: sourceId || row.id || '',
    expectedCanonicalDocumentKey,
    parityGroup: buildLiveParityGroup({ ...row, touchpointKey, entityType, entityId, sourceTable, documentKey }, expectedCanonicalDocumentKey),
  }
}

export function buildCrossModuleDocumentLiveTouchpointRows({
  privateListingRequirements = [],
  privateListingDocuments = [],
  transactionDocumentRequirements = [],
  uploadedDocuments = [],
  documentRequirementInstances = [],
} = {}) {
  const instancesById = new Map(getArray(documentRequirementInstances).map((row) => [normalizeText(row.id), row]))
  const privateRequirementById = new Map(getArray(privateListingRequirements).map((row) => [normalizeText(row.id), row]))
  const rows = []

  for (const requirement of getArray(privateListingRequirements)) {
    const expectedCanonicalDocumentKey = getExpectedCanonicalDocumentKey(requirement, instancesById)
    for (const touchpointKey of inferPrivateListingTouchpoints(requirement)) {
      rows.push(buildLiveRow({
        row: requirement,
        touchpointKey,
        documentKey: requirement.requirement_key,
        entityType: 'private_listing',
        entityId: requirement.private_listing_id,
        sourceTable: 'private_listing_document_requirements',
        expectedCanonicalDocumentKey,
        context: {
          groupKey: requirement.requirement_group,
          requestedFromRole: 'seller',
          ownerRole: 'seller',
        },
      }))
    }
  }

  for (const document of getArray(privateListingDocuments)) {
    const linkedRequirement = privateRequirementById.get(normalizeText(document.requirement_id)) || {}
    const expectedCanonicalDocumentKey = getExpectedCanonicalDocumentKey(document, instancesById) || getExpectedCanonicalDocumentKey(linkedRequirement, instancesById)
    for (const touchpointKey of inferPrivateListingTouchpoints(document)) {
      rows.push(buildLiveRow({
        row: document,
        touchpointKey,
        documentKey: document.document_key || document.document_type || linkedRequirement.requirement_key || document.document_name,
        entityType: 'private_listing',
        entityId: document.private_listing_id,
        sourceTable: 'private_listing_documents',
        expectedCanonicalDocumentKey,
        context: {
          groupKey: linkedRequirement.requirement_group,
          requestedFromRole: 'seller',
          ownerRole: 'seller',
        },
      }))
    }
  }

  for (const requirement of getArray(transactionDocumentRequirements)) {
    const expectedCanonicalDocumentKey = getExpectedCanonicalDocumentKey(requirement, instancesById)
    rows.push(buildLiveRow({
      row: requirement,
      touchpointKey: inferTransactionTouchpoint(requirement),
      documentKey: requirement.document_key,
      entityType: 'transaction',
      entityId: requirement.transaction_id,
      sourceTable: 'transaction_document_requirements',
      expectedCanonicalDocumentKey,
      context: {
        groupKey: requirement.debug_group_key || requirement.group_key,
        packKey: requirement.group_key,
        requestedFromRole: requirement.requested_from || requirement.responsible_role,
        visibleSection: requirement.visible_section,
      },
    }))
  }

  for (const document of getArray(uploadedDocuments)) {
    const expectedCanonicalDocumentKey = getExpectedCanonicalDocumentKey(document, instancesById)
    const entityType = document.transaction_id ? 'transaction' : document.private_listing_id ? 'private_listing' : normalizeCrossModuleDocumentKey(document.related_entity_type || 'document')
    const entityId = document.transaction_id || document.private_listing_id || document.related_entity_id || ''
    const touchpointKey = entityType === 'private_listing'
      ? inferPrivateListingTouchpoints(document)[0]
      : inferTransactionTouchpoint(document)
    rows.push(buildLiveRow({
      row: document,
      touchpointKey,
      documentKey: document.document_key || document.document_type || document.category || document.name,
      entityType,
      entityId,
      sourceTable: 'documents',
      expectedCanonicalDocumentKey,
      context: {
        requestedFromRole: document.uploaded_by_party || document.uploaded_by_role,
        visibleSection: document.stage_key || document.visibility_scope,
        portalWorkspaceCategory: document.portal_workspace_category,
      },
    }))
  }

  for (const instance of getArray(documentRequirementInstances)) {
    const expectedCanonicalDocumentKey = normalizeCrossModuleDocumentKey(instance.document_definition_key)
    for (const touchpointKey of inferInstanceTouchpoints(instance)) {
      rows.push(buildLiveRow({
        row: {
          ...instance,
          canonicalRequirementInstanceId: instance.id,
        },
        touchpointKey,
        documentKey: instance.document_definition_key,
        entityType: instance.context_type || (instance.transaction_id ? 'transaction' : 'private_listing'),
        entityId: instance.context_id || instance.transaction_id || instance.listing_id,
        sourceTable: 'document_requirement_instances',
        expectedCanonicalDocumentKey,
        context: {
          packKey: instance.pack_key,
          requestedFromRole: instance.requested_from_role,
          ownerRole: instance.requested_from_role,
        },
      }))
    }
  }

  return {
    rows,
    touchpoints: normalizeTouchpointInput(rows),
    sourceCounts: {
      privateListingRequirements: getArray(privateListingRequirements).length,
      privateListingDocuments: getArray(privateListingDocuments).length,
      transactionDocumentRequirements: getArray(transactionDocumentRequirements).length,
      uploadedDocuments: getArray(uploadedDocuments).length,
      documentRequirementInstances: getArray(documentRequirementInstances).length,
      touchpointRows: rows.length,
    },
  }
}

function buildQueryWarning(table, error) {
  return {
    table,
    code: normalizeText(error?.code) || 'query_failed',
    message: normalizeText(error?.message || error?.details || error?.hint) || `Unable to query ${table}.`,
  }
}

async function safeSelectRows(client, {
  table,
  filters = [],
  limit = 100,
  queryWarnings = [],
} = {}) {
  let query = client.from(table).select('*')
  for (const filter of filters) {
    const column = normalizeText(filter.column)
    if (!column) continue
    if (Array.isArray(filter.values)) {
      const values = unique(filter.values.map(normalizeText))
      if (!values.length) return []
      query = query.in(column, values)
    } else if (normalizeText(filter.value)) {
      query = query.eq(column, normalizeText(filter.value))
    }
  }
  query = query.limit(Math.max(1, Math.min(normalizeNumber(limit, 100), 500)))

  const result = await query
  if (!result?.error) return result?.data || []
  if (isMissingTableError(result.error, table) || isMissingColumnError(result.error)) {
    queryWarnings.push(buildQueryWarning(table, result.error))
    return []
  }
  throw result.error
}

async function fetchScopedIds(client, {
  table,
  organisationId = '',
  explicitIds = [],
  limit = 100,
  queryWarnings = [],
} = {}) {
  const ids = unique(getArray(explicitIds).map(normalizeText))
  if (ids.length) return ids.slice(0, limit)
  if (!normalizeText(organisationId)) return []
  const rows = await safeSelectRows(client, {
    table,
    filters: [{ column: 'organisation_id', value: organisationId }],
    limit,
    queryWarnings,
  })
  return unique(rows.map((row) => normalizeText(row.id))).slice(0, limit)
}

async function fetchDocumentRequirementInstances(client, {
  instanceIds = [],
  listingIds = [],
  transactionIds = [],
  limit = 100,
  queryWarnings = [],
} = {}) {
  const byId = new Map()
  const addRows = (rows = []) => rows.forEach((row) => {
    if (row?.id) byId.set(normalizeText(row.id), row)
  })

  const normalizedInstanceIds = unique(getArray(instanceIds).map(normalizeText))
  if (normalizedInstanceIds.length) {
    addRows(await safeSelectRows(client, {
      table: 'document_requirement_instances',
      filters: [{ column: 'id', values: normalizedInstanceIds }],
      limit,
      queryWarnings,
    }))
  }

  const normalizedListingIds = unique(getArray(listingIds).map(normalizeText))
  if (normalizedListingIds.length) {
    addRows(await safeSelectRows(client, {
      table: 'document_requirement_instances',
      filters: [{ column: 'listing_id', values: normalizedListingIds }],
      limit,
      queryWarnings,
    }))
  }

  const normalizedTransactionIds = unique(getArray(transactionIds).map(normalizeText))
  if (normalizedTransactionIds.length) {
    addRows(await safeSelectRows(client, {
      table: 'document_requirement_instances',
      filters: [{ column: 'transaction_id', values: normalizedTransactionIds }],
      limit,
      queryWarnings,
    }))
  }

  return [...byId.values()]
}

function collectInstanceIds(...rowGroups) {
  return unique(rowGroups.flatMap((rows) => getArray(rows).map(getCanonicalRequirementInstanceId))).filter(Boolean)
}

export async function fetchCrossModuleDocumentConsistencySnapshot({
  client,
  organisationId = '',
  listingIds = [],
  transactionIds = [],
  limit = 100,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!client) throw new Error('Supabase client is required for live document consistency diagnostics.')
  const maxRows = Math.max(1, Math.min(normalizeNumber(limit, 100), 500))
  const normalizedOrganisationId = normalizeText(organisationId)
  const explicitListingIds = unique(getArray(listingIds).map(normalizeText))
  const explicitTransactionIds = unique(getArray(transactionIds).map(normalizeText))
  if (!normalizedOrganisationId && !explicitListingIds.length && !explicitTransactionIds.length) {
    throw new Error('Provide organisationId, listingIds, or transactionIds before running live document consistency diagnostics.')
  }

  const queryWarnings = []
  const scopedListingIds = await fetchScopedIds(client, {
    table: 'private_listings',
    organisationId: normalizedOrganisationId,
    explicitIds: explicitListingIds,
    limit: maxRows,
    queryWarnings,
  })
  const scopedTransactionIds = await fetchScopedIds(client, {
    table: 'transactions',
    organisationId: normalizedOrganisationId,
    explicitIds: explicitTransactionIds,
    limit: maxRows,
    queryWarnings,
  })

  const privateListingRequirements = scopedListingIds.length
    ? await safeSelectRows(client, {
      table: 'private_listing_document_requirements',
      filters: [{ column: 'private_listing_id', values: scopedListingIds }],
      limit: maxRows,
      queryWarnings,
    })
    : []
  const privateListingDocuments = scopedListingIds.length
    ? await safeSelectRows(client, {
      table: 'private_listing_documents',
      filters: [{ column: 'private_listing_id', values: scopedListingIds }],
      limit: maxRows,
      queryWarnings,
    })
    : []
  const transactionDocumentRequirements = scopedTransactionIds.length
    ? await safeSelectRows(client, {
      table: 'transaction_document_requirements',
      filters: [{ column: 'transaction_id', values: scopedTransactionIds }],
      limit: maxRows,
      queryWarnings,
    })
    : []
  const transactionDocuments = scopedTransactionIds.length
    ? await safeSelectRows(client, {
      table: 'documents',
      filters: [{ column: 'transaction_id', values: scopedTransactionIds }],
      limit: maxRows,
      queryWarnings,
    })
    : []
  const listingDocuments = scopedListingIds.length
    ? await safeSelectRows(client, {
      table: 'documents',
      filters: [{ column: 'private_listing_id', values: scopedListingIds }],
      limit: maxRows,
      queryWarnings,
    })
    : []
  const uploadedDocuments = [...transactionDocuments, ...listingDocuments]
  const instanceIds = collectInstanceIds(privateListingRequirements, privateListingDocuments, transactionDocumentRequirements, uploadedDocuments)
  const documentRequirementInstances = await fetchDocumentRequirementInstances(client, {
    instanceIds,
    listingIds: scopedListingIds,
    transactionIds: scopedTransactionIds,
    limit: maxRows,
    queryWarnings,
  })
  const liveRows = buildCrossModuleDocumentLiveTouchpointRows({
    privateListingRequirements,
    privateListingDocuments,
    transactionDocumentRequirements,
    uploadedDocuments,
    documentRequirementInstances,
  })
  const audit = buildCrossModuleDocumentConsistencyAudit({
    generatedAt,
    touchpoints: liveRows.touchpoints,
  })

  return {
    ...audit,
    source: 'live_workspace',
    organisationId: normalizedOrganisationId,
    scopedListingIds,
    scopedTransactionIds,
    sourceCounts: liveRows.sourceCounts,
    queryWarnings,
    summary: {
      ...audit.summary,
      source: 'live_workspace',
      queryWarningCount: queryWarnings.length,
      scopedListingCount: scopedListingIds.length,
      scopedTransactionCount: scopedTransactionIds.length,
    },
  }
}
