import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { auditSharedMatters, repairSharedMatter, RECONCILIATION_CONFIRMATION } from '../src/services/sharedMatterReconciliationService.js'
const id=randomUUID(), command=randomUUID(), calls=[]
const report={schemaVersion:1,transactionId:id,fingerprint:'a'.repeat(32),decision:'repairable'}
const client={async rpc(name,args){calls.push({name,args});return {data:name.includes('audit')?report:{commandId:command,after:{decision:'clean'}}}}}
assert.deepEqual(await auditSharedMatters(client,[id]),[report])
assert.ok(calls.every(c=>c.name==='bridge_audit_shared_matter_journey'))
await assert.rejects(auditSharedMatters(client,[]))
await assert.rejects(auditSharedMatters(client,[id,id]))
await assert.rejects(auditSharedMatters(client,Array.from({length:101},()=>randomUUID())))
await assert.rejects(repairSharedMatter(client,{...report,decision:'manual_review'},command,RECONCILIATION_CONFIRMATION))
await assert.rejects(repairSharedMatter(client,report,command,''))
assert.equal(calls.length,1)
await repairSharedMatter(client,report,command,RECONCILIATION_CONFIRMATION)
assert.equal(calls[1].args.p_expected_fingerprint,report.fingerprint)
assert.equal(calls[1].args.p_command_id,command)
await assert.rejects(repairSharedMatter({rpc:async()=>({error:{code:'40001'}})},report,command,RECONCILIATION_CONFIRMATION),/Reuse the same command/)
console.log('Shared matter reconciliation service checks passed')
