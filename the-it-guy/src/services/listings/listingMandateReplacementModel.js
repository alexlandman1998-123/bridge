const MANDATE_DOCUMENT_KEY = 'mandate'

function text(value) {
  return String(value ?? '').trim()
}

function timestamp(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function bool(value) {
  return value === true || ['true', 'yes', '1'].includes(text(value).toLowerCase())
}

function selectedDocuments(session = {}) {
  const value = session.selected_documents ?? session.selectedDocuments ?? []
  if (Array.isArray(value)) return value.map((item) => text(item).toLowerCase())
  return text(value).toLowerCase().split(',').map((item) => item.trim()).filter(Boolean)
}

function sessionTime(session = {}) {
  return timestamp(session.signed_at ?? session.signedAt ?? session.updated_at ?? session.updatedAt ?? session.created_at ?? session.createdAt)
}

function groupMandateSessions(sessions = []) {
  const groups = new Map()
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const groupId = text(session?.signing_group_id ?? session?.signingGroupId)
    if (!groupId || !selectedDocuments(session).includes(MANDATE_DOCUMENT_KEY)) continue
    const rows = groups.get(groupId) || []
    rows.push(session)
    groups.set(groupId, rows)
  }
  return [...groups.entries()].map(([id, rows]) => {
    const statuses = rows.map((row) => text(row?.status).toLowerCase())
    const signed = rows.length > 0 && statuses.every((status) => status === 'signed')
    const partiallySigned = statuses.some((status) => status === 'signed') && !signed
    const active = statuses.some((status) => ['active', 'pending', 'sent', 'opened'].includes(status))
    return {
      id,
      sessions: rows,
      signed,
      partiallySigned,
      active,
      createdAt: Math.max(...rows.map((row) => timestamp(row?.created_at ?? row?.createdAt)), 0),
      completedAt: signed ? Math.max(...rows.map(sessionTime), 0) : 0,
      latestAt: Math.max(...rows.map(sessionTime), 0),
    }
  }).sort((left, right) => right.latestAt - left.latestAt)
}

function latestChangedRevision(revisions = []) {
  return (Array.isArray(revisions) ? revisions : [])
    .filter((revision) => revision?.changed !== false)
    .map((revision) => ({ ...revision, time: timestamp(revision?.recordedAt ?? revision?.recorded_at ?? revision?.createdAt ?? revision?.created_at) }))
    .sort((left, right) => right.time - left.time)[0] || null
}

export const LISTING_MANDATE_FIELD_LABELS = Object.freeze({
  mandateType: 'Mandate type',
  askingPrice: 'Asking price',
  mandateStartDate: 'Start date',
  expiryDate: 'Expiry date',
  commissionBasis: 'Commission basis',
  commissionPercentage: 'Commission percentage',
  commissionAmount: 'Commission amount',
  vatHandling: 'VAT treatment',
  mandateTerms: 'Mandate terms',
  specialConditions: 'Special conditions',
  sellerNotes: 'Seller notes',
})

export function normalizeListingMandateTerms(input = {}) {
  return {
    mandateType: text(input.mandateType ?? input.mandate_type).toLowerCase(),
    askingPrice: number(input.askingPrice ?? input.asking_price ?? input.price),
    mandateStartDate: text(input.mandateStartDate ?? input.mandate_start_date ?? input.startDate),
    expiryDate: text(input.expiryDate ?? input.expiry_date ?? input.mandateEndDate),
    commissionBasis: text(input.commissionBasis ?? input.commission_basis ?? input.basis).toLowerCase() === 'fixed' ? 'fixed' : 'percentage',
    commissionPercentage: number(input.commissionPercentage ?? input.commission_percentage ?? input.percentage),
    commissionAmount: number(input.commissionAmount ?? input.commission_amount ?? input.amount),
    vatHandling: text(input.vatHandling ?? input.vat_handling ?? input.vat).toLowerCase(),
    mandateTerms: text(input.mandateTerms ?? input.mandate_terms),
    specialConditions: text(input.specialConditions ?? input.special_conditions),
    sellerNotes: text(input.sellerNotes ?? input.seller_notes ?? input.notes),
  }
}

export function createListingMandateTermsRevision({ previous = {}, next = {}, revisions = [], actor = '', recordedAt = new Date().toISOString() } = {}) {
  const normalizedPrevious = normalizeListingMandateTerms(previous)
  const normalizedNext = normalizeListingMandateTerms(next)
  const changedFields = Object.keys(normalizedNext).filter((field) => normalizedPrevious[field] !== normalizedNext[field])
  return {
    contract: 'arch9-listing-mandate-terms-revision-v1',
    version: (Array.isArray(revisions) ? revisions.length : 0) + 1,
    changed: changedFields.length > 0,
    changedFields,
    previous: normalizedPrevious,
    next: normalizedNext,
    recordedAt: text(recordedAt) || new Date().toISOString(),
    actor: text(actor),
  }
}

export function buildListingMandateReplacementWorkflow({
  sessions = [],
  replacements = [],
  revisions = [],
  refreshRequired = false,
  amendmentRequired = false,
  signedMandateDate = '',
} = {}) {
  const groups = groupMandateSessions(sessions)
  const revision = latestChangedRevision(revisions)
  const revisionAt = revision?.time || 0
  const signedGroups = groups.filter((group) => group.signed)
  const currentSignedGroup = signedGroups[0] || null
  const currentPartiallySignedGroup = groups.find((group) => group.partiallySigned) || null
  const replacementAfterRevision = groups.find((group) => group.active && (!revisionAt || group.createdAt >= revisionAt)) || null
  const signedAfterRevision = groups.find((group) => group.signed && revisionAt && group.completedAt >= revisionAt) || null
  const hasSignedMandate = Boolean(currentSignedGroup || currentPartiallySignedGroup || text(signedMandateDate))
  const explicitRefresh = bool(refreshRequired)
  const explicitAmendment = bool(amendmentRequired)
  const revisionNeedsSigning = Boolean(revisionAt && !signedAfterRevision)
  const needsAction = (explicitRefresh || revisionNeedsSigning) && !signedAfterRevision
  const replacementRows = Array.isArray(replacements) ? replacements : []
  const pendingReplacement = replacementAfterRevision || null

  let status = 'current'
  if (pendingReplacement) status = 'replacement_pending'
  else if (needsAction && (hasSignedMandate || explicitAmendment)) status = 'amendment_required'
  else if (needsAction) status = 'draft_refresh_required'

  const sourceGroup = currentSignedGroup || currentPartiallySignedGroup || groups.find((group) => group.active) || null
  const changedFields = Array.isArray(revision?.changedFields) ? revision.changedFields : []
  return {
    status,
    requiresAction: ['amendment_required', 'draft_refresh_required'].includes(status),
    isAmendment: status === 'amendment_required',
    sourceWasPartiallySigned: Boolean(currentPartiallySignedGroup && sourceGroup?.id === currentPartiallySignedGroup.id),
    sourceSigningGroupId: sourceGroup?.id || '',
    pendingSigningGroupId: pendingReplacement?.id || '',
    effectiveSigningGroupId: signedAfterRevision?.id || currentSignedGroup?.id || '',
    changedFields,
    changedFieldLabels: changedFields.map((field) => LISTING_MANDATE_FIELD_LABELS[field] || field),
    revisionRecordedAt: revision?.recordedAt ?? revision?.recorded_at ?? '',
    currentSignedAt: currentSignedGroup?.completedAt ? new Date(currentSignedGroup.completedAt).toISOString() : text(signedMandateDate),
    replacementCount: replacementRows.length,
    title: status === 'amendment_required'
      ? 'Signed mandate needs replacement'
      : status === 'draft_refresh_required'
        ? 'Mandate draft needs regeneration'
        : status === 'replacement_pending'
          ? 'Replacement mandate awaiting signatures'
          : 'Mandate is current',
  }
}
