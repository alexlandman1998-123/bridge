import assert from 'node:assert/strict'
import { evaluateTargetFlowPromotionReadiness } from '../src/services/observability/targetFlowPerformanceRelease.js'
import { buildTargetFlowPerformanceEvidence } from '../src/services/observability/targetFlowPerformanceBudget.js'

const now = Date.parse('2026-08-30T12:00:00.000Z')
const flows = ['transactions', 'listings', 'listing_detail', 'lead_detail']
const history = flows.flatMap((page) => Array.from({ length: 3 }, () => ({
  route: page === 'lead_detail' ? '/pipeline/leads/:id' : page === 'listing_detail' ? '/agent/listings/:id' : `/${page}`,
  firstUsefulContentMs: 400, requestCount: 1, duplicateRequestCount: 0, schemaErrorCount: 0, slowRequestCount: 0, metadata: { page },
})))
const evidence = { ...buildTargetFlowPerformanceEvidence(history), generatedAt: new Date(now).toISOString(), previewUrl: 'https://preview.example.test' }
assert.equal(evaluateTargetFlowPromotionReadiness(evidence, { now, expectedPreviewUrl: evidence.previewUrl, observedPreviewUrl: evidence.previewUrl }).status, 'READY_FOR_MANUAL_PROMOTION')
assert.equal(evaluateTargetFlowPromotionReadiness(evidence, { now: now + 25 * 3_600_000, expectedPreviewUrl: evidence.previewUrl, observedPreviewUrl: evidence.previewUrl }).status, 'BLOCKED')
assert.equal(evaluateTargetFlowPromotionReadiness(evidence, { now, expectedPreviewUrl: evidence.previewUrl, observedPreviewUrl: 'https://other.example.test' }).status, 'BLOCKED')
console.log('target-flow promotion phase 8 checks passed')
