import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const matter=randomUUID(), other=randomUUID(), user=randomUUID(), second=randomUUID(), link=randomUUID(), listing=randomUUID()
await db.exec(`
create role anon; create role authenticated; create schema auth; create schema journey_private;
revoke all on schema journey_private from public,anon,authenticated;
create table public.transactions(id uuid primary key);
create table public.profiles(id uuid primary key,role text,full_name text);
create table public.client_portal_links(id uuid,transaction_id uuid,token text,is_active boolean);
create table public.transaction_refresh_signals(transaction_id uuid primary key,version bigint,changed_at timestamptz);
create table journey_private.task_catalog(lane_key text,step_key text,definition jsonb);
create table journey_private.task_events(transaction_id uuid,command_id uuid,revision bigint,lane_key text,step_key text,previous_status text,status text,created_at timestamptz default now(),primary key(transaction_id,command_id));
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function bridge_client_portal_request_token() returns text language sql as $$select current_setting('test.token',true)$$;
create function bridge_has_client_portal_token_transaction_access(uuid) returns boolean language sql as $$select $1='${matter}'::uuid and current_setting('test.token',true)='buyer-valid'$$;
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select $1='${matter}'::uuid and auth.uid() in ('${user}'::uuid,'${second}'::uuid)$$;
create function bridge_has_transaction_permission(uuid,text) returns boolean language sql as $$select current_setting('test.write',true)='yes'$$;
create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as $$select current_setting('test.write',true)='yes'$$;
create function bridge_private_listing_seller_portal_payload(text,text,boolean) returns jsonb language sql as $$select case when $1='seller-valid' and $2='session-valid' and $3 then jsonb_build_object('listing',jsonb_build_object('id','${listing}')) else jsonb_build_object('authRequired',true) end$$;
create function bridge_resolve_private_listing_transaction_id(uuid) returns uuid language sql as $$select case when $1='${listing}'::uuid then '${matter}'::uuid end$$;
insert into transactions values('${matter}'),('${other}');
insert into profiles values('${user}','attorney','Attorney One'),('${second}','attorney','Attorney Two');
insert into client_portal_links values('${link}','${matter}','buyer-valid',true);
insert into journey_private.task_catalog values('transfer','rates_requested','{"client":{"title":"Rates clearance requested"},"professional":{"description":"PRIVATE NOTE"}}');
`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260908153913_shared_matter_conversation.sql',import.meta.url),'utf8'))
const identity=async(role='professional',id=user)=>{
  await db.exec('reset role')
  await db.query("select set_config('test.user',$1,false),set_config('test.token',$2,false),set_config('test.write','yes',false)",[role==='professional'?id:'',role==='buyer'?'buyer-valid':''])
  await db.exec(role==='professional'?'set role authenticated':'set role anon')
}
const read=async(token=null,session=null,id=matter)=>(await db.query('select bridge_read_matter_conversation($1,$2,$3) result',[id,token,session])).rows[0].result
const post=async(body,audience,command=randomUUID(),token=null,session=null,id=matter)=>(await db.query('select bridge_post_matter_message($1,$2,$3,$4,$5,$6) result',[id,command,body,audience,token,session])).rows[0].result
await identity()
for(const audience of ['everyone','professionals','buyer','seller','private']) await post('message-'+audience,audience)
assert.equal((await read()).items.length,5)
const retry=randomUUID()
await post('once','everyone',retry)
assert.equal((await post('once','everyone',retry)).replayed,true)
await assert.rejects(post('changed','everyone',retry),/already used/)
await assert.rejects(post('bad','unknown'),/audience/)
await assert.rejects(post('x'.repeat(4001),'everyone'),/4000/)
await assert.rejects(post('wrong matter','everyone',randomUUID(),null,null,other),/denied/)
await identity('professional',second)
assert.ok(!(await read()).items.some(i=>i.audience==='private'))
await db.query("select set_config('test.write','no',false)")
assert.deepEqual((await read()).audiences,[])
await assert.rejects(post('read only','everyone'),/not permitted/)
await identity('buyer')
const buyer=(await read()).items
assert.deepEqual(new Set(buyer.map(i=>i.audience)),new Set(['everyone','buyer']))
await assert.rejects(post('spoof','seller'),/not permitted/)
await post('buyer reply','everyone')
assert.equal((await read()).items.find(i=>i.body==='buyer reply').authorRole,'buyer')
// Even if a professional is signed in, a portal header cannot acquire its privileges.
await db.exec('reset role')
await db.query("select set_config('test.user',$1,false)",[user])
await db.exec('set role authenticated')
await assert.rejects(post('spoof','professionals'),/not permitted/)
await identity('seller')
const seller=(await read('seller-valid','session-valid')).items
assert.deepEqual(new Set(seller.map(i=>i.audience)),new Set(['everyone','seller']))
await post('seller reply','everyone',randomUUID(),'seller-valid','session-valid')
assert.equal((await read('seller-valid','session-valid')).items.find(i=>i.body==='seller reply').authorRole,'seller')
await assert.rejects(read('seller-valid','expired'),/access required/)
await assert.rejects(read('seller-valid','session-valid',other),/denied/)
await assert.rejects(post('bad','everyone',randomUUID(),'seller-valid','expired'),/access required/)
await assert.rejects(db.query('select * from journey_private.messages'),/permission denied/)
await assert.rejects(read(),/denied/)
await db.exec('reset role')
// Automatic feed includes every genuine outcome but not duplicate no-op saves.
for (const [index,status] of ['completed','completed_externally','not_applicable','not_started','in_progress','waiting','blocked'].entries()) {
  await db.query('insert into journey_private.task_events(transaction_id,command_id,revision,lane_key,step_key,previous_status,status) values($1,$2,$3,$4,$5,$6,$7)',[matter,randomUUID(),index+1,'transfer','rates_requested',status==='not_started'?'completed':'not_started',status])
}
await db.query("insert into journey_private.task_events(transaction_id,command_id,revision,lane_key,step_key,previous_status,status) values($1,$2,9,'transfer','rates_requested','in_progress','in_progress')",[matter,randomUUID()])
await identity()
const routine=(await read()).items.filter(i=>i.kind==='milestone')
assert.equal(routine.length,7)
assert.ok(routine.some(i=>i.body.endsWith('reopened.')))
assert.doesNotMatch(JSON.stringify(routine),/PRIVATE NOTE|actor_key|session|token/)
await identity('buyer')
assert.deepEqual((await read()).items.filter(i=>i.kind==='milestone'),routine)
await identity('seller')
assert.deepEqual((await read('seller-valid','session-valid')).items.filter(i=>i.kind==='milestone'),routine)
await db.exec('reset role')
assert.equal(Number((await db.query('select version from transaction_refresh_signals where transaction_id=$1',[matter])).rows[0].version),8)
await db.exec(`create function reject_message_signal() returns trigger language plpgsql as $$begin raise exception 'signal failed';end$$;
 create trigger reject_message_signal before update on transaction_refresh_signals for each row execute function reject_message_signal();`)
await identity()
const rollbackId=randomUUID()
await assert.rejects(post('must roll back','everyone',rollbackId),/signal failed/)
assert.ok(!(await read()).items.some(i=>i.body==='must roll back'))
await db.exec('reset role;drop trigger reject_message_signal on transaction_refresh_signals')
await db.query("update profiles set role='buyer' where id=$1",[user])
await identity()
await assert.rejects(read(),/Professional matter access/)
await db.exec('reset role')
await db.close()
console.log('Conversation SQL: five audiences, read/write ACLs, portal identity, seller replies, idempotency, revision and seven routine outcomes passed.')
