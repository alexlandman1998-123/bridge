// Explicitly authorised demo-fixture replacement. Never fabricates legal evidence.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
assert.ok(process.argv.includes('--apply'))
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const read=async q=>{const r=await q;if(r.error)throw r.error;return r.data}
const ids=['a2ed99d4-8dc8-4fab-b6a2-e3fb688d7888','af2c0c2f-9a5b-463b-ab4b-19c3d3300de6','47053304-45c7-4cbe-bf46-69b12b98b082']
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({viewport:{width:1000,height:500}})
 for(const id of ids){
  const d=await read(admin.from('documents').select('*').eq('id',id).single())
  assert.equal(d.is_demo_data,true);assert.equal(d.transaction_id,'b27fc192-b5ff-471b-9da5-902409f78116')
  assert.equal(d.metadata.seedKey,'attorney-demo-full-workflows-v1')
  if(d.metadata.acceptanceFixture==='labelled-document-acceptance-v1'){console.log({id,alreadyRepaired:true});continue}
  assert.equal(d.canonical_requirement_instance_id,null)
  const linked=await read(admin.from('document_requirement_instances').select('id').eq('satisfied_by_document_id',id))
  assert.equal(linked.length,0,'Do not reset linked evidence without reconciling its review')
  const existing=await admin.storage.from(d.file_bucket||'documents').download(d.file_path)
  assert.ok(existing.error,'Never replace a fixture that has original bytes')
  await page.setContent('<html><body style="font:24px sans-serif;padding:40px"><h1>ARCH9 STAGING TEST ONLY</h1><p>Unsigned document acceptance sample.</p><p>NOT A BANK DOCUMENT. NOT LEGAL EVIDENCE.</p><p>Replaces an empty demo reference for software testing.</p></body></html>')
  const bytes=await page.screenshot()
  const fileName=`STAGING-TEST-ONLY-${id}.png`,filePath=`transaction-${d.transaction_id}/acceptance-fixtures/${fileName}`
  await read(admin.storage.from('documents').upload(filePath,bytes,{contentType:'image/png',upsert:false}))
  try {
   await read(admin.from('documents').update({name:`STAGING TEST ONLY - ${d.name} sample (unsigned)`,file_name:fileName,file_path:filePath,file_bucket:'documents',status:'uploaded',review_status:'uploaded',approved_by_user_id:null,approved_at:null,rejected_at:null,rejection_note:null,metadata:{...d.metadata,acceptanceFixture:'labelled-document-acceptance-v1',originalDemoRecord:d,notLegalEvidence:true}}).eq('id',id).eq('is_demo_data',true).select('id').single())
  } catch(error){await read(admin.storage.from('documents').remove([filePath]));throw error}
  console.log({id,repaired:true,approvalReset:true})
 }
} finally {await browser.close()}
