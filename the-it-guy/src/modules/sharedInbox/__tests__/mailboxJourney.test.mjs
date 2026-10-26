import assert from 'node:assert/strict'
import { normalizeOutgoing, outgoingBody } from '../../../../../supabase/functions/_shared/inboxOutgoing.js'

// Runs against the real Inbox migrations and RLS, with Vault/Storage fixtures.
// No provider calls or actual submissions occur in this acceptance journey.
export async function checkMailboxJourney(db, { A, B, admin, member }) {
  const boxes = ['acce0001-1111-4111-8111-111111111111', 'acce0002-1111-4111-8111-111111111111']
  const addresses = ['team-acceptance@example.test', 'private-acceptance@example.test']
  const actor = user => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`)
  const service = () => db.exec('reset role; set role service_role')
  const call = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result
  // Keep other test fixtures out of this journey's scheduler assertions.
  await db.exec("reset role; update revo_inbox_provider_connections set next_sync_at=clock_timestamp()+interval '1 day',sync_locked_until=null,sync_lease_token=null")
  await actor(admin)
  for (let i = 0; i < boxes.length; i++) {
    await db.query(`insert into revo_inbox_channels(id,organisation_id,channel,provider_key,address,access_scope,owner_user_id)
      values($1,$2,'email','other_email',$3,$4,$5)`, [boxes[i], A, addresses[i], i ? 'private' : 'selected', admin])
    await call('shared_inbox_save_mailbox_signature', [A, boxes[i], JSON.stringify({ name: `Signature ${i + 1}`, body: [] }), true, true, 0])
  }
  await db.query(`insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role) values($1,$2,$3,'responder')`, [A, boxes[0], member])
  const incoming = { providerId: 'same-provider-id', internetMessageId: '<same-incoming@example.test>', senderAddress: 'client@example.test', replyTo: ['reply@example.test'], to: addresses, subject: 'Two inboxes', receivedAt: '2026-10-25T12:00:00Z', bodyText: 'Same original message', isRead: false, attachments: [] }
  const configs = [], received = [], leases = []
  await service()
  for (let i = 0; i < boxes.length; i++) {
    configs.push(await call('shared_inbox_configure_imap', [A, boxes[i], admin, JSON.stringify({ host: 'imap.example.test', port: 993, username: addresses[i], password: `incoming-fixture-${i}` })]))
    const lease = await call('shared_inbox_claim_mailbox'); leases.push(lease)
    assert.equal(lease.connection.channel_id, boxes[i])
    received.push(await call('shared_inbox_commit_received', [lease.connection.id, lease.token, JSON.stringify(incoming), JSON.stringify({ cursor: { last: i + 1 } })]))
    await call('shared_inbox_finish_mailbox', [lease.connection.id, lease.token, false, null, 60])
    // First successful authorization schedules an immediate follow-up sync.
    const followUp = await call('shared_inbox_claim_mailbox')
    assert.equal(followUp.connection.channel_id, boxes[i])
    await call('shared_inbox_finish_mailbox', [followUp.connection.id, followUp.token, false, null, 60])
    await call('shared_inbox_configure_smtp', [A, boxes[i], admin, JSON.stringify({ host: 'smtp.example.test', port: 587, username: addresses[i], password: `outgoing-fixture-${i}` })])
  }
  const rows = (await db.query('select id,conversation_id,channel_id from revo_inbox_messages where id=any($1::uuid[])', [received.map(row => row.messageId)])).rows
  assert.equal(new Set(rows.map(row => row.conversation_id)).size, 2, 'identical incoming mail has independent conversations')
  const conversations = boxes.map(box => rows.find(row => row.channel_id === box).conversation_id)
  await actor(member)
  const choices = (await call('shared_inbox_sending_mailboxes', [A])).filter(row => boxes.includes(row.id))
  assert.deepEqual(choices.map(row => row.id), [boxes[0]], 'responder sees only the permitted From identity')
  assert.equal((await call('shared_inbox_conversation_page', [A, conversations[1], null, null])).messages.length, 0)
  assert.equal((await call('shared_inbox_conversation_page', [B, conversations[0], null, null])).messages.length, 0)
  const jobs = []
  for (let i = 0; i < boxes.length; i++) {
    await actor(i ? admin : member)
    const mailbox = (await call('shared_inbox_sending_mailboxes', [A])).find(row => row.id === boxes[i])
    const context = await call('shared_inbox_reply_context', [A, conversations[i]])
    assert.deepEqual(context.to, ['reply@example.test'])
    const payload = normalizeOutgoing({ to: context.to, subject: 'Re: Two inboxes', body: 'Reply from this mailbox', conversationId: conversations[i], replyMessageId: context.messageId, useSignature: true, signatureRevision: mailbox.signatureRevision })
    const rendered = outgoingBody(payload, mailbox.signature)
    await service()
    const args = [A, boxes[i], i ? admin : member, `acce100${i}-1111-4111-8111-111111111111`, JSON.stringify(payload), JSON.stringify(rendered)]
    const job = await call('shared_inbox_queue_email', args)
    assert.deepEqual(await call('shared_inbox_queue_email', args), job, 'lost queue response can be retried without duplication')
    jobs.push(job)
    const message = (await db.query("select sender_address,body_text,in_reply_to from revo_inbox_messages where conversation_id=$1 and direction='outbound'", [conversations[i]])).rows[0]
    assert.equal(message.sender_address, addresses[i]); assert.equal(message.in_reply_to, incoming.internetMessageId)
    assert(message.body_text.includes(`Signature ${i + 1}`)); assert(!message.body_text.includes(`Signature ${2 - i}`))
  }
  const preparing = await call('shared_inbox_claim_outgoing')
  assert.equal(preparing.job.id, jobs[0].id)
  const prepared = await call('shared_inbox_prepare_outgoing', [jobs[0].id, preparing.token])
  assert.equal(prepared.smtp.password, 'outgoing-fixture-0'); assert.equal(prepared.sender, addresses[0])
  // A receiving request cannot steal a sending lease on the same mailbox.
  await actor(admin); await call('shared_inbox_request_sync', [A, configs[0].connectionId, null]); await service()
  assert.equal(await call('shared_inbox_claim_mailbox'), null)
  await call('shared_inbox_disconnect_mailbox', [A, configs[0].connectionId, admin])
  const reconnected = await call('shared_inbox_configure_imap', [A, boxes[0], admin, JSON.stringify({ host: 'imap.example.test', port: 993, username: addresses[0], password: 'replacement-fixture' })])
  assert.equal(reconnected.connectionId, configs[0].connectionId, 'reconnect preserves mailbox identity and history')
  await assert.rejects(() => call('shared_inbox_begin_submission', [jobs[0].id, preparing.token]), /outgoing_lease_lost|mailbox_lease_lost/)
  await assert.rejects(() => call('shared_inbox_commit_received', [configs[0].connectionId, leases[0].token, JSON.stringify(incoming), '{}']), /mailbox_lease_lost/)
  await call('shared_inbox_finish_outgoing', [jobs[0].id, preparing.token, 'failed', null, null, 'mailbox_send_access_changed', 0])
  // The second mailbox keeps its own credentials and can finish while the first reconnects.
  const healthy = await call('shared_inbox_claim_outgoing')
  assert.equal(healthy.job.id, jobs[1].id)
  assert.equal((await call('shared_inbox_prepare_outgoing', [jobs[1].id, healthy.token])).smtp.password, 'outgoing-fixture-1')
  await call('shared_inbox_begin_submission', [jobs[1].id, healthy.token])
  await call('shared_inbox_finish_outgoing', [jobs[1].id, healthy.token, 'accepted', 'fixture-provider-ack', null, null, 0])
  const replay = await call('shared_inbox_claim_mailbox')
  assert.equal(replay.connection.id, configs[0].connectionId); assert.deepEqual(replay.checkpoint, {})
  const replayed = await call('shared_inbox_commit_received', [replay.connection.id, replay.token, JSON.stringify(incoming), JSON.stringify({ cursor: { last: 1 } })])
  assert.equal(replayed.messageId, received[0].messageId, 'reconnect replay updates the original message')
  await call('shared_inbox_finish_mailbox', [replay.connection.id, replay.token, false, null, 60])
  assert.equal((await call('revo_read_inbox_connection_credential', [replay.connection.id])).password, 'replacement-fixture')
  await actor(admin)
  const reconnectedBox = (await call('shared_inbox_sending_mailboxes', [A])).find(row => row.id === boxes[0])
  assert.equal(reconnectedBox.smtpConfigured, false, 'disconnect requires deliberate SMTP reconfiguration')
  await db.query('delete from shared_inbox_mailbox_members where channel_id=$1 and user_id=$2', [boxes[0], member])
  await actor(member)
  assert.equal((await call('shared_inbox_conversation_page', [A, conversations[0], null, null])).messages.length, 0, 'revocation removes an already-open thread on its next read')
  assert(!(await call('shared_inbox_sending_mailboxes', [A])).some(row => boxes.includes(row.id)))
  assert(!(await call('shared_inbox_outgoing', [A, null])).some(row => jobs.some(job => job.id === row.id)))
  await db.exec('reset role')
  console.log('Mailbox acceptance journey: two inboxes, independent threads/identities/signatures, reply queue, reconnect fencing, healthy peer and revoked access passed.')
}
