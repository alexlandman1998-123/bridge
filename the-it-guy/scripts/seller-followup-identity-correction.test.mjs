import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../../supabase/migrations/20261108145107_seller_followup_optional_rpc_identity_guard.sql', import.meta.url), 'utf8')
const signature = 'public.bridge_queue_seller_document_follow_ups_p0_3(integer,timestamptz,boolean,uuid)'

test('an absent optional RPC remains absent and creates no legacy automation', async () => {
  const db = new PGlite()
  try {
    await db.exec(migration)
    assert.equal((await db.query('select to_regprocedure($1)::text as name', [signature])).rows[0].name, null)
    assert.equal((await db.query("select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows[0].n, 0)
  } finally { await db.close() }
})

test('an installed RPC gets the text/UUID correction once and retains its grants', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated; create role service_role;
      create table client_portal_contexts(listing_id text);
      create table private_listing_document_requirements(private_listing_id uuid);
      insert into client_portal_contexts values('11111111-1111-4111-8111-111111111111');
      insert into private_listing_document_requirements values('11111111-1111-4111-8111-111111111111');
      create function public.bridge_queue_seller_document_follow_ups_p0_3(integer,timestamptz,boolean,uuid)
      returns jsonb language plpgsql security definer set search_path=public as $$
      begin return jsonb_build_object('matches', (select count(*) from client_portal_contexts client_context,
        private_listing_document_requirements requirement where client_context.listing_id = requirement.private_listing_id)); end $$;
      revoke all on function ${signature} from public; grant execute on function ${signature} to service_role;`)
    const call = 'select public.bridge_queue_seller_document_follow_ups_p0_3(1,now(),true,null) as value'
    await assert.rejects(db.query(call), /operator does not exist/)
    await db.exec(migration)
    assert.deepEqual((await db.query(call)).rows[0].value, { matches: 1 })
    const definition = async () => (await db.query('select pg_get_functiondef($1::regprocedure) as value', [signature])).rows[0].value
    const first = await definition()
    await db.exec(migration)
    assert.equal(await definition(), first)
    assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') as allowed", [signature])).rows[0].allowed, false)
    assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed", [signature])).rows[0].allowed, true)
  } finally { await db.close() }
})

test('an unexpected installed contract fails without changing the function', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create function public.bridge_queue_seller_document_follow_ups_p0_3(integer,timestamptz,boolean,uuid) returns jsonb language sql as $$ select '{}'::jsonb $$`)
    await assert.rejects(db.exec(migration), /Unsupported seller follow-up/)
    await db.exec('rollback')
    assert.deepEqual((await db.query('select public.bridge_queue_seller_document_follow_ups_p0_3(1,now(),true,null) as value')).rows[0].value, {})
  } finally { await db.close() }
})
