import assert from 'node:assert/strict'
import {
  canAppendSharedInboxMessage,
  normalizeSharedInboxChannel,
  normalizeSharedInboxConversation,
  normalizeSharedInboxMessage,
} from '../sharedInboxModel.js'

const channel = normalizeSharedInboxChannel({
  organisation_id: '322c3853-2d82-4413-97e6-b4cd8bc32a7c',
  channel: 'EMAIL',
  provider_key: 'resend',
  address: ' inbox@revo.example ',
  is_default: true,
})
assert.equal(channel.channel, 'email')
assert.equal(channel.address, 'inbox@revo.example')
assert.equal(channel.connectionStatus, 'draft')
assert.equal(channel.isDefault, true)

const conversation = normalizeSharedInboxConversation({
  organisationId: channel.organisationId,
  channelId: 'channel-1',
  contactAddress: 'lead@example.test',
  status: 'OPEN',
  last_message_at: '2026-09-13T07:30:00Z',
})
assert.equal(conversation.status, 'open')
assert.equal(conversation.lastMessageAt, '2026-09-13T07:30:00.000Z')

const message = normalizeSharedInboxMessage({
  organisation_id: channel.organisationId,
  conversation_id: 'conversation-1',
  channel: 'whatsapp',
  direction: 'inbound',
  provider_key: 'meta',
  sender_address: '+27110000000',
  recipient_addresses: ['+27220000000'],
  body_text: 'Hello Revo',
  occurred_at: '2026-09-13T07:31:00Z',
})
assert.equal(message.channel, 'whatsapp')
assert.equal(message.direction, 'inbound')
assert.equal(canAppendSharedInboxMessage(message), true)
assert.equal(canAppendSharedInboxMessage({ ...message, recipientAddresses: [] }), false)
assert.equal(canAppendSharedInboxMessage({ ...message, channel: 'sms' }), false)

console.log('Revo shared inbox foundation model checks passed.')
