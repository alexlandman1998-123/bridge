import { getDocumentStatusLabel, getDocumentStatusTone, normalizeDocumentStatus } from '../../../lib/clientPortalDocumentStatus'

function ClientDocumentStatusBadge({ status = '' }) {
  const normalized = normalizeDocumentStatus(status)
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getDocumentStatusTone(normalized)}`}>
      {getDocumentStatusLabel(normalized)}
    </span>
  )
}

export default ClientDocumentStatusBadge

