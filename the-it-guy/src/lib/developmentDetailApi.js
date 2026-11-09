export { invalidateDevelopmentOptionsCache } from '../domains/developments/selectionReadApi.js'
export { invalidateTransactionWorkspaceCoreCache } from '../domains/transactions/readCache.js'
// Reads are direct; extracted workflows load their feature module on demand.
export { fetchDeveloperPartnersWorkspace, fetchDevelopmentDetail, fetchDevelopmentMarketingAccess, fetchDevelopmentMarketingInvite, fetchDevelopmentMarketingActivity, fetchDevelopmentMarketingEvents, fetchDevelopmentVisualAnalytics, fetchDevelopmentDocumentRequirements } from '../domains/developments/api.js'
const workflowLoaders = {
  createDevelopmentWorkspace: () => import('../domains/developments/creationWorkflow.js'),
  createDevelopment: () => import('../domains/developments/detailActions.js'),
  saveDevelopmentAttorneyConfig: () => import('../domains/developments/configurationActions.js'),
  saveDevelopmentBondConfig: () => import('../domains/developments/configurationActions.js'),
  createUnit: () => import('../domains/developments/stockActions.js'),
  createDevelopmentDocumentRequirement: () => import('../domains/developments/documentActions.js'),
  deleteDevelopmentDocumentRequirement: () => import('../domains/developments/documentActions.js'),
  sendDeveloperPartnerInvitation: () => import('../domains/partners/invitationActions.js'),
  deleteDevelopment: () => import('../domains/developments/transactionActions.js'),
  deleteDevelopmentDocument: () => import('../domains/developments/documentActions.js'),
  createDevelopmentMarketingAccess: () => import('../domains/developments/marketingActions.js'),
  sendDevelopmentMarketingAccessInvite: () => import('../domains/developments/marketingActions.js'),
  acceptDevelopmentMarketingInvite: () => import('../domains/developments/marketingActions.js'),
  createDevelopmentMarketingEvent: () => import('../domains/developments/marketingActions.js'),
  saveDevelopmentDetails: () => import('../domains/developments/detailActions.js'),
  saveDevelopmentDocument: () => import('../domains/developments/documentActions.js'),
  saveDevelopmentFinancials: () => import('../domains/developments/financialActions.js'),
  saveDevelopmentProductCatalogue: () => import('../domains/developments/stockActions.js'),
  saveDevelopmentStructureNodes: () => import('../domains/developments/stockActions.js'),
  saveDevelopmentUnit: () => import('../domains/developments/stockActions.js'),
  uploadDevelopmentDocumentAsset: () => import('../domains/developments/documentActions.js'),
  applyDevelopmentConfigurationDefaults: () => import('../domains/developments/transactionActions.js'),
  createDevelopmentTransactionFromUnitStatus: () => import('../domains/developments/transactionActions.js'),
  updateDevelopmentTransactionSalesPrice: () => import('../domains/developments/transactionActions.js'),
  updateTransactionLifecycleStage: () => import('../domains/transactions/lifecycleActions.js'),
  updateDevelopmentSettings: () => import('../domains/developments/configurationActions.js'),
  createDeveloperPartnerInvite: () => import('../domains/partners/invitationActions.js'),
  upsertTransactionHandover: () => import('../domains/clientPortal/residentApi.js'),
}

async function call(method, ...args) {
  const api = await workflowLoaders[method]()
  return api[method](...args)
}

const METHODS = [
  'createDevelopmentWorkspace', 'createDevelopment', 'saveDevelopmentAttorneyConfig', 'saveDevelopmentBondConfig', 'createUnit', 'createDevelopmentDocumentRequirement', 'deleteDevelopmentDocumentRequirement', 'sendDeveloperPartnerInvitation',
  'deleteDevelopment', 'deleteDevelopmentDocument', 'createDevelopmentMarketingAccess', 'sendDevelopmentMarketingAccessInvite', 'acceptDevelopmentMarketingInvite', 'createDevelopmentMarketingEvent',
  'saveDevelopmentDetails', 'saveDevelopmentDocument',
  'saveDevelopmentFinancials', 'saveDevelopmentProductCatalogue', 'saveDevelopmentStructureNodes', 'saveDevelopmentUnit', 'uploadDevelopmentDocumentAsset',
  'applyDevelopmentConfigurationDefaults', 'createDevelopmentTransactionFromUnitStatus', 'updateDevelopmentTransactionSalesPrice', 'updateTransactionLifecycleStage', 'updateDevelopmentSettings',
  'createDeveloperPartnerInvite',
  'upsertTransactionHandover',
]
const operations = Object.fromEntries(METHODS.map((method) => [method, (...args) => call(method, ...args)]))
export const {
  createDevelopmentWorkspace, createDevelopment, saveDevelopmentAttorneyConfig, saveDevelopmentBondConfig, createUnit, createDevelopmentDocumentRequirement, deleteDevelopmentDocumentRequirement, sendDeveloperPartnerInvitation,
  deleteDevelopment, deleteDevelopmentDocument, createDevelopmentMarketingAccess, sendDevelopmentMarketingAccessInvite, acceptDevelopmentMarketingInvite, createDevelopmentMarketingEvent,
  saveDevelopmentDetails, saveDevelopmentDocument,
  saveDevelopmentFinancials, saveDevelopmentProductCatalogue, saveDevelopmentStructureNodes, saveDevelopmentUnit, uploadDevelopmentDocumentAsset,
  applyDevelopmentConfigurationDefaults, createDevelopmentTransactionFromUnitStatus, updateDevelopmentTransactionSalesPrice, updateTransactionLifecycleStage, updateDevelopmentSettings,
  createDeveloperPartnerInvite,
  upsertTransactionHandover,
} = operations
