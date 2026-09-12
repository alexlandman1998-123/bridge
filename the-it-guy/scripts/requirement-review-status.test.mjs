import assert from 'node:assert/strict'
import { resolveRequirementReviewStatus as resolve } from '../src/services/documents/requirementReviewStatus.js'
import { buildMatterDocumentWorkspaceModel } from '../src/services/documents/matterDocumentWorkspaceModel.js'
assert.equal(resolve({ status: 'uploaded' }, { review_status: 'approved' }), 'approved')
assert.equal(resolve({ status: 'uploaded' }, { review_status: 'rejected' }), 'rejected')
assert.equal(resolve({ status: 'accepted' }, { status: 'uploaded' }), 'uploaded')
assert.equal(resolve({ status: 'missing' }), 'missing')
assert.equal(resolve({ status: 'not_required' }, { status: 'uploaded' }), 'not_required')
assert.equal(resolve({ canonicalRequirementInstanceId: 'canonical', status: 'rejected' }, { review_status: 'approved' }), 'rejected')
for (const [reviewStatus, expected] of [['approved', 'verified'], ['rejected', 'rejected'], ['uploaded', 'uploaded']]) {
  const file = { id: 'file', file_path: 'transaction-test/sample.png', review_status: reviewStatus }
  const model = buildMatterDocumentWorkspaceModel({
    documents: [file],
    requiredDocumentChecklist: [{ key: 'signed_otp', label: 'OTP', status: 'uploaded', matchedDocument: file }],
  })
  assert.equal(model.requiredRows[0].status, expected)
  assert.equal(model.healthSummary.approvedCount, reviewStatus === 'approved' ? 1 : 0)
}
console.log('Requirement review status regression tests passed')
