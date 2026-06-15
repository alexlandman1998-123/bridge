import { titleize } from '../commercialFormatters'
import { getStatusTone } from '../commercialPresentation'

function CommercialStatusPill({ value = 'active', label = '' }) {
  const status = String(value || 'active').trim().toLowerCase()

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusTone(status)}`}>
      {label || titleize(status)}
    </span>
  )
}

export default CommercialStatusPill
