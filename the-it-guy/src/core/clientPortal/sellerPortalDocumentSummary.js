import { SELLER_BASE_PACK_KEYS, getSellerBasePackAliases } from '../../lib/sellerBasePackContract.js'

const ACTION_STATUSES = new Set(['required', 'requested', 'rejected', 'missing', 'expired', 'correction_requested'])
const TEAM_MANAGED_PACK_ALIASES = Object.values(SELLER_BASE_PACK_KEYS)
  .flatMap((key) => [key, ...getSellerBasePackAliases(key)])
  .map(status)

function number(value) {
  return Math.max(0, Number(value) || 0)
}

function status(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isActionItem(item = {}) {
  return ACTION_STATUSES.has(status(item.status || item.requiredDocumentStatus || item.required_document_status))
}

function documentSignals(item = {}) {
  return [
    item.sourceId,
    item.uploadKey,
    item.key,
    item.requirementKey,
    item.requirement_key,
    item.title,
    item.label,
    item.description,
    item.group,
    item.linkedDocument?.requirementKey,
    item.linkedDocument?.requirement_key,
    item.linkedDocument?.document_type,
    item.linkedDocument?.documentType,
  ].map(status).filter(Boolean)
}

function isTeamManagedPackItem(item = {}) {
  return documentSignals(item).some((signal) => TEAM_MANAGED_PACK_ALIASES.some((alias) =>
    signal === alias || signal.startsWith(`${alias}_`) || signal.endsWith(`_${alias}`) || signal.includes(`_${alias}_`),
  ))
}

function summaryFor(items = []) {
  return items.reduce((summary, item) => {
    const itemStatus = status(item.status || item.requiredDocumentStatus || item.required_document_status)
    if (['cancelled', 'not_applicable'].includes(itemStatus)) return summary
    summary.total += 1
    if (itemStatus === 'rejected') summary.rejected += 1
    else if (itemStatus === 'required' || itemStatus === 'requested') summary.outstanding += 1
    else if (itemStatus === 'uploaded') summary.uploaded += 1
    else if (itemStatus === 'under_review') summary.underReview += 1
    else if (itemStatus === 'approved' || itemStatus === 'completed') summary.approved += 1
    if (ACTION_STATUSES.has(itemStatus)) summary.blocking += 1
    return summary
  }, { total: 0, outstanding: 0, uploaded: 0, underReview: 0, approved: 0, rejected: 0, blocking: 0 })
}

/**
 * Converts the document-centre payload into the small, stable contract used by
 * the seller overview and navigation. The document centre remains the source
 * of truth: this helper deliberately does not rebuild requirements from a
 * second document model.
 */
export function buildSellerPortalDocumentSummary(documentCenter = {}) {
  const items = Array.isArray(documentCenter?.items) ? documentCenter.items : []
  const source = documentCenter?.summary && typeof documentCenter.summary === 'object'
    ? documentCenter.summary
    : {}
  // The document centre's main checklist is built from required documents and
  // additional requests. Generated signed/sale-document rows belong to their
  // own tab and must not inflate the checklist total in the overview.
  const hasTypedDocumentItems = items.some((item) => String(item?.sourceType || item?.source_type || '').trim())
  const checklistItems = hasTypedDocumentItems
    ? items.filter((item) => ['required_document', 'additional_request'].includes(status(item?.sourceType || item?.source_type)))
    : items
  const clientVisibleItems = checklistItems.filter((item) => !isTeamManagedPackItem(item))
  const hasTeamManagedItems = clientVisibleItems.length !== items.length
  const displaySource = hasTeamManagedItems ? summaryFor(clientVisibleItems) : source
  const allActionItems = clientVisibleItems.filter(isActionItem)
  const total = Math.max(number(displaySource.total), hasTeamManagedItems ? 0 : clientVisibleItems.length)
  const approved = number(displaySource.approved)
  const uploaded = number(displaySource.uploaded)
  const underReview = number(displaySource.underReview)
  const actionRequired = Math.max(
    number(displaySource.blocking),
    number(displaySource.outstanding) + number(displaySource.rejected),
  )
  const reviewRequired = uploaded + underReview
  const received = approved + reviewRequired

  return Object.freeze({
    total,
    approved,
    uploaded,
    underReview,
    actionRequired,
    reviewRequired,
    // The document-centre summary excludes retired and non-blocking document
    // rows. Keep the surfaced action list within that same authoritative
    // count, so the overview cannot promise more actions than the centre.
    actionItems: allActionItems.slice(0, actionRequired),
    assurancePercent: total ? Math.round((approved / total) * 100) : 0,
    collectionPercent: total ? Math.round((received / total) * 100) : 0,
    ready: total > 0 && actionRequired === 0 && reviewRequired === 0,
  })
}
