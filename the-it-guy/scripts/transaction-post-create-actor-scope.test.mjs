import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/lib/api.js',import.meta.url),'utf8')
const creation=source.slice(source.indexOf('export async function createTransactionFromWizard'))
const start=creation.indexOf('  const creationSession ='),end=creation.indexOf('  const actorRole =',start)
assert.ok(start>=0&&end>start)
const capture=new (Object.getPrototypeOf(async function(){}).constructor)('client','actorUserId','createScopedSupabaseClient',creation.slice(start,end)+'\nreturn postCreateClient')
let current={user:{id:'initiating-professional'},access_token:'controlled-initiator-token'}
const client={auth:{getSession:async()=>({data:{session:current}})}}
const calls=[]
const scoped=headers=>{calls.push(headers);return {headers}}
const pinned=await capture(client,'initiating-professional',scoped)
current={user:{id:'next-buyer'},access_token:'controlled-buyer-token'}
assert.equal(pinned.headers.Authorization,'Bearer controlled-initiator-token','Accepted follow-up writes retain the initiating identity after an account switch')
await assert.rejects(()=>capture(client,'initiating-professional',scoped),/signed-in account changed/)
assert.equal(calls.length,1,'A changed identity must not start follow-up work')
assert.equal(await capture({},'initiating-professional',scoped) instanceof Object,true)
assert.match(creation,/const runPostCreateWork = async \(\) => \{\s*const client = postCreateClient/)
console.log('PASS post-create actor snapshot, account-switch isolation, early mismatch rejection and scoped follow-up client binding.')
