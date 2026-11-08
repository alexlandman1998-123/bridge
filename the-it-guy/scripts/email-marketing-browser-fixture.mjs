// Local browser QA only. Real email components/services; synthetic account,
// storage and provider responses. Database dispatch is checked separately by
// emailCampaignJourney.test.js against actual PostgreSQL routines.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
let inspectCampaignEmail

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const org = '11111111-1111-4111-8111-111111111111', user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const campaignId = '22222222-2222-4222-8222-222222222222'
const audience = { id: '33333333-3333-4333-8333-333333333333', organisation_id: org, name: 'Opted-in buyers', revision: 1, definition: { emailFilter: {} } }
const identity = { id: 'sender', organisation_id: org, display_name: 'Example Agency', from_email: 'news@updates.example.com', reply_to_email: 'office@example.com', verification_status: 'verified', email_sending_domain_id: 'domain', sender_mode: 'custom' }
const domain = { id: 'domain', organisation_id: org, domain_name: 'updates.example.com', provider_domain_id: 'fixture-provider', verification_status: 'pending', last_provider_error: 'DNS verification failed. Check the records below, then retry verification.', dns_records: [{ record: 'DKIM', type: 'TXT', name: 'resend._domainkey.updates', value: 'fixture-public-dns-proof', status: 'pending' }] }
const policy = { organisation_id: org, approved_at: new Date().toISOString(), daily_recipient_limit: 500, organisation_daily_limit: 500, paused_at: null, manual_paused_at: null, self_service_blocked: false }
const html = '<!doctype html><html><body><table role="presentation" width="100%" style="max-width:600px"><tr><td><h1>Homes for you</h1><p>Hello {{first_name}}, discover our latest properties.</p><a href="https://example.com/homes?area=coast&amp;sort=new">View properties</a></td></tr></table></body></html>'
let timestamp = Date.now(), blocked = true
const campaign = { id: campaignId, organisation_id: org, created_by: user, updated_by: user, name: 'Email QA campaign', subject: 'Homes worth seeing', preview_text: 'New properties this week', status: 'draft', updated_at: new Date(timestamp).toISOString(), sender_identity_id: identity.id, subscription_type_id: 'category', audience_filter: { shared_audience_id: audience.id, audience_revision: 1 }, content_json: { version: 1, mode: 'advanced', blocks: [], advancedHtml: html } }
const tables = { email_campaigns: [campaign], email_sender_identities: [identity], email_sending_domains: [domain], email_sending_policies: [policy], email_subscription_types: [{ id: 'category', organisation_id: org, name: 'Property updates', is_active: true }], email_marketing_contacts: [], email_campaign_revisions: [], email_templates: [], email_saved_audiences: [], email_campaign_recipients: [{ id: 'recipient', campaign_id: campaignId, organisation_id: org, email: 'buyer@example.test', status: 'queued' }] }
const events = []
const workspace = () => ({ organisationId: org, userId: user, campaigns: [campaign], identities: [identity], domains: [domain], contacts: [], subscriptionTypes: tables.email_subscription_types, performance: [], templates: [], savedAudiences: [], usage: [], dailyPerformance: [] })
const request = `async function request(kind, body={}) { const response=await fetch('/fixture/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return response.json() };`
const client = `${request}
 export const isSupabaseConfigured=true;
 export const supabase={
  rpc:(name,args)=>request('rpc',{name,args}),
  functions:{invoke:async(name,options)=>{const response=await fetch('/fixture/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,...options})});if(!response.ok)return {data:null,error:Object.assign(new Error('Edge Function returned a non-2xx status code'),{context:response})};return{data:await response.json(),error:null}}},
  from(table){let operation='select',values,filters=[],single=false,limit;const run=()=>request('query',{table,operation,values,filters,single,limit});const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},in(){return q},order(){return q},limit(n){limit=n;return q},range(){return q},insert(v){operation='insert';values=v;return q},update(v){operation='update';values=v;return q},upsert(v){operation='insert';values=v;return q},single(){single=true;return run()},maybeSingle(){single=true;return run()},then(resolve,reject){return run().then(resolve,reject)}};return q}
 };`
const modules = new Map([
  ['src/lib/supabaseClient.js', client],
  ['src/context/AuthSessionContext.jsx', `export const useAuthSession=()=>({authState:{user:{id:'${user}',email:'agent@example.test'},currentWorkspace:{id:'${org}',name:'Example Agency'},currentMembership:{workspaceId:'${org}',role:'principal'}}});`],
  ['src/services/privateListingService.js', 'export const getOrganisationPrivateListings=async()=>[];'],
  ['src/services/developmentBuyerLeadService.js', 'export const listBuyerLeadDevelopmentOptions=async()=>[];'],
  ['src/services/emailCampaignPlanService.js', 'export const ensureEmailCampaignPlan=async(_org,_user,saved)=>saved;'],
  ['src/services/aiCampaignService.js', "export const aiCampaignAction=async()=>({listings:[],usage:[]});export const reviewAiCampaign=async()=>{throw Error('AI is outside this fixture')};export const approveAiCampaign=reviewAiCampaign;"],
  ['src/components/marketing/MarketingAudiences.jsx', "export default function Audiences(){return <p>Saved audience management is checked separately.</p>}"],
  ['src/components/marketing/ChannelWorkspaceTemplates.jsx', 'export default function Templates(){return null}'],
  ['src/components/marketing/EmailAudienceBuilder.jsx', 'export default function Audience(){return null}'],
  ['src/components/marketing/EmailDevelopmentSelector.jsx', 'export default function Development(){return null}'],
  ['src/services/emailCampaignService.js', `${request}export * from '/src/services/emailCampaignService.js?original';export const getEmailCampaignWorkspace=()=>request('workspace');`],
])
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Builder from'/src/components/marketing/EmailCampaignBuilder.jsx';import Settings from'/src/components/marketing/EmailCampaignSettings.jsx';import{EmailCampaignDetail}from'/src/components/marketing/EmailCampaigns.jsx';import'/src/index.css';import'/src/pages/WhatsAppCampaigns.css';import'/src/pages/EmailCampaigns.css';${request}
function App(){const[view,setView]=React.useState('editor'),[workspace,setWorkspace]=React.useState(null);const refresh=async()=>setWorkspace(await request('workspace'));React.useEffect(()=>{refresh()},[]);if(!workspace)return <p>Loading local fixture...</p>;const w={...workspace,refresh};return <MemoryRouter><nav style={{padding:12,display:'flex',flexWrap:'wrap',gap:12}} aria-label="Local diagnostic navigation"><strong>Local email QA. Synthetic providers only.</strong>{['editor','settings','delivery'].map(v=><button key={v} onClick={()=>setView(v)}>{v}</button>)}<button onClick={async()=>{await request('control',{verified:true});await refresh()}}>Verify fixture domain</button><button onClick={async()=>{await request('control',{blocked:false});await refresh()}}>Allow fixture readiness</button></nav>{view==='editor'?<Builder campaignId='${campaignId}' workspace={w} onBack={()=>{}}/>:view==='settings'?<Settings organisationId='${org}' userId='${user}' domains={w.domains} identities={w.identities} onRefresh={refresh}/>:<EmailCampaignDetail campaignId='${campaignId}' onBack={()=>setView('editor')} onEdit={()=>setView('editor')}/>}</MemoryRouter>};createRoot(document.getElementById('root')).render(<App/>);`
const cacheDir = await mkdtemp(path.join(tmpdir(), 'arch9-email-browser-'))
const server = await createServer({ root, configFile: false, envDir: false, cacheDir,
  resolve: { alias: { parse5: path.resolve(root, 'node_modules/parse5/dist/index.js') } },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react', 'parse5'] },
  plugins: [react(), { name: 'email-qa-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/email-qa.jsx') return root + '/email-qa.jsx' },
    load(id) { if (id === root + '/email-qa.jsx') return entry; return modules.get(path.relative(root, id)) },
    configureServer(s) { s.middlewares.use(async (req,res,next) => {
      const json = (data,status=200) => {res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
      if (req.url?.startsWith('/fixture/') && req.method==='POST') {
        try {
          let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw||'{}');const kind=req.url.slice(9);events.push({kind,name:b.name,table:b.table})
          if(kind==='workspace')return json(workspace())
          if(kind==='control'){if(typeof b.blocked==='boolean')blocked=b.blocked;if(b.verified)domain.verification_status='verified';return json({ok:true})}
          if(kind==='query'){
            let rows=(tables[b.table]||[]).filter(row=>(b.filters||[]).every(([key,value])=>value===null?row[key]==null:row[key]===value))
            if(b.operation==='update'){for(const row of rows)Object.assign(row,b.values,{updated_at:new Date(++timestamp).toISOString()})}
            if(b.operation==='insert'){const row={id:crypto.randomUUID(),...b.values,updated_at:new Date(++timestamp).toISOString(),status:'draft'};(tables[b.table]||=[]).push(row);rows=[row]}
            if(b.limit)rows=rows.slice(0,b.limit)
            return json({data:b.single?rows[0]||null:rows,error:b.single&&!rows.length?{code:'PGRST116'}:null})
          }
          if(kind==='rpc'){
            const data=b.name==='marketing_audience_library'?{audiences:[audience],total:1}:b.name==='marketing_audience_preview'?{matched:1,contacts:[],excluded:1}:b.name==='email_campaign_preview_audience'?1:b.name==='email_campaign_preflight'?{ready:!blocked,eligible_recipients:1,checks:['sender','subscription','policy','audience'].map(key=>({key,ok:!blocked}))}:b.name==='email_campaign_controls_status'?{account_ready:false,reserved_today:0}:b.name==='email_campaign_platform_sender_status'?{ready:false}:b.name==='email_campaign_delivery_status'?{state:'queued',message:'Arch9 sending capacity is unavailable. Queued recipients are retained; contact your workspace administrator.',attempts:2}:b.name==='email_campaign_prepare_dispatch'?{recipients:1,status:'sending'}:null
            return json({data,error:null})
          }
          if(kind==='invoke'){
            if(b.name==='email-campaign-test')return json({error:'The email provider rejected this test: The sending domain is not verified.',deliveryUncertain:false},422)
            if(b.name==='email-campaign-content-check'){const {html:_html,imageUrls:_urls,...report}=inspectCampaignEmail(campaign,{agencyName:identity.display_name,senderEmail:identity.from_email});return json(report)}
            if(b.name==='email-sender-verification')return json({domainsVerified:0,domainsChecked:1,verified:0,checked:1,platformSender:{ready:false}})
            return json({error:'This provider operation is outside the local fixture.'},400)
          }
          return json({error:'Unknown fixture action'},400)
        } catch(error){return json({error:error.message},500)}
      }
      if(req.url==='/fixture-events'){return json(events)}
      if(req.url==='/'||req.url?.startsWith('/?')){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"connect-src 'self' ws://127.0.0.1:4263; img-src 'self' data: blob:; frame-src 'self' blob:; form-action 'none'");res.end(await s.transformIndexHtml('/', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/email-qa.jsx"></script></body></html>'));return}
      next()
    }) },
  }], server:{host:'127.0.0.1',port:4263,strictPort:true,fs:{allow:[path.resolve(root,'..')]}},
})
;({ inspectCampaignEmail } = await server.ssrLoadModule(path.resolve(root, '../supabase/functions/_shared/emailContent.js')))
await server.listen()
console.log('Email marketing browser fixture: http://127.0.0.1:4263 (no remote credentials or sends)')
const close=async()=>{await server.close();await rm(cacheDir,{recursive:true,force:true});process.exit(0)}
process.on('SIGTERM',close);process.on('SIGINT',close)
