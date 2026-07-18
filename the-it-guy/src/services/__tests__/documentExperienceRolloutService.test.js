import test from 'node:test'
import assert from 'node:assert/strict'
import { digestDocumentExperienceCohort, recordDocumentExperienceRolloutDecision } from '../documentExperienceRolloutService.js'

test('creates a stable cohort digest without exposing organisation ids', async () => {
  const first = await digestDocumentExperienceCohort({ environment: 'production', organisationIds: ['org-b', 'org-a', 'org-a'] })
  const second = await digestDocumentExperienceCohort({ environment: 'production', organisationIds: ['org-a', 'org-b'] })
  assert.equal(first, second)
  assert.match(first, /^sha256:[a-f0-9]{64}$/)
  assert.doesNotMatch(first, /org-a|org-b/)
})

test('records a digest-bound receipt without participant data', async () => {
  let payload = null
  const control = { contract: 'arch9-document-experience-rollout-control-v1', stage: 'pilot', revision: 1, cohortDigest: `sha256:${'a'.repeat(64)}`, evidenceDigest: `sha256:${'b'.repeat(64)}`, maxParticipants: 5, startedAt: '2026-07-18T08:00:00Z', observationEndsAt: '2026-07-19T08:00:00Z', expiresAt: '2026-07-20T08:00:00Z', operatorRef: 'private-operator' }
  const result = await recordDocumentExperienceRolloutDecision({ control, assessment: { decision: 'CONTINUE_STAGE', status: 'ROLLOUT_STAGE_ACTIVE', blockers: [] }, userId: 'user-id', transport: async (next) => { payload = next; return { persisted: true } } })
  assert.equal(result.persisted, true)
  assert.match(result.receipt.receiptDigest, /^sha256:[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(payload.metadata), /private-operator|user-id|organisationIds/)
  assert.equal(payload.route, '/document-experience/rollout')
})
