import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migration = readFileSync(new URL('../../supabase/migrations/20261010214831_website_listing_sale_status.sql', import.meta.url), 'utf8')
try {
  await db.exec(`
    create role fixture_actor;
    create table fixture_listing(id uuid primary key, listing_status text, listing_type text);
    insert into fixture_listing values ('00000000-0000-0000-0000-000000000001', 'active', 'Sale');
    create function public.website_commit_listing_publication(p_listing_id uuid, p_action text, p_actor_id uuid, p_actor_email text) returns jsonb language plpgsql security invoker as $fn$
    declare v_listing record; v_projection record;
    begin
      if p_actor_id <> p_listing_id then raise exception 'Denied'; end if;
      select * into v_listing from fixture_listing where id=p_listing_id for update;
      select p_listing_id as listing_id, v_listing.listing_type as listing_type into v_projection;
      return jsonb_build_object('listing_id', v_projection.listing_id, 'listing_type', v_projection.listing_type);
    end; $fn$;
    create function public.website_commit_partner_listing_publication(p_listing_id uuid, p_grant_id uuid, p_action text, p_actor_id uuid, p_actor_email text, p_assets jsonb) returns jsonb language plpgsql security invoker as $fn$
    declare v_listing record; v_projection record;
    begin
      if p_actor_id <> p_listing_id then raise exception 'Denied'; end if;
      select * into v_listing from fixture_listing where id=p_listing_id for update;
      select v_listing.listing_type as listing_type into v_projection;
      return jsonb_build_object('listing_id', p_listing_id, 'listing_type', v_projection.listing_type);
    end; $fn$;
    revoke all on function public.website_commit_listing_publication(uuid,text,uuid,text) from public;
    grant execute on function public.website_commit_listing_publication(uuid,text,uuid,text) to fixture_actor;
  `)
  const catalog = () => db.query(`select oid::text, proacl::text, prosecdef, pg_get_functiondef(oid) definition from pg_proc where proname in ('website_commit_listing_publication','website_commit_partner_listing_publication') order by proname`)
  const before = (await catalog()).rows
  await db.exec(migration)
  const after = (await catalog()).rows
  for (let i=0; i<before.length; i++) {
    assert.equal(after[i].oid, before[i].oid)
    assert.equal(after[i].proacl, before[i].proacl)
    assert.equal(after[i].prosecdef, before[i].prosecdef)
    assert.match(after[i].definition, /raise exception 'Denied'/)
    assert.match(after[i].definition, /for update/)
  }
  for (const status of ['active', 'under_offer', 'sold', 'withdrawn']) {
    await db.query(`update fixture_listing set listing_status=$1`, [status])
    for (const sql of [
      `select public.website_commit_listing_publication(id, 'update', id, 'fixture') as snapshot from fixture_listing`,
      `select public.website_commit_partner_listing_publication(id, id, 'update', id, 'fixture', '[]') as snapshot from fixture_listing`,
    ]) {
      const snapshot = (await db.query(sql)).rows[0].snapshot
      assert.equal(snapshot.listing_status, ['sold','under_offer'].includes(status) ? status : 'active')
      assert.equal(snapshot.listing_type, 'Sale')
    }
  }
  await assert.rejects(db.query(`select public.website_commit_listing_publication(id, 'update', '00000000-0000-0000-0000-000000000002', 'fixture') from fixture_listing`), /Denied/)
  console.log('Website sale-status snapshots passed in isolated PostgreSQL; existing function permissions and guards preserved.')
} finally { await db.close() }
