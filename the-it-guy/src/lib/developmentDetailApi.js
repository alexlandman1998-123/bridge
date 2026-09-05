let apiPromise = null
const call = async (method, ...args) => {
  apiPromise ||= import('./api')
  const api = await apiPromise
  return api[method](...args)
}

const METHODS = [
  'deleteDevelopment', 'deleteDevelopmentDocument', 'fetchDevelopmentDetail',
  'fetchDevelopmentMarketingAccess', 'createDevelopmentMarketingAccess', 'sendDevelopmentMarketingAccessInvite', 'fetchDevelopmentMarketingInvite', 'acceptDevelopmentMarketingInvite', 'fetchDevelopmentMarketingActivity', 'fetchDevelopmentMarketingEvents', 'createDevelopmentMarketingEvent',
  'fetchDevelopmentVisualAnalytics',
  'fetchDevelopmentDocumentRequirements', 'saveDevelopmentDetails', 'saveDevelopmentDocument',
  'saveDevelopmentFinancials', 'saveDevelopmentProductCatalogue', 'saveDevelopmentStructureNodes', 'saveDevelopmentUnit', 'uploadDevelopmentDocumentAsset',
  'applyDevelopmentConfigurationDefaults', 'createDevelopmentTransactionFromUnitStatus', 'updateDevelopmentTransactionSalesPrice', 'updateTransactionLifecycleStage', 'updateDevelopmentSettings',
  'fetchDeveloperPartnersWorkspace', 'createDeveloperPartnerInvite',
  'upsertTransactionHandover',
]
const operations = Object.fromEntries(METHODS.map((method) => [method, (...args) => call(method, ...args)]))
export const {
  deleteDevelopment, deleteDevelopmentDocument, fetchDevelopmentDetail,
  fetchDevelopmentMarketingAccess, createDevelopmentMarketingAccess, sendDevelopmentMarketingAccessInvite, fetchDevelopmentMarketingInvite, acceptDevelopmentMarketingInvite, fetchDevelopmentMarketingActivity, fetchDevelopmentMarketingEvents, createDevelopmentMarketingEvent,
  fetchDevelopmentVisualAnalytics,
  fetchDevelopmentDocumentRequirements, saveDevelopmentDetails, saveDevelopmentDocument,
  saveDevelopmentFinancials, saveDevelopmentProductCatalogue, saveDevelopmentStructureNodes, saveDevelopmentUnit, uploadDevelopmentDocumentAsset,
  applyDevelopmentConfigurationDefaults, createDevelopmentTransactionFromUnitStatus, updateDevelopmentTransactionSalesPrice, updateTransactionLifecycleStage, updateDevelopmentSettings,
  fetchDeveloperPartnersWorkspace, createDeveloperPartnerInvite,
  upsertTransactionHandover,
} = operations
