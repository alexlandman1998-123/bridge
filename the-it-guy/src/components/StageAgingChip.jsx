import { getStageAgingMeta } from '../lib/sla'

function StageAgingChip({ stage, updatedAt, className = '' }) {
  const aging = getStageAgingMeta(stage, updatedAt)
  return <span className={`sla-chip ${aging.tone} ${className}`.trim()}>{aging.label}</span>
}

export default StageAgingChip
