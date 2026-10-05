import { recruitmentReviewSummary } from './recruitmentReviewModel'
export const emptyApprovalDraft = () => ({ notes: '', confirmed: false })
export function recruitmentApprovalErrors(lead, draft) {
  const errors = []
  if (!lead.id || lead.status !== 'under_review' || lead.approved_at || !lead.application_submitted_at || !lead.review_started_at || lead.review_status !== 'ready_for_approval' || recruitmentReviewSummary(lead).status !== 'ready_for_approval') errors.push('Resolve and save all review checks and document findings before approval.')
  if (typeof draft.notes !== 'string' || draft.notes.trim().length < 5 || draft.notes.length > 3000) errors.push('Record an approval reason (5–3,000 characters).')
  if (draft.confirmed !== true) errors.push('Confirm that you have reviewed the application and evidence.')
  return errors
}
