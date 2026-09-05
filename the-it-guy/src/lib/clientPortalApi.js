let portalApiPromise = null

export function preloadClientPortalApi() {
  portalApiPromise ||= import('./api')
  return portalApiPromise
}

async function call(method, ...args) {
  const api = await preloadClientPortalApi()
  return api[method](...args)
}

const METHODS = [
  'cancelClientPortalBondApplicationSubmission',
  'createClientPortalDocumentSignedUrl',
  'fetchClientPortalAttorneyLaneUpdatesByToken',
  'fetchClientPortalBondApplicationSubmission',
  'fetchClientPortalCanonicalDocumentProjection',
  'fetchClientPortalByToken',
  'fetchClientPortalContextsByToken',
  'fetchClientPortalCoreByToken',
  'fetchClientPortalJourneySnapshotByToken',
  'fetchClientPortalMandatePacketSummaryByToken',
  'fetchClientPortalMatterFinancialAccounts',
  'inviteClientPortalBondApplicationCoApplicant',
  'prepareClientPortalBondApplicationSubmission',
  'prepareClientPortalJointBondApplicationSubmission',
  'reconcileClientPortalBondDocumentRequirements',
  'resolveClientPortalFinalSignedDocumentAccess',
  'respondToClientPortalAppointment',
  'saveClientPortalOnboardingDraft',
  'submitAlterationRequest',
  'submitClientIssue',
  'submitClientPortalComment',
  'submitClientSellerInterestRequest',
  'submitServiceReview',
  'uploadClientPortalDocument',
  'uploadClientPortalMatterFinancialProof',
  'uploadClientPortalMatterFinancialRequestDocument',
]

const operations = Object.fromEntries(METHODS.map((method) => [method, (...args) => call(method, ...args)]))

export const {
  cancelClientPortalBondApplicationSubmission,
  createClientPortalDocumentSignedUrl,
  fetchClientPortalAttorneyLaneUpdatesByToken,
  fetchClientPortalBondApplicationSubmission,
  fetchClientPortalCanonicalDocumentProjection,
  fetchClientPortalByToken,
  fetchClientPortalContextsByToken,
  fetchClientPortalCoreByToken,
  fetchClientPortalJourneySnapshotByToken,
  fetchClientPortalMandatePacketSummaryByToken,
  fetchClientPortalMatterFinancialAccounts,
  inviteClientPortalBondApplicationCoApplicant,
  prepareClientPortalBondApplicationSubmission,
  prepareClientPortalJointBondApplicationSubmission,
  reconcileClientPortalBondDocumentRequirements,
  resolveClientPortalFinalSignedDocumentAccess,
  respondToClientPortalAppointment,
  saveClientPortalOnboardingDraft,
  submitAlterationRequest,
  submitClientIssue,
  submitClientPortalComment,
  submitClientSellerInterestRequest,
  submitServiceReview,
  uploadClientPortalDocument,
  uploadClientPortalMatterFinancialProof,
  uploadClientPortalMatterFinancialRequestDocument,
} = operations
