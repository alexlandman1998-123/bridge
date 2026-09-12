import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const opts={auth:{persistSession:false,autoRefreshToken:false}}
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,opts)
const actor=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,opts)
const read=async q=>{const r=await q;if(r.error)throw new Error(r.error.message);return r.data}
const link=await read(admin.auth.admin.generateLink({type:'magiclink',email:'transfer.attorney.uat@arch9.co.za'}))
const login=await read(actor.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token}))
const matter='b27fc192-b5ff-471b-9da5-902409f78116'
await read(actor.rpc('bridge_read_professional_matter_journey',{p_transaction_id:matter}))
const browser=await chromium.launch()
try {
  const context=await browser.newContext()
  await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;return host.endsWith('.supabase.co')&&host!=='vaszuxjeoajeuhlcnzzf.supabase.co'?route.abort():route.continue()})
  await context.addInitScript(session=>{if(location.origin==='http://127.0.0.1:4180')localStorage.setItem('sb-vaszuxjeoajeuhlcnzzf-auth-token',JSON.stringify(session))},login.session)
  const page=await context.newPage(), errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  for(let i=0;i<2;i++) {
    await page.goto(`http://127.0.0.1:4180/transactions/${matter}`,{waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'Work',exact:true}).click({timeout:60000})
    await page.getByRole('navigation',{name:/stages$/}).waitFor({timeout:60000})
    const save=page.getByRole('button',{name:'Save progress',exact:true})
    await save.waitFor({timeout:15000})
    assert.equal(await save.isEnabled(),true)
    assert.deepEqual(errors,[])
    await page.screenshot({path:'test-results/attorney-assignee-work.png',fullPage:true})
    console.log('PASS: secondary assigned attorney Work loads with enabled save control')
    await page.reload({waitUntil:'domcontentloaded'})
  }
} finally {await browser.close()}
