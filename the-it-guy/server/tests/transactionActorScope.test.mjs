import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { accessMigration, actor, id, transactionActorAccessFixture } from '../../scripts/fixtures/transaction-actor-access.mjs'

let db, baseline, originalWrapper
const rows = async table => (await db.query(`select id from ${table} order by id`)).rows.map(row => row.id)
const asOwner = async operation => { await db.exec('reset role'); await operation() }
before(async () => {
  db = await transactionActorAccessFixture()
  await actor(db, id(99))
  baseline = { transactions: await rows('transactions'), finance: await rows('transaction_finance_workflows'), documents: await rows('documents') }
  await db.exec('reset role')
  originalWrapper = (await db.query("select pg_get_functiondef('bridge_can_access_transaction_spine(uuid)'::regprocedure) definition")).rows[0].definition
  await db.exec(accessMigration)
})
beforeEach(async () => { await db.exec('reset role;begin') })
afterEach(async () => { await db.exec('rollback;reset role') })
after(async () => { await db?.close() })

test('reproduces legacy blank-email exposure and closes it without an account-wide email requirement', async () => {
  assert.equal(baseline.transactions.length, 2)
  assert.equal(baseline.finance.length, 2)
  assert.equal(baseline.documents.length, 2)
  for (const email of ['', '   ', 'unassigned@example.test']) {
    await actor(db, id(99), email)
    assert.deepEqual(await rows('transactions'), [])
    assert.deepEqual(await rows('documents'), [])
    assert.deepEqual(await rows('transaction_finance_workflows'), [])
    assert.equal((await db.query('select bridge_can_edit_finance_lane($1) allowed', [id(200)])).rows[0].allowed, false)
  }
  await actor(db, id(1))
  assert.deepEqual(await rows('transactions'), [id(100)], 'a real assigned owner still works without email')
})

test('blank-email actors cannot directly update a transaction or its finance row', async () => {
  await actor(db, id(99))
  assert.deepEqual((await db.query("update transactions set notes='attack' where id=$1 returning id", [id(200)])).rows, [])
  assert.deepEqual((await db.query("update transaction_finance_workflows set notes='attack' where id=$1 returning id", [id(201)])).rows, [])
})

test('Developer sees its own organisation development and transaction, never a foreign tenant', async () => {
  await actor(db, id(2), 'developer@example.test')
  assert.deepEqual(await rows('transactions'), [id(100)])
  assert.deepEqual(await rows('developments'), [id(11)])
  assert.deepEqual(await rows('units'), [id(12)])
  assert.deepEqual(await rows('documents'), [id(103)])
  assert.deepEqual(await rows('transaction_finance_workflows'), [id(101)])
  assert.deepEqual(await rows('transaction_bond_applications'), [id(102)])
  assert.deepEqual((await db.query("update transaction_finance_workflows set notes='attack' where id=$1 returning id", [id(201)])).rows, [])
})

test('revoking the Developer organisation membership removes its implicit access', async () => {
  await db.query("update organisation_users set membership_status='removed',status='removed',removed_at=now() where user_id=$1", [id(2)])
  await actor(db, id(2), 'developer@example.test')
  assert.deepEqual(await rows('transactions'), [])
  assert.deepEqual(await rows('developments'), [])
  assert.deepEqual(await rows('documents'), [])
})

test('an active explicit transaction share lets a Developer see that foreign matter', async () => {
  await db.query('insert into transaction_user_access values($1,$2)', [id(200), id(2)])
  await actor(db, id(2), 'developer@example.test')
  assert.deepEqual(await rows('transactions'), [id(100), id(200)])
  assert.deepEqual(await rows('documents'), [id(103), id(203)])
})

test('a Developer participant share never opens every unit in the foreign development', async () => {
  await db.query('insert into transaction_participants(transaction_id,user_id,can_view) values($1,$2,true)', [id(200), id(2)])
  await actor(db, id(2), 'developer@example.test')
  assert.deepEqual(await rows('transactions'), [id(100), id(200)])
  assert.deepEqual(await rows('developments'), [id(11)])
  assert.deepEqual(await rows('units'), [id(12)])
})

test('a removed membership cannot retain access through its legacy active status or owner role', async () => {
  await db.query('update organisation_users set removed_at=now() where user_id=$1', [id(2)])
  await actor(db, id(2), 'developer@example.test')
  assert.deepEqual(await rows('transactions'), [])
  assert.deepEqual(await rows('developments'), [])
})

test('legacy agency membership cannot block a Developer explicit share or grant unrelated matters', async () => {
  await db.query('insert into transaction_user_access values($1,$2)', [id(200), id(2)])
  await actor(db, id(2), 'developer@example.test')
  await db.query("select set_config('fixture.agency_scope_denied','true',false)")
  assert.deepEqual(await rows('transactions'), [id(100), id(200)])
  await asOwner(() => db.query('delete from transaction_user_access where user_id=$1', [id(2)]))
  await actor(db, id(2), 'developer@example.test')
  await db.query("select set_config('fixture.agency_scope_denied','true',false)")
  assert.deepEqual(await rows('transactions'), [id(100)])
})

test('a newly created Developer transaction can save its first participant and finance shell', async () => {
  await actor(db, id(2), 'developer@example.test')
  await db.query('insert into transactions(id,organisation_id,development_id,created_by) values($1,$2,$3,$4)', [id(300), id(10), id(11), id(2)])
  assert.deepEqual((await db.query('select id from transactions where id=$1', [id(300)])).rows, [{ id: id(300) }])
  await db.query('insert into transaction_participants(transaction_id,user_id) values($1,$2)', [id(300), id(2)])
  assert.equal((await db.query('select count(*)::int n from transaction_participants where transaction_id=$1', [id(300)])).rows[0].n, 1)
})

test('unassigned originators lose legacy global finance access while assigned application access survives', async () => {
  await actor(db, id(3), 'originator@example.test')
  assert.deepEqual(await rows('transaction_finance_workflows'), [])
  assert.deepEqual(await rows('transaction_bond_applications'), [])
  await asOwner(() => db.query('update transaction_bond_applications set assigned_user_id=$1 where id=$2', [id(3), id(202)]))
  await actor(db, id(3), 'originator@example.test')
  assert.deepEqual(await rows('transaction_finance_workflows'), [id(201)])
  assert.deepEqual((await db.query("update transaction_finance_workflows set notes='authorised' where id=$1 returning id", [id(201)])).rows, [{ id: id(201) }])
})

test('internal administrators retain their intended global operational scope', async () => {
  await actor(db, id(4), 'admin@example.test')
  assert.deepEqual(await rows('transactions'), [id(100), id(200)])
  assert.deepEqual(await rows('developments'), [id(11), id(21)])
  assert.deepEqual(await rows('transaction_finance_workflows'), [id(101), id(201)])
})

test('active legacy email shares normalise case and spaces; a bound user identity cannot be replaced by email', async () => {
  await db.query("insert into transaction_participants(transaction_id,participant_email,can_view) values($1,'  INVITED@EXAMPLE.TEST  ',true)", [id(200)])
  await actor(db, id(99), 'invited@example.test')
  assert.deepEqual(await rows('transactions'), [id(200)])
  await asOwner(() => db.query("update transaction_participants set user_id=$1 where participant_email like '%INVITED%'", [id(98)]))
  await actor(db, id(99), 'invited@example.test')
  assert.deepEqual(await rows('transactions'), [])
})

test('inactive, removed and non-viewing participant rows do not grant access', async () => {
  for (const state of ['inactive', 'removed', 'active']) {
    await db.query('insert into transaction_participants(transaction_id,user_id,status,can_view) values($1,$2,$3,$4)', [id(200), id(99), state, state !== 'active'])
  }
  await actor(db, id(99), 'person@example.test')
  assert.deepEqual(await rows('transactions'), [])
  assert.equal((await db.query('select bridge_has_transaction_access($1) allowed', [id(200)])).rows[0].allowed, false)
})

test('a valid UID participant can still view and edit the authorised finance lane without an email', async () => {
  await db.query('insert into transaction_participants(transaction_id,user_id,can_view,can_edit_finance_workflow) values($1,$2,true,true)', [id(200), id(99)])
  await actor(db, id(99))
  assert.deepEqual(await rows('transactions'), [id(200)])
  assert.equal((await db.query('select bridge_can_edit_finance_lane($1) allowed', [id(200)])).rows[0].allowed, true)
})

test('finance capability uses the assigned UID and never overrides a different binding with email', async () => {
  await db.query('insert into transaction_user_access values($1,$2)', [id(200), id(99)])
  await db.query("insert into transaction_participants(transaction_id,assigned_user_id,participant_email,can_view,can_edit_finance_workflow) values($1,$2,'shared@example.test',true,true)", [id(200), id(98)])
  await actor(db, id(99), 'shared@example.test')
  assert.equal((await db.query('select bridge_can_edit_finance_lane($1) allowed', [id(200)])).rows[0].allowed, false)
  await actor(db, id(98))
  assert.equal((await db.query('select bridge_can_edit_finance_lane($1) allowed', [id(200)])).rows[0].allowed, true)
})

test('anonymous requests stay denied; a valid scoped portal token retains read access', async () => {
  await actor(db, null, '', 'anon')
  assert.deepEqual(await rows('transactions'), [])
  assert.deepEqual(await rows('documents'), [])
  await db.query("select set_config('request.fixture_transaction_token',$1,false)", [id(200)])
  assert.deepEqual(await rows('transactions'), [id(200)])
  assert.deepEqual(await rows('documents'), [id(203)])
})

test('an authenticated Developer with a foreign read token cannot use it to write finance', async () => {
  await actor(db, id(2), 'developer@example.test')
  await db.query("select set_config('request.fixture_transaction_token',$1,false)", [id(200)])
  assert.deepEqual(await rows('transactions'), [id(100), id(200)])
  assert.deepEqual(await rows('transaction_finance_workflows'), [id(101), id(201)])
  assert.deepEqual((await db.query("update transaction_finance_workflows set notes='attack' where id=$1 returning id", [id(201)])).rows, [])
})

test('user-editable metadata cannot turn an unrelated identity into an internal administrator', async () => {
  await actor(db, id(99), 'person@example.test')
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id(99), email: 'person@example.test', user_metadata: { role: 'internal_admin' } })])
  assert.deepEqual(await rows('transactions'), [])
})

test('the correction is repeatable and preserves retirement wrappers and existing policy modes', async () => {
  await db.exec(accessMigration)
  assert.equal((await db.query("select pg_get_functiondef('bridge_can_access_transaction_spine(uuid)'::regprocedure) definition")).rows[0].definition, originalWrapper)
  const policy = (await db.query("select polpermissive from pg_policy where polname='transactions_select_transaction_spine_scope'")).rows[0]
  assert.equal(policy.polpermissive, true)
  const expression = (await db.query("select pg_get_expr(polqual,polrelid) expression from pg_policy where polname='transactions_select_transaction_spine_scope'")).rows[0].expression
  assert.match(expression, /NULLIF\(btrim\(assigned_agent_email\)/)
  await actor(db, id(1))
  await db.query("select set_config('fixture.retired_actor','true',false)")
  assert.equal((await db.query('select bridge_has_transaction_access($1) allowed', [id(100)])).rows[0].allowed, false)
})
