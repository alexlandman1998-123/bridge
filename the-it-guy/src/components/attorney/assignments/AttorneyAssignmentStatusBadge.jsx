import { getAssignmentStatusLabel } from '../../../services/transactionAttorneyAssignments'

function AttorneyAssignmentStatusBadge({ status = '' }) {
  const normalized = String(status || '').toLowerCase()
  let color = '#4f5f79'
  if (normalized === 'active') color = '#067647'
  else if (normalized === 'pending' || normalized === 'paused') color = '#b54708'
  else if (normalized === 'removed') color = '#b42318'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: `1px solid ${color}44`,
        background: `${color}1A`,
        color,
        padding: '0.2rem 0.52rem',
        fontSize: '0.78rem',
        fontWeight: 600,
      }}
    >
      {getAssignmentStatusLabel(status)}
    </span>
  )
}

export default AttorneyAssignmentStatusBadge
