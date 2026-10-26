import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org=id(1), foreign=id(2), owner=id(3), manager=id(4), colleague=id(5), outsider=id(6), campaign=id(10), otherCampaign=id(11), intake=id(20), foreignIntake=id(21)
const migration = '../../supabase/migrations/20261025205056_campaign_business_responses.sql'

test('attributed business responses retain agency boundaries, consent, ownership and atomic retry-safe follow-up', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant execute on function auth.uid() to authenticated,anon,service_role;
      create table organisations(id uuid primary key);
      create table organisation_users(organisation_id uuid,user_id uuid,status text,manager boolean);
      create function bridge_is_active_member(o uuid) returns boolean language sql stable as $$select exists(select 1 from public.organisation_users where organisation_id=o and user_id=auth.uid() and status='active')$$;
      create function email_campaign_can_send(o uuid) returns boolean language sql stable as $$select exists(select 1 from public.organisation_users where organisation_id=o and user_id=auth.uid() and status='active' and manager)$$;
      create function bridge_set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
      create table marketing_campaigns(id uuid primary key,organisation_id uuid,created_by uuid,revision integer,campaign_builder jsonb,listing_builder jsonb,unique(id,organisation_id));
      create table agency_public_intake_links(id uuid primary key,organisation_id uuid,slug text,status text,disabled_at timestamptz,metadata_json jsonb default '{}',default_assigned_agent_id uuid,default_branch_id uuid,enabled_intents text[],privacy_policy_version text,unique(id,organisation_id));
      create table contacts(contact_id uuid primary key,organisation_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,contact_type text,created_at timestamptz default now(),updated_at timestamptz default now());
      create table leads(lead_id uuid primary key,organisation_id uuid,branch_id uuid,assigned_agent_id uuid,assigned_user_id uuid,contact_id uuid,lead_domain text,lead_category text,lead_direction text,lead_source text,source_channel text,campaign_code text,stage text,status text,priority text,budget numeric,area_interest text,property_interest text,seller_property_address text,estimated_value numeric,source_reference_id text,raw_enquiry_payload jsonb,notes text,updated_at timestamptz default now(),unique(lead_id,organisation_id));
      create table lead_requirements(requirement_id uuid primary key default gen_random_uuid(),organisation_id uuid,lead_id uuid,contact_id uuid,title text,intent_type text,property_types text[],areas text[],budget_min numeric,budget_max numeric,consent_to_receive_matches boolean,status text,is_primary boolean);
      create table tasks(task_id uuid primary key,organisation_id uuid,lead_id uuid,assigned_agent_id uuid,created_by uuid,title text,description text,due_date date,status text,priority text,metadata jsonb,updated_at timestamptz default now());
      create table lead_activities(activity_id uuid primary key default gen_random_uuid(),organisation_id uuid,lead_id uuid,agent_id uuid,activity_type text,activity_note text,activity_date timestamptz default now(),outcome text);
      create table email_marketing_contacts(id uuid primary key,organisation_id uuid,email text,status text);
      grant select on organisation_users,marketing_campaigns,agency_public_intake_links,leads to authenticated;
      alter table marketing_campaigns enable row level security;
      create policy campaigns_read on marketing_campaigns for select to authenticated using(bridge_is_active_member(organisation_id));
      grant update on marketing_campaigns to authenticated;
      create policy campaigns_edit on marketing_campaigns for update to authenticated using(bridge_is_active_member(organisation_id) and (created_by=auth.uid() or email_campaign_can_send(organisation_id)));
    `)
    await db.exec(readFileSync(new URL('../../supabase/migrations/202607290003_agency_public_intake_submissions_phase2.sql',import.meta.url),'utf8').replace('create extension if not exists "pgcrypto";',''))
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261025100749_campaign_enquiries_follow_up.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL(migration,import.meta.url),'utf8'))
    await db.exec('grant all on all tables in schema public to service_role')
    for (const user of [owner,manager,colleague,outsider]) await db.query('insert into auth.users values($1)',[user])
    await db.query('insert into organisations values($1),($2)',[org,foreign])
    for (const row of [[org,owner,'active',false],[org,manager,'active',true],[org,colleague,'active',false],[foreign,outsider,'active',true]]) await db.query('insert into organisation_users values($1,$2,$3,$4)',row)
    await db.query('insert into marketing_campaigns values($1,$2,$3,1,null,null),($4,$5,$6,1,null,null)',[campaign,org,owner,otherCampaign,foreign,outsider])
    await db.query("insert into agency_public_intake_links(id,organisation_id,slug,status,enabled_intents,privacy_policy_version) values($1,$2,'agency','active',array['buy','sell'],'privacy-v1'),($3,$4,'foreign','active',array['buy','sell'],'privacy-v1')",[intake,org,foreignIntake,foreign])
    await db.query("insert into email_marketing_contacts values($1,$2,'buyer@example.test','unsubscribed')",[id(99),org])
    const role = async (user, name='authenticated') => { await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[user || '']);await db.exec(`set role ${name}`) }
    const create = async (user,purpose='valuation',revision=1,targetIntake=intake,targetOrg=org,targetCampaign=campaign) => { await role(user);return (await db.query('select marketing_campaign_create_response_link($1,$2,$3,$4,$5,1) result',[targetOrg,targetCampaign,revision,targetIntake,purpose])).rows[0].result }
    const payload = (patch={}) => ({intent:'sell',idempotencyKey:'response-request-000001',contactName:'Avery Seller',contactEmail:'avery@example.test',contactPhone:'+27820000000',privacyConsent:true,privacyVersion:'privacy-v1',emailMarketingConsent:false,marketingConsentVersion:null,budgetMin:null,budgetMax:null,area:'Brooklyn',propertyType:'House',propertyAddress:'10 Example Road',estimatedValue:2500000,message:'Please arrange a valuation.',...patch})
    const accept = async (link,data=payload(),slug='agency',ip=null) => { await role(null,'service_role');return (await db.query('select marketing_campaign_accept_response($1,$2,$3,$4) result',[link.token,slug,JSON.stringify(data),ip])).rows[0].result }
    const count = async (table) => { await db.exec('reset role');return Number((await db.query(`select count(*) n from ${table}`)).rows[0].n) }
    let valuation
    await t.test('only current campaign owner/manager creates valid links in the same agency',async()=>{
      valuation=await create(owner)
      assert.equal((await create(owner)).token,valuation.token)
      assert.equal(valuation.assigned_user_id,owner)
      await create(manager,'seller')
      await assert.rejects(create(colleague),/Reload the current campaign/)
      await assert.rejects(create(owner,'valuation',2),/Reload the current campaign/)
      await assert.rejects(create(owner,'valuation',1,foreignIntake),/active public intake/)
      await assert.rejects(create(owner,'valuation',1,intake,foreign,otherCampaign),/Reload the current campaign/)
      await role(null,'anon');await assert.rejects(db.query("select marketing_campaign_create_response_link($1,$2,1,$3,'valuation',1)",[org,campaign,intake]),/permission denied/)
      await role(owner);await assert.rejects(db.query('select marketing_campaign_accept_response($1,$2,$3,null)',[valuation.token,'agency',JSON.stringify(payload())]),/permission denied/)
    })
    await t.test('one public response atomically creates CRM, enquiry, task, receipt and separate consent',async()=>{
      assert.deepEqual(await accept(valuation),{accepted:true,duplicate:false,followUpPrepared:true,marketingConsentRecorded:false})
      for(const table of ['contacts','leads','marketing_campaign_enquiries','tasks','lead_activities','agency_public_intake_submissions','marketing_campaign_response_receipts']) assert.equal(await count(table),1,table)
      const task=(await db.query('select * from tasks')).rows[0]
      assert.equal(task.assigned_agent_id,owner)
      assert.equal(task.title,'Arrange a requested valuation')
      const receipt=(await db.query('select * from marketing_campaign_response_receipts')).rows[0]
      assert.equal(receipt.email_marketing_consent,false)
      assert.equal(receipt.marketing_consent_version,null)
      assert.equal((await db.query('select channel from marketing_campaign_enquiries')).rows[0].channel,'form')
      const origin=(await db.query('select source_kind,created_by from marketing_campaign_enquiries')).rows[0]
      assert.equal(origin.source_kind,'public_form')
      assert.equal(origin.created_by,null)
      assert.equal(task.created_by,null)
      assert.equal((await db.query('select agent_id from lead_activities')).rows[0].agent_id,null)
      assert.equal((await db.query('select seller_property_address from leads')).rows[0].seller_property_address,'10 Example Road')
    })
    await t.test('retries return the same result without duplicate work and changed request intent is rejected',async()=>{
      assert.equal((await accept(valuation)).duplicate,true)
      assert.equal(await count('tasks'),1)
      await assert.rejects(accept(valuation,payload({message:'Changed after save'})),/already saved with different details/)
      assert.equal(await count('contacts'),1)
      assert.equal(await count('tasks'),1)
    })
    await t.test('links survive later campaign revisions but revocation and inactive agency routing stop new responses',async()=>{
      await db.exec('reset role');await db.query('update marketing_campaigns set revision=2 where id=$1',[campaign])
      assert.equal((await accept(valuation,payload({idempotencyKey:'response-request-000002'}))).accepted,true)
      await role(owner);await db.query('update marketing_campaign_response_links set disabled_at=now() where id=$1',[valuation.id])
      await assert.rejects(accept(valuation,payload({idempotencyKey:'response-request-000003'})),/unavailable/)
      await role(owner);await assert.rejects(db.query('update marketing_campaign_response_links set disabled_at=null where id=$1',[valuation.id]),/row-level security/)
      const fresh=await create(owner,'valuation',2)
      assert.notEqual(fresh.token,valuation.token)
      await db.exec('reset role');await db.query("update organisation_users set status='suspended' where user_id=$1",[owner])
      await assert.rejects(accept(fresh),/unavailable/)
      await db.exec('reset role');await db.query("update organisation_users set status='active' where user_id=$1",[owner])
    })
    await t.test('buyer enquiry saves actual requirements without inferring future match permission',async()=>{
      const buyer=await create(owner,'buyer',2)
      await accept(buyer,payload({intent:'buy',idempotencyKey:'buyer-response-000001',contactEmail:'buyer@example.test',budgetMin:1500000,budgetMax:2500000,emailMarketingConsent:true,marketingConsentVersion:'campaign-email-marketing-v1'}))
      await db.exec('reset role')
      const requirement=(await db.query('select * from lead_requirements')).rows[0]
      assert.equal(requirement.consent_to_receive_matches,false)
      assert.deepEqual(requirement.areas,['Brooklyn'])
      assert.equal(Number(requirement.budget_max),2500000)
      const receipt=(await db.query('select * from marketing_campaign_response_receipts where email_marketing_consent')).rows[0]
      assert.equal(receipt.marketing_consent_version,'campaign-email-marketing-v1')
      assert.equal((await db.query('select status from email_marketing_contacts where id=$1',[id(99)])).rows[0].status,'unsubscribed')
      assert.equal(await count('email_marketing_contacts'),1)
      await assert.rejects(accept(buyer,payload({intent:'sell',idempotencyKey:'wrong-intent-0000001'})),/supported by this campaign/)
    })
    await t.test('reused CRM leads retain their existing active owner and one campaign association',async()=>{
      const referral=await create(owner,'referral',2)
      await db.exec('reset role');await db.query('update leads set assigned_agent_id=$1,assigned_user_id=$1 where lead_category=$2',[colleague,'seller'])
      const before=await count('leads')
      await accept(referral,payload({idempotencyKey:'referral-request-00001'}))
      assert.equal(await count('leads'),before)
      const task=(await db.query("select assigned_agent_id from tasks where title='Follow up on the personal introduction'")).rows[0]
      assert.equal(task.assigned_agent_id,colleague)
      assert.equal(await count('marketing_campaign_enquiries'),2)
    })
    await t.test('cross-agency slug, missing privacy and downstream write failure never leave partial CRM work',async()=>{
      const link=await create(owner,'seller',2)
      await assert.rejects(accept(link,payload({idempotencyKey:'foreign-slug-request1'}),'foreign'),/unavailable/)
      await assert.rejects(accept(link,payload({privacyConsent:false,idempotencyKey:'missing-consent-00001'})),/privacy consent/)
      const before=await count('contacts'), tasks=await count('tasks')
      await db.exec('reset role;revoke insert on tasks from service_role')
      await assert.rejects(accept(link,payload({contactEmail:'rollback@example.test',idempotencyKey:'rollback-request-00001'})),/permission denied/)
      assert.equal(await count('contacts'),before)
      assert.equal(await count('tasks'),tasks)
      await db.exec('grant insert on tasks to service_role')
    })
    await t.test('response receipts and tokens remain private to owner/manager; no public CRM reads',async()=>{
      await role(colleague)
      assert.equal((await db.query('select * from marketing_campaign_response_receipts')).rows.length,0)
      assert.equal((await db.query('select * from marketing_campaign_response_links')).rows.length,0)
      await role(manager)
      assert.ok((await db.query('select * from marketing_campaign_response_receipts')).rows.length>0)
      await role(null,'anon');await assert.rejects(db.query('select * from marketing_campaign_response_links'),/permission denied/)
    })
    await t.test('authenticated callers cannot forge public origins; bounded IP rate limits allow exact retries',async()=>{
      await role(owner)
      await assert.rejects(db.query("insert into marketing_campaign_enquiries(organisation_id,campaign_id,lead_id,channel,responded_at,created_by,source_kind) select $1,$2,lead_id,'form',now(),null,'public_form' from leads limit 1",[org,campaign]),/permission denied/)
      const link=await create(owner,'seller',2), ip='a'.repeat(64)
      for(let n=0;n<5;n++) await accept(link,payload({contactEmail:'rate@example.test',idempotencyKey:`rate-response-request-${n}`}), 'agency', ip)
      await assert.rejects(accept(link,payload({contactEmail:'rate@example.test',idempotencyKey:'rate-response-request-6'}),'agency',ip),/Too many/)
      assert.equal((await accept(link,payload({contactEmail:'rate@example.test',idempotencyKey:'rate-response-request-0'}),'agency',ip)).duplicate,true)
    })
  } finally { await db.close() }
})
