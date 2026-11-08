import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { createEmailCampaignDatabase } from '../../../../scripts/fixtures/emailCampaignDatabase.mjs'
import { emailCampaignClient } from '../../../../scripts/fixtures/emailCampaignClient.mjs'
import { createWorkerHandler } from '../../../../supabase/functions/email-campaign-worker/handler.ts'
import { createContentCheckHandler } from '../../../../supabase/functions/email-campaign-content-check/handler.ts'
import { createCampaignTrackingHandler } from '../../../../supabase/functions/email-campaign-track/handler.ts'
import { createUnsubscribeHandler } from '../../../../supabase/functions/email-unsubscribe/handler.ts'
import { prepareEmailImport, uploadPreparedEmail } from '../emailCampaignImportService'
import { createEmailSender, saveEmailCampaign, scheduleEmailCampaign, preflightEmailCampaign, getEmailCampaignAnalytics } from '../emailCampaignService'
const connection = vi.hoisted(() => ({ client: null }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: new Proxy({}, { get: (_,key) => connection.client[key] }) }))
const readMigration = name => readFileSync(new URL('../../../../supabase/migrations/'+name,import.meta.url),'utf8')
const definition = (sql,name) => {
  const position = sql.indexOf('function public.'+name+'(')
  if (position < 0) throw new Error(`Missing migration function ${name}`)
  const start = sql.lastIndexOf('create ',position)
  return sql.slice(start,sql.indexOf('$$;',position)+3)
}

it('imports HTML and an owned image, saves/preflights/schedules, dispatches both sender modes, records callbacks/clicks, reports and unsubscribes only the owning organisation', async () => {
  const fixture = await createEmailCampaignDatabase()
  const { db,one,org,other,user,asUser,asService,foundation } = fixture
  const base = 'https://journey.supabase.co'
  const files = new Map(), deliveries = []
  const env = key => ({ SUPABASE_URL: base, SUPABASE_SECRET_KEYS: '{"default":"sb_secret_fixture"}', SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_fixture"}',
    RESEND_API_KEY: 'resend-fixture', EMAIL_CAMPAIGN_WORKER_SECRET: 'worker-fixture', ARCH9_CAMPAIGN_SENDING_ENABLED: 'true', ARCH9_CAMPAIGN_RESEND_DOMAIN_ID: 'platform-domain' })[key]
  try {
    await db.exec('reset role; create schema storage; create table storage.objects(bucket_id text,name text,metadata jsonb)')
    const assets = readMigration('20261009113022_email_campaign_image_assets.sql')
    for (const name of ['email_campaign_reserve_asset','email_campaign_list_assets']) await db.exec(definition(assets,name))
    const audience = readMigration('20260918143000_dynamic_audience_campaign_delivery.sql')
    await db.exec(definition(readMigration('20260918134000_dynamic_email_audiences_phase1.sql'),'email_audience_rule_matches'))
    for (const name of ['email_campaign_resolve_audience_rules','email_campaign_preview_audience']) await db.exec(definition(audience,name))
    await db.exec(definition(foundation,'email_campaign_quote_usage'))
    await db.exec(foundation.slice(foundation.indexOf('create or replace view public.email_campaign_performance as')).split(';')[0]+';')
    await db.exec(foundation.slice(foundation.indexOf('create or replace view public.email_campaign_link_performance with')).split(';')[0]+';')
    await db.exec('grant select on email_campaign_link_performance to authenticated,service_role')
    for(const table of ['email_campaign_links','email_campaign_audit_events']) {
      await db.exec(`alter table ${table} enable row level security; grant select on ${table} to authenticated`)
      for(const policy of foundation.split('\n').filter(line=>line.startsWith('create policy ') && line.includes(' on public.'+table+' '))) await db.exec(policy)
    }
    await db.exec('alter view email_campaign_performance set (security_invoker=true); grant select on email_campaign_performance to authenticated,service_role')
    await db.exec("update email_campaign_account_limits set enabled=true,daily_limit=100,monthly_limit=200")
    const service = emailCampaignClient({ db, before: asService })
    const caller = emailCampaignClient({ db, before: () => asUser(org), user: { id: user,email: 'manager@example.test' } })
    connection.client = caller
    caller.storage = { from: bucket => ({
      getPublicUrl: path => ({ data: { publicUrl: `${base}/storage/v1/object/public/${bucket}/${path}` } }),
      async upload(path,file,options) {
        expect(options.upsert).toBe(false)
        files.set(`${base}/storage/v1/object/public/${bucket}/${path}`,file)
        await db.exec('reset role')
        await db.query('insert into storage.objects values($1,$2,$3)',[bucket,path,JSON.stringify({mimetype:file.type,size:file.size})])
        return { error: null }
      },
    }) }
    const fetcher = vi.fn(async (url,options = {}) => {
      if (files.has(url) && options.method === 'HEAD') { const file=files.get(url); return new Response(null,{ headers:{'content-type':file.type,'content-length':String(file.size)} }) }
      if (String(url).includes('/domains/')) { const id=String(url).split('/').at(-1); return Response.json({ id,name:id==='platform-domain'?'updates.arch9.co.za':'updates.agency.example.com',status:'verified',records:[] }) }
      if (url === 'https://api.resend.com/emails') { deliveries.push({ ...JSON.parse(options.body), key: options.headers['Idempotency-Key'] });return Response.json({ id:`provider-${deliveries.length}` }) }
      throw new Error(`Unmocked network request: ${url}`)
    })
    const contentCheck = createContentCheckHandler({ createClient:()=>caller,env,fetcher })
    caller.functions = { invoke: async (name,{body}) => {
      expect(name).toBe('email-campaign-content-check')
      const response=await contentCheck(new Request(base,{method:'POST',headers:{authorization:'Bearer fixture-user','content-type':'application/json'},body:JSON.stringify(body)}))
      const payload=await response.json()
      expect(response.status,JSON.stringify(payload)).toBe(200)
      return { data:payload,error:null }
    } }
    await service.rpc('email_campaign_apply_platform_status',{ p_provider_domain_id:'platform-domain',p_status:'verified',p_enabled:true })
    const shared=await createEmailSender({organisationId:org,senderMode:'arch9',displayName:'Agency A',replyToEmail:'reply@agency.example.com'})
    await asService()
    const domain=await one("insert into email_sending_domains(organisation_id,domain_name,provider_domain_id) values($1,'updates.agency.example.com','custom-domain') returning *",[org])
    expect((await service.rpc('email_apply_domain_status',{p_domain_id:domain.id,p_status:'verified',p_records:[]})).error).toBeNull()
    const custom=await createEmailSender({organisationId:org,displayName:'Agency A',email:'news@updates.agency.example.com',replyToEmail:'reply@agency.example.com',sendingDomainId:domain.id})
    await asService()
    const category=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[org])
    for (const scope of [org,other]) {
      await db.query("insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status) values($1,'buyer@example.test','opted_in')",[scope])
      await db.query("insert into email_marketing_contacts(organisation_id,email,first_name) values($1,'buyer@example.test','Alex')",[scope])
    }
    await db.query("insert into contact_email_subscriptions(organisation_id,subscription_type_id,email,status) values($1,$2,'buyer@example.test','subscribed')",[org,category.id])
    const prepared=await prepareEmailImport({html:new File(['<html><body><h1>Hello {{first_name}}</h1><img src="hero.png" alt="A home"><a href="https://agency.example.com/listings">View homes</a></body></html>'],'campaign.html',{type:'text/html'}),images:[new File([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],'hero.png',{type:'image/png'})]})
    const imported=await uploadPreparedEmail({prepared,organisationId:org})
    expect(imported.html).toContain(`/email-campaign-images/organisations/${org}/`)
    const contentJson={version:1,mode:'advanced',blocks:[],advancedHtml:imported.html,importedEmail:imported.designJson}
    const worker=createWorkerHandler({createClient:()=>service,env,fetcher,sleep:async()=>{await asService();await db.exec('update email_campaign_account_limits set next_request_at=null')}})
    const campaigns=[]
    for (const identity of [shared,custom]) {
      const saved=await saveEmailCampaign({organisationId:org,userId:user,campaign:{name:'Imported campaign',subject:'Homes for you',senderIdentityId:identity.id,subscriptionTypeId:category.id,contentJson,html:imported.html}})
      expect((await preflightEmailCampaign(saved.id)).ready).toBe(true)
      const future=identity.sender_mode==='arch9'
      await scheduleEmailCampaign(saved.id,new Date(Date.now()+(future?3600000:-1000)).toISOString())
      if(future) {
        const early=await worker(new Request(base,{method:'POST',headers:{'x-arch9-email-worker-secret':'worker-fixture'}}))
        expect(await early.json()).toMatchObject({processed:0})
        await asService()
        // Advance only this isolated fixture's due time; no real clock/cron is used.
        await db.query("update email_campaign_dispatch_jobs set run_at=now()-interval '1 second' where campaign_id=$1",[saved.id])
      }
      const response=await worker(new Request(base,{method:'POST',headers:{'x-arch9-email-worker-secret':'worker-fixture'}}))
      expect(await response.json()).toMatchObject({processed:1})
      expect((await one('select status from email_campaigns where id=$1',[saved.id])).status).toBe('sent')
      campaigns.push(saved)
    }
    expect(deliveries).toHaveLength(2)
    expect(deliveries[0].from).toBe('Agency A via Arch9 <noreply@updates.arch9.co.za>')
    expect(deliveries[1].from).toBe('Agency A <news@updates.agency.example.com>')
    for (const mail of deliveries) {
      expect(mail.html).toContain('Hello Alex');expect(mail.html).not.toContain('src="hero.png"')
      expect(mail.reply_to).toBe('reply@agency.example.com');expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
      expect(mail.key).toContain('recipient:')
    }
    await asService()
    const recipient=await one('select * from email_campaign_recipients where campaign_id=$1',[campaigns[0].id])
    expect((await service.rpc('email_campaign_record_provider_event',{p_event_id:'signed-delivered',p_provider_id:recipient.provider_message_id,p_event_type:'email.delivered',p_payload:{}})).error).toBeNull()
    const tracking=createCampaignTrackingHandler({createClient:()=>service,env})
    const link=await one('select * from email_campaign_links where campaign_id=$1',[campaigns[0].id])
    const clicked=await tracking(new Request(`${base}?l=${link.tracking_token}&r=${recipient.id}&t=${recipient.tracking_token}`))
    expect(clicked.status).toBe(302);expect(clicked.headers.get('location')).toBe('https://agency.example.com/listings')
    const report=await one('select * from email_campaign_performance where campaign_id=$1',[campaigns[0].id])
    expect(report.clicked).toBe(1)
    const activity=await getEmailCampaignAnalytics(campaigns[0].id)
    expect(activity.recipients[0].status).toBe('clicked')
    expect(activity.events.map(event=>event.event_type).sort()).toEqual(['clicked','delivered','sent'])
    expect(activity.links[0].unique_clickers).toBe(1)
    expect(activity.audit.some(event=>event.event_type==='scheduled')).toBe(true)
    await asService()
    const pref=await one('select * from contact_marketing_preferences where organisation_id=$1',[org])
    const unsubscribe=createUnsubscribeHandler({createClient:()=>service,env})
    expect((await unsubscribe(new Request(`${base}?token=${pref.unsubscribe_token}`,{method:'POST'}))).status).toBe(200)
    expect((await one('select marketing_consent_status from contact_marketing_preferences where organisation_id=$1',[org])).marketing_consent_status).toBe('opted_out')
    expect((await one('select marketing_consent_status from contact_marketing_preferences where organisation_id=$1',[other])).marketing_consent_status).toBe('opted_in')
    expect((await one('select count(*)::int n from email_events where campaign_id=$1',[campaigns[0].id])).n).toBe(3)
  } finally { connection.client=null;await db.close() }
},20000)
