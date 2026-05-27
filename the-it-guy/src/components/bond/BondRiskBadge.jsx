import BondStatusBadge from './BondStatusBadge'

export default function BondRiskBadge({
  label = 'Healthy',
  status = 'healthy',
  overdueDays = 0,
  className = '',
}) {
  let tone = 'emerald'
  if (status === 'overdue' || overdueDays > 0) tone = 'rose'
  else if (status === 'watch') tone = 'amber'
  else if (status === 'flagged') tone = 'indigo'
  else if (status === 'healthy') tone = 'emerald'

  return <BondStatusBadge label={label} tone={tone} className={className} />
}
