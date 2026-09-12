import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { documentAcceptanceReaders } from './document-acceptance-role-readers.mjs'

const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const login=await client.auth.signInWithPassword({email:'attorney.demo@arch9.co.za',password:env.ATTORNEY_DEMO_PASSWORD})
if(login.error)throw new Error(login.error.message)
const verifyRoles = await documentAcceptanceReaders(env, 'b27fc192-b5ff-471b-9da5-902409f78116', client)
const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1100}})
await context.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.hostname.endsWith('.supabase.co')&&url.hostname!=='vaszuxjeoajeuhlcnzzf.supabase.co') return route.abort('blockedbyclient')
  return route.continue()
})
await context.addInitScript(session=>{
  if(location.origin==='http://localhost:4177')localStorage.setItem('sb-vaszuxjeoajeuhlcnzzf-auth-token',JSON.stringify(session))
},login.data.session)
const page=await context.newPage()
let uploadedDocumentId = process.env.DOCUMENT_ACCEPTANCE_EXISTING_ID || null
if(uploadedDocumentId) {
  const existing = await client.from('documents').select('name,transaction_id,status').eq('id', uploadedDocumentId).single()
  if(existing.error)throw existing.error
  assert.equal(existing.data.name, 'STAGING-TEST-ONLY-document-acceptance-linked.png')
  assert.equal(existing.data.transaction_id, 'b27fc192-b5ff-471b-9da5-902409f78116')
  assert.equal(existing.data.status, 'uploaded')
}
page.on('response', async response => {
  if(new URL(response.url()).pathname === '/rest/v1/documents' && response.request().method() === 'POST' && response.ok()) {
    const result = await response.json()
    uploadedDocumentId = Array.isArray(result) ? result[0]?.id : result.id
  }
})
const fixturePage=await context.newPage()
await fixturePage.setContent('<html><body style="font:24px sans-serif;padding:50px"><h1>ARCH9 STAGING TEST ONLY</h1><p>Document acceptance sample.</p><p>NOT SIGNED. NOT LEGAL EVIDENCE.</p><p>Used only to verify upload, preview and review controls.</p></body></html>')
const fixtureBytes=await fixturePage.screenshot()
await fixturePage.close()
page.on('pageerror',e=>console.log('PAGE ERROR:',e.message))
page.on('response', async response => {
  if(response.status() >= 400 && response.url().includes('/rest/v1/')) {
    const body = await response.json().catch(() => ({}))
    console.log('API failure', new URL(response.url()).pathname, response.status(), body.code || '', body.message || '')
  }
})
try {
  await page.goto('http://localhost:4177/transactions/b27fc192-b5ff-471b-9da5-902409f78116',{waitUntil:'domcontentloaded'})
  await page.getByRole('button',{name:'Documents',exact:true}).waitFor({timeout:60000})
  await page.getByRole('button',{name:'Documents',exact:true}).click()
  await page.getByRole('button',{name:'Upload Document',exact:true}).waitFor({timeout:90000})
  if(!uploadedDocumentId) {
  await page.getByRole('button',{name:'Upload Document',exact:true}).click()
  await page.locator('input[type=file]').setInputFiles({name:'STAGING-TEST-ONLY-document-acceptance-linked.png',mimeType:'image/png',buffer:fixtureBytes})
  await page.getByPlaceholder('e.g. rates_clearance_certificate').fill('staging_acceptance_test')
  await page.locator('select').nth(1).selectOption({label:'Buyer & seller visible'})
  await page.locator('select').nth(2).selectOption({label:'Transfer'})
  await page.locator('select').nth(3).selectOption({label:'Yes'})
  await page.getByLabel('Required document',{exact:true}).selectOption({label:'Offer to Purchase (OTP)'})
  await page.getByRole('button',{name:'Upload Document',exact:true}).last().click()
  await page.locator('input[type=file]').waitFor({state:'detached',timeout:45000})
  }
  assert.ok(uploadedDocumentId, 'Upload did not return its saved document ID')
  await verifyRoles(uploadedDocumentId, 'uploaded')
  await page.waitForTimeout(4000)
  await page.reload({waitUntil:'domcontentloaded'})
  await page.getByRole('button',{name:'Documents',exact:true}).click()
  await page.getByRole('button',{name:/^Sale Documents/}).first().waitFor({timeout:45000})
  await page.getByRole('button',{name:/^Sale Documents/}).first().click()
  const popupPromise=page.waitForEvent('popup')
  await page.getByRole('button',{name:'Preview',exact:true}).click()
  const preview=await popupPromise
  await preview.waitForURL('**/storage/v1/**',{timeout:30000})
  await preview.locator('img').waitFor()
  assert.ok(await preview.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),'Preview did not render')
  await preview.screenshot({path:'test-results/document-acceptance-preview.png'})
  await preview.close()
  await page.getByRole('button',{name:'Verify',exact:true}).click()
  const approvalResponse=page.waitForResponse(r=>r.url().includes('/rpc/bridge_review_canonical_requirement'))
  await page.getByRole('button',{name:'Approve',exact:true}).click()
  const approved=await approvalResponse
  console.log('Approval HTTP',approved.status())
  if(!approved.ok())console.log('Approval error',await approved.text())
  assert.ok(approved.ok(),'Approval RPC failed')
  await page.getByPlaceholder('Add an optional note for the approval event...').waitFor({state:'detached',timeout:60000})
  await page.reload({waitUntil:'domcontentloaded'})
  await page.getByRole('button',{name:'Documents',exact:true}).click()
  await page.getByRole('button',{name:/^Sale Documents/}).first().waitFor({timeout:45000})
  await page.getByRole('button',{name:/^Sale Documents/}).first().click()
  console.log('AFTER APPROVAL RELOAD', (await page.locator('body').innerText()).slice(-5000))
  assert.match(await page.locator('article').filter({hasText:'Offer to Purchase (OTP)'}).first().innerText(), /Verified/)
  await verifyRoles(uploadedDocumentId, 'approved')
  await page.getByRole('button',{name:'Reject',exact:true}).click()
  await page.getByPlaceholder('Add the reason that should appear on the document card...').fill('STAGING TEST ONLY: deliberate rejection to verify persistence. Not legal evidence.')
  const rejectionResponse=page.waitForResponse(r=>r.url().includes('/rpc/bridge_review_canonical_requirement'))
  await page.getByRole('button',{name:'Reject',exact:true}).last().click()
  assert.ok((await rejectionResponse).ok(),'Rejection RPC failed')
  await page.getByPlaceholder('Add the reason that should appear on the document card...').waitFor({state:'detached',timeout:60000})
  await page.reload({waitUntil:'domcontentloaded'})
  await page.getByRole('button',{name:'Documents',exact:true}).click()
  await page.getByRole('button',{name:/^Sale Documents/}).first().waitFor({timeout:45000})
  await page.getByRole('button',{name:/^Sale Documents/}).first().click()
  console.log('AFTER REJECTION RELOAD', (await page.locator('body').innerText()).slice(-5000))
  assert.match(await page.locator('article').filter({hasText:'Offer to Purchase (OTP)'}).first().innerText(), /Rejected/)
  await verifyRoles(uploadedDocumentId, 'rejected')
  await page.screenshot({path:'test-results/document-acceptance-rejected.png'})
  console.log(await page.locator('input,select,textarea').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,type:n.type,name:n.name,placeholder:n.placeholder,accept:n.accept,options:n.tagName==='SELECT'?n.innerText:undefined}))))
} catch(error) {
  await page.screenshot({path:'test-results/document-acceptance-failure.png'})
  console.log('Visible failure state', (await page.locator('body').innerText()).slice(-3500))
  throw error
} finally {await browser.close()}
