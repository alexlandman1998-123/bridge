import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../src/lib/api.js',import.meta.url),'utf8')
const start=source.indexOf('async function notifyRolesForTransaction('),end=source.indexOf('  if (!isMissingFunctionError(receipt.error',start)
let payload
const run=Function('normalizeEventType','normalizeNotificationType',source.slice(start,end)+'};return notifyRolesForTransaction')(
 value=>value==='DocumentUploaded'?value:'TransactionUpdated',()=> 'readiness_updated')
const client={async rpc(_name,input){payload=input;return{data:1}}}
await run(client,{transactionId:'tx',eventType:'signed_otp_handoff_release_decision',notificationType:'readiness_updated'})
assert.equal(payload.p_event_type,'TransactionUpdated')
assert.equal(payload.p_notification_type,'readiness_updated')
await run(client,{transactionId:'tx',eventType:'DocumentUploaded'})
assert.equal(payload.p_event_type,'DocumentUploaded')
console.log('Scoped notification RPC keeps semantic notification types separate from constrained audit event types.')
