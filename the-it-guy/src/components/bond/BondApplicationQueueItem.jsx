function normalizeText(value) {
  return String(value || '').trim()
}

function formatDateTime(value) {
  if (!value) return 'Not updated'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not updated'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function BondApplicationQueueItem({ item = {} }) {
  return (
    <article className="rounded-[14px] border border-[#dce6f2] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm text-[#162536]">{normalizeText(item.applicationReference) || normalizeText(item.transactionId) || 'Application'}</strong>
        {item.overdue ? (
          <span className="rounded-full border border-[#f6c2c2] bg-[#fff3f3] px-2 py-0.5 text-[0.72rem] font-semibold text-[#a03535]">Overdue</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-[#4f647b]">
        {normalizeText(item.clientName) || 'Client unavailable'} · {normalizeText(item.propertyName) || 'Property unavailable'}
      </p>
      <p className="mt-1 text-xs text-[#657c95]">
        Stage: {normalizeText(item.stage) || '—'} · Finance: {normalizeText(item.financeStatus) || '—'}
      </p>
      <p className="mt-1 text-xs text-[#657c95]">
        Consultant: {normalizeText(item.primaryConsultantUserId) || '—'} · Processor: {normalizeText(item.processorUserId) || '—'}
      </p>
      <p className="mt-1 text-xs text-[#657c95]">
        Next action: {normalizeText(item.nextAction) || '—'}
      </p>
      {normalizeText(item.blockerReason) ? (
        <p className="mt-1 text-xs text-[#9b3c3c]">Blocker: {normalizeText(item.blockerReason)}</p>
      ) : null}
      <p className="mt-2 text-[0.72rem] text-[#7f92a7]">Updated: {formatDateTime(item.lastUpdatedAt)}</p>
    </article>
  )
}
