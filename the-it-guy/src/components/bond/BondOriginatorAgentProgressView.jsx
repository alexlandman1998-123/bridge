import { ArrowRight, CheckCircle2, Clock3, FileText, Landmark, ListChecks } from 'lucide-react'
import { useMemo } from 'react'
import { buildBondOriginatorAgentProgressViewModel } from '../../modules/bond/integrations'
import Button from '../ui/Button'
import StatusBadge from '../ui/StatusBadge'

function formatDateTime(value) {
  if (!value) return 'No update yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No update yet'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getCardIcon(key) {
  if (key === 'document_requests') return FileText
  if (key === 'offers') return Landmark
  if (key === 'grants') return CheckCircle2
  return ListChecks
}

function resolveProgressSource(progressView, transaction) {
  return (
    progressView ||
    transaction?.bondOriginatorAgentProgressView ||
    transaction?.bond_originator_agent_progress_view ||
    transaction?.bondOriginatorProgressView ||
    null
  )
}

function BondOriginatorAgentProgressView({
  progressView = null,
  transaction = null,
  onOpenFinance = null,
  onOpenDocuments = null,
  onOpenActivity = null,
  compact = false,
}) {
  const model = useMemo(
    () => buildBondOriginatorAgentProgressViewModel({
      exportPackage: resolveProgressSource(progressView, transaction) || {},
    }),
    [progressView, transaction],
  )

  const statusTone = model.available ? 'transaction-chip-watch' : 'transaction-chip-muted'

  return (
    <section className={`rounded-[18px] border border-borderDefault bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primarySoft bg-primarySoft text-primary">
              <Landmark size={18} aria-hidden="true" />
            </span>
            <StatusBadge className={`transaction-workflow-chip ${statusTone}`.trim()}>
              {model.statusLabel}
            </StatusBadge>
            <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
              Tracking only
            </span>
          </div>
          <h3 className="mt-3 text-section-title font-semibold text-textStrong">Bond Originator Progress</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-textMuted">{model.summary}</p>
          <p className="mt-2 text-helper font-medium text-textMuted">Last update: {formatDateTime(model.lastUpdatedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenDocuments ? (
            <Button type="button" variant="secondary" size="sm" onClick={onOpenDocuments}>
              <FileText size={14} />
              Documents
            </Button>
          ) : null}
          {onOpenActivity ? (
            <Button type="button" variant="secondary" size="sm" onClick={onOpenActivity}>
              <Clock3 size={14} />
              Activity
            </Button>
          ) : null}
          {onOpenFinance ? (
            <Button type="button" size="sm" onClick={onOpenFinance}>
              Finance
              <ArrowRight size={14} />
            </Button>
          ) : null}
        </div>
      </div>

      {model.available ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {model.cards.map((card) => {
            const Icon = getCardIcon(card.key)
            return (
              <article key={card.key} className="rounded-[14px] border border-borderDefault bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-helper font-semibold uppercase text-textMuted">{card.label}</p>
                    <strong className="mt-2 block text-base font-semibold text-textStrong">{card.value}</strong>
                    <span className="mt-1 block text-sm text-textMuted">{card.detail}</span>
                  </div>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-borderDefault bg-white text-textMuted">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      <div className={`mt-5 grid gap-4 ${model.events.length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]' : ''}`}>
        <div className="rounded-[14px] border border-borderDefault bg-surface p-4">
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-primary" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-textStrong">Next Step</h4>
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-textMuted">
            {model.nextActions.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 size={15} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {model.events.length ? (
          <div className="rounded-[14px] border border-borderDefault bg-surface p-4">
            <div className="flex items-center gap-2">
              <Clock3 size={16} className="text-primary" aria-hidden="true" />
              <h4 className="text-sm font-semibold text-textStrong">Recent Originator Updates</h4>
            </div>
            <ol className="mt-3 space-y-3">
              {model.events.map((event) => (
                <li key={event.id || `${event.title}-${event.occurredAt}`} className="border-l-2 border-primarySoft pl-3">
                  <strong className="block text-sm font-semibold text-textStrong">{event.title}</strong>
                  {event.summary ? <span className="mt-1 block text-sm leading-5 text-textMuted">{event.summary}</span> : null}
                  <span className="mt-1 block text-helper text-textMuted">{formatDateTime(event.occurredAt)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <p className="mt-4 rounded-[14px] border border-borderDefault bg-mutedBg px-4 py-3 text-sm leading-6 text-textMuted">
        Arch9 shows the progress supplied through the originator process. Bank decisions, offer records and grants remain governed by the bond originator and existing finance workflows.
      </p>
    </section>
  )
}

export default BondOriginatorAgentProgressView
