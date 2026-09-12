// Opt-in live regression against one labelled staging fixture only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { workflowBrowserReloadCheck } from './workflow-browser-reload-check.mjs'

assert.ok(process.argv.includes('--apply'), 'Pass --apply to exercise and restore the staging fixture')
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const client=key=>createClient(env.VITE_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=client(env.SUPABASE_SERVICE_ROLE_KEY), attorney=client(env.VITE_SUPABASE_ANON_KEY), agent=client(env.VITE_SUPABASE_ANON_KEY)
const read=async query=>{const r=await query;if(r.error)throw new Error(r.error.message);return r.data}
await read(attorney.auth.signInWithPassword({email:'attorney.demo@arch9.co.za',password:env.ATTORNEY_DEMO_PASSWORD}))
const link=await read(admin.auth.admin.generateLink({type:'magiclink',email:'journey.agent.staging@example.test'}))
await read(agent.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token}))
const matter='b27fc192-b5ff-471b-9da5-902409f78116', step='4db3fbc0-1b51-4aa2-a8b6-35cc7868b74f'
assert.equal((await read(attorney.from('transactions').select('is_demo_data').eq('id',matter).single())).is_demo_data,true)
const getStep=()=>read(attorney.from('transaction_subprocess_steps').select('id,status,comment,visibility_scope,updated_at,step_key').eq('id',step).single())
const original=await getStep()
assert.equal(original.step_key,'instruction_received')
const change=async(status,note,visibility)=>{
  const row=await getStep()
  await read(attorney.rpc('bridge_update_attorney_workflow_step_v4',{p_transaction_id:matter,p_lane_key:'transfer',p_step_id:step,p_status:status,p_command_id:randomUUID(),p_expected_step_updated_at:row.updated_at,p_note:note,p_visibility:visibility,p_work_packet:null}))
}
const browser=await workflowBrowserReloadCheck({matter,readers:{agent}})
try {
  for(const status of ['completed','not_applicable','not_started']) {
    await change(status,'STAGING AGENT PROGRESS REGRESSION: test outcome; original state restored afterwards.','internal')
    await browser.check('transfer','instruction_received',status)
  }
} finally {
  try {
    await change(original.status,original.comment||'',original.visibility_scope||'internal')
    const restored=await getStep()
    assert.equal(restored.status,original.status)
    assert.equal(restored.comment,original.comment||'')
    assert.equal(restored.visibility_scope,original.visibility_scope||'internal')
    console.log('PASS: original staging outcome, note and visibility restored; audit history retained')
  } finally { await browser.close() }
}
