import assert from 'node:assert/strict'
export async function checkReceiving(db, { A, B, admin, member }) {
  const box1 = 'fade0001-1111-4111-8111-111111111111', box2 = 'fade0002-1111-4111-8111-111111111111'
  const actor = async user => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`)
  const service = () => db.exec('reset role; set role service_role')
  const call = async (name, values = []) => (await db.query(`select public.${name}(${values.map((_,i) => '$'+(i+1)).join(',')}) result`,values)).rows[0].result
  await actor(admin)
  await db.exec(`insert into revo_inbox_channels(id,organisation_id,channel,provider_key,address,access_scope,owner_user_id) values
    ('${box1}','${A}','email','other_email','receiver-one@example.test','selected','${admin}'),
    ('${box2}','${A}','email','other_email','receiver-two@example.test','private','${admin}');
    insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role) values('${A}','${box1}','${member}','viewer')`)
  await assert.rejects(() => call('shared_inbox_claim_mailbox'), /permission denied/)
  await service()
  const secret = JSON.stringify({ host:'imap.example.test',port:993,username:'receiver',password:'local-fixture-only' })
  await assert.rejects(() => call('shared_inbox_configure_imap',[A,box1,member,secret]), /management access/)
  await assert.rejects(() => call('shared_inbox_configure_imap',[B,box1,admin,secret]), /management access/)
  const config = await call('shared_inbox_configure_imap',[A,box1,admin,secret])
  const config2 = await call('shared_inbox_configure_imap',[A,box2,admin,secret])
  assert.equal(config.status,'authorizing')
  let first = await call('shared_inbox_claim_mailbox'), second = await call('shared_inbox_claim_mailbox')
  if (first.connection.channel_id !== box1) [first,second] = [second,first]
  assert.equal(first.connection.id,config.connectionId)
  assert.equal(second.connection.id,config2.connectionId)
  assert.equal(await call('shared_inbox_claim_mailbox'),null,'leases exclude concurrent claims')
  const commit = (job,message,cursor) => call('shared_inbox_commit_received',[job.connection.id,job.token,message ? JSON.stringify(message) : null,JSON.stringify(cursor)])
  const base = { providerId:'uid-2',internetMessageId:'<reply@example>',inReplyTo:'<root@example>',references:['<root@example>'],senderAddress:'client@example.test',replyTo:['reply-to@example.test'],to:['receiver-one@example.test'],subject:'Reply first',receivedAt:'2026-10-25T12:00:00Z',bodyText:'Newest message',bodyHtml:'<p>Newest message</p>',isRead:false,attachments:[] }
  await commit(first,null,{cursor:{last:0}})
  assert.equal((await db.query('select skipped_count from revo_inbox_sync_runs where lease_token=$1',[first.token])).rows[0].skipped_count,0,'saving a page plan is not a skipped message')
  await commit(first,{skipped:true},{cursor:{last:1}})
  assert.equal((await db.query('select skipped_count from revo_inbox_sync_runs where lease_token=$1',[first.token])).rows[0].skipped_count,1)
  const saved = await commit(first,base,{cursor:{last:2}})
  assert.equal(saved.updated,false)
  await commit(first,{...base,bodyText:'Full newest content'}, {cursor:{last:2}})
  const parent = await commit(first,{...base,providerId:'uid-1',internetMessageId:'<root@example>',references:[],inReplyTo:null,receivedAt:'2026-10-24T12:00:00Z',bodyText:'Older read message',isRead:true},{cursor:{last:3}})
  const other = await commit(second,base,{cursor:{last:2}})
  const row = async id => (await db.query('select * from revo_inbox_messages where id=$1',[id])).rows[0]
  const message = await row(saved.messageId), older = await row(parent.messageId)
  assert.deepEqual(message.reply_to_addresses,['reply-to@example.test'])
  assert.equal(message.conversation_id,older.conversation_id,'reply before parent threads by RFC aliases')
  assert.notEqual(message.conversation_id,(await row(other.messageId)).conversation_id,'identical RFC/provider IDs stay mailbox scoped')
  let thread = (await db.query('select * from revo_inbox_conversations where id=$1',[message.conversation_id])).rows[0]
  assert.equal(thread.last_message_preview,'Full newest content'); assert.equal(thread.unread_count,1)
  await assert.rejects(() => commit(first,{...base,providerId:'bad',internetMessageId:'<bad>',attachments:[{id:'bad',filename:'bad',size:1,state:'available',objectPath:`${B}/${box1}/evil`}]},{cursor:{last:999}}), /invalid_attachment_path/)
  assert.equal((await db.query('select cursor_json from private.shared_inbox_sync_state where connection_id=$1',[config.connectionId])).rows[0].cursor_json.cursor.last,3,'failed writes do not advance checkpoints')
  const path = `${A}/${box1}/message/file`
  await commit(first,{...base,attachments:[{id:'file',filename:'offer.pdf',contentType:'application/pdf',size:10,state:'available',objectPath:path}]},{cursor:{last:4}})
  await db.exec(`reset role; insert into storage.objects(bucket_id,name) values('shared-inbox-attachments','${path}'),('public-test','visible');`)
  await actor(member)
  const page = await call('shared_inbox_conversation_page',[A,message.conversation_id,null,null])
  assert.equal(page.messages.length,2); assert.equal(page.messages[1].attachments[0].filename,'offer.pdf')
  assert(!JSON.stringify(page).includes(path),'thread response never exposes object paths')
  assert.equal((await db.query('select id from shared_inbox_attachments')).rows.length,1)
  await assert.rejects(() => db.query('select object_path from shared_inbox_attachments'), /permission denied/)
  assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows.map(row => row.bucket_id),['public-test'],'broad legacy Storage policies cannot expose inbox files')
  assert.equal((await call('shared_inbox_conversation_page',[A,(await rowAsOwner(other.messageId)).conversation_id,null,null])).messages.length,0)
  await assert.rejects(() => call('shared_inbox_request_sync',[A,config.connectionId,null]),/management access/)
  await service()
  // Many equal timestamps prove the secondary key does not skip thread messages.
  for(let i=0;i<23;i++) await commit(first,{...base,providerId:`page-${i}`,internetMessageId:`<page-${i}>`},{cursor:{last:5+i}})
  await actor(admin)
  const latest = await call('shared_inbox_conversation_page',[A,message.conversation_id,null,null])
  assert.equal(latest.hasMore,true); assert.equal(latest.messages.length,20)
  const before = latest.messages[0]
  const previous = await call('shared_inbox_conversation_page',[A,message.conversation_id,before.occurred_at,before.id])
  assert.equal(previous.messages.length,5); assert.equal(previous.hasMore,false)
  assert.equal(new Set([...latest.messages,...previous.messages].map(m=>m.id)).size,25)
  await service()
  await db.exec(`reset role; update revo_inbox_provider_connections set sync_locked_until=clock_timestamp()-interval '1 second' where id='${config.connectionId}'; set role service_role;`)
  await assert.rejects(() => commit(first,base,{cursor:{last:99}}), /mailbox_lease_lost/)
  const resumed = await call('shared_inbox_claim_mailbox')
  assert.equal(resumed.checkpoint.cursor.last,27)
  // A callback already exchanging its OAuth code must not undo disconnect.
  await db.exec(`reset role; insert into revo_inbox_oauth_states(state_hash,organisation_id,connection_id,requested_by,provider_key,return_url,code_verifier,expires_at,consumed_at) values
    ('late-callback','${A}','${config.connectionId}','${admin}','google_workspace','http://localhost:5173/inbox/settings',repeat('x',43),clock_timestamp()+interval '5 minutes',clock_timestamp()); set role service_role;`)
  await call('shared_inbox_disconnect_mailbox',[A,config.connectionId,admin])
  await assert.rejects(() => call('shared_inbox_complete_oauth',['late-callback','wrong-account',secret]),/authorization_cancelled/)

  await assert.rejects(() => call('shared_inbox_renew_mailbox',[resumed.connection.id,resumed.token]),/mailbox_lease_lost/)
  await assert.rejects(() => call('shared_inbox_rotate_mailbox_credential',[resumed.connection.id,resumed.token,secret]),/mailbox_lease_lost/)
  await assert.rejects(() => call('revo_read_inbox_connection_credential',[config.connectionId]),/credential not found/)
  // Failure and retry in one mailbox leave the other lease/checkpoint intact.
  await call('shared_inbox_finish_mailbox',[second.connection.id,second.token,false,null,60])
  const healthy = (await db.query('select status,last_sync_at from revo_inbox_provider_connections where id=$1',[second.connection.id])).rows[0]
  assert.equal(healthy.status,'connected'); assert(healthy.last_sync_at)
  await actor(admin)
  await call('shared_inbox_request_sync',[A,config2.connectionId,7])
  await service()
  const job = await call('shared_inbox_claim_mailbox')
  assert.deepEqual(job.checkpoint,{})
  await db.exec(`reset role; update organisation_users set status='suspended' where organisation_id='${A}' and user_id='${admin}'; set role service_role;`)
  await assert.rejects(() => commit(job,base,{}),/mailbox_lease_lost/)
  await db.exec(`reset role; update organisation_users set status='active' where organisation_id='${A}' and user_id='${admin}';`)
  console.log('Receiving database: atomic replay, threading, leases, disconnect, mailbox isolation, private attachments and keyset pages passed.')
  async function rowAsOwner(id) { await service(); const result = await row(id); await actor(member); return result }
}
