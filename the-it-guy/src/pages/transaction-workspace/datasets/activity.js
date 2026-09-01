import { fetchTransactionActivityWorkspace } from '../../../lib/transactionWorkspaceApi'

export function load(transactionId, options) {
  return fetchTransactionActivityWorkspace(transactionId, options)
}
