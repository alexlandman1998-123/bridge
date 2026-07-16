import assert from 'node:assert/strict'
import {
  buildCommunicationPreference,
  buildCorrespondenceAuditEvent,
  buildCorrespondenceDispatchIntent,
  buildCorrespondencePolicy,
  buildMatterCommunicationHistory,
  buildMatterCorrespondenceRecord,
  CORRESPONDENCE_SIDE_EFFECT_BOUNDARY,
  detectDuplicateCorrespondence,
  evaluateCorrespondenceFollowUp,
  projectCanonicalFiledCorrespondence,
  recordCorrespondenceDeliveryEvent,
  reviewCorrespondenceForRelease,
  validateCorrespondenceRecipients,
} from '../conveyancerMatterCorrespondenceRegister.js'
import { CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION } from '../../../services/attorneyWorkflow/conveyancerCorrespondenceGenerator.js'

const org = '10000000-0000-4000-8000-000000000001'
const firm = '20000000-0000-4000-8000-000000000001'
const branch = '30000000-0000-4000-8000-000000000001'
const team = '40000000-0000-4000-8000-000000000001'
const matter = '50000000-0000-4000-8000-000000000001'
const secretary = '60000000-0000-4000-8000-000000000001'
const attorney = '70000000-0000-4000-8000-000000000001'
const service = '80000000-0000-4000-8000-000000000001'
const profile = '90000000-0000-4000-8000-000000000001'
const at = '2026-07-16T12:00:00.000Z'
const hashA = `sha256:${'a'.repeat(64)}`
const hashB = `sha256:${'b'.repeat(64)}`
const hashC = `sha256:${'c'.repeat(64)}`

function identity(operationId = 'correspondence:g6:1') {
  return { organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team, transactionId: matter, operationId, lane: 'transfer' }
}

function actor(role = 'conveyancing_secretary', userId = secretary) {
  return { userId, membershipId: `membership:${userId}`, role, organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team }
}

function policy(overrides = {}) {
  return buildCorrespondencePolicy({ policyId: 'correspondence-policy:g6:1', policyVersion: '1.0.0', organisationId: org, attorneyFirmId: firm, effectiveAt: '2026-07-01T00:00:00Z', permittedChannels: ['email', 'portal_message', 'letter'], approvalRequiredTypes: ['instruction', 'document_request', 'escalation', 'payment_notice', 'registration_notice'], acknowledgementSlaHours: 24, reminderAfterHours: 24, escalationAfterHours: 48, maximumAttachmentCount: 10, reason: 'Firm matter correspondence policy.', ...overrides })
}

function preference(overrides = {}) {
  return buildCommunicationPreference({ preferenceId: 'preference:g6:client', contactId: 'contact:g6:client', permittedChannels: ['email', 'portal_message'], preferredChannel: 'email', language: 'en', operationalMessagesAllowed: true, marketingOptOut: true, consentReference: 'consent://g6/client', legalBasis: 'contract_and_legal_obligation', effectiveAt: '2026-07-01T00:00:00Z', ...overrides }).preference
}

function contacts(overrides = {}) {
  return [{ contactId: 'contact:g6:client', partyId: 'party:g6:client', role: 'seller', addressReference: 'contact-vault://g6/client/email', addressHash: hashA, verifiedAt: '2026-07-01T00:00:00Z', active: true, external: true, preference: preference(), ...overrides }]
}

function generatedDraft() {
  return { version: CONVEYANCER_CORRESPONDENCE_GENERATOR_VERSION, correspondenceId: 'c2-draft:g6:1', status: 'draft', dispatchAllowed: false, contentFingerprint: 'fnv1a_1234abcd', template: { templateVersionId: 'template:g6:1' } }
}

function record(overrides = {}) {
  const correspondenceId = overrides.correspondenceId || 'correspondence:g6:1'
  return buildMatterCorrespondenceRecord({
    correspondenceId,
    identity: identity(correspondenceId),
    actor: actor(),
    policy: policy().policy,
    direction: 'outgoing',
    channel: 'email',
    type: 'document_request',
    sourceMode: 'generated',
    sourceReference: 'c2://draft/g6/1',
    generatedCorrespondence: generatedDraft(),
    classifications: ['confidential', 'personal'],
    privileged: false,
    confidential: true,
    threadId: 'thread:g6:1',
    contentReference: 'content://g6/1',
    contentHash: hashB,
    subjectHash: hashC,
    recipients: [{ contactId: 'contact:g6:client', type: 'to' }],
    contacts: contacts(),
    attachments: [{ attachmentId: 'attachment:g6:1', documentReference: 'document://g6/1', documentHash: hashA, fileName: 'Request checklist.pdf', mediaType: 'application_pdf', classifications: ['confidential'] }],
    documentRequest: { requestId: 'request:g6:1', requestedEvidenceTypes: ['identity_document', 'address_verification'], dueAt: '2026-07-20T00:00:00Z' },
    occurredAt: at,
    filedAt: at,
    retainUntil: '2032-07-16T00:00:00Z',
    ...overrides,
  })
}

function approvedRecord(overrides = {}) {
  const captured = record(overrides)
  assert.equal(captured.ok, true, JSON.stringify(captured.errors))
  const approved = reviewCorrespondenceForRelease({ record: captured.record, reviewer: actor('responsible_attorney', attorney), decision: 'approved', reason: 'Recipients, attachments and wording approved.', reviewedAt: '2026-07-16T13:00:00Z', approvalReference: 'approval://g6/1', approvalHash: hashA })
  assert.equal(approved.ok, true, JSON.stringify(approved.errors))
  return approved.record
}

function sentRecord() {
  const approved = approvedRecord()
  const sent = recordCorrespondenceDeliveryEvent({ record: approved, eventId: 'delivery:g6:sent', status: 'sent', occurredAt: '2026-07-16T14:00:00Z', evidenceReference: 'delivery://g6/sent', evidenceHash: hashA, reason: 'Provider accepted the message for delivery.' })
  assert.equal(sent.ok, true, JSON.stringify(sent.errors))
  return sent.record
}

function incoming(overrides = {}) {
  const correspondenceId = overrides.correspondenceId || 'correspondence:g6:incoming'
  return buildMatterCorrespondenceRecord({ correspondenceId, identity: identity(correspondenceId), actor: actor('responsible_attorney', attorney), policy: policy().policy, direction: 'incoming', channel: 'email', type: 'acknowledgement', sourceMode: 'manual', sourceReference: 'manual-email://g6/incoming', classifications: ['confidential'], confidential: true, threadId: 'thread:g6:1', replyToCorrespondenceId: 'correspondence:g6:1', providerMessageReference: 'provider-message://g6/incoming', providerMessageHash: hashC, contentReference: 'content://g6/incoming', contentHash: hashA, subjectHash: hashB, recipients: [{ contactId: 'contact:g6:client', type: 'from' }], contacts: contacts(), attachments: [], occurredAt: '2026-07-17T09:00:00Z', filedAt: '2026-07-17T09:05:00Z', ...overrides })
}

function test(name, fn) {
  try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error }
}

test('builds versioned correspondence policy and communication preferences', () => {
  assert.equal(policy().ok, true)
  const result = buildCommunicationPreference({ ...preference(), preferenceId: 'preference:g6:test' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.preference.marketingOptOut, true)
  assert.equal(result.preference.operationalMessagesAllowed, true)
})

test('validates verified recipients and their channel preferences', () => {
  const valid = validateCorrespondenceRecipients({ recipients: [{ contactId: 'contact:g6:client', type: 'to' }], contacts: contacts(), channel: 'email', direction: 'outgoing' })
  assert.equal(valid.valid, true, JSON.stringify(valid.errors))
  const blockedContacts = contacts({ preference: preference({ permittedChannels: ['portal_message'], preferredChannel: 'portal_message' }) })
  const blocked = validateCorrespondenceRecipients({ recipients: [{ contactId: 'contact:g6:client', type: 'to' }], contacts: blockedContacts, channel: 'email', direction: 'outgoing' })
  assert.ok(blocked.errors.includes('correspondence_channel_not_permitted:contact:g6:client'))
})

test('files a C2-generated document request with classifications and attachments', () => {
  const result = record()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.record.state, 'pending_approval')
  assert.equal(result.record.documentRequest.requestedEvidenceTypes.length, 2)
  assert.deepEqual(result.informationResource.classifications, ['confidential', 'personal'])
  assert.equal(result.record.controls.messageSent, false)
})

test('rejects duplicate attachment hashes and inconsistent privilege flags', () => {
  const attachment = { attachmentId: 'attachment:g6:2', documentReference: 'document://g6/2', documentHash: hashA, fileName: 'Duplicate.pdf', mediaType: 'application_pdf', classifications: ['confidential'] }
  const duplicate = record({ attachments: [record().record.attachments[0], attachment] })
  assert.ok(duplicate.errors.includes('correspondence_duplicate_attachment'))
  const privilege = record({ privileged: true, classifications: ['confidential'] })
  assert.ok(privilege.errors.includes('correspondence_privilege_classification_required'))
})

test('allows manual inbound filing without requiring an email provider', () => {
  const result = incoming()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.record.state, 'filed')
  assert.equal(result.record.source.mode, 'manual')
})

test('allows integration service capture but never grants approval or dispatch', () => {
  const result = incoming({ correspondenceId: 'correspondence:g6:integrated', actor: actor('service', service), sourceMode: 'integration', sourceReference: 'provider://mail/g6/1', integrationProfileId: profile, providerEventId: 'event:g6:1', providerEventHash: hashA })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.record.source.mode, 'integration')
  const dispatch = buildCorrespondenceDispatchIntent({ record: { ...result.record, direction: 'outgoing', state: 'approved' }, actor: actor('service', service), preparedAt: '2026-07-17T10:00:00Z', idempotencyKey: 'dispatch-g6-service', currentPreferences: [preference()] })
  assert.ok(dispatch.errors.includes('correspondence_dispatch_not_authorised'))
})

test('requires independent attorney approval for governed outgoing correspondence', () => {
  const captured = record().record
  const self = reviewCorrespondenceForRelease({ record: captured, reviewer: actor(), decision: 'approved', reason: 'Self review.', reviewedAt: '2026-07-16T13:00:00Z', approvalReference: 'approval://self', approvalHash: hashA })
  assert.ok(self.errors.includes('independent_correspondence_review_required'))
  const approved = approvedRecord()
  assert.equal(approved.state, 'approved')
  assert.equal(approved.approval.approvedFingerprint, captured.fingerprint)
})

test('prepares a reference-only dispatch intent without sending the message', () => {
  const result = buildCorrespondenceDispatchIntent({ record: approvedRecord(), actor: actor('conveyancing_secretary', secretary), preparedAt: '2026-07-16T13:30:00Z', idempotencyKey: 'dispatch-g6-1', currentPreferences: [preference()] })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.intent.state, 'prepared')
  assert.equal(result.intent.providerCalled, false)
  assert.equal(result.intent.messageSent, false)
  const stalePreference = buildCorrespondenceDispatchIntent({ record: approvedRecord(), actor: actor('conveyancing_secretary', secretary), preparedAt: '2026-07-16T13:30:00Z', idempotencyKey: 'dispatch-g6-stale', currentPreferences: [] })
  assert.ok(stalePreference.errors.includes('correspondence_current_preference_required:contact:g6:client'))
})

test('records chronological delivery, failure and acknowledgement evidence', () => {
  const sent = sentRecord()
  const delivered = recordCorrespondenceDeliveryEvent({ record: sent, eventId: 'delivery:g6:delivered', status: 'delivered', occurredAt: '2026-07-16T14:05:00Z', evidenceReference: 'delivery://g6/delivered', evidenceHash: hashB, reason: 'Provider delivery receipt recorded.' })
  assert.equal(delivered.ok, true, JSON.stringify(delivered.errors))
  const acknowledged = recordCorrespondenceDeliveryEvent({ record: delivered.record, eventId: 'delivery:g6:ack', status: 'acknowledged', occurredAt: '2026-07-17T09:00:00Z', evidenceReference: 'ack://g6/client', evidenceHash: hashC, reason: 'Client acknowledgement captured.' })
  assert.equal(acknowledged.ok, true, JSON.stringify(acknowledged.errors))
  const backwards = recordCorrespondenceDeliveryEvent({ record: sent, eventId: 'delivery:g6:backwards', status: 'delivered', occurredAt: '2026-07-16T13:00:00Z', evidenceReference: 'delivery://g6/backwards', evidenceHash: hashA, reason: 'Invalid chronology.' })
  assert.ok(backwards.errors.includes('correspondence_delivery_chronology_invalid'))
})

test('derives reminder, escalation and delivery-failure eligibility without scheduling', () => {
  const sent = sentRecord()
  const reminder = evaluateCorrespondenceFollowUp({ record: sent, policy: policy().policy, asOf: '2026-07-17T15:00:00Z' })
  assert.equal(reminder.action, 'remind')
  assert.equal(reminder.reminderScheduled, false)
  const escalation = evaluateCorrespondenceFollowUp({ record: sent, policy: policy().policy, asOf: '2026-07-19T15:00:00Z' })
  assert.equal(escalation.action, 'escalate')
  const failed = recordCorrespondenceDeliveryEvent({ record: sent, eventId: 'delivery:g6:failed', status: 'failed', occurredAt: '2026-07-16T15:00:00Z', evidenceReference: 'failure://g6/1', evidenceHash: hashA, reason: 'Mailbox rejected the message.' }).record
  assert.equal(evaluateCorrespondenceFollowUp({ record: failed, policy: policy().policy, asOf: '2026-07-16T16:00:00Z' }).action, 'resolve_delivery_failure')
})

test('detects provider and content duplicates without auto-merging records', () => {
  const first = incoming().record
  const candidate = incoming({ correspondenceId: 'correspondence:g6:duplicate' }).record
  const result = detectDuplicateCorrespondence(candidate, [first])
  assert.equal(result.duplicate, true)
  assert.ok(result.matches[0].reasons.includes('same_provider_message'))
  assert.equal(result.action, 'human_filing_review_required')
})

test('projects manual and integrated sources into equivalent filed contracts', () => {
  const manual = incoming({ correspondenceId: 'correspondence:g6:manual-equivalent', providerMessageReference: '', providerMessageHash: '' }).record
  const integrated = incoming({ correspondenceId: 'correspondence:g6:integrated-equivalent', actor: actor('service', service), sourceMode: 'integration', sourceReference: 'provider://mail/g6/equivalent', integrationProfileId: profile, providerEventId: 'event:g6:equivalent', providerEventHash: hashC, providerMessageReference: '', providerMessageHash: '' }).record
  const manualProjection = projectCanonicalFiledCorrespondence(manual)
  const integratedProjection = projectCanonicalFiledCorrespondence(integrated)
  assert.equal(manualProjection.filed.equivalenceKey, integratedProjection.filed.equivalenceKey)
  assert.equal('source' in manualProjection.filed, false)
})

test('reconstructs chronological material threads and detects orphan replies', () => {
  const root = approvedRecord()
  const reply = incoming().record
  const result = buildMatterCommunicationHistory({ records: [reply, root], transactionId: matter, asOf: '2026-07-17T10:00:00Z' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.history.itemCount, 2)
  assert.equal(result.history.threadCount, 1)
  assert.equal(result.history.reconstructable, true)
  const orphan = buildMatterCommunicationHistory({ records: [incoming({ replyToCorrespondenceId: 'missing:g6' }).record], transactionId: matter })
  assert.ok(orphan.errors.some((error) => error.startsWith('correspondence_orphan_reply')))
  const tampered = structuredClone(reply)
  tampered.contentHash = hashC
  const damaged = buildMatterCommunicationHistory({ records: [root, tampered], transactionId: matter })
  assert.ok(damaged.errors.includes('correspondence_history_record_tampered:correspondence:g6:incoming'))
})

test('records filing and delivery decisions in the common G1 audit shape', () => {
  const value = approvedRecord()
  const audit = buildCorrespondenceAuditEvent({ record: value, eventId: 'audit:g6:1', eventType: 'correspondence_approved', actorUserId: attorney, reason: 'Outgoing document request approved.', occurredAt: value.approval.reviewedAt, detailReference: 'correspondence://g6/1', detailHash: hashA })
  assert.equal(audit.ok, true, JSON.stringify(audit.errors))
  assert.equal(audit.event.eventType, 'correspondence_approved')
  assert.equal(CORRESPONDENCE_SIDE_EFFECT_BOUNDARY.providerCalled, false)
})

console.log('G6 matter-correspondence register tests passed.')
