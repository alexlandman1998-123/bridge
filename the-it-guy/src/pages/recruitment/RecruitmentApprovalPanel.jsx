import { approvalConfirmation, recruitmentApprovalErrors } from './recruitmentApprovalModel'
import { recruitmentReviewSummary } from './recruitmentReviewModel'
const date = (value) => new Date(value).toLocaleString('en-ZA', {timeZone:'Africa/Johannesburg'})
export default function RecruitmentApprovalPanel({lead,draft,onChange,onApprove,onReject,busy,otherDirty}) {
  if (lead.approved_at) return <section className="mt-6 rounded-2xl border border-[#cfe7d8] bg-[#f3fbf6] p-5" aria-label="Application approval"><h3 className="text-lg font-semibold text-[#26724c]">Application approved</h3><p className="mt-2 text-sm text-[#405b75]">Approved {date(lead.approved_at)}</p><p className="mt-1 break-all text-xs text-[#60758b]">Approved by · {lead.approved_by}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm text-[#20364c]">{lead.approval_notes}</p><p className="mt-4 text-xs text-[#60758b]">The submitted application, review findings and documents have been preserved in the approval record. Contract preparation is the next phase.</p></section>
  if (lead.status !== 'under_review') return null
  const ready = lead.review_status === 'ready_for_approval' && recruitmentReviewSummary(lead).status === 'ready_for_approval'
  const errors = recruitmentApprovalErrors(lead,draft)
  return <section className="mt-6 rounded-2xl border border-[#e1e7eb] bg-white p-5" aria-label="Application approval">
    <h3 className="text-lg font-semibold text-[var(--recruitment-primary-ink)]">Application approval</h3>
    {!ready && <p className="mt-2 text-sm text-[#607080]">Resolve and save all four checks and review every uploaded document before approval.</p>}
    <form onSubmit={(event) => {
      event.preventDefault()
      if (!busy && !otherDirty && !errors.length) onApprove(draft)
    }}>
      <fieldset disabled={busy || otherDirty || !ready} className="mt-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e1e7eb] bg-[#fafbfc] p-4 text-sm leading-6 text-[#20364c]">
          <input type="checkbox" className="recruitment-ci-focus mt-1 h-4 w-4 shrink-0 accent-[var(--recruitment-primary)]" checked={draft.confirmed} onChange={(event) => onChange({...draft,confirmed:event.target.checked})} />
          {approvalConfirmation}
        </label>
      </fieldset>
      <div role="group" aria-label="Application decision" className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || otherDirty || errors.length > 0} className="recruitment-ci-primary-button recruitment-ci-focus rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Approve application'}</button>
        {onReject && <button type="button" disabled={busy || otherDirty} onClick={onReject} className="recruitment-ci-focus rounded-xl border border-[#e8c9c5] bg-white px-4 py-3 text-sm font-semibold text-[#9f3028] hover:bg-[#fff5f4] disabled:opacity-50">Reject Application</button>}
      </div>
      {otherDirty && <p className="mt-2 text-xs text-[#607080]">Save agent details and review findings before approving.</p>}
    </form>
  </section>
}
