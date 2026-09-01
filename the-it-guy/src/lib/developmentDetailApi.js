let apiPromise = null
const call = async (method, ...args) => {
  apiPromise ||= import('./api')
  const api = await apiPromise
  return api[method](...args)
}

const METHODS = [
  'deleteDevelopment', 'deleteDevelopmentDocument', 'fetchDevelopmentDetail',
  'fetchDevelopmentDocumentRequirements', 'saveDevelopmentDetails', 'saveDevelopmentDocument',
  'saveDevelopmentFinancials', 'saveDevelopmentProductCatalogue', 'saveDevelopmentStructureNodes', 'saveDevelopmentUnit', 'uploadDevelopmentDocumentAsset',
  'updateDevelopmentTransactionSalesPrice', 'updateTransactionLifecycleStage', 'updateDevelopmentSettings',
  'upsertTransactionHandover',
]
const operations = Object.fromEntries(METHODS.map((method) => [method, (...args) => call(method, ...args)]))
export const {
  deleteDevelopment, deleteDevelopmentDocument, fetchDevelopmentDetail,
  fetchDevelopmentDocumentRequirements, saveDevelopmentDetails, saveDevelopmentDocument,
  saveDevelopmentFinancials, saveDevelopmentProductCatalogue, saveDevelopmentStructureNodes, saveDevelopmentUnit, uploadDevelopmentDocumentAsset,
  updateDevelopmentTransactionSalesPrice, updateTransactionLifecycleStage, updateDevelopmentSettings,
  upsertTransactionHandover,
} = operations
