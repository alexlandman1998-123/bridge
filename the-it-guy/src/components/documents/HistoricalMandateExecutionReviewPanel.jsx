import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { HISTORICAL_MANDATE_EXECUTION_CLASSIFICATIONS } from '../../services/historicalMandateExecutionReviewService'

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function classificationLabel(value) {
  return HISTORICAL_MANDATE_EXECUTION_CLASSIFICATIONS.find((option) => option.value === value)?.label || 'Legal review required'
}

function initialDraft(review = {}) {
  return {
    classification: review.classification || 'legal_review_required',
    reviewReason: review.reviewReason || '',
    downstreamRelease: review.downstreamRelease === true,
  }
}

export default function HistoricalMandateExecutionReviewPanel({
  reviews = [],
  loading = false,
  error = '',
  savingReviewId = '',
  onRefresh = null,
  onResolve = null,
}) {
  const [drafts, setDrafts] = useState({})

  if (!loading && !error && !reviews.length) return null

  const updateDraft = (review, patch) => {
    setDrafts((current) => ({ ...current, [review.id]: { ...initialDraft(review), ...current[review.id], ...patch } }))
  }

  return (
    <article className="rounded-[18px] border border-[#f0d7a8] bg-[#fffaf0] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]" data-testid="historical-mandate-execution-review">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#fff1d4] text-[#9a6512]"><ShieldCheck size={19} /></span>
          <div>
            <h3 className="text-base font-semibold text-[#5d4213]">Historical mandate execution review</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#7a5a23]">These records preserve prior evidence. They do not authorise an attorney handoff unless an authorised reviewer explicitly releases a grandfathered-valid record.</p>
          </div>
        </div>
        {onRefresh ? <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#e8ce9c] bg-white px-3 text-xs font-semibold text-[#76531a] disabled:opacity-60">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Refresh</button> : null}
      </div>

      {error ? <p role="alert" className="mt-4 flex items-start gap-2 rounded-[12px] border border-[#edcf99] bg-white px-3 py-2 text-xs leading-5 text-[#7a5a23]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</p> : null}
      {loading ? <p role="status" className="mt-4 text-sm font-medium text-[#7a5a23]">Loading historical execution records…</p> : null}

      <div className="mt-4 space-y-3">
        {reviews.map((review) => {
          const draft = { ...initialDraft(review), ...drafts[review.id] }
          const busy = savingReviewId === review.id
          const canRelease = draft.classification === 'grandfathered_valid'
          const signedAt = review.sourceSnapshot?.signedAt || review.sourceSnapshot?.signed_at
          return (
            <section key={review.id} className="rounded-[14px] border border-[#eadab8] bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#3f321d]">{classificationLabel(review.classification)}</p>
                  <p className="mt-1 text-xs leading-5 text-[#766247]">Recorded {formatDate(review.createdAt)} · Prior signature timestamp: {formatDate(signedAt)}</p>
                  {review.reviewStatus === 'resolved' ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#edf8f0] px-2.5 py-1 text-xs font-semibold text-[#257345]"><CheckCircle2 size={13} />Resolved{review.downstreamRelease ? ' and released' : ''}</p> : <p className="mt-2 inline-flex rounded-full bg-[#fff4da] px-2.5 py-1 text-xs font-semibold text-[#8a5e13]">Awaiting a decision</p>}
                </div>
                <p className="text-xs text-[#7b694f]">Session · {review.signingSessionId ? `${review.signingSessionId.slice(0, 8)}…` : 'Unavailable'}</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-[#5b482b]">Classification
                  <select value={draft.classification} disabled={busy} onChange={(event) => updateDraft(review, { classification: event.target.value, downstreamRelease: event.target.value === 'grandfathered_valid' ? draft.downstreamRelease : false })} className="mt-1.5 min-h-10 w-full rounded-lg border border-[#dfcfaf] bg-white px-3 text-sm font-medium text-[#42351f] outline-none focus:border-[#b98735] disabled:opacity-60">
                    {HISTORICAL_MANDATE_EXECUTION_CLASSIFICATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-xs leading-5 text-[#5b482b]">
                  <input type="checkbox" checked={draft.downstreamRelease} disabled={busy || !canRelease} onChange={(event) => updateDraft(review, { downstreamRelease: event.target.checked })} />
                  Release this record for downstream use
                </label>
              </div>
              <label className="mt-3 block text-xs font-semibold text-[#5b482b]">Review reason
                <textarea value={draft.reviewReason} disabled={busy} onChange={(event) => updateDraft(review, { reviewReason: event.target.value })} rows={3} minLength={20} className="mt-1.5 w-full resize-y rounded-lg border border-[#dfcfaf] bg-white px-3 py-2 text-sm text-[#42351f] outline-none focus:border-[#b98735] disabled:opacity-60" placeholder="Record the evidence and legal or operational basis for this decision." />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-[#7b694f]">A decision is retained in the audit history. This action does not initiate an attorney handoff.</p>
                <button type="button" disabled={busy || draft.reviewReason.trim().length < 20 || (draft.downstreamRelease && !canRelease)} onClick={() => void onResolve?.(review, draft)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#70531c] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}{busy ? 'Saving…' : 'Record decision'}</button>
              </div>
            </section>
          )
        })}
      </div>
    </article>
  )
}
