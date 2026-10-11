import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const firm=randomUUID(), other=randomUUID(), director=randomUUID(), attorney=randomUUID(), colleague=randomUUID(), outsider=randomUUID();
const db=new PGlite();
async function rpc(user, f, kind, payload={}, request=randomUUID(), read=false) {
  return db.transaction(async tx=>{
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    const sql=read?'select public.arch9_legal_read($1,$2,$3) as result':'select public.arch9_legal_command($1,$2,$3,$4) as result';
    return (await tx.query(sql,read?[f,kind,payload]:[f,request,kind,payload])).rows[0].result;
  });
}
const read=(u,f,k,p)=>rpc(u,f,k,p,undefined,true);
const grants=(user,manage=false,disciplines=['wills_estates'])=>({user_id:user,disciplines,can_manage:manage,can_create:true,can_edit:true,can_review:true});
const configure=(g,revision)=>rpc(director,firm,'configure',{enabled:true,disciplines:['wills_estates','trusts'],grants:g,expected_revision:revision});
const denied=async fn=>assert.rejects(fn,e=>e.code==='42501');
let client,matter;
test('Legal foundation executes actual SQL with isolated access and atomic commands',async t=>{
  await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated;
  create table public.attorney_firms(id uuid primary key,is_active boolean,organisation_id uuid);
  create table public.attorney_firm_members(firm_id uuid,user_id uuid,status text,role text,professional_role text);
  create table public.transactions(id uuid primary key,status text);
  insert into public.transactions values('${randomUUID()}','unchanged');`);
  for(const id of [director,attorney,colleague,outsider]) await db.query('insert into auth.users values($1)',[id]);
  for(const id of [firm,other]) await db.query('insert into attorney_firms values($1,true,$2)',[id,randomUUID()]);
  for(const [f,u,role] of [[firm,director,'director_partner'],[firm,attorney,'attorney_conveyancer'],[firm,colleague,'attorney_conveyancer'],[other,outsider,'director_partner']]) await db.query("insert into attorney_firm_members values($1,$2,'active',$3,$3)",[f,u,role]);
  const snapshot=async()=>JSON.stringify((await db.query("select c.relname,c.relacl,a.attname,a.atttypid from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 where n.nspname='public' and c.relkind='r' order by c.relname,a.attnum")).rows);
  const before=await snapshot();
  await db.exec(await readFile(new URL('../../supabase/migrations/20261011145029_arch9_legal_matter_foundation.sql',import.meta.url),'utf8'));
  assert.equal(await snapshot(),before);
  await t.test('disabled by default; existing staff and outsiders have no implicit access',async()=>{
    assert.equal((await read(attorney,firm,'context')).enabled,false);
    await denied(()=>read(attorney,firm,'matters'));
    await denied(()=>read(outsider,firm,'context'));
    await assert.rejects(()=>configure([grants(outsider)],0),/active firm membership/);
  });
  await configure([grants(director,true),grants(attorney),grants(colleague)],0);
  await t.test('draft creation and recovery are atomic and references are independent',async()=>{
    client=(await rpc(attorney,firm,'create_client',{kind:'individual',name:'Test Client'})).client;
    const payload={title:'Will',discipline:'wills_estates',responsible_user_id:attorney,client_id:client.id};
    const request=randomUUID();
    matter=(await rpc(attorney,firm,'create_matter',payload,request)).matter;
    assert.equal(matter.status,'draft'); assert.match(matter.reference,/^LEG-\d{4}-00000001$/);
    const replay=await rpc(attorney,firm,'create_matter',payload,request); assert.equal(replay.deduplicated,true); assert.equal(replay.matter.id,matter.id);
    await assert.rejects(()=>rpc(attorney,firm,'create_matter',{...payload,title:'changed'},request),e=>e.code==='22023');
    await denied(()=>rpc(attorney,firm,'create_matter',{...payload,client_id:randomUUID()}));
    assert.equal((await db.query('select next_number from legal_private.references')).rows[0].next_number,2);
    assert.equal((await db.query('select count(*)::int n from legal_private.matters')).rows[0].n,1);
    await denied(()=>read(colleague,firm,'matter',{matter_id:matter.id}));
    await denied(()=>read(attorney,other,'matter',{matter_id:matter.id}));
  });
  await t.test('cross-firm client links, discipline gates, queued numbering and audit rollback',async()=>{
    await rpc(outsider,other,'configure',{enabled:true,disciplines:['trusts'],grants:[grants(outsider,true,['trusts'])],expected_revision:0});
    const foreignClient=(await rpc(outsider,other,'create_client',{kind:'organisation',name:'Other firm client'})).client;
    const payload={title:'Another will',discipline:'wills_estates',responsible_user_id:attorney,client_id:client.id};
    const count=async()=> (await db.query('select count(*)::int n from legal_private.events')).rows[0].n;
    const before=await count();
    await denied(()=>rpc(attorney,firm,'create_matter',{...payload,client_id:foreignClient.id}));
    await denied(()=>rpc(attorney,firm,'create_matter',{...payload,discipline:'trusts'}));
    await assert.rejects(()=>rpc(attorney,firm,'create_matter',{...payload,status:'open'}),e=>e.code==='22023');
    assert.equal(await count(),before);
    const results=await Promise.all(Array.from({length:5},()=>rpc(attorney,firm,'create_matter',payload)));
    assert.equal(new Set(results.map(r=>r.matter.reference)).size,5);
    const list=await read(attorney,firm,'matters',{scope:'mine',page_size:2,page:2});
    assert.equal(list.total,6); assert.equal(list.rows.length,2);
    assert.equal((await read(attorney,firm,'clients',{search:'Test Client'})).total,1);
    const detail=await read(attorney,firm,'matter',{matter_id:matter.id}); assert.equal(detail.activity.length,1);
    const request=randomUUID();
    const replayPayload={title:'Retry revocation',discipline:'wills_estates',responsible_user_id:colleague,client_id:(await rpc(colleague,firm,'create_client',{kind:'individual',name:'Colleague client'})).client.id};
    await rpc(colleague,firm,'create_matter',replayPayload,request);
    await db.query("update attorney_firm_members set status='suspended' where user_id=$1",[colleague]);
    await denied(()=>rpc(colleague,firm,'create_matter',replayPayload,request));
    await db.query("update attorney_firm_members set status='active' where user_id=$1",[colleague]);
  });
  await t.test('intake decisions, optimistic revisions, lifecycle and party changes',async()=>{
    const update=p=>rpc(attorney,firm,'update_matter',{matter_id:matter.id,expected_revision:matter.revision,...p});
    await assert.rejects(()=>update({status:'open',reason:'Start'}),/Clear conflict/);
    matter=(await rpc(attorney,firm,'review_intake',{matter_id:matter.id,expected_revision:1,conflict_decision:'clear',conflict_note:'Manual check complete',engagement_decision:'accepted',engagement_note:'Terms accepted'})).matter;
    await assert.rejects(()=>rpc(attorney,firm,'update_matter',{matter_id:matter.id,expected_revision:1,title:'stale'}),e=>e.code==='40001');
    matter=(await update({status:'open',reason:'Intake approved'})).matter;
    const partyClient=(await rpc(attorney,firm,'create_client',{kind:'individual',name:'Beneficiary'})).client;
    matter=(await rpc(attorney,firm,'add_party',{matter_id:matter.id,expected_revision:matter.revision,client_id:partyClient.id,role:'beneficiary'})).matter;
    assert.equal(matter.status,'on_hold'); assert.equal(matter.conflict_decision,'pending');
    await denied(()=>rpc(attorney,firm,'update_client',{client_id:client.id,expected_revision:1,name:'New identity'}));
    matter=(await update({status:'closed',reason:'Completed'})).matter;
    matter=(await update({status:'archived',reason:'Filed'})).matter;
    await assert.rejects(()=>rpc(attorney,firm,'review_intake',{matter_id:matter.id,expected_revision:matter.revision}),/Restore or reopen/);
    matter=(await update({status:'closed',reason:'Restore'})).matter;
  });
  await t.test('restricted matters, team scope, suspended and revoked memberships',async()=>{
    matter=(await rpc(attorney,firm,'update_matter',{matter_id:matter.id,expected_revision:matter.revision,restricted:true})).matter;
    await denied(()=>read(director,firm,'matter',{matter_id:matter.id}));
    // Team edit is tested on a new draft, as closed matters preserve their record.
    const c=(await rpc(attorney,firm,'create_client',{kind:'individual',name:'Team client'})).client;
    const m=(await rpc(attorney,firm,'create_matter',{title:'Team',discipline:'wills_estates',responsible_user_id:attorney,client_id:c.id,restricted:true})).matter;
    const assigned=await rpc(attorney,firm,'set_team',{matter_id:m.id,expected_revision:1,user_ids:[attorney,colleague]});
    assert.equal((await read(colleague,firm,'matter',{matter_id:m.id})).matter.id,m.id);
    await denied(()=>rpc(colleague,firm,'update_matter',{matter_id:m.id,expected_revision:2,restricted:false}));
    await rpc(attorney,firm,'set_team',{matter_id:m.id,expected_revision:assigned.matter.revision,user_ids:[attorney]});
    await denied(()=>read(colleague,firm,'matter',{matter_id:m.id}));
    await db.query("update attorney_firm_members set status='suspended' where user_id=$1",[attorney]);
    await denied(()=>read(attorney,firm,'matters'));
    await db.query("update attorney_firm_members set status='active' where user_id=$1",[attorney]);
    await configure([grants(attorney,false,[])],1);
    await denied(()=>read(attorney,firm,'matter',{matter_id:m.id}));
  });
  await t.test('bounded register and security catalog deny all direct writes',async()=>{
    const list=await read(director,firm,'matters',{page:1,page_size:1}); assert.equal(list.rows.length,1); assert.equal(list.total,6); // restricted matters excluded
    await assert.rejects(()=>read(director,firm,'matters',{page_size:101}),/Invalid pagination/);
    const tables=(await db.query("select relname,relrowsecurity,has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') writes from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='legal_private' and c.relkind='r'")).rows;
    assert.equal(tables.length,9); assert.ok(tables.every(t=>t.relrowsecurity&&!t.writes));
    assert.equal((await db.query("select has_function_privilege('anon','public.arch9_legal_read(uuid,text,jsonb)','execute') permitted")).rows[0].permitted,false);
    const functions=(await db.query("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anonymous,has_function_privilege('authenticated',p.oid,'execute') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='legal_private' or (n.nspname='public' and p.proname like 'arch9_legal_%')")).rows;
    assert.ok(functions.every(f=>!f.anonymous && f.proconfig.includes('search_path=""')));
    assert.ok(functions.filter(f=>f.proname.startsWith('arch9_legal_')).every(f=>!f.prosecdef&&f.authenticated));
    assert.ok(functions.filter(f=>!['command','read'].includes(f.proname)&&!f.proname.startsWith('arch9_legal_')).every(f=>!f.authenticated));
    await assert.rejects(()=>db.transaction(async tx=>{
      await tx.exec('set local role authenticated');
      await tx.exec('select * from legal_private.matters');
    }),e=>e.code==='42501');

    const detail=await read(director,firm,'context'); assert.equal(detail.settings.revision,2);
    assert.equal((await db.query('select status from transactions')).rows[0].status,'unchanged'); assert.equal(await snapshot(),before);
  });
  await db.close();
});
