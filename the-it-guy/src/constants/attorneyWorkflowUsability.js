import {
  attorneyStageKeyMatches,
  getAttorneyEvidenceRequirementsForStage,
  getAttorneyStageDefinition,
  getAttorneyStageLabel,
  getAttorneyWorkflowStatusLabel,
  normalizeAttorneyStageKey,
  resolveAttorneyWorkflowState,
} from './attorneyWorkflowStages.js'

const SEVERITY_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const LANE_LABELS = {
  transfer: 'Transfer Attorney',
  bond: 'Bond Attorney',
  cancellation: 'Cancellation Attorney',
}

const PRIORITY_LABELS = {
  optional: 'Optional',
  required: 'Required',
  urgent: 'Urgent',
}

const VISIBILITY_LABELS = {
  internal: 'Internal',
  professional_shared: 'Professional Shared',
  client_visible: 'Client Visible',
}

export const BOND_ATTORNEY_STAGE_COMMAND_PRESETS = Object.freeze({
  bond_instruction_received: Object.freeze({
    label: 'Confirm Instruction',
    description: 'Confirm the bank or originator instruction has been logged on the bond matter.',
    note: 'Bond instruction received and logged. Instruction source, date, and matter reference confirmed.',
    checklist: ['Confirm instruction source and date.', 'Check bank reference or instruction number.', 'Save the instruction document on the matter.'],
  }),
  bank_reference_captured: Object.freeze({
    label: 'Capture Bank Details',
    description: 'Record the bank, branch, bond amount, and reference details needed for registration.',
    note: 'Bank details captured. Bond bank, approval amount, and reference/account details checked against the instruction.',
    checklist: ['Capture the registering bank.', 'Capture branch or reference/account number.', 'Check approved bond amount against the finance instruction.'],
  }),
  bond_approval_letter_received: Object.freeze({
    label: 'Confirm Approval Letter',
    description: 'Confirm the grant or approval letter is available and reviewed.',
    note: 'Grant or approval letter received. Approval amount and conditions reviewed.',
    checklist: ['Save the approval letter or grant.', 'Check approval amount and expiry.', 'Identify any bank conditions that affect signing or lodgement.'],
  }),
  bank_requirements_confirmed: Object.freeze({
    label: 'Review Conditions',
    description: 'Review bank requirements and identify outstanding condition owners.',
    note: 'Bank conditions reviewed. Outstanding requirements, owners, and follow-up dates captured where applicable.',
    checklist: ['Review bank conditions checklist.', 'Separate pre-signing and pre-lodgement conditions.', 'Assign every outstanding condition to an owner.'],
  }),
  bank_conditions_outstanding: Object.freeze({
    commandType: 'add_note',
    label: 'Capture Conditions',
    description: 'Record outstanding bank conditions without forcing the stage to complete.',
    note: 'Outstanding bank conditions captured. Owners, next follow-up, and required evidence recorded.',
    checklist: ['List each outstanding condition.', 'Capture the responsible party for each condition.', 'Set the next follow-up or due date.'],
  }),
  bank_conditions_resolved: Object.freeze({
    label: 'Resolve Conditions',
    description: 'Confirm outstanding bank conditions are cleared.',
    note: 'Bank conditions resolved. Clearance evidence and bank/internal confirmation saved.',
    checklist: ['Confirm each outstanding condition is cleared.', 'Save bank or internal clearance confirmation.', 'Check no unresolved condition blocks lodgement.'],
  }),
  bond_documents_prepared: Object.freeze({
    label: 'Confirm Document Pack',
    description: 'Confirm the bond document pack is ready for buyer signature.',
    note: 'Bond document pack prepared. Parties, property, bond amount, and bank requirements checked.',
    checklist: ['Prepare bond document pack.', 'Check parties and property description.', 'Check bond amount and bank requirements.'],
  }),
  buyer_bond_signing_scheduled: Object.freeze({
    label: 'Confirm Signing Scheduled',
    description: 'Record the buyer bond signing appointment or remote signing instruction.',
    note: 'Buyer bond signing scheduled. Date, channel, signer, and document pack confirmed.',
    checklist: ['Confirm buyer availability.', 'Confirm signing method and location/channel.', 'Send signing requirements to the buyer.'],
  }),
  buyer_signed_bond_documents: Object.freeze({
    label: 'Confirm Signed Docs',
    description: 'Confirm buyer signatures and supporting checks are complete.',
    note: 'Buyer signed bond documents received. Signing, witnessing, and FICA checks completed.',
    checklist: ['Save signed bond documents.', 'Check signatures and witnessing.', 'Confirm FICA or bank signing requirements are satisfied.'],
  }),
  bond_documents_sent_to_bank: Object.freeze({
    label: 'Confirm Bank Submission',
    description: 'Confirm signed bond documents were sent to the bank or uploaded to the bank portal.',
    note: 'Signed bond documents sent to bank. Submission date, channel, and reference captured.',
    checklist: ['Submit signed documents to the bank or portal.', 'Capture submission date and reference.', 'Record any bank response SLA or next follow-up.'],
  }),
  bank_approval_to_lodge_received: Object.freeze({
    label: 'Confirm Approval To Lodge',
    description: 'Confirm bank approval to lodge and the reference required for simultaneous lodgement.',
    note: 'Bank approval to lodge received. Approval date/reference captured and lodgement blockers checked.',
    checklist: ['Save bank approval-to-lodge evidence.', 'Capture approval date/reference.', 'Confirm no bank conditions still block lodgement.'],
  }),
  guarantees_issued: Object.freeze({
    label: 'Confirm Guarantees Issued',
    description: 'Confirm guarantees were issued to the transfer attorney.',
    note: 'Guarantees issued to transfer attorney. Values, wording, expiry, and delivery evidence checked.',
    checklist: ['Check guarantee values against the bond approval.', 'Check wording and expiry.', 'Send guarantees to the transfer attorney and save delivery evidence.'],
  }),
  guarantee_wording_accepted: Object.freeze({
    label: 'Confirm Wording Accepted',
    description: 'Confirm transfer attorney acceptance of guarantee wording.',
    note: 'Guarantee wording accepted by transfer attorney. Amendments resolved and acceptance evidence saved.',
    checklist: ['Confirm transfer attorney acceptance.', 'Resolve wording amendments if any.', 'Save acceptance evidence on the matter.'],
  }),
  bond_lodgement_ready: Object.freeze({
    label: 'Mark Bond Ready',
    description: 'Confirm the bond pack is ready for simultaneous lodgement.',
    note: 'Bond lodgement pack ready. Bank approval, signed docs, guarantees, and transfer coordination confirmed.',
    checklist: ['Check bank approval to lodge.', 'Check signed bond pack is complete.', 'Confirm simultaneous lodgement readiness with transfer.'],
  }),
  bond_lodged: Object.freeze({
    label: 'Mark Bond Lodged',
    description: 'Confirm the bond was lodged with the transfer.',
    note: 'Bond lodged simultaneously with transfer. Lodgement date and deeds reference captured.',
    checklist: ['Capture lodgement date.', 'Capture deeds office or lodgement reference.', 'Confirm simultaneous lodgement with transfer.'],
  }),
  bond_registered: Object.freeze({
    label: 'Confirm Registration',
    description: 'Confirm bond registration and registration date.',
    note: 'Bond registration confirmed. Registration date and bank notification status captured.',
    checklist: ['Capture registration date.', 'Confirm deeds office registration.', 'Notify or queue final bank confirmation.'],
  }),
  bond_close_out_complete: Object.freeze({
    label: 'Close Bond Matter',
    description: 'Confirm final bank close-out and archive readiness.',
    note: 'Bond matter close-out complete. Final bank confirmation and close-out checklist completed.',
    checklist: ['Complete final bank confirmation.', 'Check all bond documents are filed.', 'Complete close-out checklist and archive readiness.'],
  }),
})

export const CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS = Object.freeze({
  cancellation_existing_bond_confirmed: Object.freeze({
    label: 'Confirm Existing Bond',
    description: 'Confirm the seller bond exists and cancellation is required for this matter.',
    note: 'Seller existing bond confirmed. Cancellation lane activation, bank, and account follow-up checked.',
    checklist: ['Confirm seller bond status.', 'Check whether cancellation is explicitly required.', 'Keep buyer finance out of cancellation activation logic.'],
  }),
  cancellation_bank_captured: Object.freeze({
    label: 'Capture Cancellation Bank',
    description: 'Record the bank holding the seller bond that must be cancelled.',
    note: 'Cancellation bank captured and checked against the seller bond confirmation.',
    checklist: ['Capture the cancellation bank.', 'Check bank name against seller supplied evidence.', 'Flag missing branch or contact details if needed.'],
  }),
  cancellation_bond_account_captured: Object.freeze({
    label: 'Capture Bond Account',
    description: 'Record the seller bond account or reference number for cancellation figures.',
    note: 'Seller bond account/reference captured for cancellation figures and bank follow-up.',
    checklist: ['Capture the bond account or reference number.', 'Check the reference against bank or seller evidence.', 'Record any uncertainty as a follow-up.'],
  }),
  cancellation_instruction_received: Object.freeze({
    label: 'Confirm Instruction',
    description: 'Confirm the cancellation instruction has been received and logged.',
    note: 'Cancellation instruction received and logged. Matter reference, bank, and source checked.',
    checklist: ['Confirm the instruction source.', 'Save the instruction or mandate evidence.', 'Check the cancellation attorney can proceed independently.'],
  }),
  notice_period_captured: Object.freeze({
    commandType: 'add_note',
    label: 'Capture Notice Period',
    description: 'Record the bank notice period and timing implications without blocking other cancellation work.',
    note: 'Cancellation notice period captured. Timing and follow-up implications recorded.',
    checklist: ['Capture the notice period.', 'Record the notice start or target date if known.', 'Flag timing risk before lodgement readiness.'],
  }),
  cancellation_figures_requested: Object.freeze({
    label: 'Request Figures',
    description: 'Confirm cancellation figures have been requested from the bank.',
    note: 'Cancellation figures requested from the bank. Request date, channel, and expected response captured.',
    checklist: ['Request cancellation figures from the bank.', 'Capture request channel and date.', 'Record expected turnaround or follow-up date.'],
  }),
  cancellation_figures_received: Object.freeze({
    commandType: 'request_document',
    requestedFrom: 'bank',
    visibility: 'professional_shared',
    label: 'Capture Figures',
    description: 'Capture received cancellation figures and keep the source document visible for transfer alignment.',
    note: 'Cancellation figures received and saved for transfer guarantee alignment.',
    checklist: ['Save the cancellation figures document.', 'Check settlement amount and expiry.', 'Share figures visibility with transfer coordination.'],
  }),
  figures_expiry_captured: Object.freeze({
    label: 'Capture Figures Expiry',
    description: 'Record the cancellation figures expiry date so lodgement timing can be checked.',
    note: 'Cancellation figures expiry captured and checked against target lodgement timing.',
    checklist: ['Capture the figures expiry date.', 'Compare expiry to target lodgement date.', 'Flag refresh required if the expiry is too close or already passed.'],
  }),
  notice_penalty_risk_captured: Object.freeze({
    commandType: 'add_note',
    priority: 'urgent',
    label: 'Capture Penalty Risk',
    description: 'Record notice, penalty, or stale-figures risk without forcing unrelated stages complete.',
    note: 'Cancellation notice or penalty risk captured. Owner and next action recorded.',
    checklist: ['Describe the penalty or notice risk.', 'Capture the owner and follow-up date.', 'Keep the risk visible before lodgement readiness.'],
  }),
  cancellation_guarantees_requested: Object.freeze({
    label: 'Request Guarantees',
    description: 'Confirm guarantees have been requested for cancellation settlement.',
    note: 'Cancellation guarantees requested. Amount, wording, and transfer coordination requirements checked.',
    checklist: ['Request guarantees for the cancellation amount.', 'Check guarantee wording requirements.', 'Link request to transfer guarantee alignment.'],
  }),
  cancellation_guarantees_received: Object.freeze({
    commandType: 'request_document',
    requestedFrom: 'attorney',
    visibility: 'professional_shared',
    label: 'Capture Guarantees',
    description: 'Capture received guarantees and make them available for cancellation bank acceptance.',
    note: 'Cancellation guarantees received. Value, wording, expiry, and source checked.',
    checklist: ['Save guarantee evidence.', 'Check value against cancellation figures.', 'Check expiry and wording before acceptance.'],
  }),
  cancellation_guarantees_accepted: Object.freeze({
    label: 'Accept Guarantees',
    description: 'Confirm cancellation guarantees are accepted by the bank or cancellation attorney.',
    note: 'Cancellation guarantees accepted. Acceptance evidence and remaining settlement risk checked.',
    checklist: ['Confirm guarantee acceptance.', 'Save acceptance evidence.', 'Record any settlement shortfall or expiry risk.'],
  }),
  cancellation_documents_prepared: Object.freeze({
    label: 'Prepare Documents',
    description: 'Confirm the cancellation document pack is prepared for seller signing or bank processing.',
    note: 'Cancellation document pack prepared. Seller, property, bank, and authority requirements checked.',
    checklist: ['Prepare cancellation documents.', 'Check seller capacity and authority evidence.', 'Confirm bank and property details are correct.'],
  }),
  seller_cancellation_documents_signed: Object.freeze({
    commandType: 'request_document',
    requestedFrom: 'seller',
    visibility: 'client_visible',
    label: 'Capture Signed Docs',
    description: 'Capture seller signed cancellation documents and supporting signing evidence.',
    note: 'Seller cancellation documents signed and saved. Signature and authority requirements checked.',
    checklist: ['Save signed cancellation documents.', 'Check signatures and witnessing.', 'Check seller authority evidence for company or trust sellers.'],
  }),
  cancellation_lodgement_ready: Object.freeze({
    label: 'Mark Cancellation Ready',
    description: 'Confirm cancellation is ready for simultaneous lodgement.',
    note: 'Cancellation lodgement readiness confirmed. Valid figures, accepted guarantees, documents, and blockers checked.',
    checklist: ['Confirm figures are still valid.', 'Confirm guarantees are accepted.', 'Confirm cancellation pack and seller signing are complete.'],
  }),
  cancellation_lodged: Object.freeze({
    label: 'Mark Cancellation Lodged',
    description: 'Confirm cancellation was lodged simultaneously with transfer.',
    note: 'Cancellation lodged simultaneously with transfer. Lodgement date and reference captured.',
    checklist: ['Capture lodgement date.', 'Capture deeds office or lodgement reference.', 'Confirm simultaneous lodgement with transfer.'],
  }),
  cancellation_registered: Object.freeze({
    label: 'Confirm Registration',
    description: 'Confirm bond cancellation registration.',
    note: 'Cancellation registration confirmed. Registration date and bank notification status captured.',
    checklist: ['Capture registration date.', 'Confirm deeds office registration.', 'Queue bank close-out confirmation.'],
  }),
  settlement_proof_captured: Object.freeze({
    commandType: 'add_note',
    visibility: 'professional_shared',
    label: 'Capture Settlement Proof',
    description: 'Record settlement payment proof or bank settlement reference.',
    note: 'Cancellation settlement proof captured. Payment reference and bank confirmation follow-up recorded.',
    checklist: ['Capture settlement payment reference.', 'Save proof or confirmation source.', 'Record any shortfall or bank close-out follow-up.'],
  }),
  cancellation_close_out_complete: Object.freeze({
    label: 'Close Cancellation',
    description: 'Confirm final bank close-out and archive readiness for the cancellation matter.',
    note: 'Cancellation close-out complete. Final bank confirmation, settlement proof, and archive readiness checked.',
    checklist: ['Confirm bank close-out.', 'Check all cancellation evidence is filed.', 'Complete matter close-out and archive readiness.'],
  }),
})

export const ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS = Object.freeze({
  bond_bond_guarantees_issued: Object.freeze({
    label: 'Request Bond Guarantees',
    subject: 'Bond guarantees issued',
    messagePrefix: 'Guarantee coordination request for Bond Attorney.',
    description: 'Ask the bond attorney to issue guarantees with the transfer wording, values, expiry, and delivery evidence.',
    checklist: [
      'Confirm guarantee wording and amounts required by transfer.',
      'Ask bond attorney for issued guarantee letter and expiry.',
      'Record delivery evidence before marking transfer guarantees accepted.',
    ],
  }),
  transfer_transfer_guarantee_acceptance: Object.freeze({
    label: 'Request Wording Acceptance',
    subject: 'Transfer guarantee acceptance',
    messagePrefix: 'Guarantee wording request for Transfer Attorney.',
    description: 'Ask the transfer attorney to accept or correct the bond guarantee wording and values.',
    checklist: [
      'Ask transfer attorney to confirm wording and amount acceptance.',
      'Record amendments required before bond lodgement readiness.',
      'Update bond guarantee wording accepted once transfer acceptance is saved.',
    ],
  }),
  cancellation_cancellation_guarantees_accepted: Object.freeze({
    label: 'Request Cancellation Acceptance',
    subject: 'Cancellation guarantees accepted',
    messagePrefix: 'Guarantee coordination request for Cancellation Attorney.',
    description: 'Ask the cancellation attorney to confirm cancellation figures, guarantee value, expiry, and bank acceptance.',
    checklist: [
      'Confirm cancellation figures and expiry are current.',
      'Ask cancellation attorney to confirm guarantee amount and bank acceptance.',
      'Record any settlement shortfall, expiry risk, or wording correction before transfer lodgement.',
    ],
  }),
  transfer_transfer_cancellation_alignment: Object.freeze({
    label: 'Request Transfer Alignment',
    subject: 'Transfer guarantee alignment',
    messagePrefix: 'Cancellation guarantee alignment request for Transfer Attorney.',
    description: 'Ask the transfer attorney to align guarantee values, wording, and lodgement timing with cancellation figures.',
    checklist: [
      'Confirm transfer guarantee wording and value match cancellation settlement requirements.',
      'Confirm cancellation figures expiry against the target lodgement date.',
      'Record amendments or timing risk before marking cancellation guarantees accepted.',
    ],
  }),
  bond_bond_lodgement_ready: Object.freeze({
    label: 'Request Bond Readiness',
    subject: 'Bond lodgement readiness',
    messagePrefix: 'Simultaneous lodgement request for Bond Attorney.',
    description: 'Ask the bond attorney to confirm approval to lodge, bond pack readiness, and simultaneous lodgement constraints.',
    checklist: [
      'Confirm bank approval to lodge has been received.',
      'Confirm the bond lodgement pack is ready.',
      'Record any condition that affects simultaneous lodgement timing.',
    ],
  }),
  cancellation_cancellation_lodgement_ready: Object.freeze({
    label: 'Request Cancellation Readiness',
    subject: 'Cancellation lodgement readiness',
    messagePrefix: 'Simultaneous lodgement request for Cancellation Attorney.',
    description: 'Ask the cancellation attorney to confirm valid figures, guarantee acceptance, cancellation pack readiness, and lodgement constraints.',
    checklist: [
      'Confirm cancellation figures are valid for the target lodgement date.',
      'Confirm guarantees are accepted and the cancellation pack is ready.',
      'Record any figures expiry, bank consent, or signing blocker affecting simultaneous lodgement.',
    ],
  }),
  transfer_transfer_lodgement_ready: Object.freeze({
    label: 'Request Transfer Readiness',
    subject: 'Transfer lodgement readiness',
    messagePrefix: 'Simultaneous lodgement request for Transfer Attorney.',
    description: 'Ask the transfer attorney to confirm the transfer pack is ready for simultaneous lodgement.',
    checklist: [
      'Confirm transfer lodgement pack readiness.',
      'Confirm guarantees and cancellation dependencies are resolved.',
      'Record target lodgement date or remaining blocker.',
    ],
  }),
})

function normalizeLaneKey(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'bond') return 'bond'
  if (normalized === 'cancellation') return 'cancellation'
  return 'transfer'
}

function normalizeStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'complete') return 'completed'
  if (normalized === 'approved') return 'approved'
  if (normalized === 'pending') return 'waiting'
  return normalized
}

function normalizeSeverity(value = 'medium') {
  const normalized = String(value || '').trim().toLowerCase()
  return SEVERITY_ORDER[normalized] ? normalized : 'medium'
}

function highestSeverity(items = []) {
  return (items || []).reduce((highest, item) => {
    const severity = normalizeSeverity(item.severity)
    return SEVERITY_ORDER[severity] > SEVERITY_ORDER[highest] ? severity : highest
  }, 'low')
}

function itemComplete(item = {}) {
  const status = normalizeStatus(item.status || item.reviewStatus || item.review_status)
  return Boolean(item.complete || ['approved', 'completed', 'complete'].includes(status))
}

function requiredItems(items = []) {
  return (items || []).filter((item) => item.required !== false && item.affectsReadiness !== false)
}

function stepIsComplete(steps = [], laneKey = 'transfer', expectedKeys = []) {
  return (steps || []).some(
    (step) => attorneyStageKeyMatches(step.stepKey || step.step_key || step.key, expectedKeys, laneKey) && normalizeStatus(step.status) === 'completed',
  )
}

function signingComplete(requirement = {}, laneKey = 'transfer', steps = [], documentRequirements = []) {
  if (itemComplete(requirement)) return true
  if (requirement.sourceRequirementId) {
    const source = (documentRequirements || []).find((item) => item.id === requirement.sourceRequirementId)
    if (itemComplete(source)) return true
  }
  if (['buyer_transfer_signature', 'buyer_transfer_documents_signature'].includes(requirement.id)) {
    return stepIsComplete(steps, laneKey, ['buyer_signed_transfer_documents'])
  }
  if (['seller_transfer_signature', 'seller_transfer_documents_signature'].includes(requirement.id)) {
    return stepIsComplete(steps, laneKey, ['seller_signed_transfer_documents'])
  }
  if (requirement.id === 'buyer_bond_documents_signature') {
    return stepIsComplete(steps, laneKey, ['buyer_signed_bond_documents'])
  }
  if (requirement.id === 'seller_cancellation_documents_signature') {
    return stepIsComplete(steps, laneKey, ['seller_cancellation_documents_signed', 'cancellation_documents_prepared'])
  }
  return false
}

function currentStepForLane({ laneKey, steps = [], currentStage = '', summary = {} } = {}) {
  const canonicalCurrent = normalizeAttorneyStageKey(currentStage || summary.currentStage, laneKey)
  return (
    (steps || []).find((step) => normalizeAttorneyStageKey(step.stepKey || step.step_key || step.key, laneKey) === canonicalCurrent) ||
    (steps || []).find((step) => ['blocked', 'waiting', 'in_progress'].includes(normalizeStatus(step.status))) ||
    (steps || []).find((step) => normalizeStatus(step.status) !== 'completed') ||
    (steps || []).at(-1) ||
    null
  )
}

function buildAction({
  id,
  label,
  description = '',
  type = 'update_workflow',
  target = 'attorney',
  priority = 'medium',
  laneKey = 'transfer',
  stageKey = null,
  relatedId = null,
}) {
  return {
    id,
    label,
    description,
    type,
    target,
    priority: normalizeSeverity(priority),
    laneKey: normalizeLaneKey(laneKey),
    stageKey,
    relatedId,
  }
}

function sortActions(left, right) {
  const severityDelta = (SEVERITY_ORDER[right.priority] || 0) - (SEVERITY_ORDER[left.priority] || 0)
  if (severityDelta) return severityDelta
  return 0
}

function summarizeCount(count, singular, plural = `${singular}s`) {
  if (!count) return ''
  return `${count} ${count === 1 ? singular : plural}`
}

function buildAttentionSummary({ missingData, outstandingDocuments, outstandingSignatures, evidenceChecklist, assignment }) {
  const parts = [
    !assignment ? 'assignment missing' : '',
    summarizeCount(missingData.length, 'data field'),
    summarizeCount(outstandingDocuments.length, 'document'),
    summarizeCount(outstandingSignatures.length, 'signature'),
    summarizeCount(evidenceChecklist.filter((item) => !item.complete).length, 'evidence item'),
  ].filter(Boolean)
  return parts.length ? parts.join(' • ') : 'No immediate workflow blockers visible.'
}

function compactText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function sentence(...parts) {
  return compactText(parts.filter(Boolean).join(' ')).replace(/\s+\./g, '.')
}

function stripActionPrefix(label = '') {
  return compactText(label)
    .replace(/^request\s+corrected\s+/i, '')
    .replace(/^request\s+/i, '')
    .replace(/^correct\s+/i, '')
    .replace(/^capture\s+/i, '')
    .replace(/^follow\s+up\s+/i, '')
    .replace(/^resolve\s+/i, '')
    .replace(/^complete\s+/i, '')
}

function normalizeRequestedFrom(target = '') {
  const normalized = String(target || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return 'client'
  if (normalized.includes('buyer') || normalized.includes('purchaser')) return 'buyer'
  if (normalized.includes('seller') || normalized.includes('vendor')) return 'seller'
  if (normalized.includes('bank')) return 'bank'
  if (normalized.includes('agent') || normalized.includes('developer')) return 'agent'
  if (normalized.includes('attorney') || normalized.includes('conveyancer') || normalized.includes('originator') || normalized.includes('management')) return 'attorney'
  return 'client'
}

function requestedFromLabel(value = '') {
  const normalized = normalizeRequestedFrom(value)
  if (normalized === 'buyer') return 'Buyer'
  if (normalized === 'seller') return 'Seller'
  if (normalized === 'bank') return 'Bank'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'attorney') return 'Attorney Team'
  return 'Client'
}

function normalizeCommandVisibility(value = '', fallback = 'internal') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'shared' || normalized === 'shared_role_players') return 'professional_shared'
  if (normalized === 'client') return 'client_visible'
  if (normalized === 'internal_only') return 'internal'
  return VISIBILITY_LABELS[normalized] ? normalized : fallback
}

function documentVisibilityForAudience(audience = 'client') {
  const normalized = normalizeRequestedFrom(audience)
  if (['buyer', 'seller', 'client'].includes(normalized)) return 'client_visible'
  if (['bank', 'agent', 'attorney'].includes(normalized)) return 'professional_shared'
  return 'professional_shared'
}

function commandPriorityForAction(action = {}, fallback = 'required') {
  const actionType = String(action.type || '').trim().toLowerCase()
  if (actionType === 'request_corrected_document') return 'urgent'
  const priority = normalizeSeverity(action.priority || fallback)
  if (priority === 'critical' || priority === 'high') return 'urgent'
  if (priority === 'low') return 'optional'
  return 'required'
}

function dueDaysForAction(action = {}, commandType = '') {
  const actionType = String(action.type || '').trim().toLowerCase()
  const priority = normalizeSeverity(action.priority)
  if (actionType === 'request_corrected_document' || priority === 'critical') return 1
  if (priority === 'high' || commandType === 'schedule_signing') return 2
  if (priority === 'medium') return 3
  return 7
}

function isoDatePlusDays(value, days = 3) {
  const date = new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildWorkPacket({
  action = {},
  laneKey = 'transfer',
  stageKey = '',
  subject = '',
  commandType = 'add_note',
  requestedFrom = '',
  visibility = 'internal',
  priority = 'required',
  dueDate = '',
  checklist = [],
  now = null,
} = {}) {
  const normalizedVisibility = normalizeCommandVisibility(visibility)
  const normalizedPriority = ['urgent', 'required', 'optional'].includes(priority) ? priority : 'required'
  const stageLabel = stageKey ? getAttorneyStageLabel(stageKey, laneKey) : ''
  return {
    title: subject || action.label || 'Workflow action',
    laneKey,
    laneLabel: LANE_LABELS[laneKey] || 'Transfer Attorney',
    stageKey,
    stageLabel,
    commandType,
    audience: requestedFrom ? normalizeRequestedFrom(requestedFrom) : action.target || 'attorney',
    audienceLabel: requestedFrom ? requestedFromLabel(requestedFrom) : requestedFromLabel(action.target || 'attorney'),
    priority: normalizedPriority,
    priorityLabel: PRIORITY_LABELS[normalizedPriority] || 'Required',
    visibility: normalizedVisibility,
    visibilityLabel: VISIBILITY_LABELS[normalizedVisibility] || 'Internal',
    dueDate: dueDate || isoDatePlusDays(now, dueDaysForAction(action, commandType)),
    checklist: checklist.filter(Boolean),
  }
}

export function normalizeAttorneyWorkflowWorkPacket(packet = null) {
  if (!packet || typeof packet !== 'object') return null
  const laneKey = normalizeLaneKey(packet.laneKey)
  const stageKey = normalizeAttorneyStageKey(packet.stageKey || '', laneKey)
  const visibility = normalizeCommandVisibility(packet.visibility)
  const priority = ['urgent', 'required', 'optional'].includes(packet.priority) ? packet.priority : 'required'
  const checklist = Array.isArray(packet.checklist)
    ? packet.checklist.map((item) => compactText(item)).filter(Boolean).slice(0, 6)
    : []
  const clientAudience = Array.isArray(packet.clientAudience)
    ? [...new Set(packet.clientAudience.map((item) => compactText(item).toLowerCase()).filter((item) => ['buyer', 'seller'].includes(item)))]
    : []

  return {
    title: compactText(packet.title || 'Workflow action'),
    laneKey,
    laneLabel: compactText(packet.laneLabel || LANE_LABELS[laneKey] || 'Transfer Attorney'),
    stageKey,
    stageLabel: compactText(packet.stageLabel || (stageKey ? getAttorneyStageLabel(stageKey, laneKey) : '')),
    commandType: compactText(packet.commandType || 'add_note'),
    audience: compactText(packet.audience || 'attorney'),
    audienceLabel: compactText(packet.audienceLabel || requestedFromLabel(packet.audience || 'attorney')),
    priority,
    priorityLabel: PRIORITY_LABELS[priority] || 'Required',
    visibility,
    visibilityLabel: VISIBILITY_LABELS[visibility] || 'Internal',
    dueDate: compactText(packet.dueDate || ''),
    checklist,
    sourceFollowUpId: compactText(packet.sourceFollowUpId || ''),
    sourceFollowUpSource: compactText(packet.sourceFollowUpSource || ''),
    sourceFollowUpRelatedId: compactText(packet.sourceFollowUpRelatedId || ''),
    sourceFollowUpStatus: compactText(packet.sourceFollowUpStatus || ''),
    sourceCoordinationId: compactText(packet.sourceCoordinationId || ''),
    sourceCoordinationLaneKey: compactText(packet.sourceCoordinationLaneKey || ''),
    sourceCoordinationTargetStage: compactText(packet.sourceCoordinationTargetStage || ''),
    sourceCoordinationStatus: compactText(packet.sourceCoordinationStatus || ''),
    contractVersion: compactText(packet.contractVersion || ''),
    taskType: compactText(packet.taskType || ''),
    statusAction: compactText(packet.statusAction || ''),
    clientAudience,
    eventKey: compactText(packet.eventKey || ''),
  }
}

function buildNoteDraft({ laneKey, message, visibility = 'internal', workPacket = null }) {
  return {
    laneKey,
    visibility: normalizeCommandVisibility(visibility),
    message: compactText(message),
    workPacket: normalizeAttorneyWorkflowWorkPacket(workPacket),
  }
}

function buildCommand({
  action = {},
  laneKey = 'transfer',
  stageKey = '',
  commandType = 'add_note',
  label = 'Start Action',
  description = '',
  draft = null,
  workPacket = null,
}) {
  const normalizedWorkPacket = normalizeAttorneyWorkflowWorkPacket(workPacket)
  const normalizedDraft = draft && typeof draft === 'object' && 'workPacket' in draft
    ? { ...draft, workPacket: normalizedWorkPacket }
    : draft

  return {
    id: `${action.id || action.type || 'workflow'}_command`,
    actionId: action.id || '',
    actionType: action.type || '',
    commandType,
    label,
    description,
    laneKey,
    stageKey,
    relatedId: action.relatedId || '',
    workPacket: normalizedWorkPacket,
    draft: normalizedDraft,
  }
}

function getBondAttorneyStageCommandPreset(stageKey = '') {
  return BOND_ATTORNEY_STAGE_COMMAND_PRESETS[stageKey] || null
}

function getCancellationAttorneyStageCommandPreset(stageKey = '') {
  return CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS[stageKey] || null
}

function buildBondAttorneyStageSpecificCommand({
  action = {},
  laneKey = 'transfer',
  stageKey = '',
  actionType = '',
  actionLabel = '',
  actionDescription = '',
  now = null,
} = {}) {
  if (laneKey !== 'bond') return null
  const preset = getBondAttorneyStageCommandPreset(stageKey)
  if (!preset) return null
  if (!['complete_stage_evidence', 'resolve_blocker', 'update_matter_data', 'manage_signing', 'review_workflow'].includes(actionType)) return null

  const blocked = actionType === 'resolve_blocker'
  const commandType = blocked ? 'add_note' : preset.commandType || 'complete_step'
  const priority = blocked ? 'urgent' : commandPriorityForAction(action)
  const label = blocked ? 'Add Bond Blocker Note' : preset.label || 'Update Bond Stage'
  const visibility = preset.visibility || 'internal'
  const requestedFrom = preset.requestedFrom || action.target || 'bond_attorney'
  const description = preset.description || actionDescription || 'Capture the bond attorney workflow update.'
  const workPacket = buildWorkPacket({
    action,
    laneKey,
    stageKey,
    subject: preset.label || actionLabel,
    commandType,
    requestedFrom,
    priority,
    visibility,
    checklist: preset.checklist || [],
    now,
  })

  if (commandType === 'add_note') {
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType,
      label,
      description,
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility,
        message: sentence(blocked ? `Blocker update for ${preset.label}.` : preset.note, blocked ? actionDescription : ''),
        workPacket,
      }),
    })
  }

  if (commandType === 'schedule_signing') {
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType,
      label,
      description,
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility,
        message: sentence(preset.note, actionDescription),
        workPacket,
      }),
    })
  }

  return buildCommand({
    action,
    laneKey,
    stageKey,
    commandType: 'complete_step',
    label,
    description,
    workPacket,
    draft: {
      laneKey,
      status: 'completed',
      note: sentence(preset.note, actionDescription),
      workPacket,
    },
  })
}

function buildCancellationAttorneyStageSpecificCommand({
  action = {},
  laneKey = 'transfer',
  stageKey = '',
  actionType = '',
  actionLabel = '',
  actionDescription = '',
  now = null,
} = {}) {
  if (laneKey !== 'cancellation') return null
  const preset = getCancellationAttorneyStageCommandPreset(stageKey)
  if (!preset) return null
  if (!['complete_stage_evidence', 'resolve_blocker', 'update_matter_data', 'manage_signing', 'review_workflow', 'request_document', 'request_corrected_document'].includes(actionType)) return null

  const blocked = actionType === 'resolve_blocker'
  const corrected = actionType === 'request_corrected_document'
  const commandType = blocked ? 'add_note' : preset.commandType || 'complete_step'
  const priority = preset.priority || (blocked ? 'urgent' : commandPriorityForAction(action))
  const label = blocked
    ? 'Add Cancellation Blocker Note'
    : corrected
      ? 'Request Cancellation Correction'
      : preset.label || 'Update Cancellation Stage'
  const visibility = preset.visibility || 'internal'
  const requestedFrom = preset.requestedFrom || action.target || 'cancellation_attorney'
  const description = preset.description || actionDescription || 'Capture the cancellation attorney workflow update.'
  const workPacket = buildWorkPacket({
    action,
    laneKey,
    stageKey,
    subject: preset.label || actionLabel,
    commandType,
    requestedFrom,
    priority,
    visibility,
    checklist: preset.checklist || [],
    now,
  })

  if (commandType === 'request_document') {
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType,
      label,
      description,
      workPacket,
      draft: {
        laneKey,
        title: preset.label || actionLabel,
        requestedFrom: normalizeRequestedFrom(requestedFrom),
        priority: workPacket.priority,
        visibility: workPacket.visibility,
        dueDate: workPacket.dueDate,
        workPacket,
        description: sentence(
          corrected ? `Please provide a corrected ${preset.label || actionLabel}.` : preset.note,
          actionDescription,
        ),
      },
    })
  }

  if (commandType === 'add_note') {
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType,
      label,
      description,
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility,
        message: sentence(blocked ? `Blocker update for ${preset.label}.` : preset.note, blocked ? actionDescription : ''),
        workPacket,
      }),
    })
  }

  return buildCommand({
    action,
    laneKey,
    stageKey,
    commandType: 'complete_step',
    label,
    description,
    workPacket,
    draft: {
      laneKey,
      status: 'completed',
      note: sentence(preset.note, actionDescription),
      workPacket,
    },
  })
}

export function buildAttorneyWorkflowActionCommand(action = {}, context = {}) {
  const laneKey = normalizeLaneKey(action.laneKey || context.laneKey)
  const stageKey = normalizeAttorneyStageKey(action.stageKey || context.stageKey || '', laneKey)
  const actionType = String(action.type || '').trim().toLowerCase()
  const actionLabel = compactText(action.label || 'Review workflow')
  const actionDescription = compactText(action.description || '')
  const subject = stripActionPrefix(actionLabel) || actionLabel
  const now = context.now || null
  const bondStageCommand = buildBondAttorneyStageSpecificCommand({
    action,
    laneKey,
    stageKey,
    actionType,
    actionLabel,
    actionDescription,
    now,
  })
  if (bondStageCommand) return bondStageCommand

  const cancellationStageCommand = buildCancellationAttorneyStageSpecificCommand({
    action,
    laneKey,
    stageKey,
    actionType,
    actionLabel,
    actionDescription,
    now,
  })
  if (cancellationStageCommand) return cancellationStageCommand

  if (actionType === 'assign_attorney') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject: actionLabel,
      commandType: 'open_assignments',
      requestedFrom: 'attorney',
      priority: 'urgent',
      visibility: 'internal',
      checklist: ['Confirm the correct firm and responsible attorney.', 'Check whether the lane is required for this transaction.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'open_assignments',
      label: 'Open Assignment',
      description: 'Choose or confirm the firm responsible for this legal lane.',
      workPacket,
    })
  }

  if (actionType === 'request_document' || actionType === 'request_corrected_document') {
    const corrected = actionType === 'request_corrected_document'
    const title = subject || 'Required Document'
    const requestedFrom = normalizeRequestedFrom(action.target)
    const priority = commandPriorityForAction(action)
    const visibility = documentVisibilityForAudience(requestedFrom)
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject: title,
      commandType: 'request_document',
      requestedFrom,
      priority,
      visibility,
      checklist: [
        corrected ? 'Explain what must be corrected.' : 'Confirm the exact document name before sending.',
        'Check that the request is routed to the right party.',
        'Attach or reference any rejected copy if available.',
      ],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'request_document',
      label: corrected ? 'Request Correction' : 'Request Document',
      description: corrected ? 'Prepare a corrected document request.' : 'Prepare a missing document request.',
      workPacket,
      draft: {
        laneKey,
        title,
        requestedFrom,
        priority,
        visibility,
        dueDate: workPacket.dueDate,
        workPacket,
        description: sentence(
          corrected ? `Please provide a corrected ${title}.` : `Please provide ${title}.`,
          actionDescription,
        ),
      },
    })
  }

  if (actionType === 'manage_signing') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject,
      commandType: 'schedule_signing',
      requestedFrom: action.target || 'client',
      priority: commandPriorityForAction(action),
      visibility: 'internal',
      checklist: ['Confirm signer availability.', 'Confirm the document pack is ready.', 'Record the appointment date and channel.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'schedule_signing',
      label: 'Schedule Signing',
      description: 'Prepare a signing follow-up note for the workflow.',
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility: workPacket.visibility,
        message: sentence(actionLabel, actionDescription || 'Confirm date, signer, and documents for signing.'),
        workPacket,
      }),
    })
  }

  if (actionType === 'complete_stage_evidence') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject,
      commandType: 'complete_step',
      requestedFrom: action.target || 'attorney',
      priority: commandPriorityForAction(action),
      visibility: 'internal',
      checklist: ['Confirm evidence exists on the matter.', 'Add a note identifying the evidence captured.', 'Only complete the stage when the checklist is satisfied.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'complete_step',
      label: 'Complete Stage',
      description: 'Open the active step completion form with the evidence note started.',
      workPacket,
      draft: {
        laneKey,
        status: 'completed',
        note: sentence('Evidence captured.', actionDescription),
        workPacket,
      },
    })
  }

  if (actionType === 'resolve_blocker') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject,
      commandType: 'add_note',
      requestedFrom: action.target || 'attorney',
      priority: commandPriorityForAction(action),
      visibility: 'internal',
      checklist: ['Record the blocker owner.', 'Capture the next follow-up needed.', 'Update the step status once the blocker is cleared.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'add_note',
      label: 'Add Resolution Note',
      description: 'Record what changed or what is still blocking the stage.',
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility: workPacket.visibility,
        message: sentence(`Blocker update for ${subject || 'current stage'}.`, actionDescription),
        workPacket,
      }),
    })
  }

  if (actionType === 'update_matter_data') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject,
      commandType: 'add_note',
      requestedFrom: action.target || 'attorney',
      priority: commandPriorityForAction(action),
      visibility: 'internal',
      checklist: ['Confirm the source of the data.', 'Capture it on the matter record.', 'Note who supplied the information.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'add_note',
      label: 'Add Data Note',
      description: 'Record the missing data so the team can capture it on the matter.',
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility: workPacket.visibility,
        message: sentence(`Matter data needed: ${subject || 'required field'}.`, actionDescription),
        workPacket,
      }),
    })
  }

  const workPacket = buildWorkPacket({
    action,
    laneKey,
    stageKey,
    subject: actionLabel,
    commandType: 'add_note',
    requestedFrom: action.target || 'attorney',
    priority: commandPriorityForAction(action),
    visibility: 'internal',
    checklist: ['Review the current workflow state.', 'Record the outcome or next follow-up.'],
    now,
  })
  return buildCommand({
    action,
    laneKey,
    stageKey,
    commandType: 'add_note',
    label: actionType === 'review_workflow' ? 'Add Review Note' : 'Add Note',
    description: 'Record a workflow note from this action.',
    workPacket,
    draft: buildNoteDraft({
      laneKey,
      visibility: workPacket.visibility,
      message: sentence(actionLabel, actionDescription),
      workPacket,
    }),
  })
}

function parseDateOnly(value = '') {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function daysUntil(dueDate = '', now = null) {
  const due = parseDateOnly(dueDate)
  const base = parseDateOnly(now || new Date().toISOString())
  if (!due || !base) return null
  return Math.round((due.getTime() - base.getTime()) / 86400000)
}

function daysSince(value = '', now = null) {
  const start = parseDateOnly(value)
  const base = parseDateOnly(now || new Date().toISOString())
  if (!start || !base) return null
  return Math.max(0, Math.round((base.getTime() - start.getTime()) / 86400000))
}

function normalizeFollowUpPriority(value = '', fallback = 'required') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['urgent', 'critical', 'high'].includes(normalized)) return 'urgent'
  if (['optional', 'low'].includes(normalized)) return 'optional'
  if (['medium', 'normal', 'required', 'important'].includes(normalized)) return 'required'
  return fallback
}

function normalizeDocumentRequestStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['approved', 'completed', 'complete'].includes(normalized)) return 'closed'
  if (['rejected', 'declined'].includes(normalized)) return 'needs_correction'
  if (['uploaded', 'under_review', 'pending_review'].includes(normalized)) return 'review_pending'
  return 'open'
}

function classifyFollowUp({ dueDate = '', priority = 'required', status = 'open', now = null } = {}) {
  if (status === 'closed') return 'closed'
  if (status === 'needs_correction') return 'needs_correction'
  if (status === 'review_pending') return 'review_pending'
  const remaining = daysUntil(dueDate, now)
  if (remaining !== null && remaining < 0) return 'overdue'
  if (remaining === 0) return 'due_today'
  if (remaining !== null && remaining <= 2) return 'due_soon'
  if (priority === 'urgent') return 'urgent'
  return dueDate ? 'open' : 'unscheduled'
}

function followUpStatusLabel(status = 'open') {
  if (status === 'needs_correction') return 'Needs Correction'
  if (status === 'review_pending') return 'Review Pending'
  if (status === 'overdue') return 'Overdue'
  if (status === 'due_today') return 'Due Today'
  if (status === 'due_soon') return 'Due Soon'
  if (status === 'urgent') return 'Urgent'
  if (status === 'unscheduled') return 'No Due Date'
  return 'Open'
}

function buildFollowUpItem({
  id,
  source,
  title,
  description = '',
  laneKey = 'transfer',
  stageKey = '',
  commandType = '',
  audience = 'attorney',
  audienceLabel = '',
  priority = 'required',
  dueDate = '',
  visibility = 'internal',
  status = 'open',
  checklist = [],
  relatedId = '',
  now = null,
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const normalizedPriority = normalizeFollowUpPriority(priority)
  const normalizedStatus = classifyFollowUp({ dueDate, priority: normalizedPriority, status, now })
  if (normalizedStatus === 'closed') return null
  return {
    id,
    source,
    title: compactText(title || 'Workflow follow-up'),
    description: compactText(description),
    laneKey: normalizedLaneKey,
    laneLabel: LANE_LABELS[normalizedLaneKey] || 'Transfer Attorney',
    stageKey: normalizeAttorneyStageKey(stageKey || '', normalizedLaneKey),
    stageLabel: stageKey ? getAttorneyStageLabel(stageKey, normalizedLaneKey) : '',
    commandType,
    audience: compactText(audience || 'attorney'),
    audienceLabel: compactText(audienceLabel || requestedFromLabel(audience || 'attorney')),
    priority: normalizedPriority,
    priorityLabel: PRIORITY_LABELS[normalizedPriority] || 'Required',
    visibility: normalizeCommandVisibility(visibility),
    dueDate: compactText(dueDate || ''),
    dueInDays: daysUntil(dueDate, now),
    status: normalizedStatus,
    statusLabel: followUpStatusLabel(normalizedStatus),
    checklist: Array.isArray(checklist) ? checklist.filter(Boolean).slice(0, 4) : [],
    relatedId: relatedId || '',
  }
}

function sortFollowUps(left, right) {
  const statusOrder = {
    needs_correction: 0,
    overdue: 1,
    due_today: 2,
    due_soon: 3,
    review_pending: 4,
    urgent: 5,
    open: 6,
    unscheduled: 7,
  }
  const statusDelta = (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99)
  if (statusDelta) return statusDelta
  const leftDue = parseDateOnly(left.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
  const rightDue = parseDateOnly(right.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
  if (leftDue !== rightDue) return leftDue - rightDue
  return (SEVERITY_ORDER[right.priority] || 0) - (SEVERITY_ORDER[left.priority] || 0)
}

function buildFollowUpResolutionIndex(timeline = []) {
  const ids = new Set()
  const relatedKeys = new Set()

  for (const entry of timeline || []) {
    const packet = normalizeAttorneyWorkflowWorkPacket(entry?.metadata?.workPacket)
    if (!packet?.sourceFollowUpId) continue
    ids.add(packet.sourceFollowUpId)
    if (packet.sourceFollowUpRelatedId) {
      relatedKeys.add(`${packet.sourceFollowUpSource || 'workflow'}:${packet.sourceFollowUpRelatedId}`)
    }
  }

  return { ids, relatedKeys }
}

function followUpWasActioned(index, { id = '', source = 'workflow', relatedId = '' } = {}) {
  if (!index) return false
  if (id && index.ids.has(id)) return true
  if (relatedId && index.relatedKeys.has(`${source || 'workflow'}:${relatedId}`)) return true
  return false
}

export function buildAttorneyWorkflowFollowUpSummary({
  laneKey = 'transfer',
  label = '',
  timeline = [],
  documentRequests = [],
  nextActions = [],
  now = null,
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const items = []
  const seen = new Set()
  const actioned = buildFollowUpResolutionIndex(timeline)

  function add(item) {
    if (!item || seen.has(item.id)) return
    if (followUpWasActioned(actioned, item)) return
    seen.add(item.id)
    items.push(item)
  }

  for (const request of documentRequests || []) {
    const status = normalizeDocumentRequestStatus(request.review_status || request.reviewStatus || request.status)
    const priority = status === 'needs_correction' ? 'urgent' : normalizeFollowUpPriority(request.priority)
    const audience = request.requested_from || request.requestedFrom || request.assigned_to_role || request.assignedToRole || 'client'
    add(buildFollowUpItem({
      id: `document_${request.id || request.requirement_id || request.title}`,
      source: 'document_request',
      title: status === 'needs_correction' ? `Correct ${request.title || 'document'}` : request.title || 'Document request',
      description: status === 'needs_correction'
        ? request.rejection_reason || request.rejected_reason || request.description || 'A corrected document is required.'
        : request.description || '',
      laneKey: request.lane_key || request.laneKey || normalizedLaneKey,
      audience,
      audienceLabel: requestedFromLabel(audience),
      priority,
      dueDate: request.due_date || request.dueDate || '',
      visibility: request.visibility_scope || request.visibility || documentVisibilityForAudience(audience),
      status,
      relatedId: request.id || request.requirement_id || '',
      now,
    }))
  }

  for (const entry of timeline || []) {
    const packet = normalizeAttorneyWorkflowWorkPacket(entry?.metadata?.workPacket)
    if (!packet || packet.commandType === 'complete_step') continue
    if (packet.sourceFollowUpId) continue
    add(buildFollowUpItem({
      id: `packet_${entry.id || packet.title}`,
      source: 'work_packet',
      title: packet.title,
      description: entry.message || entry.body || '',
      laneKey: packet.laneKey || normalizedLaneKey,
      stageKey: packet.stageKey,
      commandType: packet.commandType,
      audience: packet.audience,
      audienceLabel: packet.audienceLabel,
      priority: packet.priority,
      dueDate: packet.dueDate,
      visibility: packet.visibility,
      checklist: packet.checklist,
      relatedId: entry.relatedDocumentId || '',
      now,
    }))
  }

  for (const action of nextActions || []) {
    const command = buildAttorneyWorkflowActionCommand(action, { laneKey: normalizedLaneKey, now })
    const packet = command.workPacket
    if (!packet) continue
    add(buildFollowUpItem({
      id: `next_${action.id || command.id}`,
      source: 'next_action',
      title: action.label || packet.title,
      description: action.description || command.description || '',
      laneKey: normalizedLaneKey,
      stageKey: packet.stageKey,
      commandType: command.commandType,
      audience: packet.audience,
      audienceLabel: packet.audienceLabel,
      priority: packet.priority,
      dueDate: packet.dueDate,
      visibility: packet.visibility,
      checklist: packet.checklist,
      relatedId: action.relatedId || '',
      now,
    }))
  }

  const sorted = items.sort(sortFollowUps)
  const counts = sorted.reduce((accumulator, item) => {
    accumulator.total += 1
    if (item.status === 'needs_correction') accumulator.needsCorrection += 1
    if (item.status === 'overdue') accumulator.overdue += 1
    if (item.status === 'due_today') accumulator.dueToday += 1
    if (item.status === 'due_soon') accumulator.dueSoon += 1
    if (item.priority === 'urgent') accumulator.urgent += 1
    if (['buyer', 'seller', 'client'].includes(item.audience)) accumulator.clientFacing += 1
    if (['bank', 'agent', 'attorney'].includes(item.audience)) accumulator.professionalFacing += 1
    return accumulator
  }, {
    total: 0,
    needsCorrection: 0,
    overdue: 0,
    dueToday: 0,
    dueSoon: 0,
    urgent: 0,
    clientFacing: 0,
    professionalFacing: 0,
    actioned: actioned.ids.size,
  })

  const health = counts.needsCorrection || counts.overdue
    ? 'critical'
    : counts.dueToday || counts.dueSoon || counts.urgent
      ? 'attention'
      : counts.total
        ? 'open'
        : 'clear'

  return {
    laneKey: normalizedLaneKey,
    laneLabel: label || LANE_LABELS[normalizedLaneKey] || 'Transfer Attorney',
    health,
    primaryFollowUp: sorted[0] || null,
    counts,
    actionedFollowUpIds: [...actioned.ids],
    items: sorted.slice(0, 10),
  }
}

function severityFromFollowUpPriority(priority = 'required') {
  const normalized = normalizeFollowUpPriority(priority)
  if (normalized === 'urgent') return 'high'
  if (normalized === 'optional') return 'low'
  return 'medium'
}

function actionTypeFromFollowUp(followUp = {}) {
  if (followUp.status === 'needs_correction') return 'request_corrected_document'
  if (followUp.source === 'document_request') return 'request_document'
  if (followUp.commandType === 'request_document') return 'request_document'
  if (followUp.commandType === 'schedule_signing') return 'manage_signing'
  if (followUp.commandType === 'complete_step') return 'complete_stage_evidence'
  if (String(followUp.title || '').toLowerCase().includes('data')) return 'update_matter_data'
  return 'review_workflow'
}

export function buildAttorneyWorkflowFollowUpCommand(followUp = {}, context = {}) {
  const laneKey = normalizeLaneKey(followUp.laneKey || context.laneKey)
  const actionType = actionTypeFromFollowUp(followUp)
  const title = compactText(followUp.title || 'Workflow follow-up')
  const documentTitle = ['request_corrected_document', 'request_document'].includes(actionType)
    ? stripActionPrefix(title) || title
    : title
  const actionLabel =
    actionType === 'request_corrected_document'
      ? `Request corrected ${documentTitle}`
      : actionType === 'request_document'
        ? `Request ${documentTitle}`
        : title
  const action = {
    id: followUp.id || `${laneKey}_follow_up`,
    label: actionLabel,
    description: followUp.description || `${followUp.statusLabel || 'Open'} follow-up.`,
    type: actionType,
    target: followUp.audience || 'attorney',
    priority: severityFromFollowUpPriority(followUp.priority),
    laneKey,
    stageKey: followUp.stageKey || context.stageKey || '',
    relatedId: followUp.relatedId || '',
  }
  const command = buildAttorneyWorkflowActionCommand(action, {
    laneKey,
    stageKey: followUp.stageKey || context.stageKey || '',
    now: context.now || null,
  })
  const packet = normalizeAttorneyWorkflowWorkPacket({
    ...(command.workPacket || {}),
    title: command.commandType === 'request_document' ? documentTitle : title,
    laneKey,
    laneLabel: followUp.laneLabel || command.workPacket?.laneLabel,
    stageKey: followUp.stageKey || command.workPacket?.stageKey,
    stageLabel: followUp.stageLabel || command.workPacket?.stageLabel,
    commandType: command.commandType,
    audience: followUp.audience || command.workPacket?.audience,
    audienceLabel: followUp.audienceLabel || command.workPacket?.audienceLabel,
    priority: followUp.priority || command.workPacket?.priority,
    priorityLabel: followUp.priorityLabel || command.workPacket?.priorityLabel,
    visibility: followUp.visibility || command.workPacket?.visibility,
    dueDate: followUp.dueDate || command.workPacket?.dueDate,
    checklist: followUp.checklist?.length ? followUp.checklist : command.workPacket?.checklist,
    sourceFollowUpId: followUp.id || '',
    sourceFollowUpSource: followUp.source || '',
    sourceFollowUpRelatedId: followUp.relatedId || '',
    sourceFollowUpStatus: followUp.status || '',
  })
  const draft = command.draft && typeof command.draft === 'object'
    ? {
        ...command.draft,
        title: command.commandType === 'request_document' ? documentTitle : command.draft.title,
        requestedFrom: command.commandType === 'request_document' ? followUp.audience || command.draft.requestedFrom : command.draft.requestedFrom,
        priority: command.commandType === 'request_document' ? followUp.priority || command.draft.priority : command.draft.priority,
        visibility: command.commandType === 'request_document' ? followUp.visibility || command.draft.visibility : command.draft.visibility,
        dueDate: command.commandType === 'request_document' ? followUp.dueDate || command.draft.dueDate : command.draft.dueDate,
        workPacket: packet,
      }
    : command.draft

  return {
    ...command,
    id: `${followUp.id || command.id}_follow_up_command`,
    label:
      followUp.status === 'needs_correction'
        ? 'Request Correction'
        : followUp.status === 'review_pending'
          ? 'Review Follow-up'
          : command.label,
    workPacket: packet,
    draft,
    followUpId: followUp.id || '',
  }
}

const COORDINATION_RULES = {
  transfer: [
    {
      id: 'bond_guarantees_issued',
      dependencyLaneKey: 'bond',
      title: 'Bond guarantees issued',
      description: 'Transfer can accept guarantees once the bond attorney has issued them.',
      targetStages: ['guarantees_issued'],
    },
    {
      id: 'bond_lodgement_ready',
      dependencyLaneKey: 'bond',
      title: 'Bond lodgement readiness',
      description: 'Bond pack must be ready before simultaneous lodgement is confirmed.',
      targetStages: ['bond_lodgement_ready'],
    },
    {
      id: 'cancellation_guarantees_accepted',
      dependencyLaneKey: 'cancellation',
      title: 'Cancellation guarantees accepted',
      description: 'Cancellation guarantees must be accepted before transfer proceeds to lodgement.',
      targetStages: ['cancellation_guarantees_accepted'],
    },
    {
      id: 'cancellation_lodgement_ready',
      dependencyLaneKey: 'cancellation',
      title: 'Cancellation lodgement readiness',
      description: 'Cancellation must be ready for simultaneous lodgement with the transfer.',
      targetStages: ['cancellation_lodgement_ready'],
    },
  ],
  bond: [
    {
      id: 'transfer_guarantee_acceptance',
      dependencyLaneKey: 'transfer',
      title: 'Transfer guarantee acceptance',
      description: 'Bond attorney needs the transfer attorney to accept guarantee wording and values.',
      targetStages: ['transfer_guarantees_accepted'],
    },
    {
      id: 'transfer_lodgement_ready',
      dependencyLaneKey: 'transfer',
      title: 'Transfer lodgement readiness',
      description: 'Bond lodgement should align with transfer lodgement readiness.',
      targetStages: ['lodgement_ready'],
    },
  ],
  cancellation: [
    {
      id: 'transfer_cancellation_alignment',
      dependencyLaneKey: 'transfer',
      title: 'Transfer guarantee alignment',
      description: 'Cancellation figures and guarantees must align with the transfer attorney.',
      targetStages: ['transfer_guarantees_accepted'],
    },
    {
      id: 'transfer_lodgement_ready',
      dependencyLaneKey: 'transfer',
      title: 'Transfer lodgement readiness',
      description: 'Cancellation lodgement should align with transfer lodgement readiness.',
      targetStages: ['lodgement_ready'],
    },
  ],
}

function getLaneFromCollection(lanes = [], laneKey = 'transfer') {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  return (lanes || []).find((lane) => normalizeLaneKey(lane?.laneKey || lane?.processType || lane?.attorneyRole) === normalizedLaneKey) || null
}

function laneAssignmentPresent(lane = {}) {
  return Boolean(lane?.assignment || lane?.assignmentId || lane?.assignedFirm || lane?.firmName)
}

function getLaneCurrentStage(lane = {}) {
  return lane?.currentStage || lane?.summary?.currentStage || ''
}

function getLaneStepIndex(steps = [], laneKey = 'transfer', stageKey = '') {
  const normalizedStageKey = normalizeAttorneyStageKey(stageKey || '', laneKey)
  if (!normalizedStageKey) return -1
  return (steps || []).findIndex((step) =>
    normalizeAttorneyStageKey(step?.stepKey || step?.step_key || step?.key || '', laneKey) === normalizedStageKey,
  )
}

function laneStageReached(lane = {}, targetStages = []) {
  if (!lane) return false
  const laneKey = normalizeLaneKey(lane.laneKey || lane.processType || lane.attorneyRole)
  const laneStatus = normalizeStatus(lane.laneStatus || lane.status || lane.summary?.status)
  if (laneStatus === 'completed') return true

  const steps = Array.isArray(lane.steps) ? lane.steps : []
  const currentStage = normalizeAttorneyStageKey(getLaneCurrentStage(lane), laneKey)
  const currentIndex = getLaneStepIndex(steps, laneKey, currentStage)
  const targetKeys = (targetStages || [])
    .map((stageKey) => normalizeAttorneyStageKey(stageKey, laneKey))
    .filter(Boolean)

  return targetKeys.some((targetKey) => {
    const targetIndex = getLaneStepIndex(steps, laneKey, targetKey)
    const targetStep = targetIndex >= 0 ? steps[targetIndex] : null
    const targetStatus = normalizeStatus(targetStep?.status || '')
    if (targetStatus === 'completed' || targetStatus === 'approved') return true
    if (targetIndex >= 0 && currentIndex > targetIndex) return true
    return currentStage === targetKey && laneStatus === 'completed'
  })
}

function buildCoordinationItem(rule = {}, lanes = []) {
  const dependencyLaneKey = normalizeLaneKey(rule.dependencyLaneKey)
  const dependencyLane = getLaneFromCollection(lanes, dependencyLaneKey)
  const targetStage = normalizeAttorneyStageKey(rule.targetStages?.[0] || '', dependencyLaneKey)
  const targetStageLabel = targetStage ? getAttorneyStageLabel(targetStage, dependencyLaneKey) : ''
  if (!dependencyLane) return null

  const ready = laneStageReached(dependencyLane, rule.targetStages)
  const assigned = laneAssignmentPresent(dependencyLane)
  const status = ready ? 'ready' : assigned ? 'waiting' : 'blocked'
  const currentStage = normalizeAttorneyStageKey(getLaneCurrentStage(dependencyLane), dependencyLaneKey)

  return {
    id: `${dependencyLaneKey}_${rule.id}`,
    laneKey: dependencyLaneKey,
    laneLabel: LANE_LABELS[dependencyLaneKey] || 'Attorney',
    title: rule.title,
    description: rule.description,
    status,
    statusLabel: status === 'ready' ? 'Ready' : status === 'blocked' ? 'Assignment Needed' : 'Waiting',
    targetStage,
    targetStageLabel,
    currentStage,
    currentStageLabel: dependencyLane.currentStageLabel || (currentStage ? getAttorneyStageLabel(currentStage, dependencyLaneKey) : 'Not started'),
    assigned,
  }
}

function buildCoordinationActionIndex(timeline = []) {
  const byId = new Map()

  for (const entry of timeline || []) {
    const packet = normalizeAttorneyWorkflowWorkPacket(entry?.metadata?.workPacket)
    if (!packet?.sourceCoordinationId) continue
    const existing = byId.get(packet.sourceCoordinationId) || {
      id: packet.sourceCoordinationId,
      at: '',
      message: '',
      dueDate: '',
      latestAt: '',
      latestMessage: '',
      latestDueDate: '',
      status: packet.sourceCoordinationStatus || '',
      laneKey: packet.sourceCoordinationLaneKey || '',
      targetStage: packet.sourceCoordinationTargetStage || '',
      actionCount: 0,
      escalationCount: 0,
      escalatedAt: '',
      escalationMessage: '',
    }
    const at = compactText(entry.timestamp || entry.createdAt || entry.created_at || '')
    const message = compactText(entry.message || entry.body || '')
    const dueDate = compactText(packet.dueDate || '')
    const isEscalation = packet.commandType === 'escalate_coordination' || packet.sourceCoordinationStatus === 'escalated'

    existing.actionCount += 1
    existing.at = existing.at || at
    existing.message = existing.message || message
    existing.dueDate = existing.dueDate || dueDate
    existing.latestAt = at || existing.latestAt
    existing.latestMessage = message || existing.latestMessage
    existing.latestDueDate = dueDate || existing.latestDueDate
    existing.status = packet.sourceCoordinationStatus || existing.status
    existing.laneKey = packet.sourceCoordinationLaneKey || existing.laneKey
    existing.targetStage = packet.sourceCoordinationTargetStage || existing.targetStage
    if (isEscalation) {
      existing.escalationCount += 1
      existing.escalatedAt = at || existing.escalatedAt
      existing.escalationMessage = message || existing.escalationMessage
    }
    byId.set(packet.sourceCoordinationId, existing)
  }

  return byId
}

function applyCoordinationActionState(item = {}, actioned = null, now = null) {
  const action = actioned?.get(item.id)
  if (!action) return item
  const dueInDays = now && action.dueDate ? daysUntil(action.dueDate, now) : null
  const actionAgeDays = now && action.at ? daysSince(action.at, now) : null
  const escalated = action.escalationCount > 0
  const escalationNeeded = item.status !== 'ready' && !escalated && dueInDays !== null && dueInDays < 0
  const escalationDueToday = item.status !== 'ready' && !escalated && dueInDays === 0
  const escalationStatus = item.status === 'ready'
    ? 'recorded'
    : escalated
      ? 'escalated'
      : escalationNeeded
        ? 'overdue'
        : escalationDueToday
          ? 'due_today'
          : 'requested'
  const actionedLabel = item.status === 'ready'
    ? 'Recorded'
    : escalated
      ? 'Escalated'
      : escalationNeeded
        ? 'Escalation Due'
        : 'Handoff Requested'

  return {
    ...item,
    actioned: true,
    actionedAt: action.at,
    actionedMessage: action.message,
    actionedDueDate: action.dueDate,
    actionedDueInDays: dueInDays,
    actionedAgeDays: actionAgeDays,
    actionedLabel,
    statusLabel: item.status === 'ready' ? item.statusLabel : actionedLabel,
    escalationStatus,
    escalationNeeded,
    escalationDueToday,
    escalated,
    escalationCount: action.escalationCount,
    escalatedAt: action.escalatedAt,
    escalationMessage: action.escalationMessage,
  }
}

function buildCoordinationEscalationCommand(item = {}, context = {}) {
  const laneKey = normalizeLaneKey(context.laneKey)
  const dependencyLaneKey = normalizeLaneKey(item.laneKey || item.dependencyLaneKey)
  const stageKey = normalizeAttorneyStageKey(context.stageKey || '', laneKey)
  const title = compactText(item.title || 'Coordination handoff')
  const dependencyLabel = compactText(item.laneLabel || LANE_LABELS[dependencyLaneKey] || 'Attorney')
  const ageLabel = Number.isFinite(item.actionedAgeDays) ? `${item.actionedAgeDays} day${item.actionedAgeDays === 1 ? '' : 's'} ago` : 'previously'
  const action = {
    id: `${item.id || `${laneKey}_${dependencyLaneKey}_coordination`}_escalation`,
    label: `Escalate ${title}`,
    description: item.description || `Escalate unresolved coordination with ${dependencyLabel}.`,
    type: 'escalate_coordination',
    target: 'attorney',
    priority: 'high',
    laneKey,
    stageKey,
    relatedId: item.id || '',
  }
  const workPacket = normalizeAttorneyWorkflowWorkPacket({
    ...buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject: `Escalate ${title}`,
      commandType: 'escalate_coordination',
      requestedFrom: 'attorney',
      priority: 'urgent',
      visibility: 'professional_shared',
      dueDate: isoDatePlusDays(context.now || null, 1),
      checklist: [
        'Confirm the unresolved dependency and owner.',
        'Ask for the blocker, expected date, and next action.',
        'Record the escalation outcome on the matter timeline.',
      ],
      now: context.now || null,
    }),
    sourceCoordinationId: item.id || '',
    sourceCoordinationLaneKey: dependencyLaneKey,
    sourceCoordinationTargetStage: item.targetStage || '',
    sourceCoordinationStatus: 'escalated',
  })
  const draft = buildNoteDraft({
    laneKey,
    visibility: 'professional_shared',
    message: sentence(
      `Escalation for ${dependencyLabel}: ${title} remains unresolved after the handoff request sent ${ageLabel}.`,
      item.targetStageLabel ? `Needed: ${item.targetStageLabel}.` : '',
      item.currentStageLabel ? `Current: ${item.currentStageLabel}.` : '',
      item.actionedDueDate ? `Requested response date was ${item.actionedDueDate}.` : '',
      'Please confirm owner, blocker, and expected completion date.',
    ),
    workPacket,
  })

  return buildCommand({
    action,
    laneKey,
    stageKey,
    commandType: 'add_note',
    label: 'Escalate Handoff',
    description: 'Prepare a professional escalation note for the unresolved legal dependency.',
    workPacket,
    draft,
  })
}

function getCoordinationCommandPreset(item = {}) {
  return ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS[item?.id] || null
}

export function buildAttorneyWorkflowCoordinationSummary({
  laneKey = 'transfer',
  lanes = [],
  timeline = [],
  now = null,
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const rules = COORDINATION_RULES[normalizedLaneKey] || []
  const actioned = buildCoordinationActionIndex(timeline)
  const items = rules
    .map((rule) => buildCoordinationItem(rule, lanes))
    .filter(Boolean)
    .map((item) => applyCoordinationActionState(item, actioned, now))

  const counts = items.reduce((accumulator, item) => {
    accumulator.total += 1
    if (item.status === 'ready') accumulator.ready += 1
    if (item.status === 'waiting') accumulator.waiting += 1
    if (item.status === 'blocked') accumulator.blocked += 1
    if (item.actioned) accumulator.actioned += 1
    if (item.escalationNeeded) accumulator.escalationNeeded += 1
    if (item.escalationDueToday) accumulator.escalationDueToday += 1
    if (item.escalated) accumulator.escalated += 1
    return accumulator
  }, {
    total: 0,
    ready: 0,
    waiting: 0,
    blocked: 0,
    actioned: 0,
    escalationNeeded: 0,
    escalationDueToday: 0,
    escalated: 0,
  })

  const health = counts.escalationNeeded
    ? 'escalation'
    : counts.blocked
    ? 'blocked'
    : counts.waiting
      ? 'waiting'
      : counts.total
        ? 'ready'
        : 'clear'

  return {
    laneKey: normalizedLaneKey,
    health,
    counts,
    actionedCoordinationIds: [...actioned.keys()],
    primaryDependency:
      items.find((item) => item.escalationNeeded) ||
      items.find((item) => item.status === 'blocked' && !item.actioned) ||
      items.find((item) => item.status === 'waiting' && !item.actioned) ||
      items.find((item) => item.status === 'blocked') ||
      items.find((item) => item.status === 'waiting') ||
      items[0] ||
      null,
    items,
  }
}

export function buildAttorneyWorkflowCoordinationCommand(item = {}, context = {}) {
  const laneKey = normalizeLaneKey(context.laneKey)
  const dependencyLaneKey = normalizeLaneKey(item.laneKey || item.dependencyLaneKey)
  const blocked = item.status === 'blocked'
  const stageKey = normalizeAttorneyStageKey(context.stageKey || '', laneKey)
  const title = compactText(item.title || 'Coordination handoff')
  const dependencyLabel = compactText(item.laneLabel || LANE_LABELS[dependencyLaneKey] || 'Attorney')
  const preset = getCoordinationCommandPreset(item)

  if (item.actioned && item.escalationNeeded && item.status !== 'ready') {
    return buildCoordinationEscalationCommand(item, context)
  }

  const action = {
    id: item.id || `${laneKey}_${dependencyLaneKey}_coordination`,
    label: blocked ? `Assign ${dependencyLabel}` : `Request ${title}`,
    description: item.description || `Coordinate with ${dependencyLabel}.`,
    type: blocked ? 'assign_attorney' : 'request_coordination_update',
    target: 'attorney',
    priority: blocked ? 'high' : 'medium',
    laneKey,
    stageKey,
    relatedId: item.id || '',
  }

  if (blocked) {
    const command = buildAttorneyWorkflowActionCommand(action, { laneKey, stageKey, now: context.now || null })
    const packet = normalizeAttorneyWorkflowWorkPacket({
      ...(command.workPacket || {}),
      title: `Assign ${dependencyLabel}`,
      laneKey,
      stageKey,
      commandType: command.commandType,
      audience: 'attorney',
      audienceLabel: dependencyLabel,
      priority: 'urgent',
      visibility: 'internal',
      sourceCoordinationId: item.id || '',
      sourceCoordinationLaneKey: dependencyLaneKey,
      sourceCoordinationTargetStage: item.targetStage || '',
      sourceCoordinationStatus: item.status || '',
    })
    return {
      ...command,
      id: `${item.id || command.id}_coordination_command`,
      label: 'Open Assignment',
      workPacket: packet,
      coordinationId: item.id || '',
      dependencyLaneKey,
    }
  }

  const workPacket = normalizeAttorneyWorkflowWorkPacket({
    ...buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject: preset?.subject || title,
      commandType: 'add_note',
      requestedFrom: 'attorney',
      priority: item.status === 'waiting' ? 'required' : 'optional',
      visibility: 'professional_shared',
      checklist: preset?.checklist || [
        'Confirm the owner and expected date.',
        'Record what remains outstanding.',
        'Update the dependency once resolved.',
      ],
      now: context.now || null,
    }),
    sourceCoordinationId: item.id || '',
    sourceCoordinationLaneKey: dependencyLaneKey,
    sourceCoordinationTargetStage: item.targetStage || '',
    sourceCoordinationStatus: item.status || '',
  })
  const draft = buildNoteDraft({
    laneKey,
    visibility: 'professional_shared',
    message: sentence(
      preset?.messagePrefix || `Coordination request for ${dependencyLabel}: ${title}.`,
      item.targetStageLabel ? `Needed: ${item.targetStageLabel}.` : '',
      item.currentStageLabel ? `Current: ${item.currentStageLabel}.` : '',
      preset?.description || item.description,
    ),
    workPacket,
  })

  return buildCommand({
    action,
    laneKey,
    stageKey,
    commandType: 'add_note',
    label: item.status === 'ready' ? 'Add Coordination Note' : preset?.label || 'Request Handoff',
    description: preset?.description || 'Prepare a professional coordination update for the linked legal workflow.',
    workPacket,
    draft,
  })
}

export function buildAttorneyLaneUsabilitySnapshot({
  laneKey = 'transfer',
  label = '',
  assignment = null,
  laneStatus = '',
  currentStage = '',
  summary = {},
  steps = [],
  dataRequirements = [],
  documentRequirements = [],
  signingRequirements = [],
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const currentStep = currentStepForLane({ laneKey: normalizedLaneKey, steps, currentStage, summary })
  const stageKey = normalizeAttorneyStageKey(currentStep?.stepKey || currentStep?.step_key || currentStep?.key || currentStage || summary.currentStage, normalizedLaneKey)
  const stageDefinition = getAttorneyStageDefinition(stageKey, normalizedLaneKey)
  const currentStageLabel = stageKey ? getAttorneyStageLabel(stageKey, normalizedLaneKey) : 'Not started'
  const workflowState = resolveAttorneyWorkflowState({ laneKey: normalizedLaneKey, laneStatus, currentStage: stageKey, summary })
  const currentStepComplete = normalizeStatus(currentStep?.status) === 'completed' || Boolean(summary?.allComplete)

  const missingData = requiredItems(dataRequirements)
    .filter((item) => !itemComplete(item))
    .map((item) => ({ ...item, severity: normalizeSeverity(item.severity || 'medium') }))
  const outstandingDocuments = requiredItems(documentRequirements)
    .filter((item) => !itemComplete(item))
    .map((item) => ({
      ...item,
      severity: normalizeStatus(item.status) === 'rejected' ? 'high' : normalizeSeverity(item.severity || 'medium'),
    }))
  const outstandingSignatures = requiredItems(signingRequirements)
    .filter((item) => !signingComplete(item, normalizedLaneKey, steps, documentRequirements))
    .map((item) => ({ ...item, severity: normalizeSeverity(item.severity || 'high') }))

  const evidenceRequirements = stageKey ? getAttorneyEvidenceRequirementsForStage(stageKey, normalizedLaneKey) : []
  const evidenceChecklist = evidenceRequirements.map((item, index) => ({
    id: `${stageKey || 'not_started'}_evidence_${index + 1}`,
    label: item,
    stageKey,
    stageLabel: currentStageLabel,
    complete: currentStepComplete,
    status: currentStepComplete ? 'complete' : 'required',
  }))

  const readinessChecklist = [
    {
      id: 'assignment',
      label: `${label || currentStageLabel} assignment`,
      complete: Boolean(assignment),
      missingCount: assignment ? 0 : 1,
      severity: assignment ? 'low' : 'critical',
    },
    {
      id: 'data',
      label: 'Matter data',
      complete: missingData.length === 0,
      missingCount: missingData.length,
      severity: missingData.length ? highestSeverity(missingData) : 'low',
    },
    {
      id: 'documents',
      label: 'Documents',
      complete: outstandingDocuments.length === 0,
      missingCount: outstandingDocuments.length,
      severity: outstandingDocuments.length ? highestSeverity(outstandingDocuments) : 'low',
    },
    {
      id: 'signatures',
      label: 'Signatures',
      complete: outstandingSignatures.length === 0,
      missingCount: outstandingSignatures.length,
      severity: outstandingSignatures.length ? highestSeverity(outstandingSignatures) : 'low',
    },
    {
      id: 'evidence',
      label: 'Current stage evidence',
      complete: evidenceChecklist.every((item) => item.complete),
      missingCount: evidenceChecklist.filter((item) => !item.complete).length,
      severity: evidenceChecklist.some((item) => !item.complete) ? 'medium' : 'low',
    },
  ]

  const actions = []
  if (!assignment) {
    actions.push(buildAction({
      id: `${normalizedLaneKey}_assign_attorney`,
      label: `Assign ${label || 'attorney'}`,
      description: 'Lane ownership is required before workflow responsibility is clear.',
      type: 'assign_attorney',
      target: 'management',
      priority: 'critical',
      laneKey: normalizedLaneKey,
    }))
  }
  if (laneStatus === 'blocked' || normalizeStatus(currentStep?.status) === 'blocked') {
    actions.push(buildAction({
      id: `${normalizedLaneKey}_resolve_blocker`,
      label: `Resolve ${currentStageLabel} blocker`,
      description: currentStep?.comment || 'The active workflow step is blocked.',
      type: 'resolve_blocker',
      target: stageDefinition?.ownerRole || 'attorney',
      priority: 'high',
      laneKey: normalizedLaneKey,
      stageKey,
    }))
  }
  for (const item of missingData.slice(0, 3)) {
    actions.push(buildAction({
      id: `${item.id}_capture_data`,
      label: `Capture ${item.label}`,
      description: item.description || 'Required matter data is missing.',
      type: 'update_matter_data',
      target: item.owner || 'attorney',
      priority: item.severity || 'medium',
      laneKey: normalizedLaneKey,
      stageKey: item.stageKey || item.stageKeys?.[0] || stageKey,
      relatedId: item.id,
    }))
  }
  for (const item of outstandingDocuments.slice(0, 3)) {
    const rejected = normalizeStatus(item.status) === 'rejected'
    actions.push(buildAction({
      id: `${item.id}_${rejected ? 'correct' : 'request'}_document`,
      label: rejected ? `Request corrected ${item.label}` : `Request ${item.label}`,
      description: item.reason || item.description || 'Required document is not complete.',
      type: rejected ? 'request_corrected_document' : 'request_document',
      target: item.requiredFrom || item.appliesTo || 'client',
      priority: item.severity || 'medium',
      laneKey: normalizedLaneKey,
      stageKey,
      relatedId: item.id,
    }))
  }
  for (const item of outstandingSignatures.slice(0, 2)) {
    actions.push(buildAction({
      id: `${item.id}_follow_up_signature`,
      label: `Follow up ${item.label}`,
      description: 'Required signing is still outstanding.',
      type: 'manage_signing',
      target: item.signerType || 'client',
      priority: item.severity || 'high',
      laneKey: normalizedLaneKey,
      stageKey,
      relatedId: item.id,
    }))
  }
  if (!actions.length && stageKey && !currentStepComplete) {
    actions.push(buildAction({
      id: `${stageKey}_complete_evidence`,
      label: `Complete ${currentStageLabel}`,
      description: evidenceRequirements[0] || 'Capture the evidence needed for the active workflow stage.',
      type: 'complete_stage_evidence',
      target: stageDefinition?.ownerRole || 'attorney',
      priority: 'medium',
      laneKey: normalizedLaneKey,
      stageKey,
    }))
  }
  if (!actions.length) {
    actions.push(buildAction({
      id: `${normalizedLaneKey}_review_workflow`,
      label: workflowState === 'complete' ? 'Review closed matter' : 'Review workflow',
      description: workflowState === 'complete' ? 'Matter workflow is complete.' : 'No immediate workflow blockers are visible.',
      type: 'review_workflow',
      target: 'attorney',
      priority: 'low',
      laneKey: normalizedLaneKey,
      stageKey,
    }))
  }

  const nextActions = actions.sort(sortActions).slice(0, 6)

  return {
    laneKey: normalizedLaneKey,
    currentStage: stageKey,
    currentStageLabel,
    workflowState,
    workflowStateLabel: getAttorneyWorkflowStatusLabel(workflowState),
    attentionSummary: buildAttentionSummary({ missingData, outstandingDocuments, outstandingSignatures, evidenceChecklist, assignment }),
    primaryNextAction: nextActions[0] || null,
    nextActions,
    readinessChecklist,
    evidenceChecklist,
    missingData,
    outstandingDocuments,
    outstandingSignatures,
  }
}
