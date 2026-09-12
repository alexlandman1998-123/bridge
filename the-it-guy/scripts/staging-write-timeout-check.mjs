import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
assert.ok(process.argv.includes('--apply'),'Explicit staging test opt-in required')
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const read=async q=>{const r=await q;if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});return r.data}
await read(client.auth.signInWithPassword({email:'attorney.demo@arch9.co.za',password:env.ATTORNEY_DEMO_PASSWORD}))
for(const matter of ['b27fc192-b5ff-471b-9da5-902409f78116','80b452c8-3d5f-4597-9da7-0cdef47540e1']) {
  if(process.argv.includes('--sixth-only') && matter!=='80b452c8-3d5f-4597-9da7-0cdef47540e1')continue
  if(matter==='80b452c8-3d5f-4597-9da7-0cdef47540e1') {
    const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const link=await read(admin.auth.admin.generateLink({type:'magiclink',email:'transfer.attorney.uat@arch9.co.za'}))
    await read(client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token}))
  }
  assert.equal((await read(client.from('transactions').select('is_demo_data').eq('id',matter).single())).is_demo_data,true)
  const lane=await read(client.from('transaction_subprocesses').select('id').eq('transaction_id',matter).eq('process_type','transfer').single())
  const get=()=>read(client.from('transaction_subprocess_steps').select('id,status,comment,visibility_scope,updated_at').eq('subprocess_id',lane.id).eq('step_key','instruction_received').single())
  const original=await get()
  const history=await read(client.from('transaction_attorney_lane_history').select('*').eq('transaction_id',matter))
  async function change(status,restore=false) {
    const current=await get(),command=randomUUID()
    const args={p_transaction_id:matter,p_lane_key:'transfer',p_step_id:current.id,p_status:status,p_command_id:command,p_expected_step_updated_at:current.updated_at,p_note:restore?(original.comment||''):'STAGING WRITE TIMEOUT CHECK: original outcome restored after measurement.',p_visibility:restore?(original.visibility_scope||'internal'):'internal',p_work_packet:null}
    const start=Date.now()
    const result=await client.rpc('bridge_update_attorney_workflow_step_v4',args)
    console.log(JSON.stringify({matter,status,restore,writeMs:Date.now()-start,code:result.error?.code||null,error:result.error?.message||null}))
    if(result.error)throw Object.assign(new Error(result.error.message),{code:result.error.code})
  }
  try {
    for(const status of ['completed','not_applicable','not_started']) {
      const results=await Promise.allSettled([
        change(status),
        ...Array.from({length:5},async()=>{const start=Date.now();const r=await client.rpc('bridge_read_professional_matter_journey',{p_transaction_id:matter});return {readMs:Date.now()-start,code:r.error?.code||null}}),
      ])
      console.log(JSON.stringify({matter,status,concurrentReads:results.slice(1).map(r=>r.status==='fulfilled'?r.value:{error:r.reason?.message})}))
      if(results[0].status==='rejected')throw results[0].reason
      assert.equal((await get()).status,status)
    }
  } finally {
    await change(original.status,true)
    const restored=await get()
    assert.equal(restored.status,original.status);assert.equal(restored.comment||'',original.comment||'');assert.equal(restored.visibility_scope,original.visibility_scope||'internal')
    const after=await read(client.from('transaction_attorney_lane_history').select('*').eq('transaction_id',matter))
    for(const row of history)assert.deepEqual(after.find(item=>item.id===row.id),row)
    console.log(JSON.stringify({matter,originalOutcomeRestored:true,historyPreserved:true}))
  }
}
