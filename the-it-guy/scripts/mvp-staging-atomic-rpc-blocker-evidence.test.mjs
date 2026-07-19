import assert from 'node:assert/strict'
import fs from 'node:fs'

const evidence = JSON.parse(fs.readFileSync('docs/audits/mvp-staging-atomic-rpc-blocker-2026-07-19.json', 'utf8'))

assert.equal(evidence.environment.supabaseHost, 'isdowlnollckzvltkasn.supabase.co')
assert.equal(evidence.blockingCheck.rpc, 'public.bridge_create_mvp_transaction(p_payload jsonb)')
assert.deepEqual(evidence.blockingCheck.request.body, { p_payload: {} })
assert.equal(evidence.blockingCheck.observed.httpStatus, 404)
assert.equal(evidence.blockingCheck.observed.code, 'PGRST202')
assert.equal(evidence.decision, 'do_not_expose')
assert.match(evidence.scope, /No transaction, notification, user, document, or database record was created, updated, or deleted/)

console.log('mvp-staging-atomic-rpc-blocker-evidence: passed')
