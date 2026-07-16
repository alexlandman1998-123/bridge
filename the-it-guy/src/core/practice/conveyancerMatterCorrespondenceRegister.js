import {
  buildPracticeActor,
  buildPracticeAuditEvent,
  buildPracticeOperationIdentity,
  buildPracticePolicyBinding,
  evaluatePracticeOperationAuthority,
  PRACTICE_OPERATION_CAPABILITIES,
} from './conveyancerPracticeOperationsContract.js'
import { buildInformationResource, INFORMATION_CLASSIFICATIONS } from './conveyancerInformationGovernance.js'
import { CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION } from '../../services/attorneyWorkflow/conveyancerCorrespondenceGenerator.js'

export const CONVEYANCER_MATTER_CORRESPONDENCE_VERSION = 'conveyancer_matter_correspondence_g6_v1'

export const CORRESPONDENCE_DIRECTIONS = Object.freeze({ incoming: 'incoming', outgoing: 'outgoing', internal: 'internal' })
export const CORRESPONDENCE_CHANNELS = Object.freeze({ email: 'email', portal: 'portal_message', letter: 'letter', courier: 'courier', handDelivery: 'hand_delivery', phoneNote: 'phone_note' })
export const CORRESPONDENCE_TYPES = Object.freeze({ general: 'general', instruction: 'instruction', acknowledgement: 'acknowledgement', documentRequest: 'document_request', reminder: 'reminder', escalation: 'escalation', statusUpdate: 'status_update', signing: 'signing', paymentNotice: 'payment_notice', registrationNotice: 'registration_notice' })
export const CORRESPONDENCE_STATES = Object.freeze({ filed: 'filed', pendingApproval: 'pending_approval', approved: 'approved', dispatchPrepared: 'dispatch_prepared', sent: 'sent', delivered: 'delivered', failed: 'failed', acknowledged: 'acknowledged', withdrawn: 'withdrawn' })

export const CORRESPONDENCE_SIDE_EFFECT_BOUNDARY = Object.freeze({
  messageSent: false,
  providerCalled: false,
  documentRequestCreated: false,
  reminderScheduled: false,
  matterActionCompleted: false,
  legalOutcomeChanged: false,
})

const C = PRACTICE_OPERATION_CAPABILITIES
const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DIRECTIONS = Object.values(CORRESPONDENCE_DIRECTIONS)
const CHANNELS = Object.values(CORRESPONDENCE_CHANNELS)
const TYPES = Object.values(CORRESPONDENCE_TYPES)
const CLASSIFICATIONS = new Set(INFORMATION_CLASSIFICATIONS)

const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const unique = (values = []) => [...new Set(values.map(key).filter(Boolean))].sort()

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, name) => {
    result[name] = stable(value[name])
    return result
  }, {})
}

function fingerprint(value) {
  const source = JSON.stringify(stable(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

export function buildCorrespondencePolicy(input = {}) {
  const policy = {
    version: CONVEYANCER_MATTER_CORRESPONDENCE_VERSION,
    policyId: text(input.policyId),
    policyVersion: text(input.policyVersion),
    organisationId: text(input.organisationId),
    attorneyFirmId: text(input.attorneyFirmId),
    effectiveAt: iso(input.effectiveAt),
    permittedChannels: unique(input.permittedChannels?.length ? input.permittedChannels : CHANNELS),
    approvalRequiredTypes: unique(input.approvalRequiredTypes?.length ? input.approvalRequiredTypes : ['instruction', 'document_request', 'escalation', 'payment_notice', 'registration_notice']),
    privilegedAlwaysRequiresApproval: input.privilegedAlwaysRequiresApproval !== false,
    acknowledgementSlaHours: Math.max(1, Math.min(720, Number(input.acknowledgementSlaHours) || 48)),
    reminderAfterHours: Math.max(1, Math.min(720, Number(input.reminderAfterHours) || 48)),
    escalationAfterHours: Math.max(1, Math.min(1440, Number(input.escalationAfterHours) || 96)),
    maximumAttachmentCount: Math.max(0, Math.min(100, Number(input.maximumAttachmentCount) || 20)),
    reason: text(input.reason),
  }
  policy.fingerprint = fingerprint(policy)
  const binding = buildPracticePolicyBinding({ policyId: policy.policyId, policyVersion: policy.policyVersion, policyFingerprint: policy.fingerprint, effectiveAt: policy.effectiveAt })
  const errors = [...binding.errors]
  if (!UUID.test(policy.organisationId) || !UUID.test(policy.attorneyFirmId) || !policy.reason || policy.permittedChannels.some((channel) => !CHANNELS.includes(channel)) || policy.approvalRequiredTypes.some((type) => !TYPES.includes(type))) errors.push('correspondence_policy_invalid')
  if (policy.escalationAfterHours < policy.reminderAfterHours) errors.push('correspondence_follow_up_policy_invalid')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], policy, binding: binding.binding })
}

export function buildCommunicationPreference(input = {}) {
  const preference = {
    version: CONVEYANCER_MATTER_CORRESPONDENCE_VERSION,
    preferenceId: text(input.preferenceId),
    contactId: text(input.contactId),
    permittedChannels: unique(input.permittedChannels),
    preferredChannel: key(input.preferredChannel),
    language: key(input.language) || 'en',
    quietHours: input.quietHours ? { startsAt: text(input.quietHours.startsAt), endsAt: text(input.quietHours.endsAt), timezone: text(input.quietHours.timezone) } : null,
    marketingOptOut: input.marketingOptOut === true,
    operationalMessagesAllowed: input.operationalMessagesAllowed !== false,
    consentReference: text(input.consentReference),
    legalBasis: key(input.legalBasis),
    effectiveAt: iso(input.effectiveAt),
  }
  preference.fingerprint = fingerprint(preference)
  const errors = []
  if (!preference.preferenceId || !preference.contactId || !preference.permittedChannels.length || preference.permittedChannels.some((channel) => !CHANNELS.includes(channel)) || !preference.permittedChannels.includes(preference.preferredChannel) || !preference.legalBasis || !preference.effectiveAt) errors.push('communication_preference_invalid')
  return freeze({ ok: errors.length === 0, errors, preference })
}

function normalizeContact(contact = {}) {
  return { contactId: text(contact.contactId), partyId: text(contact.partyId), role: key(contact.role), addressReference: text(contact.addressReference), addressHash: text(contact.addressHash), verifiedAt: iso(contact.verifiedAt), active: contact.active !== false, external: contact.external !== false, preference: contact.preference || null }
}

export function validateCorrespondenceRecipients({ recipients = [], contacts = [], channel = '', direction = '', operational = true } = {}) {
  const contactMap = new Map(contacts.map(normalizeContact).map((contact) => [contact.contactId, contact]))
  const normalized = recipients.map((recipient) => ({ contactId: text(recipient.contactId), type: key(recipient.type) || 'to' }))
  const errors = []
  if (direction === CORRESPONDENCE_DIRECTIONS.outgoing && !normalized.some((recipient) => recipient.type === 'to')) errors.push('correspondence_primary_recipient_required')
  if (new Set(normalized.map((recipient) => `${recipient.type}:${recipient.contactId}`)).size !== normalized.length) errors.push('correspondence_duplicate_recipient')
  const resolved = normalized.map((recipient) => {
    const contact = contactMap.get(recipient.contactId)
    if (!contact || !contact.active || !contact.addressReference || !HASH.test(contact.addressHash) || !contact.verifiedAt) errors.push(`correspondence_recipient_invalid:${recipient.contactId || 'unknown'}`)
    const preference = contact?.preference
    if (preference && (!preference.permittedChannels?.includes(key(channel)) || (operational && preference.operationalMessagesAllowed === false))) errors.push(`correspondence_channel_not_permitted:${recipient.contactId}`)
    return { ...recipient, partyId: contact?.partyId || null, role: contact?.role || null, addressReference: contact?.addressReference || null, addressHash: contact?.addressHash || null, external: contact?.external ?? true, preferenceId: preference?.preferenceId || null }
  })
  return freeze({ valid: errors.length === 0, errors: [...new Set(errors)], recipients: resolved })
}

function normalizeAttachments(attachments = []) {
  return attachments.map((attachment) => ({ attachmentId: text(attachment.attachmentId), documentReference: text(attachment.documentReference), documentHash: text(attachment.documentHash), fileName: text(attachment.fileName), mediaType: key(attachment.mediaType), classifications: unique(attachment.classifications), evidenceId: text(attachment.evidenceId) || null }))
}

function attachmentErrors(attachments, maximum) {
  const errors = []
  if (attachments.length > maximum) errors.push('correspondence_attachment_limit_exceeded')
  if (new Set(attachments.map((item) => item.attachmentId)).size !== attachments.length || new Set(attachments.map((item) => item.documentHash.toLowerCase())).size !== attachments.length) errors.push('correspondence_duplicate_attachment')
  for (const attachment of attachments) if (!attachment.attachmentId || !attachment.documentReference || !HASH.test(attachment.documentHash) || !attachment.fileName || !attachment.mediaType || !attachment.classifications.length || attachment.classifications.some((classification) => !CLASSIFICATIONS.has(classification))) errors.push(`correspondence_attachment_invalid:${attachment.attachmentId || 'unknown'}`)
  return errors
}

export function buildMatterCorrespondenceRecord(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const actorResult = buildPracticeActor(input.actor || {})
  const policyResult = buildCorrespondencePolicy(input.policy || {})
  const direction = key(input.direction)
  const channel = key(input.channel)
  const type = key(input.type) || CORRESPONDENCE_TYPES.general
  const sourceMode = key(input.sourceMode) || (input.generatedCorrespondence ? 'generated' : 'manual')
  const occurredAt = iso(input.occurredAt)
  const classifications = unique(input.classifications?.length ? input.classifications : ['confidential'])
  const attachments = normalizeAttachments(input.attachments)
  const recipientResult = validateCorrespondenceRecipients({ recipients: input.recipients, contacts: input.contacts, channel, direction, operational: input.operational !== false })
  const errors = [...identityResult.errors, ...actorResult.errors, ...policyResult.errors, ...recipientResult.errors, ...attachmentErrors(attachments, policyResult.policy.maximumAttachmentCount)]
  if (!text(input.correspondenceId) || !DIRECTIONS.includes(direction) || !policyResult.policy.permittedChannels.includes(channel) || !TYPES.includes(type) || !occurredAt || !text(input.contentReference) || !HASH.test(text(input.contentHash)) || !HASH.test(text(input.subjectHash))) errors.push('correspondence_record_invalid')
  if (!['manual', 'integration', 'generated'].includes(sourceMode) || !text(input.sourceReference)) errors.push('correspondence_source_invalid')
  if (sourceMode === 'integration' && (direction !== CORRESPONDENCE_DIRECTIONS.incoming || !UUID.test(text(input.integrationProfileId)) || !text(input.providerEventId) || !HASH.test(text(input.providerEventHash)))) errors.push('correspondence_integration_source_invalid')
  if (sourceMode === 'generated' && !input.generatedCorrespondence) errors.push('correspondence_generated_source_draft_required')
  if (!classifications.length || classifications.some((classification) => !CLASSIFICATIONS.has(classification))) errors.push('correspondence_classification_invalid')
  if (input.privileged === true && !classifications.includes('privileged')) errors.push('correspondence_privilege_classification_required')
  if (input.confidential === true && !classifications.includes('confidential')) errors.push('correspondence_confidential_classification_required')
  const capability = sourceMode === 'integration' ? C.recordIntegratedEvidence : direction === CORRESPONDENCE_DIRECTIONS.incoming ? C.captureEvidence : C.prepareCorrespondence
  if (!authorised(actorResult.actor, identityResult.identity, capability, occurredAt)) errors.push('correspondence_capture_not_authorised')
  if (input.generatedCorrespondence && (input.generatedCorrespondence.version !== CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION || input.generatedCorrespondence.status !== 'draft' || input.generatedCorrespondence.dispatchAllowed !== false)) errors.push('correspondence_c2_draft_binding_invalid')
  const approvalRequired = direction === CORRESPONDENCE_DIRECTIONS.outgoing && (policyResult.policy.approvalRequiredTypes.includes(type) || (policyResult.policy.privilegedAlwaysRequiresApproval && classifications.includes('privileged')))
  if (type === CORRESPONDENCE_TYPES.documentRequest && (!text(input.documentRequest?.requestId) || !iso(input.documentRequest?.dueAt) || !unique(input.documentRequest?.requestedEvidenceTypes).length)) errors.push('correspondence_document_request_binding_invalid')
  const record = {
    version: CONVEYANCER_MATTER_CORRESPONDENCE_VERSION,
    correspondenceId: text(input.correspondenceId),
    identity: identityResult.identity,
    policy: policyResult.binding,
    direction,
    channel,
    type,
    source: { mode: sourceMode, sourceReference: text(input.sourceReference), integrationProfileId: text(input.integrationProfileId) || null, providerEventId: text(input.providerEventId) || null, providerEventHash: text(input.providerEventHash) || null },
    operational: input.operational !== false,
    material: input.material !== false,
    classifications,
    privileged: input.privileged === true,
    confidential: input.confidential === true || classifications.includes('confidential'),
    threadId: text(input.threadId) || text(input.correspondenceId),
    replyToCorrespondenceId: text(input.replyToCorrespondenceId) || null,
    providerMessageReference: text(input.providerMessageReference) || null,
    providerMessageHash: text(input.providerMessageHash) || null,
    contentReference: text(input.contentReference),
    contentHash: text(input.contentHash),
    subjectHash: text(input.subjectHash),
    recipients: recipientResult.recipients,
    attachments,
    generatedCorrespondence: input.generatedCorrespondence ? { correspondenceId: text(input.generatedCorrespondence.correspondenceId), version: input.generatedCorrespondence.version, contentFingerprint: text(input.generatedCorrespondence.contentFingerprint), templateVersionId: text(input.generatedCorrespondence.template?.templateVersionId) } : null,
    documentRequest: type === CORRESPONDENCE_TYPES.documentRequest ? { requestId: text(input.documentRequest?.requestId), requestedEvidenceTypes: unique(input.documentRequest?.requestedEvidenceTypes), dueAt: iso(input.documentRequest?.dueAt) } : null,
    capturedBy: actorResult.actor,
    occurredAt,
    filedAt: iso(input.filedAt) || occurredAt,
    approvalRequired,
    approval: null,
    deliveryEvents: [],
    state: direction === CORRESPONDENCE_DIRECTIONS.outgoing ? (approvalRequired ? CORRESPONDENCE_STATES.pendingApproval : CORRESPONDENCE_STATES.approved) : CORRESPONDENCE_STATES.filed,
    controls: CORRESPONDENCE_SIDE_EFFECT_BOUNDARY,
  }
  if (record.providerMessageReference && !HASH.test(record.providerMessageHash)) errors.push('correspondence_provider_message_hash_required')
  record.fingerprint = fingerprint(record)
  const resource = buildInformationResource({ resourceId: record.correspondenceId, resourceType: 'matter_correspondence', organisationId: record.identity.organisationId, attorneyFirmId: record.identity.attorneyFirmId, transactionId: record.identity.transactionId, branchId: record.identity.branchId, teamId: record.identity.teamId, classifications, retentionClass: 'matter_correspondence', retainUntil: input.retainUntil, legalHold: input.legalHold === true, exportPolicy: classifications.includes('privileged') ? 'attorney_only' : 'watermarked' })
  if (!resource.ok) errors.push(...resource.errors)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], record, informationResource: resource.resource })
}

function authorised(actor, identity, capability, asOf) {
  return evaluatePracticeOperationAuthority({ actor, identity, capability, asOf }).allowed
}

export function reviewCorrespondenceForRelease({ record = {}, reviewer = {}, decision = '', reason = '', reviewedAt = '', approvalReference = '', approvalHash = '' } = {}) {
  const actorResult = buildPracticeActor(reviewer)
  const target = key(decision)
  const at = iso(reviewedAt)
  const errors = [...actorResult.errors]
  if (record.version !== CONVEYANCER_MATTER_CORRESPONDENCE_VERSION || record.state !== CORRESPONDENCE_STATES.pendingApproval || !['approved', 'withdrawn'].includes(target) || !at || !text(reason) || !text(approvalReference) || !HASH.test(text(approvalHash))) errors.push('correspondence_review_invalid')
  if (!authorised(actorResult.actor, record.identity || {}, C.legalReview, at) || actorResult.actor.userId === record.capturedBy?.userId) errors.push('independent_correspondence_review_required')
  const next = { ...record, state: errors.length ? record.state : target, approval: { decision: target, reviewedBy: actorResult.actor, reviewedAt: at, reason: text(reason), approvalReference: text(approvalReference), approvalHash: text(approvalHash), approvedFingerprint: record.fingerprint } }
  delete next.fingerprint
  next.fingerprint = fingerprint(next)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], record: next })
}

export function buildCorrespondenceDispatchIntent({ record = {}, actor = {}, preparedAt = '', idempotencyKey = '', currentPreferences = [] } = {}) {
  const actorResult = buildPracticeActor(actor)
  const at = iso(preparedAt)
  const errors = [...actorResult.errors]
  if (record.version !== CONVEYANCER_MATTER_CORRESPONDENCE_VERSION || record.direction !== CORRESPONDENCE_DIRECTIONS.outgoing || record.state !== CORRESPONDENCE_STATES.approved || !text(idempotencyKey) || !at || !record.recipients?.length) errors.push('correspondence_dispatch_not_eligible')
  if (!authorised(actorResult.actor, record.identity || {}, C.sendCorrespondence, at)) errors.push('correspondence_dispatch_not_authorised')
  const preferences = new Map(currentPreferences.map((preference) => [text(preference.preferenceId), preference]))
  for (const recipient of record.recipients.filter((item) => item.external)) {
    const preference = preferences.get(recipient.preferenceId)
    if (!preference || preference.version !== CONVEYANCER_MATTER_CORRESPONDENCE_VERSION || preference.contactId !== recipient.contactId || !preference.permittedChannels?.includes(record.channel) || (record.operational && preference.operationalMessagesAllowed === false)) errors.push(`correspondence_current_preference_required:${recipient.contactId}`)
  }
  const intent = { version: CONVEYANCER_MATTER_CORRESPONDENCE_VERSION, intentId: `dispatch:${record.correspondenceId}:${text(idempotencyKey)}`, correspondenceId: record.correspondenceId, correspondenceFingerprint: record.fingerprint, identity: record.identity, channel: record.channel, recipientReferences: record.recipients.map((recipient) => ({ contactId: recipient.contactId, type: recipient.type, addressReference: recipient.addressReference, addressHash: recipient.addressHash, preferenceId: recipient.preferenceId, preferenceFingerprint: preferences.get(recipient.preferenceId)?.fingerprint || null })), contentReference: record.contentReference, contentHash: record.contentHash, attachmentReferences: record.attachments.map((attachment) => ({ attachmentId: attachment.attachmentId, documentReference: attachment.documentReference, documentHash: attachment.documentHash })), idempotencyKey: text(idempotencyKey), preparedBy: actorResult.actor, preparedAt: at, state: 'prepared', providerCalled: false, messageSent: false }
  intent.fingerprint = fingerprint(intent)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], intent })
}

export function recordCorrespondenceDeliveryEvent({ record = {}, eventId = '', status = '', occurredAt = '', evidenceReference = '', evidenceHash = '', providerEventReference = '', providerEventHash = '', reason = '' } = {}) {
  const target = key(status)
  const at = iso(occurredAt)
  const allowed = { approved: ['sent', 'failed'], dispatch_prepared: ['sent', 'failed'], sent: ['delivered', 'failed', 'acknowledged'], delivered: ['acknowledged', 'failed'], failed: ['sent'], acknowledged: [] }
  const errors = []
  if (record.version !== CONVEYANCER_MATTER_CORRESPONDENCE_VERSION || !text(eventId) || !allowed[record.state]?.includes(target) || !at || !text(evidenceReference) || !HASH.test(text(evidenceHash)) || !text(reason)) errors.push('correspondence_delivery_event_invalid')
  const latestAt = record.deliveryEvents?.length ? record.deliveryEvents[record.deliveryEvents.length - 1].occurredAt : record.occurredAt
  if (latestAt && at && new Date(at) < new Date(latestAt)) errors.push('correspondence_delivery_chronology_invalid')
  if (providerEventReference && !HASH.test(text(providerEventHash))) errors.push('correspondence_provider_event_hash_required')
  const event = { eventId: text(eventId), status: target, occurredAt: at, evidenceReference: text(evidenceReference), evidenceHash: text(evidenceHash), providerEventReference: text(providerEventReference) || null, providerEventHash: text(providerEventHash) || null, reason: text(reason) }
  const next = { ...record, state: errors.length ? record.state : target, deliveryEvents: [...(record.deliveryEvents || []), event] }
  delete next.fingerprint
  next.fingerprint = fingerprint(next)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], record: next, event })
}

export function evaluateCorrespondenceFollowUp({ record = {}, policy = {}, asOf = '' } = {}) {
  const at = iso(asOf) || new Date().toISOString()
  const sent = [...(record.deliveryEvents || [])].reverse().find((event) => event.status === 'sent')
  const acknowledged = record.state === CORRESPONDENCE_STATES.acknowledged || record.deliveryEvents?.some((event) => event.status === 'acknowledged')
  const failed = record.state === CORRESPONDENCE_STATES.failed
  const elapsedHours = sent ? (new Date(at) - new Date(sent.occurredAt)) / 3600000 : 0
  let action = 'none'
  if (failed) action = 'resolve_delivery_failure'
  else if (!acknowledged && sent && elapsedHours >= Number(policy.escalationAfterHours || 96)) action = 'escalate'
  else if (!acknowledged && sent && elapsedHours >= Number(policy.reminderAfterHours || 48)) action = 'remind'
  const documentRequestOpen = record.type === CORRESPONDENCE_TYPES.documentRequest && record.documentRequest && new Date(record.documentRequest.dueAt) <= new Date(at) && !acknowledged
  if (documentRequestOpen && action === 'none') action = 'remind'
  return freeze({ eligible: action !== 'none', action, correspondenceId: record.correspondenceId, evaluatedAt: at, elapsedHours: Math.max(0, elapsedHours), acknowledgementRequiredBy: sent ? new Date(new Date(sent.occurredAt).getTime() + Number(policy.acknowledgementSlaHours || 48) * 3600000).toISOString() : null, reminderScheduled: false, escalationSent: false })
}

export function detectDuplicateCorrespondence(candidate = {}, existing = []) {
  const matches = existing.filter((record) => record.correspondenceId !== candidate.correspondenceId).map((record) => {
    const reasons = []
    if (candidate.providerMessageHash && candidate.providerMessageHash === record.providerMessageHash) reasons.push('same_provider_message')
    if (candidate.contentHash === record.contentHash && candidate.subjectHash === record.subjectHash && candidate.direction === record.direction && candidate.threadId === record.threadId) reasons.push('same_content_thread_direction')
    return reasons.length ? { correspondenceId: record.correspondenceId, reasons, fingerprint: record.fingerprint } : null
  }).filter(Boolean)
  return freeze({ duplicate: matches.length > 0, matches, action: matches.length ? 'human_filing_review_required' : 'file_record' })
}

export function projectCanonicalFiledCorrespondence(record = {}) {
  const errors = []
  if (record.version !== CONVEYANCER_MATTER_CORRESPONDENCE_VERSION || !record.correspondenceId || !record.filedAt) errors.push('filed_correspondence_required')
  const filed = { version: CONVEYANCER_MATTER_CORRESPONDENCE_VERSION, correspondenceId: record.correspondenceId, organisationId: record.identity?.organisationId, attorneyFirmId: record.identity?.attorneyFirmId, transactionId: record.identity?.transactionId, lane: record.identity?.lane, direction: record.direction, channel: record.channel, type: record.type, classifications: record.classifications, privileged: record.privileged, confidential: record.confidential, material: record.material, threadId: record.threadId, replyToCorrespondenceId: record.replyToCorrespondenceId, contentReference: record.contentReference, contentHash: record.contentHash, subjectHash: record.subjectHash, attachmentIds: record.attachments?.map((item) => item.attachmentId).sort() || [], occurredAt: record.occurredAt, filedAt: record.filedAt }
  filed.equivalenceKey = fingerprint({ ...filed, correspondenceId: undefined, filedAt: undefined })
  filed.fingerprint = fingerprint(filed)
  return freeze({ ok: errors.length === 0, errors, filed })
}

export function buildMatterCommunicationHistory({ records = [], transactionId = '', asOf = '' } = {}) {
  const relevant = records.filter((record) => record.identity?.transactionId === text(transactionId))
  const errors = []
  const ids = new Set(relevant.map((record) => record.correspondenceId))
  if (ids.size !== relevant.length) errors.push('correspondence_history_duplicate_identity')
  const tenant = relevant[0]?.identity || null
  for (const record of relevant) {
    const snapshot = { ...record }
    delete snapshot.fingerprint
    if (record.version !== CONVEYANCER_MATTER_CORRESPONDENCE_VERSION || record.fingerprint !== fingerprint(snapshot)) errors.push(`correspondence_history_record_tampered:${record.correspondenceId}`)
    if (tenant && (record.identity?.organisationId !== tenant.organisationId || record.identity?.attorneyFirmId !== tenant.attorneyFirmId)) errors.push(`correspondence_history_tenant_mismatch:${record.correspondenceId}`)
    if (record.replyToCorrespondenceId && !ids.has(record.replyToCorrespondenceId)) errors.push(`correspondence_orphan_reply:${record.correspondenceId}`)
    if (record.replyToCorrespondenceId) {
      const parent = relevant.find((candidate) => candidate.correspondenceId === record.replyToCorrespondenceId)
      if (parent && (parent.threadId !== record.threadId || new Date(record.occurredAt) < new Date(parent.occurredAt))) errors.push(`correspondence_reply_chain_invalid:${record.correspondenceId}`)
    }
  }
  const items = relevant.filter((record) => record.material !== false).sort((left, right) => new Date(left.occurredAt) - new Date(right.occurredAt) || left.correspondenceId.localeCompare(right.correspondenceId)).map((record) => ({ correspondenceId: record.correspondenceId, threadId: record.threadId, replyToCorrespondenceId: record.replyToCorrespondenceId, direction: record.direction, channel: record.channel, type: record.type, state: record.state, occurredAt: record.occurredAt, classifications: record.classifications, attachmentCount: record.attachments?.length || 0, contentReference: record.contentReference, contentHash: record.contentHash }))
  const threads = [...new Set(items.map((item) => item.threadId))].map((threadId) => ({ threadId, correspondenceIds: items.filter((item) => item.threadId === threadId).map((item) => item.correspondenceId), latestAt: items.filter((item) => item.threadId === threadId).at(-1)?.occurredAt || null }))
  const history = { version: CONVEYANCER_MATTER_CORRESPONDENCE_VERSION, transactionId: text(transactionId), generatedAt: iso(asOf) || new Date().toISOString(), itemCount: items.length, threadCount: threads.length, items, threads, reconstructable: errors.length === 0 }
  history.fingerprint = fingerprint(history)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], history })
}

export function buildCorrespondenceAuditEvent({ record = {}, eventId = '', eventType = '', actorUserId = '', reason = '', occurredAt = '', detailReference = '', detailHash = '' } = {}) {
  return buildPracticeAuditEvent({ eventId, eventType, operationId: record.correspondenceId, organisationId: record.identity?.organisationId, attorneyFirmId: record.identity?.attorneyFirmId, transactionId: record.identity?.transactionId, actorUserId, capability: record.direction === 'incoming' ? C.captureEvidence : C.sendCorrespondence, reason, occurredAt, correlationId: record.threadId, causationId: record.replyToCorrespondenceId || '', detailReference, detailHash })
}
