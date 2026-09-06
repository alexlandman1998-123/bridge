// These are the workflows that must retain their public contract while the
// monolithic API is split. Add a focused behavioural test before moving one.
export const API_SPLIT_CRITICAL_CONTRACTS = Object.freeze([
  { name: 'createTransactionFromWizard', domain: 'transactions', tests: ['scripts/canonical-transaction-requirements-on-creation.test.mjs', 'scripts/transaction-propagation-smoke.mjs'] },
  { name: 'saveTransaction', domain: 'transactions', tests: ['scripts/phase4-transaction-lead-detail-performance.test.mjs'] },
  { name: 'fetchTransactionById', domain: 'transactions', tests: ['scripts/phase4-transaction-lead-detail-performance.test.mjs'] },
  { name: 'runWorkflowAction', domain: 'transactions', tests: ['scripts/transaction-shared-progress-phase2.test.mjs'] },
  { name: 'updateTransactionSubprocessStep', domain: 'transactions', tests: ['scripts/transaction-subprocess-creation-rls-repair.test.mjs'] },
  { name: 'fetchUnitDetail', domain: 'developments', tests: ['scripts/phase4-transaction-lead-detail-performance.test.mjs'] },
  { name: 'uploadDocument', domain: 'documents', tests: ['scripts/document-request-phase9-upload-linking.test.mjs'] },
  { name: 'submitClientOnboarding', domain: 'onboarding', tests: ['scripts/buyer-onboarding-token-rls-continuity.test.mjs'] },
  { name: 'fetchClientPortalByToken', domain: 'clientPortal', tests: ['scripts/private-property-buyer-portal.test.mjs'] },
  { name: 'fetchClientOtpSigningByToken', domain: 'clientPortal', tests: ['scripts/residential-offer-otp-readiness-phase1d.test.mjs'] },
  { name: 'submitClientOtpSignature', domain: 'clientPortal', tests: ['scripts/residential-offer-otp-readiness-phase1d.test.mjs'] },
  { name: 'saveTransactionRoleplayerSelections', domain: 'stakeholders', tests: ['scripts/transaction-propagation-smoke.mjs'] },
  { name: 'fetchTransactionsListSummary', domain: 'reporting', tests: ['src/lib/__tests__/transactionsListApi.test.js'] },
  { name: 'fetchBondApplicationPortalProjection', domain: 'bond', tests: ['scripts/bond-application-portal-phase3-editing.test.mjs'] },
])

// Update only as part of an intentional public API contract change—not during
// a move-only extraction. The fingerprint is the sorted export-name list.
export const API_SPLIT_EXPORT_SURFACE_BASELINE = Object.freeze({
  exportCount: 380,
  sha256: '05a290e6fda7af5bffce186db453d142a371d1c7e637ae7c2a8df542cdf58348',
})
