import assert from 'node:assert/strict'

// Called by the existing shared-inbox-access check against the real migration.
export async function checkMailboxFoundation(db, { A, B, admin, member, outsider, channelA, threadA }) {
  const viewer = '88888888-8888-4888-8888-888888888888'
  const responder = '99999999-9999-4999-8999-999999999999'
  const privateBox = 'aaaa1111-1111-4111-8111-111111111111'
  const teamBox = 'aaaa2222-2222-4222-8222-222222222222'
  const privateThread = 'aaaa3333-3333-4333-8333-333333333333'
  const teamThread = 'aaaa4444-4444-4444-8444-444444444444'
  const connA = 'aaaa5555-5555-4555-8555-555555555555'
  const connB = 'aaaa6666-6666-4666-8666-666666666666'
  async function as(user) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`); }
  async function permissions(channel, org = A) { return (await db.query(`select shared_inbox_mailbox_permissions('${org}','${channel}') p`)).rows[0].p; }
  const draft = (thread, actor, body = 'draft') => `insert into revo_inbox_messages(organisation_id,conversation_id,channel,direction,message_type,provider_key,sender_address,recipient_addresses,body_text,created_by,delivery_status) values ('${A}','${thread}','email','internal','draft','google_workspace','mailbox@example.test',array['client@example.test'],'${body}','${actor}','queued')`

  await db.exec(`reset role;
    insert into profiles values ('${viewer}'),('${responder}');
    insert into organisation_users values ('${A}','${viewer}','agent','active'),('${A}','${responder}','agent','active');`)
  // Ordinary active members can create their own private mailbox; no admin gets
  // implicit access to its content. Existing workspace channels remain shared.
  await as(member)
  await db.exec(`insert into revo_inbox_channels(id,organisation_id,channel,provider_key,address,access_scope,owner_user_id,created_by)
    values ('${privateBox}','${A}','email','google_workspace','personal@example.test','private','${member}','${member}') returning id`)
  assert.deepEqual(await permissions(privateBox), { read: true, work: true, send: true, manage: true })
  await assert.rejects(() => db.exec(`insert into revo_inbox_channels(organisation_id,channel,provider_key,address,access_scope,owner_user_id)
    values ('${A}','email','google_workspace','spoof@example.test','private','${viewer}')`), /row-level security/)
  await as(admin)
  assert.deepEqual(await permissions(privateBox), { read: false, work: false, send: false, manage: false })
  assert.equal((await db.query(`select id from revo_inbox_channels where id='${privateBox}'`)).rows.length, 0)
  await assert.rejects(() => db.exec(`select revo_set_default_inbox_channel('${privateBox}')`), /workspace-shared/)
  await db.exec(`insert into revo_inbox_channels(id,organisation_id,channel,provider_key,address,access_scope,owner_user_id)
    values ('${teamBox}','${A}','email','google_workspace','team@example.test','selected','${admin}') returning id`)
  await db.exec(`insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role)
    values ('${A}','${teamBox}','${viewer}','viewer'),('${A}','${teamBox}','${responder}','responder')`)
  await assert.rejects(() => db.exec(`insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role)
    values ('${A}','${teamBox}','${outsider}','manager')`), /active in the same organisation/)
  await assert.rejects(() => db.exec(`insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role)
    values ('${B}','${teamBox}','${outsider}','manager')`), /shared email mailbox|row-level security|foreign key/)

  await db.exec(`reset role;
    insert into revo_inbox_conversations(id,organisation_id,channel_id,contact_address)
      values ('${privateThread}','${A}','${privateBox}','private-contact@example.test'),('${teamThread}','${A}','${teamBox}','team-contact@example.test');
    insert into revo_inbox_messages(organisation_id,conversation_id,channel,direction,provider_key,provider_message_id,sender_address,recipient_addresses,body_text)
      values ('${A}','${privateThread}','email','inbound','google_workspace','same-provider-message','client@example.test',array['personal@example.test'],'Private content'),
      ('${A}','${teamThread}','email','inbound','google_workspace','same-provider-message','client@example.test',array['team@example.test'],'Team content');
    insert into revo_inbox_associations(organisation_id,conversation_id,entity_type,entity_id) values ('${A}','${privateThread}','contact','${member}');
    insert into revo_inbox_workflow_requests(organisation_id,conversation_id,action_type,requested_by) values ('${A}','${privateThread}','create_viewing','${member}');
    insert into revo_inbox_escalations(organisation_id,conversation_id,reason) values ('${A}','${privateThread}','Private overdue');
    insert into revo_inbox_provider_connections(id,organisation_id,channel_id,provider_key,connection_kind,mailbox_address)
      values ('${connA}','${A}','${privateBox}','google_workspace','individual_mailbox','personal@example.test'),
      ('${connB}','${A}','${teamBox}','google_workspace','individual_mailbox','team@example.test');
    insert into revo_inbox_sync_runs(organisation_id,connection_id,status) values ('${A}','${connA}','failed'),('${A}','${connB}','completed');
    insert into revo_inbox_connection_events(organisation_id,connection_id,event_type) values ('${A}','${connA}','health_checked');
    insert into private.shared_inbox_sync_state(organisation_id,connection_id,folder_key,cursor_json) values
      ('${A}','${connA}','INBOX','{"uid":20}'),('${A}','${connB}','INBOX','{"uid":70}');`)
  await assert.rejects(() => db.exec(`insert into revo_inbox_messages(organisation_id,conversation_id,channel,direction,provider_key,provider_message_id,sender_address,recipient_addresses)
    values ('${A}','${teamThread}','email','inbound','google_workspace','same-provider-message','client@example.test',array['team@example.test'])`), /unique constraint/)
  assert.equal((await db.query(`select count(*)::int n from revo_inbox_messages where provider_message_id='same-provider-message'`)).rows[0].n, 2)
  await assert.rejects(() => db.exec(`insert into revo_inbox_sync_runs(organisation_id,connection_id,status) values ('${B}','${connA}','running')`), /foreign key/)
  await assert.rejects(() => db.exec(`insert into private.shared_inbox_sync_state(organisation_id,connection_id,folder_key) values ('${B}','${connA}','Sent')`), /foreign key/)
  await db.exec(`update private.shared_inbox_sync_state set last_error_code='provider_offline' where connection_id='${connA}'`)
  assert.equal((await db.query(`select last_error_code,cursor_json from private.shared_inbox_sync_state where connection_id='${connB}'`)).rows[0].last_error_code, null)

  // Legacy external enquiries still use their own service-only ingest boundary
  // after the provider-message conflict key becomes mailbox-scoped.
  const revo = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'
  await db.exec(`insert into organisations values ('${revo}')`)
  const ingestSql = `select * from revo_ingest_external_enquiry('${revo}','website','legacy-fixture','Client','legacy@example.test',p_message_body=>'Hello')`
  const ingested = (await db.query(ingestSql)).rows[0]
  assert.equal(ingested.created, true)
  assert.equal((await db.query(ingestSql)).rows[0].conversation_id, ingested.conversation_id)

  await as(admin)
  // No metadata, content, derived activity or connector history leaks from a
  // private mailbox, even to an agency administrator.
  for (const table of ['conversations','messages','activity','associations','workflow_requests','escalations']) {
    const key = table === 'conversations' ? 'id' : 'conversation_id'
    assert.equal((await db.query(`select * from revo_inbox_${table} where ${key}='${privateThread}'`)).rows.length, 0, table)
  }
  for (const table of ['provider_connections','sync_runs','connection_events']) {
    const key = table === 'provider_connections' ? 'id' : 'connection_id'
    assert.equal((await db.query(`select * from revo_inbox_${table} where ${key}='${connA}'`)).rows.length, 0, table)
  }
  await assert.rejects(() => db.exec(draft(privateThread, admin)), /Mailbox conversation not found|row-level security/)
  await assert.rejects(() => db.exec(`update revo_inbox_conversations set channel_id='${channelA}' where id='${teamThread}'`), /cannot move between mailboxes/)
  await assert.rejects(() => db.exec(`update revo_inbox_provider_connections set channel_id='${channelA}' where id='${connB}'`), /row-level security|permission denied/)
  await assert.rejects(() => db.exec(`insert into private.shared_inbox_sync_state(organisation_id,connection_id,folder_key) values ('${A}','${connB}','Sent')`), /permission denied/)
  await assert.rejects(() => db.exec(`select revo_read_inbox_connection_credential('${connA}')`), /permission denied/)
  await assert.rejects(() => db.exec(`select shared_inbox_authorize_mailbox_user('${A}','${privateBox}','${member}','manage')`), /permission denied/)

  await as(viewer)
  assert.deepEqual(await permissions(teamBox), { read: true, work: false, send: false, manage: false })
  assert.equal((await db.query(`select * from revo_inbox_messages where conversation_id='${teamThread}'`)).rows.length, 1)
  assert.equal((await db.query(`update revo_inbox_conversations set status='spam' where id='${teamThread}' returning id`)).rows.length, 0)
  await assert.rejects(() => db.exec(draft(teamThread, viewer)), /row-level security/)
  await assert.rejects(() => db.exec(`insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role) values ('${A}','${teamBox}','${member}','manager')`), /row-level security/)
  await as(responder)
  assert.deepEqual(await permissions(teamBox), { read: true, work: true, send: true, manage: false })
  await db.exec(draft(teamThread, responder))
  await assert.rejects(() => db.exec(`update revo_inbox_messages set direction='outbound' where conversation_id='${teamThread}' and message_type='draft'`), /row-level security/)
  await assert.rejects(() => db.exec(`update revo_inbox_messages set conversation_id='${threadA}' where conversation_id='${teamThread}' and message_type='draft'`), /cannot move between mailboxes/)
  await as(member)
  assert.deepEqual(await permissions(teamBox), { read: false, work: false, send: false, manage: false })
  await db.exec(draft(privateThread, member))
  await assert.rejects(() => db.exec(`insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role) values ('${A}','${privateBox}','${viewer}','viewer')`), /shared email mailbox/)

  // Server commands use the same private/selected decisions; possessing a
  // service credential does not authorise the authenticated actor.
  await db.exec(`reset role; set role service_role; select set_config('request.jwt.claim.sub','',false)`)
  const allowed = async (channel, user, permission = 'manage') => (await db.query(`select shared_inbox_authorize_mailbox_user('${A}','${channel}','${user}','${permission}') allowed`)).rows[0].allowed
  assert.equal(await allowed(privateBox, member), true)
  assert.equal(await allowed(privateBox, admin), false)
  assert.equal(await allowed(teamBox, responder), false)
  assert.equal(await allowed(teamBox, responder, 'send'), true)
  assert.equal(await allowed(teamBox, outsider, 'read'), false)
  assert.equal(await allowed(channelA, admin), true)

  await as(admin)
  await db.exec(`delete from shared_inbox_mailbox_members where channel_id='${teamBox}' and user_id='${viewer}'`)
  await as(viewer)
  assert.equal((await permissions(teamBox)).read, false)
  await as(admin)
  await db.exec(`update shared_inbox_mailbox_members set access_role='manager' where channel_id='${teamBox}' and user_id='${responder}'`)
  await as(responder)
  await db.exec(`insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role) values ('${A}','${teamBox}','${member}','viewer')`)
  await db.exec(`reset role; update organisation_users set status='suspended' where user_id='${responder}'`)
  await as(responder)
  assert.deepEqual(await permissions(teamBox), { read: false, work: false, send: false, manage: false })
  await as(admin)
  await db.exec(`update revo_inbox_channels set access_scope='private' where id='${teamBox}'`)
  assert.equal((await db.query(`select * from shared_inbox_mailbox_members where channel_id='${teamBox}'`)).rows.length, 0)
  await db.exec(`update revo_inbox_channels set access_scope='selected' where id='${teamBox}'`)
  await as(member)
  assert.equal((await permissions(teamBox)).read, false)
  await as(admin)
  const transferred = (await db.query(`select shared_inbox_update_mailbox_access('${A}','${teamBox}','private','${viewer}') mailbox`)).rows[0].mailbox
  assert.equal(transferred.owner_user_id, viewer)
  assert.equal((await permissions(teamBox)).read, false)
  await assert.rejects(() => db.exec(`select shared_inbox_update_mailbox_access('${A}','${teamBox}','workspace',null)`), /management access/)
  await as(viewer)
  assert.equal((await permissions(teamBox)).manage, true)
  await assert.rejects(() => db.exec(`update revo_inbox_channels set address='changed@example.test' where id='${teamBox}'`), /identity cannot change/)
  await assert.rejects(() => db.exec(`select shared_inbox_update_mailbox_access('${A}','${teamBox}','private','${outsider}')`), /active in the same organisation/)
  await db.exec(`reset role; update organisation_users set status='accepted' where user_id='${viewer}'`)
  await as(viewer)
  assert.equal((await permissions(teamBox)).read, true)
  await as(outsider)
  assert.deepEqual(await permissions(privateBox), { read: false, work: false, send: false, manage: false })
  await db.exec('reset role')
  for (const signature of ['public.shared_inbox_authorize_mailbox_user(uuid,uuid,uuid,text)', 'private.shared_inbox_permission_for_user(uuid,uuid,uuid,text)']) {
    assert.equal((await db.query(`select has_function_privilege('authenticated','${signature}','EXECUTE') allowed`)).rows[0].allowed, false)
    assert.equal((await db.query(`select has_function_privilege('anon','${signature}','EXECUTE') allowed`)).rows[0].allowed, false)
  }
  for (const table of ['private.shared_inbox_sync_state', 'private.revo_inbox_connection_credentials']) {
    assert.equal((await db.query(`select has_table_privilege('authenticated','${table}','SELECT') allowed`)).rows[0].allowed, false)
  }
  await db.exec('reset role; set role anon')
  await assert.rejects(() => db.query('select * from shared_inbox_mailbox_members'), /permission denied/)
  console.log('Mailbox foundation: private/shared access, roles, revocation, connector guards, dedupe and sync isolation passed.')
}
