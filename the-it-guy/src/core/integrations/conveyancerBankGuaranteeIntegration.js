import { MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from '../transactions/conveyancerMatterPlanContract.js'
import { validateConveyancerThreeRoleDependencyModel } from '../transactions/conveyancerThreeRoleDependencyModel.js'
import { validateConveyancerGuaranteeWorkspace } from '../../services/attorneyWorkflow/conveyancerGuaranteeWorkspace.js'
import {
  CONVEYANCER_INTEGRATION_CAPABILITIES as C,
  CONVEYANCER_INTEGRATION_CONNECTION_STATUSES,
  CONVEYANCER_INTEGRATION_DATA_CLASSIFICATIONS as D,
  CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES,
  buildConveyancerIntegrationAdapterManifest,
  buildConveyancerIntegrationOutboundCommand,
  validateConveyancerIntegrationAdapterManifest,
  validateConveyancerIntegrationConnection,
  validateConveyancerIntegrationInboundEvent,
  validateConveyancerIntegrationOutboundCommand,
} from './conveyancerIntegrationFramework.js'

export const CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION = 'conveyancer_bank_guarantee_integration_f6_v1'
export const BANK_INTEGRATION_LANES = Object.freeze({ bond: 'bond', cancellation: 'cancellation' })
export const BANK_INSTRUCTION_STATUSES = Object.freeze({ active: 'active', suspended: 'suspended', revoked: 'revoked' })
export const BANK_GUARANTEE_REQUEST_ACTIONS = Object.freeze({ issue: 'issue', replace: 'replace' })
export const BANK_GUARANTEE_OUTCOME_STATUSES = Object.freeze({ issued: 'issued', withdrawn: 'withdrawn', revoked: 'revoked', expired: 'expired' })
export const BANK_LODGEMENT_APPROVAL_STATUSES = Object.freeze({ approved: 'approved', revoked: 'revoked', expired: 'expired' })

const L = BANK_INTEGRATION_LANES
const IS = BANK_INSTRUCTION_STATUSES
const RA = BANK_GUARANTEE_REQUEST_ACTIONS
const GS = BANK_GUARANTEE_OUTCOME_STATUSES
const AS = BANK_LODGEMENT_APPROVAL_STATUSES
const LANES = Object.values(L)
const INSTRUCTION_STATUSES = Object.values(IS)
const REQUEST_ACTIONS = Object.values(RA)
const GUARANTEE_STATUSES = Object.values(GS)
const APPROVAL_STATUSES = Object.values(AS)

export const BANK_GUARANTEE_INTEGRATION_BOUNDARY = Object.freeze({
  attorneySelectedByPlatform: false,
  bankInstructionSynthesised: false,
  bankConditionSatisfiedByPlatform: false,
  cancellationFiguresCalculated: false,
  guaranteeIssuedByPlatform: false,
  guaranteeAcceptedAutomatically: false,
  outboundDispatchPerformed: false,
  paymentInitiated: false,
  settlementConfirmedByPlatform: false,
  coordinationMutated: false,
  guaranteeWorkspaceMutated: false,
  lodgementReadinessMutated: false,
  registrationUpdated: false,
  databaseWritePerformed: false,
})

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function enumValue(value, allowed) { const normalized = key(value); return allowed.includes(normalized) ? normalized : '' }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
function iso(value) { return validDate(value) ? new Date(value).toISOString() : value || null }
function hashValid(value) { return /^(sha256:)?[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {}) }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value) }
function fnv(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null, teamId: text(input.teamId || input.team_id) || null, lane: key(input.lane) || null, firmId: text(input.firmId || input.firm_id) || null } }
function laneRole(lane) { return lane === L.bond ? R.bondAttorney : R.cancellationAttorney }
function actorAllowed(inputActor, model, lane, firmId, { legalOnly = false, managerOnly = false } = {}) { const value = actor(inputActor); const binding = model.roleBindings?.[lane]; if (!value.userId || value.lane !== lane || value.firmId !== firmId || binding?.firmId !== firmId) return false; if (managerOnly) return value.role === R.firmManager; if (value.role === R.firmManager) return true; if (legalOnly) return value.role === laneRole(lane) || value.role === R.conveyancer; return value.role === laneRole(lane) || value.role === R.conveyancer || (value.role === R.secretary && value.teamId && value.teamId === binding.owner?.teamId) }
function matterBinding(model = {}) { return { modelId: text(model.modelId), modelFingerprint: text(model.fingerprint), planId: text(model.plan?.planId), planVersion: Number(model.plan?.planVersion || 0), transactionId: text(model.transactionId), organisationId: text(model.organisationId) } }
function bindingMatches(binding = {}, model = {}) { const expected = matterBinding(model); return Object.keys(expected).every((itemKey) => binding[itemKey] === expected[itemKey]) }
function boundaryValid(value = {}) { return Object.entries(BANK_GUARANTEE_INTEGRATION_BOUNDARY).every(([control, expected]) => value.controls?.[control] === expected) }
function snapshot(value = {}) { const { fingerprint: _fingerprint, ...rest } = value; return stable(rest) }
function instructionArtifactValid(value = {}, dependencyModel = {}, profile = {}) {
  const correctAmount = value.lane === L.bond
    ? Number.isSafeInteger(value.approvedAmountMinor) && value.approvedAmountMinor > 0 && value.currency === 'ZAR'
    : value.lane === L.cancellation && value.approvedAmountMinor === null
  return value.version === CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION && value.status === IS.active && value.lane === profile.lane && bindingMatches(value.matter || {}, dependencyModel) && value.profileId === profile.profileId && value.profileFingerprint === profile.fingerprint && value.bankReferenceHash === profile.bankReferenceHash && value.appointedFirmId === profile.firmId && Boolean(value.providerInstructionReferenceId) && hashValid(value.providerInstructionReferenceHash) && Boolean(value.appointmentReferenceId) && hashValid(value.appointmentEvidenceHash) && Boolean(value.propertyReferenceId) && hashValid(value.propertyReferenceHash) && Boolean(value.customerReferenceId) && hashValid(value.customerReferenceHash) && correctAmount && value.fingerprint === fnv(snapshot(value)) && boundaryValid(value)
}

export function buildBankGuaranteeAdapterManifest(input = {}) {
  return buildConveyancerIntegrationAdapterManifest({
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    providerKey: input.providerKey,
    category: CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES.banking,
    environments: input.environments,
    authenticationTypes: input.authenticationTypes,
    capabilities: [C.receiveBankInstruction, C.receiveBankConditions, C.receiveBankApproval, C.receiveCancellationFigures, C.receiveGuarantee, C.submitBankPack, C.requestBankGuarantee, C.manageBankGuarantee, C.requestCancellationFigures, C.submitRegistrationAdvice, C.receiveGuaranteeSettlement],
    inboundEvents: [
      { type: 'bank_instruction_received', capability: C.receiveBankInstruction, allowedLanes: LANES },
      { type: 'bank_conditions_received', capability: C.receiveBankConditions, allowedLanes: [L.bond] },
      { type: 'bank_cancellation_figures_received', capability: C.receiveCancellationFigures, allowedLanes: [L.cancellation] },
      { type: 'bank_guarantee_received', capability: C.receiveGuarantee, allowedLanes: [L.bond] },
      { type: 'bank_guarantee_status_received', capability: C.receiveGuarantee, allowedLanes: [L.bond] },
      { type: 'bank_approval_to_lodge_received', capability: C.receiveBankApproval, allowedLanes: [L.bond] },
      { type: 'bank_approval_to_lodge_status_received', capability: C.receiveBankApproval, allowedLanes: [L.bond] },
      { type: 'bank_guarantee_settlement_received', capability: C.receiveGuaranteeSettlement, allowedLanes: [L.bond, L.cancellation] },
    ],
    outboundCommands: [
      { type: 'bank_pack_submission_requested', capability: C.submitBankPack, allowedLanes: [L.bond] },
      { type: 'bank_guarantee_issue_requested', capability: C.requestBankGuarantee, allowedLanes: [L.bond] },
      { type: 'bank_guarantee_replacement_requested', capability: C.manageBankGuarantee, allowedLanes: [L.bond] },
      { type: 'bank_cancellation_figures_request_requested', capability: C.requestCancellationFigures, allowedLanes: [L.cancellation] },
      { type: 'bank_registration_advice_submission_requested', capability: C.submitRegistrationAdvice, allowedLanes: [L.bond, L.cancellation] },
    ],
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  })
}

export function validateBankIntegrationProfile(input = {}, { dependencyModel = {}, manifest = {}, connection = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const dv = validateConveyancerThreeRoleDependencyModel(dependencyModel); const mv = validateConveyancerIntegrationAdapterManifest(manifest); const cv = validateConveyancerIntegrationConnection(connection, { manifest })
  if (!dv.valid || !dependencyModel.requiredLanes?.includes(value.lane)) errors.push('bank_profile_dependency_model_invalid')
  if (!mv.valid || manifest.category !== CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES.banking) errors.push('bank_profile_adapter_invalid')
  if (!cv.valid || connection.status !== CONVEYANCER_INTEGRATION_CONNECTION_STATUSES.active || !connection.allowedLanes?.includes(value.lane)) errors.push('bank_profile_connection_not_active')
  if (value.version !== CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION || !value.profileId || !Number.isInteger(value.revision) || value.revision < 1 || !LANES.includes(value.lane)) errors.push('bank_profile_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.firmId !== dependencyModel.roleBindings?.[value.lane]?.firmId) errors.push('bank_profile_lane_firm_binding_invalid')
  if (value.connectionId !== connection.connectionId || value.connectionFingerprint !== connection.fingerprint || value.adapterId !== manifest.adapterId || value.adapterFingerprint !== manifest.fingerprint || value.organisationId !== dependencyModel.organisationId) errors.push('bank_profile_configuration_binding_invalid')
  if (!value.bankReferenceId || !hashValid(value.bankReferenceHash) || !value.portalRegistrationReferenceId || !hashValid(value.portalRegistrationHash) || !value.conveyancerPanelReferenceId || !hashValid(value.conveyancerPanelHash)) errors.push('bank_profile_references_invalid')
  if (!validDate(value.approvedAt) || !actorAllowed(value.approvedBy || {}, dependencyModel, value.lane, value.firmId, { managerOnly: true }) || !validDate(value.createdAt) || !value.createdBy) errors.push('bank_profile_governance_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('bank_profile_fingerprint_invalid')
  if (value.portalActivated || value.panelAppointmentPerformed || value.databaseWritePerformed) errors.push('bank_profile_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), profile: value })
}

export function buildBankIntegrationProfile(input = {}, { dependencyModel = {}, manifest = {}, connection = {} } = {}) {
  const lane = enumValue(input.lane, LANES); const value = { version: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION, profileId: text(input.profileId), revision: Number(input.revision || 1), lane, matter: matterBinding(dependencyModel), firmId: text(input.firmId), connectionId: text(connection.connectionId), connectionFingerprint: text(connection.fingerprint), adapterId: text(manifest.adapterId), adapterFingerprint: text(manifest.fingerprint), organisationId: text(dependencyModel.organisationId), bankReferenceId: text(input.bankReferenceId), bankReferenceHash: text(input.bankReferenceHash).toLowerCase(), portalRegistrationReferenceId: text(input.portalRegistrationReferenceId), portalRegistrationHash: text(input.portalRegistrationHash).toLowerCase(), conveyancerPanelReferenceId: text(input.conveyancerPanelReferenceId), conveyancerPanelHash: text(input.conveyancerPanelHash).toLowerCase(), approvedAt: iso(input.approvedAt), approvedBy: actor(input.approvedBy), createdAt: iso(input.createdAt), createdBy: text(input.createdBy), fingerprint: null, portalActivated: false, panelAppointmentPerformed: false, databaseWritePerformed: false }
  value.fingerprint = fnv(snapshot(value)); const validation = validateBankIntegrationProfile(value, { dependencyModel, manifest, connection }); return deepFreeze({ ok: validation.valid, code: validation.valid ? 'bank_integration_profile_valid' : 'bank_integration_profile_invalid', errors: validation.errors, profile: validation.profile })
}

export function validateBankMatterInstruction(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, inboundEvent = {}, previousInstruction = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const pv = validateBankIntegrationProfile(profile, { dependencyModel, manifest, connection }); const iv = validateConveyancerIntegrationInboundEvent(inboundEvent, { dependencyModel, manifest, connection })
  if (!pv.valid) errors.push('bank_instruction_profile_invalid')
  if (!iv.valid || inboundEvent.type !== 'bank_instruction_received' || inboundEvent.lane !== profile.lane || inboundEvent.firmId !== profile.firmId || value.sourceInboundEventId !== inboundEvent.recordId || value.sourceInboundEventFingerprint !== inboundEvent.fingerprint) errors.push('bank_instruction_inbound_evidence_invalid')
  if (value.version !== CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION || !value.instructionId || !Number.isInteger(value.revision) || value.revision < 1 || !INSTRUCTION_STATUSES.includes(value.status) || value.lane !== profile.lane || !validDate(value.occurredAt)) errors.push('bank_instruction_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.profileId !== profile.profileId || value.profileFingerprint !== profile.fingerprint || value.bankReferenceHash !== profile.bankReferenceHash || value.appointedFirmId !== profile.firmId) errors.push('bank_instruction_binding_invalid')
  if (!value.providerInstructionReferenceId || !hashValid(value.providerInstructionReferenceHash) || !value.appointmentReferenceId || !hashValid(value.appointmentEvidenceHash) || !value.propertyReferenceId || !hashValid(value.propertyReferenceHash) || !value.customerReferenceId || !hashValid(value.customerReferenceHash)) errors.push('bank_instruction_references_invalid')
  if (value.lane === L.bond && (!Number.isSafeInteger(value.approvedAmountMinor) || value.approvedAmountMinor <= 0 || value.currency !== 'ZAR')) errors.push('bank_instruction_bond_amount_invalid')
  if (value.lane === L.cancellation && value.approvedAmountMinor !== null) errors.push('bank_instruction_cancellation_amount_invalid')
  if (value.revision === 1 && (value.previousInstructionId || value.previousFingerprint || value.status !== IS.active)) errors.push('bank_instruction_initial_lineage_invalid')
  if (value.revision > 1 && (!previousInstruction || value.previousInstructionId !== previousInstruction.instructionId || value.previousFingerprint !== previousInstruction.fingerprint || previousInstruction.revision + 1 !== value.revision || previousInstruction.lane !== value.lane || previousInstruction.providerInstructionReferenceHash !== value.providerInstructionReferenceHash || new Date(value.occurredAt) < new Date(previousInstruction.occurredAt))) errors.push('bank_instruction_transition_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('bank_instruction_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('bank_instruction_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), instruction: value })
}

export function buildBankMatterInstruction(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, inboundEvent = {}, previousInstruction = null } = {}) {
  const lane = profile.lane; const value = { version: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION, instructionId: text(input.instructionId), revision: Number(input.revision || 1), previousInstructionId: previousInstruction ? text(previousInstruction.instructionId) : null, previousFingerprint: previousInstruction ? text(previousInstruction.fingerprint) : null, status: enumValue(input.status || IS.active, INSTRUCTION_STATUSES), lane, matter: matterBinding(dependencyModel), profileId: text(profile.profileId), profileFingerprint: text(profile.fingerprint), bankReferenceHash: text(profile.bankReferenceHash), appointedFirmId: text(profile.firmId), providerInstructionReferenceId: text(input.providerInstructionReferenceId), providerInstructionReferenceHash: text(input.providerInstructionReferenceHash).toLowerCase(), appointmentReferenceId: text(input.appointmentReferenceId), appointmentEvidenceHash: text(input.appointmentEvidenceHash).toLowerCase(), propertyReferenceId: text(input.propertyReferenceId), propertyReferenceHash: text(input.propertyReferenceHash).toLowerCase(), customerReferenceId: text(input.customerReferenceId), customerReferenceHash: text(input.customerReferenceHash).toLowerCase(), approvedAmountMinor: lane === L.bond ? Number(input.approvedAmountMinor) : null, currency: lane === L.bond ? text(input.currency || 'ZAR').toUpperCase() : null, occurredAt: iso(input.occurredAt || inboundEvent.occurredAt), sourceInboundEventId: text(inboundEvent.recordId), sourceInboundEventFingerprint: text(inboundEvent.fingerprint), controls: BANK_GUARANTEE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(snapshot(value)); const validation = validateBankMatterInstruction(value, { dependencyModel, manifest, connection, profile, inboundEvent, previousInstruction }); const errors = [...validation.errors]
  if (['customerName', 'identityNumber', 'accountNumber', 'propertyAddress', 'rawInstruction'].some((itemKey) => input[itemKey] !== undefined && input[itemKey] !== null)) errors.push('bank_instruction_inline_private_data_prohibited')
  return deepFreeze({ ok: errors.length === 0, code: errors.length ? 'bank_matter_instruction_invalid' : 'bank_matter_instruction_reconciled', errors: unique(errors), instruction: validation.instruction })
}

export function validateBankCancellationFigures(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, inboundEvent = {}, previousFigures = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const pv = validateBankIntegrationProfile(profile, { dependencyModel, manifest, connection }); const ev = validateConveyancerIntegrationInboundEvent(inboundEvent, { dependencyModel, manifest, connection })
  if (!pv.valid || !instructionArtifactValid(instruction, dependencyModel, profile) || instruction.lane !== L.cancellation) errors.push('bank_cancellation_figures_instruction_invalid')
  if (!ev.valid || inboundEvent.type !== 'bank_cancellation_figures_received' || value.sourceInboundEventId !== inboundEvent.recordId || value.sourceInboundEventFingerprint !== inboundEvent.fingerprint) errors.push('bank_cancellation_figures_inbound_evidence_invalid')
  if (value.version !== CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION || !value.figuresId || !Number.isInteger(value.revision) || value.revision < 1 || !validDate(value.issuedAt) || !validDate(value.expiresAt) || new Date(value.expiresAt) <= new Date(value.issuedAt) || new Date(value.issuedAt) > new Date(value.occurredAt)) errors.push('bank_cancellation_figures_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.instructionId !== instruction.instructionId || value.instructionFingerprint !== instruction.fingerprint || value.bankReferenceHash !== profile.bankReferenceHash || !value.providerFiguresReferenceId || !hashValid(value.providerFiguresReferenceHash)) errors.push('bank_cancellation_figures_binding_invalid')
  if (!Number.isSafeInteger(value.amountDueMinor) || value.amountDueMinor <= 0 || value.currency !== 'ZAR' || !hashValid(value.beneficiaryReferenceHash) || !hashValid(value.wordingHash) || !value.documentReferenceId || !hashValid(value.documentHash)) errors.push('bank_cancellation_figures_terms_invalid')
  if (value.revision === 1 && (value.previousFiguresId || value.previousFingerprint)) errors.push('bank_cancellation_figures_initial_lineage_invalid')
  if (value.revision > 1 && (!previousFigures || value.previousFiguresId !== previousFigures.figuresId || value.previousFingerprint !== previousFigures.fingerprint || previousFigures.revision + 1 !== value.revision || previousFigures.instructionId !== value.instructionId || new Date(value.issuedAt) <= new Date(previousFigures.issuedAt))) errors.push('bank_cancellation_figures_replacement_invalid')
  if (value.e4Requirement?.requirementId !== value.figuresId || value.e4Requirement?.requirementType !== 'cancellation_settlement' || value.e4Requirement?.ownerLane !== L.cancellation || value.e4Requirement?.amountMinor !== value.amountDueMinor || value.e4Requirement?.beneficiaryReferenceHash !== value.beneficiaryReferenceHash || value.e4Requirement?.wordingHash !== value.wordingHash || value.e4Requirement?.sourceReferenceId !== value.documentReferenceId || value.e4Requirement?.sourceEvidenceHash !== value.documentHash || value.e4Requirement?.effectiveAt !== value.issuedAt || value.e4Requirement?.expiresAt !== value.expiresAt) errors.push('bank_cancellation_figures_e4_projection_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('bank_cancellation_figures_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('bank_cancellation_figures_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), figures: value })
}

export function buildBankCancellationFigures(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, inboundEvent = {}, previousFigures = null } = {}) {
  const issuedAt = iso(input.issuedAt); const value = { version: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION, figuresId: text(input.figuresId), revision: Number(input.revision || 1), previousFiguresId: previousFigures ? text(previousFigures.figuresId) : null, previousFingerprint: previousFigures ? text(previousFigures.fingerprint) : null, matter: matterBinding(dependencyModel), instructionId: text(instruction.instructionId), instructionFingerprint: text(instruction.fingerprint), bankReferenceHash: text(profile.bankReferenceHash), providerFiguresReferenceId: text(input.providerFiguresReferenceId), providerFiguresReferenceHash: text(input.providerFiguresReferenceHash).toLowerCase(), amountDueMinor: Number(input.amountDueMinor), currency: text(input.currency || 'ZAR').toUpperCase(), beneficiaryReferenceHash: text(input.beneficiaryReferenceHash).toLowerCase(), wordingHash: text(input.wordingHash).toLowerCase(), documentReferenceId: text(input.documentReferenceId), documentHash: text(input.documentHash).toLowerCase(), issuedAt, expiresAt: iso(input.expiresAt), occurredAt: iso(input.occurredAt || inboundEvent.occurredAt), sourceInboundEventId: text(inboundEvent.recordId), sourceInboundEventFingerprint: text(inboundEvent.fingerprint), e4Requirement: null, controls: BANK_GUARANTEE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.e4Requirement = { requirementId: value.figuresId, requirementType: 'cancellation_settlement', status: 'current', ownerLane: L.cancellation, currency: value.currency, amountMinor: value.amountDueMinor, beneficiaryReferenceHash: value.beneficiaryReferenceHash, wordingHash: value.wordingHash, sourceReferenceId: value.documentReferenceId, sourceEvidenceHash: value.documentHash, effectiveAt: value.issuedAt, expiresAt: value.expiresAt, previousRequirementId: previousFigures?.figuresId || null }
  value.fingerprint = fnv(snapshot(value)); const validation = validateBankCancellationFigures(value, { dependencyModel, manifest, connection, profile, instruction, inboundEvent, previousFigures }); return deepFreeze({ ok: validation.valid, code: validation.valid ? 'bank_cancellation_figures_reconciled' : 'bank_cancellation_figures_invalid', errors: validation.errors, figures: validation.figures })
}

function requestCommandType(action) { return action === RA.replace ? 'bank_guarantee_replacement_requested' : 'bank_guarantee_issue_requested' }

export function validateBankGuaranteeRequest(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, guaranteeWorkspace = {}, previousGuarantee = null, outboundCommand = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const pv = validateBankIntegrationProfile(profile, { dependencyModel, manifest, connection }); const wv = validateConveyancerGuaranteeWorkspace(guaranteeWorkspace, { dependencyModel }); const cv = validateConveyancerIntegrationOutboundCommand(outboundCommand, { dependencyModel, manifest, connection })
  if (!pv.valid || profile.lane !== L.bond || !instructionArtifactValid(instruction, dependencyModel, profile) || instruction.lane !== L.bond) errors.push('bank_guarantee_request_instruction_invalid')
  if (!wv.valid || guaranteeWorkspace.viewer?.lane !== L.bond || guaranteeWorkspace.viewer?.firmId !== profile.firmId) errors.push('bank_guarantee_request_workspace_invalid')
  const requirement = guaranteeWorkspace.requirements?.find((item) => item.requirementId === value.requirementId)
  if (!requirement || requirement.status !== 'current' || requirement.remainingMinor <= 0 || value.workspaceId !== guaranteeWorkspace.workspaceId || value.workspaceFingerprint !== guaranteeWorkspace.fingerprint || value.amountMinor !== requirement.remainingMinor || value.currency !== requirement.currency || value.beneficiaryReferenceHash !== requirement.beneficiaryReferenceHash || value.wordingHash !== requirement.wordingHash) errors.push('bank_guarantee_request_requirement_invalid')
  if (value.version !== CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION || !value.requestId || !REQUEST_ACTIONS.includes(value.action) || !['prepared', 'duplicate'].includes(value.status)) errors.push('bank_guarantee_request_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.instructionId !== instruction.instructionId || value.instructionFingerprint !== instruction.fingerprint || value.outboundCommandId !== outboundCommand.recordId || value.outboundCommandFingerprint !== outboundCommand.fingerprint) errors.push('bank_guarantee_request_binding_invalid')
  if (!cv.valid || outboundCommand.type !== requestCommandType(value.action)) errors.push('bank_guarantee_request_outbound_invalid')
  if (!value.payloadReferenceId || !hashValid(value.payloadHash) || !validDate(value.preparedAt) || !actorAllowed(value.preparedBy || {}, dependencyModel, L.bond, profile.firmId) || !validDate(value.approvedAt) || new Date(value.approvedAt) < new Date(value.preparedAt) || !actorAllowed(value.approvedBy || {}, dependencyModel, L.bond, profile.firmId, { legalOnly: true }) || value.approvedBy?.userId === value.preparedBy?.userId || !value.approvalReferenceId) errors.push('bank_guarantee_request_independent_approval_invalid')
  if (value.action === RA.issue && (value.previousGuaranteeId || value.previousGuaranteeFingerprint || value.changeReason)) errors.push('bank_guarantee_request_initial_lineage_invalid')
  if (value.action === RA.replace && (!previousGuarantee || value.previousGuaranteeId !== previousGuarantee.guaranteeId || value.previousGuaranteeFingerprint !== previousGuarantee.fingerprint || previousGuarantee.status !== GS.issued || previousGuarantee.instructionId !== instruction.instructionId || !value.changeReason)) errors.push('bank_guarantee_request_replacement_lineage_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('bank_guarantee_request_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('bank_guarantee_request_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), request: value })
}

export function buildBankGuaranteeRequest(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, guaranteeWorkspace = {}, previousGuarantee = null, existingCommands = [] } = {}) {
  const action = enumValue(input.action || RA.issue, REQUEST_ACTIONS); const requirement = guaranteeWorkspace.requirements?.find((item) => item.requirementId === text(input.requirementId)); const preparedBy = actor(input.preparedBy)
  const commandResult = buildConveyancerIntegrationOutboundCommand({ recordId: input.commandId, type: requestCommandType(action), lane: L.bond, firmId: profile.firmId, idempotencyKey: input.idempotencyKey, payloadReferenceId: input.payloadReferenceId, payloadHash: input.payloadHash, dataPolicy: { purpose: text(input.purpose || 'Request bank issuance or replacement of the independently approved guarantee.'), legalBasis: connection.dataPolicy?.legalBasis, consentReferenceId: connection.dataPolicy?.consentReferenceId, classifications: [D.professionalConfidential, D.personal, D.financial, D.legallyPrivileged], retentionDays: Math.min(Number(input.retentionDays || connection.dataPolicy?.retentionDays || 0), Number(connection.dataPolicy?.retentionDays || 0)) }, requestedAt: input.preparedAt, requestedBy: preparedBy, authorityReferenceId: input.approvalReferenceId }, { dependencyModel, manifest, connection, existingCommands })
  const command = commandResult.command; const errors = commandResult.ok ? [] : commandResult.errors.map((item) => `bank_guarantee_request_outbound:${item}`)
  const value = { version: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION, requestId: text(input.requestId), action, status: command?.status === 'duplicate' ? 'duplicate' : 'prepared', matter: matterBinding(dependencyModel), instructionId: text(instruction.instructionId), instructionFingerprint: text(instruction.fingerprint), workspaceId: text(guaranteeWorkspace.workspaceId), workspaceFingerprint: text(guaranteeWorkspace.fingerprint), requirementId: text(input.requirementId), amountMinor: Number(requirement?.remainingMinor), currency: text(requirement?.currency), beneficiaryReferenceHash: text(requirement?.beneficiaryReferenceHash), wordingHash: text(requirement?.wordingHash), previousGuaranteeId: previousGuarantee ? text(previousGuarantee.guaranteeId) : null, previousGuaranteeFingerprint: previousGuarantee ? text(previousGuarantee.fingerprint) : null, changeReason: previousGuarantee ? text(input.changeReason) : null, payloadReferenceId: text(input.payloadReferenceId), payloadHash: text(input.payloadHash).toLowerCase(), preparedAt: iso(input.preparedAt), preparedBy, approvedAt: iso(input.approvedAt), approvedBy: actor(input.approvedBy), approvalReferenceId: text(input.approvalReferenceId), outboundCommandId: command?.recordId || null, outboundCommandFingerprint: command?.fingerprint || null, controls: BANK_GUARANTEE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(snapshot(value)); const validation = errors.length ? { valid: false, errors } : validateBankGuaranteeRequest(value, { dependencyModel, manifest, connection, profile, instruction, guaranteeWorkspace, previousGuarantee, outboundCommand: command }); return deepFreeze({ ok: validation.valid, code: validation.valid ? `bank_guarantee_request_${value.status}` : 'bank_guarantee_request_blocked', errors: unique(validation.errors), request: value, outboundCommand: command })
}

export function validateBankGuaranteeOutcome(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, request = {}, inboundEvent = {}, previousGuarantee = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const pv = validateBankIntegrationProfile(profile, { dependencyModel, manifest, connection }); const iv = validateConveyancerIntegrationInboundEvent(inboundEvent, { dependencyModel, manifest, connection }); const expectedEvent = value.status === GS.issued ? 'bank_guarantee_received' : 'bank_guarantee_status_received'
  if (!iv.valid || inboundEvent.type !== expectedEvent || inboundEvent.lane !== L.bond || value.sourceInboundEventId !== inboundEvent.recordId || value.sourceInboundEventFingerprint !== inboundEvent.fingerprint) errors.push('bank_guarantee_outcome_inbound_evidence_invalid')
  if (value.version !== CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION || !value.guaranteeId || !Number.isInteger(value.revision) || value.revision < 1 || !GUARANTEE_STATUSES.includes(value.status) || !validDate(value.occurredAt)) errors.push('bank_guarantee_outcome_identity_invalid')
  if (!pv.valid || !instructionArtifactValid(instruction, dependencyModel, profile) || !bindingMatches(value.matter || {}, dependencyModel) || profile.lane !== L.bond || instruction.lane !== L.bond || value.instructionId !== instruction.instructionId || value.instructionFingerprint !== instruction.fingerprint || value.requestId !== request.requestId || value.requestFingerprint !== request.fingerprint || !value.providerGuaranteeReferenceId || !hashValid(value.providerGuaranteeReferenceHash)) errors.push('bank_guarantee_outcome_binding_invalid')
  if (value.revision === 1 && (value.previousGuaranteeId || value.previousFingerprint || value.status !== GS.issued)) errors.push('bank_guarantee_outcome_initial_lineage_invalid')
  if (value.revision > 1 && (!previousGuarantee || previousGuarantee.status !== GS.issued || (value.status === GS.issued && request.action !== RA.replace) || value.previousGuaranteeId !== previousGuarantee.guaranteeId || value.previousFingerprint !== previousGuarantee.fingerprint || previousGuarantee.revision + 1 !== value.revision || previousGuarantee.instructionId !== value.instructionId || new Date(value.occurredAt) < new Date(previousGuarantee.occurredAt))) errors.push('bank_guarantee_outcome_transition_invalid')
  if (value.status === GS.issued && (!Number.isSafeInteger(value.amountMinor) || value.amountMinor !== request.amountMinor || value.currency !== 'ZAR' || value.beneficiaryReferenceHash !== request.beneficiaryReferenceHash || value.wordingHash !== request.wordingHash || !value.documentReferenceId || !hashValid(value.documentHash) || !validDate(value.issuedAt) || !validDate(value.expiresAt) || new Date(value.expiresAt) <= new Date(value.issuedAt) || new Date(value.issuedAt) > new Date(value.occurredAt))) errors.push('bank_guarantee_outcome_terms_invalid')
  if (value.status !== GS.issued && (!previousGuarantee || value.documentReferenceId !== previousGuarantee.documentReferenceId || value.documentHash !== previousGuarantee.documentHash || value.amountMinor !== previousGuarantee.amountMinor)) errors.push('bank_guarantee_outcome_historical_evidence_invalid')
  if (value.reviewEligible !== (value.status === GS.issued && new Date(value.expiresAt) > new Date(value.occurredAt))) errors.push('bank_guarantee_outcome_review_eligibility_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('bank_guarantee_outcome_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('bank_guarantee_outcome_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), guarantee: value })
}

export function buildBankGuaranteeOutcome(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, request = {}, inboundEvent = {}, previousGuarantee = null } = {}) {
  const status = enumValue(input.status, GUARANTEE_STATUSES); const historical = status === GS.issued ? null : previousGuarantee
  const value = { version: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION, guaranteeId: text(input.guaranteeId), revision: Number(input.revision || 1), previousGuaranteeId: previousGuarantee ? text(previousGuarantee.guaranteeId) : null, previousFingerprint: previousGuarantee ? text(previousGuarantee.fingerprint) : null, status, matter: matterBinding(dependencyModel), instructionId: text(instruction.instructionId), instructionFingerprint: text(instruction.fingerprint), requestId: text(request.requestId), requestFingerprint: text(request.fingerprint), providerGuaranteeReferenceId: text(historical?.providerGuaranteeReferenceId || input.providerGuaranteeReferenceId), providerGuaranteeReferenceHash: text(historical?.providerGuaranteeReferenceHash || input.providerGuaranteeReferenceHash).toLowerCase(), amountMinor: Number(historical?.amountMinor ?? input.amountMinor), currency: text(historical?.currency || input.currency || 'ZAR').toUpperCase(), beneficiaryReferenceHash: text(historical?.beneficiaryReferenceHash || input.beneficiaryReferenceHash), wordingHash: text(historical?.wordingHash || input.wordingHash), documentReferenceId: text(historical?.documentReferenceId || input.documentReferenceId), documentHash: text(historical?.documentHash || input.documentHash).toLowerCase(), issuedAt: iso(historical?.issuedAt || input.issuedAt), expiresAt: iso(historical?.expiresAt || input.expiresAt), occurredAt: iso(input.occurredAt || inboundEvent.occurredAt), sourceInboundEventId: text(inboundEvent.recordId), sourceInboundEventFingerprint: text(inboundEvent.fingerprint), reviewEligible: false, controls: BANK_GUARANTEE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.reviewEligible = status === GS.issued && validDate(value.expiresAt) && new Date(value.expiresAt) > new Date(value.occurredAt); value.fingerprint = fnv(snapshot(value)); const validation = validateBankGuaranteeOutcome(value, { dependencyModel, manifest, connection, profile, instruction, request, inboundEvent, previousGuarantee }); return deepFreeze({ ok: validation.valid, code: validation.valid ? `bank_guarantee_outcome_${status}` : 'bank_guarantee_outcome_invalid', errors: validation.errors, guarantee: validation.guarantee })
}

export function validateBankGuaranteeEvidence(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, request = {}, guarantee = {}, inboundEvent = {}, previousGuarantee = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const gv = validateBankGuaranteeOutcome(guarantee, { dependencyModel, manifest, connection, profile, instruction, request, inboundEvent, previousGuarantee })
  if (!gv.valid || !guarantee.reviewEligible) errors.push('bank_guarantee_evidence_eligible_outcome_required')
  if (value.version !== CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION || !value.evidenceId || value.status !== 'approved_for_e4') errors.push('bank_guarantee_evidence_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.guaranteeId !== guarantee.guaranteeId || value.guaranteeFingerprint !== guarantee.fingerprint) errors.push('bank_guarantee_evidence_binding_invalid')
  if (!validDate(value.reviewedAt) || new Date(value.reviewedAt) < new Date(guarantee.occurredAt) || !actorAllowed(value.reviewedBy || {}, dependencyModel, L.bond, profile.firmId, { legalOnly: true }) || !value.reviewReferenceId) errors.push('bank_guarantee_evidence_legal_review_invalid')
  const instrument = value.instrument || {}; if (instrument.instrumentId !== guarantee.guaranteeId || instrument.instrumentType !== 'bank_guarantee' || instrument.status !== 'current' || instrument.issuerLane !== L.bond || instrument.issuerFirmId !== profile.firmId || instrument.currency !== guarantee.currency || instrument.amountMinor !== guarantee.amountMinor || instrument.beneficiaryReferenceHash !== guarantee.beneficiaryReferenceHash || instrument.wordingHash !== guarantee.wordingHash || instrument.documentReferenceId !== guarantee.documentReferenceId || instrument.documentHash !== guarantee.documentHash || instrument.issuedAt !== guarantee.issuedAt || instrument.expiresAt !== guarantee.expiresAt) errors.push('bank_guarantee_evidence_e4_projection_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('bank_guarantee_evidence_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('bank_guarantee_evidence_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), evidence: value })
}

export function buildBankGuaranteeEvidence(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, request = {}, guarantee = {}, inboundEvent = {}, previousGuarantee = null } = {}) {
  const value = { version: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION, evidenceId: text(input.evidenceId), status: 'approved_for_e4', matter: matterBinding(dependencyModel), guaranteeId: text(guarantee.guaranteeId), guaranteeFingerprint: text(guarantee.fingerprint), instrument: { instrumentId: text(guarantee.guaranteeId), instrumentType: 'bank_guarantee', status: 'current', issuerLane: L.bond, issuerFirmId: text(profile.firmId), currency: text(guarantee.currency), amountMinor: Number(guarantee.amountMinor), beneficiaryReferenceHash: text(guarantee.beneficiaryReferenceHash), wordingHash: text(guarantee.wordingHash), documentReferenceId: text(guarantee.documentReferenceId), documentHash: text(guarantee.documentHash), issuedAt: iso(guarantee.issuedAt), expiresAt: iso(guarantee.expiresAt), previousInstrumentId: previousGuarantee?.guaranteeId || null }, reviewedAt: iso(input.reviewedAt), reviewedBy: actor(input.reviewedBy), reviewReferenceId: text(input.reviewReferenceId), controls: BANK_GUARANTEE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(snapshot(value)); const validation = validateBankGuaranteeEvidence(value, { dependencyModel, manifest, connection, profile, instruction, request, guarantee, inboundEvent, previousGuarantee }); return deepFreeze({ ok: validation.valid, code: validation.valid ? 'bank_guarantee_evidence_approved' : 'bank_guarantee_evidence_invalid', errors: validation.errors, evidence: validation.evidence })
}

export function validateBankLodgementApproval(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, inboundEvent = {}, previousApproval = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const pv = validateBankIntegrationProfile(profile, { dependencyModel, manifest, connection }); const iv = validateConveyancerIntegrationInboundEvent(inboundEvent, { dependencyModel, manifest, connection }); const expectedEvent = value.status === AS.approved ? 'bank_approval_to_lodge_received' : 'bank_approval_to_lodge_status_received'
  if (!iv.valid || inboundEvent.type !== expectedEvent || inboundEvent.lane !== L.bond || value.sourceInboundEventId !== inboundEvent.recordId || value.sourceInboundEventFingerprint !== inboundEvent.fingerprint) errors.push('bank_lodgement_approval_inbound_evidence_invalid')
  if (!pv.valid || profile.lane !== L.bond || !instructionArtifactValid(instruction, dependencyModel, profile) || instruction.lane !== L.bond || value.instructionId !== instruction.instructionId || value.instructionFingerprint !== instruction.fingerprint) errors.push('bank_lodgement_approval_instruction_invalid')
  if (value.version !== CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION || !value.approvalId || !Number.isInteger(value.revision) || value.revision < 1 || !APPROVAL_STATUSES.includes(value.status) || !validDate(value.occurredAt)) errors.push('bank_lodgement_approval_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || !value.providerApprovalReferenceId || !hashValid(value.providerApprovalReferenceHash)) errors.push('bank_lodgement_approval_binding_invalid')
  if (value.revision === 1 && (value.previousApprovalId || value.previousFingerprint || value.status !== AS.approved)) errors.push('bank_lodgement_approval_initial_lineage_invalid')
  if (value.revision > 1 && (!previousApproval || value.previousApprovalId !== previousApproval.approvalId || value.previousFingerprint !== previousApproval.fingerprint || previousApproval.revision + 1 !== value.revision || previousApproval.instructionId !== value.instructionId || new Date(value.occurredAt) < new Date(previousApproval.occurredAt))) errors.push('bank_lodgement_approval_transition_invalid')
  if (value.status === AS.approved && (!value.documentReferenceId || !hashValid(value.documentHash) || !validDate(value.approvedAt) || !validDate(value.validUntil) || new Date(value.validUntil) <= new Date(value.approvedAt) || new Date(value.approvedAt) > new Date(value.occurredAt) || !value.conditionsEvidenceReferenceId || !hashValid(value.conditionsEvidenceHash))) errors.push('bank_lodgement_approval_terms_invalid')
  if (value.status !== AS.approved && (!previousApproval || value.documentReferenceId !== previousApproval.documentReferenceId || value.documentHash !== previousApproval.documentHash)) errors.push('bank_lodgement_approval_historical_evidence_invalid')
  if (value.reviewEligible !== (value.status === AS.approved && new Date(value.validUntil) > new Date(value.occurredAt))) errors.push('bank_lodgement_approval_review_eligibility_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('bank_lodgement_approval_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('bank_lodgement_approval_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), approval: value })
}

export function buildBankLodgementApproval(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, inboundEvent = {}, previousApproval = null } = {}) {
  const status = enumValue(input.status, APPROVAL_STATUSES); const historical = status === AS.approved ? null : previousApproval; const value = { version: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION, approvalId: text(input.approvalId), revision: Number(input.revision || 1), previousApprovalId: previousApproval ? text(previousApproval.approvalId) : null, previousFingerprint: previousApproval ? text(previousApproval.fingerprint) : null, status, matter: matterBinding(dependencyModel), instructionId: text(instruction.instructionId), instructionFingerprint: text(instruction.fingerprint), providerApprovalReferenceId: text(input.providerApprovalReferenceId || historical?.providerApprovalReferenceId), providerApprovalReferenceHash: text(input.providerApprovalReferenceHash || historical?.providerApprovalReferenceHash).toLowerCase(), documentReferenceId: text(input.documentReferenceId || historical?.documentReferenceId), documentHash: text(input.documentHash || historical?.documentHash).toLowerCase(), conditionsEvidenceReferenceId: text(input.conditionsEvidenceReferenceId || historical?.conditionsEvidenceReferenceId), conditionsEvidenceHash: text(input.conditionsEvidenceHash || historical?.conditionsEvidenceHash).toLowerCase(), approvedAt: iso(input.approvedAt || historical?.approvedAt), validUntil: iso(input.validUntil || historical?.validUntil), occurredAt: iso(input.occurredAt || inboundEvent.occurredAt), sourceInboundEventId: text(inboundEvent.recordId), sourceInboundEventFingerprint: text(inboundEvent.fingerprint), reviewEligible: false, controls: BANK_GUARANTEE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.reviewEligible = status === AS.approved && validDate(value.validUntil) && new Date(value.validUntil) > new Date(value.occurredAt); value.fingerprint = fnv(snapshot(value)); const validation = validateBankLodgementApproval(value, { dependencyModel, manifest, connection, profile, instruction, inboundEvent, previousApproval }); return deepFreeze({ ok: validation.valid, code: validation.valid ? `bank_lodgement_approval_${status}` : 'bank_lodgement_approval_invalid', errors: validation.errors, approval: validation.approval })
}

export function validateBankLodgementApprovalEvidence(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, approval = {}, inboundEvent = {}, previousApproval = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const av = validateBankLodgementApproval(approval, { dependencyModel, manifest, connection, profile, instruction, inboundEvent, previousApproval })
  if (!av.valid || !approval.reviewEligible) errors.push('bank_lodgement_evidence_eligible_approval_required')
  if (value.version !== CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION || !value.evidenceId || value.status !== 'approved_for_lodgement_evidence' || value.checkKey !== 'bank_approval_to_lodge') errors.push('bank_lodgement_evidence_identity_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.approvalId !== approval.approvalId || value.approvalFingerprint !== approval.fingerprint || value.documentReferenceId !== approval.documentReferenceId || value.documentHash !== approval.documentHash || value.validUntil !== approval.validUntil) errors.push('bank_lodgement_evidence_binding_invalid')
  if (!validDate(value.reviewedAt) || new Date(value.reviewedAt) < new Date(approval.occurredAt) || !actorAllowed(value.reviewedBy || {}, dependencyModel, L.bond, profile.firmId, { legalOnly: true }) || !value.reviewReferenceId) errors.push('bank_lodgement_evidence_legal_review_invalid')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('bank_lodgement_evidence_fingerprint_invalid')
  if (!boundaryValid(value)) errors.push('bank_lodgement_evidence_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), evidence: value })
}

export function buildBankLodgementApprovalEvidence(input = {}, { dependencyModel = {}, manifest = {}, connection = {}, profile = {}, instruction = {}, approval = {}, inboundEvent = {}, previousApproval = null } = {}) {
  const value = { version: CONVEYANCER_BANK_GUARANTEE_INTEGRATION_VERSION, evidenceId: text(input.evidenceId), status: 'approved_for_lodgement_evidence', checkKey: 'bank_approval_to_lodge', matter: matterBinding(dependencyModel), approvalId: text(approval.approvalId), approvalFingerprint: text(approval.fingerprint), documentReferenceId: text(approval.documentReferenceId), documentHash: text(approval.documentHash), validUntil: iso(approval.validUntil), reviewedAt: iso(input.reviewedAt), reviewedBy: actor(input.reviewedBy), reviewReferenceId: text(input.reviewReferenceId), controls: BANK_GUARANTEE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(snapshot(value)); const validation = validateBankLodgementApprovalEvidence(value, { dependencyModel, manifest, connection, profile, instruction, approval, inboundEvent, previousApproval }); return deepFreeze({ ok: validation.valid, code: validation.valid ? 'bank_lodgement_approval_evidence_approved' : 'bank_lodgement_approval_evidence_invalid', errors: validation.errors, evidence: validation.evidence })
}
