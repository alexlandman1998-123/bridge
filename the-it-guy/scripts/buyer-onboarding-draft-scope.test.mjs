import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function bridge_is_active_member(uuid) returns boolean language sql as $$ select false $$;
    create table transactions(id uuid);`)
  const previous = readFileSync('../supabase/migrations/20260927084256_transaction_source_handoff_phase2.sql', 'utf8')
  const start = previous.indexOf('create or replace function public.bridge_create_mvp_transaction(')
  const end = previous.indexOf('\n$$;', start) + 4
  await db.exec(previous.slice(start, end))
  const before = (await db.query(`select pg_get_functiondef('bridge_create_mvp_transaction(jsonb)'::regprocedure) definition`)).rows[0].definition
  const correction = readFileSync('../supabase/migrations/20261019202308_buyer_onboarding_draft_scope.sql', 'utf8')
  await db.exec(correction)
  const after = (await db.query(`select pg_get_functiondef('bridge_create_mvp_transaction(jsonb)'::regprocedure) definition`)).rows[0].definition
  assert.match(after, /if not public.bridge_mvp_transaction_scope_ready\(v_payload\) then/)
  const oldGuard = correction.split('$old$')[1]
  assert.equal(after, before.replace(oldGuard, '  if not public.bridge_mvp_transaction_scope_ready(v_payload) then'), 'only the reviewed scope guard changes')
  await db.exec(correction)
  assert.equal((await db.query(`select pg_get_functiondef('bridge_create_mvp_transaction(jsonb)'::regprocedure) definition`)).rows[0].definition, after, 'safe reapplication')
  const profile = { transactionType: 'resale', financeType: 'bond', propertyTenure: 'freehold', buyerEntityType: 'individual', sellerEntityType: 'individual' }
  const payload = { creation_mode: 'onboarding_capture', stage: 'Buyer Onboarding Pending', onboarding_status: 'agent_assisted_pending', routing_profile_json: profile }
  const ready = async p => (await db.query('select bridge_mvp_transaction_scope_ready($1::jsonb) ready', [JSON.stringify(p)])).rows[0].ready
  assert.equal(await ready(payload), true)
  for (const field of Object.keys(profile)) {
    for (const missing of ['', 'unknown', null]) {
      const draft = { ...payload, routing_profile_json: { ...profile, [field]: missing } }
      assert.equal(await ready(draft), true, `onboarding can capture ${field}`)
      for (const gate of [{ creation_mode: 'manual_capture' }, { stage: 'Transaction Setup' }, { stage: 'Transaction' }, { onboarding_status: 'awaiting_signed_otp' }, { accepted_offer_id: '11111111-1111-4111-8111-111111111111' }]) {
        assert.equal(await ready({ ...draft, ...gate }), false, `missing ${field} cannot pass a final transaction gate`)
      }
    }
    assert.equal(await ready({ ...payload, routing_profile_json: { ...profile, [field]: 'unsupported' } }), false)
  }
  assert.equal(await ready({ ...payload, routing_profile_json: { ...profile, sellerEntityType: 'developer' } }), false)
  assert.equal(await ready({ ...payload, routing_profile_json: { ...profile, transactionType: 'development_sale', sellerEntityType: 'developer' } }), true)
  await db.exec('set role authenticated')
  await assert.rejects(() => ready(payload), /permission denied/)
  await db.exec('reset role')
  await assert.rejects(() => db.query(`select bridge_create_mvp_transaction('{}')`), /do not have access/)
  console.log('buyer onboarding draft scope: PostgreSQL correction, draft/final gates, unsupported routes, permissions and reapplication passed')
} finally { await db.close() }
