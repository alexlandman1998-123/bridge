import assert from 'node:assert/strict'
import { buildRevoInboxConnectionIntent, manageRevoInboxProviderConnection, normalizeRevoInboxProviderConnection } from '../connectionCore.js'

const organisationId = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'
const actorUserId = '11111111-1111-4111-8111-111111111111'
const channelId = '22222222-2222-4222-8222-222222222222'

const intent = buildRevoInboxConnectionIntent({
  organisationId,
  channelId,
  providerKey: 'MICROSOFT_365',
  connectionKind: 'delegated_shared_mailbox',
  mailboxAddress: ' Enquiries@RevoPropertySite.test ',
  actorUserId,
})
assert.equal(intent.status, 'authorizing')
assert.equal(intent.mailboxAddress, 'enquiries@revopropertysite.test')
assert.equal(intent.providerKey, 'microsoft_365')
assert.equal(buildRevoInboxConnectionIntent({ ...intent, providerKey: 'GOOGLE_WORKSPACE' }).providerKey, 'google_workspace')
assert.throws(() => buildRevoInboxConnectionIntent({ ...intent, providerKey: 'imap' }), /Microsoft 365 or Google Workspace/)
assert.throws(() => buildRevoInboxConnectionIntent({ ...intent, organisationId: 'not-revo' }), /only available for the Revo workspace/)
await assert.rejects(() => manageRevoInboxProviderConnection({ organisationId, connectionId: channelId, action: 'delete' }), /valid Revo mailbox connection action/)

const connection = normalizeRevoInboxProviderConnection({
  id: '33333333-3333-4333-8333-333333333333',
  organisation_id: organisationId,
  channel_id: channelId,
  provider_key: 'google_workspace',
  connection_kind: 'individual_mailbox',
  mailbox_address: 'agent@revopropertysite.test',
  status: 'CONNECTED',
  granted_scopes: ['gmail.modify'],
})
assert.equal(connection.status, 'connected')
assert.deepEqual(connection.grantedScopes, ['gmail.modify'])

console.log('Revo provider connection core checks passed.')
