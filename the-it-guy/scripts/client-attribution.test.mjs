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
  let a = await profileFor('lead',leadA), b = await profileFor('lead',leadB)
  const summary = async (id, actor=owner) => (await asActor(actor,'select agency_client_attribution_summary($1) value',[id])).rows[0].value
  const attributionPage = async (id, actor=owner, before=null, limit=101) => (await asActor(actor,'select * from agency_client_attribution_page($1,$2,$3,$4)',[id,before?.occurred_at || null,before?.id || null,limit])).rows
  const touch = async (leadId, kind='enquiry') => one('select * from agency_client_attribution where lead_id=$1 and touch_type=$2',[leadId,kind])
  let first = await summary(a.id)
  assert.equal(first.firstTouch.utm_source,'facebook')
  assert.equal(first.latestTouch.utm_campaign,'lyle-launch')
  assert.equal(first.enquiryCount,1)
  assert.equal(first.taggedEnquiryCount,1)
  assert.equal(first.firstTouch.historical,true)
  assert.equal(new Date(first.firstTouch.occurred_at).toISOString().slice(0,10),'2025-10-01')
  assert.equal(first.latestTouch.landing_host,'thelyle.co.za')
  assert.equal(first.latestTouch.referrer_host,'facebook.com')
  assert.equal((await summary(b.id)).firstTouch.utm_source,'google','Camel-case website tags normalize to the same fields')
  assert.deepEqual(await summary(a.id,agent),first)
  assert.equal(await summary(a.id,outsider),null)
  assert.equal(await summary(a.id,null),null)
  await assert.rejects(asActor(null,'select agency_client_attribution_summary($1)',[a.id],'anon'),/permission denied/)
  await assert.rejects(asActor(agent,'insert into agency_client_attribution(utm_source) values ($1)',['Forged']),/permission denied/)
  await assert.rejects(asActor(agent,'update agency_client_attribution set utm_source=$1',['Forgery']),/permission denied/)
  await assert.rejects(asActor(owner,'delete from agency_client_attribution'),/permission denied/)
  await assert.rejects(asActor(owner,'select arch9_client_private.capture_client_attribution($1)',[leadA]),/permission denied/)
  const before = await touch(leadA)
  await db.query('update leads set updated_at=now() where lead_id=$1',[leadA])
  await db.query('update leads set raw_enquiry_payload=$1 where lead_id=$2',[JSON.stringify({utm:{utm_source:'different',utm_campaign:'different',utm_content:'wrong-content'}}),leadA])
  assert.equal((await touch(leadA)).utm_source,'facebook','Captured source is never replaced by later generic/changed saves')
  assert.equal((await touch(leadA)).id,before.id)
  assert.equal((await touch(leadA)).utm_content,null,'Conflicting campaigns must not create a mixed attribution')
  assert.equal((await one("select count(*)::int n from agency_client_activity where event_key=$1",['attribution:'+leadA])).n,1)

  // Separate enquiries with an exact known email retain one permanent profile.
  const newContact=randomUUID(), newLead=randomUUID()
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5)',[newContact,org,agent,'Taylor','a@example.test'])
  const now = new Date().toISOString(), earlier = new Date(Date.now()-3600000).toISOString()
  const payload={utm:{utm_source:'instagram',utm_medium:'paid_social',utm_campaign:'second-launch'},context:{clientAttribution:{firstTouch:{utm:{utm_source:'linkedin',utm_medium:'social',utm_campaign:'first-visit'},sourceChannel:'linkedin',capturedAt:earlier,landingHost:'revo.co.za',referrerHost:'linkedin.com'}}}}
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,contact_id,raw_enquiry_payload,created_at) values ($1,$2,$3,$4,$5,$6)',[newLead,org,agent,newContact,JSON.stringify(payload),now])
  assert.equal((await profileFor('lead',newLead)).id,a.id)
  assert.equal((await touch(newLead,'first')).utm_source,'linkedin')
  assert.equal((await touch(newLead)).utm_source,'instagram')
  assert.equal((await touch(newLead)).historical,false,'Fresh intake is not mislabeled by the identity-link trigger')
  assert.equal((await summary(a.id)).latestTouch.utm_campaign,'second-launch')
  assert.equal((await summary(a.id)).enquiryCount,2)
  assert.equal((await one("select historical from agency_client_activity where event_key=$1",['attribution:'+newLead])).historical,false)

  // A delayed receipt enriches missing fields once without replacing known UTM.
  const receiptLead=randomUUID(), receiptContact=randomUUID(), receiptId=randomUUID()
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5)',[receiptContact,org,agent,'Receipt client','receipt@example.test'])
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,contact_id) values ($1,$2,$3,$4)',[receiptLead,org,agent,receiptContact])
  const unknownSource=await summary((await profileFor('lead',receiptLead)).id)
  assert.equal(unknownSource.firstTouch,null)
  assert.equal(unknownSource.latestTouch,null)
  assert.equal(unknownSource.taggedEnquiryCount,0,'Missing metadata is never invented as direct or paid tracking')
  await db.query('insert into agency_public_intake_submissions(id,organisation_id,lead_id,status,utm_json,request_metadata_json) values ($1,$2,$3,$4,$5,$6)',[receiptId,org,receiptLead,'accepted',JSON.stringify({utmSource:'email',utmCampaign:'receipt-launch',secret:'not copied'}),JSON.stringify({clientAttribution:{firstTouch:{utm:{utm_source:'qr',utm_campaign:'first-qr'},sourceChannel:'qr',capturedAt:earlier}}})])
  assert.equal((await touch(receiptLead)).utm_source,'email')
  assert.equal((await touch(receiptLead,'first')).utm_source,'qr','A later browser receipt supersedes the enquiry fallback for first source')
  assert.equal((await touch(receiptLead,'first')).evidence_kind,'browser_session')
  const receiptSnapshot=await touch(receiptLead)
  await db.query('update agency_public_intake_submissions set status=status where id=$1',[receiptId])
  assert.deepEqual(await touch(receiptLead),receiptSnapshot,'Repeated hydration has no visible or storage effect')
  const webReceipt=randomUUID()
  await db.query('insert into website_lead_submissions(id,organisation_id,lead_id,status,attribution_json) values ($1,$2,$3,$4,$5)',[webReceipt,org,receiptLead,'routed',JSON.stringify({utmSource:'email',utmCampaign:'receipt-launch',utmContent:'cta-top',referrer:'https://mail.example.test/?token=secret'})])
  assert.equal((await touch(receiptLead)).utm_content,'cta-top')
  assert.equal((await touch(receiptLead)).referrer_host,'mail.example.test')

  // Receipts arriving before identity linking must not mix conflicting sources.
  const lateLead=randomUUID(), lateContact=randomUUID()
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,raw_enquiry_payload) values ($1,$2,$3,$4)',[lateLead,org,agent,JSON.stringify({utm:{utm_source:'google'}})])
  await db.query('insert into website_lead_submissions(id,organisation_id,lead_id,status,attribution_json) values ($1,$2,$3,$4,$5)',[randomUUID(),org,lateLead,'routed',JSON.stringify({utmSource:'facebook',utmCampaign:'wrong-campaign'})])
  assert.equal(await touch(lateLead),undefined)
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5)',[lateContact,org,agent,'Late client','late@example.test'])
  await db.query('update leads set contact_id=$1 where lead_id=$2',[lateContact,lateLead])
  assert.equal((await touch(lateLead)).utm_source,'google')
  assert.equal((await touch(lateLead)).utm_campaign,null,'Different origins cannot assemble one misleading campaign')
  await db.query('update leads set raw_enquiry_payload=$1 where lead_id=$2',[JSON.stringify({utm:{utm_campaign:'unrelated-without-source'}}),lateLead])
  assert.equal((await touch(lateLead)).utm_campaign,null,'Missing fields only enrich evidence from a compatible known source/campaign')
  assert.equal((await summary((await profileFor('lead',lateLead)).id)).enquiryCount,1)

  // Merge histories and old references have the same original evidence.
  a=await profileFor('lead',leadA); b=await profileFor('lead',leadB)
  await asActor(owner,'select agency_client_merge($1,$2,$3,$4,$5)',[a.id,b.id,a.version,b.version,'Client confirmed both emails'])
  assert.equal((await summary(a.id)).enquiryCount,3)
  assert.deepEqual(await summary(a.id),await summary(b.id))
  const firstPage=await attributionPage(a.id,owner,null,1)
  const secondPage=await attributionPage(a.id,owner,firstPage[0],2)
  assert.equal(firstPage.length,1); assert.equal(secondPage.length,2)
  assert.equal(new Set([...firstPage,...secondPage].map(row=>row.id)).size,3)
  assert.equal((await touch(leadB)).client_id,b.id,'Merges preserve the recorded identity instead of rewriting history')

  // No tracking token, campaign or shared name can attach an unrelated person.
  const unrelatedContact=randomUUID(), unrelatedLead=randomUUID()
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5)',[unrelatedContact,org,agent,'Taylor','unrelated@example.test'])
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,contact_id,raw_enquiry_payload) values ($1,$2,$3,$4,$5)',[unrelatedLead,org,agent,unrelatedContact,JSON.stringify({utm:{utm_source:'facebook',utm_campaign:'lyle-launch'},clientId:a.id})])
  assert.notEqual((await profileFor('lead',unrelatedLead)).id,a.id)
  assert.equal((await summary(a.id)).enquiryCount,3)
  // Reassigning a historical enquiry never transfers the previous person's campaign.
  await db.query('update leads set contact_id=$1 where lead_id=$2',[unrelatedContact,receiptLead])
  assert.equal((await summary((await profileFor('lead',receiptLead)).id)).enquiryCount,1)
  assert.equal((await attributionPage((await profileFor('contact',receiptContact)).id)).length,0)

  // Demo rows and wrong-agency/failed receipts cannot manufacture evidence.
  const demoLead=randomUUID()
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,contact_id,is_demo_data,raw_enquiry_payload) values ($1,$2,$3,$4,true,$5)',[demoLead,org,agent,contactA,JSON.stringify({utm:{utm_source:'demo'}})])
  assert.equal(await touch(demoLead),undefined)
  const foreignReceipt=randomUUID()
  await db.query('insert into website_lead_submissions(id,organisation_id,lead_id,status,attribution_json) values ($1,$2,$3,$4,$5)',[foreignReceipt,otherOrg,unrelatedLead,'routed',JSON.stringify({utmContent:'foreign'})])
  assert.equal((await touch(unrelatedLead)).utm_content,null)
  const foreignContact=randomUUID(), foreignLead=randomUUID()
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5)',[foreignContact,otherOrg,outsider,'Taylor','a@example.test'])
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,contact_id,raw_enquiry_payload) values ($1,$2,$3,$4,$5)',[foreignLead,otherOrg,outsider,foreignContact,JSON.stringify({utm:{utm_source:'private-source'}})])
  const foreignClient=await profileFor('lead',foreignLead)
  assert.notEqual(foreignClient.id,a.id)
  assert.equal(await summary(foreignClient.id),null)
  assert.equal((await summary(foreignClient.id,outsider)).latestTouch.utm_source,'private-source')
  await db.query('insert into agency_public_intake_submissions(id,organisation_id,lead_id,status,utm_json) values ($1,$2,$3,$4,$5)',[randomUUID(),org,unrelatedLead,'failed',JSON.stringify({utmContent:'failed'})])
  assert.equal((await touch(unrelatedLead)).utm_content,null)
  // Malformed/object/oversized tags and impossible times are safely bounded.
  const weirdLead=randomUUID()
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,contact_id,raw_enquiry_payload) values ($1,$2,$3,$4,$5)',[weirdLead,org,agent,unrelatedContact,JSON.stringify({utm:{utm_source:' x '.repeat(200),utm_medium:{token:'secret'},utm_term:123},context:{pageUrl:'https://user:password@example.test/?secret',clientAttribution:{firstTouch:{utm:{utm_source:'old'},capturedAt:'1900-01-01T00:00:00Z'}}}})])
  assert.equal((await touch(weirdLead)).utm_source.length,160)
  assert.equal((await touch(weirdLead)).utm_medium,null)
  assert.equal((await touch(weirdLead)).landing_host,null)
  assert.equal(new Date((await touch(weirdLead,'first')).occurred_at).toISOString(),new Date((await touch(weirdLead)).occurred_at).toISOString())
  const serialized=JSON.stringify((await db.query('select * from agency_client_attribution')).rows)
  assert(!serialized.includes('secret') && !serialized.includes('password') && !serialized.includes('?token='),'The journal stores allowlisted fields and hosts, never raw payloads or URLs')
  await db.query("update organisation_users set membership_status='inactive' where user_id=$1",[agent])
  assert.equal(await summary(a.id,agent),null)
  console.log('Client attribution database checks passed: canonical UTM, historical dates, source evidence, intake/website receipts, no-op enrichment, exact identity matching, reviewed merges, source reassignment, pagination and access isolation.')
} finally { await db.close() }
