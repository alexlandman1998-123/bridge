import { recruitmentReviewSummary } from './recruitmentReviewModel'
export const approvalConfirmation = 'I have reviewed the application and supporting evidence and approve this application.'
export const emptyApprovalDraft = () => ({ confirmed: false })
export function recruitmentApprovalErrors(lead, draft) {
  const errors = []
  if (!lead.id || lead.status !== 'under_review' || lead.approved_at || !lead.application_submitted_at || !lead.review_started_at || lead.review_status !== 'ready_for_approval' || recruitmentReviewSummary(lead).status !== 'ready_for_approval') errors.push('Resolve and save all review checks and document findings before approval.')
  if (draft.confirmed !== true) errors.push('Confirm that you have reviewed the application and evidence.')
  return errors
}
