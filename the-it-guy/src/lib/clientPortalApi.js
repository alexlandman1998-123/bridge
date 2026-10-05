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

export const fetchBuyerBondApplicationRuntime = (...args) => call('fetchBuyerBondApplicationRuntime', ...args)
export const saveBuyerBondApplicationRuntimeDraft = (...args) => call('saveBuyerBondApplicationRuntimeDraft', ...args)
export const reconcileBuyerBondApplicationRuntimeDocuments = (...args) => call('reconcileBuyerBondApplicationRuntimeDocuments', ...args)
export const uploadBuyerBondApplicationRuntimeDocument = (...args) => call('uploadBuyerBondApplicationRuntimeDocument', ...args)
export const submitBuyerBondApplicationRuntime = (...args) => call('submitBuyerBondApplicationRuntime', ...args)
export const refreshBuyerBondApplicationRuntimeSubmission = (...args) => call('refreshBuyerBondApplicationRuntimeSubmission', ...args)
export const cancelBuyerBondApplicationRuntimeSubmission = (...args) => call('cancelBuyerBondApplicationRuntimeSubmission', ...args)
export const fetchBuyerBondWetInkSigning = (...args) => call('fetchBuyerBondWetInkSigning', ...args)
export const prepareBuyerBondWetInkSigning = (...args) => call('prepareBuyerBondWetInkSigning', ...args)
export const uploadBuyerBondWetInkSignedCopy = (...args) => call('uploadBuyerBondWetInkSignedCopy', ...args)
export const cancelBuyerBondWetInkSigning = (...args) => call('cancelBuyerBondWetInkSigning', ...args)
export const renderBuyerBondWetInkSigningPdf = (...args) => call('renderBuyerBondWetInkSigningPdf', ...args)
export const readBuyerBondWetInkOriginal = (...args) => call('readBuyerBondWetInkOriginal', ...args)
