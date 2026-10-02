import { DEAL_REVIEW_SECTIONS } from '../../core/transactions/transactionDetailReview.js'
import { importedDealReviewLabel } from '../../core/transactions/importedDealReviewStatus.js'
export default function ImportedDealReviewBadge({ status }) {
  if (!status) return null
  const confirmed = status.status === 'reviewed'
  const count = Number.isInteger(status.confirmedCount) ? `${status.confirmedCount} of ${status.totalSections || DEAL_REVIEW_SECTIONS.length} sections confirmed.` : 'Confirmation status has not been verified.'
  const source = status.sourceAvailable === false ? ' Original PDF needs recovery.' : ''
  return <span className={`inline-flex flex-wrap rounded-full px-3 py-1 text-xs font-semibold ${confirmed ? 'bg-successSoft text-success' : 'bg-warningSoft text-warning'}`} title={`${count}${source} Review details in Deal Setup.`}>{importedDealReviewLabel(status)}</span>
}
