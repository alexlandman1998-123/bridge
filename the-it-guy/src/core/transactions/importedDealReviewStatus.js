import { DEAL_REVIEW_SECTIONS } from './transactionDetailReview.js'
import { identifyDealImport } from './dealSetupCompatibilityAudit.js'

export function importedDealReviewStatus(transaction = {}, summary = null, { unavailable = false } = {}) {
  if (summary && summary.transactionId === transaction.id) return summary.totalSections === DEAL_REVIEW_SECTIONS.length && (summary.status !== 'reviewed' || summary.confirmedCount === DEAL_REVIEW_SECTIONS.length) ? summary : { ...summary, status: 'status_unavailable', confirmedCount: null, totalSections: DEAL_REVIEW_SECTIONS.length }
  const evidence = identifyDealImport(transaction)
  if (evidence.status === 'not_identified') return null
  return { transactionId: transaction.id, evidence: evidence.status, status: unavailable ? 'status_unavailable' : evidence.status === 'candidate' ? 'import_candidate' : 'needs_review', confirmedCount: null, totalSections: DEAL_REVIEW_SECTIONS.length, sourceAvailable: null }
}

export function importedDealNeedsReview(status) {
  return Boolean(status && status.status !== 'reviewed')
}

export function importedDealReviewLabel(status) {
  if (!status) return ''
  return ({ reviewed: 'Imported · Reviewed', in_review: 'Imported · Review in progress', needs_review: 'Imported · Needs review', import_candidate: 'Import source unverified', status_unavailable: 'Import review unavailable' })[status.status] || 'Imported · Needs review'
}
