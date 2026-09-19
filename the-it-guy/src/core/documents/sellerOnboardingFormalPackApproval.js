export const SELLER_ONBOARDING_FORMAL_PACK_APPROVAL_CONTRACT = 'arch9-seller-onboarding-formal-pack-approval-v1'

const text = (value) => String(value ?? '').trim()

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function route(value = '') {
  return text(value) === 'manual_upload' ? 'manual_upload' : 'digital_pack'
}

export function validateSellerOnboardingFormalPackApproval({
  reviewApproved = false,
  selectedDocuments = [],
  commission = {},
  signingRoute = 'digital_pack',
} = {}) {
  const selected = Array.isArray(selectedDocuments) ? selectedDocuments.map(text).filter(Boolean) : []
  const includesMandate = selected.includes('mandate')
  const basis = text(commission?.basis) === 'fixed' ? 'fixed' : 'percentage'
  const value = basis === 'fixed' ? number(commission?.amount) : number(commission?.percentage)
  const vatHandling = text(commission?.vatHandling || commission?.vat_handling)
  const missing = []
  if (!reviewApproved) missing.push('Approve seller onboarding')
  if (includesMandate && value <= 0) missing.push(basis === 'fixed' ? 'Fixed commission amount' : 'Commission percentage')
  if (includesMandate && !vatHandling) missing.push('VAT treatment')
  return {
    contract: SELLER_ONBOARDING_FORMAL_PACK_APPROVAL_CONTRACT,
    valid: missing.length === 0,
    missing,
    signingRoute: route(signingRoute),
    selectedDocuments: selected,
    commission: {
      basis,
      percentage: basis === 'percentage' && value > 0 ? String(commission?.percentage || '').trim() : '',
      amount: basis === 'fixed' && value > 0 ? String(commission?.amount || '').trim() : '',
      vatHandling,
      confirmed: includesMandate && value > 0 && Boolean(vatHandling),
    },
  }
}

export function createSellerOnboardingFormalPackApproval({
  existing = {},
  reviewApproved = false,
  selectedDocuments = [],
  commission = {},
  signingRoute = 'digital_pack',
  actor = '',
  at = new Date().toISOString(),
} = {}) {
  const validation = validateSellerOnboardingFormalPackApproval({ reviewApproved, selectedDocuments, commission, signingRoute })
  if (!validation.valid) throw new Error(`Complete ${validation.missing.join(' and ')} before preparing the signing pack.`)
  const current = existing && typeof existing === 'object' ? existing : {}
  const entry = {
    at: text(at),
    actor: text(actor),
    signingRoute: validation.signingRoute,
    selectedDocuments: validation.selectedDocuments,
    commission: validation.commission,
  }
  return {
    contract: SELLER_ONBOARDING_FORMAL_PACK_APPROVAL_CONTRACT,
    status: 'approved',
    approvedAt: entry.at,
    approved_at: entry.at,
    approvedBy: entry.actor,
    approved_by: entry.actor,
    signingRoute: entry.signingRoute,
    signing_route: entry.signingRoute,
    selectedDocuments: entry.selectedDocuments,
    selected_documents: entry.selectedDocuments,
    commission: entry.commission,
    history: [...(Array.isArray(current.history) ? current.history : []), entry],
  }
}
