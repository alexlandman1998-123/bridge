import BondStatusBadge from './BondStatusBadge'

export default function BondTransactionStatusBadge({ status = 'active', label = 'Active' }) {
  return <BondStatusBadge status={status} label={label} />
}
