import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { campaignFacebookSource, publicCampaignFacebookPost } from '../../supabase/functions/_shared/campaignFacebookPost.js'
import { assertFreshCampaignFacebookContacts } from '../../supabase/functions/_shared/campaignFacebookContacts.js'
import { createMetaIntegrationHandler } from '../../supabase/functions/meta-integrations/handler.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org=id(1),other=id(2),user=id(3),agent=id(4),campaignId=id(5),connection=id(6),foreignPage=id(7)
const at='2026-10-25T21:00:00.000Z'
const saved={id:campaignId,organisation_id:org,name:'Valuation invitation',status:'draft',revision:1,created_by:user,updated_at:at,planned_channels:['social','email','whatsapp'],
  campaign_builder:{version:1,template:'sellers',agentId:agent,reviewed:true,permission:false,source:{agencyName:'Oak Agency',agentName:'Avery Agent',destination:'https://agency.example.test/valuation'},contactProvenance:{version:1,source:{agentName:'Avery Agent',destination:'https://agency.example.test/valuation'},overrides:{},confirmed:true},details:{area:'Cape Town',offer:'A valuation by appointment. Terms apply.'}},
  channel_content:{social:{title:'Thinking about your next move?',body:'Ask about a valuation by appointment. Terms apply. <b>This is saved plain text.</b>'}},
  playbook:{response:{kind:'url',value:'https://app.arch9.co.za/intake/oak?campaignResponse=00000000-0000-4000-8000-000000000099',label:'Request a valuation'}},private_notes:'Never share this'}
const copy = value => JSON.parse(JSON.stringify(value))

// Runs actual handler queries and migration constraints in isolated PostgreSQL.
function sqlClient(db) {
  return {rpc:async(name,args)=>{
    try {return {data:(await db.query(`select ${name}(${Object.keys(args).map((key,index)=>`${key}=>$${index+1}`).join(',')}) value`,Object.values(args))).rows[0].value,error:null}} catch(error){return {data:null,error}}
  },from:table=>{
    let columns='*',filters=[],values=[],mutation='',mode='',ordering='',limit=''
    const bind=value=>{values.push(value&&typeof value==='object'&&!Array.isArray(value)?JSON.stringify(value):value);return `$${values.length}`}
    const query={
      select(value='*'){columns=value;return query},eq(key,value){filters.push(`${key}=${bind(value)}`);return query},
      order(key,options={}){ordering=` order by ${key} ${options.ascending===false?'desc':'asc'}`;return query},limit(value){limit=` limit ${Number(value)}`;return query},
      single(){mode='single';return query},maybeSingle(){mode='maybe';return query},
      insert(row){mutation=`insert into ${table}(${Object.keys(row).join(',')}) values(${Object.values(row).map(bind).join(',')})`;return query},
      update(row){mutation=`update ${table} set ${Object.entries(row).map(([key,value])=>`${key}=${bind(value)}`).join(',')}`;return query},
      async then(resolve){try{
        const where=filters.length?` where ${filters.join(' and ')}`:''
        const sql=mutation?`${mutation}${where} returning ${columns}`:`select ${columns} from ${table}${where}${ordering}${limit}`
        const rows=(await db.query(sql,values)).rows
        if(mode==='single'&&rows.length!==1)throw Error('Expected one row')
        return resolve({data:mode?rows[0]||null:rows,error:null})
      }catch(error){return resolve({data:null,error})}},
    };return query
  }}
}
async function fixture() {
  const db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);create table organisations(id uuid primary key);
    create table organisation_users(organisation_id uuid,user_id uuid,status text,role text);
    create table marketing_campaigns(id uuid primary key,organisation_id uuid,created_by uuid,revision integer,status text,planned_channels text[],campaign_builder jsonb,unique(id,organisation_id));
    create table meta_lead_ads_connections(id uuid primary key,organisation_id uuid,page_id text,page_name text,connection_status text,granted_scopes text[],page_tasks text[],token_ciphertext text,unique(id,organisation_id));`)
  const roleSource=readFileSync(new URL('../../supabase/migrations/202607170027_settings_role_permission_governance_phase3_2.sql',import.meta.url),'utf8')
  await db.exec(roleSource.slice(roleSource.indexOf('create or replace function public.bridge_organisation_role_authority_level'),roleSource.indexOf('$$;')+3))
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261025210451_campaign_facebook_posts.sql',import.meta.url),'utf8'))
  await db.query('insert into organisations values($1),($2)',[org,other]);await db.query('insert into auth.users values($1),($2)',[user,agent])
  await db.query("insert into organisation_users values($1,$2,'active','agent'),($1,$3,'active','agent')",[org,user,agent])
  await db.query("insert into marketing_campaigns values($1,$2,$3,1,'draft',array['social','email','whatsapp'],$4)",[campaignId,org,user,JSON.stringify(saved.campaign_builder)])
  await db.query("insert into meta_lead_ads_connections values($1,$2,'300','Oak Page','connected',array['pages_manage_posts'],array['CREATE_CONTENT'],'encrypted'),($3,$4,'400','Foreign Page','connected',array['pages_manage_posts'],array['CREATE_CONTENT'],'foreign-secret')",[connection,org,foreignPage,other])
  const runtime={campaign:copy(saved),canPublish:true,visible:true,graphCalls:[],failure:null,actor:user}
  const client=sqlClient(db)
  const handler=createMetaIntegrationHandler({db:client,authorize:async()=>({userId:runtime.actor}),now:()=>new Date(at),decrypt:async value=>{assert.equal(value,'encrypted');return 'server-only-token'},
    loadCampaign:async(_actor,targetOrg,targetId)=>runtime.visible&&targetOrg===org&&targetId===campaignId?{campaign:runtime.campaign,canPublish:runtime.canPublish}:null,
    assertCampaignPublishable:async()=>{},
    graph:async(token,path,payload)=>{runtime.graphCalls.push({path,payload});assert.equal(token,'server-only-token');if(runtime.failure)throw runtime.failure;return {id:'300_900'}},
  })
  const call=(action,fields={})=>handler({organisationId:org,action,...fields},'Bearer signed-user')
  const preview=(requestId=id(20),fields={})=>call('preview_campaign_post',{campaignId,expectedRevision:1,connectionId:connection,requestId,mode:'link',destination:'response',...fields})
  const publish=(post,fields={})=>call('publish_campaign_post',{postId:post.id,expectedRevision:1,confirmPublishNow:true,...fields})
  return {db,client,runtime,call,preview,publish}
}

test('public projection uses exact saved text and a saved HTTPS destination, with no generated claims/private fields/photos',()=>{
  const post=publicCampaignFacebookPost(saved,{mode:'link',destination:'response'},Date.parse(at))
  assert.equal(post.caption,`${saved.channel_content.social.title}\n\n${saved.channel_content.social.body}`)
  assert.equal(post.link,saved.playbook.response.value);assert.equal(post.campaignRevision,1)
  assert.ok(!JSON.stringify(post).includes('Never share'))
  assert.equal(publicCampaignFacebookPost(saved,{mode:'text'}).link,'')
  assert.throws(()=>publicCampaignFacebookPost(saved,{mode:'photo'}),/text post/)
  assert.throws(()=>publicCampaignFacebookPost(saved,{mode:'link',destination:'https://evil.example.test'}),/Save a public HTTPS/)
  for(const url of ['http://agency.example.test/a','https://127.0.0.1/a','https://10.0.0.2/a','https://user:secret@agency.example.test/a']) {
    const value=copy(saved);value.playbook=null;value.campaign_builder.source.destination=url;value.campaign_builder.contactProvenance.source.destination=url
    assert.equal(campaignFacebookSource(value).destinations.length,0)
  }
  const missing=copy(saved);missing.campaign_builder.reviewed=false
  assert.throws(()=>campaignFacebookSource(missing),/Review and save/)
  missing.campaign_builder.reviewed=true;missing.channel_content.social.body='Hello [first name]'
  assert.throws(()=>campaignFacebookSource(missing),/placeholders/)
  const expired=copy(saved);expired.campaign_builder.template='buyer-demand';expired.campaign_builder.permission=true;expired.campaign_builder.details.briefExpires='2026-10-24'
  assert.throws(()=>campaignFacebookSource(expired,Date.parse(at)),/expired/)
  expired.campaign_builder.permission=false
  assert.throws(()=>campaignFacebookSource(expired),/permission/)
  const legacy=copy(saved);delete legacy.campaign_builder.contactProvenance
  assert.throws(()=>campaignFacebookSource(legacy),/Older drafts/)
  legacy.campaign_builder.contactProvenance=copy(saved.campaign_builder.contactProvenance);legacy.campaign_builder.contactProvenance.confirmed=false
  assert.throws(()=>campaignFacebookSource(legacy),/Confirm the current public contacts/)
  legacy.campaign_builder.contactProvenance.confirmed=true;legacy.campaign_builder.source.destination='https://unreviewed.example.test'
  assert.throws(()=>campaignFacebookSource(legacy),/does not match/)
})

test('saved Social headlines appear once while distinct titles and body bytes remain unchanged',()=>{
  const value=copy(saved),title='Your next move — in Cape Town'
  value.channel_content.social.title=title
  for(const body of [title,`${title}\n\nReviewed terms.  Keep this spacing.\n`,`${title}\r\n\r\nReviewed terms.\r\n`]){
    value.channel_content.social.body=body
    assert.equal(campaignFacebookSource(value).caption,body)
    assert.equal(publicCampaignFacebookPost(value,{mode:'text'}).caption,body)
  }
  for(const body of ['  A separate opening.\n\nReviewed terms.  ',`${title} for local sellers.\n\nReviewed terms.`,'Your next move — in cape town\n\nA deliberately distinct heading.']){
    value.channel_content.social.body=body
    assert.equal(campaignFacebookSource(value).caption,`${title}\n\n${body}`)
  }
})

test('fresh actor-scoped public contacts reject removal but preserve an explicitly reviewed campaign-only override',async()=>{
  const runtime={agency:{agencyName:'Oak Agency',sellerDestination:'link',sellerUrl:saved.campaign_builder.source.destination},agent:{name:'Avery Agent',email:'avery@example.test',phone:''},card:{organisation_id:org,status:'active',default_assigned_agent_id:agent,metadata_json:{surface:'agent_digital_card',agentDigitalCard:{agent:{name:'Avery Agent'}}}},calls:[]}
  const userDb={from:table=>{
    const query={select(){return query},eq(key,value){runtime.calls.push({table,key,value});return query},contains(key,value){runtime.calls.push({table,key,value});return query},order(){return query},limit(){return query},maybeSingle(){return query},then(resolve){
      const data=table==='marketing_campaign_setup'?{confirmed_preferences:runtime.agency}:table==='marketing_campaign_agent_setup'?{confirmed_preferences:runtime.agent}:[runtime.card]
      return resolve({data,error:null})
    }};return query
  }}
  await assertFreshCampaignFacebookContacts({userId:agent,userDb},org,saved)
  assert.ok(runtime.calls.every(call=>call.key!=='organisation_id'||call.value===org))
  runtime.agency.sellerUrl=''
  await assert.rejects(assertFreshCampaignFacebookContacts({userId:agent,userDb},org,saved),/changed or were removed/)
  const manual=copy(saved);manual.campaign_builder.contactProvenance.source.destination='';manual.campaign_builder.contactProvenance.overrides.destination=manual.campaign_builder.source.destination
  await assertFreshCampaignFacebookContacts({userId:agent,userDb},org,manual)
  runtime.agency.sellerUrl='https://agency.example.test/new'
  await assert.rejects(assertFreshCampaignFacebookContacts({userId:agent,userDb},org,manual),/changed or were removed/)
  runtime.agency.sellerUrl=saved.campaign_builder.source.destination
  runtime.calls=[]
  await assertFreshCampaignFacebookContacts({userId:user,userDb},org,saved)
  assert.ok(runtime.calls.some(call=>call.table==='agency_public_intake_links'&&call.key==='default_assigned_agent_id'&&call.value===agent))
  assert.ok(!runtime.calls.some(call=>call.table==='marketing_campaign_agent_setup'))
  runtime.card.status='disabled'
  await assert.rejects(assertFreshCampaignFacebookContacts({userId:user,userDb},org,saved),/active public profile/)
})

test('preview requests recover the same immutable PostgreSQL snapshot and reject reuse for different content/Page',async()=>{
  const f=await fixture()
  try {
    const first=(await f.preview()).post,again=(await f.preview()).post
    assert.equal(first.id,again.id);assert.equal(f.runtime.graphCalls.length,0)
    assert.equal((await f.db.query('select count(*)::int n from meta_campaign_posts')).rows[0].n,1)
    assert.ok(!JSON.stringify(first).includes('token'));assert.ok(!JSON.stringify(first).includes('Never share'))
    f.runtime.campaign.channel_content.social.body='Changed saved copy'
    await assert.rejects(f.preview(),/different content/)
    await assert.rejects(f.preview(id(21),{connectionId:foreignPage}),/not found in this workspace/)
    await assert.rejects(f.db.query("update meta_campaign_posts set snapshot_json='{}' where id=$1",[first.id]),/cannot be changed/)
  }finally{await f.db.close()}
})

test('only explicit publish submits once under a race and associates the confirmed provider result with its campaign',async()=>{
  const f=await fixture()
  try {
    const post=(await f.preview()).post
    await assert.rejects(f.publish(post,{confirmPublishNow:false}),/explicitly confirm/)
    await Promise.all([f.publish(post),f.publish(post)])
    const result=(await f.publish(post)).post
    assert.equal(f.runtime.graphCalls.length,1)
    assert.deepEqual(f.runtime.graphCalls[0],{path:'300/feed',payload:{message:`${saved.channel_content.social.title}\n\n${saved.channel_content.social.body}`,link:saved.playbook.response.value,published:true}})
    assert.equal(result.status,'published');assert.equal(result.provider_post_id,'300_900');assert.equal(result.public_url,'https://www.facebook.com/300_900')
    assert.equal(result.campaign_id,campaignId);assert.equal(result.campaign_revision,1);assert.ok(result.published_at)
    f.runtime.campaign.revision=2
    assert.equal((await f.publish(post)).post.status,'published');assert.equal(f.runtime.graphCalls.length,1)
  }finally{await f.db.close()}
})

test('scope, exact saved source, current revision, membership and Page capability are checked before Graph',async()=>{
  const f=await fixture()
  try {
    const post=(await f.preview()).post
    f.runtime.visible=false;await assert.rejects(f.publish(post),/access/);f.runtime.visible=true
    f.runtime.canPublish=false;await assert.rejects(f.publish(post),/owner or an agency manager/);f.runtime.canPublish=true
    await assert.rejects(f.publish(post,{expectedRevision:2}),/changed/)
    f.runtime.campaign.channel_content.social.body='Changed without a revision'
    await assert.rejects(f.publish(post),/changed after this preview/);f.runtime.campaign=copy(saved)
    await f.db.exec("update meta_lead_ads_connections set page_id='999' where page_id='300'")
    await assert.rejects(f.publish(post),/changed after this preview/)
    await assert.rejects(f.db.query('select meta_campaign_claim_post($1,$2,$3,1)',[org,post.id,user]),/connected Facebook Page changed/)
    await f.db.exec("update meta_lead_ads_connections set page_id='300' where page_id='999'")
    await f.db.query("update organisation_users set status='inactive' where user_id=$1",[agent])
    await assert.rejects(f.publish(post),/agent is no longer active/)
    await f.db.query("update organisation_users set status='active' where user_id=$1",[agent])
    await f.db.exec("update meta_lead_ads_connections set granted_scopes='{}'")
    await assert.rejects(f.publish(post),/posting permission/)
    await assert.rejects(f.db.query('select meta_campaign_claim_post($1,$2,$3,1)',[org,post.id,user]),/posting permission/)
    await f.db.exec("update meta_lead_ads_connections set granted_scopes=array['pages_manage_posts'],page_tasks='{}'")
    await assert.rejects(f.publish(post),/posting permission/)
    await f.db.exec("update meta_lead_ads_connections set page_tasks=array['CREATE_CONTENT'];update marketing_campaigns set revision=2")
    await assert.rejects(f.publish(post),/saved campaign changed/)
    await f.db.exec("update marketing_campaigns set revision=1;update organisation_users set status='inactive'")
    await assert.rejects(f.publish(post),/permission/)
    assert.equal(f.runtime.graphCalls.length,0)
  }finally{await f.db.close()}
})

test('uncertain responses and confirmed Graph results with lost database acknowledgements are never published again',async()=>{
  const f=await fixture()
  try {
    f.runtime.failure=Error('Response lost')
    const post=(await f.preview()).post
    assert.equal((await f.publish(post)).post.status,'unknown')
    await f.publish(post);assert.equal(f.runtime.graphCalls.length,1)
    await assert.rejects(f.db.query("update meta_campaign_posts set status='draft' where id=$1",[post.id]),/already submitted/)
    f.runtime.failure=null
    const next=(await f.preview(id(21))).post
    await f.db.exec(`create function fail_campaign_ack() returns trigger language plpgsql as $$begin if new.status='published' then raise exception 'Database acknowledgement lost'; end if;return new;end$$;create trigger fail_campaign_ack before update on meta_campaign_posts for each row execute function fail_campaign_ack();`)
    assert.equal((await f.publish(next)).post.status,'unknown')
    await f.publish(next);assert.equal(f.runtime.graphCalls.length,2)
  }finally{await f.db.close()}
})

test('definitive provider rejection is recorded without invented success, and storage/RPC are service-only',async()=>{
  const f=await fixture()
  try {
    f.runtime.failure=Object.assign(Error('Meta: Page permission denied'),{definitive:true})
    const post=(await f.preview()).post
    const failed=(await f.publish(post)).post
    assert.equal(failed.status,'failed');assert.equal(failed.provider_post_id,null);assert.equal(failed.public_url,null)
    await f.publish(post);assert.equal(f.runtime.graphCalls.length,1)
    await f.db.exec('set role authenticated')
    await assert.rejects(f.db.query('select * from meta_campaign_posts'),/permission denied/)
    await assert.rejects(f.db.query('select meta_campaign_claim_post($1,$2,$3,1)',[org,post.id,user]),/permission denied/)
    await f.db.exec('reset role')
    const history=await f.call('campaign_posts',{campaignId})
    assert.equal(history.posts[0].status,'failed');assert.ok(!JSON.stringify(history).includes('server-only-token'))
    f.runtime.visible=false;await assert.rejects(f.call('campaign_posts',{campaignId}),/access/)
  }finally{await f.db.close()}
})
