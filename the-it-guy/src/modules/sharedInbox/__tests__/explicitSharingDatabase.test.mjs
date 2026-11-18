import assert from 'node:assert/strict'

// Run after the existing mailbox journeys: the new migration must preserve
// their rows while closing both legacy direct writes and command bypasses.
export async function checkExplicitSharing(db, { A, B, admin, member, outsider }) {
  const as = async user => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`)
  const create = (org, scope, confirm = false) => db.query(
    'select shared_inbox_create_mailbox($1,$2,$3,$4,$5,$6) mailbox',
    [org, 'google_workspace', `${scope}-${crypto.randomUUID()}@example.test`, 'Safety fixture', scope, confirm],
  ).then(result => result.rows[0].mailbox)
  const access = (box, scope, confirm = false) => db.query(
    'select shared_inbox_update_mailbox_access($1,$2,$3,$4,$5) mailbox', [A, box.id, scope, null, confirm],
  ).then(result => result.rows[0].mailbox)
  await as(admin)
  const legacy = (await db.query(`insert into revo_inbox_channels(organisation_id,channel,provider_key,address,created_by)
    values ($1,'email','google_workspace','legacy-private@example.test',$2) returning *`, [A,admin])).rows[0]
  assert.equal(legacy.access_scope, 'private')
  assert.equal(legacy.owner_user_id, admin)
  await assert.rejects(create(A, 'workspace'), /Confirm sharing/)
  await assert.rejects(db.query(`insert into revo_inbox_channels(organisation_id,channel,provider_key,address,access_scope,owner_user_id)
    values ($1,'email','google_workspace','direct-shared@example.test','workspace',$2)`, [A,admin]), /row-level security/)
  const shared = await create(A, 'workspace', true)
  assert.equal(shared.access_scope, 'workspace')
  assert.equal(shared.owner_user_id, admin)
  assert.equal(shared.is_default, false)
  await db.query('select revo_set_default_inbox_channel($1)', [shared.id])
  await assert.rejects(db.query("update revo_inbox_channels set access_scope='workspace' where id=$1", [legacy.id]), /permission denied/)
  await assert.rejects(db.query('update revo_inbox_channels set owner_user_id=$1 where id=$2', [member,legacy.id]), /permission denied/)
  await assert.rejects(access(legacy, 'workspace'), /Confirm sharing/)
  await assert.rejects(db.query("select shared_inbox_update_mailbox_access($1,$2,'workspace',null)", [A,legacy.id]), /Confirm sharing/)
  await db.query("update revo_inbox_channels set display_name='Still editable' where id=$1", [legacy.id])
  assert.equal((await access(legacy, 'workspace', true)).access_scope, 'workspace')
  assert.equal((await access(legacy, 'private')).access_scope, 'private')
  const team = await create(A, 'selected')
  await db.query("insert into shared_inbox_mailbox_members(organisation_id,channel_id,user_id,access_role) values($1,$2,$3,'viewer')", [A,team.id,member])
  const legacyWhatsApp = (await db.query("insert into revo_inbox_channels(organisation_id,channel,provider_key,address) values($1,'whatsapp','meta_cloud_api','+27000000000') returning access_scope", [A])).rows[0]
  assert.equal(legacyWhatsApp.access_scope, 'workspace')
  await as(member)
  const teamPermissions = (await db.query('select shared_inbox_mailbox_permissions($1,$2) p', [A,team.id])).rows[0].p
  assert.deepEqual(teamPermissions, {read:true,work:false,send:false,manage:false})
  const own = await create(A, 'private')
  assert.equal(own.owner_user_id, member)
  await assert.rejects(create(A, 'workspace', true), /administrator/)
  await assert.rejects(create(A, 'selected'), /administrator/)
  await assert.rejects(access(legacy, 'workspace', true), /management access/)
  await assert.rejects(create(B, 'private'), /membership/)
  await assert.rejects(db.query('select revo_set_default_inbox_channel($1)', [own.id]), /administrator/)
  await as(admin)
  await access(team, 'private')
  await as(member)
  assert.equal((await db.query('select id from revo_inbox_channels where id=$1', [team.id])).rows.length, 0)
  await as(admin)
  assert.equal((await db.query('select id from revo_inbox_channels where id=$1', [own.id])).rows.length, 0)
  await assert.rejects(db.query('select revo_set_default_inbox_channel($1)', [legacy.id]), /workspace-shared/)
  await as(outsider)
  assert.equal((await db.query('select id from revo_inbox_channels where id=$1', [shared.id])).rows.length, 0)
  await assert.rejects(create(A, 'private'), /membership/)
  await db.exec('reset role; set role anon')
  await assert.rejects(create(A, 'private'), /permission denied/)
  await db.exec('reset role')
  console.log('Mailbox safety: explicit sharing, private legacy defaults, direct-write protection and tenant isolation passed.')
}
