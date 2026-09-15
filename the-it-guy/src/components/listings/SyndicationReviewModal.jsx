import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

function label(value = '') {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusStyle(status = '') {
  if (status === 'ready') return 'border-[#bfe5cf] bg-[#effbf4] text-[#197849]'
  if (status === 'ready_with_warnings') return 'border-[#f0d6a8] bg-[#fff9ed] text-[#8a5b13]'
  return 'border-[#f0caca] bg-[#fff5f5] text-[#a43d35]'
}

function ChannelReview({ title, channel, onContinue, continueLabel }) {
  const mapped = Object.entries(channel?.mappedOutcome || {}).filter(([, value]) => value !== null && value !== undefined && value !== '')
  const blockers = Array.isArray(channel?.blockers) ? channel.blockers : []
  const warnings = Array.isArray(channel?.warnings) ? channel.warnings : []
  const ready = channel?.dataReady === true

  return (
    <section className="rounded-lg border border-[#dbe6f2] bg-[#fbfdff] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#142132]">{title}</h4>
        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${statusStyle(channel?.status)}`}>
          {ready ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {label(channel?.status || 'not checked')}
        </span>
      </div>

      {mapped.length ? (
        <dl className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {mapped.map(([name, value]) => (
            <div key={name} className="min-w-0 border-b border-[#e8eff6] pb-2 last:border-b-0">
              <dt className="text-xs font-semibold text-[#6b8197]">{label(name)}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium text-[#243d56]">{typeof value === 'boolean' ? (value ? 'Required' : 'Not required') : label(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {blockers.length ? (
        <div className="mt-4 border-l-2 border-[#d96a61] pl-3 text-sm text-[#8d342d]">
          <p className="font-semibold">Resolve before publishing</p>
          <ul className="mt-1 space-y-1">
            {blockers.map((item) => <li key={item}>{label(item)}</li>)}
          </ul>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="mt-4 border-l-2 border-[#d7a437] pl-3 text-sm text-[#7b5a13]">
          <p className="font-semibold">Review before submitting</p>
          <ul className="mt-1 space-y-1">
            {warnings.map((item) => <li key={item}>{label(item)}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button type="button" size="sm" variant="secondary" onClick={onContinue}>
          {continueLabel}
        </Button>
      </div>
    </section>
  )
}

export default function SyndicationReviewModal({
  open,
  onClose,
  review,
  loading = false,
  onRefresh,
  onContinuePrivateProperty,
  onContinueProperty24,
}) {
  const channels = review?.channels || {}

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review channel settings"
      subtitle="Arch9 keeps one listing record and checks how each portal can represent it before the portal's own readiness step."
      className="max-w-4xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          <Button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Refresh review
          </Button>
        </div>
      )}
    >
      {loading ? (
        <div className="grid min-h-48 place-items-center text-sm font-semibold text-[#607387]">
          <span className="inline-flex items-center gap-2"><Loader2 size={17} className="animate-spin" /> Reviewing saved listing details…</span>
        </div>
      ) : review ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-[#dbe6f2] bg-white p-3 text-sm leading-6 text-[#47627c]">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#1f4f78]" />
            <p>Portal credentials, branch access, agent mappings, and final catalogues are still checked server-side when you run each portal’s readiness step.</p>
          </div>
          <ChannelReview title="Private Property" channel={channels.privateProperty} onContinue={onContinuePrivateProperty} continueLabel="Check Private Property readiness" />
          <ChannelReview title="Property24" channel={channels.property24} onContinue={onContinueProperty24} continueLabel="Check Property24 readiness" />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[#c9d8e8] bg-[#fbfdff] p-5 text-sm text-[#607387]">Run the review to see each portal’s current outcome.</div>
      )}
    </Modal>
  )
}
