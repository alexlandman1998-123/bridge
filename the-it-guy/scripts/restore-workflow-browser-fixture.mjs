// Recovery for the single labelled browser test after its cleanup timed out.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
const env=Object.fromEntries(readFileSync('.env.staging.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
assert.equal(env.VITE_SUPABASE_URL,'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const read=async query=>{const r=await query;if(r.error)throw r.error;return r.data}
const login=await client.auth.signInWithPassword({email:'attorney.demo@arch9.co.za',password:env.ATTORNEY_DEMO_PASSWORD})
if(login.error)throw login.error
const matter='b27fc192-b5ff-471b-9da5-902409f78116', step='4db3fbc0-1b51-4aa2-a8b6-35cc7868b74f'
assert.equal((await read(client.from('transactions').select('is_demo_data').eq('id',matter).single())).is_demo_data,true)
const row=await read(client.from('transaction_subprocess_steps').select('*').eq('id',step).single())
const originalNote='Staging browser sync verification; original completed outcome restored.'
if(row.status==='completed'&&row.comment===originalNote){console.log('Already restored');process.exit(0)}
assert.equal(row.step_key,'instruction_received')
assert.equal(row.status,'not_applicable')
assert.equal(row.comment,'STAGING ACCEPTANCE ONLY: completion, N/A and reopen verification; original outcome restored afterwards.')
await read(client.rpc('bridge_update_attorney_workflow_step_v4',{p_transaction_id:matter,p_lane_key:'transfer',p_step_id:step,p_status:'completed',p_command_id:randomUUID(),p_expected_step_updated_at:row.updated_at,p_note:originalNote,p_visibility:'internal',p_work_packet:null}))
const restored=await read(client.from('transaction_subprocess_steps').select('status,comment').eq('id',step).single())
assert.equal(restored.status,'completed');assert.equal(restored.comment,originalNote)
console.log('PASS: original browser-fixture outcome and note restored through authenticated command; production unchanged')
