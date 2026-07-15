import { BOND_ATTORNEY_PHASE0_DATA_CONTRACT } from './bondAttorneyModulePhase0.js'

export const BOND_ATTORNEY_PHASE2_VERSION = 'bond_attorney_module_phase2_data_contract_v1'

export const BOND_ATTORNEY_PHASE2_FACT_STATUSES = Object.freeze({
  missing: 'missing',
  unverified: 'unverified',
  verified: 'verified',
  stale: 'stale',
  conflict: 'conflict',
})

const FACT_GROUPS = Object.freeze({
  bank: 'bank',
  parties: 'parties',
  property: 'property',
  conditions: 'conditions',
  guarantees: 'guarantees',
  signing: 'signing',
  lodgement: 'lodgement',
  registration: 'registration',
})

const metadataKeys = new Set([
  'value',
  'rawValue',
  'raw_value',
  'sourceId',
  'source_id',
  'capturedAt',
  'captured_at',
  'verifiedAt',
  'verified_at',
  'verifiedBy',
  'verified_by',
  'verifiedByRole',
  'verified_by_role',
  'expiresAt',
  'expires_at',
])

const factDefinition = (definition) => Object.freeze({
  verificationRequired: true,
  invalidatesDrafts: true,
  ...definition,
  sourcePaths: Object.freeze(definition.sourcePaths || []),
})

export const BOND_ATTORNEY_PHASE2_FACT_DEFINITIONS = Object.freeze([
  factDefinition({
    key: 'bank_name',
    label: 'Bank name',
    group: FACT_GROUPS.bank,
    sourcePaths: [
      'evidence.bank_name',
      'lane.bond.bank_name',
      'lane.bond.bankName',
      'lane.bank_name',
      'lane.bankName',
      'transaction.bond.bank_name',
      'transaction.bond.bankName',
      'transaction.bond_bank',
      'transaction.bank_name',
      'transaction.bankName',
      'transaction.finance_bank',
    ],
  }),
  factDefinition({
    key: 'bank_reference',
    label: 'Bank reference',
    group: FACT_GROUPS.bank,
    sourcePaths: [
      'evidence.bank_reference',
      'lane.bond.bank_reference',
      'lane.bond.bankReference',
      'lane.bank_reference',
      'lane.bankReference',
      'transaction.bond.bank_reference',
      'transaction.bond.bankReference',
      'transaction.bond_reference',
      'transaction.bank_reference',
      'transaction.loan_account_number',
      'transaction.bond_account_number',
    ],
  }),
  factDefinition({
    key: 'approved_bond_amount',
    label: 'Approved bond amount',
    group: FACT_GROUPS.bank,
    sourcePaths: [
      'evidence.approved_bond_amount',
      'lane.bond.approved_bond_amount',
      'lane.bond.approvedBondAmount',
      'transaction.bond.approved_bond_amount',
      'transaction.bond.amount',
      'transaction.approved_bond_amount',
      'transaction.bond_approval_amount',
      'transaction.loan_amount',
    ],
  }),
  factDefinition({
    key: 'mortgagor_identity_and_capacity',
    label: 'Mortgagor identity and capacity',
    group: FACT_GROUPS.parties,
    sourcePaths: [
      'evidence.mortgagor_identity_and_capacity',
      'lane.parties.mortgagor',
      'transaction.mortgagor',
      'transaction.buyer',
      'transaction.buyer_details',
      'transaction.buyerDetails',
      'transaction.purchaser',
    ],
  }),
  factDefinition({
    key: 'mortgagee_identity',
    label: 'Mortgagee identity',
    group: FACT_GROUPS.parties,
    sourcePaths: [
      'evidence.mortgagee_identity',
      'lane.parties.mortgagee',
      'transaction.mortgagee',
      'transaction.bond.mortgagee',
      'transaction.lender',
      'transaction.bank',
    ],
  }),
  factDefinition({
    key: 'property_legal_description',
    label: 'Property legal description',
    group: FACT_GROUPS.property,
    sourcePaths: [
      'evidence.property_legal_description',
      'lane.property.legal_description',
      'lane.property.legalDescription',
      'transaction.property_legal_description',
      'transaction.propertyLegalDescription',
      'transaction.erf_number',
      'transaction.erfNumber',
      'transaction.unit.legal_description',
      'transaction.unit.legalDescription',
      'transaction.property.description',
    ],
  }),
  factDefinition({
    key: 'title_deed_or_deeds_office_reference',
    label: 'Title deed or Deeds Office reference',
    group: FACT_GROUPS.property,
    sourcePaths: [
      'evidence.title_deed_or_deeds_office_reference',
      'lane.property.title_deed_reference',
      'lane.property.deeds_office_reference',
      'transaction.title_deed_reference',
      'transaction.titleDeedReference',
      'transaction.deeds_office_reference',
      'transaction.deedsOfficeReference',
      'transaction.unit.title_deed_reference',
    ],
  }),
  factDefinition({
    key: 'buyer_marital_or_entity_authority',
    label: 'Buyer marital or entity authority',
    group: FACT_GROUPS.parties,
    sourcePaths: [
      'evidence.buyer_marital_or_entity_authority',
      'lane.parties.buyer_authority',
      'lane.parties.buyerAuthority',
      'transaction.buyer_marital_status',
      'transaction.buyerMaritalStatus',
      'transaction.buyer_entity_authority',
      'transaction.buyerEntityAuthority',
      'transaction.buyer.authority',
      'transaction.buyer.marital_status',
    ],
  }),
  factDefinition({
    key: 'bank_conditions',
    label: 'Bank conditions',
    group: FACT_GROUPS.conditions,
    sourcePaths: [
      'evidence.bank_conditions',
      'lane.bond.bank_conditions',
      'lane.bond.bankConditions',
      'lane.bank_conditions',
      'transaction.bank_conditions',
      'transaction.bankConditions',
      'transaction.bond.conditions',
    ],
  }),
  factDefinition({
    key: 'guarantee_values_and_expiry',
    label: 'Guarantee values and expiry',
    group: FACT_GROUPS.guarantees,
    sourcePaths: [
      'evidence.guarantee_values_and_expiry',
      'lane.bond.guarantees',
      'lane.guarantees',
      'transaction.guarantees',
      'transaction.guarantee_values',
      'transaction.guaranteeValues',
      'transaction.guarantee_expiry',
      'transaction.guaranteeExpiry',
    ],
  }),
  factDefinition({
    key: 'signing_method_and_signed_pack_status',
    label: 'Signing method and signed pack status',
    group: FACT_GROUPS.signing,
    sourcePaths: [
      'evidence.signing_method_and_signed_pack_status',
      'lane.signing',
      'lane.bond.signing',
      'transaction.bond_signing',
      'transaction.bondSigning',
      'transaction.signing_method',
      'transaction.signed_bond_pack_status',
    ],
  }),
  factDefinition({
    key: 'bank_submission_reference',
    label: 'Bank submission reference',
    group: FACT_GROUPS.lodgement,
    sourcePaths: [
      'evidence.bank_submission_reference',
      'lane.bond.bank_submission_reference',
      'lane.bond.bankSubmissionReference',
      'transaction.bank_submission_reference',
      'transaction.bankSubmissionReference',
      'transaction.bond.bank_submission_reference',
    ],
  }),
  factDefinition({
    key: 'approval_to_lodge_reference',
    label: 'Approval to lodge reference',
    group: FACT_GROUPS.lodgement,
    sourcePaths: [
      'evidence.approval_to_lodge_reference',
      'lane.bond.approval_to_lodge_reference',
      'lane.bond.approvalToLodgeReference',
      'transaction.approval_to_lodge_reference',
      'transaction.approvalToLodgeReference',
      'transaction.bank_approval_to_lodge_reference',
    ],
  }),
  factDefinition({
    key: 'lodgement_reference',
    label: 'Lodgement reference',
    group: FACT_GROUPS.lodgement,
    sourcePaths: [
      'evidence.lodgement_reference',
      'lane.bond.lodgement_reference',
      'lane.bond.lodgementReference',
      'transaction.lodgement_reference',
      'transaction.lodgementReference',
      'transaction.bond_lodgement_reference',
    ],
  }),
  factDefinition({
    key: 'registration_date',
    label: 'Registration date',
    group: FACT_GROUPS.registration,
    sourcePaths: [
      'evidence.registration_date',
      'lane.bond.registration_date',
      'lane.bond.registrationDate',
      'transaction.registration_date',
      'transaction.registrationDate',
      'transaction.bond_registration_date',
    ],
  }),
])

function text(value = '') {
  return String(value ?? '').trim()
}

function hasUsableValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return true
  if (value && typeof value === 'object') return Object.keys(value).some((key) => !metadataKeys.has(key)) || hasUsableValue(value.value ?? value.rawValue ?? value.raw_value)
  return value !== null && value !== undefined && text(value) !== ''
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key])
      return result
    }, {})
  }
  return value
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(stable(value))
  let result = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return `fnv1a_${(result >>> 0).toString(16).padStart(8, '0')}`
}

function readPath(source, path) {
  const parts = text(path).split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function unwrapValue(record) {
  if (record && typeof record === 'object' && !Array.isArray(record)) {
    if ('value' in record) return record.value
    if ('rawValue' in record) return record.rawValue
    if ('raw_value' in record) return record.raw_value
  }
  return record
}

function metadataFromRecord(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {}
  return {
    sourceId: text(record.sourceId || record.source_id) || null,
    capturedAt: record.capturedAt || record.captured_at || null,
    verifiedAt: record.verifiedAt || record.verified_at || null,
    verifiedBy: record.verifiedBy || record.verified_by || null,
    verifiedByRole: record.verifiedByRole || record.verified_by_role || record.verifiedBy?.role || record.verified_by?.role || null,
    expiresAt: record.expiresAt || record.expires_at || null,
  }
}

function normalizeSource(root, sourcePath) {
  const record = readPath(root, sourcePath)
  const value = unwrapValue(record)
  if (!hasUsableValue(value)) return null
  const meta = metadataFromRecord(record)
  const [rootKey] = text(sourcePath).split('.')
  return Object.freeze({
    value,
    sourcePath,
    sourceType: rootKey || 'unknown',
    sourceId: meta.sourceId,
    capturedAt: meta.capturedAt,
    verifiedAt: meta.verifiedAt,
    verifiedBy: meta.verifiedBy,
    verifiedByRole: meta.verifiedByRole,
    expiresAt: meta.expiresAt,
    valueHash: hash(value),
  })
}

function findCandidateSources(root, sourcePaths = []) {
  return sourcePaths.map((path) => normalizeSource(root, path)).filter(Boolean)
}

function sourceVerified(source = {}) {
  return validDate(source.verifiedAt) && Boolean(source.verifiedBy || source.verifiedByRole)
}

function sourceExpired(source = {}, resolvedAt = '') {
  if (!source.expiresAt) return false
  if (!validDate(source.expiresAt) || !validDate(resolvedAt)) return true
  return new Date(source.expiresAt) <= new Date(resolvedAt)
}

function resolveStatus({ definition, primarySource, conflicts, resolvedAt }) {
  if (!primarySource) return BOND_ATTORNEY_PHASE2_FACT_STATUSES.missing
  if (conflicts.length) return BOND_ATTORNEY_PHASE2_FACT_STATUSES.conflict
  if (sourceExpired(primarySource, resolvedAt)) return BOND_ATTORNEY_PHASE2_FACT_STATUSES.stale
  if (definition.verificationRequired && !sourceVerified(primarySource)) return BOND_ATTORNEY_PHASE2_FACT_STATUSES.unverified
  return BOND_ATTORNEY_PHASE2_FACT_STATUSES.verified
}

function resolveFact(definition, root, resolvedAt) {
  const sources = findCandidateSources(root, definition.sourcePaths)
  const primarySource = sources[0] || null
  const primaryHash = primarySource?.valueHash || ''
  const conflicts = primarySource
    ? sources
        .slice(1)
        .filter((source) => source.valueHash !== primaryHash)
        .map((source) => Object.freeze({
          sourcePath: source.sourcePath,
          sourceId: source.sourceId,
          valueHash: source.valueHash,
        }))
    : []
  const status = resolveStatus({ definition, primarySource, conflicts, resolvedAt })
  const fingerprint = hash({
    key: definition.key,
    valueHash: primarySource?.valueHash || null,
    sourcePath: primarySource?.sourcePath || null,
    sourceId: primarySource?.sourceId || null,
    verifiedAt: primarySource?.verifiedAt || null,
    expiresAt: primarySource?.expiresAt || null,
    status,
  })

  return Object.freeze({
    key: definition.key,
    label: definition.label,
    group: definition.group,
    required: definition.required !== false,
    verificationRequired: definition.verificationRequired === true,
    invalidatesDrafts: definition.invalidatesDrafts !== false,
    status,
    value: primarySource?.value ?? null,
    source: primarySource
      ? Object.freeze({
          sourcePath: primarySource.sourcePath,
          sourceType: primarySource.sourceType,
          sourceId: primarySource.sourceId,
          capturedAt: primarySource.capturedAt,
          verifiedAt: primarySource.verifiedAt,
          verifiedBy: primarySource.verifiedBy,
          verifiedByRole: primarySource.verifiedByRole,
          expiresAt: primarySource.expiresAt,
        })
      : null,
    conflicts: Object.freeze(conflicts),
    fingerprint,
  })
}

function factsByKey(facts = []) {
  return facts.reduce((result, fact) => {
    result[fact.key] = fact
    return result
  }, {})
}

export function buildBondAttorneyFactFingerprints(facts = []) {
  return Object.freeze((Array.isArray(facts) ? facts : []).reduce((result, fact) => {
    if (fact?.key && fact.invalidatesDrafts !== false) result[fact.key] = fact.fingerprint
    return result
  }, {}))
}

export function buildBondAttorneyDataFingerprint(facts = []) {
  return hash(buildBondAttorneyFactFingerprints(facts))
}

export function resolveBondAttorneyCanonicalData({
  transaction = {},
  lane = {},
  evidence = {},
  resolvedAt = new Date().toISOString(),
} = {}) {
  const root = { transaction, lane, evidence }
  const facts = BOND_ATTORNEY_PHASE2_FACT_DEFINITIONS.map((definition) => resolveFact(definition, root, resolvedAt))
  const factMap = factsByKey(facts)
  const missingFactKeys = facts.filter((fact) => fact.status === BOND_ATTORNEY_PHASE2_FACT_STATUSES.missing).map((fact) => fact.key)
  const unverifiedFactKeys = facts.filter((fact) => fact.status === BOND_ATTORNEY_PHASE2_FACT_STATUSES.unverified).map((fact) => fact.key)
  const staleFactKeys = facts.filter((fact) => fact.status === BOND_ATTORNEY_PHASE2_FACT_STATUSES.stale).map((fact) => fact.key)
  const conflictFactKeys = facts.filter((fact) => fact.status === BOND_ATTORNEY_PHASE2_FACT_STATUSES.conflict).map((fact) => fact.key)
  const factFingerprints = buildBondAttorneyFactFingerprints(facts)
  const dataFingerprint = buildBondAttorneyDataFingerprint(facts)

  return Object.freeze({
    version: BOND_ATTORNEY_PHASE2_VERSION,
    resolvedAt,
    facts: Object.freeze(facts),
    factsByKey: Object.freeze(factMap),
    missingFactKeys: Object.freeze(missingFactKeys),
    unverifiedFactKeys: Object.freeze(unverifiedFactKeys),
    staleFactKeys: Object.freeze(staleFactKeys),
    conflictFactKeys: Object.freeze(conflictFactKeys),
    factFingerprints,
    dataFingerprint,
    readyForDrafting: missingFactKeys.length === 0 && unverifiedFactKeys.length === 0 && staleFactKeys.length === 0 && conflictFactKeys.length === 0,
  })
}

export function evaluateBondAttorneyDraftInvalidation({ draft = {}, canonicalData = null } = {}) {
  const data = canonicalData || resolveBondAttorneyCanonicalData({})
  const currentFingerprints = data.factFingerprints || buildBondAttorneyFactFingerprints(data.facts || [])
  const previousFingerprints = draft.factFingerprints || draft.sourceFactFingerprints || {}
  const previousDataFingerprint = draft.dataFingerprint || draft.sourceFactsFingerprint || draft.factFingerprint || ''
  const currentDataFingerprint = data.dataFingerprint || buildBondAttorneyDataFingerprint(data.facts || [])
  const trackedKeys = [...new Set([...Object.keys(previousFingerprints), ...Object.keys(currentFingerprints)])]
  const changedFactKeys = trackedKeys.filter((key) => previousFingerprints[key] !== currentFingerprints[key])
  const hasBinding = Boolean(previousDataFingerprint || Object.keys(previousFingerprints).length)
  const invalidated = !hasBinding || previousDataFingerprint !== currentDataFingerprint || changedFactKeys.length > 0

  return Object.freeze({
    invalidated,
    reason: !hasBinding
      ? 'draft_not_bound_to_canonical_bond_data'
      : invalidated
        ? 'canonical_bond_data_changed'
        : 'canonical_bond_data_unchanged',
    changedFactKeys: Object.freeze(changedFactKeys),
    previousDataFingerprint: previousDataFingerprint || null,
    currentDataFingerprint,
  })
}

export function buildBondAttorneyPhase2BaselineReport(input = {}) {
  const canonicalData = resolveBondAttorneyCanonicalData(input)
  const definitionKeys = BOND_ATTORNEY_PHASE2_FACT_DEFINITIONS.map((definition) => definition.key)
  const missingDefinitionKeys = BOND_ATTORNEY_PHASE0_DATA_CONTRACT.filter((key) => !definitionKeys.includes(key))

  return Object.freeze({
    version: BOND_ATTORNEY_PHASE2_VERSION,
    factDefinitionCount: BOND_ATTORNEY_PHASE2_FACT_DEFINITIONS.length,
    phase0DataContractCount: BOND_ATTORNEY_PHASE0_DATA_CONTRACT.length,
    missingDefinitionKeys: Object.freeze(missingDefinitionKeys),
    missingFactKeys: canonicalData.missingFactKeys,
    unverifiedFactKeys: canonicalData.unverifiedFactKeys,
    staleFactKeys: canonicalData.staleFactKeys,
    conflictFactKeys: canonicalData.conflictFactKeys,
    dataFingerprint: canonicalData.dataFingerprint,
    readyForDrafting: canonicalData.readyForDrafting,
    readyForPhase3: missingDefinitionKeys.length === 0 && canonicalData.facts.every((fact) => fact.fingerprint && fact.source !== undefined),
  })
}
