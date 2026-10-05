// Loopback-only acceptance: real rental UI/save service + migrated local PostgreSQL.
// Auth, storage signing and portal/website responses are fixtures, never hosted services.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRentalListingAcceptanceFixture } from './lib/rentalListingAcceptanceFixture.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = await createRentalListingAcceptanceFixture()
const { db, actor, org, listing, otherOrg, initial, patch, publication, image } = fixture
const host = '127.0.0.1', port = Number(process.env.RENTAL_LISTING_FIXTURE_PORT || 4193)
const origin = `http://${host}:${port}`
const photos = 'https://rental-photo.example.test'
let signing = 0, pending = true, rejectNextRead = false, loseReadbackAfterRpc = false
const camel = row => Object.fromEntries(Object.entries(row || {}).map(([key,value]) => [key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),value]))
await db.query('select save_rental_listing_snapshot_v2($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,0,$6::jsonb)', [listing,initial,JSON.stringify(patch),JSON.stringify(publication),JSON.stringify([
  { id:image,url:photos+'/fixture/photo.svg?token=initial',name:'Private cover',bucket:'documents',path:`private-listings/${listing}/gallery/durable.jpg` },
  { id:'new-photo',url:photos+'/fixture/photo.svg?photo=second',name:'Second photo' },
]),'[]'])
async function readListing(id) {
  const row = (await db.query('select * from private_listings where id=$1',[id])).rows[0]
  if (!row) return null
  const media = (await db.query('select * from listing_media where listing_id=$1 order by sort_order,id',[id])).rows
  for (const photo of media) if (photo.storage_bucket && photo.storage_path) photo.file_url = `${photos}/fixture/photo.svg?token=renewed-${++signing}`
  const links = (await db.query('select * from listing_external_links where listing_id=$1 order by id',[id])).rows
  const pub = (await db.query('select * from listing_publication_data where listing_id=$1',[id])).rows[0]
  // Match PostgREST JSON numeric values rather than PGlite's numeric strings.
  for(const field of ['asking_price','bathrooms','floor_size','erf_size','rates_taxes','levies'])if(pub?.[field]!=null)pub[field]=Number(pub[field])
  return { ...camel(row), assignedAgentId:actor, assignedAgentName:'Fixture agent', sellerCanonicalFacts:row.seller_canonical_facts_json, listingPublicationData:pub?camel(pub):null, listingMedia:media, listingExternalLinks:links }
}
const req = `export const request=async(action,body={})=>{const r=await fetch('/fixture/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const p=await r.json();if(p.error)throw Object.assign(new Error(p.error.message),p.error);return p.data};`
const modules = new Map([
  ['src/lib/supabaseClient.js', `${req}export const isSupabaseConfigured=true;export const supabase={rpc:async(name,args)=>{try{return{data:await request('rpc',{name,args}),error:null}}catch(error){return{data:null,error}}},auth:{getSession:async()=>({data:{session:{access_token:'local-fixture-only'}}})},from:()=>{throw new Error('Unexpected hosted query in local fixture')}};export const clearSupabaseLocalAuthState=async()=>{};export const isUnsupportedJwtAlgorithmError=()=>false;export const isUserFromSubClaimMissingError=()=>false;export const createScopedSupabaseClient=()=>supabase;export const invokeEdgeFunction=async()=>{throw new Error('External functions disabled in fixture')};export const getEdgeFunctionInvokeError=r=>r?.error;export const assertEdgeFunctionSuccess=r=>r?.data;export const DOCUMENTS_BUCKET='documents',DOCUMENTS_BUCKET_CANDIDATES=['documents'],LEGAL_TEMPLATES_BUCKET='legal-templates',LEGAL_TEMPLATES_BUCKET_CANDIDATES=['legal-templates'],BRANDING_BUCKET='organisation-branding',BRANDING_BUCKET_CANDIDATES=['organisation-branding'],PROFILE_AVATAR_BUCKET='profile-avatars',PROFILE_AVATAR_BUCKET_CANDIDATES=['profile-avatars'];`],
  ['src/context/OrganisationContext.jsx', `export const useOptionalOrganisation=()=>null;`],
  ['src/services/rentals/rentalLeadService.js', `export * from '/src/services/rentals/rentalLeadService.js?original';export const listRentalLeads=async()=>[];export const createRentalLead=async()=>{throw new Error('Lead creation disabled in fixture')};`],
  ['src/context/WorkspaceContext.jsx', `import{createContext,useContext}from'react';export const FixtureWorkspace=createContext({});export const useWorkspace=()=>useContext(FixtureWorkspace);`],
  ['src/services/privateListingService.js', `${req}export * from '/src/services/privateListingService.js?original';export const getPrivateListing=id=>request('listing',{id});export const getAgentPrivateListings=()=>request('list');export const getPrivateListingActivity=id=>request('history',{id});export const getPrivateListingDocuments=async()=>[];export const getPrivateListingDocumentRequirements=async()=>[];export const signPrivateListingMediaAsset=asset=>request('sign',{asset});export const uploadPrivateListingMediaAsset=async()=>{throw new Error('File upload is covered separately; fixture cannot contact Storage')};export const createPrivateListing=async()=>{throw new Error('Creation is covered separately; fixture starts with a saved rental')};export const createPrivateListingActivity=async()=>{throw new Error('Portal sends disabled in fixture')};`],
  ['src/services/rentals/rentalListingOverviewService.js', `import{buildRentalListingOverview}from'/src/services/rentals/rentalListingOverviewModel.js';import{getPrivateListingActivity}from'/src/services/privateListingService.js';export const loadRentalListingOverview=async listing=>buildRentalListingOverview({listing,activity:await getPrivateListingActivity(listing.id)});`],
  ['src/services/rentals/rentalListingChannelService.js', `${req}export const loadRentalListingChannels=id=>request('channels',{id});export const getRentalPortalStatus=()=>request('status');export const reconcileRentalPortalPublication=()=>request('reconcile');export const recordRentalPublicationEvent=(listingId,channel,stage,metadata={})=>request('event',{listingId,channel,stage,metadata});export const runRentalPublicationAction=async()=>{throw new Error('External publication is disabled')};export const updateRentalPortalStatus=async()=>{throw new Error('External publication is disabled')};`],
  ['src/services/websiteListingPublicationService.js', `export const getWebsiteListingPublicationStatus=async()=>({status:'published',websiteStatus:'published',projectionStatus:'Published',websiteSiteId:'fixture-website',hostname:'agency.example.test',blockers:[]});export const setWebsiteListingPublication=async()=>{throw new Error('Website publishing disabled in fixture')};`],
  ['src/services/kingdomWebsitePublicationService.js', `export const getKingdomWebsitePublicationStatus=async()=>({available:true,status:'published',websiteStatus:'published',hostname:'kingdom.example.test',blockers:[]});export const setKingdomWebsitePublication=async()=>{throw new Error('Website publishing disabled in fixture')};`],
  ['src/components/listings/ListingAgentReassignmentPanel.jsx', `export default function(){return <p>Fixture assigned agent</p>}`],
])
const entry = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import Detail from'/src/pages/rentals/RentalListingDetailPage.jsx';import Create from'/src/pages/rentals/RentalListingCreatePage.jsx';import Switcher from'/src/components/OrganisationWorkspaceSwitcher.jsx';import{FixtureWorkspace}from'/src/context/WorkspaceContext.jsx';import'/src/index.css';const memberships=[{workspaceId:'${org}',workspace:{name:'I Sell Property'}},{workspaceId:'${otherOrg}',workspace:{name:'Kingdom Realty'}}];function App(){const[id,setId]=useState('${org}');const name=id==='${org}'?'I Sell Property':'Kingdom Realty';return <FixtureWorkspace.Provider value={{currentWorkspace:{id,name},profile:{id:'${actor}'},workspaceRole:'principal'}}><header className="p-4"><h1>Rental acceptance · local fixtures</h1><p>Simulated sign-in; no real accounts or portals.</p><Switcher currentWorkspace={{id,name}} memberships={memberships} onChange={setId}/></header><Routes><Route path="/agent/rentals/listings/:listingId/edit" element={<Create/>}/><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<Detail/>}/></Routes></FixtureWorkspace.Provider>}createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`
const send = (res,data,error=null) => {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error}))}
const body = async req => {let value='';for await(const chunk of req)value+=chunk;if(value.length>1000000)throw new Error('Fixture body too large');return JSON.parse(value||'{}')}
const rpcFields = {save_rental_listing_expiry_v1:['p_listing_id','p_expected_updated_at','p_expiry_date'],save_rental_listing_gallery_v2:['p_listing_id','p_expected_updated_at','p_gallery','p_cover_index'],save_rental_listing_snapshot_v2:['p_listing_id','p_expected_updated_at','p_listing_patch','p_publication','p_gallery','p_cover_index','p_media_edits']}
const status = () => ({submissionAttempt:pending?{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',state:'uncertain',operation:'publish',startedAt:'2026-10-04T00:00:00Z',requiresReconciliation:true}:null})
const cacheDir = await mkdtemp(path.join(tmpdir(),'arch9-rental-browser-'))
const server = await createServer({root,cacheDir,configFile:false,plugins:[react(),{name:'rental-local-acceptance',enforce:'pre',resolveId(id){if(id==='/fixture/entry.jsx')return path.join(root,'fixture-entry.jsx')},load(id){if(id.endsWith('/fixture-entry.jsx'))return entry;return modules.get(path.relative(root,id))},configureServer(server){server.middlewares.use(async(req,res,next)=>{try{
 if(req.url==='/fixture/photo.svg' || req.url?.startsWith('/fixture/photo.svg?')){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#dbe6f2"/><text x="50" y="240">Local rental photo fixture</text></svg>');return}
 if(req.url?.startsWith('/fixture/') && req.method==='POST'){
 const b=await body(req), action=req.url.slice(9)
 if(action==='listing'){if(rejectNextRead){rejectNextRead=false;throw new Error('Fixture readback unavailable after commit')}send(res,await readListing(b.id));return}
 if(action==='list'){send(res,[await readListing(listing)]);return}
 if(action==='history'){send(res,(await db.query('select * from private_listing_activity where private_listing_id=$1 order by created_at desc,id desc',[b.id])).rows);return}
 if(action==='sign'){send(res,{...b.asset,url:photos+'/fixture/photo.svg?token=signed-'+ ++signing,signedUrl:photos+'/fixture/photo.svg?token=signed-'+signing});return}
 if(action==='rpc'){const fields=rpcFields[b.name];if(!fields||b.args.p_listing_id!==listing)throw new Error('Unsupported fixture RPC');const values=fields.map(k=>typeof b.args[k]==='object'&&b.args[k]!==null?JSON.stringify(b.args[k]):b.args[k]);const r=await db.query('select public.'+b.name+'('+fields.map((_,i)=>'$'+(i+1)).join(',')+') as receipt',values);if(loseReadbackAfterRpc){loseReadbackAfterRpc=false;rejectNextRead=true}send(res,r.rows[0].receipt);return}
 if(action==='event'){if(b.listingId!==listing)throw new Error('Unknown fixture listing');const r=await db.query('insert into private_listing_activity(private_listing_id,activity_type,activity_title,performed_by,visibility,metadata) values($1,$2,$3,$4,$5,$6::jsonb) returning *',[listing,'rental_channel_status_checked',b.channel+' '+b.stage,actor,'internal',JSON.stringify({...b.metadata,channel:b.channel})]);send(res,r.rows[0]);return}
 if(action==='channels'){send(res,{property24:status(),private_property:{},activity:(await db.query('select * from private_listing_activity where private_listing_id=$1 order by created_at desc',[b.id])).rows,errors:{}});return}
 if(action==='status'){send(res,status());return}
 if(action==='reconcile'){pending=false;send(res,{status:'RECONCILED',message:'Local exact-identity reconciliation fixture complete.'});return}
 if(action==='lose-readback'){loseReadbackAfterRpc=true;send(res,true);return}
 if(action==='checks'){const saved=await readListing(listing);send(res,{listing:saved,activity:(await db.query('select * from private_listing_activity where private_listing_id=$1 order by created_at',[listing])).rows});return}
 throw new Error('Unknown local fixture action')
 }
 if(req.url==='/'||req.url?.startsWith('/agent/rentals/listings/')){res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/',`<html><head><title>Rental local acceptance</title><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/fixture/entry.jsx"></script></body></html>`));return}
 next()
 }catch(error){send(res,null,{message:error.message,code:error.code})}})}}],server:{host,port,strictPort:true}})
await server.listen()
console.log(`Local rental acceptance: ${origin}/agent/rentals/listings/${listing}/marketing`)
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await server.close();await db.close();await rm(cacheDir,{recursive:true,force:true});process.exit(0)})
