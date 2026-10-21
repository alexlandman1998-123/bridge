import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../../../supabase/migrations/20261021081126_restrict_privileged_rpc_execution.sql', import.meta.url),'utf8')
const serviceNames = [...migration.matchAll(/p\.proname = ANY\(ARRAY\[([\s\S]*?)\]\)/g)][0][1].match(/'([^']+)'/g).map(s=>s.slice(1,-1))
const authNames = [...migration.matchAll(/p\.proname = ANY\(ARRAY\[([\s\S]*?)\]\)/g)][1][1].match(/'([^']+)'/g).map(s=>s.slice(1,-1))
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('privileged RPC release closes browser bypasses while retaining intended workflows', async t => {
  const db = new PGlite()
  const as = (role, sql, claims = {}) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)])
    await tx.exec(`set local role ${role}`)
    return tx.query(sql)
  })
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema extensions;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create table profiles(id uuid,system_role text,role text);
      create table invites(email text,invitee_user_id uuid,id uuid,target_workspace_role text,target_transaction_role text,invite_type text,created_at timestamptz);
      create table organisation_users(user_id uuid,id uuid,workspace_role text,organisation_role text,role text,app_role text,invited_at timestamptz,status text);
      create table partner_invitations(recipient_email text,id uuid,relationship_type text,created_at timestamptz);
      create table transaction_partner_invitations(email text,accepted_user_id uuid,id uuid,role_type text,created_at timestamptz);
      create table bond_partner_invitations(invited_email text,id uuid,sent_at timestamptz,created_at timestamptz);
      create table attorney_firm_invitations(email text,id uuid,role text,created_at timestamptz);
      insert into profiles values('${id(1)}',null,'agent'),('${id(2)}','admin','agent');
      insert into invites values('synthetic@example.invalid',null,'${id(3)}','agent',null,null,now());
      create table synthetic_credentials(secret text);
      insert into synthetic_credentials values('synthetic-secret-only');
      create function revo_read_inbox_connection_credential() returns text language sql security definer set search_path=public as $$ select secret from synthetic_credentials limit 1 $$;
      create table trigger_workflow(id int);
      create table trigger_audit(id int);
      create function synthetic_workflow_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into trigger_audit values(new.id); return new; end $$;
      create trigger workflow_insert after insert on trigger_workflow for each row execute function synthetic_workflow_trigger();
      grant insert on trigger_workflow to authenticated;
      create table organisation_partner_roles(id uuid,organisation_id uuid);
      alter table organisation_partner_roles enable row level security;
      create policy org_scope on organisation_partner_roles for select to authenticated using(organisation_id=(auth.jwt()->>'org')::uuid);
      grant select on organisation_partner_roles to anon,authenticated;
      insert into organisation_partner_roles values('${id(10)}','${id(11)}'),('${id(12)}','${id(13)}');
      create function bridge_resolve_partner_role_configuration(uuid,text,uuid,uuid,uuid) returns uuid language sql stable security definer set search_path=public as $$ select id from organisation_partner_roles where organisation_id=$1 limit 1 $$;
      create function public_token_workflow(token text) returns boolean language sql security definer set search_path=public as $$ select token='valid-test-token' $$;
      create function mutable_path_helper() returns text language sql as $$ select 'ok'::text $$;
    `)
    for (const name of serviceNames.filter(n=>n!=='revo_read_inbox_connection_credential')) await db.exec(`create function public.${name}() returns text language sql security definer set search_path=public as $$ select 'worker-ok'::text $$`)
    for (const name of authNames.filter(n=>n!=='arch9_admin_invited_users_summary')) await db.exec(`create function public.${name}() returns boolean language sql security definer set search_path=public as $$ select true $$`)
    await db.exec(`create function authorized_parent_workflow() returns text language sql security definer set search_path=public as $$ select bridge_claim_transaction_progress_notifications_phase3() $$`)
    assert.equal((await as('anon','select revo_read_inbox_connection_credential() secret')).rows[0].secret,'synthetic-secret-only')
    await db.exec(migration)
    await t.test('all reviewed internal functions reject both browser roles and preserve server access',async()=>{
      for(const name of serviceNames) {
        for(const role of ['anon','authenticated']) await assert.rejects(as(role,`select ${name}()`),/permission denied/)
        assert.equal((await as('service_role',`select ${name}() result`)).rows.length,1)
      }
    })
    await t.test('logged-in-only entry points reject anonymous calls and retain staff callers',async()=>{
      for(const name of authNames.filter(n=>n!=='arch9_admin_invited_users_summary')) {
        await assert.rejects(as('anon',`select ${name}()`),/permission denied/)
        assert.equal((await as('authenticated',`select ${name}()`)).rows.length,1)
      }
    })
    await t.test('guarded parent functions still invoke internal workers',async()=>assert.equal((await as('authenticated','select authorized_parent_workflow() result')).rows[0].result,'worker-ok'))
    await t.test('existing triggers still execute when their browser EXECUTE grant is removed',async()=>{
      await as('authenticated','insert into trigger_workflow values(7)')
      assert.deepEqual((await db.query('select * from trigger_audit')).rows,[{id:7}])
      assert.equal((await db.query("select has_function_privilege('authenticated','synthetic_workflow_trigger()','execute') allowed")).rows[0].allowed,false)
    })
    await t.test('user-editable metadata cannot authorize admin access',async()=>{
      await assert.rejects(as('anon','select arch9_admin_invited_users_summary()'),/permission denied/)
      await assert.rejects(as('authenticated','select arch9_admin_invited_users_summary()',{sub:id(1),user_metadata:{role:'admin'}}),/Admin access is required/)
      for(const claims of [{sub:id(1),app_metadata:{role:'admin'}},{sub:id(2)}]) assert.equal((await as('authenticated','select arch9_admin_invited_users_summary() result',claims)).rows[0].result.total,1)
    })
    await t.test('partner resolution follows row security for direct browser requests',async()=>{
      const sql = org=>`select bridge_resolve_partner_role_configuration('${org}',null,null,null,null) result`
      assert.equal((await as('authenticated',sql(id(11)),{org:id(11)})).rows[0].result,id(10))
      assert.equal((await as('authenticated',sql(id(13)),{org:id(11)})).rows[0].result,null)
      assert.equal((await as('anon',sql(id(11)))).rows[0].result,null)
    })
    await t.test('public token workflows remain callable and validate credentials',async()=>{
      assert.equal((await as('anon',"select public_token_workflow('valid-test-token') result")).rows[0].result,true)
      assert.equal((await as('anon',"select public_token_workflow('wrong') result")).rows[0].result,false)
    })
    await t.test('mutable function paths are pinned and the release is idempotent',async()=>{
      assert.deepEqual((await db.query("select proconfig from pg_proc where proname='mutable_path_helper'")).rows[0].proconfig,['search_path=public, extensions, pg_temp'])
      await db.exec(migration)
    })
  } finally { await db.close() }
})

test('seller continuity views retain scoped resolution without a definer bypass',async()=>{
  const correction=await readFile(new URL('../../../supabase/migrations/20261021082100_preserve_scoped_seller_continuity_resolver.sql',import.meta.url),'utf8')
  const db=new PGlite()
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      grant usage on schema public to anon,authenticated,service_role;
      create table transactions(id uuid,organisation_id uuid,private_listing_id uuid,listing_id uuid,created_at timestamptz);
      alter table transactions enable row level security;
      create policy own_org on transactions for select to authenticated using(organisation_id::text=current_setting('test.org',true));
      grant select on transactions to anon,authenticated;
      insert into transactions values('${id(10)}','${id(11)}','${id(20)}',null,now()),('${id(12)}','${id(13)}','${id(21)}',null,now());
      create function bridge_resolve_private_listing_transaction_id(p_private_listing_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
        declare v_transaction_id uuid;
        begin
          execute 'select id from public.transactions where private_listing_id=$1 order by created_at desc nulls last,id limit 1' using p_private_listing_id into v_transaction_id;
          return v_transaction_id;
        end $$;
      revoke all on function bridge_resolve_private_listing_transaction_id(uuid) from public,anon,authenticated;
      create table visible_listings(id uuid);
      insert into visible_listings values('${id(20)}'),('${id(21)}');
      grant select on visible_listings to anon,authenticated;
      create view synthetic_seller_continuity with(security_invoker=true) as select id,bridge_resolve_private_listing_transaction_id(id) transaction_id from visible_listings;
      grant select on synthetic_seller_continuity to anon,authenticated;
      create function guarded_document_parent(p uuid) returns uuid language sql security definer set search_path=public as $$ select bridge_resolve_private_listing_transaction_id(p) $$;
    `)
    const as=(role,sql)=>db.transaction(async tx=>{await tx.query("select set_config('test.org',$1,true)",[id(11)]);await tx.exec(`set local role ${role}`);return tx.query(sql)})
    await assert.rejects(as('authenticated','select * from synthetic_seller_continuity'),/permission denied/)
    await db.exec(correction)
    const own=(await as('authenticated','select * from synthetic_seller_continuity order by id')).rows
    assert.deepEqual(own,[{id:id(20),transaction_id:id(10)},{id:id(21),transaction_id:null}])
    assert.ok((await as('anon','select * from synthetic_seller_continuity')).rows.every(x=>x.transaction_id===null))
    assert.equal((await as('authenticated',`select bridge_resolve_private_listing_transaction_id('${id(21)}') result`)).rows[0].result,null)
    assert.equal((await as('authenticated',`select guarded_document_parent('${id(21)}') result`)).rows[0].result,id(12))
    await db.exec(correction)
  } finally {await db.close()}
})
