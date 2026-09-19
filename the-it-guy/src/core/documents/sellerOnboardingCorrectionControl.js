export const SELLER_ONBOARDING_CORRECTION_CONTROL_CONTRACT = 'arch9-seller-onboarding-correction-control-v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function approvalSnapshot(value = {}) {
  const approval = record(value)
  return approval.status ? {
    status: text(approval.status), approvedAt: text(approval.approvedAt || approval.approved_at),
    signingRoute: text(approval.signingRoute || approval.signing_route), selectedDocuments: Array.isArray(approval.selectedDocuments) ? approval.selectedDocuments : [],
    commission: record(approval.commission),
  } : null
}

function dispatchSnapshot(value = {}) {
  const dispatch = record(value)
  return dispatch.status ? {
    status: text(dispatch.status), signingGroupId: text(dispatch.signingGroupId || dispatch.signing_group_id),
    dispatchedAt: text(dispatch.dispatchedAt || dispatch.dispatched_at), recipientCount: Number(dispatch.recipientCount || 0),
    deliveredRecipientCount: Number(dispatch.deliveredRecipientCount || 0), selectedDocuments: Array.isArray(dispatch.selectedDocuments) ? dispatch.selectedDocuments : [],
  } : null
}

function manualPackSnapshot(value = {}) {
  const pack = record(value)
  return pack.status ? {
    status: text(pack.status), generatedAt: text(pack.generatedAt || pack.generated_at),
    documents: (Array.isArray(pack.documents) ? pack.documents : []).map((document) => ({ key: text(document?.key), fileName: text(document?.generatedFileName || document?.generated_file_name) })).filter((document) => document.key),
  } : null
}

/**
 * Archives the operational state that is being invalidated. It purposely
 * excludes signing links and generated HTML: both remain outside audit JSON.
 */
export function createSellerOnboardingCorrectionControl({ existing = {}, formData = {}, reason = '', actor = '', at = new Date().toISOString() } = {}) {
  const nextReason = text(reason)
  if (nextReason.length < 5) throw new Error('Provide a short reason before requesting a seller onboarding correction.')
  const form = record(formData)
  const entry = {
    at: text(at), actor: text(actor), reason: nextReason,
    supersededApproval: approvalSnapshot(form.sellerOnboardingFormalPackApproval || form.seller_onboarding_formal_pack_approval),
    supersededDispatch: dispatchSnapshot(form.sellerOnboardingFormalPackDispatch || form.seller_onboarding_formal_pack_dispatch),
    supersededManualPack: manualPackSnapshot(form.sellerOnboardingManualSigningPack || form.seller_onboarding_manual_signing_pack),
  }
  const current = record(existing)
  return {
    contract: SELLER_ONBOARDING_CORRECTION_CONTROL_CONTRACT,
    status: 'correction_requested', requestedAt: entry.at, requested_at: entry.at,
    requestedBy: entry.actor, requested_by: entry.actor, reason: entry.reason,
    history: [...(Array.isArray(current.history) ? current.history : []), entry],
  }
}

export function recordSellerOnboardingCorrectionResubmission({ existing = {}, at = new Date().toISOString() } = {}) {
  const current = record(existing)
  if (text(current.status) !== 'correction_requested') return current
  const resubmittedAt = text(at)
  return {
    ...current,
    status: 'resubmitted',
    resubmittedAt,
    resubmitted_at: resubmittedAt,
    history: [...(Array.isArray(current.history) ? current.history : []), { at: resubmittedAt, status: 'resubmitted' }],
  }
}
