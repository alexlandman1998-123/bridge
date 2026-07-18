import { buildDocumentAccessibility } from './documentAccessibility.js'
import { buildDocumentCommitConfirmation } from './documentCommitConfirmation.js'
import { buildDocumentHelpRecovery } from './documentHelpRecovery.js'
import { buildDocumentJourneyProgress } from './documentJourneyProgress.js'
import { buildDocumentMobileAction } from './documentMobileAction.js'
import { buildDocumentOutcomeFeedback } from './documentOutcomeFeedback.js'
import { buildDocumentResponsibility } from './documentResponsibility.js'
import { buildDocumentRoleActions } from './documentRoleActions.js'
import { buildDocumentRoleGuidance, resolveDocumentAudience } from './documentRoleGuidance.js'

const DEFAULT_SCENARIOS = [
  { id: 'agent-mandate-draft', surface: 'workspace', role: 'agent', packetType: 'mandate', state: 'draft', canEdit: true, expectedAudience: 'agent' },
  { id: 'principal-otp-pdf', surface: 'workspace', role: 'principal', packetType: 'otp', state: 'pdf_ready', canEdit: true, expectedAudience: 'principal' },
  { id: 'attorney-mandate-ready', surface: 'workspace', role: 'attorney', packetType: 'mandate', state: 'ready_to_send', canEdit: true, canSend: true, signerCount: 2, expectedAudience: 'attorney' },
  { id: 'agent-otp-signing', surface: 'workspace', role: 'agent', packetType: 'otp', state: 'partially_signed', canSend: true, signers: [{ id: 'agent', role: 'agent', status: 'signed', order: 1 }, { id: 'buyer', role: 'purchaser_1', status: 'viewed', order: 2 }], expectedAudience: 'agent' },
  { id: 'principal-mandate-complete', surface: 'workspace', role: 'principal', packetType: 'mandate', state: 'completed', finalCopyAvailable: true, certificateAvailable: true, expectedAudience: 'principal' },
  { id: 'seller-mandate-signing', surface: 'signer_portal', role: 'seller', packetType: 'mandate', state: 'viewed', requiredFields: 3, completedFields: 0, signers: [{ id: 'seller', role: 'seller', status: 'viewed', order: 1 }], expectedAudience: 'seller' },
  { id: 'purchaser-otp-signing', surface: 'signer_portal', role: 'purchaser_1', packetType: 'otp', state: 'viewed', requiredFields: 2, completedFields: 1, signers: [{ id: 'buyer', role: 'purchaser_1', status: 'viewed', order: 1 }], expectedAudience: 'buyer' },
  { id: 'agent-mandate-submit', surface: 'signer_portal', role: 'agent', packetType: 'mandate', state: 'viewed', requiredFields: 2, completedFields: 2, signers: [{ id: 'agent', role: 'agent', status: 'viewed', order: 1 }], expectedAudience: 'agent' },
]

const REQUIRED_AUDIENCES = ['principal', 'agent', 'attorney', 'seller', 'buyer']
const REQUIRED_SURFACES = ['workspace', 'signer_portal']
const REQUIRED_PACKET_TYPES = ['mandate', 'otp']

function key(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function blocker(code, detail, solution, scenarioId = null) {
  return { code, detail, solution, scenarioId }
}

function buildScenarioModels(scenario) {
  const signerSurface = key(scenario.surface) === 'signer_portal'
  const remainingFields = Math.max(0, Number(scenario.requiredFields || 0) - Number(scenario.completedFields || 0))
  const guidance = buildDocumentRoleGuidance({
    surface: scenario.surface,
    role: scenario.role,
    packetType: scenario.packetType,
    state: scenario.state,
    signerStatus: scenario.state,
    remainingFields,
    completedFields: scenario.completedFields,
  })
  const actions = buildDocumentRoleActions({
    surface: scenario.surface,
    role: scenario.role,
    state: scenario.state,
    canEdit: scenario.canEdit,
    canSend: scenario.canSend,
    canFinalize: scenario.canFinalize,
    finalCopyAvailable: scenario.finalCopyAvailable,
    certificateAvailable: scenario.certificateAvailable,
    remainingFields,
    requiredFields: scenario.requiredFields,
    canComplete: signerSurface && remainingFields === 0 && Number(scenario.requiredFields || 0) > 0,
  })
  const responsibility = buildDocumentResponsibility({ surface: scenario.surface, role: scenario.role, state: scenario.state, signers: scenario.signers || [], currentSigner: signerSurface ? scenario.signers?.[0] : null })
  const help = buildDocumentHelpRecovery({ surface: scenario.surface, role: scenario.role, state: scenario.state })
  const journey = buildDocumentJourneyProgress({ surface: scenario.surface, state: scenario.state, signerStatus: scenario.state, requiredFields: scenario.requiredFields, completedFields: scenario.completedFields })
  const primaryAction = actions.actions.find((item) => !item.disabled && item.priority === 'primary') || actions.actions.find((item) => !item.disabled) || null
  const mobile = buildDocumentMobileAction({
    surface: scenario.surface,
    primaryAction,
    remainingFields,
    requiredFields: scenario.requiredFields,
    canComplete: signerSurface && remainingFields === 0 && Number(scenario.requiredFields || 0) > 0,
    currentOwnerLabel: responsibility.currentOwner?.name || responsibility.currentOwner?.roleLabel || responsibility.currentOwner?.label,
  })
  const accessibility = buildDocumentAccessibility({ surface: scenario.surface, journey, responsibility, helpRecovery: help, mobileAction: mobile, completedFields: scenario.completedFields, requiredFields: scenario.requiredFields })
  const commit = signerSurface && mobile?.action?.id === 'complete_signing'
    ? buildDocumentCommitConfirmation({ action: 'complete_signing', packetType: scenario.packetType, remainingFields, signerRole: scenario.role })
    : actions.actions.some((item) => item.id === 'send_document')
      ? buildDocumentCommitConfirmation({ action: 'send_signature', packetType: scenario.packetType, signerCount: scenario.signerCount || scenario.signers?.length || 0 })
      : null
  const outcome = buildDocumentOutcomeFeedback({ surface: scenario.surface, message: signerSurface ? 'Signature applied to the required field.' : 'Document sent for signature workflow.', remainingFields })
  return { guidance, actions, responsibility, help, journey, mobile, accessibility, commit, outcome, remainingFields }
}

function validateScenario(scenario) {
  const blockers = []
  const models = buildScenarioModels(scenario)
  const id = key(scenario.id) || 'unnamed-scenario'
  const audience = resolveDocumentAudience(scenario.role)
  if (scenario.expectedAudience && audience !== scenario.expectedAudience) blockers.push(blocker('N1_ROLE_RESOLUTION_MISMATCH', `${id} resolved to ${audience}, not ${scenario.expectedAudience}.`, 'Correct the role mapping before exposing this document journey.', id))
  if (models.guidance.contract !== 'arch9-document-role-guidance-v1' || !models.guidance.nextAction) blockers.push(blocker('N1_GUIDANCE_MISSING', `${id} has no role-specific guidance.`, 'Restore L1 guidance for this surface, role and state.', id))
  if (models.actions.contract !== 'arch9-document-role-actions-v1' || !models.actions.actions.some((item) => !item.disabled)) blockers.push(blocker('N1_NO_REACHABLE_ACTION', `${id} has no enabled next action.`, 'Add one safe, enabled action for the current role and lifecycle state.', id))
  if (models.journey.contract !== 'arch9-document-journey-progress-v1' || !models.journey.stages.some((stage) => stage.isCurrent)) blockers.push(blocker('N1_JOURNEY_POSITION_MISSING', `${id} cannot identify its current journey stage.`, 'Map the lifecycle state into the M1 journey model.', id))
  if (models.responsibility.contract !== 'arch9-document-responsibility-v1') blockers.push(blocker('N1_RESPONSIBILITY_MISSING', `${id} cannot resolve responsibility.`, 'Restore L3 ownership and handoff resolution.', id))
  if (models.help.contract !== 'arch9-document-help-recovery-v1') blockers.push(blocker('N1_HELP_MISSING', `${id} has no contextual help.`, 'Restore L4 help and recovery guidance.', id))
  if (!models.mobile || models.mobile.contract !== 'arch9-document-mobile-action-v1') blockers.push(blocker('N1_MOBILE_ACTION_MISSING', `${id} has no reachable mobile action.`, 'Expose the same enabled primary action through the M2 mobile dock.', id))
  if (models.accessibility.contract !== 'arch9-document-accessibility-v1' || !models.accessibility.announcement) blockers.push(blocker('N1_ACCESSIBLE_STATUS_MISSING', `${id} has no screen-reader status.`, 'Restore M3 landmarks and live status text.', id))
  if (models.commit && models.commit.canConfirm !== true) blockers.push(blocker('N1_COMMIT_CONFIRMATION_BLOCKED', `${id} reaches a commit action without a confirmable payload.`, 'Complete signer identities or required fields before enabling the commit action.', id))
  if (models.outcome?.contract !== 'arch9-document-outcome-feedback-v1') blockers.push(blocker('N1_OUTCOME_FEEDBACK_MISSING', `${id} cannot explain a completed action.`, 'Restore M5 outcome feedback for this surface.', id))
  if (/token\s*[:=]|https?:\/\//i.test(JSON.stringify(models))) blockers.push(blocker('N1_SENSITIVE_VALUE_EXPOSED', `${id} exposes a link or token in its UX models.`, 'Remove secrets and raw links from user-facing role models.', id))
  return { id, audience, surface: key(scenario.surface), packetType: key(scenario.packetType), passed: blockers.length === 0, blockers }
}

export function buildDocumentExperienceReadiness({ scenarios = DEFAULT_SCENARIOS } = {}) {
  const rows = (Array.isArray(scenarios) ? scenarios : []).map(validateScenario)
  const blockers = rows.flatMap((row) => row.blockers)
  const audiences = [...new Set(rows.map((row) => row.audience))]
  const surfaces = [...new Set(rows.map((row) => row.surface))]
  const packetTypes = [...new Set(rows.map((row) => row.packetType))]
  for (const audience of REQUIRED_AUDIENCES) if (!audiences.includes(audience)) blockers.push(blocker('N1_AUDIENCE_COVERAGE_MISSING', `${audience} has no acceptance scenario.`, `Add a ${audience} mandate or OTP usability scenario.`))
  for (const surface of REQUIRED_SURFACES) if (!surfaces.includes(surface)) blockers.push(blocker('N1_SURFACE_COVERAGE_MISSING', `${surface} is not covered.`, `Add an acceptance scenario for ${surface}.`))
  for (const packetType of REQUIRED_PACKET_TYPES) if (!packetTypes.includes(packetType)) blockers.push(blocker('N1_DOCUMENT_COVERAGE_MISSING', `${packetType} is not covered.`, `Add both workspace and signing coverage for ${packetType}.`))
  return {
    contract: 'arch9-document-experience-readiness-v1',
    status: blockers.length ? 'EXPERIENCE_BLOCKED' : 'READY_FOR_N2',
    ready: blockers.length === 0,
    mutatedData: false,
    coverage: { audiences, surfaces, packetTypes, scenarioCount: rows.length, passedScenarioCount: rows.filter((row) => row.passed).length },
    scenarios: rows,
    blockers,
  }
}

export { DEFAULT_SCENARIOS as DOCUMENT_EXPERIENCE_N1_SCENARIOS }
