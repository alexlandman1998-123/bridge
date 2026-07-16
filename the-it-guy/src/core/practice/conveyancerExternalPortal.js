import { buildPracticeActor, PRACTICE_OPERATION_ROLES } from './conveyancerPracticeOperationsContract.js'

export const CONVEYANCER_EXTERNAL_PORTAL_VERSION = 'conveyancer_external_portal_g8_v1'
export const EXTERNAL_PORTAL_PARTICIPANT_TYPES = Object.freeze({ client: 'client', professional: 'professional' })
export const EXTERNAL_PORTAL_INVITATION_STATES = Object.freeze({ pending: 'pending', accepted: 'accepted', expired: 'expired', revoked: 'revoked', replaced: 'replaced' })
export const EXTERNAL_PORTAL_VISIBILITY = Object.freeze({ client: 'client_visible', professional: 'professional_shared', internal: 'internal', privileged: 'privileged' })
export const EXTERNAL_PORTAL_PROHIBITED_DOMAINS = Object.freeze(['client_risk_assessment', 'compliance_escalation', 'privileged_note', 'trust_control', 'trust_requisition', 'internal_exception', 'staff_performance', 'firm_profitability'])
export const EXTERNAL_PORTAL_BOUNDARY = Object.freeze({ invitationSent: false, accessGranted: false, accessRevoked: false, documentStored: false, evidenceApproved: false, commentPosted: false, acknowledgementApplied: false, downloadPerformed: false, matterMutated: false, internalDataExposed: false })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const TYPES = new Set(Object.values(EXTERNAL_PORTAL_PARTICIPANT_TYPES)); const STATES = new Set(Object.values(EXTERNAL_PORTAL_INVITATION_STATES))
const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const unique = (values = []) => [...new Set(values.map(key).filter(Boolean))].sort()
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, name) => { result[name] = stable(value[name]); return result }, {}) }
function fingerprint(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let i = 0; i < source.length; i += 1) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function inviterAllowed(actor) { return [PRACTICE_OPERATION_ROLES.responsibleAttorney, PRACTICE_OPERATION_ROLES.supervisingAttorney, PRACTICE_OPERATION_ROLES.firmManager].includes(actor.role) }

export function buildExternalPortalInvitation(input = {}) {
  const actorResult = buildPracticeActor(input.invitedBy || {}); const issuedAt = iso(input.issuedAt); const expiresAt = iso(input.expiresAt); const participantType = key(input.participantType); const errors = [...actorResult.errors]
  if (!text(input.invitationId) || !UUID.test(text(input.organisationId)) || !UUID.test(text(input.attorneyFirmId)) || !UUID.test(text(input.transactionId)) || !UUID.test(text(input.contactId)) || !TYPES.has(participantType) || !text(input.participantRole) || !issuedAt || !expiresAt || new Date(expiresAt) <= new Date(issuedAt) || new Date(expiresAt) - new Date(issuedAt) > 30 * 86400000 || !text(input.tokenReference) || !HASH.test(text(input.tokenHash)) || !text(input.identityChallengeReference) || !HASH.test(text(input.identityChallengeHash))) errors.push('external_portal_invitation_invalid')
  if (!inviterAllowed(actorResult.actor) || actorResult.actor.organisationId !== text(input.organisationId) || actorResult.actor.attorneyFirmId !== text(input.attorneyFirmId)) errors.push('external_portal_inviter_not_authorised')
  if (Object.hasOwn(input, 'token') || Object.hasOwn(input, 'identityChallenge')) errors.push('external_portal_secret_material_prohibited')
  const invitation = { version: CONVEYANCER_EXTERNAL_PORTAL_VERSION, invitationId: text(input.invitationId), organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), transactionId: text(input.transactionId), contactId: text(input.contactId), participantType, participantRole: key(input.participantRole), state: EXTERNAL_PORTAL_INVITATION_STATES.pending, tokenReference: text(input.tokenReference), tokenHash: text(input.tokenHash), identityChallengeReference: text(input.identityChallengeReference), identityChallengeHash: text(input.identityChallengeHash), permittedActions: unique(input.permittedActions), issuedAt, expiresAt, invitedBy: actorResult.actor.userId, sent: false, controls: EXTERNAL_PORTAL_BOUNDARY }
  invitation.fingerprint = fingerprint(invitation); return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], invitation })
}

export function acceptExternalPortalInvitation({ invitation = {}, identityEvidence = {}, consentEvidence = {}, acceptedAt = '', sessionReference = '' } = {}) {
  const at = iso(acceptedAt); const errors = []
  if (invitation.version !== CONVEYANCER_EXTERNAL_PORTAL_VERSION || invitation.state !== EXTERNAL_PORTAL_INVITATION_STATES.pending || !at || new Date(at) >= new Date(invitation.expiresAt) || !text(identityEvidence.reference) || !HASH.test(text(identityEvidence.hash)) || identityEvidence.matched !== true || !text(consentEvidence.reference) || !HASH.test(text(consentEvidence.hash)) || consentEvidence.accepted !== true || !text(sessionReference)) errors.push('external_portal_acceptance_invalid')
  const grant = { version: CONVEYANCER_EXTERNAL_PORTAL_VERSION, grantId: `portal-grant:${invitation.invitationId}`, invitationId: invitation.invitationId, invitationFingerprint: invitation.fingerprint, organisationId: invitation.organisationId, attorneyFirmId: invitation.attorneyFirmId, transactionId: invitation.transactionId, contactId: invitation.contactId, participantType: invitation.participantType, participantRole: invitation.participantRole, permittedActions: invitation.permittedActions || [], identityEvidence: { reference: text(identityEvidence.reference), hash: text(identityEvidence.hash) }, consentEvidence: { reference: text(consentEvidence.reference), hash: text(consentEvidence.hash) }, sessionReference: text(sessionReference), acceptedAt: at, expiresAt: invitation.expiresAt, active: errors.length === 0, accessGranted: false, controls: EXTERNAL_PORTAL_BOUNDARY }
  grant.fingerprint = fingerprint(grant); return freeze({ ok: errors.length === 0, errors, grant })
}

export function buildExternalPortalAccessPolicy({ grant = {}, asOf = '' } = {}) {
  const at = iso(asOf); const errors = []
  if (grant.version !== CONVEYANCER_EXTERNAL_PORTAL_VERSION || grant.active !== true || !at || new Date(at) >= new Date(grant.expiresAt)) errors.push('external_portal_grant_inactive')
  const client = grant.participantType === EXTERNAL_PORTAL_PARTICIPANT_TYPES.client
  const policy = { version: CONVEYANCER_EXTERNAL_PORTAL_VERSION, grantId: grant.grantId, transactionId: grant.transactionId, participantType: grant.participantType, allowedVisibility: client ? [EXTERNAL_PORTAL_VISIBILITY.client] : [EXTERNAL_PORTAL_VISIBILITY.client, EXTERNAL_PORTAL_VISIBILITY.professional], allowedDomains: client ? ['matter_status', 'document_request', 'document_submission', 'signing_appointment', 'client_message', 'acknowledgement'] : ['matter_status', 'professional_timeline', 'document_request', 'document_submission', 'signing_appointment', 'shared_message', 'acknowledgement'], prohibitedDomains: EXTERNAL_PORTAL_PROHIBITED_DOMAINS, permittedActions: grant.permittedActions || [], evaluatedAt: at, internalMatterAccess: false, controls: EXTERNAL_PORTAL_BOUNDARY }
  policy.fingerprint = fingerprint(policy); return freeze({ ok: errors.length === 0, errors, policy })
}

export function projectExternalPortalMatter({ policy = {}, records = [] } = {}) {
  const visible = []; const excluded = []
  for (const record of records) {
    const domain = key(record.domain); const visibility = key(record.visibility)
    const allowed = policy.allowedDomains?.includes(domain) && policy.allowedVisibility?.includes(visibility) && !policy.prohibitedDomains?.includes(domain) && record.privileged !== true && record.internalOnly !== true
    if (!allowed) { excluded.push({ recordId: text(record.recordId), reason: 'portal_visibility_denied' }); continue }
    visible.push({ recordId: text(record.recordId), domain, visibility, label: text(record.label), status: key(record.status), summaryReference: text(record.summaryReference), summaryHash: text(record.summaryHash), dueAt: iso(record.dueAt), downloadable: record.downloadable === true && policy.permittedActions?.includes('download') })
  }
  return freeze({ version: CONVEYANCER_EXTERNAL_PORTAL_VERSION, transactionId: policy.transactionId || null, records: visible, excludedCount: excluded.length, excluded, internalDomainsExcluded: true, rawContentIncluded: false, controls: EXTERNAL_PORTAL_BOUNDARY, fingerprint: fingerprint({ transactionId: policy.transactionId, records: visible, excluded }) })
}

export function buildExternalPortalDocumentSubmission(input = {}) {
  const errors = []
  if (input.grant?.version !== CONVEYANCER_EXTERNAL_PORTAL_VERSION || input.grant?.active !== true || !input.grant?.permittedActions?.includes('upload') || !text(input.submissionId) || !text(input.requestId) || !text(input.documentReference) || !HASH.test(text(input.documentHash)) || !text(input.fileName) || !text(input.mediaType) || input.malwareScanPassed !== true || !iso(input.submittedAt)) errors.push('external_portal_document_submission_invalid')
  const submission = { version: CONVEYANCER_EXTERNAL_PORTAL_VERSION, submissionId: text(input.submissionId), grantId: input.grant?.grantId || null, transactionId: input.grant?.transactionId || null, requestId: text(input.requestId), documentReference: text(input.documentReference), documentHash: text(input.documentHash), fileName: text(input.fileName), mediaType: key(input.mediaType), malwareScanPassed: input.malwareScanPassed === true, submittedAt: iso(input.submittedAt), status: 'proposed_for_review', evidenceApproved: false, documentStored: false, controls: EXTERNAL_PORTAL_BOUNDARY }
  submission.fingerprint = fingerprint(submission); return freeze({ ok: errors.length === 0, errors, submission })
}

export function buildExternalPortalInteraction(input = {}) {
  const errors = []; const type = key(input.type)
  if (input.grant?.version !== CONVEYANCER_EXTERNAL_PORTAL_VERSION || input.grant?.active !== true || !['comment', 'reply', 'acknowledgement', 'preference_update'].includes(type) || !text(input.interactionId) || !text(input.contentReference) || !HASH.test(text(input.contentHash)) || !iso(input.occurredAt)) errors.push('external_portal_interaction_invalid')
  const interaction = { version: CONVEYANCER_EXTERNAL_PORTAL_VERSION, interactionId: text(input.interactionId), grantId: input.grant?.grantId || null, transactionId: input.grant?.transactionId || null, type, threadId: text(input.threadId) || null, replyToId: text(input.replyToId) || null, contentReference: text(input.contentReference), contentHash: text(input.contentHash), occurredAt: iso(input.occurredAt), status: 'pending_internal_review', posted: false, acknowledgementApplied: false, controls: EXTERNAL_PORTAL_BOUNDARY }
  interaction.fingerprint = fingerprint(interaction); return freeze({ ok: errors.length === 0, errors, interaction })
}

export function buildExternalPortalDownloadIntent({ grant = {}, record = {}, watermark = '', preparedAt = '' } = {}) {
  const errors = []
  if (grant.version !== CONVEYANCER_EXTERNAL_PORTAL_VERSION || grant.active !== true || !grant.permittedActions?.includes('download') || record.downloadable !== true || record.privileged === true || record.internalOnly === true || !text(record.reference) || !HASH.test(text(record.hash)) || !text(watermark) || !iso(preparedAt)) errors.push('external_portal_download_not_allowed')
  const intent = { version: CONVEYANCER_EXTERNAL_PORTAL_VERSION, intentId: `portal-download:${grant.grantId}:${text(record.recordId)}`, grantId: grant.grantId, transactionId: grant.transactionId, recordId: text(record.recordId), reference: text(record.reference), hash: text(record.hash), watermark: text(watermark), preparedAt: iso(preparedAt), downloaded: false, controls: EXTERNAL_PORTAL_BOUNDARY }
  intent.fingerprint = fingerprint(intent); return freeze({ ok: errors.length === 0, errors, intent })
}

export function buildExternalPortalAccessChange({ grant = {}, type = '', replacementInvitationId = '', reason = '', actor = {}, occurredAt = '' } = {}) {
  const actorResult = buildPracticeActor(actor); const changeType = key(type); const errors = [...actorResult.errors]
  if (grant.version !== CONVEYANCER_EXTERNAL_PORTAL_VERSION || !['revoke', 'replace'].includes(changeType) || !text(reason) || !iso(occurredAt) || (changeType === 'replace' && !text(replacementInvitationId)) || !inviterAllowed(actorResult.actor) || actorResult.actor.organisationId !== grant.organisationId || actorResult.actor.attorneyFirmId !== grant.attorneyFirmId) errors.push('external_portal_access_change_invalid')
  const intent = { version: CONVEYANCER_EXTERNAL_PORTAL_VERSION, changeId: `portal-access:${changeType}:${grant.grantId}`, grantId: grant.grantId, expectedGrantFingerprint: grant.fingerprint, type: changeType, replacementInvitationId: text(replacementInvitationId) || null, reason: text(reason), occurredAt: iso(occurredAt), actorUserId: actorResult.actor.userId, executed: false, controls: EXTERNAL_PORTAL_BOUNDARY }
  intent.fingerprint = fingerprint(intent); return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], intent })
}
