import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const org = randomUUID(), otherOrg = randomUUID(), owner = randomUUID(), agent = randomUUID(), outsider = randomUUID()
const contactA = randomUUID(), contactB = randomUUID(), leadA = randomUUID(), leadB = randomUUID()
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const asActor = async (id, sql, params = [], role = 'authenticated') => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || ''])
  await db.exec(`set role ${role}`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const profileFor = async (kind, id) => one('select c.* from agency_client_profiles c join agency_client_links l on l.client_id=c.id where l.source_kind=$1 and l.source_id=$2', [kind, id])

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema journey_private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table profiles(id uuid primary key,first_name text,last_name text);
    create table organisations(id uuid primary key,type text);
    create table organisation_users(id uuid primary key,user_id uuid,organisation_id uuid,workspace_role text,membership_status text,status text);
    create table contacts(contact_id uuid primary key,organisation_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,created_at timestamptz default now(),is_demo_data boolean default false);
    create table leads(lead_id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,contact_id uuid,stage text,status text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table buyers(id uuid primary key,organisation_id uuid,name text,email text,phone text,created_at timestamptz default now(),is_demo_data boolean default false);
    create table canvassing_prospects(id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,created_at timestamptz default now());
    create table transactions(id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,owner_user_id uuid,buyer_id uuid,seller_name text,seller_email text,seller_phone text,status text,created_at timestamptz default now());
    create table private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid,seller_lead_id text,seller_canonical_facts_json jsonb,created_at timestamptz default now());
    create table private_listing_seller_onboarding(id uuid default gen_random_uuid(),private_listing_id uuid primary key,form_data jsonb,canonical_facts_json jsonb,submitted_at timestamptz,seller_portal_last_login_at timestamptz,created_at timestamptz default now());
    create table lead_activities(activity_id uuid primary key,organisation_id uuid,lead_id uuid,agent_id uuid,activity_type text,activity_note text,outcome text,activity_date timestamptz,created_at timestamptz default now(),is_demo_data boolean default false);
    create table tasks(task_id uuid primary key,organisation_id uuid,lead_id uuid,transaction_id uuid,title text,status text,created_at timestamptz default now());
    create table appointments(appointment_id uuid primary key,organisation_id uuid,lead_id uuid,contact_id uuid,transaction_id uuid,listing_id text,title text,status text,date_time timestamptz,created_at timestamptz default now());
    create table appointment_participants(participant_id uuid primary key,appointment_id uuid,organisation_id uuid,email text,participant_role text,rsvp_status text,responded_at timestamptz,created_at timestamptz default now());
    create table offers(id uuid primary key,organisation_id uuid,buyer_lead_id uuid,seller_lead_id uuid,buyer_contact_id uuid,seller_contact_id uuid,status text,buyer_viewed_at timestamptz,buyer_submitted_at timestamptz,seller_viewed_at timestamptz,created_at timestamptz default now());
    create table transaction_events(id uuid primary key,transaction_id uuid,event_type text,event_data jsonb,visibility_scope text,created_at timestamptz default now());
    create table transaction_comments(id uuid primary key,transaction_id uuid,comment_text text,visibility_scope text,created_at timestamptz default now());
    create table documents(id uuid primary key,transaction_id uuid,name text,status text,file_path text,visibility_scope text,created_at timestamptz default now());
    create table private_listing_activity(id uuid primary key,private_listing_id uuid,activity_title text,activity_description text,created_at timestamptz default now());
    create table buyer_viewing_preference_links(id uuid primary key,organisation_id uuid,lead_id uuid,submitted_at timestamptz,token_hash text,created_at timestamptz default now());
    create table seller_viewing_coordination_links(id uuid primary key,organisation_id uuid,lead_id uuid,submitted_at timestamptz,token_hash text,created_at timestamptz default now());
    create table client_issues(id uuid primary key,transaction_id uuid,status text,client_confirmed_at timestamptz,created_at timestamptz default now());
    create table alteration_requests(id uuid primary key,transaction_id uuid,status text,created_at timestamptz default now());
    create table service_reviews(id uuid primary key,transaction_id uuid,rating integer,created_at timestamptz default now());
    create table transaction_handover(id uuid primary key,transaction_id uuid,status text,signature_signed_at timestamptz,created_at timestamptz default now());
    create table transaction_onboarding(id uuid primary key,transaction_id uuid,submitted_at timestamptz,created_at timestamptz default now());
    create table transaction_bond_applications(id uuid primary key,transaction_id uuid,status text,created_at timestamptz default now());
    create table client_portal_notifications(id uuid primary key,transaction_id uuid,client_role text,read_at timestamptz,dismissed_at timestamptz,created_at timestamptz default now());
    create table private_listing_documents(id uuid primary key,private_listing_id uuid,document_name text,status text,storage_path text,created_at timestamptz default now());
    create table client_portal_links(id uuid primary key,transaction_id uuid,buyer_id uuid,token text,is_active boolean,expires_at timestamptz);
    create table test_seller_sessions(token text,access_token text,listing_id uuid,transaction_id uuid,is_active boolean);
    create function journey_private.resolve_seller_portal_context(p_token text,p_access text) returns table(listing_id uuid,transaction_id uuid) language plpgsql security definer set search_path='' as $$
      begin return query select s.listing_id,s.transaction_id from public.test_seller_sessions s where s.token=p_token and s.access_token=p_access and s.is_active; if not found then raise exception 'Seller portal access required.' using errcode='42501'; end if; end; $$;
    create function bridge_client_portal_request_token() returns text language sql stable as $$ select nullif(current_setting('request.portal.token',true),'') $$;
    create function bridge_has_client_portal_token_transaction_access(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from client_portal_links where token=bridge_client_portal_request_token() and transaction_id=p_id and is_active and (expires_at is null or expires_at>now())); $$;
    create function bridge_agency_open_operations(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from organisation_users where organisation_id=p_org and user_id=auth.uid() and workspace_role in ('owner','principal') and membership_status='active'); $$;
    create function bridge_agency_record_scope(p_org uuid,p_user uuid,p_agent uuid default null,p_owner uuid default null) returns boolean language sql stable security definer set search_path=public as $$
      select bridge_agency_open_operations(p_org) or exists(select 1 from organisation_users where organisation_id=p_org and user_id=auth.uid() and membership_status='active' and coalesce(p_user,p_agent,p_owner) in (user_id,id)); $$;
    grant select on all tables in schema public to authenticated;
    alter table documents enable row level security;
    create policy document_fixture_read on documents for select to authenticated using (visibility_scope='shared_role_players');
    alter table transaction_comments enable row level security;
    create policy comment_fixture_read on transaction_comments for select to authenticated using (visibility_scope='shared_role_players');
    alter table transaction_events enable row level security;
    create policy event_fixture_read on transaction_events for select to authenticated using (visibility_scope='shared_role_players');
  `)
  await db.query('insert into organisations values ($1,$2),($3,$2)', [org, 'agency', otherOrg])
  for (const [id, agencyId, role] of [[owner,org,'owner'],[agent,org,'agent'],[outsider,otherOrg,'owner']]) {
    await db.query('insert into organisation_users values ($1,$2,$3,$4,$5,$5)', [randomUUID(),id,agencyId,role,'active'])
    await db.query('insert into profiles values ($1,$2,$3)', [id,role,'Test'])
  }
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5),($6,$2,$3,$4,$7)', [contactA,org,agent,'Taylor','a@example.test',contactB,'b@example.test'])
  await db.query("insert into leads(lead_id,organisation_id,assigned_user_id,contact_id,stage,created_at) values ($1,$2,$3,$4,'New','2025-10-01'),($5,$2,$3,$6,'New','2025-11-01')", [leadA,org,agent,contactA,leadB,contactB])
  const originalActivity = randomUUID()
  await db.query("insert into lead_activities(activity_id,organisation_id,lead_id,activity_type,activity_note,activity_date) values ($1,$2,$3,'Call','Earlier call','2025-10-02')", [originalActivity,org,leadA])
  await db.exec(await readFile(new URL('../../supabase/migrations/20261009113042_agency_client_identity_and_reviewed_merge.sql', import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261009121124_agency_client_activity_timeline.sql', import.meta.url),'utf8'))
  await db.exec(`
    alter table leads add column source_channel text, add column campaign_code text, add column raw_enquiry_payload jsonb, add column source_received_at timestamptz, add column is_demo_data boolean default false, add column demo_metadata jsonb;
    create table agency_public_intake_submissions(id uuid primary key,organisation_id uuid,lead_id uuid,status text,utm_json jsonb,source_channel text,campaign_code text,request_metadata_json jsonb,created_at timestamptz default now());
    create table website_lead_submissions(id uuid primary key,organisation_id uuid,lead_id uuid,status text,attribution_json jsonb,created_at timestamptz default now());
  `)
  await db.query('update leads set source_channel=$1,raw_enquiry_payload=$2 where lead_id=$3',['website',JSON.stringify({utm:{utm_source:'facebook',utm_medium:'paid_social',utm_campaign:'lyle-launch'},context:{pageUrl:'https://thelyle.co.za/?token=secret',referrer:'https://facebook.com/?email=secret'}}),leadA])
  await db.query('update leads set raw_enquiry_payload=$1 where lead_id=$2',[JSON.stringify({attribution:{utmSource:'google',utmMedium:'cpc',utmCampaign:'harbour-launch'}}),leadB])
  await db.exec(await readFile(new URL('../../supabase/migrations/20261009131638_agency_client_utm_attribution.sql', import.meta.url),'utf8'))
  const foundation = await readFile(new URL('../../supabase/migrations/20260909113000_email_campaigns_foundation.sql', import.meta.url),'utf8')
  await db.exec(`
    create table auth.users(id uuid primary key);
    create table email_sender_identities(id uuid primary key);
    create table email_subscription_types(id uuid primary key);
    create table email_marketing_contacts(id uuid primary key);
    create function bridge_has_organisation_membership(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select arch9_client_private.is_member(p_org) $$;
    create function email_campaign_can_send(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.bridge_agency_open_operations(p_org) $$;
  `)
  for (const id of [owner,agent,outsider]) await db.query('insert into auth.users values($1)',[id])
  for (const name of ['email_campaigns','email_campaign_recipients','email_events']) {
    const start = foundation.indexOf(`create table if not exists public.${name} (`)
    await db.exec(foundation.slice(start,foundation.indexOf('\n);',start)+4))
    await db.exec(`alter table ${name} enable row level security; grant select on ${name} to authenticated;`)
    const policyStart = foundation.indexOf(`create policy ${name}_member `)
    await db.exec(foundation.slice(policyStart,foundation.indexOf(';',policyStart)+1))
  }
  let a = await profileFor('contact',contactA), b = await profileFor('contact',contactB)
  const campaign = randomUUID(), hiddenCampaign = randomUUID(), otherCampaign = randomUUID()
  const recipient = randomUUID(), aliasRecipient = randomUUID(), hiddenRecipient = randomUUID(), otherRecipient = randomUUID(), lateRecipient = randomUUID(), queuedRecipient = randomUUID()
  for (const [id,agencyId,creator,name] of [[campaign,org,owner,'The Lyle launch'],[hiddenCampaign,org,owner,'Principal only'],[otherCampaign,otherOrg,outsider,'Other agency']]) {
    await db.query("insert into email_campaigns(id,organisation_id,name,subject,created_by,status,html) values($1,$2,$3,'Launch news',$4,'sent','secret body')",[id,agencyId,name,creator])
  }
  const addRecipient = async (id,camp,email,agencyId=org,sent=true) => db.query("insert into email_campaign_recipients(id,organisation_id,campaign_id,email,status,sent_at,created_at) values($1,$2,$3,$4,$5,$6,'2026-10-01')",[id,agencyId,camp,email,sent?'sent':'queued',sent?'2026-10-02T10:00:00Z':null])
  await addRecipient(recipient,campaign,'a@example.test')
  await addRecipient(aliasRecipient,campaign,'b@example.test')
  await addRecipient(hiddenRecipient,hiddenCampaign,'a@example.test')
  await addRecipient(otherRecipient,otherCampaign,'a@example.test',otherOrg)
  await addRecipient(lateRecipient,hiddenCampaign,'later@example.test')
  await addRecipient(queuedRecipient,hiddenCampaign,'b@example.test',org,false)
  const event = async (rid,type,at,agencyId=org,camp=campaign,key=randomUUID()) => db.query("insert into email_events(id,organisation_id,campaign_id,recipient_id,provider_event_id,event_type,occurred_at,payload,url) values($1,$2,$3,$4,$5,$6,$7,'{\"token\":\"secret\"}','https://example.test/?secret=token')",[randomUUID(),agencyId,camp,rid,key,type,at])
  await event(recipient,'opened','2026-10-02T11:00:00Z')
  await event(recipient,'clicked','2026-10-02T11:01:00Z')
  await db.exec(await readFile(new URL('../../supabase/migrations/20261009135332_agency_client_campaign_engagement.sql', import.meta.url),'utf8'))
  const page = async (id,actor=owner,cursor=null,limit=101) => (await asActor(actor,'select * from agency_client_campaign_page($1,$2,$3,$4)',[id,cursor?.created_at||null,cursor?.id||null,limit])).rows
  const summary = async (id,actor=owner) => (await asActor(actor,'select agency_client_campaign_summary($1) value',[id])).rows[0].value
  const timeline = async (id,actor=owner) => (await asActor(actor,'select * from agency_client_activity_page($1)',[id])).rows.filter(e=>e.event_type.startsWith('campaign.'))
  const respond = async (id,rid,request,actor=owner,detail='Replied about launch availability',at='2026-10-03T10:00:00Z') => asActor(actor,'select agency_client_log_campaign_response($1,$2,$3,$4,$5,$6) value',[id,rid,request,'email_reply',detail,at])
  const demoRecipient=randomUUID()
  await db.query("insert into email_campaign_recipients(id,organisation_id,campaign_id,email,status,sent_at,recipient_snapshot) values($1,$2,$3,'later@example.test','sent','2026-10-02','{\"is_demo_data\":true}')",[demoRecipient,org,campaign])
  assert.equal((await one('select count(*) as total from agency_client_campaign_recipients where recipient_id=$1',[demoRecipient])).total,0)
  const liveCampaign=randomUUID(), liveRecipient=randomUUID()
  await db.query("insert into email_campaigns(id,organisation_id,name,subject,created_by,status) values($1,$2,'Live campaign','New event',$3,'sent')",[liveCampaign,org,owner])
  await addRecipient(liveRecipient,liveCampaign,'a@example.test')
  assert.ok((await timeline(a.id)).some(e=>e.origin_id===liveRecipient && e.actor_kind==='system' && !e.historical),'New recipient telemetry enters the live activity journal')
  await db.query('delete from email_campaigns where id=$1',[liveCampaign])
  assert.equal((await page(a.id)).length,2)
  assert.equal((await summary(a.id)).campaignCount,2)
  assert.equal((await summary(a.id)).openedCount,1)
  assert.equal((await summary(a.id)).respondedCount,0,'Open/click evidence never implies a response')
  const row = (await page(a.id)).find(r=>r.id===recipient)
  assert.equal(row.open_count,1); assert.equal(row.click_count,1)
  for (const field of ['tracking_token','provider_message_id','payload','url','html','recipient_snapshot']) assert.equal(field in row,false)
  assert.ok((await timeline(a.id)).every(e=>e.historical && e.actor_kind==='historical'))
  assert.equal((await page(a.id,agent)).length,0,'Campaign permissions survive client profile access')
  assert.equal((await timeline(a.id,agent)).length,0,'Private campaign names never leak through activity')
  assert.equal(await summary(a.id,outsider),null)
  assert.equal((await page(a.id,outsider)).length,0)
  await assert.rejects(asActor(null,'select * from agency_client_campaign_page($1)',[a.id],'anon'),/permission denied/)
  await assert.rejects(asActor(owner,'insert into agency_client_campaign_responses(detail) values($1)',['Forged']),/permission denied/)
  await assert.rejects(asActor(owner,'update agency_client_campaign_recipients set client_id=$1',[b.id]),/permission denied/)
  await assert.rejects(asActor(owner,'delete from agency_client_campaign_responses'),/permission denied/)
  await assert.rejects(asActor(owner,'select arch9_client_private.capture_client_campaign($1)',[recipient]),/permission denied/)
  await assert.rejects(respond(a.id,recipient,randomUUID(),agent),/access required/)
  await assert.rejects(respond(b.id,recipient,randomUUID()),/access required/)
  await assert.rejects(respond(a.id,otherRecipient,randomUUID()),/access required/)
  await assert.rejects(respond(b.id,queuedRecipient,randomUUID()),/after this campaign was sent/)
  await assert.rejects(respond(a.id,recipient,randomUUID(),owner,'','2026-10-03'),/confirmed response/)
  await assert.rejects(respond(a.id,recipient,randomUUID(),owner,'Before send','2026-10-01'),/after this campaign was sent/)
  await assert.rejects(respond(a.id,recipient,randomUUID(),owner,'Future','2099-10-01'),/after this campaign was sent/)
  const request = randomUUID()
  const response = (await respond(a.id,recipient,request)).rows[0].value
  assert.equal((await respond(a.id,recipient,request)).rows[0].value,response)
  await assert.rejects(respond(a.id,recipient,request,owner,'Different response'),/another response/)
  assert.equal((await summary(a.id)).respondedCount,1)
  assert.equal((await page(a.id)).find(r=>r.id===recipient).responses[0].evidence_kind,'staff_confirmed')
  assert.equal((await timeline(a.id)).filter(e=>e.event_type==='campaign.response').length,1)
  const beforeCount=(await timeline(a.id)).length
  await event(recipient,'opened','2026-10-02T12:00:00Z')
  await db.query('update email_campaign_recipients set updated_at=now() where id=$1',[recipient])
  assert.equal((await timeline(a.id)).length,beforeCount,'Repeated telemetry and no-op saves do not flood the timeline')
  assert.equal((await page(a.id)).find(r=>r.id===recipient).open_count,2)
  const providerId=randomUUID(); await event(recipient,'delivered','2026-10-02T10:01:00Z',org,campaign,providerId)
  await assert.rejects(event(recipient,'delivered','2026-10-02T10:01:00Z',org,campaign,providerId),/unique constraint/)
  assert.equal(new Date((await page(a.id)).find(r=>r.id===recipient).delivered_at).toISOString(),'2026-10-02T10:01:00.000Z','Delayed provider events preserve occurrence time')
  await event(recipient,'opened','2026-10-02T10:30:00Z',otherOrg,otherCampaign)
  assert.equal((await page(a.id)).find(r=>r.id===recipient).open_count,2,'Foreign-agency recipient events are excluded')
  await asActor(owner,'select agency_client_update($1,$2,$3,$4,$5)',[a.id,a.version,a.name,['a@example.test','later@example.test'],[]])
  a = await profileFor('contact',contactA)
  assert.equal((await page(a.id)).length,3,'Adding a reviewed email alias hydrates earlier recipient history')
  await db.query('update email_campaigns set created_by=$1 where id=$2',[agent,hiddenCampaign])
  assert.equal((await page(a.id,agent)).length,2,'An assigned agent sees campaigns their campaign RLS allows')
  const agentRequest=randomUUID()
  await respond(a.id,lateRecipient,agentRequest,agent)
  assert.equal((await page(a.id,agent)).find(r=>r.id===lateRecipient).response_count,1)
  a=await profileFor('contact',contactA); b=await profileFor('contact',contactB)
  await asActor(owner,'select agency_client_merge($1,$2,$3,$4,$5)',[a.id,b.id,a.version,b.version,'Confirmed both email addresses belong to Taylor'])
  assert.equal((await page(a.id)).length,5)
  assert.deepEqual(await page(b.id),await page(a.id),'Old profile links resolve to the same merged history')
  assert.equal((await summary(a.id)).respondedCount,2,'Confirmed responses count campaigns rather than aliases')
  assert.equal((await respond(b.id,recipient,request)).rows[0].value,response,'Idempotent retry survives a reviewed merge')
  await respond(b.id,aliasRecipient,randomUUID())
  assert.equal((await summary(a.id)).respondedCount,2)
  const first=await page(a.id,owner,null,2), second=await page(a.id,owner,first[1],2)
  assert.equal(new Set([...first,...second].map(r=>r.id)).size,4,'Timestamp/ID pagination handles equal creation times')
  await db.query("update email_campaign_recipients set email='unrelated@example.test' where id=$1",[recipient])
  assert.ok(!(await page(a.id)).some(r=>r.id===recipient),'Reassigned recipient evidence is hidden from the old person')
  assert.ok(!(await timeline(a.id)).some(e=>e.origin_id===recipient || e.origin_id===response))
  const privateContact=randomUUID()
  await db.query("insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values($1,$2,$3,'Private merged source','later@example.test')",[privateContact,org,outsider])
  assert.equal((await page(a.id,agent)).length,0,'A merged private source does not widen client access for assigned staff')
  assert.equal((await timeline(a.id,agent)).length,0)
  await assert.rejects(respond(a.id,lateRecipient,randomUUID(),agent),/Client access required/)
  await db.query('delete from contacts where contact_id=$1',[privateContact])
  const reassignedContact=randomUUID()
  await db.query("insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values($1,$2,$3,'Unrelated','unrelated@example.test')",[reassignedContact,org,agent])
  const unrelated=await profileFor('contact',reassignedContact)
  assert.equal((await page(unrelated.id)).length,0,'Old recipient history never transfers to a different person')
  await db.query("update organisation_users set membership_status='inactive',status='inactive' where user_id=$1",[owner])
  assert.equal(await summary(a.id),null)
  await assert.rejects(respond(a.id,aliasRecipient,randomUUID()),/access required/)
  for (const table of ['agency_client_campaign_recipients','agency_client_campaign_responses']) assert.equal((await one('select relrowsecurity as enabled from pg_class where relname=$1',[table])).enabled,true)
  for (const name of ['capture_client_campaign(uuid,boolean)','client_campaign_trigger()']) assert.equal((await one("select has_function_privilege('anon',$1,'EXECUTE') as allowed",['arch9_client_private.'+name])).allowed,false)
  const exposed=(await db.query("select proname,prosecdef from pg_proc where proname like 'agency_client%campaign%' and pronamespace='public'::regnamespace")).rows
  assert.equal(exposed.length,3); assert.ok(exposed.every(f=>!f.prosecdef),'Exposed functions are invoker wrappers')
  console.log('Client campaign checks passed: actual migrations, campaign RLS, safe projection, provider events, late identities, response validation, idempotency, merges, reassignment and pagination.')
} finally { await db.close() }
