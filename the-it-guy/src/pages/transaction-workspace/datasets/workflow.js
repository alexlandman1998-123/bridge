import { fetchTransactionWorkflowWorkspace } from '../../../lib/transactionWorkspaceApi'

export function load(transactionId, options) {
  return fetchTransactionWorkflowWorkspace(transactionId, options)
}
