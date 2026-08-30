import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTargetFlowPerformanceEvidence, verifyTargetFlowPerformanceEvidence } from '../src/services/observability/targetFlowPerformanceBudget.js'

const root = resolve(import.meta.dirname, '..')
const diagnostics = readFileSync(resolve(root, 'src/pages/PlatformDiagnosticsPage.jsx'), 'utf8')
const verifier = readFileSync(resolve(root, 'scripts/verify-target-flow-performance-phase7.mjs'), 'utf8')
const flows = ['transactions', 'listings', 'listing_detail', 'lead_detail']
const history = flows.flatMap((page) => Array.from({ length: 3 }, () => ({
  route: page === 'lead_detail' ? '/pipeline/leads/:id' : page === 'listing_detail' ? '/agent/listings/:id' : `/${page}`,
  firstUsefulContentMs: 400, requestCount: 1, duplicateRequestCount: 0, schemaErrorCount: 0, slowRequestCount: 0,
  metadata: { page, source: 'default', privateValue: 'must-not-export' }, slowestRequests: [{ error: 'private database message' }],
})))
const evidence = buildTargetFlowPerformanceEvidence(history)
assert.equal(evidence.gate.status, 'PASS')
assert.doesNotMatch(JSON.stringify(evidence), /must-not-export|private database message/)
assert.equal(verifyTargetFlowPerformanceEvidence(evidence).status, 'PASS')
evidence.samples[0].duplicateRequestCount = 1
assert.equal(verifyTargetFlowPerformanceEvidence(evidence).status, 'FAIL')
assert.match(diagnostics, /window\.addEventListener\('arch9:route-performance', refresh\)/)
assert.match(diagnostics, /Export evidence/)
assert.match(verifier, /--input=/)
assert.doesNotMatch(verifier, /supabase|fetch\(|SERVICE_ROLE|setInterval|setTimeout/)
console.log('target-flow operations phase 7 checks passed')
