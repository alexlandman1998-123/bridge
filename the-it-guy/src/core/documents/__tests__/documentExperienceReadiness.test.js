import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentExperienceReadiness, DOCUMENT_EXPERIENCE_N1_SCENARIOS } from '../documentExperienceReadiness.js'

test('certifies the complete cross-role mandate and OTP matrix', () => {
  const result = buildDocumentExperienceReadiness()
  assert.equal(result.status, 'READY_FOR_N2')
  assert.equal(result.ready, true)
  assert.equal(result.mutatedData, false)
  assert.equal(result.coverage.scenarioCount, 8)
  assert.deepEqual(result.coverage.packetTypes.sort(), ['mandate', 'otp'])
})

test('covers principal, agent, attorney, seller and buyer audiences', () => {
  const result = buildDocumentExperienceReadiness()
  assert.deepEqual(result.coverage.audiences.sort(), ['agent', 'attorney', 'buyer', 'principal', 'seller'])
})

test('returns a workable blocker and solution for a broken role mapping', () => {
  const scenarios = DOCUMENT_EXPERIENCE_N1_SCENARIOS.map((row) => row.id === 'seller-mandate-signing' ? { ...row, expectedAudience: 'buyer' } : row)
  const result = buildDocumentExperienceReadiness({ scenarios })
  const issue = result.blockers.find((row) => row.code === 'N1_ROLE_RESOLUTION_MISMATCH')
  assert.equal(result.status, 'EXPERIENCE_BLOCKED')
  assert.match(issue.solution, /role mapping/i)
})

test('blocks incomplete role and document coverage', () => {
  const result = buildDocumentExperienceReadiness({ scenarios: [DOCUMENT_EXPERIENCE_N1_SCENARIOS[0]] })
  assert.ok(result.blockers.some((row) => row.code === 'N1_AUDIENCE_COVERAGE_MISSING'))
  assert.ok(result.blockers.some((row) => row.code === 'N1_DOCUMENT_COVERAGE_MISSING'))
  assert.ok(result.blockers.every((row) => row.solution))
})

test('never carries public tokens or raw links into readiness evidence', () => {
  const scenarios = DOCUMENT_EXPERIENCE_N1_SCENARIOS.map((row, index) => index ? row : { ...row, signing_token: 'secret', portalLink: 'https://example.test/secret' })
  const result = buildDocumentExperienceReadiness({ scenarios })
  assert.doesNotMatch(JSON.stringify(result), /secret|example\.test|signing_token|portalLink/)
})
