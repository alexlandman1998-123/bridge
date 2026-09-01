import { fetchTransactionFinanceWorkspace } from '../../../lib/transactionWorkspaceApi'

export function load(transactionId, options) {
  return fetchTransactionFinanceWorkspace(transactionId, options)
}
