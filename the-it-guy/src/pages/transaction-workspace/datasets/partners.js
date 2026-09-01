import { fetchTransactionPartnersWorkspace } from '../../../lib/transactionWorkspaceApi'

export function load(transactionId, options) {
  return fetchTransactionPartnersWorkspace(transactionId, options)
}
