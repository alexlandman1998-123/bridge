// Read-only staging diagnostic; logs endpoint names, never tokens or payloads.
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const env = Object.fromEntries(readFileSync('.env.staging.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }))
assert.equal(env.VITE_SUPABASE_URL, 'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } })
const { data: link, error } = await admin.from('client_portal_links').select('token').eq('transaction_id','b27fc192-b5ff-471b-9da5-902409f78116').eq('is_active',true).limit(1).single()
if(error) throw new Error(error.message)
for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_KEY']) process.env[key]=env[key]
const originalFetch=globalThis.fetch
globalThis.fetch=async (input, init) => {
  const start=Date.now(), endpoint=new URL(typeof input==='string'?input:input.url).pathname
  const response=await originalFetch(input,init)
  console.log(JSON.stringify({endpoint,status:response.status,ms:Date.now()-start}))
  return response
}
const server=await createServer({configFile:false,envFile:false,logLevel:'silent',server:{middlewareMode:true}})
try {
  const {getClientPortalWorkspaceData}=await server.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')
  const start=Date.now()
  const result=await getClientPortalWorkspaceData(link.token,'buying',{mode:'core'})
  assert.equal(result.legacyPortalData.transaction.id,'b27fc192-b5ff-471b-9da5-902409f78116')
  console.log(JSON.stringify({core:'PASS',ms:Date.now()-start}))
} catch(error) { console.error(JSON.stringify({code:error.code||null,message:error.message}));process.exitCode=1 }
finally {await server.close();process.exit(process.exitCode||0)}
