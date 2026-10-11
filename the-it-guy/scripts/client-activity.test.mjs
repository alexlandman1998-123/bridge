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
const count = async (where = 'true', params = []) => (await one(`select count(*)::int n from agency_client_activity where ${where}`, params)).n
const page = (id, actor = owner, category = null, beforeAt = null, beforeId = null, limit = 101) => asActor(actor, 'select * from agency_client_activity_page($1,$2,$3,$4,$5)', [id, beforeAt, beforeId, category, limit])

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
  await db.exec(await readFile(new URL('../../supabase/migrations/20261011171757_client_activity_anchor_planner_estimate.sql', import.meta.url),'utf8'))
  assert.equal(Number((await one("select prorows from pg_proc where oid='arch9_client_private.activity_anchors(text,jsonb)'::regprocedure")).prorows),4)
  let a = await profileFor('lead',leadA), b = await profileFor('lead',leadB)
  const history = (await page(a.id)).rows
  assert(history.some(row => row.detail === 'Earlier call' && row.historical && new Date(row.occurred_at).toISOString().startsWith('2025-10-02')))
  assert(history.every(row => row.actor_id === null && row.actor_kind === 'historical'))
  assert.equal((await page(a.id,agent)).rows.length,history.length)
  assert.equal((await page(a.id,outsider)).rows.length,0)
  assert.equal((await page(a.id,null)).rows.length,0)
  await assert.rejects(asActor(null,'select * from agency_client_activity',[],'anon'),/permission denied/)
  await assert.rejects(asActor(agent,"insert into agency_client_activity(title) values ('Forged')"),/permission denied/)
  await assert.rejects(asActor(agent,"update agency_client_activity set detail='Changed history'"),/permission denied/)
  await assert.rejects(asActor(owner,'delete from agency_client_activity'),/permission denied/)
  await assert.rejects(asActor(owner,'select arch9_client_private.capture_activity($1,$2,$3,$4)',['leads',{},null,'INSERT']),/permission denied/)
  await assert.rejects(asActor(null,'select arch9_client_private.is_member($1)',[org],'anon'),/permission denied/)

  // API saves are attributed to the authenticated actor, append-only and idempotent.
  const request = randomUUID(), time = '2026-01-02T12:00:00.000Z'
  const log = (clientId, actor = agent, text = 'Discussed their viewing') => asActor(actor,'select agency_client_log_interaction($1,$2,$3,$4,$5) id',[clientId,request,'call',text,time])
  const saved = (await log(a.id)).rows[0].id
  assert.equal((await log(a.id)).rows[0].id,saved)
  const interaction = await one('select * from agency_client_activity where id=$1',[saved])
  assert.equal(interaction.actor_id,agent)
  assert.equal(interaction.actor_name,'agent Test')
  await assert.rejects(log(a.id,outsider),/access required/)
  await assert.rejects(log(a.id,agent,'Changed replay'),/another interaction/)
  await assert.rejects(log(a.id,owner),/another interaction/)
  await assert.rejects(log(b.id),/another interaction/)
  await assert.rejects(asActor(agent,'select agency_client_log_interaction($1,$2,$3,$4,$5)',[a.id,randomUUID(),'system','Forged','2026-01-02']),/valid occurrence/)
  await assert.rejects(asActor(agent,'select agency_client_log_interaction($1,$2,$3,$4,$5)',[a.id,randomUUID(),'call','Future','2099-01-02']),/valid occurrence/)

  // Actual source writes generate events; unchanged saves/irrelevant fields do not.
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[agent])
  const callId = randomUUID()
  await db.query("insert into lead_activities(activity_id,organisation_id,lead_id,agent_id,activity_type,activity_note,activity_date) values ($1,$2,$3,$4,'Call','Client confirmed appointment',now())",[callId,org,leadA,owner])
  assert.equal((await one('select actor_id from agency_client_activity where origin_id=$1',[callId])).actor_id,agent)
  const beforeNoop = await count()
  await db.query('update lead_activities set activity_note=activity_note where activity_id=$1',[callId])
  await db.query('update leads set updated_at=now() where lead_id=$1',[leadA])
  assert.equal(await count(),beforeNoop)
  await db.query("update leads set stage='Viewing' where lead_id=$1",[leadA])
  assert.equal(await count("origin_id=$1 and event_type='leads.update'",[leadA]),1)
  const wrongAgency = randomUUID()
  await db.query("insert into lead_activities(activity_id,organisation_id,lead_id,activity_type,activity_note) values ($1,$2,$3,'Note','Wrong agency')",[wrongAgency,otherOrg,leadA])
  assert.equal(await count('origin_id=$1',[wrongAgency]),0)
  const demo = randomUUID()
  await db.query("insert into lead_activities(activity_id,organisation_id,lead_id,activity_type,is_demo_data) values ($1,$2,$3,'Note',true)",[demo,org,leadA])
  assert.equal(await count('origin_id=$1',[demo]),0)
  const removedNote=randomUUID()
  await db.query("insert into lead_activities(activity_id,organisation_id,lead_id,activity_type,activity_note) values ($1,$2,$3,'Note','Removed note details')",[removedNote,org,leadA])
  await db.query('delete from lead_activities where activity_id=$1',[removedNote])
  assert.equal(await count('origin_id=$1',[removedNote]),2,'Both original event and deletion evidence are retained')
  assert((await page(a.id)).rows.some(row=>row.origin_id===removedNote && row.title==='Record removed'))
  assert(!(await page(a.id)).rows.some(row=>row.origin_id===removedNote && row.detail==='Removed note details'),'Removed source content stays subject to source access')

  const task = randomUUID(), appointment = randomUUID()
  await db.query("insert into tasks(task_id,organisation_id,lead_id,title,status) values ($1,$2,$3,'Phone client','pending')",[task,org,leadA])
  await db.query("update tasks set status='completed' where task_id=$1",[task])
  assert.equal(await count('origin_id=$1',[task]),2)
  await db.query("insert into appointments(appointment_id,organisation_id,lead_id,title,status,date_time) values ($1,$2,$3,'Viewing','Scheduled','2026-10-20')",[appointment,org,leadA])
  await db.query("update appointments set date_time='2026-10-21' where appointment_id=$1",[appointment])
  assert.equal(await count('origin_id=$1',[appointment]),2)
  const participant = randomUUID(), participant2 = randomUUID()
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await db.query("insert into appointment_participants(participant_id,appointment_id,organisation_id,email,participant_role,rsvp_status,responded_at) values ($1,$2,$3,'a@example.test','buyer','Accepted',now()),($4,$2,$3,'b@example.test','buyer','Declined',now())",[participant,appointment,org,participant2])
  assert.equal(await count('origin_id=$1',[participant]),1)
  assert.equal(await count('origin_id=$1',[participant2]),0,'RSVP from an unrelated client must not attach to the appointment client')
  assert.equal((await one('select actor_kind from agency_client_activity where origin_id=$1',[participant])).actor_kind,'client')

  const offer = randomUUID()
  await db.query("insert into offers(id,organisation_id,buyer_lead_id,seller_lead_id,status) values ($1,$2,$3,$4,'Draft')",[offer,org,leadA,leadB])
  await db.query("update offers set buyer_viewed_at=now(),buyer_submitted_at=now(),status='Submitted' where id=$1",[offer])
  assert.equal(await count("origin_id=$1 and event_type='offer.buyer_viewed_at' and client_id=$2",[offer,a.id]),1)
  assert.equal(await count("origin_id=$1 and event_type='offer.buyer_viewed_at' and client_id=$2",[offer,b.id]),0)

  // Merge reads both immutable histories, including old links and a retry made after merging.
  a=await profileFor('lead',leadA); b=await profileFor('lead',leadB)
  const originals = (await db.query('select * from agency_client_activity order by id')).rows
  await asActor(owner,'select agency_client_merge($1,$2,$3,$4,$5)',[b.id,a.id,b.version,a.version,'Synthetic merge timeline test'])
  for (const event of originals) assert.deepEqual(await one('select * from agency_client_activity where id=$1',[event.id]),event)
  assert((await page(b.id)).rows.some(row => row.id===saved))
  assert.deepEqual((await page(a.id)).rows,(await page(b.id)).rows)
  assert.equal((await log(b.id)).rows[0].id,saved,'An uncertain save retry after merging must not duplicate the interaction')
  assert.equal(await count("origin_table='manual' and event_key=$1",['manual:'+request]),1)
  const filtered = (await page(a.id,owner,'appointment')).rows
  assert(filtered.every(row=>row.category==='appointment'))
  const first = (await page(b.id,owner,null,null,null,3)).rows
  const last = first.at(-1)
  const second = (await page(b.id,owner,null,last.occurred_at,last.id,3)).rows
  assert(first.every(row => !second.some(other=>other.id===row.id)))
  assert.equal((await asActor(owner,'select * from agency_client_activity_latest($1)',[org])).rows.filter(row=>row.client_id===b.id).length,1)

  // Late identity linking imports older related events once, retaining their dates.
  const lateLead=randomUUID(), lateTask=randomUUID(), lateContact=randomUUID()
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id) values ($1,$2,$3)',[lateLead,org,agent])
  await db.query("insert into tasks(task_id,organisation_id,lead_id,title,created_at) values ($1,$2,$3,'Old task','2024-02-01')",[lateTask,org,lateLead])
  assert.equal(await count('origin_id=$1',[lateTask]),0)
  await db.query("insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,'Late contact','late@example.test')",[lateContact,org,agent])
  await db.query('update leads set contact_id=$1 where lead_id=$2',[lateContact,lateLead])
  assert.equal(await count('origin_id=$1',[lateTask]),1)
  assert(new Date((await one('select occurred_at from agency_client_activity where origin_id=$1',[lateTask])).occurred_at).toISOString().startsWith('2024-02-01'))

  // Source RLS still applies to sensitive professional records on accessible matters.
  const buyer=randomUUID(), transaction=randomUUID()
  await db.query("insert into buyers(id,organisation_id,name,email) values ($1,$2,'Buyer','b@example.test')",[buyer,org])
  await db.query("insert into transactions(id,organisation_id,assigned_user_id,buyer_id,seller_name,seller_email) values ($1,$2,$3,$4,'Seller','seller@example.test')",[transaction,org,agent,buyer])
  const privateDocument=randomUUID(), publicDocument=randomUUID(), privateComment=randomUUID(), eventId=randomUUID()
  await db.query("insert into documents(id,transaction_id,name,visibility_scope,file_path) values ($1,$2,'Private attorney document','firm_only','SECRET-FILE-URL'),($3,$2,'Identity document','shared_role_players','SECRET-FILE-URL')",[privateDocument,transaction,publicDocument])
  await db.query("insert into transaction_comments(id,transaction_id,comment_text,visibility_scope) values ($1,$2,'Private professional note','firm_only')",[privateComment,transaction])
  await db.query("insert into transaction_events(id,transaction_id,event_type,event_data,visibility_scope) values ($1,$2,'status_changed','{\"password\":\"SECRET-PASSWORD\",\"token\":\"SECRET-TOKEN\"}','shared_role_players')",[eventId,transaction])
  const visible = (await page(b.id)).rows
  assert(!visible.some(row=>[privateDocument,privateComment].includes(row.origin_id)))
  assert(visible.some(row=>row.origin_id===publicDocument))
  assert(visible.some(row=>row.origin_id===eventId))
  assert(!JSON.stringify((await db.query('select * from agency_client_activity')).rows).includes('SECRET-'))
  const snag=randomUUID(), notification=randomUUID(), buyerOnboarding=randomUUID()
  await db.query("insert into client_issues(id,transaction_id,status) values ($1,$2,'open')",[snag,transaction])
  await db.query('update client_issues set client_confirmed_at=now() where id=$1',[snag])
  assert.equal(await count('origin_id=$1 and client_id=$2',[snag,b.id]),2)
  assert.equal(await count('origin_id=$1 and client_id<>$2',[snag,b.id]),0,'A buyer snag must not be attributed to the seller')
  await db.query("insert into client_portal_notifications(id,transaction_id,client_role,read_at) values ($1,$2,'buyer',now())",[notification,transaction])
  assert.equal(await count('origin_id=$1 and client_id=$2',[notification,b.id]),1)
  await db.query('insert into transaction_onboarding(id,transaction_id,submitted_at) values ($1,$2,now())',[buyerOnboarding,transaction])
  assert.equal(await count('origin_id=$1 and client_id=$2',[buyerOnboarding,b.id]),1)

  // Anonymous portal visitors may log only their credential-resolved client.
  await db.query('insert into client_portal_links values ($1,$2,$3,$4,true,null)',[randomUUID(),transaction,buyer,'valid-buyer-test-token'])
  await db.query("select set_config('request.portal.token','valid-buyer-test-token',false)")
  await asActor(null,'select agency_client_record_portal_visit($1,$2,$3,$4)',['valid-buyer-test-token',null,'documents',randomUUID()],'anon')
  await asActor(null,'select agency_client_record_portal_visit($1,$2,$3,$4)',['valid-buyer-test-token',null,'documents',randomUUID()],'anon')
  assert.equal(await count("event_type='portal.section_viewed' and source_id=$1",[transaction]),1)
  assert.equal((await one("select client_id from agency_client_activity where event_type='portal.section_viewed' and source_id=$1",[transaction])).client_id,b.id)
  await assert.rejects(asActor(null,'select agency_client_record_portal_visit($1,$2,$3,$4)',['forged-token',null,'documents',randomUUID()],'anon'),/access required/)
  await assert.rejects(asActor(null,'select agency_client_record_portal_visit($1,$2,$3,$4)',['valid-buyer-test-token',null,'https://url-with-token',randomUUID()],'anon'),/Invalid portal/)
  await db.query('update client_portal_links set is_active=false')
  await assert.rejects(asActor(null,'select agency_client_record_portal_visit($1,$2,$3,$4)',['valid-buyer-test-token',null,'overview',randomUUID()],'anon'),/access required/)
  const listing=randomUUID(), onboarding=randomUUID()
  await db.query("insert into private_listings(id,organisation_id,assigned_agent_id,seller_canonical_facts_json) values ($1,$2,$3,'{\"fullName\":\"Seller\",\"email\":\"seller@example.test\"}')",[listing,org,agent])
  await db.query("insert into private_listing_seller_onboarding(id,private_listing_id,form_data,submitted_at,seller_portal_last_login_at) values ($1,$2,'{\"password\":\"SECRET-PASSWORD\"}',now(),now())",[onboarding,listing])
  assert.equal(await count("event_type='onboarding.submitted' and origin_id=$1",[onboarding]),1)
  await db.query("insert into test_seller_sessions values ('seller-valid-test','valid-session',$1,null,true)",[listing])
  await assert.rejects(asActor(null,'select agency_client_record_portal_visit($1,$2,$3,$4)',['seller-valid-test','wrong-session','overview',randomUUID()],'anon'),/access required/)
  await asActor(null,'select agency_client_record_portal_visit($1,$2,$3,$4)',['seller-valid-test','valid-session','overview',randomUUID()],'anon')
  assert.equal(await count("event_type='portal.section_viewed' and source_id=$1",[listing]),1)
  assert(!JSON.stringify((await db.query('select * from agency_client_activity')).rows).includes('valid-session'))
  await db.query('update test_seller_sessions set is_active=false')
  await assert.rejects(asActor(null,'select agency_client_record_portal_visit($1,$2,$3,$4)',['seller-valid-test','valid-session','overview',randomUUID()],'anon'),/access required/)
  // Reassignment and inactive membership immediately narrow activity access.
  await db.query('update leads set assigned_user_id=$1 where lead_id=$2',[owner,leadB])
  assert.equal((await page(b.id,agent)).rows.length,0)
  await db.query("update organisation_users set membership_status='inactive' where user_id=$1",[owner])
  assert.equal((await page(b.id,owner)).rows.length,0)
  console.log('Client activity database checks passed: historical import, automatic events, safe attribution, no-op/deduplication, immutable history, reviewed merges, cursor pagination, late linking, source RLS, agency isolation and guarded buyer/seller portal visits.')
} catch (error) { console.error(error.message,error.code || '',error.position || '',error.where || ''); process.exitCode=1 }
finally { await db.close() }
