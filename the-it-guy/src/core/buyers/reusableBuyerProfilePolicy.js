const text = (value) => String(value || '').trim()

// Phase 0 policy: Arch9 is a buyer-profile-first system. Information supplied
// by a buyer is retained once in their profile and referenced by transactions.
// A transaction records when a profile value/document was used, but must not
// create a second copy merely because the buyer is purchasing another property.
export const BUYER_PROFILE_REUSE_POLICY_VERSION = 'buyer_profile_reuse_v1'

export const BUYER_PROFILE_REUSE_GROUPS = Object.freeze({
  identity: Object.freeze([
    'name', 'email', 'phone', 'identity_number', 'passport_number', 'date_of_birth',
    'nationality', 'marital_status', 'physical_address', 'postal_address',
  ]),
  employment_and_income: Object.freeze([
    'employment_type', 'employer', 'occupation', 'employment_start_date', 'gross_monthly_income',
    'net_monthly_income', 'monthly_credit_commitments', 'monthly_living_expenses', 'dependants',
  ]),
  entity_and_authority: Object.freeze([
    'purchaser_type', 'company_name', 'company_registration_number', 'trust_name', 'trust_number',
    'director_details', 'trustee_details', 'beneficiary_details', 'signatory_details',
  ]),
  finance_and_funding: Object.freeze([
    'bank', 'bank_account_details', 'funding_sources', 'cash_contribution_available',
    'cash_contribution_source', 'bond_readiness_consent', 'bank_statements_available',
  ]),
  documents: Object.freeze([
    'buyer_id_document', 'buyer_passport', 'buyer_proof_of_address', 'buyer_marital_status_documents',
    'buyer_income_documents', 'buyer_bank_statements', 'buyer_company_registration_documents',
    'buyer_director_ids', 'buyer_trustee_ids', 'buyer_trust_documents', 'buyer_authority_documents',
  ]),
})

const groupedKeys = new Set(Object.values(BUYER_PROFILE_REUSE_GROUPS).flat())

export function normalizeBuyerProfileKey(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

export function getBuyerProfileReuseGroup(value) {
  const key = normalizeBuyerProfileKey(value)
  return Object.entries(BUYER_PROFILE_REUSE_GROUPS).find(([, keys]) => keys.includes(key))?.[0] || 'other'
}

export function resolveBuyerProfileReusePolicy(value, { kind = 'input' } = {}) {
  const key = normalizeBuyerProfileKey(value)
  const normalizedKind = normalizeBuyerProfileKey(kind) || 'input'
  const group = getBuyerProfileReuseGroup(key)

  return {
    key,
    group,
    kind: normalizedKind,
    policyVersion: BUYER_PROFILE_REUSE_POLICY_VERSION,
    // Unknown keys are reusable too. New onboarding fields must not quietly
    // reintroduce duplicate data just because they have not been catalogued.
    reusable: true,
    storage: 'buyer_profile',
    transactionStorage: 'profile_reference_with_usage_receipt',
    requiresFreshUpload: false,
    requiresRekeying: false,
    profileSourceRequired: true,
    knownKey: groupedKeys.has(key),
  }
}

export function buildBuyerProfileReuseReceipt({
  buyerId = '',
  sourceId = '',
  sourceVersion = '',
  key = '',
  kind = 'input',
  usedAt = new Date().toISOString(),
} = {}) {
  const policy = resolveBuyerProfileReusePolicy(key, { kind })
  return {
    buyerId: text(buyerId),
    sourceId: text(sourceId),
    sourceVersion: text(sourceVersion),
    usedAt: text(usedAt),
    ...policy,
  }
}
