import { assessBondPermissionReviewPolicy, createBondPermissionReviewPolicy } from '../../../src/modules/bond/application/submission/bondApplicationPermissionPolicy.js'

// Trusted server configuration only. There is no browser override and no
// inference of approval from test fixtures or a completed consultant review.
export function getBondSubmissionReleaseGate() {
  const policy = assessBondPermissionReviewPolicy(createBondPermissionReviewPolicy())
  return {
    version: 'bond-signing-submission-release-2026-10-03-v1',
    ready: false,
    methods: { wet_ink_upload: policy.methods.download_sign_upload.readyForImplementation, online: false },
    blockers: [
      { code: 'permissions_approval_required', message: 'Bank, legal and privacy approval of permissions and signing methods is still pending.' },
      { code: 'statement_handoff_not_connected', message: 'The approved consultant bank-statement handoff service is not connected.' },
      { code: 'live_pilot_required', message: 'The live single-applicant and joint-applicant pilot has not been verified.' },
    ],
  }
}
