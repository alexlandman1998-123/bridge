const workflowLoaders = {
  resolveClientPortalQuotePdf: () => import('../domains/clientPortal/workspaceApi.js'),
  fetchClientPortalOriginatorFinanceByToken: () => import('../domains/clientPortal/originatorFinanceRead.js'),
  cancelClientPortalBondApplicationSubmission: () => import('../domains/bond/portalApi.js'),
  createClientPortalDocumentSignedUrl: () => import('../domains/clientPortal/documentApi.js'),
  fetchClientPortalAttorneyLaneUpdatesByToken: () => import('../domains/clientPortal/workspaceApi.js'),
  fetchClientPortalBankApplicationsByToken: () => import('../domains/clientPortal/workspaceApi.js'),
  fetchSellerTransferJourneyUpdatesByToken: () => import('../domains/transactions/detailApi.js'),
  fetchClientPortalBondApplicationSubmission: () => import('../domains/bond/portalApi.js'),
  fetchClientPortalNormalizedBondApplication: () => import('../domains/bond/portalApi.js'),
  fetchBondApplicationPortalProjection: () => import('../domains/bond/portalApi.js'),
  fetchBondApplicationPortalDraft: () => import('../domains/bond/portalApi.js'),
  fetchBondApplicationPortalDocumentContinuity: () => import('../domains/bond/portalApi.js'),
  fetchBondApplicationBuyerNotices: () => import('../domains/bond/portalApi.js'),
  fetchClientPortalByToken: () => import('../domains/clientPortal/workspaceApi.js'),
  fetchClientPortalCanonicalDocumentProjection: () => import('../domains/clientPortal/documentApi.js'),
  fetchTransactionCanonicalDocumentProjection: () => import('../domains/documents/projectionApi.js'),
  fetchClientPortalContextsByToken: () => import('../domains/clientPortal/workspaceApi.js'),
  fetchClientPortalCoreByToken: () => import('../domains/clientPortal/workspaceApi.js'),
  fetchClientPortalJourneySnapshotByToken: () => import('../domains/clientPortal/workspaceApi.js'),
  fetchClientPortalMandatePacketSummaryByToken: () => import('../domains/clientPortal/workspaceApi.js'),
  fetchClientPortalMatterFinancialAccounts: () => import('../domains/finance/accountsApi.js'),
  inviteClientPortalBondApplicationCoApplicant: () => import('../domains/bond/portalApi.js'),
  reconcileClientPortalBondDocumentRequirements: () => import('../domains/clientPortal/documentApi.js'),
  resolveClientPortalFinalSignedDocumentAccess: () => import('../domains/clientPortal/documentApi.js'),
  respondToClientPortalAppointment: () => import('../domains/clientPortal/workspaceApi.js'),
  saveClientPortalOnboardingDraft: () => import('../domains/clientPortal/workspaceApi.js'),
  saveBondApplicationPortalDraft: () => import('../domains/bond/portalApi.js'),
  submitAlterationRequest: () => import('../domains/clientPortal/residentApi.js'),
  submitClientIssue: () => import('../domains/clientPortal/residentApi.js'),
  submitClientPortalComment: () => import('../domains/clientPortal/workspaceApi.js'),
  submitClientPortalBondApplicationHtmlSignature: () => import('../domains/bond/portalApi.js'),
  submitClientSellerInterestRequest: () => import('../domains/clientPortal/workspaceApi.js'),
  submitServiceReview: () => import('../domains/clientPortal/residentApi.js'),
  uploadClientPortalDocument: () => import('../domains/clientPortal/documentApi.js'),
  uploadClientPortalMatterFinancialProof: () => import('../domains/finance/accountsApi.js'),
  uploadClientPortalMatterFinancialRequestDocument: () => import('../domains/finance/accountsApi.js'),
}

export function preloadClientPortalApi() {
  return workflowLoaders.fetchClientPortalCoreByToken()
}

async function call(method, ...args) {
  const api = await workflowLoaders[method]()
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
export const startBuyerBondApplicationRuntime = (...args) => call('startBuyerBondApplicationRuntime', ...args)
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

export const fetchBuyerBondTrackerContext = (...args) => call('fetchBuyerBondTrackerContext', ...args)
