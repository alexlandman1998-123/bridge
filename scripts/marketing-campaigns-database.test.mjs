// Isolated Postgres checks; never contacts a remote database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(
  process.env.ARCH9_TEST_PGLITE_PATH ||
    '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js'
)
const db = new PGlite()
const org = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  colleague = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  outsider = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create table public.organisations(id uuid primary key);
create function public.bridge_is_active_member(org uuid) returns boolean language sql as $$select org='${org}' and auth.uid() in ('${owner}','${colleague}')$$;
create function public.email_campaign_can_send(org uuid) returns boolean language sql as $$select org='${org}' and current_setting('test.admin',true)='yes'$$;
create table public.email_campaigns(id uuid primary key,organisation_id uuid,created_by uuid);
create table public.whatsapp_campaigns(id uuid primary key,organisation_id uuid);
alter table public.email_campaigns enable row level security;
create policy email_read on public.email_campaigns for select to authenticated using(organisation_id='${org}' and created_by=auth.uid());
grant select on public.email_campaigns,public.whatsapp_campaigns to authenticated;
insert into auth.users values('${owner}'),('${colleague}'),('${outsider}');
insert into public.organisations values('${org}'),('${other}');
insert into public.email_campaigns values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${org}','${owner}'),('ffffffff-ffff-4fff-8fff-ffffffffffff','${other}','${owner}');
`)
await db.exec(
  readFileSync(
    'supabase/migrations/20261022132550_marketing_campaign_initiatives.sql',
    'utf8',
  ),
)
await db.exec(readFileSync('supabase/migrations/20261023111430_marketing_campaign_templates.sql', 'utf8'))
const login = async (user, admin = 'no') =>
  db.exec(
    `reset role; set request.jwt.claim.sub='${user}'; set test.admin='${admin}'; set role authenticated`,
  )
await login(owner)
const plan = (
  await db.query(
    `insert into public.marketing_campaigns(organisation_id,name,goal,objective,planned_channels) values($1,'Seller leads','seller_leads','More valuations',array['email','whatsapp']) returning *`,
    [org],
  )
).rows[0]
await assert.rejects(
  db.query(
    `insert into public.marketing_campaigns(organisation_id,name,goal,objective) values($1,'Foreign','custom','No')`,
    [other],
  ),
  /row-level security/,
)
await assert.rejects(
  db.query(`update public.marketing_campaigns set name='stale' where id=$1`, [
    plan.id,
  ]),
  /Reload/,
)
await assert.rejects(
  db.query(
    `update public.marketing_campaigns set status='scheduled',revision=2 where id=$1`,
    [plan.id],
  ),
  /check constraint/,
)
await assert.rejects(
  db.query(
    `update public.marketing_campaigns set organisation_id=$1 where id=$2`,
    [other, plan.id],
  ),
  /permission denied/,
)
await db.query(
  `insert into public.marketing_campaign_activities(organisation_id,campaign_id,channel,email_campaign_id) values($1,$2,'email','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')`,
  [org, plan.id],
)
await assert.rejects(
  db.query(
    `insert into public.marketing_campaign_activities(organisation_id,campaign_id,channel,email_campaign_id) values($1,$2,'email','ffffffff-ffff-4fff-8fff-ffffffffffff')`,
    [org, plan.id],
  ),
  /belong to this agency/,
)
await assert.rejects(
  db.query(
    `update public.marketing_campaigns set planned_channels=array['whatsapp'],revision=2 where id=$1`,
    [plan.id],
  ),
  /Unlink/,
)
await assert.rejects(
  db.query(
    `insert into public.marketing_campaign_activities(organisation_id,campaign_id,channel,email_campaign_id) values($1,$2,'email','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')`,
    [org, plan.id],
  ),
  /unique constraint/,
)
await login(colleague)
assert.equal(
  (await db.query('select * from public.marketing_campaigns')).rows.length,
  1,
)
assert.equal(
  (
    await db.query(
      `update public.marketing_campaigns set name='Forbidden',revision=2 returning id`,
    )
  ).rows.length,
  0,
)
assert.equal(
  (
    await db.query(
      `delete from public.marketing_campaign_activities returning id`,
    )
  ).rows.length,
  0,
)
await assert.rejects(
  db.query(
    `insert into public.marketing_campaign_activities(organisation_id,campaign_id,channel,email_campaign_id) values($1,$2,'email','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')`,
    [org, plan.id],
  ),
  /planned channel|row-level security/,
)
await login(colleague, 'yes')
assert.equal(
  (
    await db.query(
      `update public.marketing_campaigns set name='Admin edit',revision=2 returning id`,
    )
  ).rows.length,
  1,
)
await assert.rejects(
  db.query(
    `insert into public.marketing_campaign_activities(organisation_id,campaign_id,channel,email_campaign_id) values($1,$2,'email','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')`,
    [org, plan.id],
  ),
  /available to you/,
)
await login(outsider)
assert.equal(
  (await db.query('select * from public.marketing_campaigns')).rows.length,
  0,
)
assert.equal(
  (await db.query('select * from public.marketing_campaign_activities')).rows
    .length,
  0,
)
await login(owner)
await db.query(
  'delete from public.marketing_campaign_activities where campaign_id=$1',
  [plan.id],
)
assert.equal(
  (await db.query('select * from public.email_campaigns')).rows.length,
  1,
)
await db.query(
  `update public.marketing_campaigns set planned_channels=array['whatsapp'],revision=3 where id=$1`,
  [plan.id],
)
await assert.rejects(
  db.query(`update public.marketing_campaigns set revision=3 where id=$1`, [
    plan.id,
  ]),
  /Reload/,
)
await db.exec('reset role; set role anon')
await assert.rejects(
  db.query('select * from public.marketing_campaigns'),
  /permission denied/,
)

// Reusable templates: personal privacy, agency publication and draft-only data.
await login(owner)
const personal = (await db.query(`insert into public.marketing_campaign_templates(organisation_id,name,goal,objective,planned_channels,run_mode,duration_days,channel_content) values($1,'Listing playbook','promote_listing','More viewings',array['email','social'],'bounded',14,'{"email":{"body":"Reusable copy"},"social":{"body":"Just listed"}}') returning *`,[org])).rows[0]
await assert.rejects(db.query(`insert into public.marketing_campaign_templates(organisation_id,name,goal,objective,planned_channels,run_mode,duration_days,visibility) values($1,'Unapproved shared','custom','No',array['email'],'bounded',14,'agency')`,[org]), /row-level security/)
await assert.rejects(db.query(`update public.marketing_campaign_templates set visibility='agency',revision=2 where id=$1`,[personal.id]), /row-level security/)
await assert.rejects(db.query(`update public.marketing_campaign_templates set name='Stale' where id=$1`,[personal.id]), /Reload/)
await assert.rejects(db.query(`update public.marketing_campaign_templates set organisation_id=$1,revision=2 where id=$2`,[other,personal.id]), /permission denied/)
await assert.rejects(db.query(`update public.marketing_campaign_templates set channel_content='{"email":{"recipients":["private@example.com"]}}',revision=2 where id=$1`,[personal.id]), /check constraint/)
await assert.rejects(db.query(`update public.marketing_campaign_templates set channel_content='{"whatsapp":{"body":"Not planned"}}',revision=2 where id=$1`,[personal.id]), /check constraint/)
await assert.rejects(db.query(`update public.marketing_campaign_templates set run_mode='ongoing',revision=2 where id=$1`,[personal.id]), /check constraint/)
await db.query(`update public.marketing_campaign_templates set run_mode='ongoing',duration_days=null,revision=2 where id=$1`,[personal.id])
await login(colleague)
assert.equal((await db.query('select * from public.marketing_campaign_templates')).rows.length,0)
assert.equal((await db.query(`update public.marketing_campaign_templates set name='Forbidden',revision=3 where id=$1 returning id`,[personal.id])).rows.length,0)
await login(owner,'yes')
const shared = (await db.query(`insert into public.marketing_campaign_templates(organisation_id,name,goal,objective,planned_channels,run_mode,visibility) values($1,'Agency playbook','custom','Help the team',array['email'],'ongoing','agency') returning *`,[org])).rows[0]
await login(colleague)
assert.equal((await db.query('select * from public.marketing_campaign_templates')).rows.length,1)
assert.equal((await db.query(`update public.marketing_campaign_templates set name='Forbidden',revision=2 where id=$1 returning id`,[shared.id])).rows.length,0)
await login(colleague,'yes')
assert.equal((await db.query('select * from public.marketing_campaign_templates')).rows.length,1) // administrators cannot read someone else's personal templates
assert.equal((await db.query(`update public.marketing_campaign_templates set name='Agency updated',revision=2 where id=$1 returning id`,[shared.id])).rows.length,1)
await assert.rejects(db.query(`insert into public.marketing_campaign_templates(organisation_id,name,goal,objective,planned_channels,run_mode) values($1,'Foreign','custom','No',array['email'],'ongoing')`,[other]), /row-level security/)
await login(outsider)
assert.equal((await db.query('select * from public.marketing_campaign_templates')).rows.length,0)
await db.exec('reset role; set role anon')
await assert.rejects(db.query('select * from public.marketing_campaign_templates'), /permission denied/)
await db.exec('reset role')
const duplicate = (await db.query(`insert into public.marketing_campaigns(organisation_id,created_by,name,goal,objective,planned_channels,channel_content) values($1,$2,'Listing draft','promote_listing','Viewings',array['email','social'],'{"social":{"body":"Just listed"}}') returning *`,[org,owner])).rows[0]
assert.equal(duplicate.status,'draft')
assert.equal((await db.query('select count(*)::int as n from public.marketing_campaign_activities where campaign_id=$1',[duplicate.id])).rows[0].n,0)
assert.equal((await db.query(`select count(*)::int as n from pg_policies where tablename='marketing_campaign_templates'`)).rows[0].n,3)
assert.equal((await db.query(`select relrowsecurity from pg_class where oid='public.marketing_campaign_templates'::regclass`)).rows[0].relrowsecurity,true)
await db.exec(readFileSync('supabase/migrations/20261023121043_marketing_campaign_budgets.sql', 'utf8'))
await login(owner)
const budgetPlan = (await db.query(`insert into public.marketing_campaigns(organisation_id,name,goal,objective,planned_budget) values($1,'Budget plan','custom','Enquiries',0) returning *`, [org])).rows[0]
assert.equal(Number(budgetPlan.planned_budget), 0)
assert.equal(budgetPlan.budget_currency, 'ZAR')
assert.equal((await db.query(`update public.marketing_campaigns set planned_budget=1250.50,revision=2 where id=$1 returning planned_budget`, [budgetPlan.id])).rows[0].planned_budget, '1250.50')
await assert.rejects(db.query(`update public.marketing_campaigns set planned_budget=-1,revision=3 where id=$1`, [budgetPlan.id]), /check constraint/)
await assert.rejects(db.query(`update public.marketing_campaigns set budget_currency='USD',revision=3 where id=$1`, [budgetPlan.id]), /check constraint/)
await assert.rejects(db.query(`update public.marketing_campaigns set planned_budget=20 where id=$1`, [budgetPlan.id]), /Reload/)
await login(colleague)
assert.equal((await db.query(`update public.marketing_campaigns set planned_budget=20,revision=3 where id=$1 returning id`, [budgetPlan.id])).rows.length, 0)
await login(outsider)
assert.equal((await db.query(`select id from public.marketing_campaigns where id=$1`, [budgetPlan.id])).rows.length, 0)
// First-use setup is isolated from agency profiles and channel delivery.
await db.exec('reset role')
await db.exec(readFileSync('supabase/migrations/20261023121038_marketing_campaign_setup.sql', 'utf8'))
await login(owner, 'yes')
const setupPreferences = {
  agencyName: 'Oak & Stone', services: ['Sales'], serviceAreas: ['Constantia'],
  language: 'en-ZA', tone: 'Warm and approachable', buyerDestination: 'agent', sellerDestination: 'agent',
  agencyConfirmed: true, styleConfirmed: true, routingConfirmed: true,
}
const setup = (await db.query(`insert into public.marketing_campaign_setup(organisation_id,preferences,status) values($1,$2,'complete') returning *`, [org, JSON.stringify(setupPreferences)])).rows[0]
assert.equal(setup.confirmed_preferences.agencyName, 'Oak & Stone')
assert.equal(setup.confirmed_revision, 1)
await assert.rejects(db.query(`update public.marketing_campaign_setup set revision=1 where organisation_id=$1`, [org]), /Reload/)
await assert.rejects(db.query(`update public.marketing_campaign_setup set confirmed_preferences='{}' where organisation_id=$1`, [org]), /permission denied/)
await assert.rejects(db.query(`update public.marketing_campaign_setup set preferences='{}',revision=2 where organisation_id=$1`, [org]), /check constraint/)
await assert.rejects(db.query(`update public.marketing_campaign_setup set preferences=jsonb_set(preferences,'{buyerDestination}','"link"'),revision=2 where organisation_id=$1`, [org]), /check constraint/)
await assert.rejects(db.query(`update public.marketing_campaign_setup set preferences=jsonb_set(preferences,'{website}','"javascript:alert(1)"'),revision=2 where organisation_id=$1`, [org]), /check constraint/)
await assert.rejects(db.query(`update public.marketing_campaign_setup set preferences=jsonb_set(preferences,'{website}','"HTTPS://user:secret@example.com"'),revision=2 where organisation_id=$1`, [org]), /check constraint/)
await assert.rejects(db.query(`insert into public.marketing_campaign_setup(organisation_id) values($1)`, [other]), /row-level security/)
const setupDraft = (await db.query(`update public.marketing_campaign_setup set status='draft',preferences='{"agencyName":"Unfinished changes"}',revision=2,last_step=2 where organisation_id=$1 returning *`, [org])).rows[0]
assert.equal(setupDraft.confirmed_preferences.agencyName, 'Oak & Stone')
assert.equal(setupDraft.confirmed_revision, 1)
assert.equal(setupDraft.last_step, 2)
await login(colleague)
assert.equal((await db.query('select * from public.marketing_campaign_setup')).rows.length, 1)
assert.equal((await db.query(`update public.marketing_campaign_setup set revision=3 returning organisation_id`)).rows.length, 0)
await assert.rejects(db.query(`insert into public.marketing_campaign_setup(organisation_id) values($1)`, [other]), /row-level security/)
const personalSetup = (await db.query(`insert into public.marketing_campaign_agent_setup(organisation_id,user_id,preferences,status) values($1,$2,'{"name":"Agent","email":"agent@example.com","detailsConfirmed":true}','complete') returning *`, [org, colleague])).rows[0]
assert.equal(personalSetup.confirmed_preferences.name, 'Agent')
await assert.rejects(db.query(`insert into public.marketing_campaign_agent_setup(organisation_id,user_id,preferences,status) values($1,$2,'{"name":"Spoofed","email":"agent@example.com","detailsConfirmed":true}','complete')`, [org, owner]), /row-level security/)
await assert.rejects(db.query(`update public.marketing_campaign_agent_setup set user_id=$1,revision=2 where user_id=$2`, [owner, colleague]), /permission denied/)
await assert.rejects(db.query(`update public.marketing_campaign_agent_setup set preferences='{"name":"No contact","detailsConfirmed":true}',revision=2 where user_id=$1`, [colleague]), /check constraint/)
await login(owner, 'yes')
assert.equal((await db.query('select * from public.marketing_campaign_agent_setup')).rows.length, 0) // administrators cannot read another agent's personal draft
await login(outsider)
assert.equal((await db.query('select * from public.marketing_campaign_setup')).rows.length, 0)
assert.equal((await db.query('select * from public.marketing_campaign_agent_setup')).rows.length, 0)
await db.exec('reset role; set role anon')
await assert.rejects(db.query('select * from public.marketing_campaign_setup'), /permission denied/)
await assert.rejects(db.query('select * from public.marketing_campaign_agent_setup'), /permission denied/)
// Phase 3 is tested against local, RLS-protected listing fixtures only.
await db.exec(`reset role;
create table public.private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid,listing_category text default 'private_sale',listing_status text default 'active');
alter table public.private_listings enable row level security;
create policy listing_read on public.private_listings for select to authenticated using(public.bridge_is_active_member(organisation_id));
grant select on public.private_listings to authenticated;
insert into public.private_listings(id,organisation_id,assigned_agent_id) values('33333333-3333-4333-8333-333333333333','${org}','${owner}'),('44444444-4444-4444-8444-444444444444','${other}','${owner}'),('55555555-5555-4555-8555-555555555555','${org}','${colleague}');`)
await db.exec(readFileSync('supabase/migrations/20261023124339_marketing_campaign_listing_builder.sql','utf8'))
await login(owner)
const listingBuilder = {version:1,template:'new-listing',listingId:'33333333-3333-4333-8333-333333333333',agentId:owner,source:{title:'Sunny home',location:'Gardens',agencyName:'Oak & Stone'}}
const listingPlan = (await db.query(`insert into public.marketing_campaigns(organisation_id,name,goal,objective,planned_channels,listing_builder) values($1,'Just Listed','promote_listing','Book viewings',array['social','email','whatsapp'],$2) returning *`,[org,JSON.stringify(listingBuilder)])).rows[0]
assert.deepEqual(listingPlan.listing_builder,listingBuilder)
for (const bad of [
  {...listingBuilder,version:2},
  {...listingBuilder,source:{sellerEmail:'private@example.test'}},
  {...listingBuilder,source:{title:{raw:'private'}}},
  {...listingBuilder,listingId:'44444444-4444-4444-8444-444444444444'},
  {...listingBuilder,listingId:'55555555-5555-4555-8555-555555555555',agentId:colleague},
  {...listingBuilder,agentId:colleague},
]) await assert.rejects(db.query('update public.marketing_campaigns set listing_builder=$1,revision=2 where id=$2',[JSON.stringify(bad),listingPlan.id]),/Invalid listing draft|no longer available/)
await assert.rejects(db.query("update public.marketing_campaigns set status='active',revision=2 where id=$1",[listingPlan.id]),/check constraint/)
await login(colleague)
assert.equal((await db.query('update public.marketing_campaigns set revision=2 where id=$1 returning id',[listingPlan.id])).rows.length,0)
await login(owner,'yes')
const reassigned = {...listingBuilder,listingId:'55555555-5555-4555-8555-555555555555',agentId:colleague}
assert.equal((await db.query('update public.marketing_campaigns set listing_builder=$1,revision=2 where id=$2 returning revision',[JSON.stringify(reassigned),listingPlan.id])).rows[0].revision,2)
await assert.rejects(db.query('update public.marketing_campaigns set revision=2 where id=$1',[listingPlan.id]),/Reload/)
await db.exec("reset role; update public.private_listings set listing_status='sold' where id='55555555-5555-4555-8555-555555555555'")
await login(owner,'yes')
await assert.rejects(db.query('update public.marketing_campaigns set revision=3 where id=$1',[listingPlan.id]),/no longer available/)
await login(outsider)
assert.equal((await db.query('select * from public.marketing_campaigns where id=$1',[listingPlan.id])).rows.length,0)
// Property campaign expansion: every collection item and referenced event is scoped.
await db.exec(`reset role;
alter table public.private_listings add column listing_visibility text default 'internal';
insert into public.private_listings(id,organisation_id,assigned_agent_id,listing_status) values
('66666666-6666-4666-8666-666666666666','${org}','${owner}','active'),
('77777777-7777-4777-8777-777777777777','${org}','${owner}','active'),
('88888888-8888-4888-8888-888888888888','${org}','${owner}','mandate_signed'),
('99999999-9999-4999-8999-999999999999','${org}','${owner}','sold');
create table public.marketing_events(id uuid primary key,organisation_id uuid,subject_id uuid,event_type text,status text,metadata jsonb,starts_at timestamptz,ends_at timestamptz,subject_type text default 'listing');
alter table public.marketing_events enable row level security;
create policy event_read on public.marketing_events for select to authenticated using(public.bridge_is_active_member(organisation_id));
grant select on public.marketing_events to authenticated;
insert into public.marketing_events(id,organisation_id,subject_id,event_type,status,metadata,starts_at,ends_at) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${org}','33333333-3333-4333-8333-333333333333','show_day','upcoming','{"visibility":"public"}','2099-11-20T08:00:00Z','2099-11-20T10:00:00Z');`)
await db.exec(readFileSync('supabase/migrations/20261023132334_marketing_property_campaign_builders.sql','utf8'))
await login(owner)
const propertyDraft = (template, listingId='33333333-3333-4333-8333-333333333333', settings={}) => ({version:2,template,listingId,agentId:owner,source:{title:'Home',location:'Area',price:''},additionalListings:[],settings})
const insertProperty = (builder, goal=builder.template==='just-sold'?'seller_leads':'promote_listing') => db.query(`insert into public.marketing_campaigns(organisation_id,name,goal,objective,planned_channels,listing_builder) values($1,'Property draft',$2,'Enquiries',array['social','email','whatsapp'],$3) returning *`,[org,goal,JSON.stringify(builder)])
await insertProperty(propertyDraft('property-spotlight'))
const collection=propertyDraft('property-collection')
collection.additionalListings=['66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777'].map(listingId=>({listingId,agentId:owner,source:{title:'Home'}}))
await insertProperty(collection)
for(const changed of [
 {...collection,additionalListings:[]},
 {...collection,additionalListings:[collection.additionalListings[0],collection.additionalListings[0]]},
 {...collection,additionalListings:[collection.additionalListings[0],{listingId:'44444444-4444-4444-8444-444444444444',agentId:owner,source:{title:'Foreign'}}]},
 {...collection,additionalListings:[collection.additionalListings[0],{listingId:'55555555-5555-4555-8555-555555555555',agentId:colleague,source:{title:'Not assigned'}}]},
]) await assert.rejects(insertProperty(changed),/Invalid listing draft|no longer available/)
const teaser=propertyDraft('coming-soon','88888888-8888-4888-8888-888888888888',{publicationConfirmed:true})
await insertProperty(teaser)
await assert.rejects(insertProperty({...teaser,source:{...teaser.source,price:'R 1'}}),/Invalid listing draft/)
await assert.rejects(insertProperty({...teaser,settings:{...teaser.settings,feature:'Unapproved private feature'}}),/Invalid listing draft/)
await assert.rejects(insertProperty({...teaser,listingId:collection.listingId}),/no longer available/)
const sold=propertyDraft('just-sold','99999999-9999-4999-8999-999999999999',{publicationConfirmed:true})
await insertProperty(sold)
await assert.rejects(insertProperty({...sold,source:{...sold.source,price:'R 100'}}),/Invalid listing draft/)
await assert.rejects(insertProperty({...sold,listingId:collection.listingId}),/no longer available/)
const reduced=propertyDraft('price-reduced',collection.listingId,{priceConfirmed:true});reduced.source.price='R 100'
await insertProperty(reduced)
await assert.rejects(insertProperty({...reduced,settings:{priceConfirmed:false}}),/Invalid listing draft/)
const show=propertyDraft('show-day',collection.listingId,{eventId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',date:'2099-11-20',startTime:'10:00',endTime:'12:00'})
await insertProperty(show)
await assert.rejects(insertProperty({...show,settings:{...show.settings,startTime:'09:00'}}),/public show day changed/)
await assert.rejects(insertProperty({...show,settings:{date:'2020-01-01',startTime:'10:00',endTime:'12:00'}}),/future show day/)
await assert.rejects(insertProperty({...show,settings:{date:'2099-02-30',startTime:'10:00',endTime:'12:00'}}),/Invalid listing draft/)
await assert.rejects(insertProperty({...show,settings:{...show.settings,untrusted:{raw:'private'}}}),/Invalid listing draft/)
await db.exec("reset role; update public.marketing_events set status='cancelled'")
await login(owner)
await assert.rejects(insertProperty(show),/public show day changed/)
await insertProperty(listingBuilder) // old version remains compatible
// Phase 6 keeps the same campaign permissions and stores public campaign material only.
await db.exec("reset role")
await db.exec(readFileSync('supabase/migrations/20261023140030_marketing_general_campaign_builders.sql','utf8'))
await login(owner)
const publicCampaign={version:1,template:'buyers',agentId:owner,source:{agencyName:'Oak',agentName:'Sarah',destination:'sarah@example.test',language:'en-ZA'},details:{area:'Gardens'},reviewed:true,permission:false}
const insertGeneral=async(builder,goal='buyer_leads',organisationId=org)=>db.query("insert into public.marketing_campaigns(organisation_id,name,goal,objective,planned_channels,campaign_builder) values($1,'General campaign',$2,'Invite enquiries',array['social','email','whatsapp'],$3) returning *",[organisationId,goal,JSON.stringify(builder)])
const generalPlan=(await insertGeneral(publicCampaign)).rows[0]
assert.deepEqual(generalPlan.campaign_builder,publicCampaign)
for(const bad of [
 {...publicCampaign,version:2}, {...publicCampaign,reviewed:false},
 {...publicCampaign,agentId:colleague}, {...publicCampaign,source:{...publicCampaign.source,privateClientEmail:'secret@example.test'}},
 {...publicCampaign,details:{area:'Gardens',buyerEmail:'secret@example.test'}},
 {...publicCampaign,source:{...publicCampaign.source,photoUrl:'javascript:alert(1)'}},
 {...publicCampaign,source:{...publicCampaign.source,language:'unknown'}},
]) await assert.rejects(insertGeneral(bad),/Invalid public campaign|own agent/)
await assert.rejects(insertGeneral(publicCampaign,'custom'),/check constraint/)
await assert.rejects(insertGeneral(publicCampaign,'buyer_leads',other),/row-level security/)
await assert.rejects(db.query("update public.marketing_campaigns set status='active',revision=revision+1 where id=$1",[generalPlan.id]),/check constraint/)
const variants={
 sellers:{offer:'Property valuation by appointment'},
 'thinking-of-selling':{checklist:'Review the property information'},
 'buyer-demand':{brief:'Three-bedroom home in Gardens',briefExpires:'2099-10-30'},
 'first-time-buyer':{checklist:'List preferred areas'},
 'meet-your-agent':{bio:'Local property help'},
 'client-success':{quote:'Helpful service',attribution:'A local client',context:'Help with a property sale'},
 'market-update':{summary:'Reviewed report summary',period:'September 2026',reportSource:'Local report, issue 10',reportDate:'2026-09-30'},
}
for(const [template,details] of Object.entries(variants)){
 const goal=['sellers','thinking-of-selling','buyer-demand'].includes(template)?'seller_leads':template==='first-time-buyer'?'buyer_leads':'custom'
 const builder={...publicCampaign,template,permission:['buyer-demand','client-success'].includes(template),details:{area:'Gardens',...details},source:{...publicCampaign.source,...(template==='meet-your-agent'?{photoUrl:'https://example.test/portrait.jpg'}:{})}}
 await insertGeneral(builder,goal)
 if(builder.permission)await assert.rejects(insertGeneral({...builder,permission:false},goal),/Invalid public campaign/)
 if(template==='buyer-demand'){
  await assert.rejects(insertGeneral({...builder,details:{...builder.details,briefExpires:'2020-01-01'}},goal),/expired/)
  await assert.rejects(insertGeneral({...builder,details:{...builder.details,briefExpires:'2099-02-30'}},goal),/Invalid public campaign/)
 }
 if(template==='market-update'){
  await assert.rejects(insertGeneral({...builder,details:{...builder.details,reportSource:''}},goal),/Invalid public campaign/)
  await assert.rejects(insertGeneral({...builder,details:{...builder.details,reportDate:'2099-01-01'}},goal),/future/)
 }
}
await login(colleague)
assert.equal((await db.query("update public.marketing_campaigns set name='Unauthorised edit',revision=revision+1 where id=$1 returning id",[generalPlan.id])).rows.length,0)
await login(owner)
assert.equal((await db.query('select name from public.marketing_campaigns where id=$1',[generalPlan.id])).rows[0].name,'General campaign')
await login(owner,'yes')
await insertGeneral({...publicCampaign,agentId:colleague})
await login(outsider)
assert.equal((await db.query('select * from public.marketing_campaigns where id=$1',[generalPlan.id])).rows.length,0)
await db.exec('reset role; set role anon')
await assert.rejects(db.query('select campaign_builder from public.marketing_campaigns'),/permission denied/)
// Phase 7 relationship campaigns reuse the campaign contract and existing transaction RLS.
await db.exec(`reset role;
create table public.transactions(id uuid primary key,organisation_id uuid,owner_user_id uuid,assigned_user_id uuid,assigned_agent_id uuid,transaction_reference text,suburb text,city text,listing_id uuid,lifecycle_state text,stage text,current_main_stage text,deleted_at timestamptz,cancelled_at timestamptz,buyer_name text);
alter table public.transactions enable row level security;
create policy transaction_read on public.transactions for select to authenticated using(organisation_id='${org}' and auth.uid() in ('${owner}','${colleague}'));
grant select on public.transactions to authenticated;
insert into public.transactions(id,organisation_id,owner_user_id,transaction_reference,suburb,lifecycle_state,buyer_name) values
('11111111-aaaa-4111-8111-111111111111','${org}','${owner}','A9-100','Gardens','completed','Private client'),
('22222222-aaaa-4222-8222-222222222222','${org}','${colleague}','A9-200','Gardens','completed','Private colleague client'),
('33333333-aaaa-4333-8333-333333333333','${other}','${owner}','A9-300','Gardens','completed','Private foreign client'),
('44444444-aaaa-4444-8444-444444444444','${org}','${owner}','A9-400','Gardens','active','Private active client'),
('55555555-aaaa-4555-8555-555555555555','${org}','${owner}','A9-500','Gardens','cancelled','Private cancelled client');
`)
await db.exec(readFileSync('supabase/migrations/20261023144949_marketing_relationship_campaign_builders.sql','utf8'))
await login(owner)
const choices=(await db.query('select * from public.marketing_handover_choices($1)',[org])).rows
assert.deepEqual(choices,[{id:'11111111-aaaa-4111-8111-111111111111',reference:'A9-100',area:'Gardens',listing_id:null}])
const handover={...publicCampaign,template:'key-handover',permission:true,details:{area:'Gardens',transactionId:choices[0].id,variant:'buyer',publicName:'',imageId:''}}
await insertGeneral(handover,'reengage')
for(const transactionId of ['22222222-aaaa-4222-8222-222222222222','33333333-aaaa-4333-8333-333333333333','44444444-aaaa-4444-8444-444444444444','55555555-aaaa-4555-8555-555555555555'])await assert.rejects(insertGeneral({...handover,details:{...handover.details,transactionId}},'reengage'),/permitted completed transaction/)
await assert.rejects(insertGeneral({...handover,permission:false},'reengage'),/Invalid public campaign/)
await assert.rejects(insertGeneral({...handover,details:{...handover.details,variant:'other'}},'reengage'),/Invalid public campaign/)
await assert.rejects(insertGeneral({...handover,details:{...handover.details,buyerEmail:'private@example.test'}},'reengage'),/Invalid public campaign/)
await insertGeneral({...publicCampaign,template:'referral-request'},'reengage')
await assert.rejects(insertGeneral({...publicCampaign,template:'referral-request'},'custom'),/check constraint/)
const review={...publicCampaign,template:'review-request',source:{...publicCampaign.source,reviewUrl:'https://example.test/review'},details:{area:'Gardens',reviewUrl:'https://example.test/review'}}
const insertReview=builder=>db.query("insert into public.marketing_campaigns(organisation_id,name,goal,objective,planned_channels,campaign_builder) values($1,'Review','reengage','Invite honest feedback',array['email','whatsapp'],$2) returning id",[org,JSON.stringify(builder)])
await insertReview(review)
await assert.rejects(insertGeneral(review,'reengage'),/check constraint/)
for(const reviewUrl of ['javascript:alert(1)','http://example.test','https://user:secret@example.test',''])await assert.rejects(insertReview({...review,details:{...review.details,reviewUrl}}),/Invalid public campaign/)
await assert.rejects(insertReview({...review,source:{...review.source,reviewUrl:'https://user:secret@example.test'}}),/Invalid public campaign/)
await insertGeneral(publicCampaign)
await login(owner,'yes')
assert.equal((await db.query('select * from public.marketing_handover_choices($1)',[org])).rows.length,2)
await insertGeneral({...handover,details:{...handover.details,transactionId:'22222222-aaaa-4222-8222-222222222222'}},'reengage')
await login(outsider)
assert.equal((await db.query('select * from public.marketing_handover_choices($1)',[org])).rows.length,0)
await db.exec('reset role;set role anon')
await assert.rejects(db.query('select * from public.marketing_handover_choices($1)',[org]),/permission denied/)
// Channel templates use the same agency publication rules as campaign playbooks.
await db.exec('reset role')
await db.exec(readFileSync('supabase/migrations/20261024205843_marketing_channel_template_library.sql', 'utf8'))
await login(owner)
const channelTemplate = (await db.query(
  "insert into public.marketing_channel_templates(organisation_id,name,channel,title,body) values($1,'Valuation email','email','Your valuation','Hello [first name]') returning *", [org],
)).rows[0]
await assert.rejects(db.query("insert into public.marketing_channel_templates(organisation_id,name,channel,title,body,visibility) values($1,'Agency email','email','Hello','Copy','agency')", [org]), /row-level security/)
await assert.rejects(db.query("insert into public.marketing_channel_templates(organisation_id,name,channel,title,body) values($1,'Foreign','email','Hello','Copy')", [other]), /row-level security/)
await assert.rejects(db.query("update public.marketing_channel_templates set name='Stale' where id=$1", [channelTemplate.id]), /Reload/)
await db.query("update public.marketing_channel_templates set name='Updated email',revision=2 where id=$1", [channelTemplate.id])
await assert.rejects(db.query("update public.marketing_channel_templates set organisation_id=$1,revision=3 where id=$2", [other,channelTemplate.id]), /permission denied/)
await assert.rejects(db.query("insert into public.marketing_channel_templates(organisation_id,name,channel,title,body,destination_url) values($1,'Unsafe','email','Hello','Copy','https://user:secret@example.test')",[org]),/check constraint/)
await assert.rejects(db.query("insert into public.marketing_channel_templates(organisation_id,name,channel,title,body) values($1,'No subject','email','','Copy')",[org]),/check constraint/)
await login(colleague)
assert.equal((await db.query('select * from public.marketing_channel_templates')).rows.length,0)
await login(owner,'yes')
const agencyChannel = (await db.query("insert into public.marketing_channel_templates(organisation_id,name,channel,title,body,visibility) values($1,'Agency email','email','Hello','Agency copy','agency') returning *",[org])).rows[0]
await login(colleague)
assert.equal((await db.query('select * from public.marketing_channel_templates')).rows.length,1)
assert.equal((await db.query("update public.marketing_channel_templates set body='Not allowed',revision=2 where id=$1 returning id",[agencyChannel.id])).rows.length,0)
await login(colleague,'yes')
assert.equal((await db.query("update public.marketing_channel_templates set body='Manager edit',revision=2 where id=$1 returning id",[agencyChannel.id])).rows.length,1)
assert.equal((await db.query('select * from public.marketing_channel_templates where id=$1',[channelTemplate.id])).rows.length,0)
await login(outsider,'yes')
assert.equal((await db.query('select * from public.marketing_channel_templates')).rows.length,0)
await db.exec('reset role;set role anon')
await assert.rejects(db.query('select * from public.marketing_channel_templates'),/permission denied/)
await db.exec('reset role')
await db.exec(readFileSync('supabase/migrations/20261025193016_chatgpt_ads_studio.sql', 'utf8'))
await login(owner)
const chatgptTemplate = (await db.query("insert into public.marketing_channel_templates(organisation_id,name,channel,title,body) values($1,'Property discovery','chatgpt','Explore this home','See saved property details') returning *", [org])).rows[0]
assert.equal(chatgptTemplate.channel, 'chatgpt')
const chatgptPlan = (await db.query("insert into public.marketing_campaigns(organisation_id,name,goal,objective,planned_channels,channel_content) values($1,'ChatGPT property','custom','Property discovery',array['chatgpt'],'{\"chatgpt\":{\"title\":\"Home\",\"body\":\"Explore this listing\"}}') returning *", [org])).rows[0]
assert.equal(chatgptPlan.status, 'draft')
assert.deepEqual(chatgptPlan.planned_channels, ['chatgpt'])
await db.query("insert into public.marketing_campaign_templates(organisation_id,name,goal,objective,planned_channels,run_mode,duration_days) values($1,'All five channels','custom','Property discovery',array['email','whatsapp','meta','social','chatgpt'],'bounded',14)", [org])
await assert.rejects(db.query("insert into public.marketing_channel_templates(organisation_id,name,channel,title,body) values($1,'Unsupported','unknown','Home','Copy')", [org]), /check constraint/)
await assert.rejects(db.query("insert into public.marketing_channel_templates(organisation_id,name,channel,title,body) values($1,'Foreign ad','chatgpt','Home','Copy')", [other]), /row-level security/)
await login(colleague)
assert.equal((await db.query('select * from public.marketing_channel_templates where id=$1', [chatgptTemplate.id])).rows.length, 0)
assert.equal((await db.query("update public.marketing_channel_templates set body='Not mine',revision=2 where id=$1 returning id", [chatgptTemplate.id])).rows.length, 0)
await db.close()
console.log(
  'Campaign database checks passed: agency isolation, permissions, linking, revisions, send preservation, template privacy, agency publication, first-use setup, property campaign variants, collection scope, saved public events and buyer/seller/brand/relationship campaign contracts, completed transaction scope, private review channels and channel-template privacy, sharing and revision protection.',
)
