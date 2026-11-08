import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createClient} from '@supabase/supabase-js'
const source=readFileSync(new URL('../src/lib/supabaseClient.js',import.meta.url),'utf8')
const start=source.indexOf('export function createScopedSupabaseClient('),end=source.indexOf('\nexport const __supabaseClientTestUtils',start)
const factory=new Function('createClient','isSupabaseConfigured','supabaseUrl','supabaseKey','scopedClientCache',source.slice(start,end).replace('export function','function')+'\nreturn createScopedSupabaseClient')
const calls=[],original=globalThis.fetch
globalThis.fetch=async(input,options={})=>{
 calls.push({url:String(input),authorization:new Headers(options.headers).get('authorization')})
 return new Response(JSON.stringify({id:'verified-initiator',email:'controlled@example.test'}),{status:200,headers:{'content-type':'application/json'}})
}
try{
 const scoped=factory(createClient,true,'https://controlled.supabase.co','controlled-anonymous-key',new Map())
 const client=scoped({authorization:'Bearer controlled-initiator-token'})
 assert.equal(scoped({Authorization:'Bearer controlled-initiator-token'}),client,'Header casing must not duplicate clients')
 const user=await client.auth.getUser()
 assert.equal(user.error,null)
 assert.equal(user.data.user.id,'verified-initiator')
 assert.equal(calls.length,1)
 assert.equal(calls[0].authorization,'Bearer controlled-initiator-token','The SDK must send exactly one user token, never merge anonymous and user keys')
 await client.from('transactions').select('id')
 assert.equal(calls[1].authorization,'Bearer controlled-initiator-token')
 console.log('PASS actual Supabase SDK Auth and REST share the single scoped user token with case-insensitive client caching.')
}finally{globalThis.fetch=original}
