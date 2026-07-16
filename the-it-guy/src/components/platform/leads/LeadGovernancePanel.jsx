import { CheckCircle2, Clock3, GitMerge, ShieldCheck, UsersRound } from 'lucide-react'
import { formatLeadDate, formatLeadStage } from '../../../lib/adminIntakeLeadPresentation'

const DEDUPE_LABELS = {
  canonical: 'Canonical',
  possible_duplicate: 'Review needed',
  confirmed_duplicate: 'Confirmed duplicate',
  merged: 'Merged',
}

function eventDescription(event = {}) {
  const fields = Array.isArray(event.changedFields) ? event.changedFields : []
  if (event.eventType === 'duplicate_reviewed') return 'Duplicate review updated'
  if (event.eventType === 'conversion_linked') return 'Organisation conversion linked'
  if (event.eventType === 'notification_retried') return 'Notification delivery retried'
  if (fields.includes('salesStage')) return `Stage moved to ${formatLeadStage(event.after?.stage)}`
  if (fields.includes('assignedToUserId')) return 'Lead owner changed'
  if (fields.includes('nextAction') || fields.includes('nextActionAt')) return 'Follow-up plan updated'
  if (fields.includes('internalNotes')) return 'Internal notes updated'
  return 'Lead workflow updated'
}

export function LeadGovernancePanel({ context, loading, error, selectedCandidateId, reviewing, onSelectCandidate, onReview }) {
  const status = context?.dedupeStatus || 'canonical'
  const candidates = context?.candidates || []
  const activity = context?.activity || []

  return (
    <section className="rounded-[20px] border border-[#dfe7ee] bg-white p-5 shadow-[0_20px_48px_rgba(23,42,58,0.045)]" aria-label="Lead governance and activity">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.08em] text-[#758696]">Data quality</p>
          <h2 className="mt-1 text-base font-semibold text-[#172a39]">Duplicate review</h2>
        </div>
        <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[0.7rem] font-semibold ${status === 'canonical' ? 'border-[#bfe3d2] bg-[#eff9f4] text-[#176149]' : 'border-[#ead5b5] bg-[#fff8eb] text-[#80591e]'}`}>
          {DEDUPE_LABELS[status] || status}
        </span>
      </div>

      {loading ? <p className="mt-4 text-sm font-medium text-[#788997]">Checking matching records…</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[#982f29]">{error}</p> : null}

      {!loading && !error ? (
        <>
          {candidates.length ? (
            <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-semibold text-[#5f7383]">Potential matches</legend>
              {candidates.map((candidate) => (
                <label key={candidate.id} className={`block cursor-pointer rounded-[12px] border p-3 transition ${selectedCandidateId === candidate.id ? 'border-[#68ac91] bg-[#f1faf6]' : 'border-[#e2e8ed] hover:bg-[#fafcfd]'}`}>
                  <span className="flex items-start gap-2.5">
                    <input type="radio" name="canonical-lead" value={candidate.id} checked={selectedCandidateId === candidate.id} onChange={() => onSelectCandidate(candidate.id)} className="mt-1 accent-[#126149]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#263d4d]">{candidate.contactName || candidate.organisationName || 'Unnamed lead'}</span>
                      <span className="mt-0.5 block truncate text-xs text-[#718393]">{candidate.organisationName} · {candidate.email}</span>
                      <span className="mt-1 block text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[#8a6a38]">Matches: {(candidate.matchReasons || []).join(', ')}</span>
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="mt-4 rounded-[12px] border border-[#e2e9ee] bg-[#f8fafb] p-3 text-sm text-[#657887]">
              No matching email, phone or company records found.
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <button type="button" disabled={reviewing} onClick={() => onReview('canonical', null)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[11px] border border-[#cddfd7] bg-white px-3 text-xs font-semibold text-[#176149] hover:bg-[#f1faf6] disabled:opacity-50"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Mark canonical</button>
            <button type="button" disabled={reviewing || !candidates.length} onClick={() => onReview('possible_duplicate', null)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[11px] border border-[#e4d7c3] bg-white px-3 text-xs font-semibold text-[#80591e] hover:bg-[#fff9ef] disabled:opacity-50"><UsersRound className="h-4 w-4" aria-hidden="true" />Needs review</button>
            <button type="button" disabled={reviewing || !selectedCandidateId} onClick={() => onReview('confirmed_duplicate', selectedCandidateId)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[11px] border border-[#e3c9c6] bg-white px-3 text-xs font-semibold text-[#8d3730] hover:bg-[#fff6f5] disabled:opacity-50"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Confirm duplicate</button>
            <button type="button" disabled={reviewing || !selectedCandidateId} onClick={() => onReview('merged', selectedCandidateId)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[11px] bg-[#243d4d] px-3 text-xs font-semibold text-white hover:bg-[#19303f] disabled:opacity-50"><GitMerge className="h-4 w-4" aria-hidden="true" />Mark merged</button>
          </div>
        </>
      ) : null}

      <div className="mt-6 border-t border-[#e9eef3] pt-5">
        <h2 className="text-base font-semibold text-[#172a39]">Activity</h2>
        {activity.length ? (
          <ol className="mt-3 space-y-3">
            {activity.map((event) => (
              <li key={event.id} className="relative border-l border-[#dce5e9] pl-4">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#5c9e84]" />
                <p className="text-sm font-semibold text-[#344b5c]">{eventDescription(event)}</p>
                <p className="mt-0.5 text-xs text-[#7b8b98]">{event.actor || 'System'} · {formatLeadDate(event.occurredAt)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#788997]"><Clock3 className="h-4 w-4" aria-hidden="true" />Activity will appear after the next workflow update.</p>
        )}
      </div>
    </section>
  )
}
