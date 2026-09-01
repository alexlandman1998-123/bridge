const DATASET_IMPORTERS = {
  activity: () => import('./datasets/activity'),
  documents: () => import('./datasets/documents'),
  finance: () => import('./datasets/finance'),
  partners: () => import('./datasets/partners'),
  workflow: () => import('./datasets/workflow'),
}

const datasetModulePromises = new Map()

export function getTransactionWorkspaceDatasetForTab(tabId = '') {
  if (tabId === 'documents') return 'documents'
  if (tabId === 'activity') return 'activity'
  if (tabId === 'finance' || tabId === 'application' || tabId === 'quotes_grant' || tabId === 'reconciliation') return 'finance'
  if (tabId === 'stakeholders' || tabId === 'parties') return 'partners'
  if (tabId === 'today' || tabId === 'tasks' || tabId === 'transfer') return 'workflow'
  return ''
}

export function preloadTransactionWorkspaceDataset(dataset = '') {
  const importer = DATASET_IMPORTERS[dataset]
  if (!importer) return Promise.resolve(null)
  if (!datasetModulePromises.has(dataset)) datasetModulePromises.set(dataset, importer())
  return datasetModulePromises.get(dataset)
}

export async function loadTransactionWorkspaceDataset(dataset, transactionId, options) {
  const module = await preloadTransactionWorkspaceDataset(dataset)
  if (!module?.load) throw new Error(`Unknown transaction workspace dataset: ${dataset}`)
  return module.load(transactionId, options)
}
