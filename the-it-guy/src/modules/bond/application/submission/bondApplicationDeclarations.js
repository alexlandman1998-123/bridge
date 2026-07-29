import { evaluateBondApplicationRule } from '../flow/bondApplicationRuleEvaluator.js'

export const BOND_APPLICATION_DECLARATION_CONTRACT_VERSION = 'phase-6-v1'
export const BOND_APPLICATION_SURETY_DECLARATIONS_APPROVED = false
export const BOND_APPLICATION_SURETY_DECLARATION_BLOCKER = {
  category: 'declarations',
  code: 'approved_surety_declaration_unavailable',
  message: 'Approved surety declaration wording is required before surety signing can be prepared.',
}

export const BOND_APPLICATION_DECLARATION_CATEGORIES = {
  application: 'application',
  processing: 'processing',
  credit: 'credit',
  communication: 'communication',
  optional: 'optional',
}

export const BOND_APPLICATION_DECLARATIONS = [
  {
    key: 'loan_processing_consent',
    version: '2026-07',
    effectiveFrom: '2026-07-28',
    title: 'Loan processing and affordability assessment',
    text: 'I consent to loan processing and affordability assessment.',
    required: true,
    participantRoles: ['primary_applicant', 'co_applicant'],
    appliesWhen: true,
    category: BOND_APPLICATION_DECLARATION_CATEGORIES.processing,
    blocksSignature: true,
    legacyPath: 'declarations_consents.loan_processing_consent',
  },
  {
    key: 'credit_bureau_fraud_bank_data_consent',
    version: '2026-07',
    effectiveFrom: '2026-07-28',
    title: 'Credit bureau, fraud and bank data checks',
    text: 'I consent to credit bureau, fraud, and bank data retrieval checks.',
    required: true,
    participantRoles: ['primary_applicant', 'co_applicant'],
    appliesWhen: true,
    category: BOND_APPLICATION_DECLARATION_CATEGORIES.credit,
    blocksSignature: true,
    legacyPath: 'declarations_consents.credit_bureau_fraud_bank_data_consent',
  },
  {
    key: 'insurance_third_party_communication_consent',
    version: '2026-07',
    effectiveFrom: '2026-07-28',
    title: 'Insurance and third-party communication',
    text: 'I consent to related insurance and third-party communication where required.',
    required: true,
    participantRoles: ['primary_applicant', 'co_applicant'],
    appliesWhen: true,
    category: BOND_APPLICATION_DECLARATION_CATEGORIES.communication,
    blocksSignature: true,
    legacyPath: 'declarations_consents.insurance_third_party_communication_consent',
  },
  {
    key: 'nhfc_first_home_finance_consent',
    version: '2026-07',
    effectiveFrom: '2026-07-28',
    title: 'First Home Finance processing',
    text: 'I consent to First Home Finance / NHFC processing where applicable.',
    required: false,
    participantRoles: ['primary_applicant', 'co_applicant'],
    appliesWhen: true,
    category: BOND_APPLICATION_DECLARATION_CATEGORIES.processing,
    blocksSignature: false,
    legacyPath: 'declarations_consents.nhfc_first_home_finance_consent',
  },
  {
    key: 'application_information_accuracy',
    version: '2026-07',
    effectiveFrom: '2026-07-28',
    title: 'Accuracy and completeness',
    text: 'I confirm that all information submitted is true and complete.',
    required: true,
    participantRoles: ['primary_applicant', 'co_applicant'],
    appliesWhen: true,
    category: BOND_APPLICATION_DECLARATION_CATEGORIES.application,
    blocksSignature: true,
    legacyPath: 'declarations_consents.declaration_accepted',
  },
  {
    key: 'marketing_privacy_preference',
    version: '2026-07',
    effectiveFrom: '2026-07-28',
    title: 'Marketing preference',
    text: 'I agree to receive relevant marketing communication where permitted.',
    required: false,
    participantRoles: ['primary_applicant', 'co_applicant'],
    appliesWhen: true,
    category: BOND_APPLICATION_DECLARATION_CATEGORIES.optional,
    blocksSignature: false,
    legacyPath: 'declarations_consents.marketing_privacy_preference',
  },
]

function normalizeDeclarationValue(value) {
  if (value === true || value === 'true' || value === 'yes' || value === 'accepted') return true
  return false
}

export function resolveBondApplicationDeclarations({
  declarations = BOND_APPLICATION_DECLARATIONS,
  applicationState = {},
  participantRole = 'primary_applicant',
} = {}) {
  return declarations
    .filter((declaration) => (declaration.participantRoles || []).includes(participantRole))
    .filter((declaration) => evaluateBondApplicationRule(declaration.appliesWhen, applicationState))
    .map((declaration, index) => ({
      ...declaration,
      contractVersion: BOND_APPLICATION_DECLARATION_CONTRACT_VERSION,
      order: declaration.order ?? index + 1,
    }))
}

export function validateBondApplicationDeclarationContract(declarations = BOND_APPLICATION_DECLARATIONS) {
  const issues = []
  const keys = new Set()
  declarations.forEach((declaration, index) => {
    if (!declaration?.key) issues.push({ index, code: 'missing_key', message: 'Declaration key is required.' })
    if (declaration?.key && keys.has(declaration.key)) issues.push({ index, code: 'duplicate_key', message: `Duplicate declaration key ${declaration.key}.` })
    keys.add(declaration?.key)
    if (!declaration?.version) issues.push({ index, code: 'missing_version', message: 'Declaration version is required.' })
    if (!declaration?.effectiveFrom || Number.isNaN(Date.parse(declaration.effectiveFrom))) issues.push({ index, code: 'invalid_effective_from', message: 'Declaration effective date is invalid.' })
    if (!declaration?.title) issues.push({ index, code: 'missing_title', message: 'Declaration title is required.' })
    if (!declaration?.text) issues.push({ index, code: 'missing_text', message: 'Declaration text is required.' })
    if (!Array.isArray(declaration?.participantRoles) || declaration.participantRoles.length === 0) issues.push({ index, code: 'invalid_participant_role', message: 'Declarations must support at least one participant role.' })
    const unsupportedRole = (declaration?.participantRoles || []).find((role) => !['primary_applicant', 'co_applicant', 'surety'].includes(role))
    if (unsupportedRole) issues.push({ index, code: 'unsupported_participant_role', message: `Unsupported declaration participant role ${unsupportedRole}.` })
  })
  return { valid: issues.length === 0, issues }
}

export function buildBondApplicationDeclarationEvidence({
  declarations = [],
  values = {},
  acceptedAt = new Date().toISOString(),
  selectedBankIds = [],
  participantRole = 'primary_applicant',
  participantId = null,
  participantKey = null,
  textHashes = {},
} = {}) {
  return declarations.map((declaration) => ({
    key: declaration.key,
    version: declaration.version,
    contractVersion: declaration.contractVersion || BOND_APPLICATION_DECLARATION_CONTRACT_VERSION,
    title: declaration.title,
    text: declaration.text,
    textHash: textHashes[declaration.key] || null,
    required: Boolean(declaration.required),
    optional: !declaration.required,
    blocksSignature: Boolean(declaration.blocksSignature),
    participantRole,
    participantId,
    participantKey,
    category: declaration.category || '',
    accepted: normalizeDeclarationValue(values[declaration.key]),
    acceptedAt: normalizeDeclarationValue(values[declaration.key]) ? acceptedAt : null,
    selectedBankIds: Array.isArray(selectedBankIds) ? [...selectedBankIds] : [],
    legacyPath: declaration.legacyPath || null,
  }))
}

export function validateBondApplicationDeclarationAcceptance({
  declarations = [],
  values = {},
  participantRole = 'primary_applicant',
} = {}) {
  const issues = participantRole === 'surety' && !BOND_APPLICATION_SURETY_DECLARATIONS_APPROVED
    ? [BOND_APPLICATION_SURETY_DECLARATION_BLOCKER]
    : []
  issues.push(...declarations
    .filter((declaration) => declaration.required && declaration.blocksSignature)
    .filter((declaration) => !normalizeDeclarationValue(values[declaration.key]))
    .map((declaration) => ({
      category: 'declarations',
      code: 'required_declaration',
      declarationKey: declaration.key,
      message: `Accept ${String(declaration.title || 'this declaration').toLowerCase()} before signing.`,
    })))
  return { valid: issues.length === 0, issues }
}
