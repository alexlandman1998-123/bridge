import assert from 'node:assert/strict'
import { buildPrivateInboxMessage, buildRevoInboxChannel, isSharedInboxSchemaUnavailable } from '../revoSharedInboxService.js'

const organisationId = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'
const actorUserId = '11111111-1111-4111-8111-111111111111'
const conversation = {
  id: '22222222-2222-4222-8222-222222222222',
  channel: 'email',
  providerKey: 'mail-provider',
  channelAddress: 'inbox@revo.example',
  contactAddress: 'lead@example.test',
  subject: 'Viewing request',
}

const note = buildPrivateInboxMessage({ organisationId, conversation, actorUserId, bodyText: 'Call after 3pm.', type: 'note' })
assert.equal(note.message_type, 'note')
assert.equal(note.delivery_status, 'queued')
assert.equal(note.direction, 'outbound')
assert.deepEqual(note.recipient_addresses, ['lead@example.test'])

const draft = buildPrivateInboxMessage({ organisationId, conversation, actorUserId, bodyText: 'Thanks for your enquiry.', type: 'draft' })
assert.equal(draft.message_type, 'draft')
assert.equal(draft.subject, 'Viewing request')
assert.throws(() => buildPrivateInboxMessage({ organisationId, conversation, actorUserId, bodyText: '', type: 'note' }), /Write a note/)
assert.throws(() => buildPrivateInboxMessage({ organisationId: 'other', conversation, actorUserId, bodyText: 'Nope', type: 'note' }), /only available for the Revo workspace/)
assert.equal(isSharedInboxSchemaUnavailable({ code: '42P01' }), true)
assert.equal(isSharedInboxSchemaUnavailable({ message: 'permission denied' }), false)

const configuredChannel = buildRevoInboxChannel({
  organisationId,
  actorUserId,
  channel: 'email',
  providerKey: 'google_workspace',
  address: 'inbox@revo.example',
  displayName: 'Revo enquiries',
})
assert.equal(configuredChannel.connection_status, 'draft')
assert.equal(configuredChannel.is_default, false)
assert.equal(configuredChannel.metadata_json.setupVersion, 1)
assert.throws(() => buildRevoInboxChannel({ organisationId, actorUserId, channel: 'email', providerKey: 'meta_cloud_api', address: 'inbox@revo.example' }), /supported provider/)

console.log('Revo shared inbox operations service checks passed.')
