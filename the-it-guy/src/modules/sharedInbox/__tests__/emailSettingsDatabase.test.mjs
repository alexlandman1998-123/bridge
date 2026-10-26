import assert from 'node:assert/strict'
export async function checkEmailSettings(db, { A, B, admin, member, outsider, channelA }) {
  const privateBox = 'abcd1111-1111-4111-8111-111111111111'
  const teamBox = 'abcd2222-2222-4222-8222-222222222222'
  async function as(user) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`) }
  const signature = { name: 'Agency agent', company: 'Agency', logoUrl: 'https://example.test/logo.png', body: [{ text: 'Regards', bold: true }, { text: 'Visit us', href: 'https://example.test' }] }
  const save = (channel, content, revision, replies = false) => db.query(`select shared_inbox_save_mailbox_signature($1,$2,$3,true,$4,$5) saved`, [A,channel,JSON.stringify(content),replies,revision])
  const settings = async (org = A) => (await db.query(`select shared_inbox_email_settings('${org}') settings`)).rows[0].settings
  await as(admin)
  await db.exec(`insert into revo_inbox_channels(id,organisation_id,channel,provider_key,address,access_scope,owner_user_id) values
    ('${privateBox}','${A}','email','other_email','settings-private@example.test','private','${admin}'),
    ('${teamBox}','${A}','email','google_workspace','settings-team@example.test','selected','${admin}');
    insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role) values ('${A}','${teamBox}','${member}','viewer');`)
  assert.equal((await settings()).canCreateShared, true)
  const first = (await save(privateBox,signature,0)).rows[0].saved
  assert.equal(first.revision,1)
  assert.equal(first.use_for_replies,false)
  await save(channelA,{ name: 'Different mailbox' },0)
  const second = (await save(privateBox,{ ...signature, name: 'Updated agent' },1,true)).rows[0].saved
  assert.equal(second.revision,2)
  assert.equal(second.use_for_replies,true)
  await assert.rejects(() => save(privateBox,signature,1), /signature changed/)
  assert.equal((await db.query(`select signature_json->>'name' name from shared_inbox_mailbox_signatures where channel_id='${channelA}'`)).rows[0].name,'Different mailbox')
  for (const invalid of [{ html: '<script>alert(1)</script>' }, { body: [{ text: 'Click', href: 'javascript:alert(1)' }] }, { body: [{ text: 'X', onclick: 'bad' }] }, { logoUrl: 'data:image/svg+xml,bad' }]) {
    await assert.rejects(() => save(privateBox,invalid,2), /check constraint/)
  }
  await assert.rejects(() => db.exec(`update shared_inbox_mailbox_signatures set channel_id='${teamBox}' where channel_id='${privateBox}'`), /cannot move between mailboxes/)
  await save(teamBox,signature,0)
  const people = (await db.query(`select * from shared_inbox_mailbox_people('${A}','${teamBox}')`)).rows
  assert(people.some(person => person.user_id === member && person.access_role === 'viewer'))
  assert(!people.some(person => person.user_id === outsider))
  await as(member)
  const visible = await settings()
  assert.equal(visible.canCreatePrivate,true)
  assert.equal(visible.canCreateShared,false)
  assert(!visible.mailboxes.some(box => box.id === privateBox))
  assert.equal(visible.mailboxes.find(box => box.id === teamBox).permissions.manage,false)
  assert.equal((await db.query(`select * from shared_inbox_mailbox_signatures where channel_id='${privateBox}'`)).rows.length,0)
  assert.equal((await db.query(`select * from shared_inbox_mailbox_signatures where channel_id='${teamBox}'`)).rows.length,1)
  await assert.rejects(() => save(teamBox,signature,1), /management access/)
  await assert.rejects(() => db.query(`select * from shared_inbox_mailbox_people('${A}','${teamBox}')`), /management access/)
  assert.equal((await settings(B)).mailboxes.length,0)
  await as(admin)
  await db.exec(`delete from shared_inbox_mailbox_members where channel_id='${teamBox}' and user_id='${member}'`)
  await as(member)
  assert.equal((await db.query(`select * from shared_inbox_mailbox_signatures where channel_id='${teamBox}'`)).rows.length,0)
  await as(outsider)
  await assert.rejects(() => save(privateBox,signature,2), /management access/)
  await db.exec('reset role; set role anon')
  await assert.rejects(() => db.query('select * from shared_inbox_mailbox_signatures'), /permission denied/)
  await assert.rejects(() => settings(), /permission denied/)
  console.log('Email settings: mailbox list, roster permissions, separate signatures/defaults, revision checks and tenant isolation passed.')
}
