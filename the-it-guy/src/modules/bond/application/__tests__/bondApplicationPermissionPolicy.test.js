import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assessBondPermissionReviewPolicy, createBondPermissionReviewPolicy, getBondPermissionReviewContent } from '../submission/bondApplicationPermissionPolicy.js'
import { BOND_APPLICATION_DECLARATIONS } from '../submission/bondApplicationDeclarations.js'

const asOf = '2026-10-03T18:00:00Z'
const evidence = (version) => ({ status: 'approved', policyVersion: version, approvedBy: 'Fixture reviewer', approvedAt: '2026-10-03T12:00:00Z', reference: 'Fixture written approval' })
function completedPolicy() {
  const policy = createBondPermissionReviewPolicy()
  policy.status = 'approved'
  policy.originator = { id: 'fixture-originator', legalName: 'Fixture Originator', privacyContact: 'Fixture Information Officer' }
  for (const role of Object.keys(policy.approvals)) policy.approvals[role] = evidence(policy.version)
  for (const field of Object.keys(policy.privacy)) if (typeof policy.privacy[field] === 'string') policy.privacy[field] = 'Fixture decision reference'
  for (const category of Object.values(policy.privacy.retention)) for (const field of Object.keys(category)) category[field] = 'Fixture reviewed rule'
  policy.privacy.statementHandoff.provider = 'Fixture secure service'
  policy.privacy.statementHandoff.receiptEvidence = 'Fixture verified callback specification'
  for (const method of Object.values(policy.signingMethods)) for (const field of Object.keys(method)) method[field] = 'Fixture method specification'
  policy.banks = [{ id: 'fixture-bank', name: 'Fixture Bank', requiredForms: [], methods: { online: evidence(policy.version), download_sign_upload: evidence(policy.version) } }]
  recordReviewedContent(policy)
  return policy
}

function recordReviewedContent(policy) {
  const reviewedContent = getBondPermissionReviewContent(policy)
  for (const approval of Object.values(policy.approvals)) approval.reviewedContent = reviewedContent
  for (const bank of policy.banks) for (const decision of Object.values(bank.methods)) decision.reviewedContent = reviewedContent
}

test('default draft cannot be mistaken for approval of either method', () => {
  const report = assessBondPermissionReviewPolicy(undefined, { asOf })
  assert.equal(report.decisionsComplete, false)
  for (const method of Object.values(report.methods)) assert.equal(method.readyForImplementation, false)
  assert.ok(report.issues.some((issue) => issue.code === 'participating_banks_required'))
})

test('complete evidenced decisions allow planning each method without mutating policy', () => {
  const policy = completedPolicy()
  const before = JSON.stringify(policy)
  const report = assessBondPermissionReviewPolicy(policy, { asOf })
  assert.equal(report.decisionsComplete, true)
  assert.equal(report.methods.online.readyForImplementation, true)
  assert.equal(report.methods.download_sign_upload.readyForImplementation, true)
  assert.equal(JSON.stringify(policy), before)
})

test('a rejected online method does not imply rejection of wet-ink uploads', () => {
  const policy = completedPolicy()
  policy.banks[0].methods.online.status = 'rejected'
  const report = assessBondPermissionReviewPolicy(policy, { asOf })
  assert.equal(report.decisionsComplete, true)
  assert.equal(report.methods.online.readyForImplementation, false)
  assert.equal(report.methods.download_sign_upload.readyForImplementation, true)
})

test('every participating bank needs an evidenced decision; approval is not inherited', () => {
  const policy = completedPolicy()
  policy.banks.push({ id: 'other-bank', name: 'Other Bank', requiredForms: [] })
  const report = assessBondPermissionReviewPolicy(policy, { asOf })
  assert.equal(report.decisionsComplete, false)
  assert.equal(report.methods.online.readyForImplementation, false)
  assert.equal(report.methods.download_sign_upload.readyForImplementation, false)
})

test('boolean, stale and future approvals are rejected', () => {
  for (const invalid of [true, { ...evidence('old-version') }, { ...evidence(completedPolicy().version), approvedAt: '2027-01-01' }]) {
    const policy = completedPolicy()
    policy.approvals.legal = invalid
    assert.equal(assessBondPermissionReviewPolicy(policy, { asOf }).decisionsComplete, false)
  }
})

test('missing retention and shared-storage statements prevent readiness', () => {
  const policy = completedPolicy()
  policy.privacy.retention.supporting_documents.deletionProcess = ''
  policy.privacy.statementHandoff.arch9Retention = 'shared_files'
  const report = assessBondPermissionReviewPolicy(policy, { asOf })
  assert.ok(report.issues.some((issue) => issue.path === 'privacy.retention.supporting_documents.deletionProcess'))
  assert.ok(report.issues.some((issue) => issue.code === 'statement_retention_conflict'))
  assert.equal(report.methods.online.readyForImplementation, false)
})

test('marketing stays optional and drafts do not replace historical declaration wording', () => {
  const policy = completedPolicy()
  assert.equal(policy.clauses.find((clause) => clause.key === 'optional_marketing').required, false)
  policy.clauses.find((clause) => clause.key === 'optional_marketing').required = true
  assert.equal(assessBondPermissionReviewPolicy(policy, { asOf }).decisionsComplete, false)
  assert.equal(BOND_APPLICATION_DECLARATIONS.find((clause) => clause.key === 'marketing_privacy_preference').required, false)
  assert.equal(BOND_APPLICATION_DECLARATIONS.find((clause) => clause.key === 'loan_processing_consent').version, '2026-07')
  assert.equal(createBondPermissionReviewPolicy().clauses.find((clause) => clause.key === 'optional_marketing').required, false)
})

test('online method requires provider and verification details even after bank approval', () => {
  const policy = completedPolicy()
  policy.signingMethods.online.verificationMethod = ''
  recordReviewedContent(policy)
  const report = assessBondPermissionReviewPolicy(policy, { asOf })
  assert.equal(report.methods.online.readyForImplementation, false)
  assert.equal(report.methods.download_sign_upload.readyForImplementation, true)
})

test('editing permission text invalidates old approval even with the same version label', () => {
  const policy = completedPolicy()
  policy.clauses[0].text = 'Changed authority for additional recipients'
  const report = assessBondPermissionReviewPolicy(policy, { asOf })
  assert.equal(report.decisionsComplete, false)
  assert.equal(report.methods.online.readyForImplementation, false)
  assert.equal(report.methods.download_sign_upload.readyForImplementation, false)
})
