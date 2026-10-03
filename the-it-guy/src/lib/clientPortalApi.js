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
  'resolveClientPortalQuotePdf',
  'fetchClientPortalOriginatorFinanceByToken',
  'cancelClientPortalBondApplicationSubmission',
  'createClientPortalDocumentSignedUrl',
  'fetchClientPortalAttorneyLaneUpdatesByToken',
  'fetchClientPortalBankApplicationsByToken',
  'fetchSellerTransferJourneyUpdatesByToken',
  'fetchClientPortalBondApplicationSubmission',
  'fetchClientPortalNormalizedBondApplication',
  'fetchBondApplicationPortalProjection',
  'fetchBondApplicationPortalDraft',
  'fetchBondApplicationPortalDocumentContinuity',
  'fetchBondApplicationBuyerNotices',
  'fetchClientPortalByToken',
  'fetchClientPortalCanonicalDocumentProjection',
  'fetchTransactionCanonicalDocumentProjection',
  'fetchClientPortalContextsByToken',
  'fetchClientPortalCoreByToken',
  'fetchClientPortalJourneySnapshotByToken',
  'fetchClientPortalMandatePacketSummaryByToken',
  'fetchClientPortalMatterFinancialAccounts',
  'inviteClientPortalBondApplicationCoApplicant',
  'reconcileClientPortalBondDocumentRequirements',
  'resolveClientPortalFinalSignedDocumentAccess',
  'respondToClientPortalAppointment',
  'saveClientPortalOnboardingDraft',
  'saveBondApplicationPortalDraft',
  'submitAlterationRequest',
  'submitClientIssue',
  'submitClientPortalComment',
  'submitClientPortalBondApplicationHtmlSignature',
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
  fetchSellerTransferJourneyUpdatesByToken,
  fetchClientPortalBondApplicationSubmission,
  fetchClientPortalNormalizedBondApplication,
  fetchBondApplicationPortalProjection,
  fetchBondApplicationPortalDraft,
  fetchBondApplicationPortalDocumentContinuity,
  fetchBondApplicationBuyerNotices,
  fetchClientPortalByToken,
  fetchClientPortalCanonicalDocumentProjection,
  fetchTransactionCanonicalDocumentProjection,
  fetchClientPortalContextsByToken,
  fetchClientPortalCoreByToken,
  fetchClientPortalJourneySnapshotByToken,
  fetchClientPortalMandatePacketSummaryByToken,
  fetchClientPortalMatterFinancialAccounts,
  inviteClientPortalBondApplicationCoApplicant,
  reconcileClientPortalBondDocumentRequirements,
  resolveClientPortalFinalSignedDocumentAccess,
  respondToClientPortalAppointment,
  saveClientPortalOnboardingDraft,
  saveBondApplicationPortalDraft,
  submitAlterationRequest,
  submitClientIssue,
  submitClientPortalComment,
  submitClientPortalBondApplicationHtmlSignature,
  submitClientSellerInterestRequest,
  submitServiceReview,
  uploadClientPortalDocument,
  uploadClientPortalMatterFinancialProof,
  uploadClientPortalMatterFinancialRequestDocument,
} = operations

export const fetchClientPortalBankApplicationsByToken = (...args) => call('fetchClientPortalBankApplicationsByToken', ...args)
export const fetchClientPortalOriginatorFinanceByToken = (...args) => call('fetchClientPortalOriginatorFinanceByToken', ...args)
export const resolveClientPortalQuotePdf = (...args) => call('resolveClientPortalQuotePdf', ...args)
