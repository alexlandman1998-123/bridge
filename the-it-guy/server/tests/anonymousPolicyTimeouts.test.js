import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../../../supabase/migrations/20261021075608_avoid_anonymous_policy_planning_timeouts.sql', import.meta.url), 'utf8')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('anonymous timeout correction preserves credentials, staff access and link identity checks', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      create function bridge_request_header(k text) returns text language sql stable as $$ select coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>k $$;
      create function bridge_client_portal_request_token() returns text language sql stable as $$ select bridge_request_header('x-bridge-client-portal-token') $$;
      create function bridge_onboarding_request_token() returns text language sql stable as $$ select bridge_request_header('x-bridge-onboarding-token') $$;
      create function bridge_status_request_token() returns text language sql stable as $$ select bridge_request_header('x-bridge-status-token') $$;
      create function bridge_external_access_request_token() returns text language sql stable as $$ select bridge_request_header('x-bridge-external-access-token') $$;
      create table transactions(id uuid primary key,organisation_id uuid,development_id uuid,unit_id uuid,buyer_id uuid);
      create table developments(id uuid primary key,organisation_id uuid);
      create table client_portal_links(token text primary key,transaction_id uuid,is_active boolean,development_id uuid,unit_id uuid,buyer_id uuid);
      create table transaction_onboarding(token text primary key,transaction_id uuid,is_active boolean);
      create table transaction_status_links(token text primary key,transaction_id uuid,is_active boolean);
      create table transaction_external_access(access_token text primary key,transaction_id uuid,revoked boolean,expires_at timestamptz);
      create function bridge_has_external_access_token() returns boolean language sql stable security definer as $$ select exists(select 1 from transaction_external_access where access_token=bridge_external_access_request_token() and not revoked and (expires_at is null or expires_at>=now())) $$;
      create function bridge_has_status_token_transaction_access(p uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from transaction_status_links where transaction_id=p and is_active and token=bridge_status_request_token()) $$;
      create function bridge_has_external_workspace_transaction_access(p uuid) returns boolean language sql stable security definer as $$ select bridge_has_external_access_token() and exists(select 1 from transaction_external_access where transaction_id=p and access_token=bridge_external_access_request_token()) $$;
      create function bridge_has_client_portal_token_transaction_access(target_transaction_id uuid) returns boolean language sql stable security definer as $$ select false $$;
      create function bridge_has_onboarding_token_transaction_access(p uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from transaction_onboarding where transaction_id=p and is_active and token=bridge_onboarding_request_token()) $$;
      create table organisation_branding(organisation_id uuid primary key,label text);
      create table profiles(id uuid primary key,role text);
      alter table profiles enable row level security;
      create policy profiles_read on profiles for select using(id=auth.uid());
      create table performance_metrics(id int primary key,user_id uuid);
      create table telemetry_events(id int primary key,user_id uuid);
      alter table organisation_branding enable row level security;
      alter table performance_metrics enable row level security;
      alter table telemetry_events enable row level security;
      create policy "Platform admins view performance metrics" on performance_metrics for select using(exists(select 1 from profiles p where p.id=auth.uid() and p.role='platform_admin'));
      create policy "Users can create own performance metrics" on performance_metrics for insert with check(auth.uid()=user_id);
      create policy "Users can view own performance metric inserts" on performance_metrics for select using(auth.uid()=user_id);
      create policy "Platform admins view telemetry" on telemetry_events for select using(exists(select 1 from profiles p where p.id=auth.uid() and p.role='platform_admin'));
      create policy "Users can create own telemetry" on telemetry_events for insert with check(auth.uid()=user_id);
      create policy "Users can view own telemetry inserts" on telemetry_events for select using(auth.uid()=user_id);
      create policy organisation_branding_select_client_portal_brand_scope on organisation_branding for select to anon,authenticated using(false);
      create policy organisation_branding_select_onboarding_token_brand_scope on organisation_branding for select to anon,authenticated using(false);
      create policy staff_branding on organisation_branding for select to authenticated using(organisation_id::text=current_setting('test.org',true));
      alter table transactions enable row level security;
      create policy transaction_tokens on transactions for select to anon,authenticated using(bridge_has_client_portal_token_transaction_access(id) or bridge_has_onboarding_token_transaction_access(id) or bridge_has_status_token_transaction_access(id) or bridge_has_external_workspace_transaction_access(id));
      alter table client_portal_links enable row level security;
      create policy client_link on client_portal_links for select using(is_active and token=bridge_client_portal_request_token());
      alter table transaction_onboarding enable row level security;
      create policy onboarding_link on transaction_onboarding for select using(is_active and token=bridge_onboarding_request_token());
      create table transaction_required_documents(id int,transaction_id uuid);
      alter table transaction_required_documents enable row level security;
      create policy required_docs on transaction_required_documents for select using(bridge_has_client_portal_token_transaction_access(transaction_id) or bridge_has_onboarding_token_transaction_access(transaction_id) or bridge_has_status_token_transaction_access(transaction_id) or bridge_has_external_workspace_transaction_access(transaction_id));
      create table transaction_subprocesses(id int,transaction_id uuid);
      alter table transaction_subprocesses enable row level security;
      create policy subprocess on transaction_subprocesses for select using(bridge_has_client_portal_token_transaction_access(transaction_id) or bridge_has_onboarding_token_transaction_access(transaction_id) or bridge_has_status_token_transaction_access(transaction_id) or bridge_has_external_workspace_transaction_access(transaction_id));
      create table transaction_subprocess_steps(id int,subprocess_id int);
      alter table transaction_subprocess_steps enable row level security;
      create policy steps on transaction_subprocess_steps for select using(exists(select 1 from transaction_subprocesses s where s.id=subprocess_id));
      grant usage on schema public,auth to anon,authenticated;
      grant select,insert on all tables in schema public to anon,authenticated;
      insert into profiles values('${uuid(20)}','platform_admin'),('${uuid(21)}','agent');
      insert into performance_metrics values(1,'${uuid(21)}'),(2,'${uuid(22)}');
      insert into telemetry_events select * from performance_metrics;
      insert into developments values('${uuid(10)}','${uuid(2)}');
      insert into transactions values('${uuid(5)}','${uuid(1)}','${uuid(10)}','${uuid(11)}','${uuid(12)}'),('${uuid(6)}','${uuid(3)}',null,null,null),('${uuid(7)}',null,'${uuid(10)}',null,null);
      insert into client_portal_links values
        ('client-valid','${uuid(5)}',true,'${uuid(10)}','${uuid(11)}','${uuid(12)}'),
        ('revoked','${uuid(5)}',false,'${uuid(10)}','${uuid(11)}','${uuid(12)}'),
        ('mismatched-buyer','${uuid(5)}',true,'${uuid(10)}','${uuid(11)}','${uuid(99)}'),
        ('mismatched-unit','${uuid(5)}',true,'${uuid(10)}','${uuid(99)}','${uuid(12)}'),
        ('mismatched-development','${uuid(5)}',true,'${uuid(99)}','${uuid(11)}','${uuid(12)}');
      insert into transaction_onboarding values('onboarding-valid','${uuid(5)}',true),('onboarding-fallback','${uuid(7)}',true),('onboarding-revoked','${uuid(5)}',false);
      insert into transaction_status_links values('status-valid','${uuid(5)}',true),('status-revoked','${uuid(5)}',false);
      insert into transaction_external_access values('external-valid','${uuid(5)}',false,now()+interval '1 day'),('external-expired','${uuid(5)}',false,now()-interval '1 day'),('external-revoked','${uuid(5)}',true,null);
      insert into organisation_branding values('${uuid(1)}','Own transaction'),('${uuid(2)}','Development'),('${uuid(3)}','Unrelated');
      insert into transaction_required_documents values(1,'${uuid(5)}'),(2,'${uuid(6)}');
      insert into transaction_subprocesses values(1,'${uuid(5)}'),(2,'${uuid(6)}');
      insert into transaction_subprocess_steps values(1,1),(2,2);
    `)
    const as = (role, headers, action, user = '', org = '') => db.transaction(async tx => {
      await tx.query("select set_config('request.headers',$1,true),set_config('test.user',$2,true),set_config('test.org',$3,true)", [JSON.stringify(headers),user,org])
      await tx.exec(`set local role ${role}`)
      return action(tx)
    })
    const rows = (table, headers = {}, role = 'anon', user = '', org = '') => as(role,headers,tx => tx.query(`select * from ${table}`),user,org)
    await db.exec(migration)
    assert.equal((await db.query("select count(*)::int n from pg_policies where tablename in ('performance_metrics','telemetry_events') and roles && array['anon','public']::name[]")).rows[0].n,0,
      'anonymous requests must not expand any metrics/profile policies')
    await t.test('all five anonymous reads and exact counts reject absent or incorrect credentials', async () => {
      for(const table of ['organisation_branding','performance_metrics','telemetry_events','transaction_required_documents','transaction_subprocess_steps']) {
        for(const headers of [{},{'x-bridge-client-portal-token':'wrong','x-bridge-onboarding-token':'wrong'}]) {
          assert.equal((await rows(table,headers)).rows.length,0)
          assert.equal((await as('anon',headers,tx=>tx.query(`select count(*)::int n from ${table}`))).rows[0].n,0)
        }
      }
    })
    await t.test('client branding remains scoped to its transaction and development', async () => {
      assert.deepEqual((await rows('organisation_branding',{'x-bridge-client-portal-token':'client-valid'})).rows.map(x=>x.organisation_id).sort(),[uuid(1),uuid(2)])
    })
    await t.test('onboarding branding retains its transaction-first and development fallback rules', async () => {
      assert.deepEqual((await rows('organisation_branding',{'x-bridge-onboarding-token':'onboarding-valid'})).rows.map(x=>x.organisation_id),[uuid(1)])
      assert.deepEqual((await rows('organisation_branding',{'x-bridge-onboarding-token':'onboarding-fallback'})).rows.map(x=>x.organisation_id),[uuid(2)])
    })
    await t.test('revoked links and all mismatched transaction identities are denied', async () => {
      for(const token of ['revoked','mismatched-buyer','mismatched-unit','mismatched-development']) {
        assert.equal((await rows('organisation_branding',{'x-bridge-client-portal-token':token})).rows.length,0)
        assert.equal((await rows('transaction_required_documents',{'x-bridge-client-portal-token':token})).rows.length,0)
      }
      assert.equal((await rows('organisation_branding',{'x-bridge-onboarding-token':'onboarding-revoked'})).rows.length,0)
    })
    await t.test('valid clients still read only their requirements and workflow steps', async () => {
      for(const header of ['x-bridge-client-portal-token','x-bridge-onboarding-token']) {
        const headers={[header]:header.includes('client')?'client-valid':'onboarding-valid'}
        for(const table of ['transaction_required_documents','transaction_subprocess_steps']) assert.deepEqual((await rows(table,headers)).rows.map(x=>x.id),[1])
      }
    })
    await t.test('status and external link access survives the gate without granting cross-transaction access', async () => {
      for(const [header,token] of [['x-bridge-status-token','status-valid'],['x-bridge-external-access-token','external-valid']]) {
        for(const table of ['transaction_required_documents','transaction_subprocess_steps']) assert.deepEqual((await rows(table,{[header]:token})).rows.map(x=>x.id),[1])
      }
      for(const [header,token] of [['x-bridge-status-token','status-revoked'],['x-bridge-external-access-token','external-expired'],['x-bridge-external-access-token','external-revoked']]) {
        for(const table of ['transaction_required_documents','transaction_subprocess_steps']) assert.equal((await rows(table,{[header]:token})).rows.length,0)
      }
    })
    await t.test('staff branding, own metrics and administrator visibility remain intact', async () => {
      assert.equal((await rows('organisation_branding',{},'authenticated',uuid(21),uuid(3))).rows.length,1)
      for(const table of ['performance_metrics','telemetry_events']) {
        assert.deepEqual((await rows(table,{},'authenticated',uuid(21))).rows.map(x=>x.id),[1])
        assert.equal((await rows(table,{},'authenticated',uuid(20))).rows.length,2)
        await assert.rejects(as('authenticated',{},tx=>tx.query(`insert into ${table} values(3,'${uuid(22)}')`),uuid(21)),/row-level security/)
      }
    })
    await t.test('the correction is safe to reapply', async () => {await db.exec(migration)})
  } finally {await db.close()}
})
