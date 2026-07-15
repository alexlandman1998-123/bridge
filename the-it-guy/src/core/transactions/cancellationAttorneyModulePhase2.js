import { CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT } from './cancellationAttorneyModulePhase0.js'

export const CANCELLATION_ATTORNEY_PHASE2_VERSION = 'cancellation_attorney_module_phase2_data_contract_v1'
export const CANCELLATION_ATTORNEY_PHASE2_RELEASE_BLOCKER_ID = 'cancellation_data_contract_missing'

export const CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES = Object.freeze({
  missing: 'missing',
  unverified: 'unverified',
  verified: 'verified',
  stale: 'stale',
  conflict: 'conflict',
})

export const CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY = Object.freeze({
  canonicalDataOnly: true,
  persistsCanonicalFacts: false,
  extractsFactsAutomatically: false,
  generatesOperationalDocuments: false,
  generatesLegalInstruments: false,
  requestsExternalFiguresAutomatically: false,
  acceptsGuaranteeAutomatically: false,
  marksRegistrationFromStageOnly: false,
  reconcilesSettlement: false,
  writesExternalSystem: false,
  mutatesMatter: false,
  treatsUnverifiedDataAsDraftSafe: false,
})

export const CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS = Object.freeze({
  existingBond: 'existing_bond',
  instruction: 'instruction',
  notice: 'notice',
  figures: 'figures',
  guarantees: 'guarantees',
  signing: 'signing',
  lodgement: 'lodgement',
  registration: 'registration',
  settlement: 'settlement',
  closeout: 'closeout',
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
  expiresFromValue: false,
  ...definition,
  sourcePaths: Object.freeze(definition.sourcePaths || []),
})

export const CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS = Object.freeze([
  factDefinition({
    key: 'seller_existing_bond_status',
    label: 'Seller existing bond status',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.existingBond,
    sourcePaths: [
      'evidence.seller_existing_bond_status',
      'evidence.existing_bond.status',
      'lane.cancellation.seller_existing_bond_status',
      'lane.existingBond.status',
      'lane.seller_existing_bond_status',
      'transaction.seller_existing_bond_status',
      'transaction.seller_has_existing_bond',
      'transaction.sellerHasExistingBond',
      'transaction.existing_bond.status',
    ],
  }),
  factDefinition({
    key: 'cancellation_bank',
    label: 'Cancellation bank',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.existingBond,
    sourcePaths: [
      'evidence.cancellation_bank',
      'evidence.existing_bond.bank',
      'evidence.bond_statement.bank',
      'lane.cancellation.cancellation_bank',
      'lane.cancellation.bank',
      'lane.bank',
      'transaction.cancellation_bank',
      'transaction.existing_bond_bank',
      'transaction.seller_bank',
      'transaction.existingBond.bankName',
    ],
  }),
  factDefinition({
    key: 'cancellation_bond_account_number',
    label: 'Cancellation bond account number',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.existingBond,
    sourcePaths: [
      'evidence.cancellation_bond_account_number',
      'evidence.existing_bond.account_number',
      'evidence.bond_statement.account_number',
      'lane.cancellation.cancellation_bond_account_number',
      'lane.cancellation.accountNumber',
      'lane.bondAccountNumber',
      'transaction.cancellation_bond_account_number',
      'transaction.existing_bond_account_number',
      'transaction.seller_bond_account_number',
    ],
  }),
  factDefinition({
    key: 'lender_instruction_reference',
    label: 'Lender instruction reference',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.instruction,
    sourcePaths: [
      'evidence.lender_instruction_reference',
      'evidence.cancellation_instruction.reference',
      'evidence.lender_instruction.reference',
      'lane.cancellation.lender_instruction_reference',
      'lane.instruction.reference',
      'transaction.lender_instruction_reference',
      'transaction.cancellation_instruction_reference',
      'transaction.existing_lender_instruction_reference',
    ],
  }),
  factDefinition({
    key: 'cancellation_instruction_received_at',
    label: 'Cancellation instruction received date',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.instruction,
    sourcePaths: [
      'evidence.cancellation_instruction_received_at',
      'evidence.cancellation_instruction.received_at',
      'evidence.cancellation_instruction.receivedAt',
      'lane.cancellation.cancellation_instruction_received_at',
      'lane.instruction.receivedAt',
      'transaction.cancellation_instruction_received_at',
      'transaction.cancellationInstructionReceivedAt',
      'transaction.lender_instruction_received_at',
    ],
  }),
  factDefinition({
    key: 'notice_period_status',
    label: '90-day notice status',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.notice,
    sourcePaths: [
      'evidence.notice_period_status',
      'evidence.notice.status',
      'lane.cancellation.notice_period_status',
      'lane.notice.status',
      'transaction.notice_period_status',
      'transaction.ninety_day_notice_status',
      'transaction.noticeStatus',
    ],
  }),
  factDefinition({
    key: 'notice_date',
    label: '90-day notice date',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.notice,
    sourcePaths: [
      'evidence.notice_date',
      'evidence.notice.date',
      'lane.cancellation.notice_date',
      'lane.notice.date',
      'transaction.notice_date',
      'transaction.ninety_day_notice_date',
      'transaction.noticeDate',
    ],
  }),
  factDefinition({
    key: 'cancellation_figures_amount',
    label: 'Cancellation figures amount',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.figures,
    sourcePaths: [
      'evidence.cancellation_figures_amount',
      'evidence.cancellation_figures.amount',
      'evidence.figures.amount',
      'lane.cancellation.cancellation_figures_amount',
      'lane.figures.amount',
      'transaction.cancellation_figures_amount',
      'transaction.cancellationFigures.amount',
      'transaction.settlement_figures_amount',
    ],
  }),
  factDefinition({
    key: 'cancellation_figures_expiry_date',
    label: 'Cancellation figures expiry date',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.figures,
    expiresFromValue: true,
    sourcePaths: [
      'evidence.cancellation_figures_expiry_date',
      'evidence.cancellation_figures.expiry_date',
      'evidence.cancellation_figures.expiryDate',
      'evidence.figures.expiryDate',
      'lane.cancellation.cancellation_figures_expiry_date',
      'lane.figures.expiryDate',
      'transaction.cancellation_figures_expiry_date',
      'transaction.cancellationFigures.expiryDate',
      'transaction.settlement_figures_expiry_date',
    ],
  }),
  factDefinition({
    key: 'daily_interest_amount',
    label: 'Daily interest amount',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.figures,
    sourcePaths: [
      'evidence.daily_interest_amount',
      'evidence.cancellation_figures.daily_interest_amount',
      'evidence.cancellation_figures.dailyInterest',
      'lane.cancellation.daily_interest_amount',
      'lane.figures.dailyInterest',
      'transaction.daily_interest_amount',
      'transaction.cancellationFigures.dailyInterest',
      'transaction.settlement_daily_interest_amount',
    ],
  }),
  factDefinition({
    key: 'penalty_notice_risk',
    label: 'Penalty or notice risk',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.notice,
    sourcePaths: [
      'evidence.penalty_notice_risk',
      'evidence.cancellation_figures.penalty_notice_risk',
      'evidence.notice.penaltyRisk',
      'lane.cancellation.penalty_notice_risk',
      'lane.notice.penaltyRisk',
      'transaction.penalty_notice_risk',
      'transaction.notice_penalty_risk',
      'transaction.cancellationFigures.penaltyRisk',
    ],
  }),
  factDefinition({
    key: 'guarantee_required_amount',
    label: 'Required guarantee amount',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.guarantees,
    sourcePaths: [
      'evidence.guarantee_required_amount',
      'evidence.cancellation_guarantees.required_amount',
      'evidence.guarantee.amount',
      'lane.cancellation.guarantee_required_amount',
      'lane.guarantees.requiredAmount',
      'transaction.guarantee_required_amount',
      'transaction.cancellationGuarantees.requiredAmount',
      'transaction.guarantee_amount',
    ],
  }),
  factDefinition({
    key: 'guarantee_beneficiary_and_wording',
    label: 'Guarantee beneficiary and wording requirements',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.guarantees,
    sourcePaths: [
      'evidence.guarantee_beneficiary_and_wording',
      'evidence.cancellation_guarantees.beneficiary_and_wording',
      'evidence.guarantee.beneficiaryAndWording',
      'lane.cancellation.guarantee_beneficiary_and_wording',
      'lane.guarantees.beneficiaryAndWording',
      'transaction.guarantee_beneficiary_and_wording',
      'transaction.cancellationGuarantees.beneficiaryAndWording',
      'transaction.guarantee_wording_requirements',
    ],
  }),
  factDefinition({
    key: 'guarantee_reference',
    label: 'Guarantee reference',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.guarantees,
    sourcePaths: [
      'evidence.guarantee_reference',
      'evidence.cancellation_guarantees.reference',
      'evidence.guarantee.reference',
      'lane.cancellation.guarantee_reference',
      'lane.guarantees.reference',
      'transaction.guarantee_reference',
      'transaction.cancellationGuarantees.reference',
      'transaction.guaranteeRef',
    ],
  }),
  factDefinition({
    key: 'guarantee_acceptance_status',
    label: 'Guarantee acceptance status',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.guarantees,
    sourcePaths: [
      'evidence.guarantee_acceptance_status',
      'evidence.cancellation_guarantees.acceptance_status',
      'evidence.guarantee.acceptanceStatus',
      'lane.cancellation.guarantee_acceptance_status',
      'lane.guarantees.acceptanceStatus',
      'transaction.guarantee_acceptance_status',
      'transaction.cancellationGuarantees.acceptanceStatus',
      'transaction.guarantee_status',
    ],
  }),
  factDefinition({
    key: 'seller_cancellation_signing_requirement',
    label: 'Seller cancellation signing requirement',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.signing,
    sourcePaths: [
      'evidence.seller_cancellation_signing_requirement',
      'evidence.cancellation_signing.requirement',
      'lane.cancellation.seller_cancellation_signing_requirement',
      'lane.signing.requirement',
      'transaction.seller_cancellation_signing_requirement',
      'transaction.cancellationSigning.requirement',
      'transaction.seller_signing_requirement',
    ],
  }),
  factDefinition({
    key: 'signed_cancellation_document_status',
    label: 'Signed cancellation document status',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.signing,
    sourcePaths: [
      'evidence.signed_cancellation_document_status',
      'evidence.cancellation_signing.signed_document_status',
      'evidence.cancellation_documents.signedStatus',
      'lane.cancellation.signed_cancellation_document_status',
      'lane.signing.signedDocumentStatus',
      'transaction.signed_cancellation_document_status',
      'transaction.cancellationSigning.signedDocumentStatus',
      'transaction.seller_signed_cancellation_documents_status',
    ],
  }),
  factDefinition({
    key: 'lodgement_reference',
    label: 'Cancellation lodgement reference',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.lodgement,
    sourcePaths: [
      'evidence.lodgement_reference',
      'evidence.cancellation_lodgement.reference',
      'lane.cancellation.lodgement_reference',
      'lane.lodgement.reference',
      'transaction.lodgement_reference',
      'transaction.cancellation_lodgement_reference',
      'transaction.cancellationLodgement.reference',
    ],
  }),
  factDefinition({
    key: 'lodgement_date',
    label: 'Cancellation lodgement date',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.lodgement,
    sourcePaths: [
      'evidence.lodgement_date',
      'evidence.cancellation_lodgement.date',
      'lane.cancellation.lodgement_date',
      'lane.lodgement.date',
      'transaction.lodgement_date',
      'transaction.cancellation_lodgement_date',
      'transaction.cancellationLodgement.date',
    ],
  }),
  factDefinition({
    key: 'cancellation_registration_reference',
    label: 'Cancellation registration reference',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.registration,
    sourcePaths: [
      'evidence.cancellation_registration_reference',
      'evidence.cancellation_registration.reference',
      'evidence.registration.reference',
      'lane.cancellation.cancellation_registration_reference',
      'lane.registration.reference',
      'transaction.cancellation_registration_reference',
      'transaction.cancellationRegistration.reference',
      'transaction.registration_reference',
    ],
  }),
  factDefinition({
    key: 'cancellation_registration_date',
    label: 'Cancellation registration date',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.registration,
    sourcePaths: [
      'evidence.cancellation_registration_date',
      'evidence.cancellation_registration.date',
      'evidence.registration.date',
      'lane.cancellation.cancellation_registration_date',
      'lane.registration.date',
      'transaction.cancellation_registration_date',
      'transaction.cancellationRegistration.date',
      'transaction.registration_date',
    ],
  }),
  factDefinition({
    key: 'settlement_amount',
    label: 'Settlement amount',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.settlement,
    sourcePaths: [
      'evidence.settlement_amount',
      'evidence.proof_of_settlement.amount',
      'evidence.settlement.amount',
      'lane.cancellation.settlement_amount',
      'lane.settlement.amount',
      'transaction.settlement_amount',
      'transaction.cancellationSettlement.amount',
      'transaction.payment_amount',
    ],
  }),
  factDefinition({
    key: 'settlement_payment_reference',
    label: 'Settlement payment reference',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.settlement,
    sourcePaths: [
      'evidence.settlement_payment_reference',
      'evidence.proof_of_settlement.payment_reference',
      'evidence.settlement.paymentReference',
      'lane.cancellation.settlement_payment_reference',
      'lane.settlement.paymentReference',
      'transaction.settlement_payment_reference',
      'transaction.cancellationSettlement.paymentReference',
      'transaction.payment_reference',
    ],
  }),
  factDefinition({
    key: 'closeout_status',
    label: 'Cancellation close-out status',
    group: CANCELLATION_ATTORNEY_PHASE2_FACT_GROUPS.closeout,
    sourcePaths: [
      'evidence.closeout_status',
      'evidence.cancellation_closeout.status',
      'lane.cancellation.closeout_status',
      'lane.closeout.status',
      'transaction.closeout_status',
      'transaction.cancellation_closeout_status',
      'transaction.cancellationCloseout.status',
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

function sourceExpired(source = {}, resolvedAt = '', definition = {}) {
  if (source.expiresAt) {
    if (!validDate(source.expiresAt) || !validDate(resolvedAt)) return true
    return new Date(source.expiresAt) <= new Date(resolvedAt)
  }
  if (definition.expiresFromValue === true) {
    if (!validDate(source.value) || !validDate(resolvedAt)) return true
    return new Date(source.value) <= new Date(resolvedAt)
  }
  return false
}

function resolveStatus({ definition, primarySource, conflicts, resolvedAt }) {
  if (!primarySource) return CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.missing
  if (conflicts.length) return CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.conflict
  if (sourceExpired(primarySource, resolvedAt, definition)) return CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.stale
  if (definition.verificationRequired && !sourceVerified(primarySource)) return CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.unverified
  return CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.verified
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
    expiresFromValue: definition.expiresFromValue === true ? primarySource?.value || null : null,
    status,
  })

  return Object.freeze({
    key: definition.key,
    label: definition.label,
    group: definition.group,
    required: definition.required !== false,
    verificationRequired: definition.verificationRequired === true,
    invalidatesDrafts: definition.invalidatesDrafts !== false,
    expiresFromValue: definition.expiresFromValue === true,
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

export function buildCancellationAttorneyFactFingerprints(facts = []) {
  return Object.freeze((Array.isArray(facts) ? facts : []).reduce((result, fact) => {
    if (fact?.key && fact.invalidatesDrafts !== false) result[fact.key] = fact.fingerprint
    return result
  }, {}))
}

export function buildCancellationAttorneyDataFingerprint(facts = []) {
  return hash(buildCancellationAttorneyFactFingerprints(facts))
}

export function resolveCancellationAttorneyCanonicalData({
  transaction = {},
  lane = {},
  evidence = {},
  resolvedAt = new Date().toISOString(),
} = {}) {
  const root = { transaction, lane, evidence }
  const facts = CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS.map((definition) => resolveFact(definition, root, resolvedAt))
  const factMap = factsByKey(facts)
  const missingFactKeys = facts.filter((fact) => fact.status === CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.missing).map((fact) => fact.key)
  const unverifiedFactKeys = facts.filter((fact) => fact.status === CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.unverified).map((fact) => fact.key)
  const staleFactKeys = facts.filter((fact) => fact.status === CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.stale).map((fact) => fact.key)
  const conflictFactKeys = facts.filter((fact) => fact.status === CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.conflict).map((fact) => fact.key)
  const factFingerprints = buildCancellationAttorneyFactFingerprints(facts)
  const dataFingerprint = buildCancellationAttorneyDataFingerprint(facts)
  const ready = missingFactKeys.length === 0 && unverifiedFactKeys.length === 0 && staleFactKeys.length === 0 && conflictFactKeys.length === 0

  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE2_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE2_RELEASE_BLOCKER_ID,
    resolvedAt,
    facts: Object.freeze(facts),
    factsByKey: Object.freeze(factMap),
    missingFactKeys: Object.freeze(missingFactKeys),
    unverifiedFactKeys: Object.freeze(unverifiedFactKeys),
    staleFactKeys: Object.freeze(staleFactKeys),
    conflictFactKeys: Object.freeze(conflictFactKeys),
    factFingerprints,
    dataFingerprint,
    readyForDrafting: ready,
    readyForCancellationPack: ready,
    controls: CANCELLATION_ATTORNEY_PHASE2_CONTROL_BOUNDARY,
  })
}

export function evaluateCancellationAttorneyDraftInvalidation({ draft = {}, canonicalData = null } = {}) {
  const data = canonicalData || resolveCancellationAttorneyCanonicalData({})
  const currentFingerprints = data.factFingerprints || buildCancellationAttorneyFactFingerprints(data.facts || [])
  const previousFingerprints = draft.factFingerprints || draft.sourceFactFingerprints || {}
  const previousDataFingerprint = draft.dataFingerprint || draft.sourceFactsFingerprint || draft.factFingerprint || ''
  const currentDataFingerprint = data.dataFingerprint || buildCancellationAttorneyDataFingerprint(data.facts || [])
  const trackedKeys = [...new Set([...Object.keys(previousFingerprints), ...Object.keys(currentFingerprints)])]
  const changedFactKeys = trackedKeys.filter((key) => previousFingerprints[key] !== currentFingerprints[key])
  const hasBinding = Boolean(previousDataFingerprint || Object.keys(previousFingerprints).length)
  const invalidated = !hasBinding || previousDataFingerprint !== currentDataFingerprint || changedFactKeys.length > 0

  return Object.freeze({
    invalidated,
    reason: !hasBinding
      ? 'draft_not_bound_to_canonical_cancellation_data'
      : invalidated
        ? 'canonical_cancellation_data_changed'
        : 'canonical_cancellation_data_unchanged',
    changedFactKeys: Object.freeze(changedFactKeys),
    previousDataFingerprint: previousDataFingerprint || null,
    currentDataFingerprint,
  })
}

export function buildCancellationAttorneyPhase2BaselineReport(input = {}) {
  const canonicalData = resolveCancellationAttorneyCanonicalData(input)
  const definitionKeys = CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS.map((definition) => definition.key)
  const missingDefinitionKeys = CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.filter((key) => !definitionKeys.includes(key))
  const groupKeys = [...new Set(CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS.map((definition) => definition.group))]

  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE2_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE2_RELEASE_BLOCKER_ID,
    factDefinitionCount: CANCELLATION_ATTORNEY_PHASE2_FACT_DEFINITIONS.length,
    factGroupCount: groupKeys.length,
    factGroupKeys: Object.freeze(groupKeys),
    phase0DataContractCount: CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.length,
    missingDefinitionKeys: Object.freeze(missingDefinitionKeys),
    missingFactKeys: canonicalData.missingFactKeys,
    unverifiedFactKeys: canonicalData.unverifiedFactKeys,
    staleFactKeys: canonicalData.staleFactKeys,
    conflictFactKeys: canonicalData.conflictFactKeys,
    dataFingerprint: canonicalData.dataFingerprint,
    readyForDrafting: canonicalData.readyForDrafting,
    readyForCancellationPack: canonicalData.readyForCancellationPack,
    controls: canonicalData.controls,
    readyForPhase3: missingDefinitionKeys.length === 0 &&
      canonicalData.facts.every((fact) => fact.fingerprint && fact.source !== undefined) &&
      canonicalData.controls.canonicalDataOnly === true &&
      canonicalData.controls.persistsCanonicalFacts === false &&
      canonicalData.controls.generatesOperationalDocuments === false &&
      canonicalData.controls.writesExternalSystem === false,
  })
}
