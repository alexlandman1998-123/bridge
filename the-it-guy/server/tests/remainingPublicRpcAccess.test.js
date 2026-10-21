import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const sql = await readFile(new URL('../../../supabase/migrations/20261021104501_enforce_closeout_authority_before_event_writes.sql', import.meta.url), 'utf8')
const targets = [...sql.matchAll(/REVOKE EXECUTE ON FUNCTION public\.([a-z_0-9]+)\((.*?)\) FROM PUBLIC, anon;/g)]
const org='11111111-1111-4111-8111-111111111111', tx='22222222-2222-4222-8222-222222222222', member='33333333-3333-4333-8333-333333333333', outsider='44444444-4444-4444-8444-444444444444'
test('closeout authorization runs before event writes and retains staff workflows', async t => {
 const db=new PGlite()
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('fixture.user',true),'')::uuid $$;
   create function auth.role() returns text language sql stable as $$ select current_setting('fixture.role',true) $$;
   create table public.transactions(id uuid primary key,organisation_id uuid);
   create table public.commission_closeout_events(id uuid);
   insert into public.transactions values('${tx}','${org}');
   create function public.bridge_current_email() returns text language sql as $$ select ''::text $$;
   create function public.bridge_is_active_member(org uuid) returns boolean language sql as $$ select auth.uid()='${member}'::uuid and org='${org}'::uuid $$;
   create function public.bridge_is_org_admin(org uuid) returns boolean language sql as $$ select false $$;
   create function public.bridge_is_transaction_closeout_state(a text,b text,c text) returns boolean language sql as $$ select false $$;`)
  for(const [,name,args] of targets) if(name!=='bridge_closeout_transaction_with_commission_check') await db.exec(`create function public.${name}(${args}) returns void language plpgsql as $$ begin return; end $$;`)
  // The exact-definition guard is covered by the hosted rollback rehearsal.
  await db.exec(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION')))
  const call=async(role,user)=>{
   await db.query(`select set_config('fixture.role',$1,false),set_config('fixture.user',$2,false)`,[role,user])
   return (await db.query(`select public.bridge_closeout_transaction_with_commission_check($1,'invalid-stage','invalid-state',false,null) as result`,[tx])).rows[0].result
  }
  await t.test('ten staff entry points deny anon and retain logged-in/server execution',async()=>{
   assert.equal(targets.length,10)
   for(const [,name,args]of targets){
    const types=args.split(',').map(a=>a.trim().split(/\s+/).slice(1).join(' ')).join(',')
    const row=(await db.query(`select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as staff,has_function_privilege('service_role',$1,'execute') as server`,[`public.${name}(${types})`])).rows[0]
    assert.deepEqual(row,{anon:false,staff:true,server:true})
   }
  })
  await t.test('anonymous and unrelated callers cannot reach event writes',async()=>{
   assert.equal((await call('anon','')).code,'forbidden')
   assert.equal((await call('authenticated',outsider)).code,'forbidden')
  })
  await t.test('members and server callers retain the normal validation path',async()=>{
   assert.equal((await call('authenticated',member)).code,'invalid_closeout_state')
   assert.equal((await call('service_role','')).code,'invalid_closeout_state')
  })
  assert.equal((await db.query('select count(*)::int as count from public.commission_closeout_events')).rows[0].count,0)
 } finally {await db.close()}
})
