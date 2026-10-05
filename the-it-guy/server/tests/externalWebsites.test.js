import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createExternalWebsiteDatabase, databaseClient, EXTERNAL_FIXTURE as f } from './fixtures/externalWebsiteDatabase.js'
import { createExternalWebsiteResponse, readExternalWebsiteBody } from '../services/externalWebsiteApi.js'
import { publicAddress, webhookSignature, verifyWebhook, runExternalWebsiteWorker, createExternalWebsiteWorkerResponse, deliverExternalWebhook } from '../services/externalWebsiteDelivery.js'

let db, client, connection
const config = (overrides = {}) => ({ name: 'Revo non-production example', website_url: 'https://revo.example.test', mode: 'listings_and_leads', scope: 'branches', branch_ids: [f.branch], development_id: null, fallback_user_id: f.principal, enabled: true, public_contacts: false, include_sold: false, include_rented: false, webhook_url: 'https://revo.example.test/arch9/webhook', ...overrides })
async function manage(action, id, value={}) { const {data,error}=await client.rpc('external_website_manage',{p_organisation_id:f.revo,p_action:action,p_connection_id:id || null,p_config:value}); if(error)throw error; return data }
const api = (path='listings', options={}) => createExternalWebsiteResponse({url:`/api/integrations/v1/${path}`,headers:{authorization:`Bearer ${connection.credential}`},client,...options})
const lead = (overrides={}) => ({name:'Example Buyer',email:'example-buyer@example.test',message:'Please arrange a viewing',sourcePageUrl:'https://revo.example.test/property',listingId:f.sale,idempotencyKey:'submission-example-0001',consent:{privacyAccepted:true,marketingConsent:false,wording:'Use my details to respond to my enquiry.',wordingVersion:'privacy-v1'},...overrides})
before(async()=>{ db=await createExternalWebsiteDatabase();client=databaseClient(db);connection=await manage('create',null,config()) })
after(async()=>{if(db)await db.close()})

test('Revo administrators only; credentials are shown once and client table access is denied',async()=>{
  assert.match(connection.credential,/^a9w_/)
  const overview=await manage('list');assert.equal(overview.connections.length,1);assert.equal(JSON.stringify(overview).includes(connection.credential),false);assert.equal(JSON.stringify(overview).includes('token_hash'),false)
  await db.query("select set_config('test.user_id',$1,false)",[f.agent]);await assert.rejects(manage('list'),/administrator/)
  await db.query("select set_config('test.user_id',$1,false)",[f.principal]);
  assert.equal((await client.rpc('external_website_manage',{p_organisation_id:f.org,p_action:'list'})).error.code,'42501')
  const privileges=await db.query("select has_table_privilege('authenticated','external_website_connections','select') as access,has_function_privilege('anon','external_website_request(uuid,text,text,jsonb)','execute') as rpc")
  assert.equal(privileges.rows[0].access,false);assert.equal(privileges.rows[0].rpc,false)
})
test('scope, public allow-list, draft exclusion, safe media, pagination and filters',async()=>{
  await db.query("insert into listing_media(listing_id,media_type,file_url,sort_order) values($1,'image','https://cdn.example.test/second.jpg',2),($1,'image','https://cdn.example.test/first.jpg',1),($1,'other','https://cdn.example.test/private.pdf',0),($1,'image','https://project.supabase.co/storage/v1/object/sign/documents/secret?token=hidden',0)",[f.sale])
  await db.query('update private_listings set branch_id=$1 where id=$2',[f.otherBranch,f.rental])
  const response=await api();assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.length,1)
  const property=response.body.data[0];assert.equal(property.id,f.sale);assert.equal(property.photos[0].url,'https://cdn.example.test/first.jpg');assert.equal(property.photos.length,2);assert.equal(property.agent,null);assert.equal(property.location.address,undefined);assert.equal(property.seller,undefined);assert.equal(property.notes,undefined)
  assert.equal((await api(`listings/${f.rental}`)).status,404)
  assert.equal((await api('listings?minPrice=999999999')).body.data.length,0);assert.equal((await api('listings?bedrooms=3')).body.data.length,0)
  assert.equal((await api('listings?location=Sea&sort=price_asc&limit=1')).body.pagination.total,1)
  await db.query("update listing_publication_data set status='Draft' where listing_id=$1",[f.sale]);assert.equal((await api(`listings/${f.sale}`)).status,404)
  await db.query("update listing_publication_data set status='Published' where listing_id=$1",[f.sale])
})
test('prepared public website media is reused only for current same-organisation marketing assets',async()=>{
  const media=(await db.query("insert into listing_media(listing_id,media_type,file_url,sort_order) values($1,'image','https://project.supabase.co/storage/v1/object/sign/private-listing-media/photo.jpg?token=private',3) returning id",[f.sale])).rows[0].id
  const url='https://project.supabase.co/storage/v1/object/public/listing-media/prepared.jpg'
  const cursor=(await api('changes')).body.nextCursor
  const asset=(await db.query("insert into website_listing_media_assets(website_site_id,listing_id,source_media_id,media_type,public_url) values($1,$2,$3,'image',$4) returning id",[f.site,f.sale,media,url])).rows[0].id
  assert.equal((await api(`listings/${f.sale}`)).body.data.photos.some(photo=>photo.url===url),false)
  const site='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  await db.query("insert into website_sites(id,organisation_id,status) values($1,$2,'published')",[site,f.revo])
  await db.query('update website_listing_media_assets set website_site_id=$1 where id=$2',[site,asset])
  assert.equal((await api(`listings/${f.sale}`)).body.data.photos.at(-1).url,url)
  assert.ok((await api(`changes?cursor=${cursor}`)).body.data.length>0)
  await db.query("update website_listing_media_assets set status='retired' where id=$1",[asset])
  assert.equal((await api(`listings/${f.sale}`)).body.data.photos.some(photo=>photo.url===url),false)
  assert.equal(JSON.stringify((await api(`listings/${f.sale}`)).body).includes('token=private'),false)
})
test('publication updates and withdrawals have replayable tombstones, including scope changes',async()=>{
  const cursor=(await api('changes')).body.nextCursor
  await db.query("update listing_publication_data set asking_price=2000000,updated_at=clock_timestamp() where listing_id=$1",[f.sale])
  assert.equal((await api(`listings/${f.sale}`)).body.data.price,2000000)
  assert.equal((await api('listings?updatedSince=2000-01-01T00:00:00Z')).body.data.length,1)
  await db.query("update private_listings set listing_status='withdrawn' where id=$1",[f.sale]);assert.equal((await api(`listings/${f.sale}`)).status,404)
  const changes=await api(`changes?cursor=${cursor}&limit=1`);assert.equal(changes.body.hasMore,true)
  const removal=await api(`changes?cursor=${changes.body.nextCursor}`);assert.equal(removal.body.data.at(-1).type,'listing.withdrawn')
  await db.query("update private_listings set listing_status='active' where id=$1",[f.sale])
  await manage('save',connection.connection.id,config({scope:'development',branch_ids:[],development_id:f.development}));assert.equal((await api()).body.data.length,2)
  await manage('save',connection.connection.id,config());assert.equal((await api('changes')).body.data.filter(e=>e.listingId===f.rental).at(-1).type,'listing.withdrawn')
})
test('canonical CRM routing, contact reuse, idempotency, separate properties and consent',async()=>{
  const response=await api('leads',{method:'POST',body:lead()});assert.equal(response.status,201,JSON.stringify(response.body));assert.ok(response.body.leadId)
  const repeat=await api('leads',{method:'POST',body:lead()});assert.equal(repeat.status,200);assert.equal(repeat.body.leadId,response.body.leadId)
  assert.equal((await api('leads',{method:'POST',body:lead({message:'different'})})).status,409)
  await db.query('update private_listings set branch_id=$1 where id=$2',[f.branch,f.rental])
  const second=await api('leads',{method:'POST',body:lead({listingId:f.rental,idempotencyKey:'submission-example-0002'})});assert.equal(second.status,201);assert.notEqual(second.body.leadId,response.body.leadId)
  const records=await db.query('select * from leads where organisation_id=$1',[f.revo]);assert.equal(records.rows.length,2);assert.equal(records.rows[0].contact_id,records.rows[1].contact_id);assert.equal(records.rows[0].assigned_agent_id,f.agent)
  const receipts=await db.query('select consent_json from website_lead_submissions where external_connection_id=$1',[connection.connection.id]);assert.equal(receipts.rows[0].consent_json.marketingConsent,false);assert.equal(receipts.rows[0].consent_json.evidence.wordingVersion,'privacy-v1')
  const notifications=await db.query('select * from notification_events where organisation_id=$1',[f.revo]);assert.equal(notifications.rows.length,2);assert.equal(notifications.rows[0].assigned_user_id,f.principal)
  assert.equal((await db.query('select count(*)::int as n from lead_activities where organisation_id=$1',[f.revo])).rows[0].n,2)
})
test('leads-only development sites use fallback; cross-organisation and invalid targets are rejected',async()=>{
  const original=connection
  connection=await manage('create',null,config({mode:'leads_only',scope:'development',branch_ids:[],development_id:f.development,webhook_url:''}))
  assert.equal((await api()).status,403)
  await db.query('update private_listings set assigned_agent_id=null where id=$1',[f.sale])
  const accepted=await api('leads',{method:'POST',body:lead({developmentId:f.development})});assert.equal(accepted.status,201,JSON.stringify(accepted.body))
  assert.equal((await db.query('select assigned_agent_id from leads where lead_id=$1',[accepted.body.leadId])).rows[0].assigned_agent_id,f.principal)
  assert.equal((await api('leads',{method:'POST',body:lead({listingId:'99999999-9999-4999-8999-999999999999',idempotencyKey:'bad-target-test-0001'})})).status,404)
  await db.query('update private_listings set organisation_id=$1 where id=$2',[f.org,f.sale]);assert.equal((await api('leads',{method:'POST',body:lead({idempotencyKey:'bad-crossorg-test-0001'})})).status,404)
  await db.query('update private_listings set organisation_id=$1,assigned_agent_id=$2 where id=$3',[f.revo,f.agent,f.sale])
  const general=lead({idempotencyKey:'general-development-0001',developmentId:f.development});delete general.listingId
  assert.equal((await api('leads',{method:'POST',body:general})).status,201)
  connection=original
})
test('signatures, retry backoff, failure visibility and authorised retry',async()=>{
  const now=Date.now(), timestamp=String(Math.floor(now/1000)), body='{"test":true}', signature=webhookSignature('fixture-secret',timestamp,body)
  assert.equal(verifyWebhook('fixture-secret',timestamp,body,signature,now),true);assert.equal(verifyWebhook('fixture-secret',timestamp,body+' ',signature,now),false);assert.equal(verifyWebhook('fixture-secret',timestamp,body,signature,now+400000),false)
  await runExternalWebsiteWorker({client,deliver:async()=>503,dispatchNotification:async()=>{}})
  const retry=await db.query("select * from external_website_deliveries where connection_id=$1 and status='retry'",[connection.connection.id]);assert.ok(retry.rows.length>0);assert.ok(new Date(retry.rows[0].next_attempt_at)>new Date(retry.rows[0].completed_at))
  assert.ok((await manage('detail',connection.connection.id)).connection.recentFailures>0)
  await manage('retry',connection.connection.id,{delivery_id:retry.rows[0].id});await runExternalWebsiteWorker({client,deliver:async()=>200,dispatchNotification:async()=>{}})
  assert.equal((await db.query('select status from external_website_deliveries where id=$1',[retry.rows[0].id])).rows[0].status,'delivered')
  await db.query("update listing_publication_data set description='Changed' where listing_id=$1",[f.sale]);await runExternalWebsiteWorker({client,deliver:async()=>400,dispatchNotification:async()=>{}})
  assert.ok((await db.query("select count(*)::int as n from external_website_deliveries where status='failed'")).rows[0].n>0)
})
test('rotation, revocation and disabled connections stop API access and queued deliveries',async()=>{
  const rotated=await manage('rotate',connection.connection.id);assert.equal((await api()).status,401);connection=rotated;assert.equal((await api()).status,200)
  await manage('save',connection.connection.id,config({enabled:false}));assert.equal((await api()).status,401)
  let attempts=0;await runExternalWebsiteWorker({client,deliver:async()=>{attempts++;return 200},dispatchNotification:async()=>{}});assert.equal(attempts,0)
  await manage('save',connection.connection.id,config());await manage('revoke',connection.connection.id);assert.equal((await api()).status,401)
})
test('SSRF, query validation, payload limit and cron authorisation',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1']) assert.equal(publicAddress(ip),false,ip)
  assert.equal(publicAddress('8.8.8.8'),true)
  await assert.rejects(deliverExternalWebhook({secret:'x'.repeat(64),url:'https://public.example.test/hook',event:{}},{resolveHost:async()=>[{address:'127.0.0.1',family:4}]}),/unsafe/)
  assert.equal((await createExternalWebsiteWorkerResponse({method:'GET',headers:{},env:{CRON_SECRET:'fixture'}})).status,401)
  assert.equal((await api('listings?sort=sql_injection')).status,400)
  assert.equal((await api('leads',{method:'POST',body:lead({message:'a'.repeat(17000)})})).status,413)
  await assert.rejects(readExternalWebsiteBody({headers:{},body:'a'.repeat(17000)}),/16 KiB/)
})

test('hosted website callers still use their original command and receipt source',async()=>{
  await db.query("insert into website_pilot_enrolments values($1,'active')",[f.org])
  const page=(await db.query("select id from website_pages where page_kind='home' limit 1")).rows[0].id
  const result=await client.rpc('website_capture_lead_submission',{p_hostname:f.host,p_submission_type:'general_enquiry',p_page_id:page,p_name:'Hosted Visitor',p_email:'hosted@example.test',p_privacy_accepted:true,p_idempotency_key:'hosted-after-migration-0001'})
  assert.equal(result.error,null);assert.equal(result.data.accepted,true)
  const receipt=(await db.query('select website_site_id,external_connection_id from website_lead_submissions where id=$1',[result.data.receiptId])).rows[0]
  assert.equal(receipt.website_site_id,f.site);assert.equal(receipt.external_connection_id,null)
})
test('real rate limits, public contact opt-in, stale claims, delete tombstones and invalid configuration',async()=>{
  const original=connection
  connection=await manage('create',null,config({scope:'organisation',branch_ids:[],public_contacts:true}))
  const listing=(await api(`listings/${f.sale}`)).body.data;assert.equal(listing.agent.id,f.agent)
  const cursor=(await api('changes')).body.nextCursor
  await db.query("update organisation_users set first_name='Changed' where organisation_id=$1 and user_id=$2",[f.revo,f.agent]);assert.ok((await api(`changes?cursor=${cursor}`)).body.data.length>0)
  await db.query('delete from private_listings where id=$1',[f.rental]);assert.equal((await api('changes')).body.data.filter(event=>event.listingId===f.rental).at(-1).type,'listing.withdrawn')
  await assert.rejects(manage('save',connection.connection.id,config({branch_ids:['99999999-9999-4999-8999-999999999999']})),/approved organisation scope/)
  await runExternalWebsiteWorker({client,deliver:async()=>503,dispatchNotification:async()=>{}})
  await db.exec("update external_website_deliveries set status='processing',claimed_at=now()-interval '10 minutes' where status='retry'")
  const claims=await client.rpc('external_website_claim_deliveries',{p_limit:20});assert.equal(claims.error,null);assert.ok(claims.data.length>0)
  for(let index=0;index<130;index++) { const result=await api(); if(result.status===429) { assert.equal(result.headers['Retry-After'],'60');connection=original;return } }
  assert.fail('Connection request limit was not enforced')
})
