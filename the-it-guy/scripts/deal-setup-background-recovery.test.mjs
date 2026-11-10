import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, beforeEach, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { runDealSetupRecovery, createDealSetupRecoveryResponse, createDealSetupRecoveryClient } from '../server/services/dealSetupRecovery.js'
import { buildDealSetupRecovery } from './build-deal-setup-recovery.mjs'

const tx = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const version = '20000000-0000-4000-8000-000000000001'
const newer = '20000000-0000-4000-8000-000000000002'
const instance = '30000000-0000-4000-8000-000000000001'
const db = new PGlite()
const query = async (sql, params = []) => (await db.query(sql, params)).rows
const scalar = async (sql, params = []) => Object.values((await query(sql, params))[0])[0]
const context = async (role = 'service_role', headers = {}) => {
  await query("select set_config('request.jwt.claim.role',$1,false), set_config('request.headers',$2,false)", [role, JSON.stringify(headers)])
}
const headersFor = job => ({ 'x-arch9-deal-transaction': job.transaction_id, 'x-arch9-deal-version': job.terms_version, 'x-arch9-deal-lease': job.lease_id })
const claim = async () => scalar('select public.bridge_claim_deal_setup_recovery()')
const finish = async (job, success = true) => scalar('select public.bridge_finish_deal_setup_recovery($1,$2,$3,$4)', [job.transaction_id, job.terms_version, job.lease_id, success])
const save = async (id = tx, termsVersion = version) => query("update transactions set purchase_price=200, deal_setup_terms_version=$2,deal_setup_sync_status='pending' where id=$1", [id, termsVersion])

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table transactions(id uuid primary key, purchase_price numeric default 100, finance_type text default 'cash', transaction_type text default 'resale', purchaser_type text default 'individual', routing_profile_json jsonb default '{"legalDecision":"keep","workflowPlan":{}}', updated_at timestamptz default now(),deal_setup_terms_version uuid,deal_setup_sync_status text,deal_setup_sync_error text);
    create table document_requirement_instances(id uuid primary key,transaction_id uuid,context_id uuid,context_type text);
    create table document_requirement_events(id uuid default gen_random_uuid(),requirement_instance_id uuid,event_type text);
    create table transaction_document_requirements(id uuid default gen_random_uuid(),transaction_id uuid,document_key text);
    create table transaction_required_documents(id uuid default gen_random_uuid(),transaction_id uuid,document_key text);
    create function public.bridge_has_transaction_permission(uuid,text) returns boolean language sql as $$select $1='${tx}'::uuid$$;
    create function public.bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select $1='${tx}'::uuid$$;
    create function public.bridge_can_access_transaction_org_member(uuid) returns boolean language sql as $$select false$$;
    alter table transactions enable row level security;
    create policy actor_transactions on transactions to authenticated using(id='${tx}'::uuid) with check(id='${tx}'::uuid);
    grant usage on schema auth,public to authenticated,service_role,anon;
    grant all on all tables in schema public to service_role;
    grant select,update on transactions to authenticated;
  `)
  await db.exec(await readFile(new URL('../../supabase/migrations/20261109175327_deal_setup_background_recovery.sql', import.meta.url), 'utf8'))
})
beforeEach(async () => {
  await db.exec('reset role')
  await context()
  await db.exec(`truncate transactions,document_requirement_instances,document_requirement_events,transaction_document_requirements,transaction_required_documents;
    insert into transactions(id) values('${tx}'),('${other}');
    insert into document_requirement_instances values('${instance}','${tx}','${tx}','transaction');`)
})
after(async () => { await db.close() })

test('saving alone queues work without a browser callback; old unversioned deals are untouched', async () => {
  assert.equal(await claim(), null)
  await save()
  const job = await claim()
  assert.equal(job.transaction_id, tx)
  assert.equal(job.terms_version, version)
  assert.equal(await claim(), null)
  assert.equal(await scalar('select purchase_price from transactions where id=$1', [tx]), '200')
})

test('a worker killed after claiming can be replaced after its lease expires', async () => {
  await save()
  const abandoned = await claim()
  await query("update transactions set deal_setup_sync_lease_until=now()-interval '1 second' where id=$1", [tx])
  const recovered = await claim()
  assert.notEqual(recovered.lease_id, abandoned.lease_id)
  assert.deepEqual(await finish(abandoned), { accepted: false })
  assert.deepEqual(await finish(recovered), { accepted: true })
  assert.equal(await claim(), null)
})

test('failures back off durably and keep retrying; successful work clears the error', async () => {
  await save()
  await finish(await claim(), false)
  let state = (await query('select *,extract(epoch from (deal_setup_sync_next_at-now())) as delay from transactions where id=$1', [tx]))[0]
  assert.equal(state.deal_setup_sync_status, 'failed')
  assert.ok(Number(state.delay) > 55 && Number(state.delay) <= 60)
  assert.equal(await claim(), null)
  await query("update transactions set deal_setup_sync_next_at=now(),deal_setup_sync_attempts=20 where id=$1", [tx])
  await finish(await claim(), false)
  state = (await query('select extract(epoch from (deal_setup_sync_next_at-now())) as delay from transactions where id=$1', [tx]))[0]
  assert.ok(Number(state.delay) > 1795 && Number(state.delay) <= 1800)
  await query('update transactions set deal_setup_sync_next_at=now() where id=$1', [tx])
  await finish(await claim())
  assert.equal(await scalar('select deal_setup_sync_error from transactions where id=$1', [tx]), null)
})

test('a new saved version resets retry state and rejects the previous worker on every output table', async () => {
  await save()
  const stale = await claim()
  await save(tx, newer)
  await context('service_role', headersFor(stale))
  for (const table of ['transaction_document_requirements','transaction_required_documents']) {
    await assert.rejects(query(`insert into ${table}(transaction_id,document_key) values($1,'stale')`, [tx]), /lease expired or deal changed/)
  }
  await assert.rejects(query("insert into document_requirement_instances values(gen_random_uuid(),$1,$1,'transaction')", [tx]), /lease expired or deal changed/)
  await assert.rejects(query("insert into document_requirement_events(requirement_instance_id,event_type) values($1,'stale')", [instance]), /lease expired or deal changed/)
  await assert.rejects(query("update transactions set routing_profile_json='{}' where id=$1", [tx]), /lease expired or deal changed/)
  await context()
  assert.deepEqual(await finish(stale), { accepted: false })
  assert.equal((await claim()).terms_version, newer)
})

test('a current fence allows work but blocks cross-transaction writes and rows moved into scope', async () => {
  await save()
  const job = await claim()
  await query("insert into transaction_required_documents(transaction_id,document_key) values($1,'other')", [other])
  await context('service_role', headersFor(job))
  await query("insert into transaction_required_documents(transaction_id,document_key) values($1,'valid')", [tx])
  await assert.rejects(query("insert into transaction_required_documents(transaction_id,document_key) values($1,'wrong')", [other]), /Invalid recovery scope/)
  await assert.rejects(query("update transaction_required_documents set transaction_id=$1 where transaction_id=$2", [tx, other]), /Invalid recovery scope/)
})

test('an expired worker cannot write even before a replacement has claimed', async () => {
  await save()
  const job = await claim()
  await query("update transactions set deal_setup_sync_lease_until=now()-interval '1 second' where id=$1", [tx])
  await context('service_role', headersFor(job))
  await assert.rejects(query("insert into transaction_document_requirements(transaction_id,document_key) values($1,'expired')", [tx]), /lease expired or deal changed/)
  await context()
  assert.deepEqual(await finish(job), { accepted: false })
})

test('server handoff reuses canonical facts, preserves legal choices and requires a valid fence', async () => {
  await save()
  await assert.rejects(query('select bridge_sync_deal_setup_attorney_handoff($1)', [tx]), /Invalid recovery scope/)
  const job = await claim()
  await context('service_role', headersFor(job))
  await query('select bridge_sync_deal_setup_attorney_handoff($1)', [tx])
  const profile = await scalar('select routing_profile_json from transactions where id=$1', [tx])
  assert.equal(profile.legalDecision, 'keep')
  assert.equal(profile.financeType, 'cash')
  assert.equal(profile.requiresBondAttorney, false)
  assert.equal(profile.workflowPlan, undefined)
})

test('ordinary users cannot claim/finish jobs; retry checks edit permission and saved version', async () => {
  await save()
  const job = await claim()
  await context('authenticated')
  await query("select set_config('request.jwt.claim.sub',$1,false)", ['40000000-0000-4000-8000-000000000001'])
  await db.exec('set role authenticated')
  await assert.rejects(claim(), /permission denied/)
  await assert.rejects(finish(job), /permission denied/)
  await assert.rejects(query('select bridge_retry_deal_setup_reconciliation($1,$2)', [other, version]), /edit access/)
  await assert.rejects(query('select bridge_retry_deal_setup_reconciliation($1,$2)', [tx, newer]), /Deal Setup changed/)
  assert.equal((await scalar('select bridge_retry_deal_setup_reconciliation($1,$2)', [tx, version])).automatic, true)
  assert.equal(await scalar('select deal_setup_sync_lease_id from transactions where id=$1', [tx]), job.lease_id)
})

test('the scheduled runner finishes persisted work with no browser; partial failure is retried', async () => {
  await save()
  const client = { rpc: async (name, args) => {
    await context()
    try { return { data: name === 'bridge_claim_deal_setup_recovery' ? await claim() : await finish({ transaction_id: args.p_transaction_id, terms_version: args.p_terms_version, lease_id: args.p_lease_id }, args.p_succeeded) } }
    catch (error) { return { error } }
  } }
  let fail = true
  const load = async () => ({
    syncDealSetupAttorneyHandoff: async ({ transactionId }) => scalar('select bridge_sync_deal_setup_attorney_handoff($1)', [transactionId]),
    syncDealSetupDownstream: async ({ transactionId }) => {
      if (fail) throw new Error('private diagnostic')
      await query("insert into transaction_document_requirements(transaction_id,document_key) values($1,'recovered')", [transactionId])
      return { documentResolution: { transactionId } }
    },
  })
  const clientForJob = (job, signal) => { assert.equal(signal.aborted, false); return { job } }
  // Apply the scoped request context before the shared reconciler executes.
  const scopedLoad = async () => Object.fromEntries(Object.entries(await load()).map(([key, fn]) => [key, async args => { await context('service_role', headersFor(args.client.job)); return fn(args) }]))
  assert.equal((await runDealSetupRecovery({ client, clientForJob, load: scopedLoad })).retrying, 1)
  assert.doesNotMatch(await scalar('select deal_setup_sync_error from transactions where id=$1', [tx]), /private/)
  fail = false
  await query('update transactions set deal_setup_sync_next_at=now() where id=$1', [tx])
  assert.equal((await runDealSetupRecovery({ client, clientForJob, load: scopedLoad })).completed, 1)
  assert.equal(await scalar('select count(*) from transaction_document_requirements'), 1)
})

test('cron is protected, paused by default and returns safe errors', async () => {
  let calls = 0
  const run = async () => { calls++; throw new Error('secret customer error') }
  const clientFactory = () => ({})
  const env = { CRON_SECRET: 'fixture', DEAL_SETUP_RECOVERY_ENABLED: 'true' }
  const request = { method: 'GET', headers: { authorization: 'Bearer fixture' }, env, run, clientFactory }
  assert.equal((await createDealSetupRecoveryResponse({ ...request, headers: {} })).status, 401)
  assert.equal((await createDealSetupRecoveryResponse({ ...request, method: 'POST' })).status, 405)
  assert.equal((await createDealSetupRecoveryResponse({ ...request, env: { CRON_SECRET: 'fixture' } })).body.status, 'paused')
  assert.equal(calls, 0)
  const response = await createDealSetupRecoveryResponse(request)
  assert.equal(response.status, 503)
  assert.doesNotMatch(JSON.stringify(response), /secret customer/)
})

test('an unconfirmed handoff cannot be marked complete', async () => {
  const job = { transaction_id: tx, terms_version: version, lease_id: newer }
  let claimed = false, outcome
  const client = { rpc: async (name, args) => {
    if (name === 'bridge_finish_deal_setup_recovery') { outcome = args; return { data: { accepted: true } } }
    if (claimed) return { data: null }
    claimed = true
    return { data: job }
  } }
  const result = await runDealSetupRecovery({ client, clientForJob: () => ({}), load: async () => ({
    syncDealSetupAttorneyHandoff: async () => null,
    syncDealSetupDownstream: async () => { throw new Error('Must not continue without a handoff receipt') },
  }) })
  assert.equal(result.retrying, 1)
  assert.equal(outcome.p_succeeded, false)
})

test('packaged shared document code imports in native Node without browser configuration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'deal-recovery-'))
  try {
    const outfile = path.join(directory, 'reconciler.mjs')
    await buildDealSetupRecovery(outfile)
    const services = await import(pathToFileURL(outfile).href)
    assert.equal(typeof services.syncDealSetupDownstream, 'function')
    const calls = []
    await services.syncDealSetupAttorneyHandoff({ transactionId: tx, client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { transactionId: tx } } } } })
    assert.equal(calls[0].name, 'bridge_sync_deal_setup_attorney_handoff')
    const fixture = documentClientFixture()
    await services.syncDealSetupDownstream({ transactionId: tx, client: fixture.client })
    assert.ok(fixture.rows.transaction_document_requirements.length > 0)
    const ids = fixture.rows.transaction_document_requirements.map(row => row.id).sort()
    await services.syncDealSetupDownstream({ transactionId: tx, client: fixture.client })
    assert.deepEqual(fixture.rows.transaction_document_requirements.map(row => row.id).sort(), ids)
    const evidence = fixture.rows.document_requirement_instances.find(row => row.document_definition_key === 'proof_of_funds')
    assert.equal(evidence.status, 'approved')
    assert.equal(evidence.satisfied_by_document_id, 'saved-evidence')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('per-job service clients carry all version/lease headers on real requests', async () => {
  const original = globalThis.fetch
  const seen = []
  globalThis.fetch = async (url, options) => { seen.push({ url, options }); return new Response('null', { headers: { 'Content-Type': 'application/json' } }) }
  try {
    const job = { transaction_id: tx, terms_version: version, lease_id: newer }
    const client = createDealSetupRecoveryClient({ SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-server-secret' }, job, AbortSignal.timeout(1000))
    await client.rpc('bridge_sync_deal_setup_attorney_handoff', { p_transaction_id: tx })
    for (const [key, value] of Object.entries(headersFor(job))) assert.equal(new Headers(seen[0].options.headers).get(key), value)
    assert.ok(seen[0].options.signal)
  } finally { globalThis.fetch = original }
})

test('failed background reads cannot be mistaken for missing documents', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'read unavailable', code: '42501' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  try {
    const client = createDealSetupRecoveryClient({ SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret' }, { transaction_id: tx, terms_version: version, lease_id: newer })
    await assert.rejects(async () => { await client.from('documents').select('*').eq('transaction_id', tx) }, error => error.code === '42501')
  } finally { globalThis.fetch = original }
})

function documentClientFixture() {
  const rows = {
    transactions: [{ id: tx, finance_type: 'cash', purchaser_type: 'individual', purchase_price: 200, sales_price: 200, current_main_stage: 'FIN', stage: 'Finance Pending', deal_setup_terms_version: version }],
    transaction_participants: [], documents: [], transaction_subprocesses: [], transaction_required_documents: [], transaction_document_requirements: [],
    document_requirement_rules: [],
    document_definitions: [{ key: 'proof_of_funds', display_label: 'Proof of funds', pack_key: 'buyer_finance', default_requirement_level: 'required', default_visibility: ['buyer','agent'], default_upload_roles: ['buyer'], is_active: true }],
    document_requirement_instances: [{ id: instance, context_type: 'transaction', context_id: tx, transaction_id: tx, document_definition_key: 'proof_of_funds', requested_from_role: 'buyer', status: 'approved', satisfied_by_document_id: 'saved-evidence' }],
  }
  const client = {
    rpc: async (name, args) => {
      assert.equal(name, 'bridge_sync_transaction_document_requirement_instances')
      const instances = args.p_generated_instances.map(row => ({ ...row, id: instance, status: 'approved', satisfied_by_document_id: 'saved-evidence' }))
      rows.document_requirement_instances = instances
      return { data: { instances, allInstances: instances }, error: null }
    },
    from(table) {
      assert.ok(Object.hasOwn(rows, table), `Unexpected recovery table: ${table}`)
      const filters = []
      let many = null, patch = null, one = false, conflicts = ['id']
      const execute = () => {
        if (many) for (const incoming of many) {
          const existing = rows[table].find(row => conflicts.every(key => row[key] === incoming[key]))
          if (existing) Object.assign(existing, incoming)
          else rows[table].push({ ...incoming })
        }
        const selected = rows[table].filter(row => filters.every(filter => filter(row)))
        if (patch) for (const row of selected) Object.assign(row, patch)
        return { data: one ? selected[0] || null : selected.map(row => ({ ...row })), error: null }
      }
      const q = {
        select: () => q, order: () => q,
        eq: (key, value) => { filters.push(row => row[key] === value); return q },
        is: (key, value) => { filters.push(row => (row[key] ?? null) === value); return q },
        in: (key, values) => { filters.push(row => values.includes(row[key])); return q },
        upsert: (data, options) => { many = Array.isArray(data) ? data : [data]; conflicts = options.onConflict.split(','); return q },
        update: data => { patch = data; return q },
        single: () => { one = true; return q }, maybeSingle: () => { one = true; return q },
        then: (resolve, reject) => Promise.resolve().then(execute).then(resolve, reject),
      }
      return q
    },
  }
  return { client, rows }
}
