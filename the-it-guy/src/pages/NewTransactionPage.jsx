import { useNavigate } from 'react-router-dom'
import NewTransactionWizard from '../components/NewTransactionWizard'
import { useWorkspace } from '../context/WorkspaceContext'

function NewTransactionPage() {
  const navigate = useNavigate()
  const { workspace, role } = useWorkspace()

  return (
    <NewTransactionWizard
      open
      initialDevelopmentId={workspace.id === 'all' ? '' : workspace.id}
      onClose={() => navigate(role === 'attorney' ? '/transactions' : '/units')}
      onSaved={(result) => {
        if (result?.unitId) {
          navigate(`/units/${result.unitId}`, {
            state: { headerTitle: `Unit ${result.unitNumber}` },
          })
          return
        }

        if (result?.transactionId) {
          navigate(`/transactions/${result.transactionId}`)
        }
      }}
    />
  )
}

export default NewTransactionPage
