import { AlertTriangle, Check, Clock3, UserRound } from 'lucide-react'

function statusLabel(status) {
  const labels = { signed: 'Complete', viewed: 'Opened', sent: 'Sent', ready_to_send: 'Waiting', declined: 'Declined', expired: 'Expired', pending: 'Pending' }
  return labels[status] || String(status || 'Pending').replace(/_/g, ' ')
}

export default function DocumentResponsibilityCard({ model = null, compact = false }) {
  if (model?.contract !== 'arch9-document-responsibility-v1') return null
  const attention = model.phase === 'attention'
  const complete = ['complete', 'signing_complete'].includes(model.phase)
  return (
    <section data-testid="document-responsibility" className={`rounded-[18px] border p-4 ${attention ? 'border-[#f1d2ce] bg-[#fff5f3]' : complete ? 'border-[#cfe8d9] bg-[#f3fbf6]' : 'border-[#d8e3ef] bg-white'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${attention ? 'bg-[#ffe8e3] text-[#9a3125]' : complete ? 'bg-[#e4f5eb] text-[#237047]' : 'bg-[#eaf2fa] text-[#315d86]'}`}>
          {attention ? <AlertTriangle size={17} /> : complete ? <Check size={17} /> : model.currentOwner?.type === 'system' ? <Clock3 size={17} /> : <UserRound size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7389a2]">Responsibility</p>
          <h3 className="mt-1 text-base font-semibold text-[#142132]">{model.title}</h3>
          <p className="mt-1 text-sm leading-5 text-[#607387]">{model.summary}</p>
          {model.nextHandoff ? <p className="mt-2 text-xs font-semibold text-[#35546c]">Next handoff: {model.nextHandoff}</p> : null}
        </div>
      </div>
      {!compact && model.queue?.length ? (
        <ol className="mt-3 flex flex-wrap gap-2">
          {model.queue.map((signer) => (
            <li key={signer.id} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${signer.status === 'signed' ? 'border-[#cfe8d9] bg-[#effaf4] text-[#237047]' : signer.id === model.currentOwner?.id ? 'border-[#bfd3e6] bg-[#edf5fb] text-[#315d86]' : 'border-[#dce5ef] bg-[#f8fbfd] text-[#607387]'}`}>
              {signer.name || signer.roleLabel} · {statusLabel(signer.status)}{signer.isViewer ? ' · You' : ''}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
