import { parseConveyancerMoneyToMinor, formatConveyancerMoneyFromMinor } from '../../core/transactions/conveyancerFinancialModel.js'
import {
  CONVEYANCER_COORDINATION_STATUSES as S,
  validateConveyancerCoordination,
} from '../../core/transactions/conveyancerCoordinationContract.js'
import {
  CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS as K,
  validateConveyancerThreeRoleDependencyModel,
} from '../../core/transactions/conveyancerThreeRoleDependencyModel.js'
import { evaluateConveyancerSharedTimelineViewer } from './conveyancerSharedProfessionalTimeline.js'

export const CONVEYANCER_GUARANTEE_WORKSPACE_VERSION = 'conveyancer_guarantee_workspace_v1'

export const CONVEYANCER_GUARANTEE_REQUIREMENT_TYPES = Object.freeze({
  purchasePrice: 'purchase_price',
  cancellationSettlement: 'cancellation_settlement',
  other: 'other',
})

export const CONVEYANCER_GUARANTEE_INSTRUMENT_TYPES = Object.freeze({
  bankGuarantee: 'bank_guarantee',
  cashUndertaking: 'cash_undertaking',
})

export const CONVEYANCER_GUARANTEE_ITEM_STATUSES = Object.freeze({
  current: 'current',
  superseded: 'superseded',
  withdrawn: 'withdrawn',
})

export const CONVEYANCER_GUARANTEE_WORKSPACE_HEALTH = Object.freeze({
  notApplicable: 'not_applicable',
  waiting: 'waiting',
  actionRequired: 'action_required',
  blocked: 'blocked',
  ready: 'ready',
})

const REQUIREMENT_TYPES = new Set(Object.values(CONVEYANCER_GUARANTEE_REQUIREMENT_TYPES))
const INSTRUMENT_TYPES = new Set(Object.values(CONVEYANCER_GUARANTEE_INSTRUMENT_TYPES))
const ITEM_STATUSES = new Set(Object.values(CONVEYANCER_GUARANTEE_ITEM_STATUSES))
const GUARANTEE_KEYS = new Set([
  K.bondGuaranteeIssued,
  K.transferGuaranteeWordingDecision,
  K.cancellationFigures,
  K.cancellationGuaranteeProvided,
  K.cancellationGuaranteeAcceptance,
])

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {})
  return value
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fnv(value) {
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function amount(input = {}) {
  const direct = input.amountMinor ?? input.amount_minor
  if (direct !== undefined && direct !== null && direct !== '') {
    const value = Number(direct)
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  return parseConveyancerMoneyToMinor(input.amount)
}
function workspaceFingerprint(value = {}) { const { fingerprint: _fingerprint, ...snapshot } = value; return fnv(snapshot) }
function fail(code, errors) { return deepFreeze({ ok: false, code, errors: unique(errors), workspace: null }) }

function normalizeRequirement(input = {}) {
  return {
    requirementId: text(input.requirementId || input.requirement_id),
    requirementType: key(input.requirementType || input.requirement_type),
    status: key(input.status) || CONVEYANCER_GUARANTEE_ITEM_STATUSES.current,
    ownerLane: key(input.ownerLane || input.owner_lane),
    currency: text(input.currency || 'ZAR').toUpperCase(),
    amountMinor: amount(input),
    beneficiaryReferenceHash: text(input.beneficiaryReferenceHash || input.beneficiary_reference_hash).toLowerCase(),
    wordingHash: text(input.wordingHash || input.wording_hash).toLowerCase(),
    sourceReferenceId: text(input.sourceReferenceId || input.source_reference_id),
    sourceEvidenceHash: text(input.sourceEvidenceHash || input.source_evidence_hash).toLowerCase(),
    effectiveAt: iso(input.effectiveAt || input.effective_at),
    expiresAt: iso(input.expiresAt || input.expires_at),
    previousRequirementId: text(input.previousRequirementId || input.previous_requirement_id) || null,
  }
}

function normalizeInstrument(input = {}) {
  return {
    instrumentId: text(input.instrumentId || input.instrument_id),
    instrumentType: key(input.instrumentType || input.instrument_type),
    status: key(input.status) || CONVEYANCER_GUARANTEE_ITEM_STATUSES.current,
    issuerLane: key(input.issuerLane || input.issuer_lane),
    issuerFirmId: text(input.issuerFirmId || input.issuer_firm_id),
    currency: text(input.currency || 'ZAR').toUpperCase(),
    amountMinor: amount(input),
    beneficiaryReferenceHash: text(input.beneficiaryReferenceHash || input.beneficiary_reference_hash).toLowerCase(),
    wordingHash: text(input.wordingHash || input.wording_hash).toLowerCase(),
    documentReferenceId: text(input.documentReferenceId || input.document_reference_id),
    documentHash: text(input.documentHash || input.document_hash).toLowerCase(),
    issuedAt: iso(input.issuedAt || input.issued_at),
    expiresAt: iso(input.expiresAt || input.expires_at),
    previousInstrumentId: text(input.previousInstrumentId || input.previous_instrument_id) || null,
  }
}

function normalizeAllocation(input = {}) {
  return {
    allocationId: text(input.allocationId || input.allocation_id),
    requirementId: text(input.requirementId || input.requirement_id),
    instrumentId: text(input.instrumentId || input.instrument_id),
    amountMinor: amount(input),
    routedDocumentReferenceId: text(input.routedDocumentReferenceId || input.routed_document_reference_id) || null,
    allocatedAt: iso(input.allocatedAt || input.allocated_at),
    allocatedByLane: key(input.allocatedByLane || input.allocated_by_lane),
  }
}

function currentCoordinationRecords(dependencyModel, supplied = [], asOf = null) {
  const errors = []
  const rows = Array.isArray(supplied) ? supplied : []
  if (new Set(rows.map((item) => item.coordinationId)).size !== rows.length) errors.push('duplicate_guarantee_coordination_record')
  const suppliedById = new Map(rows.map((item) => [item.coordinationId, item]))
  const nodeIds = new Set(dependencyModel.nodes.map((node) => node.coordination.coordinationId))
  if (rows.some((item) => !nodeIds.has(item.coordinationId))) errors.push('orphan_guarantee_coordination_record')
  const records = new Map()
  for (const node of dependencyModel.nodes.filter((item) => GUARANTEE_KEYS.has(item.key))) {
    const record = suppliedById.get(node.coordination.coordinationId) || node.coordination
    const validation = validateConveyancerCoordination(record, { actionKeys: Object.values(dependencyModel.actionKeyMap || {}) })
    if (!validation.valid) errors.push(...validation.errors.map((error) => `${node.key}:${error}`))
    if (record.coordinationId !== node.coordination.coordinationId || record.definitionFingerprint !== node.coordination.definitionFingerprint) errors.push(`${node.key}:guarantee_coordination_binding_invalid`)
    const timestamps = [record.createdAt, record.updatedAt, record.requestedAt, record.acknowledgement?.acknowledgedAt, record.submission?.submittedAt, record.decision?.decidedAt, record.blockage?.blockedAt, ...(record.evidence || []).map((item) => item.capturedAt)].filter(Boolean)
    if (asOf && timestamps.some((timestamp) => new Date(timestamp) > new Date(asOf))) errors.push(`${node.key}:guarantee_coordination_event_in_future`)
    records.set(node.key, validation.coordination)
  }
  return { errors, records }
}

function evidenceReferences(record, requirementKey) {
  return new Set((record?.evidence || []).filter((item) => !requirementKey || item.requirementKey === requirementKey).map((item) => item.referenceId).filter(Boolean))
}

function nextLane(record) {
  if (!record || record.status === S.accepted) return null
  if ([S.draft, S.submitted].includes(record.status)) return record.source.lane
  if ([S.requested, S.acknowledged, S.inProgress, S.changesRequested, S.blocked].includes(record.status)) return record.target.lane
  return record.source.lane
}

function issue(code, ownerLane, { severity = 'blocker', requirementId = null, instrumentId = null, coordinationKey = null, detail = null } = {}) {
  return { code, severity, ownerLane, requirementId, instrumentId, coordinationKey, detail }
}

function validateInputs({ dependencyModel, requirements, instruments, allocations, records, asOf, expectedLodgementAt }) {
  const errors = []
  const requiredLanes = new Set(dependencyModel.requiredLanes)
  if (new Set(requirements.map((item) => item.requirementId)).size !== requirements.length) errors.push('duplicate_guarantee_requirement')
  if (new Set(instruments.map((item) => item.instrumentId)).size !== instruments.length) errors.push('duplicate_guarantee_instrument')
  if (new Set(allocations.map((item) => item.allocationId)).size !== allocations.length) errors.push('duplicate_guarantee_allocation')
  const requirementById = new Map(requirements.map((item) => [item.requirementId, item]))
  const instrumentById = new Map(instruments.map((item) => [item.instrumentId, item]))
  for (const item of requirements) {
    if (!item.requirementId || !REQUIREMENT_TYPES.has(item.requirementType) || !ITEM_STATUSES.has(item.status)) errors.push(`guarantee_requirement_identity_invalid:${item.requirementId || 'missing'}`)
    if (!['transfer', 'cancellation'].includes(item.ownerLane) || !requiredLanes.has(item.ownerLane)) errors.push(`guarantee_requirement_owner_invalid:${item.requirementId}`)
    if (item.requirementType === CONVEYANCER_GUARANTEE_REQUIREMENT_TYPES.cancellationSettlement && item.ownerLane !== 'cancellation') errors.push(`cancellation_requirement_owner_invalid:${item.requirementId}`)
    if (item.currency !== 'ZAR' || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0) errors.push(`guarantee_requirement_amount_invalid:${item.requirementId}`)
    if (!sha(item.beneficiaryReferenceHash) || !sha(item.wordingHash) || !item.sourceReferenceId || !sha(item.sourceEvidenceHash) || !item.effectiveAt) errors.push(`guarantee_requirement_provenance_invalid:${item.requirementId}`)
    if (item.effectiveAt && new Date(item.effectiveAt) > new Date(asOf)) errors.push(`guarantee_requirement_in_future:${item.requirementId}`)
    if (item.previousRequirementId && (!requirementById.has(item.previousRequirementId) || item.previousRequirementId === item.requirementId || requirementById.get(item.previousRequirementId)?.status !== 'superseded')) errors.push(`guarantee_requirement_lineage_invalid:${item.requirementId}`)
  }
  for (const item of instruments) {
    if (!item.instrumentId || !INSTRUMENT_TYPES.has(item.instrumentType) || !ITEM_STATUSES.has(item.status)) errors.push(`guarantee_instrument_identity_invalid:${item.instrumentId || 'missing'}`)
    const expectedLane = item.instrumentType === CONVEYANCER_GUARANTEE_INSTRUMENT_TYPES.bankGuarantee ? 'bond' : 'transfer'
    if (item.issuerLane !== expectedLane || !requiredLanes.has(item.issuerLane) || item.issuerFirmId !== dependencyModel.roleBindings?.[item.issuerLane]?.firmId) errors.push(`guarantee_instrument_issuer_invalid:${item.instrumentId}`)
    if (item.currency !== 'ZAR' || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0) errors.push(`guarantee_instrument_amount_invalid:${item.instrumentId}`)
    if (!sha(item.beneficiaryReferenceHash) || !sha(item.wordingHash) || !item.documentReferenceId || !sha(item.documentHash) || !item.issuedAt || !item.expiresAt) errors.push(`guarantee_instrument_provenance_invalid:${item.instrumentId}`)
    if (item.issuedAt && new Date(item.issuedAt) > new Date(asOf)) errors.push(`guarantee_instrument_in_future:${item.instrumentId}`)
    if (item.issuedAt && item.expiresAt && new Date(item.expiresAt) <= new Date(item.issuedAt)) errors.push(`guarantee_instrument_expiry_invalid:${item.instrumentId}`)
    if (item.previousInstrumentId && (!instrumentById.has(item.previousInstrumentId) || item.previousInstrumentId === item.instrumentId || instrumentById.get(item.previousInstrumentId)?.status !== 'superseded' || new Date(instrumentById.get(item.previousInstrumentId)?.issuedAt) >= new Date(item.issuedAt))) errors.push(`guarantee_instrument_lineage_invalid:${item.instrumentId}`)
  }
  if (new Set(instruments.filter((item) => item.status === 'current').map((item) => item.documentReferenceId)).size !== instruments.filter((item) => item.status === 'current').length) errors.push('duplicate_current_guarantee_document')
  for (const item of allocations) {
    if (!item.allocationId || !requirementById.has(item.requirementId) || !instrumentById.has(item.instrumentId) || requirementById.get(item.requirementId)?.status !== 'current' || instrumentById.get(item.instrumentId)?.status !== 'current' || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0 || !item.allocatedAt || item.allocatedByLane !== 'transfer') errors.push(`guarantee_allocation_invalid:${item.allocationId || 'missing'}`)
    if (item.allocatedAt && new Date(item.allocatedAt) > new Date(asOf)) errors.push(`guarantee_allocation_in_future:${item.allocationId}`)
    const requirement = requirementById.get(item.requirementId); const instrument = instrumentById.get(item.instrumentId)
    if (requirement && instrument && requirement.currency !== instrument.currency) errors.push(`guarantee_allocation_currency_mismatch:${item.allocationId}`)
  }
  if (expectedLodgementAt && !iso(expectedLodgementAt)) errors.push('guarantee_expected_lodgement_at_invalid')
  errors.push(...records.errors)
  return unique(errors)
}

export function buildConveyancerGuaranteeWorkspace({ dependencyModel = {}, coordinationRecords = [], requirements: inputRequirements = [], instruments: inputInstruments = [], allocations: inputAllocations = [], viewer = {}, asOf = '', expectedLodgementAt = null } = {}) {
  const dependencyValidation = validateConveyancerThreeRoleDependencyModel(dependencyModel)
  if (!dependencyValidation.valid) return fail('guarantee_workspace_dependency_model_invalid', dependencyValidation.errors)
  const access = evaluateConveyancerSharedTimelineViewer({ dependencyModel, viewer })
  if (!access.allowed) return fail('guarantee_workspace_access_denied', [access.reason])
  const projectionAt = iso(asOf)
  if (!projectionAt) return fail('guarantee_workspace_projection_invalid', ['guarantee_workspace_as_of_invalid'])
  if (new Date(dependencyModel.generatedAt) > new Date(projectionAt)) return fail('guarantee_workspace_projection_invalid', ['dependency_model_generated_in_future'])
  const requirements = (Array.isArray(inputRequirements) ? inputRequirements : []).map(normalizeRequirement)
  const instruments = (Array.isArray(inputInstruments) ? inputInstruments : []).map(normalizeInstrument)
  const allocations = (Array.isArray(inputAllocations) ? inputAllocations : []).map(normalizeAllocation)
  const records = currentCoordinationRecords(dependencyModel, coordinationRecords, projectionAt)
  const errors = validateInputs({ dependencyModel, requirements, instruments, allocations, records, asOf: projectionAt, expectedLodgementAt })
  if (errors.length) return fail('guarantee_workspace_inputs_invalid', errors)

  const applicable = dependencyModel.requiredLanes.includes('bond') || dependencyModel.requiredLanes.includes('cancellation')
  const currentRequirements = requirements.filter((item) => item.status === 'current')
  const currentInstruments = instruments.filter((item) => item.status === 'current')
  const currentRequirementIds = new Set(currentRequirements.map((item) => item.requirementId))
  const currentInstrumentIds = new Set(currentInstruments.map((item) => item.instrumentId))
  const currentAllocations = allocations.filter((item) => currentRequirementIds.has(item.requirementId) && currentInstrumentIds.has(item.instrumentId))
  const issues = []

  if (applicable && !currentRequirements.length) issues.push(issue('guarantee_requirements_missing', dependencyModel.requiredLanes.includes('cancellation') ? 'cancellation' : 'transfer'))
  if (dependencyModel.requiredLanes.includes('cancellation') && !currentRequirements.some((item) => item.requirementType === 'cancellation_settlement')) issues.push(issue('cancellation_guarantee_requirement_missing', 'cancellation'))
  if (applicable && currentRequirements.length && !currentInstruments.length) issues.push(issue('guarantee_instruments_missing', dependencyModel.requiredLanes.includes('bond') ? 'bond' : 'transfer'))

  const requirementRows = currentRequirements.map((requirement) => {
    const rows = currentAllocations.filter((item) => item.requirementId === requirement.requirementId)
    const allocatedMinor = rows.reduce((sum, item) => sum + item.amountMinor, 0)
    const linked = rows.map((item) => currentInstruments.find((instrument) => instrument.instrumentId === item.instrumentId)).filter(Boolean)
    if (allocatedMinor < requirement.amountMinor) issues.push(issue('guarantee_requirement_underallocated', 'transfer', { requirementId: requirement.requirementId, detail: requirement.amountMinor - allocatedMinor }))
    if (allocatedMinor > requirement.amountMinor) issues.push(issue('guarantee_requirement_overallocated', 'transfer', { requirementId: requirement.requirementId, detail: allocatedMinor - requirement.amountMinor }))
    if (linked.some((instrument) => instrument.wordingHash !== requirement.wordingHash)) issues.push(issue('guarantee_wording_mismatch', 'transfer', { requirementId: requirement.requirementId }))
    if (linked.some((instrument) => instrument.beneficiaryReferenceHash !== requirement.beneficiaryReferenceHash)) issues.push(issue('guarantee_beneficiary_mismatch', 'transfer', { requirementId: requirement.requirementId }))
    if (requirement.expiresAt && new Date(requirement.expiresAt) <= new Date(projectionAt)) issues.push(issue('guarantee_requirement_expired', requirement.ownerLane, { requirementId: requirement.requirementId }))
    return { ...requirement, allocatedMinor, remainingMinor: Math.max(0, requirement.amountMinor - allocatedMinor), coverage: allocatedMinor === requirement.amountMinor ? 'exact' : allocatedMinor < requirement.amountMinor ? 'short' : 'excess', allocationIds: rows.map((item) => item.allocationId), formattedAmount: formatConveyancerMoneyFromMinor(requirement.amountMinor, requirement.currency) }
  })

  const bankDocumentRefs = evidenceReferences(records.records.get(K.bondGuaranteeIssued), 'guarantee_document')
  const cancellationDocumentRefs = evidenceReferences(records.records.get(K.cancellationGuaranteeProvided), 'cancellation_guarantee_document')
  const cancellationFigureRefs = evidenceReferences(records.records.get(K.cancellationFigures), 'cancellation_figures_document')
  for (const requirement of currentRequirements.filter((item) => item.requirementType === 'cancellation_settlement')) {
    if (!cancellationFigureRefs.has(requirement.sourceReferenceId)) issues.push(issue('cancellation_requirement_evidence_unbound', 'cancellation', { requirementId: requirement.requirementId }))
  }
  const instrumentRows = currentInstruments.map((instrument) => {
    const rows = currentAllocations.filter((item) => item.instrumentId === instrument.instrumentId)
    const allocatedMinor = rows.reduce((sum, item) => sum + item.amountMinor, 0)
    const expired = new Date(instrument.expiresAt) <= new Date(projectionAt)
    const expiresBeforeLodgement = Boolean(expectedLodgementAt && new Date(instrument.expiresAt) < new Date(expectedLodgementAt))
    const evidenceBound = instrument.instrumentType === 'bank_guarantee' ? bankDocumentRefs.has(instrument.documentReferenceId) : true
    const cancellationRoutes = rows.filter((row) => currentRequirements.find((item) => item.requirementId === row.requirementId)?.requirementType === 'cancellation_settlement')
    const cancellationEvidenceBound = cancellationRoutes.every((row) => row.routedDocumentReferenceId && cancellationDocumentRefs.has(row.routedDocumentReferenceId))
    if (allocatedMinor > instrument.amountMinor) issues.push(issue('guarantee_instrument_overallocated', 'transfer', { instrumentId: instrument.instrumentId, detail: allocatedMinor - instrument.amountMinor }))
    if (expired) issues.push(issue('guarantee_instrument_expired', instrument.issuerLane, { instrumentId: instrument.instrumentId }))
    else if (expiresBeforeLodgement) issues.push(issue('guarantee_instrument_expires_before_lodgement', instrument.issuerLane, { instrumentId: instrument.instrumentId }))
    if (!evidenceBound) issues.push(issue('guarantee_issue_evidence_unbound', instrument.issuerLane, { instrumentId: instrument.instrumentId }))
    if (!cancellationEvidenceBound) issues.push(issue('cancellation_route_evidence_unbound', 'transfer', { instrumentId: instrument.instrumentId }))
    return { ...instrument, allocatedMinor, unallocatedMinor: Math.max(0, instrument.amountMinor - allocatedMinor), expired, expiresBeforeLodgement, evidenceBound, cancellationEvidenceBound, allocationIds: rows.map((item) => item.allocationId), formattedAmount: formatConveyancerMoneyFromMinor(instrument.amountMinor, instrument.currency) }
  })

  for (const [coordinationKey, record] of records.records) {
    if (record.status !== S.accepted) issues.push(issue(record.status === S.blocked ? 'guarantee_coordination_blocked' : 'guarantee_coordination_pending', nextLane(record), { coordinationKey, detail: record.status }))
  }

  const totals = {
    currency: 'ZAR',
    requiredMinor: currentRequirements.reduce((sum, item) => sum + item.amountMinor, 0),
    instrumentMinor: currentInstruments.reduce((sum, item) => sum + item.amountMinor, 0),
    allocatedMinor: currentAllocations.reduce((sum, item) => sum + item.amountMinor, 0),
  }
  totals.formattedRequired = formatConveyancerMoneyFromMinor(totals.requiredMinor, totals.currency)
  totals.formattedInstruments = formatConveyancerMoneyFromMinor(totals.instrumentMinor, totals.currency)
  totals.formattedAllocated = formatConveyancerMoneyFromMinor(totals.allocatedMinor, totals.currency)
  const blockers = issues.filter((item) => item.severity === 'blocker')
  const health = !applicable ? CONVEYANCER_GUARANTEE_WORKSPACE_HEALTH.notApplicable
    : !blockers.length ? CONVEYANCER_GUARANTEE_WORKSPACE_HEALTH.ready
      : blockers.some((item) => item.code.includes('blocked') || item.code.includes('expired') || item.code.includes('mismatch') || item.code.includes('overallocated')) ? CONVEYANCER_GUARANTEE_WORKSPACE_HEALTH.blocked
        : blockers.some((item) => item.ownerLane === access.viewer.lane) ? CONVEYANCER_GUARANTEE_WORKSPACE_HEALTH.actionRequired
          : CONVEYANCER_GUARANTEE_WORKSPACE_HEALTH.waiting
  const workspace = {
    version: CONVEYANCER_GUARANTEE_WORKSPACE_VERSION,
    workspaceId: `guarantee_workspace:${dependencyModel.transactionId}:${dependencyModel.plan.planId}:v${dependencyModel.plan.planVersion}`,
    dependencyModelId: dependencyModel.modelId,
    dependencyModelFingerprint: dependencyModel.fingerprint,
    plan: { ...dependencyModel.plan }, transactionId: dependencyModel.transactionId, organisationId: dependencyModel.organisationId,
    asOf: projectionAt, expectedLodgementAt: iso(expectedLodgementAt), viewer: access.viewer, applicable, health, ready: applicable && health === 'ready',
    totals, requirements: requirementRows, instruments: instrumentRows, allocations: currentAllocations,
    coordination: [...records.records].map(([coordinationKey, record]) => ({ coordinationKey, coordinationId: record.coordinationId, status: record.status, sourceLane: record.source.lane, targetLane: record.target.lane, nextOwnerLane: nextLane(record) })),
    issues, viewerResponsibilities: issues.filter((item) => item.ownerLane === access.viewer.lane),
    controls: { readOnly: true, commandsAvailable: false, crossLaneMutationAllowed: false, persistencePerformed: false, notificationsSent: false, workflowsMutated: false, evidenceMutated: false },
    fingerprint: null,
  }
  workspace.fingerprint = workspaceFingerprint(workspace)
  const validation = validateConveyancerGuaranteeWorkspace(workspace, { dependencyModel })
  if (!validation.valid) return fail('guarantee_workspace_invalid', validation.errors)
  return deepFreeze({ ok: true, code: 'guarantee_workspace_ready', errors: [], workspace: validation.workspace })
}

export function validateConveyancerGuaranteeWorkspace(input = {}, { dependencyModel = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_GUARANTEE_WORKSPACE_VERSION || !value.workspaceId) errors.push('guarantee_workspace_identity_invalid')
  if (!value.plan?.planId || !Number.isInteger(value.plan?.planVersion) || value.plan.planVersion < 1 || !value.transactionId || !value.organisationId) errors.push('guarantee_workspace_matter_binding_invalid')
  if (!iso(value.asOf) || !value.viewer?.userId || !value.viewer?.lane || !value.viewer?.firmId) errors.push('guarantee_workspace_projection_context_invalid')
  if (!Array.isArray(value.requirements) || !Array.isArray(value.instruments) || !Array.isArray(value.allocations) || !Array.isArray(value.coordination) || !Array.isArray(value.issues) || !Array.isArray(value.viewerResponsibilities)) errors.push('guarantee_workspace_collections_invalid')
  if (!Object.values(CONVEYANCER_GUARANTEE_WORKSPACE_HEALTH).includes(value.health) || value.ready !== (value.applicable === true && value.health === 'ready')) errors.push('guarantee_workspace_health_invalid')
  if (!Number.isSafeInteger(value.totals?.requiredMinor) || !Number.isSafeInteger(value.totals?.instrumentMinor) || !Number.isSafeInteger(value.totals?.allocatedMinor)) errors.push('guarantee_workspace_totals_invalid')
  if (!value.controls?.readOnly || value.controls?.commandsAvailable || value.controls?.crossLaneMutationAllowed || value.controls?.persistencePerformed || value.controls?.notificationsSent || value.controls?.workflowsMutated || value.controls?.evidenceMutated) errors.push('guarantee_workspace_side_effect_boundary_violated')
  if (dependencyModel && (value.dependencyModelId !== dependencyModel.modelId || value.dependencyModelFingerprint !== dependencyModel.fingerprint || value.transactionId !== dependencyModel.transactionId || value.organisationId !== dependencyModel.organisationId || value.plan?.planId !== dependencyModel.plan?.planId || value.plan?.planVersion !== dependencyModel.plan?.planVersion)) errors.push('guarantee_workspace_dependency_binding_invalid')
  const expectedFingerprint = workspaceFingerprint(value)
  if (!/^fnv1a_[a-f0-9]{8}$/.test(value.fingerprint || '')) errors.push('guarantee_workspace_fingerprint_required')
  else if (value.fingerprint !== expectedFingerprint) errors.push('guarantee_workspace_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), workspace: value })
}
