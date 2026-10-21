import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../../../supabase/migrations/20261021074539_close_anonymous_offer_and_client_context_access.sql', import.meta.url), 'utf8')
const org = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const transaction = '33333333-3333-4333-8333-333333333333'

test('production anonymous access correction enforces credentials and preserves scoped access', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create function bridge_request_header(key text) returns text language sql stable as
        $$ select coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb)->>key $$;
      create function bridge_client_portal_request_token() returns text language sql stable as
        $$ select bridge_request_header('x-bridge-client-portal-token') $$;
      create function bridge_is_active_member(id uuid) returns boolean language sql stable as
        $$ select current_user = 'authenticated' and id::text = current_setting('test.member_org', true) $$;
      create function bridge_agency_transaction_scope(id uuid) returns boolean language sql stable as
        $$ select id::text = current_setting('test.transaction', true) $$;
      create function bridge_has_client_portal_token_transaction_access(id uuid) returns boolean language sql stable as
        $$ select id = '${transaction}'::uuid and bridge_client_portal_request_token() = 'buyer-valid' $$;
      create table offers (
        id text primary key, organisation_id uuid, transaction_id uuid, offer_token text,
        status text, expiry_date date, offer_amount numeric, deposit_amount numeric,
        finance_type text, cash_component numeric, bond_component numeric,
        conditions_json jsonb, buyer_viewed_at timestamptz, buyer_submitted_at timestamptz,
        submitted_at timestamptz, updated_at timestamptz, seller_decision_notes text
      );
      create table client_portal_contexts (
        id text primary key, organisation_id uuid, transaction_id uuid,
        context_type text, status text, seller_workspace_token text, client_email text
      );
      create materialized view commercial_data_quality_rollups as select '${org}'::uuid organisation_id, 10 total;
      create materialized view commercial_market_area_rollups as select '${other}'::uuid organisation_id, 20 total;
      create function bridge_get_commercial_data_quality_rollup(p uuid) returns setof commercial_data_quality_rollups
        language sql stable security definer as $$ select * from commercial_data_quality_rollups where organisation_id=p and bridge_is_active_member(p) $$;
      create function bridge_get_commercial_market_area_rollups(p uuid) returns setof commercial_market_area_rollups
        language sql stable security definer as $$ select * from commercial_market_area_rollups where organisation_id=p and bridge_is_active_member(p) $$;
      alter table offers enable row level security;
      alter table client_portal_contexts enable row level security;
      create policy agency_two_tier_transaction_id on offers as restrictive to authenticated
        using (transaction_id is null or bridge_agency_transaction_scope(transaction_id));
      create policy agency_two_tier_transaction_id on client_portal_contexts as restrictive to authenticated
        using (transaction_id is null or bridge_agency_transaction_scope(transaction_id));
      create policy offers_org_members_select on offers for select using (bridge_is_active_member(organisation_id));
      create policy offers_org_members_update on offers for update using (bridge_is_active_member(organisation_id)) with check (bridge_is_active_member(organisation_id));
      create policy offers_public_token_select on offers for select using (offer_token is not null);
      create policy offers_public_token_update on offers for update using (offer_token is not null) with check (offer_token is not null);
      create policy client_portal_contexts_token_select on client_portal_contexts for select to anon,authenticated using (transaction_id is null or bridge_has_client_portal_token_transaction_access(transaction_id));
      grant usage on schema public to anon,authenticated,service_role;
      grant all on all tables in schema public to anon,authenticated,service_role;
      insert into offers(id,organisation_id,offer_token,status,expiry_date,offer_amount) values
        ('own','${org}','offer-valid','draft',current_date+1,100),
        ('other','${other}','offer-other','draft',current_date+1,200),
        ('expired','${org}','offer-expired','draft',current_date-1,300),
        ('withdrawn','${org}','offer-withdrawn','withdrawn',current_date+1,400);
      insert into client_portal_contexts values
        ('seller','${org}',null,'selling','active','seller-valid','seller@example.test'),
        ('other-seller','${other}',null,'selling','active','seller-other','other@example.test'),
        ('revoked','${org}',null,'selling','revoked','seller-revoked','revoked@example.test'),
        ('buyer','${org}','${transaction}','buying','active',null,'buyer@example.test');
    `)
    const as = (role, headers, action, memberOrg = '', scopedTransaction = '') => db.transaction(async tx => {
      await tx.query("select set_config('request.headers',$1,true), set_config('test.member_org',$2,true), set_config('test.transaction',$3,true)", [JSON.stringify(headers), memberOrg, scopedTransaction])
      await tx.exec(`set local role ${role}`)
      return action(tx)
    })
    const ids = result => result.rows.map(row => row.id).sort()
    const visible = (table, headers = {}, role = 'anon', memberOrg = '', scopedTransaction = '') =>
      as(role, headers, tx => tx.query(`select id from ${table} order by id`), memberOrg, scopedTransaction)

    // Prove the fixture reproduces the two incident paths before the correction.
    assert.equal((await visible('offers')).rows.length, 4)
    assert.equal((await visible('client_portal_contexts')).rows.length, 3)
    await db.exec(migration)

    await t.test('no credential and invented credentials disclose no offers or client contexts', async () => {
      for (const headers of [{}, { 'x-bridge-offer-token': 'wrong', 'x-bridge-client-portal-token': 'wrong' }, { 'x-bridge-offer-token': ' ', 'x-bridge-client-portal-token': ' ' }]) {
        assert.deepEqual(ids(await visible('offers', headers)), [])
        assert.deepEqual(ids(await visible('client_portal_contexts', headers)), [])
      }
      // Knowing a row ID, or adding a client-side equality filter, is insufficient.
      assert.equal((await as('anon', {}, tx => tx.query("select * from offers where id='own' or offer_token='offer-valid'"))).rows.length, 0)
    })
    await t.test('valid offer credential discloses exactly its own record', async () => {
      assert.deepEqual(ids(await visible('offers', { 'x-bridge-offer-token': 'offer-valid' })), ['own'])
      for (const token of ['own', 'offer-expired', 'offer-withdrawn']) assert.deepEqual(ids(await visible('offers', { 'x-bridge-offer-token': token })), [])
    })
    await t.test('valid seller and buyer client links remain scoped and revoked seller links fail', async () => {
      assert.deepEqual(ids(await visible('client_portal_contexts', { 'x-bridge-client-portal-token': 'seller-valid' })), ['seller'])
      assert.deepEqual(ids(await visible('client_portal_contexts', { 'x-bridge-client-portal-token': 'buyer-valid' })), ['buyer'])
      assert.deepEqual(ids(await visible('client_portal_contexts', { 'x-bridge-client-portal-token': 'seller-revoked' })), [])
    })
    await t.test('staff read only their organisation and retain the existing transaction fence', async () => {
      assert.deepEqual(ids(await visible('offers', {}, 'authenticated', org)), ['expired', 'own', 'withdrawn'])
      assert.deepEqual(ids(await visible('client_portal_contexts', {}, 'authenticated', org)), ['revoked', 'seller'])
      assert.deepEqual(ids(await visible('client_portal_contexts', {}, 'authenticated', org, transaction)), ['buyer', 'revoked', 'seller'])
      assert.deepEqual(ids(await visible('client_portal_contexts', {}, 'authenticated', other)), ['other-seller'])
      assert.deepEqual(ids(await visible('offers', {}, 'authenticated')), [])
      assert.deepEqual(ids(await visible('client_portal_contexts', {}, 'authenticated')), [])
    })
    await t.test('missing or wrong credential cannot update an offer', async () => {
      for (const headers of [{}, { 'x-bridge-offer-token': 'wrong' }, { 'x-bridge-offer-token': 'offer-other' }]) {
        const result = await as('anon', headers, tx => tx.query("update offers set offer_amount=999 where id='own' returning id"))
        assert.equal(result.rows.length, 0)
      }
    })
    await t.test('valid buyer updates remain supported but cross-record and identity changes fail', async () => {
      const headers = { 'x-bridge-offer-token': 'offer-valid' }
      assert.deepEqual(ids(await as('anon', headers, tx => tx.query("update offers set status='buyer_viewed',buyer_viewed_at=now() where id='own' returning id"))), ['own'])
      assert.deepEqual(ids(await as('anon', headers, tx => tx.query("update offers set status='submitted',offer_amount=110,conditions_json='{}' where id='own' returning id"))), ['own'])
      await assert.rejects(as('anon', headers, tx => tx.query("update offers set offer_token='replacement' where id='own'")), /permission denied/)
      await assert.rejects(as('anon', headers, tx => tx.query(`update offers set organisation_id='${other}' where id='own'`)), /permission denied/)
      await assert.rejects(as('anon', headers, tx => tx.query("update offers set seller_decision_notes='forged' where id='own'")), /permission denied/)
      assert.equal((await as('anon', headers, tx => tx.query("update offers set offer_amount=999 where id='other' returning id"))).rows.length, 0)
    })
    await t.test('offer token does not confer write authority on an unrelated signed-in user', async () => {
      assert.equal((await as('authenticated', { 'x-bridge-offer-token': 'offer-other' }, tx => tx.query("update offers set offer_amount=999 where id='other' returning id"), org)).rows.length, 0)
    })
    await t.test('materialized reports cannot be queried directly and scoped report RPCs retain access', async () => {
      for (const role of ['anon', 'authenticated']) for (const view of ['commercial_data_quality_rollups', 'commercial_market_area_rollups']) {
        await assert.rejects(as(role, {}, tx => tx.query(`select * from ${view}`)), /permission denied/)
      }
      await assert.rejects(as('anon', {}, tx => tx.query(`select * from bridge_get_commercial_data_quality_rollup('${org}')`)), /permission denied/)
      // Production's scope helper uses auth.uid(); supply its equivalent session
      // check here so SECURITY DEFINER does not depend on current_user.
      await db.exec("create or replace function bridge_is_active_member(id uuid) returns boolean language sql stable as $$ select id::text = current_setting('test.member_org', true) $$")
      assert.equal((await as('authenticated', {}, tx => tx.query(`select * from bridge_get_commercial_data_quality_rollup('${org}')`), org)).rows.length, 1)
      assert.equal((await as('authenticated', {}, tx => tx.query(`select * from bridge_get_commercial_data_quality_rollup('${org}')`), other)).rows.length, 0)
    })
    await t.test('reapplying the correction is safe', async () => { await db.exec(migration) })
  } finally { await db.close() }
})
