import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { actor, agentA, listingA, transactionSellerFixture, uuid } from './seller-alignment-database.mjs'

// Component acceptance fixture: real application editors/models and migration RPCs,
// synthetic permissions/HTTP transport. No hosted configuration, Auth or email.
const root = fileURLToPath(new URL('../../', import.meta.url))
const db = await transactionSellerFixture()
const transactionId = uuid(801)
let queue = Promise.resolve(), loseNextConfirmation = false, progressDelay = 0
const requests = []
const serial = operation => {
  const pending = queue.catch(() => null).then(operation)
  queue = pending
  return pending
}
const mapListing = (listing, onboarding) => ({ ...listing, propertyImageUrl: '/fixture-property.svg', id: listing.id, updatedAt: listing.updated_at,
  sellerCanonicalFacts: listing.seller_canonical_facts_json, sellerOnboardingStatus: onboarding.status,
  sellerOnboarding: { ...onboarding, formData: onboarding.form_data, form_data: onboarding.form_data, updatedAt: onboarding.updated_at },
})
async function snapshot() {
  await actor(db, 'authenticated', agentA)
  const { rows: [row] } = await db.query('select to_jsonb(l) listing,to_jsonb(o) onboarding from private_listings l join private_listing_seller_onboarding o on o.private_listing_id=l.id where l.id=$1', [listingA])
  return { listing: mapListing(row.listing, row.onboarding), onboarding: row.onboarding }
}
const rpcTypes = {
  bridge_get_transaction_seller_edit_context: { p_transaction_id: 'uuid' },
  bridge_get_transaction_seller_profile: { p_transaction_id: 'uuid' },
  bridge_save_transaction_seller_details: { p_transaction_id: 'uuid', p_revision: 'jsonb', p_patch: 'jsonb', p_mutation_id: 'uuid' },
    bridge_get_private_listing_seller_onboarding_form: { p_token: 'text' },
  bridge_update_private_listing_seller_onboarding_progress: { p_token: 'text', p_status: 'text', p_form_data: 'jsonb', p_seller_type: 'text', p_ownership_structure: 'text', p_marital_regime: 'text' },
  bridge_complete_private_listing_seller_onboarding: { p_token: 'text', p_form_data: 'jsonb', p_seller_type: 'text', p_ownership_structure: 'text', p_marital_regime: 'text' },
  save_private_listing_seller_onboarding_profile: { p_listing_id: 'uuid', p_token: 'text', p_form_data: 'jsonb', p_revision: 'jsonb', p_status: 'text', p_seller_type: 'text', p_ownership_structure: 'text', p_marital_regime: 'text', p_replace_token: 'boolean', p_reopen_for_correction: 'boolean' },
  save_private_listing_seller_canonical_update: { p_listing_id: 'uuid', p_form_data: 'jsonb', p_canonical_facts: 'jsonb', p_canonical_readiness: 'jsonb', p_listing_patch: 'jsonb', p_onboarding_status: 'text', p_seller_type: 'text', p_ownership_structure: 'text', p_marital_regime: 'text', p_mutation_id: 'uuid', p_mutation_type: 'text', p_source: 'text', p_changed_fields: 'text[]', p_expected_updated_at: 'timestamptz' },
}
async function rpc(name, params) {
  const types = Object.hasOwn(rpcTypes, name) ? rpcTypes[name] : null
  if (!types || Object.keys(params).some(key => !types[key])) throw new Error(`Unexpected isolated RPC ${name}`)
  const seller = ['bridge_get_private_listing_seller_onboarding_form', 'bridge_update_private_listing_seller_onboarding_progress', 'bridge_complete_private_listing_seller_onboarding'].includes(name)
  await actor(db, seller ? 'anon' : 'authenticated', seller ? '' : agentA)
  const args = Object.entries(params)
  const sqlArgs = args.map(([key], index) => `${key}:=${types[key] === 'text[]' ? `array(select jsonb_array_elements_text($${index + 1}::jsonb))` : `$${index + 1}::${types[key]}`}`).join(',')
  const values = args.map(([key, value]) => ['jsonb', 'text[]'].includes(types[key]) ? JSON.stringify(value) : value)
  const { rows: [row] } = await db.query(`select public.${name}(${sqlArgs}) result`, values)
  return row.result
}
const transport = `
export async function localRequest(path, body){const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await response.json();return result;}
export const isSupabaseConfigured=true;
export const supabase={rpc:(name,params)=>localRequest('rpc',{name,params}),auth:{getUser:async()=>({data:{user:{id:'${agentA}'}},error:null})},from(){throw new Error('Unexpected direct table access in isolated fixture')},functions:{invoke(){throw new Error('External functions disabled in isolated fixture')}}};
export const DOCUMENTS_BUCKET='documents',DOCUMENTS_BUCKET_CANDIDATES=['documents'],LEGAL_TEMPLATES_BUCKET='templates',LEGAL_TEMPLATES_BUCKET_CANDIDATES=['templates'],BRANDING_BUCKET='branding',BRANDING_BUCKET_CANDIDATES=['branding'],PROFILE_AVATAR_BUCKET='avatars',PROFILE_AVATAR_BUCKET_CANDIDATES=['avatars'];
export const clearSupabaseLocalAuthState=async()=>{},isUnsupportedJwtAlgorithmError=()=>false,isUserFromSubClaimMissingError=()=>false,createScopedSupabaseClient=()=>supabase;
export function invokeEdgeFunction(){throw new Error('External functions disabled in isolated fixture')};export const getEdgeFunctionInvokeError=()=>null,assertEdgeFunctionSuccess=x=>x;
`
const privateSource = await readFile(new URL('../../src/services/privateListingService.js', import.meta.url), 'utf8')
const privateNames = [...privateSource.matchAll(/export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)/g)].map(match => match[1] || match[2])
const privateTransport = `
import{localRequest,supabase}from'isolated-client';
import{getSellerOnboardingSaveRevision,buildListingSellerCanonicalSavePayload}from'${root}src/services/listings/listingSellerCanonicalUpdateModel.js';
const context=result=>{if(result.error)throw Object.assign(new Error(result.error.code==='PT409'?'Someone else saved changes to this seller record. Your entries are still in this form. Review the latest saved details before trying again.':result.error.message),result.error);return result.data;};
const map=data=>({listing:{...data.listing,propertyImageUrl:'/fixture-property.svg',updatedAt:data.listing.updated_at,sellerCanonicalFacts:data.listing.seller_canonical_facts_json,sellerOnboarding:{...data.onboarding,formData:data.onboarding.form_data,form_data:data.onboarding.form_data,updatedAt:data.onboarding.updated_at}},onboarding:data.onboarding});
export async function getSellerOnboardingByToken(token){const read=context(await localRequest('portal-context',{token}));return map(read);}
export async function updateSellerOnboardingProgress(token,payload){const data=context(await supabase.rpc('bridge_update_private_listing_seller_onboarding_progress',{p_token:token,p_status:payload.status,p_form_data:{...payload.formData,__sellerSave:getSellerOnboardingSaveRevision(payload.listingSnapshot)}}));return map(data);}
export async function submitSellerOnboarding(token,payload){context(await supabase.rpc('bridge_complete_private_listing_seller_onboarding',{p_token:token,p_form_data:{...payload.formData,__sellerSave:getSellerOnboardingSaveRevision(payload.listingSnapshot)}}));return getSellerOnboardingByToken(token);}
export async function savePrivateListingSellerCanonicalUpdate(update){const p=buildListingSellerCanonicalSavePayload(update);const data=context(await supabase.rpc('save_private_listing_seller_canonical_update',{p_listing_id:update.listingId,p_form_data:{...p.formData,__sellerSave:update.expectedOnboardingRevision},p_canonical_facts:update.canonicalFacts,p_canonical_readiness:update.readiness,p_listing_patch:p.listingPatch,p_onboarding_status:update.onboardingStatus,p_seller_type:update.sellerType,p_ownership_structure:update.ownershipStructure,p_marital_regime:update.maritalRegime,p_mutation_id:update.mutationId,p_mutation_type:update.mutationType,p_source:update.source,p_changed_fields:update.changedFields,p_expected_updated_at:update.expectedUpdatedAt||null}));return{receipt:data,listing:map(data).listing};}
${privateNames.filter(name=>!['getSellerOnboardingByToken','updateSellerOnboardingProgress','submitSellerOnboarding','savePrivateListingSellerCanonicalUpdate'].includes(name)).map(name=>`export const ${name}=()=>{throw new Error('Unexpected service ${name} in isolated fixture')};`).join('\n')}
`
const bundle = await build({ entryPoints: [fileURLToPath(new URL('./seller-alignment-browser.jsx', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'seller-isolated-transport', setup(b) {
  b.onResolve({ filter: /supabaseClient(?:\.js)?$|^isolated-client$/ }, () => ({ path: 'client', namespace: 'isolated' }))
  b.onResolve({ filter: /privateListingService(?:\.js)?$/ }, () => ({ path: 'private', namespace: 'isolated' }))
  b.onResolve({ filter: /dealSetupService(?:\.js)?$/ }, () => ({ path: 'deal', namespace: 'isolated' }))
  b.onResolve({ filter: /useImportedDealReviewStatuses\.js$/ }, () => ({ path: 'review', namespace: 'isolated' }))
  b.onResolve({ filter: /TransactionBuyerPartiesPanel$|DealSetupReadinessPanel$|TransactionDetailReviewPanel\.jsx$/ }, () => ({ path: 'empty', namespace: 'isolated' }))
  b.onLoad({ filter: /.*/, namespace: 'isolated' }, ({ path }) => ({ contents: path === 'client' ? transport : path === 'private' ? privateTransport : path === 'deal' ? `export async function loadCanonicalDealSetup(){return{setup:{terms:{purchasePrice:1200000,depositAmount:100000,purchaserType:'individual'},finance:{type:'cash',cashAmount:1200000}}}};export function saveCanonicalDealTerms(){throw new Error('Buyer changes outside fixture scope')}` : path === 'review' ? 'export default function(){return {summaries:{},error:null}}' : 'export default function(){return null}', loader: 'js', resolveDir: root }))
} }] })
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/fixture-property.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="#263a50"/></svg>'); return }
    if (req.url === '/runtime.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return }
    if (!req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;margin:24px;max-width:1100px}label{display:block;margin:8px}input,select,textarea{padding:8px;border:1px solid #aaa}button{padding:10px;margin:8px}section{margin:14px 0}[role=alert]{color:#b91c1c}[hidden]{display:none}</style></head><body><div id="root"></div><script type="module" src="/runtime.js"></script></body></html>'); return }
    if (req.url.startsWith('/api/public/seller-onboarding-branding')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ branding: { name: 'Isolated Agency' } })); return }
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : {}
    if (body.name === 'bridge_update_private_listing_seller_onboarding_progress' && progressDelay) await new Promise(resolve => setTimeout(resolve, progressDelay))
    const result = await serial(async () => {
      if (req.url === '/api/snapshot') return snapshot()
      if (req.url === '/api/public/seller-onboarding-submitted-notification') return { ok: true, delivery: 'disabled-in-isolated-fixture' }
      if (req.url === '/api/portal-context') {
        const onboarding = await rpc('bridge_get_private_listing_seller_onboarding_form', { p_token: body.token })
        if (!onboarding || onboarding.private_listing_id !== listingA) return { data: null, error: { message: 'Invalid isolated intake token' } }
        // Represents the server-side portal API projection after the real token
        // reader validates access; the private resolver is never granted to anon.
        await actor(db, 'postgres')
        const { rows: [listing] } = await db.query('select * from private_listings where id=$1', [onboarding.private_listing_id])
        return { data: { listing, onboarding }, error: null }
      }
      if (req.url === '/api/evidence') { const saved = await snapshot(); await actor(db, 'postgres'); return { ...saved, transactions: (await db.query('select * from transactions')).rows, participants: (await db.query('select * from transaction_participants order by id')).rows, forms: (await db.query('select * from onboarding_form_data')).rows, receipts: (await db.query('select * from seller_save_private.transaction_receipts')).rows, requests } }
      if (req.url === '/api/control') {
        await actor(db, 'postgres')
        if (body.action === 'lose-next-confirmation') loseNextConfirmation = true
        else if (body.action === 'delay-progress') progressDelay = Number(body.milliseconds) || 0
        else if (body.action === 'reject-projection') await db.exec(`create or replace function reject_browser_projection() returns trigger language plpgsql as $$begin raise exception 'simulated projection failure'; end$$;create trigger browser_projection_failure before update on transaction_participants for each row execute function reject_browser_projection();`)
        else if (body.action === 'allow-projection') await db.exec('drop trigger if exists browser_projection_failure on transaction_participants')
        else throw new Error('Unexpected fixture control')
        return { ok: true }
      }
      if (req.url !== '/api/rpc') throw new Error('Unexpected fixture path')
      try {
        const data = await rpc(body.name, body.params)
        requests.push({ name: body.name, params: body.params, outcome: 'committed' })
        if (loseNextConfirmation && body.name === 'bridge_save_transaction_seller_details') { loseNextConfirmation = false; return { data: null, error: { code: 'LOCAL_TIMEOUT', message: 'The save confirmation was interrupted. Your entries are still in this form. Retry this save.' } } }
        return { data, error: null }
      } catch (error) { requests.push({ name: body.name, params: body.params, outcome: error.code || 'failed' }); return { data: null, error: { code: error.code, message: error.message } } }
    })
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result))
  } catch (error) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: error.message } })) }
})
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, listingId: listingA, transactionId, isolation: 'synthetic-PGlite-only' })))
const close = async () => { const closed = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closed; await db.close(); process.exit(0) }
process.on('SIGINT', close); process.on('SIGTERM', close)
