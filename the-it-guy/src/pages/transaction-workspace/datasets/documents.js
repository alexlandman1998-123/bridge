import { fetchTransactionDocumentsWorkspace } from '../../../lib/transactionWorkspaceApi'

export function load(transactionId, options) {
  return fetchTransactionDocumentsWorkspace(transactionId, options)
}
