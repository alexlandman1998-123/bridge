import assert from 'node:assert/strict'
import { buildMailboxInput } from '../mailboxService.js'
const input = {
  organisationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  actorUserId: '11111111-1111-4111-8111-111111111111',
  providerKey: 'google_workspace', address: '  Agent@Example.Test ', displayName: ' My mailbox ',
}
const mailbox = buildMailboxInput(input)
assert.equal(mailbox.access_scope, 'private')
assert.equal(mailbox.owner_user_id, input.actorUserId)
assert.equal(mailbox.address, 'agent@example.test')
assert.equal(mailbox.display_name, 'My mailbox')
assert.equal(mailbox.connection_status, 'draft')
assert.equal(mailbox.is_default, false)
for (const accessScope of ['workspace', 'selected']) assert.equal(buildMailboxInput({ ...input, accessScope }).access_scope, accessScope)
assert.equal(buildMailboxInput({ ...input, providerKey: 'other_email' }).provider_key, 'other_email')
for (const patch of [{ accessScope: 'anyone' }, { ownerUserId: '' }, { ownerUserId: '22222222-2222-4222-8222-222222222222' }, { organisationId: 'invalid' }, { address: 'no-address' }, { providerKey: 'pop3' }]) {
  assert.throws(() => buildMailboxInput({ ...input, ...patch }))
}
console.log('Mailbox service: safe defaults and connection input checks passed.')
