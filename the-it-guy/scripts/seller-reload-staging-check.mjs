import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { workflowBrowserReloadCheck } from './workflow-browser-reload-check.mjs'
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const opts={auth:{persistSession:false,autoRefreshToken:false}}
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,opts)
const seller=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,opts)
const read=async q=>{const r=await q;if(r.error)throw new Error(r.error.message);return r.data}
const matter='b27fc192-b5ff-471b-9da5-902409f78116'
const tx=await read(admin.from('transactions').select('is_demo_data,listing_id').eq('id',matter).single())
assert.equal(tx.is_demo_data,true)
const onboarding=await read(admin.from('private_listing_seller_onboarding').select('seller_portal_token').eq('private_listing_id',tx.listing_id).single())
const sellerToken=onboarding.seller_portal_token
const sellerSession=await read(seller.rpc('bridge_verify_private_listing_seller_portal_password',{p_token:sellerToken,p_password:env.ATTORNEY_DEMO_PASSWORD}))
assert.ok(sellerSession.accessToken)
const snapshot=await read(seller.rpc('bridge_read_seller_shared_matter_journey',{p_token:sellerToken,p_access_token:sellerSession.accessToken}))
const status=snapshot.lanes.find(l=>l.key==='transfer').phases[0].tasks[0].status
const browsers=[]
try {
  for(let i=0;i<(process.argv.includes('--concurrent')?3:1);i++) browsers.push(await workflowBrowserReloadCheck({matter,readers:{seller},sellerToken,sellerSession,sellerTransientFailure:process.argv.includes('--transient')}))
  for(let i=0;i<3;i++) await Promise.all(browsers.map(browser=>browser.check('transfer','instruction_received',status)))
} finally { await Promise.all(browsers.map(browser=>browser.close())) }
console.log('PASS: repeated seller reloads; no workflow data changed')
