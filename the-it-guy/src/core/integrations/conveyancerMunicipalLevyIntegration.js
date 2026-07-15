import { MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from '../transactions/conveyancerMatterPlanContract.js'
import { validateConveyancerThreeRoleDependencyModel } from '../transactions/conveyancerThreeRoleDependencyModel.js'
import {
  CONVEYANCER_FINANCIAL_LINE_STATUSES,
  CONVEYANCER_FINANCIAL_LINE_TYPES,
  CONVEYANCER_FINANCIAL_MODEL_STATUSES,
  validateConveyancerFinancialModel,
} from '../transactions/conveyancerFinancialModel.js'
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

export const CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION = 'conveyancer_municipal_levy_integration_f5_v1'
export const PROPERTY_CLEARANCE_TYPES = Object.freeze({ municipal: 'municipal', sectionalLevy: 'sectional_levy', hoaLevy: 'hoa_levy' })
export const PROPERTY_CLEARANCE_PROVIDER_TYPES = Object.freeze({ municipality: 'municipality', bodyCorporate: 'body_corporate', managingAgent: 'managing_agent', homeownersAssociation: 'homeowners_association' })
export const PROPERTY_CLEARANCE_COMMAND_ACTIONS = Object.freeze({ figuresRequest: 'figures_request', paymentEvidenceSubmission: 'payment_evidence_submission' })
export const PROPERTY_CLEARANCE_OUTCOME_STATUSES = Object.freeze({ figuresIssued: 'figures_issued', paymentEvidenceAcknowledged: 'payment_evidence_acknowledged', certificateIssued: 'certificate_issued', rejected: 'rejected', expired: 'expired', revoked: 'revoked' })
export const PROPERTY_CLEARANCE_SETTLEMENT_BASES = Object.freeze({ paid: 'paid', provisionAccepted: 'provision_accepted', noMoneyDue: 'no_money_due' })
export const PROPERTY_CLEARANCE_CERTIFICATE_STATES = Object.freeze({ none: 'none', available: 'available', expired: 'expired', revoked: 'revoked' })
export const PROPERTY_CLEARANCE_FINANCIAL_RECONCILIATION = Object.freeze({ matched: 'matched', variance: 'variance', noApprovedExpectation: 'no_approved_expectation' })

const CT = PROPERTY_CLEARANCE_TYPES
const PT = PROPERTY_CLEARANCE_PROVIDER_TYPES
const CA = PROPERTY_CLEARANCE_COMMAND_ACTIONS
const OS = PROPERTY_CLEARANCE_OUTCOME_STATUSES
const SB = PROPERTY_CLEARANCE_SETTLEMENT_BASES
const CS = PROPERTY_CLEARANCE_CERTIFICATE_STATES
const FR = PROPERTY_CLEARANCE_FINANCIAL_RECONCILIATION
const CLEARANCE_TYPES = Object.values(CT)
const PROVIDER_TYPES = Object.values(PT)
const COMMAND_ACTIONS = Object.values(CA)
const OUTCOME_STATUSES = Object.values(OS)
const SETTLEMENT_BASES = Object.values(SB)
const CERTIFICATE_STATES = Object.values(CS)

export const PROPERTY_CLEARANCE_INTEGRATION_BOUNDARY = Object.freeze({
  figuresCalculatedByPlatform: false,
  providerRequestDispatched: false,
  paymentInitiated: false,
  paymentConfirmedByPlatform: false,
  paymentEvidenceUploaded: false,
  certificateSynthesised: false,
  conveyancerCertificateIssued: false,
  financialModelMutated: false,
  workflowMutated: false,
  lodgementReadinessMutated: false,
  registrationUpdated: false,
  databaseWritePerformed: false,
})

export const PROPERTY_CLEARANCE_OUTCOME_TRANSITIONS = Object.freeze({
  [OS.figuresIssued]: Object.freeze([OS.paymentEvidenceAcknowledged, OS.certificateIssued, OS.rejected, OS.expired, OS.revoked]),
  [OS.paymentEvidenceAcknowledged]: Object.freeze([OS.certificateIssued, OS.rejected, OS.expired, OS.revoked]),
  [OS.certificateIssued]: Object.freeze([OS.expired, OS.revoked]),
  [OS.rejected]: Object.freeze([]),
  [OS.expired]: Object.freeze([]),
  [OS.revoked]: Object.freeze([]),
})

const OUTCOME_EVENT_TYPES = Object.freeze({
  [OS.figuresIssued]: 'property_clearance_figures_received',
  [OS.paymentEvidenceAcknowledged]: 'property_clearance_payment_evidence_acknowledged',
  [OS.certificateIssued]: 'property_clearance_certificate_received',
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
function actorAllowed(inputActor, model, firmId, { legalOnly = false, managerOnly = false } = {}) { const value = actor(inputActor); const binding = model.roleBindings?.transfer; if (!value.userId || value.lane !== 'transfer' || value.firmId !== firmId || binding?.firmId !== firmId) return false; if (managerOnly) return value.role === R.firmManager; if (value.role === R.firmManager) return true; if (legalOnly) return [R.conveyancer, R.transferAttorney].includes(value.role); return [R.conveyancer, R.transferAttorney].includes(value.role) || (value.role === R.secretary && value.teamId && value.teamId === binding.owner?.teamId) }
function matterBinding(model = {}) { return { modelId: text(model.modelId), modelFingerprint: text(model.fingerprint), planId: text(model.plan?.planId), planVersion: Number(model.plan?.planVersion || 0), transactionId: text(model.transactionId), organisationId: text(model.organisationId) } }
function bindingMatches(binding = {}, model = {}) { const expected = matterBinding(model); return Object.keys(expected).every((itemKey) => binding[itemKey] === expected[itemKey]) }
function financialBinding(model = {}) { return { financialModelId: text(model.financialModelId), financialModelRevision: Number(model.revision || 0), financialModelFingerprint: text(model.fingerprint), transactionId: text(model.transactionId), organisationId: text(model.organisationId), planId: text(model.planId), planVersion: Number(model.planVersion || 0), lane: text(model.lane), currency: text(model.currency) } }
function providerCategory(clearanceType) { return clearanceType === CT.municipal ? CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES.municipalAuthority : CONVEYANCER_INTEGRATION_PROVIDER_CATEGORIES.communityScheme }
function providerAllowed(clearanceType, providerType) { if (clearanceType === CT.municipal) return providerType === PT.municipality; if (clearanceType === CT.sectionalLevy) return [PT.bodyCorporate, PT.managingAgent].includes(providerType); return [PT.homeownersAssociation, PT.managingAgent].includes(providerType) }
function tenureAllowed(clearanceType, model) { const tenure = key(model.sourceFacts?.propertyTenure); if (clearanceType === CT.sectionalLevy) return /sectional/.test(tenure); if (clearanceType === CT.hoaLevy) return /(hoa|estate|homeowners)/.test(tenure); return true }
function expectedLineType(clearanceType) { if (clearanceType === CT.municipal) return CONVEYANCER_FINANCIAL_LINE_TYPES.ratesClearance; if (clearanceType === CT.sectionalLevy) return CONVEYANCER_FINANCIAL_LINE_TYPES.levyClearance; return CONVEYANCER_FINANCIAL_LINE_TYPES.homeownersAssociation }
function expectedAmount(financialModel, clearanceType) { const lines = (financialModel.lines || []).filter((item) => item.lineType === expectedLineType(clearanceType) && ![CONVEYANCER_FINANCIAL_LINE_STATUSES.estimated, CONVEYANCER_FINANCIAL_LINE_STATUSES.quoted].includes(item.status)); return lines.length ? lines.reduce((sum, item) => sum + Number(item.amountMinor || 0), 0) : null }
function reconciliation(expected, actual) { if (expected === null) return { status: FR.noApprovedExpectation, expectedAmountMinor: null, varianceMinor: null }; const varianceMinor = actual - expected; return { status: varianceMinor === 0 ? FR.matched : FR.variance, expectedAmountMinor: expected, varianceMinor } }
function integrationBoundaryValid(value = {}) { return Object.entries(PROPERTY_CLEARANCE_INTEGRATION_BOUNDARY).every(([control, expected]) => value.controls?.[control] === expected) }
function profileSnapshot(value = {}) { const { fingerprint: _fingerprint, ...snapshot } = value; return stable(snapshot) }
function requestSnapshot(value = {}) { const { fingerprint: _fingerprint, ...snapshot } = value; return stable(snapshot) }
function packetSnapshot(value = {}) { const { fingerprint: _fingerprint, ...snapshot } = value; return stable(snapshot) }
function outcomeSnapshot(value = {}) { const { fingerprint: _fingerprint, ...snapshot } = value; return stable(snapshot) }
function evidenceSnapshot(value = {}) { const { fingerprint: _fingerprint, ...snapshot } = value; return stable(snapshot) }

export function buildPropertyClearanceAdapterManifest(input = {}) {
  const clearanceType = enumValue(input.clearanceType, CLEARANCE_TYPES)
  return buildConveyancerIntegrationAdapterManifest({
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    providerKey: input.providerKey,
    category: providerCategory(clearanceType),
    environments: input.environments,
    authenticationTypes: input.authenticationTypes,
    capabilities: [C.receivePropertyClearanceOutcome, C.requestPropertyClearanceFigures, C.submitPropertyClearancePaymentEvidence, C.managePropertyClearanceRequest],
    inboundEvents: [
      { type: 'property_clearance_figures_received', capability: C.receivePropertyClearanceOutcome, allowedLanes: ['transfer'] },
      { type: 'property_clearance_payment_evidence_acknowledged', capability: C.receivePropertyClearanceOutcome, allowedLanes: ['transfer'] },
      { type: 'property_clearance_certificate_received', capability: C.receivePropertyClearanceOutcome, allowedLanes: ['transfer'] },
      { type: 'property_clearance_status_received', capability: C.receivePropertyClearanceOutcome, allowedLanes: ['transfer'] },
    ],
    outboundCommands: [
      { type: 'property_clearance_figures_request_requested', capability: C.requestPropertyClearanceFigures, allowedLanes: ['transfer'] },
      { type: 'property_clearance_payment_evidence_submission_requested', capability: C.submitPropertyClearancePaymentEvidence, allowedLanes: ['transfer'] },
      { type: 'property_clearance_cancellation_requested', capability: C.managePropertyClearanceRequest, allowedLanes: ['transfer'] },
    ],
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  })
}

export function validatePropertyClearanceProfile(input = {}, { manifest = {}, connection = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  const mv = validateConveyancerIntegrationAdapterManifest(manifest); const cv = validateConveyancerIntegrationConnection(connection, { manifest })
  if (!mv.valid || manifest.category !== providerCategory(value.clearanceType)) errors.push('property_clearance_adapter_invalid')
  if (!cv.valid || connection.status !== CONVEYANCER_INTEGRATION_CONNECTION_STATUSES.active || !connection.allowedLanes?.includes('transfer')) errors.push('property_clearance_connection_not_active')
  if (value.version !== CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION || !value.profileId || !Number.isInteger(value.revision) || value.revision < 1 || !CLEARANCE_TYPES.includes(value.clearanceType) || !PROVIDER_TYPES.includes(value.providerType) || !providerAllowed(value.clearanceType, value.providerType)) errors.push('property_clearance_profile_identity_invalid')
  if (value.connectionId !== connection.connectionId || value.connectionFingerprint !== connection.fingerprint || value.adapterId !== manifest.adapterId || value.adapterFingerprint !== manifest.fingerprint || value.organisationId !== connection.organisationId || value.environment !== connection.environment) errors.push('property_clearance_profile_connection_binding_invalid')
  if (!value.firmId || !value.providerReferenceId || !hashValid(value.providerReferenceHash) || !value.accountNamespaceReferenceId || !hashValid(value.accountNamespaceHash)) errors.push('property_clearance_profile_references_invalid')
  if (!validDate(value.approvedAt) || !actorAllowed(value.approvedBy || {}, { roleBindings: { transfer: { firmId: value.firmId } } }, value.firmId, { managerOnly: true }) || !validDate(value.createdAt) || !value.createdBy) errors.push('property_clearance_profile_governance_invalid')
  if (value.fingerprint !== fnv(profileSnapshot(value))) errors.push('property_clearance_profile_fingerprint_invalid')
  if (value.connectionActivated || value.providerRegistered || value.databaseWritePerformed) errors.push('property_clearance_profile_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), profile: value })
}

export function buildPropertyClearanceProfile(input = {}, { manifest = {}, connection = {} } = {}) {
  const value = { version: CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION, profileId: text(input.profileId), revision: Number(input.revision || 1), clearanceType: enumValue(input.clearanceType, CLEARANCE_TYPES), providerType: enumValue(input.providerType, PROVIDER_TYPES), connectionId: text(connection.connectionId), connectionFingerprint: text(connection.fingerprint), adapterId: text(manifest.adapterId), adapterFingerprint: text(manifest.fingerprint), organisationId: text(connection.organisationId), environment: text(connection.environment), firmId: text(input.firmId), providerReferenceId: text(input.providerReferenceId), providerReferenceHash: text(input.providerReferenceHash).toLowerCase(), accountNamespaceReferenceId: text(input.accountNamespaceReferenceId), accountNamespaceHash: text(input.accountNamespaceHash).toLowerCase(), approvedAt: iso(input.approvedAt), approvedBy: actor(input.approvedBy), createdAt: iso(input.createdAt), createdBy: text(input.createdBy), fingerprint: null, connectionActivated: false, providerRegistered: false, databaseWritePerformed: false }
  value.fingerprint = fnv(profileSnapshot(value)); const validation = validatePropertyClearanceProfile(value, { manifest, connection }); return deepFreeze({ ok: validation.valid, code: validation.valid ? 'property_clearance_profile_valid' : 'property_clearance_profile_invalid', errors: validation.errors, profile: validation.profile })
}

export function validatePropertyClearanceRequest(input = {}, { dependencyModel = {}, financialModel = {}, manifest = {}, connection = {}, profile = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const dv = validateConveyancerThreeRoleDependencyModel(dependencyModel); const fv = validateConveyancerFinancialModel(financialModel); const pv = validatePropertyClearanceProfile(profile, { manifest, connection })
  if (!dv.valid || !dependencyModel.requiredLanes?.includes('transfer')) errors.push('property_clearance_request_dependency_model_invalid')
  if (!fv.valid || financialModel.assessment?.status !== CONVEYANCER_FINANCIAL_MODEL_STATUSES.ready || !financialModel.approval) errors.push('property_clearance_request_approved_financial_model_required')
  if (!pv.valid) errors.push('property_clearance_request_profile_invalid')
  if (value.version !== CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION || !value.requestId || value.revision !== 1 || value.status !== 'approved' || value.clearanceType !== profile.clearanceType) errors.push('property_clearance_request_identity_invalid')
  if (!tenureAllowed(value.clearanceType, dependencyModel)) errors.push('property_clearance_request_tenure_invalid')
  if (!bindingMatches(value.matter || {}, dependencyModel) || value.financialModel?.financialModelId !== financialModel.financialModelId || value.financialModel?.financialModelRevision !== financialModel.revision || value.financialModel?.financialModelFingerprint !== financialModel.fingerprint || value.financialModel?.transactionId !== dependencyModel.transactionId || value.financialModel?.organisationId !== dependencyModel.organisationId || value.financialModel?.lane !== 'transfer' || value.financialModel?.currency !== 'ZAR') errors.push('property_clearance_request_financial_binding_invalid')
  if (value.profileId !== profile.profileId || value.profileFingerprint !== profile.fingerprint || value.connectionId !== connection.connectionId || value.connectionFingerprint !== connection.fingerprint) errors.push('property_clearance_request_configuration_binding_invalid')
  if (!value.propertyReferenceId || !hashValid(value.propertyReferenceHash) || !value.ownerReferenceId || !hashValid(value.ownerReferenceHash) || !value.accountReferenceId || !hashValid(value.accountReferenceHash)) errors.push('property_clearance_request_references_invalid')
  if (!validDate(value.periodEnd) || !validDate(value.preparedAt) || new Date(value.periodEnd) <= new Date(value.preparedAt)) errors.push('property_clearance_request_period_invalid')
  if (!actorAllowed(value.preparedBy || {}, dependencyModel, profile.firmId) || !validDate(value.approvedAt) || new Date(value.approvedAt) < new Date(value.preparedAt) || !actorAllowed(value.approvedBy || {}, dependencyModel, profile.firmId, { legalOnly: true }) || value.approvedBy?.userId === value.preparedBy?.userId || !value.approvalReferenceId) errors.push('property_clearance_request_independent_approval_invalid')
  if (value.fingerprint !== fnv(requestSnapshot(value))) errors.push('property_clearance_request_fingerprint_invalid')
  if (!integrationBoundaryValid(value)) errors.push('property_clearance_request_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), request: value })
}

export function buildPropertyClearanceRequest(input = {}, { dependencyModel = {}, financialModel = {}, manifest = {}, connection = {}, profile = {} } = {}) {
  const value = { version: CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION, requestId: text(input.requestId), revision: 1, status: 'approved', clearanceType: profile.clearanceType, matter: matterBinding(dependencyModel), financialModel: financialBinding(financialModel), profileId: text(profile.profileId), profileFingerprint: text(profile.fingerprint), connectionId: text(connection.connectionId), connectionFingerprint: text(connection.fingerprint), propertyReferenceId: text(input.propertyReferenceId), propertyReferenceHash: text(input.propertyReferenceHash).toLowerCase(), ownerReferenceId: text(input.ownerReferenceId), ownerReferenceHash: text(input.ownerReferenceHash).toLowerCase(), accountReferenceId: text(input.accountReferenceId), accountReferenceHash: text(input.accountReferenceHash).toLowerCase(), periodEnd: iso(input.periodEnd), preparedAt: iso(input.preparedAt), preparedBy: actor(input.preparedBy), approvedAt: iso(input.approvedAt), approvedBy: actor(input.approvedBy), approvalReferenceId: text(input.approvalReferenceId), controls: PROPERTY_CLEARANCE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(requestSnapshot(value)); const validation = validatePropertyClearanceRequest(value, { dependencyModel, financialModel, manifest, connection, profile }); const errors = [...validation.errors]
  if (['propertyAddress', 'propertyDescription', 'ownerName', 'accountNumber', 'rawAccount'].some((itemKey) => input[itemKey] !== undefined && input[itemKey] !== null)) errors.push('property_clearance_request_inline_private_data_prohibited')
  return deepFreeze({ ok: errors.length === 0, code: errors.length ? 'property_clearance_request_invalid' : 'property_clearance_request_approved', errors: unique(errors), request: validation.request })
}

function commandType(action) { return action === CA.paymentEvidenceSubmission ? 'property_clearance_payment_evidence_submission_requested' : 'property_clearance_figures_request_requested' }

export function validatePropertyClearanceCommandPacket(input = {}, { dependencyModel = {}, financialModel = {}, manifest = {}, connection = {}, profile = {}, request = {}, currentOutcome = null, outboundCommand = {} } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const rv = validatePropertyClearanceRequest(request, { dependencyModel, financialModel, manifest, connection, profile }); const cv = validateConveyancerIntegrationOutboundCommand(outboundCommand, { dependencyModel, manifest, connection })
  if (!rv.valid) errors.push('property_clearance_command_request_invalid')
  if (value.version !== CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION || !value.packetId || !COMMAND_ACTIONS.includes(value.action) || !['prepared', 'duplicate'].includes(value.status)) errors.push('property_clearance_command_identity_invalid')
  if (!cv.valid || outboundCommand.type !== commandType(value.action)) errors.push('property_clearance_command_outbound_invalid')
  if (value.requestId !== request.requestId || value.requestFingerprint !== request.fingerprint || !bindingMatches(value.matter || {}, dependencyModel) || value.outboundCommandId !== outboundCommand.recordId || value.outboundCommandFingerprint !== outboundCommand.fingerprint) errors.push('property_clearance_command_binding_invalid')
  if (!value.payloadReferenceId || !hashValid(value.payloadHash) || !validDate(value.preparedAt) || new Date(value.preparedAt) < new Date(request.approvedAt) || !actorAllowed(value.preparedBy || {}, dependencyModel, profile.firmId, { legalOnly: true })) errors.push('property_clearance_command_preparation_invalid')
  if (value.action === CA.figuresRequest && (value.sourceOutcomeId || value.sourceOutcomeFingerprint || value.paymentAmountMinor !== null)) errors.push('property_clearance_figures_command_lineage_invalid')
  if (value.action === CA.paymentEvidenceSubmission && (!currentOutcome || currentOutcome.requestId !== request.requestId || currentOutcome.status !== OS.figuresIssued || value.sourceOutcomeId !== currentOutcome.outcomeId || value.sourceOutcomeFingerprint !== currentOutcome.fingerprint || value.paymentAmountMinor !== currentOutcome.figures?.amountDueMinor)) errors.push('property_clearance_payment_command_lineage_invalid')
  if (value.fingerprint !== fnv(packetSnapshot(value))) errors.push('property_clearance_command_fingerprint_invalid')
  if (!integrationBoundaryValid(value)) errors.push('property_clearance_command_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), packet: value })
}

export function buildPropertyClearanceCommandPacket(input = {}, { dependencyModel = {}, financialModel = {}, manifest = {}, connection = {}, profile = {}, request = {}, currentOutcome = null, existingCommands = [] } = {}) {
  const action = enumValue(input.action, COMMAND_ACTIONS); const preparedBy = actor(input.preparedBy); const type = commandType(action)
  const commandResult = buildConveyancerIntegrationOutboundCommand({ recordId: input.commandId, type, lane: 'transfer', firmId: profile.firmId, idempotencyKey: input.idempotencyKey, payloadReferenceId: input.payloadReferenceId, payloadHash: input.payloadHash, dataPolicy: { purpose: text(input.purpose || (action === CA.paymentEvidenceSubmission ? 'Submit approved payment evidence for the property-clearance request.' : 'Request property-clearance figures from the configured provider.')), legalBasis: connection.dataPolicy?.legalBasis, consentReferenceId: connection.dataPolicy?.consentReferenceId, classifications: [D.professionalConfidential, D.personal, D.financial], retentionDays: Math.min(Number(input.retentionDays || connection.dataPolicy?.retentionDays || 0), Number(connection.dataPolicy?.retentionDays || 0)) }, requestedAt: input.preparedAt, requestedBy: preparedBy, authorityReferenceId: request.approvalReferenceId }, { dependencyModel, manifest, connection, existingCommands })
  const errors = commandResult.ok ? [] : commandResult.errors.map((item) => `property_clearance_command_outbound:${item}`); const command = commandResult.command
  const value = { version: CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION, packetId: text(input.packetId), action, requestId: text(request.requestId), requestFingerprint: text(request.fingerprint), matter: matterBinding(dependencyModel), sourceOutcomeId: currentOutcome ? text(currentOutcome.outcomeId) : null, sourceOutcomeFingerprint: currentOutcome ? text(currentOutcome.fingerprint) : null, paymentAmountMinor: action === CA.paymentEvidenceSubmission ? Number(input.paymentAmountMinor) : null, payloadReferenceId: text(input.payloadReferenceId), payloadHash: text(input.payloadHash).toLowerCase(), preparedAt: iso(input.preparedAt), preparedBy, outboundCommandId: command?.recordId || null, outboundCommandFingerprint: command?.fingerprint || null, status: command?.status === 'duplicate' ? 'duplicate' : 'prepared', controls: PROPERTY_CLEARANCE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(packetSnapshot(value)); const validation = errors.length ? { valid: false, errors } : validatePropertyClearanceCommandPacket(value, { dependencyModel, financialModel, manifest, connection, profile, request, currentOutcome, outboundCommand: command }); return deepFreeze({ ok: validation.valid, code: validation.valid ? `property_clearance_command_${value.status}` : 'property_clearance_command_blocked', errors: unique(validation.errors), packet: value, outboundCommand: command })
}

function outcomeEvidence(input = {}) { const figures = input.figures || {}; const payment = input.paymentEvidence || {}; const certificate = input.certificate || {}; return { figures: { referenceId: text(figures.referenceId) || null, evidenceHash: text(figures.evidenceHash).toLowerCase() || null, amountDueMinor: figures.amountDueMinor === undefined ? null : Number(figures.amountDueMinor), issuedAt: iso(figures.issuedAt), validUntil: iso(figures.validUntil) }, paymentEvidence: { acknowledgementReferenceId: text(payment.acknowledgementReferenceId) || null, evidenceHash: text(payment.evidenceHash).toLowerCase() || null, amountAcknowledgedMinor: payment.amountAcknowledgedMinor === undefined ? null : Number(payment.amountAcknowledgedMinor), acknowledgedAt: iso(payment.acknowledgedAt) }, certificate: { state: enumValue(certificate.state || CS.none, CERTIFICATE_STATES), documentReferenceId: text(certificate.documentReferenceId) || null, documentHash: text(certificate.documentHash).toLowerCase() || null, settlementBasis: enumValue(certificate.settlementBasis, SETTLEMENT_BASES) || null, issuedAt: iso(certificate.issuedAt), validUntil: iso(certificate.validUntil) } } }
function certificateEligible(request, status, certificate, occurredAt) { if (status !== OS.certificateIssued || certificate.state !== CS.available || !certificate.documentReferenceId || !hashValid(certificate.documentHash) || !SETTLEMENT_BASES.includes(certificate.settlementBasis) || !validDate(certificate.issuedAt) || !validDate(certificate.validUntil) || new Date(certificate.validUntil) <= new Date(occurredAt)) return false; if (request.clearanceType === CT.municipal && certificate.settlementBasis === SB.provisionAccepted) return false; return true }

export function validatePropertyClearanceOutcome(input = {}, { dependencyModel = {}, financialModel = {}, manifest = {}, connection = {}, profile = {}, request = {}, inboundEvent = {}, previousOutcome = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const rv = validatePropertyClearanceRequest(request, { dependencyModel, financialModel, manifest, connection, profile }); const iv = validateConveyancerIntegrationInboundEvent(inboundEvent, { dependencyModel, manifest, connection })
  if (!rv.valid) errors.push('property_clearance_outcome_request_invalid')
  const expectedEventType = OUTCOME_EVENT_TYPES[value.status] || 'property_clearance_status_received'; if (!iv.valid || inboundEvent.type !== expectedEventType || value.sourceInboundEventId !== inboundEvent.recordId || value.sourceInboundEventFingerprint !== inboundEvent.fingerprint) errors.push('property_clearance_outcome_inbound_evidence_invalid')
  if (value.version !== CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION || !value.outcomeId || !Number.isInteger(value.revision) || value.revision < 1 || !OUTCOME_STATUSES.includes(value.status) || !validDate(value.occurredAt) || new Date(value.occurredAt) < new Date(request.approvedAt)) errors.push('property_clearance_outcome_identity_invalid')
  if (value.requestId !== request.requestId || value.requestFingerprint !== request.fingerprint || !bindingMatches(value.matter || {}, dependencyModel) || !value.providerClearanceReferenceId || !hashValid(value.providerClearanceReferenceHash)) errors.push('property_clearance_outcome_binding_invalid')
  if (value.revision === 1 && (value.previousOutcomeId || value.previousFingerprint || ![OS.figuresIssued, OS.rejected].includes(value.status))) errors.push('property_clearance_outcome_initial_lineage_invalid')
  if (value.revision > 1 && (!previousOutcome || value.previousOutcomeId !== previousOutcome.outcomeId || value.previousFingerprint !== previousOutcome.fingerprint || previousOutcome.revision + 1 !== value.revision || previousOutcome.requestId !== value.requestId || previousOutcome.providerClearanceReferenceHash !== value.providerClearanceReferenceHash || !PROPERTY_CLEARANCE_OUTCOME_TRANSITIONS[previousOutcome.status]?.includes(value.status) || new Date(value.occurredAt) < new Date(previousOutcome.occurredAt))) errors.push('property_clearance_outcome_transition_invalid')
  const figures = value.figures || {}; if (value.status === OS.figuresIssued && (!figures.referenceId || !hashValid(figures.evidenceHash) || !Number.isSafeInteger(figures.amountDueMinor) || figures.amountDueMinor < 0 || !validDate(figures.issuedAt) || !validDate(figures.validUntil) || new Date(figures.issuedAt) > new Date(value.occurredAt) || new Date(figures.validUntil) <= new Date(figures.issuedAt))) errors.push('property_clearance_figures_invalid')
  const actualAmount = value.status === OS.figuresIssued ? figures.amountDueMinor : previousOutcome?.figures?.amountDueMinor ?? null; const expectedReconciliation = actualAmount === null ? { status: FR.noApprovedExpectation, expectedAmountMinor: expectedAmount(financialModel, request.clearanceType), varianceMinor: null } : reconciliation(expectedAmount(financialModel, request.clearanceType), actualAmount)
  if (JSON.stringify(value.financialReconciliation) !== JSON.stringify(expectedReconciliation)) errors.push('property_clearance_financial_reconciliation_invalid')
  const payment = value.paymentEvidence || {}; if (value.status === OS.paymentEvidenceAcknowledged && (!payment.acknowledgementReferenceId || !hashValid(payment.evidenceHash) || !Number.isSafeInteger(payment.amountAcknowledgedMinor) || payment.amountAcknowledgedMinor !== previousOutcome?.figures?.amountDueMinor || !validDate(payment.acknowledgedAt) || new Date(payment.acknowledgedAt) > new Date(value.occurredAt))) errors.push('property_clearance_payment_acknowledgement_invalid')
  const certificate = value.certificate || {}; const eligible = certificateEligible(request, value.status, certificate, value.occurredAt); if (value.status === OS.certificateIssued && !eligible) errors.push('property_clearance_certificate_invalid')
  if (value.status !== OS.certificateIssued && certificate.state === CS.available) errors.push('property_clearance_certificate_state_invalid')
  if (value.complianceEligible !== eligible) errors.push('property_clearance_compliance_derivation_invalid')
  if (value.fingerprint !== fnv(outcomeSnapshot(value))) errors.push('property_clearance_outcome_fingerprint_invalid')
  if (!integrationBoundaryValid(value)) errors.push('property_clearance_outcome_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), outcome: value })
}

export function buildPropertyClearanceOutcome(input = {}, { dependencyModel = {}, financialModel = {}, manifest = {}, connection = {}, profile = {}, request = {}, inboundEvent = {}, previousOutcome = null } = {}) {
  const status = enumValue(input.status, OUTCOME_STATUSES); const evidence = outcomeEvidence(input); const actualAmount = status === OS.figuresIssued ? evidence.figures.amountDueMinor : previousOutcome?.figures?.amountDueMinor ?? null
  const historicalCertificate = [OS.expired, OS.revoked].includes(status) && previousOutcome?.certificate?.documentReferenceId ? { ...previousOutcome.certificate, state: status === OS.revoked ? CS.revoked : CS.expired } : evidence.certificate
  const value = { version: CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION, outcomeId: text(input.outcomeId), revision: Number(input.revision || 1), previousOutcomeId: previousOutcome ? text(previousOutcome.outcomeId) : null, previousFingerprint: previousOutcome ? text(previousOutcome.fingerprint) : null, requestId: text(request.requestId), requestFingerprint: text(request.fingerprint), matter: matterBinding(dependencyModel), providerClearanceReferenceId: text(input.providerClearanceReferenceId), providerClearanceReferenceHash: text(input.providerClearanceReferenceHash).toLowerCase(), status, figures: status === OS.figuresIssued ? evidence.figures : previousOutcome?.figures || evidence.figures, paymentEvidence: status === OS.paymentEvidenceAcknowledged ? evidence.paymentEvidence : previousOutcome?.paymentEvidence || evidence.paymentEvidence, certificate: historicalCertificate, financialReconciliation: actualAmount === null ? { status: FR.noApprovedExpectation, expectedAmountMinor: expectedAmount(financialModel, request.clearanceType), varianceMinor: null } : reconciliation(expectedAmount(financialModel, request.clearanceType), actualAmount), occurredAt: iso(input.occurredAt), sourceInboundEventId: text(inboundEvent.recordId), sourceInboundEventFingerprint: text(inboundEvent.fingerprint), complianceEligible: false, controls: PROPERTY_CLEARANCE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.complianceEligible = certificateEligible(request, status, value.certificate, value.occurredAt); value.fingerprint = fnv(outcomeSnapshot(value)); const validation = validatePropertyClearanceOutcome(value, { dependencyModel, financialModel, manifest, connection, profile, request, inboundEvent, previousOutcome }); return deepFreeze({ ok: validation.valid, code: validation.valid ? `property_clearance_outcome_${status}` : 'property_clearance_outcome_invalid', errors: validation.errors, outcome: validation.outcome })
}

export function validatePropertyClearanceComplianceEvidence(input = {}, { dependencyModel = {}, financialModel = {}, manifest = {}, connection = {}, profile = {}, request = {}, outcome = {}, inboundEvent = {}, previousOutcome = null } = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []; const ov = validatePropertyClearanceOutcome(outcome, { dependencyModel, financialModel, manifest, connection, profile, request, inboundEvent, previousOutcome })
  if (!ov.valid || !outcome.complianceEligible) errors.push('property_clearance_compliance_eligible_outcome_required')
  if (value.version !== CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION || !value.evidenceId || value.status !== 'approved_for_lodgement_evidence') errors.push('property_clearance_compliance_identity_invalid')
  if (value.requestId !== request.requestId || value.requestFingerprint !== request.fingerprint || value.outcomeId !== outcome.outcomeId || value.outcomeFingerprint !== outcome.fingerprint || !bindingMatches(value.matter || {}, dependencyModel)) errors.push('property_clearance_compliance_binding_invalid')
  const expectedCheckKey = request.clearanceType === CT.municipal ? 'rates_clearance' : 'levy_clearance'; if (value.checkKey !== expectedCheckKey || value.documentReferenceId !== outcome.certificate?.documentReferenceId || value.documentHash !== outcome.certificate?.documentHash || value.validUntil !== outcome.certificate?.validUntil || value.providerClearanceReferenceHash !== outcome.providerClearanceReferenceHash) errors.push('property_clearance_compliance_document_binding_invalid')
  if (!validDate(value.reviewedAt) || new Date(value.reviewedAt) < new Date(outcome.occurredAt) || !actorAllowed(value.reviewedBy || {}, dependencyModel, profile.firmId, { legalOnly: true }) || !value.reviewReferenceId) errors.push('property_clearance_compliance_legal_review_invalid')
  if (outcome.financialReconciliation?.status !== FR.matched && !value.financialReviewReferenceId) errors.push('property_clearance_compliance_financial_review_required')
  if (value.fingerprint !== fnv(evidenceSnapshot(value))) errors.push('property_clearance_compliance_fingerprint_invalid')
  if (!integrationBoundaryValid(value)) errors.push('property_clearance_compliance_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), evidence: value })
}

export function buildPropertyClearanceComplianceEvidence(input = {}, { dependencyModel = {}, financialModel = {}, manifest = {}, connection = {}, profile = {}, request = {}, outcome = {}, inboundEvent = {}, previousOutcome = null } = {}) {
  const value = { version: CONVEYANCER_MUNICIPAL_LEVY_INTEGRATION_VERSION, evidenceId: text(input.evidenceId), requestId: text(request.requestId), requestFingerprint: text(request.fingerprint), outcomeId: text(outcome.outcomeId), outcomeFingerprint: text(outcome.fingerprint), matter: matterBinding(dependencyModel), clearanceType: request.clearanceType, checkKey: request.clearanceType === CT.municipal ? 'rates_clearance' : 'levy_clearance', documentReferenceId: text(outcome.certificate?.documentReferenceId), documentHash: text(outcome.certificate?.documentHash), validUntil: iso(outcome.certificate?.validUntil), providerClearanceReferenceHash: text(outcome.providerClearanceReferenceHash), financialReconciliation: outcome.financialReconciliation, reviewedAt: iso(input.reviewedAt), reviewedBy: actor(input.reviewedBy), reviewReferenceId: text(input.reviewReferenceId), financialReviewReferenceId: text(input.financialReviewReferenceId) || null, status: 'approved_for_lodgement_evidence', controls: PROPERTY_CLEARANCE_INTEGRATION_BOUNDARY, fingerprint: null }
  value.fingerprint = fnv(evidenceSnapshot(value)); const validation = validatePropertyClearanceComplianceEvidence(value, { dependencyModel, financialModel, manifest, connection, profile, request, outcome, inboundEvent, previousOutcome }); return deepFreeze({ ok: validation.valid, code: validation.valid ? 'property_clearance_compliance_evidence_approved' : 'property_clearance_compliance_evidence_invalid', errors: validation.errors, evidence: validation.evidence })
}
