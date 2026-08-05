import { AlertTriangle, CheckCircle2, CircleDollarSign, FileText, Route } from 'lucide-react'

import { buildOtpCommercialTermsReviewModel } from '../../core/documents/otpCommercialTermsReviewPhase25'
import Button from '../ui/Button'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function titleCase(value = '') {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function StatusPill({ status = '' }) {
  const key = normalizeText(status)
  const ready = ['approved', 'not_required', 'uploaded', 'buyer_viewed', 'acknowledged'].includes(key) || key.includes('READY')
  const pending = key.includes('pending') || key.includes('BLOCKED')
  const className = ready
    ? 'border-[#b9e2ca] bg-[#f1fbf5] text-[#176f3d]'
    : pending
      ? 'border-[#f4d6a6] bg-[#fff8ea] text-[#946012]'
      : 'border-[#dbe6f2] bg-white text-[#405167]'

  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${className}`}>
      {titleCase(key || 'Not set')}
    </span>
  )
}

function CostList({ label, items = [], tone = 'neutral' }) {
  const toneClass = tone === 'pending'
    ? 'border-[#f4d6a6] bg-[#fffaf0]'
    : tone === 'known'
      ? 'border-[#b9e2ca] bg-[#f5fcf7]'
      : 'border-[#dbe6f2] bg-white'

  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7b8f]">{label}</p>
        <span className="text-xs font-semibold text-[#405167]">{items.length}</span>
      </div>
      {items.length ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={item.key} className="grid gap-0.5">
              <p className="text-sm font-semibold text-[#142132]">{item.label || titleCase(item.key)}</p>
              <p className="text-xs text-[#5f7186]">{titleCase(item.source)} · {titleCase(item.dueEvent)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#5f7186]">None</p>
      )}
    </div>
  )
}

function ReviewSection({ icon: Icon, title, status, children, actions = [], onAction, busy = false }) {
  return (
    <section className="rounded-md border border-[#dbe6f2] bg-white p-4 shadow-sm" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[#dbe6f2] bg-[#f7fafc] text-[#27445f]">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#142132]">{title}</h3>
            {status ? <StatusPill status={status} /> : null}
          </div>
        </div>
        {actions.length ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action}
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                title={titleCase(action)}
                onClick={() => onAction?.(action)}
              >
                <FileText size={15} aria-hidden="true" />
                {titleCase(action)}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function OtpCommercialTermsReviewPanel({
  model,
  reviewInput,
  busy = false,
  onAction,
}) {
  const review = model || buildOtpCommercialTermsReviewModel(reviewInput)
  const commission = review.sections.commissionApproval
  const costs = review.sections.buyerCostObligations
  const matterQuote = review.sections.matterAttorneyQuote
  const blocked = review.canGenerateOtp !== true

  return (
    <section className="grid gap-4" aria-label="OTP commercial terms review" data-route-variant={review.routeVariant}>
      <div className="rounded-md border border-[#dbe6f2] bg-[#f8fbfd] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#dbe6f2] bg-white text-[#27445f]">
              <Route size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7b8f]">{review.screenKey}</p>
              <h2 className="text-base font-semibold text-[#142132]">{review.routeLabel}</h2>
            </div>
          </div>
          <StatusPill status={review.status} />
        </div>
        {blocked ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-[#f4d6a6] bg-[#fff8ea] p-3 text-sm text-[#71470a]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>{review.generationBlockers.map(titleCase).join(', ')}</p>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-[#b9e2ca] bg-[#f1fbf5] p-3 text-sm text-[#176f3d]">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>Ready for OTP generation</p>
          </div>
        )}
      </div>

      <ReviewSection
        icon={CircleDollarSign}
        title="Commission approval"
        status={commission.status}
        actions={commission.actions}
        onAction={(action) => onAction?.(action, { section: 'commissionApproval', model: review })}
        busy={busy}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7b8f]">Mandate</p>
            <p className="text-sm font-semibold text-[#142132]">{commission.mandateCommission}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7b8f]">OTP</p>
            <p className="text-sm font-semibold text-[#142132]">{commission.proposedOtpCommission}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7b8f]">Final</p>
            <p className="text-sm font-semibold text-[#142132]">{commission.finalOtpCommission}</p>
          </div>
        </div>
        {commission.approvalReference ? (
          <p className="mt-3 text-xs font-semibold text-[#405167]">{commission.approvalReference}</p>
        ) : null}
      </ReviewSection>

      <ReviewSection
        icon={FileText}
        title="Buyer cost obligations"
        status={costs.pending.length ? 'pending' : 'reviewed'}
        actions={costs.actions}
        onAction={(action) => onAction?.(action, { section: 'buyerCostObligations', model: review })}
        busy={busy}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <CostList label="Known" items={costs.known} tone="known" />
          <CostList label="Estimated" items={costs.estimated} />
          <CostList label="Pending" items={costs.pending} tone="pending" />
        </div>
      </ReviewSection>

      <ReviewSection
        icon={FileText}
        title="Matter attorney cost quote"
        status={matterQuote.status}
        actions={matterQuote.actions}
        onAction={(action) => onAction?.(action, { section: 'matterAttorneyQuote', model: review })}
        busy={busy}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7b8f]">Assignment</p>
            <p className="text-sm font-semibold text-[#142132]">{matterQuote.transactionAttorneyAssignmentId || 'Pending'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7b8f]">Document</p>
            <p className="text-sm font-semibold text-[#142132]">{titleCase(matterQuote.documentDefinitionKey)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7b8f]">Scope</p>
            <p className="text-sm font-semibold text-[#142132]">{matterQuote.separatedFromAttorneyLeadQuote ? 'Transaction matter' : 'Needs review'}</p>
          </div>
        </div>
      </ReviewSection>
    </section>
  )
}
