import { BadgeCheck, Building2, Clock3, Mail, Phone, Scale, TriangleAlert } from 'lucide-react'
import {
  SELLER_TRANSFER_ATTORNEY_DECISIONS,
  SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES,
  normalizeSellerTransferAttorneyDecision,
} from '../../lib/sellerTransferAttorneyDecision'

function formatDecisionDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function getDecisionPresentation(decision) {
  if (decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation) {
    return {
      label: 'Seller accepted recommendation',
      nextStep: 'The selected firm can now flow into the mandate preparation step.',
      tone: 'emerald',
      icon: BadgeCheck,
      actionLabel: 'Continue to mandate',
    }
  }
  if (decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn) {
    return {
      label: 'Seller nominated another firm',
      nextStep: 'Verify the nominated firm’s contact details before preparing the mandate.',
      tone: 'blue',
      icon: Building2,
      actionLabel: 'Review in mandate',
    }
  }
  if (decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.defer) {
    return {
      label: 'Seller wants to discuss first',
      nextStep: 'Contact the seller and resolve the appointment before preparing the mandate.',
      tone: 'amber',
      icon: TriangleAlert,
      actionLabel: '',
    }
  }
  return {
    label: decision.recommendationStatus === SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended
      ? 'Waiting for seller decision'
      : 'Attorney choice not started',
    nextStep: decision.recommendationStatus === SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended
      ? 'The recommendation has been sent. The seller still needs to accept it, nominate another firm, or request a discussion.'
      : 'Prepare a recommendation before seller onboarding is sent.',
    tone: 'slate',
    icon: Clock3,
    actionLabel: '',
  }
}

const TONE_CLASSES = {
  emerald: {
    border: 'border-emerald-200',
    background: 'bg-emerald-50/70',
    icon: 'bg-emerald-100 text-emerald-700',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  blue: {
    border: 'border-blue-200',
    background: 'bg-blue-50/70',
    icon: 'bg-blue-100 text-blue-700',
    pill: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  amber: {
    border: 'border-amber-200',
    background: 'bg-amber-50/70',
    icon: 'bg-amber-100 text-amber-700',
    pill: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  slate: {
    border: 'border-slate-200',
    background: 'bg-slate-50/80',
    icon: 'bg-slate-200 text-slate-600',
    pill: 'border-slate-200 bg-white text-slate-600',
  },
}

export default function SellerAttorneyDecisionSummary({
  decision: decisionInput = {},
  sellerEmail = '',
  sellerPhone = '',
  onContinueToMandate = null,
  className = '',
}) {
  const decision = normalizeSellerTransferAttorneyDecision(decisionInput)
  const presentation = getDecisionPresentation(decision)
  const tone = TONE_CLASSES[presentation.tone] || TONE_CLASSES.slate
  const StatusIcon = presentation.icon
  const selectedAttorney = decision.selectedAttorney
  const recommendation = decision.recommendedAttorney
  const hasRecommendation = decision.recommendationStatus === SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended
  const showSelectedAttorney = [
    SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
    SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  ].includes(decision.decision)
  const canContactSeller = decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.defer

  return (
    <article className={`rounded-[24px] border bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)] ${tone.border} ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[15px] ${tone.icon}`}>
            <StatusIcon size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Transferring attorney</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-950">{presentation.label}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{presentation.nextStep}</p>
          </div>
        </div>
        <span className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${tone.pill}`}>
          {decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.pending ? 'Awaiting decision' : 'Decision recorded'}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Scale size={16} />
            <p className="text-xs font-semibold uppercase tracking-[0.08em]">Agency recommendation</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {hasRecommendation ? recommendation.companyName || recommendation.email : 'No firm recommended'}
          </p>
          {hasRecommendation && recommendation.contactPerson ? <p className="mt-1 text-sm text-slate-600">{recommendation.contactPerson}</p> : null}
        </div>

        <div className={`rounded-2xl border p-4 ${tone.border} ${tone.background}`}>
          <div className="flex items-center gap-2 text-slate-500">
            <BadgeCheck size={16} />
            <p className="text-xs font-semibold uppercase tracking-[0.08em]">Seller’s choice</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {showSelectedAttorney ? selectedAttorney.companyName || selectedAttorney.email : presentation.label}
          </p>
          {showSelectedAttorney ? (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
              {selectedAttorney.contactPerson ? <span>{selectedAttorney.contactPerson}</span> : null}
              {selectedAttorney.email ? <span>{selectedAttorney.email}</span> : null}
              {selectedAttorney.phone ? <span>{selectedAttorney.phone}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium text-slate-500">
          {decision.decidedAt ? `Recorded ${formatDecisionDate(decision.decidedAt)}` : 'No seller decision timestamp yet'}
        </p>
        <div className="flex flex-wrap gap-2">
          {canContactSeller && sellerEmail ? (
            <a
              href={`mailto:${sellerEmail}?subject=${encodeURIComponent('Transferring attorney appointment')}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Mail size={15} />
              Email seller
            </a>
          ) : null}
          {canContactSeller && sellerPhone ? (
            <a
              href={`tel:${sellerPhone}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Phone size={15} />
              Call seller
            </a>
          ) : null}
          {presentation.actionLabel && onContinueToMandate ? (
            <button
              type="button"
              onClick={() => onContinueToMandate()}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-800"
            >
              {presentation.actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
