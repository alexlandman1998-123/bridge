import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org=id(1), foreign=id(2), manager=id(3), agent=id(4), colleague=id(5), suspended=id(6), outsider=id(7), category=id(8), campaign=id(9), otherCampaign=id(10)
const definition = (rules=[{field:'role',operator:'in',values:['buyer']}], extra={}) => ({match:'all',rules,excludeClosed:true,quietDays:0,...extra})

test('shared marketing audiences: live membership, eligibility and reviewed channel handoff', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      create table organisations(id uuid primary key);
      create table members(organisation_id uuid,user_id uuid,manager boolean,active boolean);
      create function bridge_is_active_member(o uuid) returns boolean language sql stable as $$ select exists(select 1 from public.members where organisation_id=o and user_id=auth.uid() and active) $$;
      create function email_campaign_can_send(o uuid) returns boolean language sql stable as $$ select exists(select 1 from public.members where organisation_id=o and user_id=auth.uid() and manager and active) $$;
      create table marketing_campaigns(id uuid primary key,organisation_id uuid,created_by uuid,unique(id,organisation_id));
      create table contacts(contact_id uuid primary key,organisation_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,contact_type text);
      create table leads(lead_id uuid primary key,organisation_id uuid,contact_id uuid,assigned_agent_id uuid,assigned_user_id uuid,lead_domain text,lead_category text,stage text,status text,budget numeric,area_interest text);
      create table email_marketing_contacts(id uuid primary key,organisation_id uuid,email text,is_valid_email boolean,tags text[]);
      create table contact_marketing_preferences(organisation_id uuid,email text,marketing_consent_status text,unsubscribed_at timestamptz);
      create table email_suppressions(organisation_id uuid,email text);
      create table email_subscription_types(id uuid primary key,organisation_id uuid,name text,is_active boolean);
      create table contact_email_subscriptions(organisation_id uuid,email text,subscription_type_id uuid,status text);
      create table whatsapp_marketing_contacts(id uuid primary key,organisation_id uuid,phone text,consent_status text,opted_out_at timestamptz,consent_at timestamptz);
      create table email_campaign_recipients(organisation_id uuid,email text,sent_at timestamptz);
      create table whatsapp_campaign_recipients(organisation_id uuid,phone text,sent_at timestamptz);
      create table lead_activities(organisation_id uuid,lead_id uuid,activity_type text,outcome text,activity_date timestamptz);
      grant select on members to authenticated;
    `)
    const sources = ['marketing_campaigns','contacts','leads','email_marketing_contacts','contact_marketing_preferences','email_suppressions','email_subscription_types','contact_email_subscriptions','whatsapp_marketing_contacts','email_campaign_recipients','whatsapp_campaign_recipients','lead_activities']
    for (const table of sources) await db.exec(`grant select on ${table} to authenticated; alter table ${table} enable row level security; create policy visible on ${table} for select to authenticated using(bridge_is_active_member(organisation_id)${table==='leads' ? ' and (assigned_agent_id=auth.uid() or assigned_user_id=auth.uid() or email_campaign_can_send(organisation_id))' : ''});`)
    for (const user of [manager,agent,colleague,suspended,outsider]) await db.query('insert into auth.users values($1)',[user])
    await db.query('insert into organisations values($1),($2)',[org,foreign])
    for (const row of [[org,manager,true,true],[org,agent,false,true],[org,colleague,false,true],[org,suspended,false,false],[foreign,outsider,true,true]]) await db.query('insert into members values($1,$2,$3,$4)',row)
    await db.query('insert into marketing_campaigns values($1,$2,$3),($4,$5,$6)',[campaign,org,agent,otherCampaign,foreign,outsider])
    await db.query("insert into email_subscription_types values($1,$2,'Property updates',true)",[category,org])
    const contact = async (n,{scope=org,owner=agent,type='buyer',stage='New Lead',area='Cape Town',budget=3000000,email=`person${n}@example.test`,phone=`2782000${String(n).padStart(4,'0')}`,domain='agency',emailConsent=true,waConsent=true}={}) => {
      await db.exec('reset role')
      await db.query('insert into contacts values($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),scope,owner,`Person ${n}`,'Test',email,phone,type])
      await db.query('insert into leads values($1,$2,$3,$4,null,$5,$6,$7,$8,$9,$10)',[id(n+1000),scope,id(n),owner,domain,type,stage,stage,budget,area])
      // Real channel tables enforce unique destinations. Duplicate CRM contacts reuse these IDs.
      if (email && !(await db.query('select id from email_marketing_contacts where organisation_id=$1 and email=$2',[scope,email])).rows.length) {
        await db.query("insert into email_marketing_contacts values($1,$2,$3,true,array['investor'])",[id(n+2000),scope,email])
        await db.query('insert into contact_marketing_preferences values($1,$2,$3,null)',[scope,email,emailConsent?'opted_in':'unknown'])
        await db.query("insert into contact_email_subscriptions values($1,$2,$3,'subscribed')",[scope,email,category])
      }
      if (phone && !(await db.query('select id from whatsapp_marketing_contacts where organisation_id=$1 and phone=$2',[scope,phone])).rows.length) await db.query("insert into whatsapp_marketing_contacts values($1,$2,$3,$4,null,now()-interval '1 day')",[id(n+3000),scope,phone,waConsent?'opted_in':'unknown'])
    }
    await contact(20)
    await contact(21,{emailConsent:false,waConsent:false})
    await contact(22,{owner:colleague,area:'London',budget:1000000})
    await contact(23,{stage:'Closed'})
    await contact(24,{domain:'legal'})
    await contact(25,{scope:foreign,owner:outsider})
    await contact(26,{email:'person20@example.test',phone:'27820000020'})
    await contact(27,{type:'seller'})
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261025102447_shared_crm_marketing_audiences.sql',import.meta.url),'utf8'))
    const actAs = async (user,fn,role='authenticated') => { await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)",[user||'']); await db.exec(`set role ${role}`); return fn() }
    const save = async (user,name,d=definition(),visibility='personal') => (await actAs(user,()=>db.query('insert into marketing_audiences(organisation_id,name,definition,visibility) values($1,$2,$3,$4) returning *',[org,name,JSON.stringify(d),visibility]))).rows[0]
    const preview = async (user,d=definition(),options={}) => (await actAs(user,()=>db.query('select marketing_audience_preview($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[options.org||org,options.audience?.id||null,JSON.stringify(d),options.channel||'crm',options.category===undefined?category:options.category,options.offset||0,options.audience?.revision||null,options.hash||null,options.resolve||false]))).rows[0].result
    let shared,personal
    await t.test('validates rules on the server and permits personal or manager-shared definitions',async()=>{
      for (const d of [null,{},definition([]),definition([{field:'sql',operator:'in',values:['x']}]),definition(undefined,{quietDays:'7'}),definition([{field:'area',operator:'in',values:[123]}]),definition([{field:'owner',operator:'in',values:['anything']}]),definition([{field:'budget',operator:'gte',values:['Infinity']}])]) await assert.rejects(save(agent,'Invalid',d),/Complete/)
      personal=await save(agent,'My buyers')
      shared=await save(manager,'Agency buyers',definition(),'agency')
      await assert.rejects(save(agent,'Cannot share',definition(),'agency'),/row-level security/)
      const visible=(await actAs(colleague,()=>db.query('select id from marketing_audiences'))).rows.map(r=>r.id)
      assert.deepEqual(visible,[shared.id])
      await assert.rejects(actAs(manager,()=>db.query("update marketing_audiences set visibility='personal',revision=revision+1 where id=$1",[shared.id]).then(()=>db.query('update marketing_audiences set created_by=$1',[agent]))),/permission denied/)
      // Restore shared state after the permitted first update above.
      await actAs(manager,()=>db.query("update marketing_audiences set visibility='agency',revision=revision+1 where id=$1",[shared.id]))
      shared=(await actAs(manager,()=>db.query('select * from marketing_audiences where id=$1',[shared.id]))).rows[0]
      const update=await actAs(colleague,()=>db.query("update marketing_audiences set name='Stolen',revision=revision+1 where id=$1 returning id",[shared.id]))
      assert.equal(update.rows.length,0)
      const agentShared=await save(agent,'Formerly shared audience')
      await db.exec('reset role')
      await db.query("update marketing_audiences set visibility='agency',revision=revision+1 where id=$1",[agentShared.id])
      await assert.rejects(actAs(manager,()=>db.query("update marketing_audiences set visibility='personal',revision=revision+1 where id=$1",[agentShared.id])),/row-level security/)
    })
    await t.test('live matching respects tenants, visible leads, AND/OR, budget and same-lead context',async()=>{
      let result=await preview(manager)
      assert.equal(result.matched,4) // 20,21,22,26; closed/legal/foreign excluded
      assert.equal(result.emailEligible,2); assert.equal(result.whatsappEligible,2)
      assert.equal((await preview(manager,definition([{field:'area',operator:'in',values:['cape town']},{field:'budget',operator:'gte',values:['2000000']}]))).matched,4) // 20,21,26,27
      assert.equal((await preview(manager,definition([{field:'area',operator:'in',values:['London']},{field:'role',operator:'in',values:['seller']}],{match:'any'}))).matched,2)
      assert.equal((await preview(agent,definition([{field:'owner',operator:'in',values:['me']}]))).matched,4)
      assert.equal((await preview(agent,definition([{field:'area',operator:'in',values:['London']}]))).matched,0)
      await db.exec('reset role')
      await db.query("insert into leads values($1,$2,$3,$4,null,'agency','buyer','New Lead','New Lead',500000,'Cape Town')",[id(1200),org,id(22),colleague])
      result=await preview(manager,definition([{field:'area',operator:'in',values:['Cape Town']},{field:'budget',operator:'gte',values:['900000']},{field:'budget',operator:'lte',values:['1100000']}]))
      assert.equal(result.matched,0) // must not combine area from one lead with budget of another
      assert.equal((await preview(manager,definition([{field:'tags',operator:'in',values:['investor']}]))).matched,5)
    })
    await t.test('eligibility separates channel consent, category, suppression and destination deduplication',async()=>{
      let result=await preview(manager)
      assert.equal(result.rows.find(r=>r.contact_id===id(21)).email_reason,'Email permission not recorded')
      assert.equal(result.rows.find(r=>r.contact_id===id(21)).whatsapp_reason,'WhatsApp permission not recorded')
      assert.equal((await preview(manager,definition(),{category:null})).emailEligible,0)
      assert.equal((await preview(agent)).emailEligible,0)
      await db.exec('reset role')
      await db.query("insert into email_suppressions values($1,'person20@example.test')",[org])
      result=await preview(manager)
      assert.equal(result.emailEligible,1); assert.equal(result.whatsappEligible,2)
      await db.exec('reset role'); await db.query('delete from email_suppressions where organisation_id=$1',[org])
    })
    await t.test('contact warnings exclude real contact during the quiet period, ignoring task notes',async()=>{
      await db.exec('reset role')
      await db.query("insert into lead_activities values($1,$2,'Follow-up','Completed',now())",[org,id(1020)])
      assert.equal((await preview(manager)).recent,0)
      await db.exec('reset role')
      await db.query("insert into lead_activities values($1,$2,'Call','Contacted',now()-interval '2 days')",[org,id(1020)])
      assert.equal((await preview(manager)).recent,2)
      let result=await preview(manager,definition(undefined,{quietDays:7}))
      assert.equal(result.matched,4); assert.equal(result.emailEligible,1) // A duplicate CRM record cannot bypass the contact quiet period
      await db.exec('reset role')
      await db.query("insert into whatsapp_campaign_recipients values($1,'27820000020',now()-interval '1 day')",[org])
      result=await preview(manager,definition(undefined,{quietDays:7}))
      assert.equal(result.recent,2); assert.equal(result.emailEligible,1); assert.equal(result.whatsappEligible,1)
    })
    await t.test('review hashes and revisions prevent silent expansion or stale recipient handoffs',async()=>{
      let result=await preview(manager,null,{audience:shared,channel:'email'})
      const selection=await preview(manager,null,{audience:shared,channel:'email',hash:result.reviewHash,resolve:true})
      assert.equal(selection.recipientIds.length,2)
      assert.equal(selection.audienceId,shared.id)
      await contact(28)
      await assert.rejects(preview(manager,null,{audience:shared,channel:'email',hash:result.reviewHash,resolve:true}),/membership or eligibility changed/)
      result=await preview(manager,null,{audience:shared,channel:'email'})
      await actAs(manager,()=>db.query('update marketing_audiences set name=$1,revision=revision+1 where id=$2',['Updated buyers',shared.id]))
      await assert.rejects(preview(manager,null,{audience:shared,channel:'email',hash:result.reviewHash,resolve:true}),/audience changed/)
      shared=(await actAs(manager,()=>db.query('select * from marketing_audiences where id=$1',[shared.id]))).rows[0]
      const fresh=await actAs(manager,()=>db.query("select marketing_audience_preview($1,$2,null,'email',$3) result",[org,shared.id,category]))
      assert.equal(fresh.rows[0].result.audience.revision,shared.revision)
      assert.equal(fresh.rows[0].result.audience.name,'Updated buyers')
      const empty=await save(manager,'No matches',definition([{field:'area',operator:'in',values:['Nowhere']}]))
      const emptyPreview=await preview(manager,null,{audience:empty,channel:'email'})
      await assert.rejects(preview(manager,null,{audience:empty,channel:'email',hash:emptyPreview.reviewHash,resolve:true}),/no eligible recipients/)
    })
    await t.test('campaign links retain campaign and audience visibility and forbid identity changes',async()=>{
      await actAs(agent,()=>db.query('insert into marketing_campaign_audiences(organisation_id,campaign_id,audience_id) values($1,$2,$3)',[org,campaign,personal.id]))
      assert.equal((await actAs(colleague,()=>db.query('select * from marketing_campaign_audiences'))).rows.length,0)
      await actAs(agent,()=>db.query('update marketing_campaign_audiences set audience_id=$1 where campaign_id=$2',[shared.id,campaign]))
      assert.equal((await actAs(colleague,()=>db.query('select * from marketing_campaign_audiences'))).rows.length,1)
      await assert.rejects(actAs(colleague,()=>db.query('update marketing_campaign_audiences set campaign_id=$1',[otherCampaign])),/permission denied/)
      await assert.rejects(actAs(manager,()=>db.query('insert into marketing_campaign_audiences(organisation_id,campaign_id,audience_id) values($1,$2,$3)',[org,otherCampaign,shared.id])),/row-level security|foreign key/)
    })
    await t.test('outsiders, suspended members and anonymous clients cannot read or preview',async()=>{
      for (const user of [outsider,suspended]) {
        assert.equal((await actAs(user,()=>db.query('select * from marketing_audiences'))).rows.length,0)
        await assert.rejects(preview(user),/active agency/)
      }
      await assert.rejects(preview(manager,definition(),{org:foreign}),/active agency/)
      await assert.rejects(actAs(null,()=>db.query('select * from marketing_audiences'),'anon'),/permission denied/)
      await assert.rejects(actAs(null,()=>db.query('select marketing_audience_preview($1)',[org]),'anon'),/permission denied/)
    })
    await t.test('large WhatsApp selections fail without truncation; pages are bounded',async()=>{
      await db.exec('reset role')
      await db.query(`insert into contacts select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'Bulk',n::text,null,'447700'||lpad(n::text,6,'0'),'bulk' from generate_series(10000,10500) n`,[org,agent])
      await db.query(`insert into whatsapp_marketing_contacts select gen_random_uuid(),organisation_id,phone,'opted_in',null,now()-interval '1 day' from contacts where contact_type='bulk'`)
      const large=await save(manager,'Large selection',definition([{field:'role',operator:'in',values:['bulk']}]))
      const result=await preview(manager,null,{audience:large,channel:'whatsapp'})
      assert.equal(result.matched,501); assert.equal(result.whatsappEligible,501); assert.equal(result.rows.length,25)
      await assert.rejects(preview(manager,null,{audience:large,channel:'whatsapp',hash:result.reviewHash,resolve:true}),/exceeds the channel review limit/)
    })
  } finally { await db.close() }
})
