import { useNavigate } from 'react-router-dom'
import AgentNewDealWizard from '../components/AgentNewDealWizard'
import NewTransactionWizard from '../components/NewTransactionWizard'
import { useWorkspace } from '../context/WorkspaceContext'

function NewTransactionPage() {
  const navigate = useNavigate()
  const { workspace, role } = useWorkspace()

  const sharedProps = {
    open: true,
    initialDevelopmentId: workspace.id === 'all' ? '' : workspace.id,
    onClose: () => navigate(role === 'attorney' ? '/transactions' : role === 'agent' ? '/deals' : '/units'),
    onSaved: (result) => {
      if (result?.unitId) {
        navigate(`/units/${result.unitId}`, {
          state: { headerTitle: `Unit ${result.unitNumber}` },
        })
        return
      }

      if (result?.transactionId) {
        if (role === 'agent') {
          const searchValue = result.transactionReference || result.reference || result.transactionId
          const query = searchValue ? `?search=${encodeURIComponent(searchValue)}` : ''
          navigate(`/deals${query}`)
          return
        }

        navigate(`/transactions/${result.transactionId}`)
      }
    },
  }

  return role === 'agent' ? <AgentNewDealWizard {...sharedProps} /> : <NewTransactionWizard {...sharedProps} />
}

export default NewTransactionPage
