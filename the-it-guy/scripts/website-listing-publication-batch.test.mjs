import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const fn = 'public.website_get_listing_publication_statuses(uuid[],boolean)'
test('batch website badges preserve existing per-listing authorization, failures and read-only behavior', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
      create table public.fixture_listings(id uuid primary key, owner_id uuid);
      create function public.website_get_listing_publication_status(p_listing_id uuid)
      returns jsonb language plpgsql security definer set search_path = '' as $$
      begin
        if not exists(select 1 from public.fixture_listings where id = p_listing_id and owner_id = auth.uid()) then
          raise exception 'Not authorised or not found' using errcode = '42501';
        end if;
        return jsonb_build_object('listingId', p_listing_id, 'websiteSiteId', case when p_listing_id = '${id(1)}' then 'owned-site' else null end,
          'status', 'not_published', 'blockers', jsonb_build_array('Not ready'));
      end $$;
      create function public.website_get_partner_listing_status(p_listing_id uuid)
      returns jsonb language plpgsql security definer set search_path = '' as $$
      begin
        if p_listing_id = '${id(5)}' then raise exception 'Partner read failed'; end if;
        -- Deliberately return a connection even for an inaccessible listing:
        -- the batch must never reach this path after its owned read denies access.
        return jsonb_build_object('listingId', p_listing_id, 'available', p_listing_id <> '${id(6)}', 'websiteSiteId', 'partner-site', 'status', 'published');
      end $$;
      revoke all on function public.website_get_listing_publication_status(uuid), public.website_get_partner_listing_status(uuid) from public, anon;
      grant execute on function public.website_get_listing_publication_status(uuid), public.website_get_partner_listing_status(uuid) to authenticated;
    `)
    for (const number of [1, 2, 3, 5, 6]) await db.query('insert into fixture_listings values ($1,$2)', [id(number), id(number === 3 ? 901 : 900)])
    await db.exec(await readFile(new URL('../../supabase/migrations/20261108214952_batch_listing_website_publication_status.sql', import.meta.url), 'utf8'))
    const permissions = (await db.query(`select prosecdef, provolatile,
      has_function_privilege('anon', $1, 'EXECUTE') as anon_access,
      has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated_access
      from pg_proc where oid = $1::regprocedure`, [fn])).rows[0]
    assert.equal(permissions.prosecdef, false, 'batch must run as the caller')
    assert.equal(permissions.provolatile, 'v', 'do not make incorrect stable promises about existing volatile functions')
    assert.equal(permissions.anon_access, false)
    assert.equal(permissions.authenticated_access, true)
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.website_get_listing_publication_statuses($1)', [[id(1)]]), { code: '42501' })
    await db.exec('reset role; set role authenticated')
    await assert.rejects(db.query('select * from public.website_get_listing_publication_statuses($1)', [[id(1)]]), { code: '42501' })
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(900)])
    await db.exec('begin read only')
    const results = (await db.query('select * from public.website_get_listing_publication_statuses($1)', [[id(1), id(2), id(3), id(4), id(5), id(6), id(2), null]])).rows
    assert.equal(results.length, 6, 'deduplicate IDs; never omit failures')
    const byId = Object.fromEntries(results.map(row => [row.listing_id, row]))
    assert.equal(byId[id(1)].publication.websiteSiteId, 'owned-site')
    assert.equal(byId[id(1)].partner, false)
    assert.equal(byId[id(2)].publication.websiteSiteId, 'partner-site')
    assert.equal(byId[id(2)].partner, true)
    for (const number of [3, 4, 5]) assert.deepEqual(byId[id(number)], { listing_id: id(number), publication: null, partner: false })
    assert.equal(byId[id(6)].publication.status, 'not_published')
    assert.deepEqual(byId[id(6)].publication.blockers, ['Not ready'])
    const ownedOnly = (await db.query('select * from public.website_get_listing_publication_statuses($1,false)', [[id(2)]])).rows[0]
    assert.equal(ownedOnly.partner, false)
    assert.equal(ownedOnly.publication.websiteSiteId, null)
    assert.equal((await db.query('select * from public.website_get_listing_publication_statuses(null)')).rows.length, 0)
    await db.exec('commit')
    await assert.rejects(db.query('select * from public.website_get_listing_publication_statuses($1)', [Array.from({ length: 101 }, (_, index) => id(index))]), { code: '22023' })
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(901)])
    const changedViewer = (await db.query('select * from public.website_get_listing_publication_statuses($1)', [[id(1), id(3)]])).rows
    assert.equal(changedViewer[0].publication, null)
    assert.equal(changedViewer[1].publication.websiteSiteId, 'partner-site')
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as count from fixture_listings')).rows[0].count, 5)
  } finally { await db.close() }
})
