import { useNavigate } from 'react-router-dom'
import AgentNewDealWizard from '../components/AgentNewDealWizard'
import NewTransactionWizard from '../components/NewTransactionWizard'
import { resolveTransactionWorkspaceRoute } from '../core/transactions/transactionWorkspaceRouting'
import { useWorkspace } from '../context/WorkspaceContext'

function NewTransactionPage() {
  const navigate = useNavigate()
  const { workspace, role } = useWorkspace()

  const sharedProps = {
    open: true,
    initialDevelopmentId: workspace.id === 'all' ? '' : workspace.id,
    onClose: () => navigate(role === 'attorney' ? '/transactions' : role === 'agent' ? '/transactions' : '/units'),
    onSaved: (result) => {
      if (result?.transactionId) {
        if (role === 'agent') {
          const searchValue = result.transactionReference || result.reference || result.transactionId
          const query = searchValue ? `?search=${encodeURIComponent(searchValue)}` : ''
          navigate(`/transactions${query}`)
          return
        }

        const route = resolveTransactionWorkspaceRoute({
          transactionId: result.transactionId,
          unitId: result.unitId,
          unitNumber: result.unitNumber,
          transactionReference: result.transactionReference || result.reference,
        })
        navigate(route.path, route.state ? { state: route.state } : undefined)
        return
      }

      if (result?.unitId) {
        const route = resolveTransactionWorkspaceRoute({
          unitId: result.unitId,
          unitNumber: result.unitNumber,
        })
        navigate(route.path, route.state ? { state: route.state } : undefined)
      }
    },
  }

  if (role === 'agent') {
    return <AgentNewDealWizard {...sharedProps} />
  }

  return <NewTransactionWizard {...sharedProps} />
}

export default NewTransactionPage
