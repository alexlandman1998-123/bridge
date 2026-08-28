import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildTargetFlowPerformanceEvidence,
  verifyTargetFlowPerformanceEvidence,
} from '../src/services/observability/targetFlowPerformanceBudget.js'

const diagnosticsSource = await readFile(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
const verifierSource = await readFile(new URL('./verify-target-flow-performance-phase7.mjs', import.meta.url), 'utf8')

function routeSample(page, index = 0, overrides = {}) {
  return {
    route: page === 'listing_detail' ? '/agent/listings/:id' : page === 'lead_detail' ? '/pipeline/leads/:id' : `/${page}`,
    routeStartedAt: `2026-08-28T10:0${index}:00.000Z`,
    routeCompletedAt: `2026-08-28T10:0${index}:00.400Z`,
    firstUsefulContentMs: 400,
    requestCount: 1,
    duplicateRequestCount: 0,
    schemaErrorCount: 0,
    slowRequestCount: 0,
    metadata: { page, source: 'default', privateValue: 'must-not-export' },
    slowestRequests: [{ error: 'private database message' }],
    ...overrides,
  }
}

function completeHistory() {
  return ['transactions', 'listings', 'listing_detail', 'lead_detail']
    .flatMap((page) => Array.from({ length: 3 }, (_, index) => routeSample(page, index)))
}

test('Phase 7 exports a privacy-safe, complete evidence packet', () => {
  const evidence = buildTargetFlowPerformanceEvidence(completeHistory())
  assert.equal(evidence.gate.status, 'PASS')
  assert.equal(evidence.samples.length, 12)
  assert.doesNotMatch(JSON.stringify(evidence), /must-not-export|private database message/)
})

test('verification recomputes measurements and rejects a forged PASS verdict', () => {
  const evidence = buildTargetFlowPerformanceEvidence(completeHistory())
  const leadSample = evidence.samples.find((sample) => sample.metadata.page === 'lead_detail')
  leadSample.duplicateRequestCount = 1
  leadSample.targetBudget = { targeted: true, page: 'lead_detail', status: 'PASS', violations: [] }
  evidence.gate = { status: 'PASS', ready: true }

  const verification = verifyTargetFlowPerformanceEvidence(evidence)
  assert.equal(verification.status, 'FAIL')
  assert.equal(verification.ready, false)
  assert.deepEqual(verification.gate.failingFlows, ['lead_detail'])
})

test('invalid or incomplete evidence fails closed', () => {
  assert.equal(verifyTargetFlowPerformanceEvidence({}).status, 'INVALID_EVIDENCE')
  const incomplete = buildTargetFlowPerformanceEvidence([routeSample('listings')])
  assert.equal(verifyTargetFlowPerformanceEvidence(incomplete).status, 'INSUFFICIENT_DATA')
})

test('diagnostics observes existing route events and exports without a query', () => {
  assert.match(diagnosticsSource, /window\.addEventListener\('arch9:route-performance', refresh\)/)
  assert.match(diagnosticsSource, /buildTargetFlowPerformanceEvidence\(history\)/)
  assert.match(diagnosticsSource, /Export evidence/)
  const componentStart = diagnosticsSource.indexOf('function TargetFlowPerformanceDiagnostics')
  const componentEnd = diagnosticsSource.indexOf('function SellerPortalInviteBackfillResult', componentStart)
  const componentSource = diagnosticsSource.slice(componentStart, componentEnd)
  assert.doesNotMatch(componentSource, /supabase|fetch\(|setInterval|setTimeout/)
})

test('CLI verifier reads one local artifact and never connects to production', () => {
  assert.match(verifierSource, /--input=/)
  assert.match(verifierSource, /verifyTargetFlowPerformanceEvidence\(evidence\)/)
  assert.doesNotMatch(verifierSource, /supabase|fetch\(|SERVICE_ROLE|setInterval|setTimeout/)
})
