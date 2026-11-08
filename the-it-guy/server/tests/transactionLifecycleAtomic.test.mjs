import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { actor, id } from '../../scripts/fixtures/transaction-actor-access.mjs'
import { lifecycleMigration, lifecycleRpc, transactionLifecycleFixture } from '../../scripts/fixtures/transaction-lifecycle-commit.mjs'

let db
before(async () => { db = await transactionLifecycleFixture() })
beforeEach(async () => { await db.exec('reset role;begin') })
afterEach(async () => { await db.exec('rollback;reset role') })
after(async () => { await db?.close() })
async function rejected(run, pattern) {
  await db.exec('savepoint expected_failure')
  let error
  try { await run() } catch (reason) { error = reason }
  await db.exec('rollback to expected_failure;release expected_failure')
  assert.ok(error, 'the operation must be rejected')
  assert.match(error.message, pattern)
  return error
}
async function unchanged() {
  const row = (await db.query('select registered_at,completed_at from transactions where id=$1', [id(100)])).rows[0]
  assert.equal(row.registered_at, null)
  assert.equal(row.completed_at, null)
  assert.equal((await db.query("select status from transaction_workflow_steps where workflow_key='registration'")).rows[0].status, 'not_started')
  assert.equal((await db.query('select count(*)::int n from transaction_workflow_evidence')).rows[0].n, 0)
}

test('registration, evidence, workflow, lifecycle projection and audit commit together', async () => {
  await actor(db, id(5), 'lawyer@example.test')
  const receipt = await lifecycleRpc(db)
  assert.equal(receipt.transactionId, id(100))
  assert.equal(receipt.lifecycleState, 'registered')
  assert.ok(receipt.registeredAt)
  assert.equal((await db.query("select status from transaction_workflow_steps where workflow_key='registration'")).rows[0].status, 'complete')
  assert.equal((await db.query('select count(*)::int n from transaction_workflow_evidence')).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int n from transaction_workflow_events')).rows[0].n, 1)
  assert.equal((await db.query('select current_stage from transaction_lifecycle_workflows')).rows[0].current_stage, 'registration')
})

test('lost-reply retry returns the original receipt without another audit or evidence row', async () => {
  await actor(db, id(5), 'lawyer@example.test')
  const first = await lifecycleRpc(db)
  const retry = await lifecycleRpc(db)
  assert.equal(retry.replayed, true)
  assert.equal(retry.registeredAt, first.registeredAt)
  assert.equal((await db.query('select count(*)::int n from transaction_workflow_events')).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int n from transaction_workflow_evidence')).rows[0].n, 1)
  await rejected(() => lifecycleRpc(db, 'register', { titleDeedNumber: 'DIFFERENT' }), /different details/)
})

test('a zero-row update policy cannot leave a completed registration step', async () => {
  await db.exec('create policy denied_update on transactions as restrictive for update to authenticated using(true) with check(false)')
  await actor(db, id(5), 'lawyer@example.test')
  await rejected(() => lifecycleRpc(db), /row-level security|access|not available/)
  await unchanged()
})

test('a failed audit rolls back the receipt, step and evidence', async () => {
  await db.exec("create function reject_audit() returns trigger language plpgsql as $$begin raise exception 'Forced audit failure';end$$;create trigger reject_audit before insert on transaction_workflow_events for each row execute function reject_audit()")
  await actor(db, id(5), 'lawyer@example.test')
  await rejected(() => lifecycleRpc(db), /Forced audit failure/)
  await unchanged()
})

test('missing stored proof cannot become an accepted registration receipt', async () => {
  await db.exec('delete from storage.objects')
  await actor(db, id(5), 'lawyer@example.test')
  await rejected(() => lifecycleRpc(db), /stored document/)
  await unchanged()
})

test('another transaction proof and a CIPC document are rejected even when the filename looks valid', async () => {
  await actor(db, id(5), 'lawyer@example.test')
  await rejected(() => lifecycleRpc(db, 'register', { documentId: id(203) }), /stored document/)
  await db.exec('reset role')
  await db.query("update documents set document_type='company_registration',name='Deeds registration confirmation.pdf' where id=$1", [id(103)])
  await actor(db, id(5), 'lawyer@example.test')
  await rejected(() => lifecycleRpc(db), /stored document/)
  await unchanged()
})

test('ordinary agents cannot mutate registration even when they own and can view the transaction', async () => {
  await actor(db, id(1), 'agent@example.test')
  const permissions = (await db.query('select bridge_get_transaction_lifecycle_permissions($1) p', [id(100)])).rows[0].p
  assert.equal(permissions.canRegister, false)
  await rejected(() => lifecycleRpc(db), /assigned transfer legal team/)
  await unchanged()
})

test('an organisation Developer can register its matter; an explicit foreign share does not grant registration authority', async () => {
  await actor(db, id(2), 'developer@example.test')
  assert.equal((await lifecycleRpc(db)).lifecycleState, 'registered')
  await db.exec('reset role')
  await db.query('insert into transaction_user_access values($1,$2)', [id(200), id(2)])
  await actor(db, id(2), 'developer@example.test')
  await rejected(() => lifecycleRpc(db, 'register', { transactionId: id(200), documentId: id(203) }), /assigned transfer legal team/)
})

test('an internal administrator can save the mandatory lifecycle projection without a participant row', async () => {
  await actor(db, id(4), 'admin@example.test')
  assert.equal((await lifecycleRpc(db)).lifecycleState, 'registered')
  assert.equal((await db.query('select count(*)::int n from transaction_lifecycle_workflows')).rows[0].n, 1)
})

test('missing or incomplete legacy workflow setup blocks registration before mutation', async () => {
  await db.query("delete from transaction_workflow_instances where workflow_key='finance_cash'")
  await actor(db, id(5), 'lawyer@example.test')
  await rejected(() => lifecycleRpc(db), /workflow setup/)
  await unchanged()
})

test('an unknown required predecessor is blocked instead of skipped', async () => {
  await db.exec("update transaction_workflow_steps set status=null where workflow_key='sales_otp'")
  await actor(db, id(5), 'lawyer@example.test')
  await rejected(() => lifecycleRpc(db), /required sale, finance and transfer steps/)
  await unchanged()
})

test('canonical registration needs the recorded legal milestone', async () => {
  await db.exec("update transactions set routing_profile_json='{\"workflowPlan\":{\"status\":\"active\"}}'")
  await actor(db, id(5), 'lawyer@example.test')
  await rejected(() => lifecycleRpc(db), /legal registration milestone/)
  await unchanged()
})

test('canonical registration and completion use recorded legal milestones without requiring retired legacy steps', async () => {
  await db.exec(`update transactions set routing_profile_json='{"workflowPlan":{"status":"active"}}';
    delete from transaction_workflow_steps;delete from transaction_workflow_instances;
    insert into transaction_subprocesses values('${id(700)}','${id(100)}','transfer');
    insert into transaction_subprocess_steps values('${id(701)}','${id(700)}','registered','completed'),('${id(702)}','${id(700)}','matter_closed','not_started');`)
  await actor(db, id(5), 'lawyer@example.test')
  assert.equal((await lifecycleRpc(db)).lifecycleState, 'registered')
  await rejected(() => lifecycleRpc(db, 'complete'), /legal closeout milestone/)
  await db.exec('reset role')
  await db.query("update transaction_subprocess_steps set status='completed' where step_key='matter_closed'")
  await db.query("insert into transaction_attorney_closeouts values($1,'closed')", [id(100)])
  await actor(db, id(5), 'lawyer@example.test')
  assert.equal((await lifecycleRpc(db, 'complete')).lifecycleState, 'completed')
})

for (const [finance, financeWorkflow] of [['cash', 'finance_cash'], ['bond', 'finance_bond'], ['hybrid', 'finance_hybrid'], ['cash+bond', 'finance_hybrid'], ['mortgage', 'finance_bond']]) {
  test(`${finance} registration and financial closeout keep the applicable finance gates`, async () => {
    await db.query('update transactions set finance_type=$1 where id=$2', [finance, id(100)])
    if (financeWorkflow !== 'finance_cash') {
      const instance = (await db.query("insert into transaction_workflow_instances(transaction_id,workflow_key,status) values($1,$2,'complete') returning id", [id(100), financeWorkflow])).rows[0].id
      await db.query("insert into transaction_workflow_steps(transaction_id,workflow_instance_id,workflow_key,step_key,status) values($1,$2,$3,'ready','complete')", [id(100), instance, financeWorkflow])
    }
    await actor(db, id(5), 'lawyer@example.test')
    await lifecycleRpc(db)
    await rejected(() => lifecycleRpc(db, 'complete'), /Attorney financial closeout/)
    await db.exec('reset role')
    await db.query("insert into transaction_attorney_closeouts values($1,'closed')", [id(100)])
    await actor(db, id(5), 'lawyer@example.test')
    if (financeWorkflow !== 'finance_cash') {
      await rejected(() => lifecycleRpc(db, 'complete'), /Bond-originator financial closeout/)
      await db.exec('reset role')
      await db.query("insert into transaction_bond_closeouts values($1,'closed')", [id(100)])
      await actor(db, id(5), 'lawyer@example.test')
    }
    const completed = await lifecycleRpc(db, 'complete')
    assert.equal(completed.lifecycleState, 'completed')
    assert.ok(completed.completedAt)
    assert.equal((await lifecycleRpc(db, 'complete')).replayed, true)
    assert.equal((await db.query('select count(*)::int n from transaction_events')).rows[0].n, 1)
  })
}

test('completion projection failure cannot leave a false completed transaction', async () => {
  await db.exec('create policy denied_projection on transaction_lifecycle_workflows as restrictive for update to authenticated using(true) with check(false)')
  await db.query("insert into transaction_attorney_closeouts values($1,'closed')", [id(100)])
  await actor(db, id(5), 'lawyer@example.test')
  await lifecycleRpc(db)
  await rejected(() => lifecycleRpc(db, 'complete'), /row-level security/)
  assert.equal((await db.query('select completed_at from transactions where id=$1', [id(100)])).rows[0].completed_at, null)
})

test('anonymous callers have no command grant, and applying the migration again preserves that boundary', async () => {
  await db.exec(lifecycleMigration)
  assert.equal((await db.query("select has_function_privilege('anon','bridge_commit_transaction_lifecycle(uuid,text,date,text,uuid)','execute') allowed")).rows[0].allowed, false)
  assert.equal((await db.query("select prosecdef from pg_proc where proname='bridge_commit_transaction_lifecycle'")).rows[0].prosecdef, false)
})
