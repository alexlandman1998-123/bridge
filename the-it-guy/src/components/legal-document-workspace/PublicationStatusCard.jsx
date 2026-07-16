import { AlertTriangle, Check, CheckCircle2, ChevronRight, Circle, History, Loader2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PublicationStatusCard({
  publication,
  review,
  versionCount,
  advancedEditorPath,
  reviewBusy,
  onReviewAction,
}) {
  const ready = publication?.ready
  const live = publication?.status === 'live'
  const heading = live ? 'Published and live' : ready ? 'Ready to publish' : 'Review required'
  const detail = publication?.totalChecks
    ? `${publication.passedChecks} of ${publication.totalChecks} checks passed`
    : 'Publication checks are not available yet.'
  const firstBlocker = publication?.blockingItems?.[0]?.message || ''

  return (
    <div className="space-y-3" id="publication-readiness">
      <section className={`rounded-[16px] border p-4 ${ready || live ? 'border-[#b9dcc7] bg-[#f2faf5]' : 'border-[#ead8b5] bg-[#fffaf0]'}`} aria-labelledby="publication-status-title">
        <div className="flex items-start gap-3">
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white ${ready || live ? 'border-[#9fd0b1] text-[#16804d]' : 'border-[#dfc58f] text-[#9a6b18]'}`}>
            {ready || live ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 id="publication-status-title" className={`text-sm font-semibold ${ready || live ? 'text-[#1d6f46]' : 'text-[#805d1e]'}`}>{heading}</h2>
            <p className="mt-1 text-xs leading-5 text-[#687b90]">{detail}</p>
            {firstBlocker ? <p className="mt-2 text-xs leading-5 text-[#806638]">{firstBlocker}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-[16px] border border-[#dce5ed] bg-white p-4" aria-labelledby="legal-review-title">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#c9ddd2] bg-[#f3faf6] text-[#26764c]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="legal-review-title" className="text-sm font-semibold text-[#253b51]">{review.label}</h2>
            <p className="mt-1 text-xs leading-5 text-[#718397]">Review and release stay separate from drafting.</p>
          </div>
        </div>

        {publication?.checks?.length ? (
          <ul className="mt-4 space-y-2" aria-label="Release checks">
            {publication.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-xs leading-5 text-[#5d7186]">
                {check.passed
                  ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16804d]" aria-hidden="true" />
                  : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b28432]" aria-hidden="true" />}
                <span>{check.label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {review.submissionBlockers?.length && review.action === 'submit_review' ? (
          <p className="mt-3 rounded-[9px] bg-[#fff8ec] px-3 py-2 text-[11px] leading-5 text-[#806638]">{review.submissionBlockers[0]}</p>
        ) : null}

        {review.action === 'open_release' ? (
          <Link to={advancedEditorPath} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#0f7f4f] px-4 text-sm font-semibold text-white transition hover:bg-[#0c7045]">
            {review.actionLabel}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : review.action ? (
          <button
            type="button"
            disabled={!review.actionEnabled || reviewBusy}
            onClick={onReviewAction}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[#9fc7b0] bg-[#eff8f3] px-4 text-sm font-semibold text-[#176f43] transition hover:border-[#75ae8c] hover:bg-[#e6f4eb] disabled:cursor-not-allowed disabled:border-[#d5e0da] disabled:bg-[#f4f7f5] disabled:text-[#829087]"
          >
            {reviewBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            {reviewBusy ? 'Updating…' : review.actionLabel}
          </button>
        ) : null}
      </section>

      <Link
        to={advancedEditorPath}
        className="flex min-h-12 items-center gap-3 rounded-[14px] border border-[#dce5ed] bg-white px-4 text-sm font-semibold text-[#566b81] transition hover:border-[#b9cbd8] hover:bg-[#f9fbfc]"
      >
        <History className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1">Version history</span>
        <span className="text-xs font-medium text-[#8a99a8]">{versionCount}</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
