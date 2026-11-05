import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/lib/api.js',import.meta.url),'utf8')
const start=source.indexOf('  let client = requireClient()',source.indexOf('export async function uploadDocument('))
const end=source.indexOf('  const filePolicy =',start)
const prepare=new (Object.getPrototypeOf(async function(){}).constructor)('requireClient','assertActiveTransactionForDocumentUpload','resolveActiveProfileContext','createScopedSupabaseClient','transactionId',source.slice(start,end)+'\nreturn client')
let session={user:{id:'professional'},access_token:'controlled-professional-token'}
const original={auth:{getSession:async()=>({data:{session}})}}
const scoped=headers=>({headers})
const pinned=await prepare(()=>original,async()=> 'matter',async()=>({userId:'professional'}),scoped,'matter')
session={user:{id:'buyer'},access_token:'controlled-buyer-token'}
assert.equal(pinned.headers.Authorization,'Bearer controlled-professional-token')
await assert.rejects(()=>prepare(()=>original,async()=> 'matter',async()=>({userId:'professional'}),scoped,'matter'),/account changed/)
const readiness=source.slice(source.indexOf('async function computeTransactionReadinessSnapshot('),source.indexOf('\nasync function ',source.indexOf('async function computeTransactionReadinessSnapshot(')+20))
assert.match(readiness,/getOrCreateTransactionOnboardingRecord\(client,[\s\S]*?createIfMissing: false/)
assert.match(readiness,/onboarding_status, onboarding_completed_at/)
console.log('PASS upload operation keeps the verified actor across sign-out, rejects identity changes, and readiness reads cannot create onboarding records.')
