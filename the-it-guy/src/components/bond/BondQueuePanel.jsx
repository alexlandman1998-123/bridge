import BondApplicationQueueItem from './BondApplicationQueueItem'

function normalizeText(value) {
  return String(value || '').trim()
}

const QUEUE_LABELS = Object.freeze({
  my_applications: 'My Applications',
  processing_queue: 'Processing Queue',
  missing_documents: 'Missing Documents',
  bank_feedback: 'Bank Feedback',
  submission_readiness: 'Submission Readiness',
  overdue_applications: 'Overdue Applications',
  compliance_review: 'Compliance Review',
  manager_escalations: 'Manager Escalations',
})

export default function BondQueuePanel({
  queueKey = '',
  title = '',
  items = [],
  loading = false,
  error = '',
  emptyMessage = 'No applications in this queue yet.',
}) {
  const safeItems = Array.isArray(items) ? items : []
  const resolvedTitle = normalizeText(title) || QUEUE_LABELS[queueKey] || 'Queue'

  return (
    <section className="rounded-[18px] border border-[#dde6f1] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[#142132]">{resolvedTitle}</h3>
        <span className="rounded-full border border-[#dce6f2] bg-[#f8fbff] px-2.5 py-0.5 text-xs font-semibold text-[#4c647f]">{safeItems.length}</span>
      </div>

      {loading ? <p className="text-sm text-[#5f7287]">Loading queue…</p> : null}
      {!loading && error ? <p className="text-sm text-[#9f3d3d]">{error}</p> : null}
      {!loading && !error && safeItems.length === 0 ? <p className="text-sm text-[#5f7287]">{emptyMessage}</p> : null}

      {!loading && !error && safeItems.length > 0 ? (
        <div className="space-y-2.5">
          {safeItems.map((item, index) => (
            <BondApplicationQueueItem key={String(item.transactionId || item.applicationReference || `queue-item-${index}`)} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
