import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1), foreign=id(2), owner=id(3), target=id(4), manager=id(5), outsider=id(6), inactive=id(7), pending=id(8), accepted=id(9)
test('principal copies retain invoker RLS, genuine agent ownership and retry-safe provenance', async(t) => {
 const db=new PGlite()
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
   create table organisations(id uuid primary key);
   create table organisation_users(organisation_id uuid,user_id uuid,membership_status text,status text);
   create function bridge_is_active_member(p_org uuid) returns boolean language sql stable as $$select p_org='${org}' and auth.uid() in ('${owner}','${target}','${manager}','${accepted}')$$;
   create function email_campaign_can_send(p_org uuid) returns boolean language sql stable as $$select p_org='${org}' and auth.uid()='${manager}'$$;
   grant select on organisation_users to authenticated;
   alter table organisation_users enable row level security;
   create policy members on organisation_users for select to authenticated using(bridge_is_active_member(organisation_id));
   create table email_campaigns(id uuid primary key,organisation_id uuid);
   create table whatsapp_campaigns(id uuid primary key,organisation_id uuid);
   grant select on email_campaigns,whatsapp_campaigns to authenticated;
   insert into auth.users values('${owner}'),('${target}'),('${manager}'),('${outsider}'),('${inactive}'),('${pending}'),('${accepted}');
   insert into organisations values('${org}'),('${foreign}');
   insert into organisation_users values('${org}','${owner}','active','active'),('${org}','${target}','active','active'),('${org}','${manager}','active','active'),('${foreign}','${outsider}','active','active'),('${org}','${inactive}','inactive','active'),('${org}','${pending}','pending','active'),('${org}','${accepted}','accepted','accepted');
  `)
  for (const file of ['20261022132550_marketing_campaign_initiatives.sql','20261023111430_marketing_campaign_templates.sql','20261023121043_marketing_campaign_budgets.sql','20261025104933_campaign_playbooks.sql']) await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'))
  await db.exec('alter table marketing_campaigns add column listing_builder jsonb, add column campaign_builder jsonb; grant insert(listing_builder,campaign_builder) on marketing_campaigns to authenticated;')
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261025174202_campaign_principal_reuse.sql',import.meta.url),'utf8'))
  const login=async(user,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[user||'']);await db.exec(`set role ${role}`)}
  await login(owner)
  const source=(await db.query("insert into marketing_campaigns(organisation_id,name,goal,objective,area,status,channel_content) values($1,'Valuations','seller_leads','Book valuations','Cape Town','active',$2) returning *",[org,JSON.stringify({email:{title:'Know your home',body:'Contact Alex'}})])).rows[0]
  const draft={name:'Sarah valuations',objective:'Book valuations',audience:'Homeowners',offer:'Free valuation',area:'Gardens',start_date:null,end_date:null,channel_content:{email:{title:'Know your home',body:'Contact Sarah · sarah@example.test'}}}
  const copy=async(request=id(20),agent=target,scope=org,revision=source.revision,doc=draft)=>db.query('select (public.marketing_campaign_copy($1,$2,$3,$4,$5,$6)).*',[scope,source.id,revision,agent,request,JSON.stringify(doc)])
  await t.test('blocks ordinary agents, outsiders, anonymous users and ineligible targets',async()=>{
   await assert.rejects(copy(),/Only agency managers/)
   await assert.rejects(db.query('insert into marketing_campaigns(organisation_id,created_by,name,goal,objective) values($1,$2,\'Spoofed owner\',\'custom\',\'Test\')',[org,target]),/row-level security/)
   await login(outsider);await assert.rejects(copy(),/Only agency managers/)
   await login(null,'anon');await assert.rejects(copy(),/permission denied/)
   await login(manager)
   for(const agent of [outsider,inactive,pending]) await assert.rejects(copy(id(21),agent),/active agents/)
   await assert.rejects(copy(id(21),target,foreign),/active agents/)
   await assert.rejects(copy(id(21),target,org,99),/source campaign changed/)
  })
  await t.test('creates a target-owned draft, records its source and creates no sends or recipients',async()=>{
   await login(manager)
   const saved=(await copy()).rows[0]
   assert.equal(saved.created_by,target);assert.equal(saved.status,'draft');assert.equal(saved.revision,1)
   assert.equal(saved.copied_by,manager);assert.equal(saved.copied_from_id,source.id);assert.equal(saved.copied_from_revision,1)
   assert.equal(saved.area,'Gardens');assert.equal(saved.planned_budget,null);assert.equal(saved.start_date,null);assert.equal(saved.cover_url,'')
   assert.equal(saved.listing_builder,null);assert.equal(saved.campaign_builder,null)
   assert.equal((await db.query('select count(*)::int n from marketing_campaign_activities')).rows[0].n,0)
   assert.equal((await db.query('select count(*)::int n from email_campaigns')).rows[0].n,0)
   assert.equal((await copy()).rows[0].id,saved.id)
   assert.equal((await db.query('select count(*)::int n from marketing_campaigns where copied_from_id is not null')).rows[0].n,1)
   assert.equal((await copy(id(22),accepted)).rows[0].created_by,accepted)
  })
  await t.test('lets the receiving agent edit their copy but not the original; ownership and provenance stay immutable',async()=>{
   await login(target)
   assert.equal((await db.query("update marketing_campaigns set name='Personalised further',revision=2 where id=$1 returning id",[id(20)])).rows.length,1)
   assert.equal((await db.query("update marketing_campaigns set name='Not mine',revision=2 where id=$1 returning id",[source.id])).rows.length,0)
   await assert.rejects(db.query('update marketing_campaigns set created_by=$1 where id=$2',[owner,id(20)]),/permission denied/)
   await assert.rejects(db.query('update marketing_campaigns set copied_from_revision=9 where id=$1',[id(20)]),/permission denied/)
   await login(manager)
   const recovered=(await copy()).rows[0]
   assert.equal(recovered.name,'Personalised further');assert.equal(recovered.revision,2)
   await assert.rejects(copy(id(20),owner),/another campaign/)
  })
  await t.test('rejects delivery state, source assets and malformed requests atomically',async()=>{
   for(const doc of [{...draft,status:'active'},{...draft,recipients:[id(99)]},{...draft,listing_builder:{}},{...draft,created_by:manager},{...draft,name:''}]) await assert.rejects(copy(id(23),target,org,1,doc))
   await assert.rejects(db.query("insert into marketing_campaigns(id,organisation_id,created_by,copied_from_id,copied_from_revision,name,goal,objective,status) values($1,$2,$3,$4,1,'Not a draft','custom','Test','active')",[id(24),org,target,source.id]),/fresh campaign plan/)
   assert.equal((await db.query('select count(*)::int n from marketing_campaigns where id in ($1,$2)',[id(23),id(24)])).rows[0].n,0)
  })
  await t.test('stores portable playbook steps only with a fresh required review',async()=>{
   const playbook={version:1,sourceRevision:0,response:{kind:'email',label:'Get in touch',value:'sarah@example.test'},steps:[{id:id(40),channel:'email',day:0,title:'A valuation',body:'Sarah · {response}'}],followUp:[]}
   const saved=(await copy(id(25),target,org,1,{...draft,playbook})).rows[0]
   assert.equal(saved.playbook.sourceRevision,0);assert.equal(saved.playbook.response.value,'sarah@example.test')
   await assert.rejects(copy(id(26),target,org,1,{...draft,playbook:{...playbook,sourceRevision:1}}),/fresh campaign plan/)
  })
 } finally { await db.close() }
})
