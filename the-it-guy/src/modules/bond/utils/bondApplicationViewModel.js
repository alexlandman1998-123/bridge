import {
  BOND_APPLICATION_PREFILL_CONFIRMATION_CARD_DEFINITIONS,
  buildApplicationStateFromNormalizedApplication,
  buildBondApplicationPrefillReviewModel,
} from '../application/index.js'
import { buildBondApplicationState as buildLegacyBondApplicationState } from '../application/legacy/bondApplicationLegacyAdapter.js'

const CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const COMPLETED_DOCUMENT_STATUSES = new Set(['approved', 'complete', 'completed', 'generated', 'pending_review', 'received', 'signed', 'uploaded', 'verified'])

function text(value) {
  return String(value || '').trim()
}

function present(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.length > 0
  return true
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '').replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function valueFrom(...values) {
  return values.find((value) => present(value))
}

function formatCurrency(value, fallback = 'Not captured') {
  const amount = number(value)
  return amount ? CURRENCY.format(amount) : fallback
}

function formatDateTime(value, fallback = 'Pending') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value, fallback = 'Pending') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getNested(source, paths = []) {
  for (const path of paths) {
    const parts = String(path || '').split('.').filter(Boolean)
    let current = source
    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        current = undefined
        break
      }
      current = current[part]
    }
    if (present(current)) return current
  }
  return undefined
}

function lookup(data, paths = []) {
  return valueFrom(
    getNested(data?.onboardingFormData, paths),
    getNested(data?.onboardingFormData?.formData, paths),
    getNested(data?.onboardingFormData?.form_data, paths),
    getNested(data?.bondApplication, paths),
    getNested(data?.transaction, paths),
    getNested(data?.buyer, paths),
  )
}

function alignmentValueCaptured(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return Boolean(value)
}

function alignmentDisplayValue(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === null || value === undefined || value === '') return 'Not captured'
  return text(value)
}

function firstAlignmentValue(...values) {
  return values.find((value) => alignmentValueCaptured(value))
}

function listAmountByLegacyKey(rows = [], legacyKey = '') {
  const row = Array.isArray(rows) ? rows.find((item) => item?.legacyKey === legacyKey) : null
  return firstAlignmentValue(row?.value, row?.amount, row?.balance)
}

function derivedAssetTotal(applicationState = {}) {
  return sumListAmounts(applicationState?.participants?.primaryApplicant?.assets || [], ['value', 'amount'])
}

function derivedLiabilityTotal(applicationState = {}) {
  const liabilities = applicationState?.participants?.primaryApplicant?.liabilities || []
  return firstAlignmentValue(
    listAmountByLegacyKey(liabilities, 'total_liabilities'),
    listAmountByLegacyKey(liabilities, 'liabilities_total'),
    sumListAmounts(liabilities, ['value', 'amount', 'balance']),
  )
}

function participantLiabilitySummary(liabilities = []) {
  const explicitTotal = number(firstAlignmentValue(
    listAmountByLegacyKey(liabilities, 'total_liabilities'),
    listAmountByLegacyKey(liabilities, 'liabilities_total'),
  ))
  const itemizedTotal = sumListAmounts(
    (Array.isArray(liabilities) ? liabilities : []).filter((item) => !['total_liabilities', 'liabilities_total'].includes(item?.legacyKey)),
    ['value', 'amount', 'balance'],
  )
  return {
    explicitTotal,
    itemizedTotal,
    total: explicitTotal || itemizedTotal,
  }
}

const ORIGINATOR_FIELD_ALIGNMENT_DEFINITIONS = [
  { key: 'status', group: 'Application', label: 'Status', paths: ['legacySubmission.status', 'meta.status'] },
  { key: 'submitted_at', group: 'Application', label: 'Submitted at', paths: ['legacySubmission.submittedAt', 'meta.submittedAt'] },
  { key: 'selected_banks', group: 'Application', label: 'Selected banks', paths: ['application.selectedBankIds'] },
  { key: 'applicant_structure', group: 'Application', label: 'Applicant structure', paths: ['application.applicantStructure'] },
  { key: 'property_reference', group: 'Property', label: 'Property reference', paths: ['application.property.propertyReference'] },
  { key: 'development_name', group: 'Property', label: 'Development name', paths: ['application.property.developmentName'] },
  { key: 'unit_reference', group: 'Property', label: 'Unit reference', paths: ['application.property.unitReference'] },
  { key: 'purchase_price', group: 'Finance', label: 'Purchase price', paths: ['application.finance.purchasePrice'] },
  { key: 'deposit_contribution', group: 'Finance', label: 'Deposit contribution', paths: ['application.finance.depositAmount'] },
  { key: 'amount_to_be_registered', group: 'Finance', label: 'Bond amount required', paths: ['application.finance.requestedBondAmount'] },
  { key: 'finance_type', group: 'Finance', label: 'Finance type', paths: ['application.finance.financeType'] },
  { key: 'primary_first_name', group: 'Primary Applicant', label: 'First name', paths: ['participants.primaryApplicant.personal.first_name'] },
  { key: 'primary_surname', group: 'Primary Applicant', label: 'Surname', paths: ['participants.primaryApplicant.personal.surname', 'participants.primaryApplicant.personal.last_name'] },
  { key: 'primary_identity_number', group: 'Primary Applicant', label: 'Identity number', paths: ['participants.primaryApplicant.personal.identity_number', 'participants.primaryApplicant.personal.id_number'] },
  { key: 'primary_email', group: 'Primary Applicant', label: 'Email', paths: ['participants.primaryApplicant.contact.email', 'participants.primaryApplicant.personal.email'] },
  { key: 'primary_phone', group: 'Primary Applicant', label: 'Phone', paths: ['participants.primaryApplicant.contact.phone', 'participants.primaryApplicant.personal.phone'] },
  { key: 'primary_marital_status', group: 'Primary Applicant', label: 'Marital status', paths: ['participants.primaryApplicant.marital.maritalStatus', 'participants.primaryApplicant.personal.marital_status'] },
  { key: 'primary_dependants', group: 'Primary Applicant', label: 'Dependants', paths: ['participants.primaryApplicant.personal.number_of_dependants', 'participants.primaryApplicant.personal.dependants'] },
  { key: 'residential_address_street', group: 'Contact & Address', label: 'Residential address', paths: ['participants.primaryApplicant.address.residential_address_street'] },
  { key: 'residential_address_suburb', group: 'Contact & Address', label: 'Residential suburb', paths: ['participants.primaryApplicant.address.residential_address_suburb'] },
  { key: 'residential_address_city', group: 'Contact & Address', label: 'Residential city', paths: ['participants.primaryApplicant.address.residential_address_city'] },
  { key: 'residential_address_postal_code', group: 'Contact & Address', label: 'Residential postal code', paths: ['participants.primaryApplicant.address.residential_address_postal_code'] },
  { key: 'occupation_status', group: 'Employment', label: 'Occupation status', paths: ['participants.primaryApplicant.employment.occupation_status'] },
  { key: 'employer_name', group: 'Employment', label: 'Employer name', paths: ['participants.primaryApplicant.employment.employer_name'] },
  { key: 'nature_of_occupation', group: 'Employment', label: 'Nature of occupation', paths: ['participants.primaryApplicant.employment.nature_of_occupation'] },
  { key: 'employment_years', group: 'Employment', label: 'Employment years', paths: ['participants.primaryApplicant.employment.employment_years'] },
  { key: 'employment_months', group: 'Employment', label: 'Employment months', paths: ['participants.primaryApplicant.employment.employment_months'] },
  { key: 'gross_salary', group: 'Income & Expenses', label: 'Gross salary', paths: ['participants.primaryApplicant.expenses.gross_salary'] },
  { key: 'rental_income', group: 'Income & Expenses', label: 'Rental income', paths: ['participants.primaryApplicant.expenses.rental_income'] },
  { key: 'other_income_value', group: 'Income & Expenses', label: 'Other income', paths: ['participants.primaryApplicant.expenses.other_income_value'] },
  { key: 'rental_expense', group: 'Income & Expenses', label: 'Rental expense', paths: ['participants.primaryApplicant.expenses.rental_expense'] },
  { key: 'groceries', group: 'Income & Expenses', label: 'Groceries', paths: ['participants.primaryApplicant.expenses.groceries'] },
  { key: 'transport', group: 'Income & Expenses', label: 'Transport', paths: ['participants.primaryApplicant.expenses.transport'] },
  { key: 'primary_bank_name', group: 'Banking & Liabilities', label: 'Primary bank', paths: ['participants.primaryApplicant.bankAccounts.0.bankName'] },
  { key: 'primary_account_type', group: 'Banking & Liabilities', label: 'Account type', paths: ['participants.primaryApplicant.bankAccounts.0.accountType'] },
  { key: 'primary_account_number', group: 'Banking & Liabilities', label: 'Account number', paths: ['participants.primaryApplicant.bankAccounts.0.accountNumber'] },
  { key: 'home_loan_1_outstanding_balance', group: 'Banking & Liabilities', label: 'Home loan outstanding balance', paths: ['participants.primaryApplicant.debts.0.outstandingBalance'] },
  { key: 'other_finance_1_current_balance', group: 'Banking & Liabilities', label: 'Other finance balance', paths: ['participants.primaryApplicant.debts.1.currentBalance'] },
  {
    key: 'total_assets',
    group: 'Assets & Liabilities',
    label: 'Total assets',
    paths: ['compatibility.legacyBase.assets_liabilities.total_assets'],
    derive: (state) => derivedAssetTotal(state),
  },
  {
    key: 'total_liabilities',
    group: 'Assets & Liabilities',
    label: 'Total liabilities',
    paths: ['compatibility.legacyBase.assets_liabilities.total_liabilities'],
    derive: (state) => derivedLiabilityTotal(state),
  },
  {
    key: 'net_asset_value',
    group: 'Assets & Liabilities',
    label: 'Net asset value',
    paths: ['compatibility.legacyBase.assets_liabilities.net_asset_value'],
    derive: (state) => {
      const assets = number(derivedAssetTotal(state))
      const liabilities = number(derivedLiabilityTotal(state))
      return assets || liabilities ? String(assets - liabilities) : null
    },
  },
  { key: 'currently_under_debt_review', group: 'Credit History', label: 'Currently under debt review', paths: ['participants.primaryApplicant.credit.currently_under_debt_review'] },
  { key: 'judgments_taken', group: 'Credit History', label: 'Judgments taken', paths: ['participants.primaryApplicant.credit.judgments_taken'] },
  { key: 'loan_processing_consent', group: 'Declarations', label: 'Loan processing consent', paths: ['legacySubmission.consents.declarations_consents.loan_processing_consent', 'participants.primaryApplicant.declarations.loan_processing_consent'] },
  { key: 'credit_bureau_fraud_bank_data_consent', group: 'Declarations', label: 'Credit bureau consent', paths: ['legacySubmission.consents.declarations_consents.credit_bureau_fraud_bank_data_consent', 'participants.primaryApplicant.declarations.credit_bureau_fraud_bank_data_consent'] },
  { key: 'declaration_accepted', group: 'Declarations', label: 'Declaration accepted', paths: ['legacySubmission.consents.declarations_consents.declaration_accepted', 'participants.primaryApplicant.declarations.declaration_accepted'] },
  { key: 'digital_signature_name', group: 'Declarations', label: 'Digital signature name', paths: ['legacySubmission.typedSignatureName'] },
  { key: 'digital_signature_date', group: 'Declarations', label: 'Digital signature date', paths: ['legacySubmission.typedSignatureDate'] },
]

function buildOriginatorFieldAlignment(applicationState = {}) {
  const fields = ORIGINATOR_FIELD_ALIGNMENT_DEFINITIONS.map((definition) => {
    const sourceValue = firstAlignmentValue(...definition.paths.map((path) => getNested(applicationState, [path])))
    const value = firstAlignmentValue(sourceValue, typeof definition.derive === 'function' ? definition.derive(applicationState) : null)
    const captured = alignmentValueCaptured(value)
    return {
      key: definition.key,
      group: definition.group,
      label: definition.label,
      sourcePaths: definition.paths,
      value: captured ? value : null,
      displayValue: captured ? alignmentDisplayValue(value) : 'Not captured',
      captured,
    }
  })
  const sections = fields.reduce((accumulator, field) => {
    const current = accumulator[field.group] || { total: 0, captured: 0, missing: 0 }
    current.total += 1
    if (field.captured) current.captured += 1
    else current.missing += 1
    accumulator[field.group] = current
    return accumulator
  }, {})

  return {
    source: 'buyer_portal_bond_application',
    target: 'bond_originator_view_model',
    fields,
    sections,
    capturedCount: fields.filter((field) => field.captured).length,
    totalCount: fields.length,
    missingKeys: fields.filter((field) => !field.captured).map((field) => field.key),
  }
}

function getSupportedBuyerConfirmationSections() {
  const sections = new Map()
  for (const card of BOND_APPLICATION_PREFILL_CONFIRMATION_CARD_DEFINITIONS) {
    const key = text(card.section)
    if (!key || sections.has(key)) continue
    sections.set(key, {
      key,
      label: toTitle(key),
      cardKeys: [card.key],
    })
  }
  return Array.from(sections.values())
}

function resolveBondApplicationPrefillMetadata({
  bondApplication = null,
  onboardingFormData = {},
} = {}) {
  const formData = getFormData(onboardingFormData)
  const candidates = [
    bondApplication?.prefill_metadata,
    bondApplication?.prefillMetadata,
    bondApplication?.metadata?.prefill_metadata,
    bondApplication?.metadata?.prefillMetadata,
    bondApplication?.meta?.prefill_metadata,
    bondApplication?.meta?.prefillMetadata,
    bondApplication?.bond_application?.prefill_metadata,
    bondApplication?.bondApplication?.prefill_metadata,
    formData?.bond_application?.prefill_metadata,
    formData?.bondApplication?.prefill_metadata,
    formData?.prefill_metadata,
  ]
  return candidates.find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate)) || {}
}

function latestTimestamp(values = []) {
  return values
    .filter(Boolean)
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((left, right) => right.time - left.time)[0]?.value || ''
}

function buildBuyerConfirmationConfidence(data = {}, originatorFieldAlignment = {}) {
  const metadata = resolveBondApplicationPrefillMetadata(data)
  const confirmations = metadata?.confirmations && typeof metadata.confirmations === 'object' ? metadata.confirmations : {}
  const confirmationSections = confirmations.sections && typeof confirmations.sections === 'object' && !Array.isArray(confirmations.sections)
    ? confirmations.sections
    : {}
  const review = buildBondApplicationPrefillReviewModel(metadata)
  const supportedSections = getSupportedBuyerConfirmationSections()
  const supportedSectionKeys = supportedSections.map((section) => section.key)
  const supportedSectionByKey = new Map(supportedSections.map((section) => [section.key, section]))
  const confirmedSectionKeys = Array.from(new Set([
    ...(Array.isArray(confirmations.confirmedSectionKeys) ? confirmations.confirmedSectionKeys : []),
    ...(Array.isArray(review.confirmedSectionKeys) ? review.confirmedSectionKeys : []),
  ].map((key) => text(key)).filter((key) => supportedSectionByKey.has(key))))
  const confirmedSectionSet = new Set(confirmedSectionKeys)
  const sections = confirmedSectionKeys.map((key) => {
    const confirmation = confirmationSections[key] || {}
    const supportedSection = supportedSectionByKey.get(key) || { key, label: toTitle(key), cardKeys: [] }
    return {
      key,
      label: supportedSection.label,
      confidence: confirmation.confidence || review.confirmationConfidenceBySection?.[key] || 'buyer_confirmed_prefill',
      confirmedAt: confirmation.confirmedAt || '',
      updatedAt: confirmation.updatedAt || '',
      confirmedFields: Number(confirmation.confirmedFields || 0),
      totalFields: Number(confirmation.totalFields || 0),
      missingFields: Number(confirmation.missingFields || 0),
      fieldPaths: Array.isArray(confirmation.fieldPaths) ? confirmation.fieldPaths : [],
      cardKeys: Array.isArray(confirmation.cardKeys) && confirmation.cardKeys.length ? confirmation.cardKeys : supportedSection.cardKeys,
    }
  })
  const missingSections = supportedSections
    .filter((section) => !confirmedSectionSet.has(section.key))
    .map((section) => ({
      key: section.key,
      label: section.label,
    }))
  const confirmedCount = sections.length
  const totalSupportedSections = supportedSections.length
  const percent = totalSupportedSections ? Math.round((confirmedCount / totalSupportedSections) * 100) : 0
  const fieldAlignmentPercent = originatorFieldAlignment?.totalCount
    ? Math.round((Number(originatorFieldAlignment.capturedCount || 0) / Number(originatorFieldAlignment.totalCount || 1)) * 100)
    : 0

  return {
    source: 'buyer_portal_prefill_confirmation_metadata',
    target: 'bond_originator_view_model',
    version: confirmations.version || '',
    hasMetadata: Boolean(confirmations.version || sections.length),
    confirmedCount,
    totalSupportedSections,
    percent,
    fieldAlignmentPercent,
    confidenceLevel: confirmedCount === totalSupportedSections && totalSupportedSections > 0 ? 'high' : confirmedCount > 0 ? 'partial' : 'none',
    summary: confirmedCount
      ? `${confirmedCount} of ${totalSupportedSections} buyer sections confirmed`
      : 'No buyer confirmation metadata yet',
    sections,
    confirmedSectionKeys: sections.map((section) => section.key),
    missingSections,
    missingSectionKeys: missingSections.map((section) => section.key),
    supportedSectionKeys,
    lastConfirmedAt: latestTimestamp(sections.map((section) => section.confirmedAt || section.updatedAt)),
  }
}

function buildOriginatorReviewWorkspace({
  readinessPercent = 0,
  fieldAlignment = {},
  buyerConfirmationConfidence = {},
  readinessItems = [],
  documents = [],
  actions = [],
} = {}) {
  const fieldAlignmentPercent = fieldAlignment?.totalCount
    ? Math.round((Number(fieldAlignment.capturedCount || 0) / Number(fieldAlignment.totalCount || 1)) * 100)
    : 0
  const confirmationPercent = Number(buyerConfirmationConfidence?.percent || 0)
  const score = Math.round((Number(readinessPercent || 0) * 0.4) + (fieldAlignmentPercent * 0.4) + (confirmationPercent * 0.2))
  const missingFields = (Array.isArray(fieldAlignment.fields) ? fieldAlignment.fields : [])
    .filter((field) => !field?.captured)
    .map((field) => ({
      key: field.key,
      label: field.label || field.key,
      group: field.group || 'Application',
      action: `Request ${field.label || field.key}`,
      type: 'missing_originator_field',
      priority: ['Declarations', 'Primary Applicant', 'Finance', 'Property'].includes(field.group) ? 'High' : 'Medium',
    }))
  const unconfirmedSections = (Array.isArray(buyerConfirmationConfidence.missingSections) ? buyerConfirmationConfidence.missingSections : [])
    .map((section) => ({
      key: section.key,
      label: section.label || toTitle(section.key),
      action: `Confirm ${section.label || toTitle(section.key)}`,
      type: 'unconfirmed_buyer_section',
      priority: 'Medium',
    }))
  const outstandingReadinessItems = (Array.isArray(readinessItems) ? readinessItems : [])
    .filter((item) => !item?.complete)
    .map((item) => ({
      key: item.key,
      label: item.label,
      action: `Complete ${item.label}`,
      type: 'readiness_blocker',
      priority: ['incomeProof', 'bankStatement', 'consent', 'idDocument'].includes(item.key) ? 'High' : 'Medium',
    }))
  const documentBlockers = (Array.isArray(documents) ? documents : [])
    .filter((document) => !document?.isUploaded)
    .map((document) => ({
      key: document.key,
      label: document.label,
      action: `Upload ${document.label}`,
      type: 'document_blocker',
      priority: ['idDocument', 'incomeProof', 'bankStatement'].includes(document.key) ? 'High' : 'Medium',
    }))
  const workflowActions = (Array.isArray(actions) ? actions : [])
    .map((item) => ({
      key: item.id || item.key,
      label: item.title || item.label,
      action: item.title || item.label,
      type: 'workflow_action',
      priority: item.priority || 'Medium',
    }))
  const missingOriginatorActions = [
    ...missingFields.slice(0, 8),
    ...unconfirmedSections.slice(0, 4),
    ...outstandingReadinessItems.slice(0, 5),
    ...workflowActions.slice(0, 5),
  ].slice(0, 12)
  const sections = Object.entries(fieldAlignment.sections || {})
    .map(([label, summary]) => ({
      key: label,
      label,
      captured: Number(summary?.captured || 0),
      total: Number(summary?.total || 0),
      missing: Number(summary?.missing || 0),
      status: Number(summary?.missing || 0) ? 'needs_data' : 'aligned',
    }))
    .filter((section) => section.total > 0)

  return {
    version: 'phase-15-v1',
    source: 'buyer_portal_originator_review_workspace',
    target: 'bond_originator_workspace',
    score,
    scoreLabel: score >= 85 ? 'Originator Ready' : score >= 65 ? 'Review Required' : 'Data Gaps',
    readinessPercent: Number(readinessPercent || 0),
    fieldAlignmentPercent,
    confirmationPercent,
    buyerConfirmedSections: Array.isArray(buyerConfirmationConfidence.sections) ? buyerConfirmationConfidence.sections : [],
    systemPrefilledSections: sections,
    missingOriginatorFields: missingFields,
    unconfirmedBuyerSections: unconfirmedSections,
    outstandingReadinessItems,
    documentBlockers,
    missingOriginatorActions,
    sourceBuckets: [
      {
        key: 'buyer_confirmed',
        label: 'Buyer-confirmed',
        count: Number(buyerConfirmationConfidence.confirmedCount || 0),
        total: Number(buyerConfirmationConfidence.totalSupportedSections || 0),
        percent: confirmationPercent,
      },
      {
        key: 'system_prefilled',
        label: 'System-prefilled',
        count: Number(fieldAlignment.capturedCount || 0),
        total: Number(fieldAlignment.totalCount || 0),
        percent: fieldAlignmentPercent,
      },
      {
        key: 'missing_data',
        label: 'Missing data',
        count: missingFields.length + documentBlockers.length + outstandingReadinessItems.length,
        total: Number(fieldAlignment.totalCount || 0) + documents.length + readinessItems.length,
        percent: fieldAlignment.totalCount ? Math.max(0, 100 - fieldAlignmentPercent) : 0,
      },
    ],
    handoffWarnings: [
      missingFields.length ? `${missingFields.length} originator fields missing` : '',
      unconfirmedSections.length ? `${unconfirmedSections.length} buyer sections unconfirmed` : '',
      documentBlockers.length ? `${documentBlockers.length} supporting documents missing` : '',
    ].filter(Boolean),
    recommendedAction: missingFields.length
      ? 'Resolve missing originator fields before bank submission.'
      : unconfirmedSections.length
        ? 'Review unconfirmed buyer sections before handoff.'
        : documentBlockers.length
          ? 'Collect outstanding documents before submission.'
          : 'Application is ready for originator review.',
  }
}

function toTitle(value) {
  return text(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function initialsFor(name) {
  const words = text(name).split(/\s+/).filter(Boolean)
  if (!words.length) return 'BA'
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')
}

function normalizeStatusLabel(value, fallback = 'Onboarding Pending') {
  const label = toTitle(value || fallback)
  if (/ready/i.test(label)) return 'Ready for Submission'
  if (/submit/i.test(label) && /bank/i.test(label)) return 'Submitted to Banks'
  if (/review/i.test(label)) return 'In Review'
  if (/complete/i.test(label)) return 'Ready for Submission'
  if (/pending|progress/i.test(label)) return 'Onboarding Pending'
  return label || fallback
}

function getDocumentSearchText(document = {}) {
  return [
    document.displayName,
    document.name,
    document.categoryLabel,
    document.category,
    document.requiredDocumentKey,
    document.requiredDocumentCanonicalId,
    document.requiredDocument?.key,
    document.requiredDocument?.label,
    document.requiredDocument?.documentLabel,
    document.requiredDocument?.document_label,
    document.raw?.document_type,
  ].map((value) => String(value || '').toLowerCase()).join(' ')
}

function isDocumentUploaded(document = {}) {
  const status = text(document.status || document.statusLabel || document.requiredDocumentStatus).toLowerCase()
  return Boolean(document.fileUrl || document.url || document.linkedDocument || COMPLETED_DOCUMENT_STATUSES.has(status))
}

function matchDocument(documents, keywords) {
  const normalized = keywords.map((keyword) => String(keyword || '').toLowerCase())
  const rows = documents.filter((document) => {
    const haystack = getDocumentSearchText(document)
    return normalized.some((keyword) => haystack.includes(keyword))
  })
  const uploaded = rows.filter(isDocumentUploaded)
  return {
    rows,
    uploaded,
    uploadedCount: uploaded.length,
    isUploaded: uploaded.length > 0,
    status: uploaded.length ? 'Uploaded' : rows.length ? 'Missing' : 'Missing',
  }
}

function buildDocumentTiles(documentRows = [], requiredDocumentRows = []) {
  const documents = [...documentRows, ...requiredDocumentRows].filter(Boolean)
  const tiles = [
    { key: 'idDocument', label: 'ID Document', keywords: ['id document', 'identity', 'id copy', 'fica'] },
    { key: 'proofOfResidence', label: 'Proof of Residence', keywords: ['proof of residence', 'residence', 'address'] },
    { key: 'consentForm', label: 'Consent Form', keywords: ['consent', 'declaration'] },
    { key: 'incomeProof', label: 'Payslip / Income Proof', keywords: ['payslip', 'income proof', 'proof of income', 'salary'] },
    { key: 'bankStatement', label: 'Bank Statement', keywords: ['bank statement', 'statements'] },
  ].map((tile) => ({ ...tile, ...matchDocument(documents, tile.keywords) }))

  const matchedIds = new Set(tiles.flatMap((tile) => tile.rows.map((row) => String(row.id || row.displayName || ''))))
  const additionalRows = documents.filter((row) => !matchedIds.has(String(row.id || row.displayName || '')) && isDocumentUploaded(row))
  tiles.push({
    key: 'additionalDocuments',
    label: 'Additional Docs',
    rows: additionalRows,
    uploaded: additionalRows,
    uploadedCount: additionalRows.length,
    isUploaded: additionalRows.length > 0,
    status: additionalRows.length ? `${additionalRows.length} Uploaded` : 'Missing',
  })

  return tiles
}

function getFormData(onboardingFormData = {}) {
  if (onboardingFormData?.formData && typeof onboardingFormData.formData === 'object') return onboardingFormData.formData
  if (onboardingFormData?.form_data && typeof onboardingFormData.form_data === 'object') return onboardingFormData.form_data
  return onboardingFormData && typeof onboardingFormData === 'object' ? onboardingFormData : {}
}

function isLegacyBondApplicationShape(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.bond_application && typeof value.bond_application === 'object') return false
  return Boolean(value.summary || value.personal_details || value.contact_address || value.loan_details || Array.isArray(value.applicants))
}

function resolveCanonicalApplicationState({
  transaction = {},
  buyer = {},
  development = {},
  unit = {},
  onboarding = {},
  onboardingFormData = {},
  bondApplication = null,
} = {}) {
  if (
    bondApplication?.storageMode ||
    bondApplication?.sharedSections ||
    bondApplication?.participantSections ||
    Array.isArray(bondApplication?.participants)
  ) {
    return {
      state: buildApplicationStateFromNormalizedApplication(bondApplication),
      storageMode: bondApplication.storageMode || 'normalized_v1',
      normalizedApplicationId: bondApplication.id || null,
    }
  }

  const formData = getFormData(onboardingFormData)
  const effectiveFormData = isLegacyBondApplicationShape(formData)
    ? { ...formData, bond_application: formData }
    : formData
  return {
    state: buildLegacyBondApplicationState({
      transaction,
      buyer,
      development,
      unit,
      onboarding,
      onboardingFormData: {
        ...(onboardingFormData || {}),
        formData: effectiveFormData,
      },
    }),
    storageMode: 'legacy_projection',
    normalizedApplicationId: null,
  }
}

function sumListAmounts(rows = [], paths = []) {
  return (rows || []).reduce((total, rowItem) => total + number(valueFrom(...paths.map((path) => getNested(rowItem, [path])))), 0)
}

function sumExpenseFields(expenses = {}) {
  const explicitTotal = number(valueFrom(expenses.total_expenses, expenses.totalExpenses))
  if (explicitTotal) return explicitTotal
  return [
    'maintenance_amount',
    'rental_expense',
    'groceries',
    'transport',
    'medical_aid',
    'education',
    'insurance',
    'utilities',
  ].reduce((total, key) => total + number(expenses?.[key]), 0)
}

function participantDisplayName(participant = {}, fallback = '') {
  const personal = participant.personal || {}
  const contact = participant.contact || {}
  return text(valueFrom(
    personal.fullName,
    personal.full_name,
    contact.displayName,
    contact.display_name,
    [personal.first_name || personal.firstName, personal.last_name || personal.surname || personal.lastName].filter(Boolean).join(' '),
    fallback,
  )) || 'Applicant not captured'
}

function formatEmploymentDuration(years, months, fallback = '') {
  const yearCount = number(years)
  const monthCount = number(months)
  if (!yearCount && !monthCount) return text(fallback) || 'Not captured'
  const parts = []
  if (yearCount) parts.push(`${yearCount} year${yearCount === 1 ? '' : 's'}`)
  if (monthCount) parts.push(`${monthCount} month${monthCount === 1 ? '' : 's'}`)
  return parts.join(' ')
}

function buildApplicantViewModel(participant = {}, role = 'primary_applicant', fallbackName = '') {
  const personal = participant.personal || {}
  const contact = participant.contact || {}
  const marital = participant.marital || {}
  const employment = participant.employment || {}
  const expenses = participant.expenses || {}
  const bankAccounts = Array.isArray(participant.bankAccounts) ? participant.bankAccounts : []
  const assets = Array.isArray(participant.assets) ? participant.assets : []
  const liabilities = Array.isArray(participant.liabilities) ? participant.liabilities : []
  const debts = Array.isArray(participant.debts) ? participant.debts : []
  const incomeSources = Array.isArray(participant.incomeSources) ? participant.incomeSources : []
  const monthlyCommitments = Array.isArray(participant.monthlyCommitments) ? participant.monthlyCommitments : []
  const grossIncome = number(valueFrom(employment.gross_salary, employment.grossMonthlyIncome, employment.gross_monthly_income, employment.monthly_income, employment.monthlyIncome))
  const otherIncome = sumListAmounts(incomeSources, ['monthlyAmount', 'monthly_amount', 'amount'])
  const totalIncome = number(valueFrom(employment.total_income, employment.totalIncome)) || grossIncome + otherIncome
  const monthlyExpenses = sumExpenseFields(expenses)
  const monthlyCommitmentTotal = sumListAmounts(monthlyCommitments, ['monthlyAmount', 'monthly_amount', 'amount'])
  const debtTotal = sumListAmounts(debts, ['outstandingBalance', 'outstanding_balance', 'currentBalance', 'current_balance'])
  const liabilitySummary = participantLiabilitySummary(liabilities)
  const liabilityTotal = liabilitySummary.total
  const assetTotal = sumListAmounts(assets, ['value', 'amount'])
  const existingDebt = liabilitySummary.explicitTotal || debtTotal + liabilitySummary.itemizedTotal
  const name = participantDisplayName(participant, fallbackName)

  return {
    role,
    roleLabel: role === 'co_applicant' ? 'Co-applicant' : role === 'surety' ? 'Surety' : 'Primary applicant',
    fullName: name,
    initials: initialsFor(name),
    idNumber: text(valueFrom(personal.id_number, personal.idNumber, personal.identity_number, personal.passport_number, personal.passportNumber)) || 'Not captured',
    email: text(valueFrom(contact.email_address, contact.email, personal.email)) || 'Not captured',
    phone: text(valueFrom(contact.cellphone_number, contact.phone, contact.mobile, personal.phone)) || 'Not captured',
    maritalStatus: text(valueFrom(marital.marital_status, marital.maritalStatus, personal.marital_status, personal.maritalStatus)) || 'Not captured',
    dependants: text(valueFrom(personal.number_of_dependants, personal.numberOfDependants, personal.dependants, marital.dependants)) || 'Not captured',
    employmentStatus: text(valueFrom(employment.occupation_status, employment.employment_status, employment.employmentStatus)) || 'Not captured',
    employer: text(valueFrom(employment.employer_name, employment.employerName, employment.employer)) || 'Not captured',
    occupation: text(valueFrom(employment.nature_of_occupation, employment.occupation, employment.occupational_level)) || 'Not captured',
    employmentDuration: formatEmploymentDuration(
      valueFrom(employment.employment_years, employment.employmentYears),
      valueFrom(employment.employment_months, employment.employmentMonths),
      valueFrom(employment.employment_duration, employment.employmentDuration),
    ),
    banking: {
      accountCount: bankAccounts.length,
      primaryBank: text(valueFrom(bankAccounts[0]?.bankName, bankAccounts[0]?.bank_name, bankAccounts[0]?.bank)) || 'Not captured',
    },
    financials: {
      grossIncome: { raw: grossIncome, display: formatCurrency(grossIncome) },
      otherIncome: { raw: otherIncome, display: formatCurrency(otherIncome) },
      totalIncome: { raw: totalIncome, display: formatCurrency(totalIncome) },
      monthlyExpenses: { raw: monthlyExpenses, display: formatCurrency(monthlyExpenses) },
      monthlyCommitments: { raw: monthlyCommitmentTotal, display: formatCurrency(monthlyCommitmentTotal) },
      existingDebt: { raw: existingDebt, display: formatCurrency(existingDebt) },
      assets: { raw: assetTotal, display: formatCurrency(assetTotal) },
      disposableIncome: {
        raw: Math.max(0, totalIncome - monthlyExpenses - monthlyCommitmentTotal),
        display: formatCurrency(Math.max(0, totalIncome - monthlyExpenses - monthlyCommitmentTotal)),
      },
    },
    declarations: participant.declarations || {},
  }
}

function buildReadinessItems({ applicant, property, financials, documents, consentCaptured }) {
  return [
    { key: 'applicant', label: 'Applicant details', complete: Boolean(applicant.fullName && applicant.fullName !== 'Applicant not captured') },
    { key: 'contact', label: 'Contact details', complete: Boolean(applicant.email !== 'Not captured' || applicant.phone !== 'Not captured') },
    { key: 'property', label: 'Property information', complete: Boolean(property.label && property.label !== 'Property not captured') },
    { key: 'purchasePrice', label: 'Purchase price', complete: financials.purchasePrice.raw > 0 },
    { key: 'consent', label: 'Consent form', complete: consentCaptured || documents.find((item) => item.key === 'consentForm')?.isUploaded },
    { key: 'idDocument', label: 'ID Document', complete: documents.find((item) => item.key === 'idDocument')?.isUploaded },
    { key: 'proofOfResidence', label: 'Proof of Residence', complete: documents.find((item) => item.key === 'proofOfResidence')?.isUploaded },
    { key: 'incomeProof', label: 'Payslip / Income Proof', complete: documents.find((item) => item.key === 'incomeProof')?.isUploaded },
    { key: 'bankStatement', label: 'Latest Bank Statement', complete: documents.find((item) => item.key === 'bankStatement')?.isUploaded },
  ]
}

function classifyReadiness(percent) {
  if (percent >= 85) return { label: 'Ready for Submission', tone: 'success' }
  if (percent >= 65) return { label: 'Almost Ready', tone: 'warning' }
  return { label: 'Not Ready', tone: 'danger' }
}

function buildActions(readinessItems, financials) {
  const missing = readinessItems.filter((item) => !item.complete)
  const actions = missing.map((item) => {
    const high = ['incomeProof', 'bankStatement', 'consent', 'idDocument'].includes(item.key)
    return {
      id: item.key,
      title: item.key === 'incomeProof' ? 'Upload Payslip / Income Proof' : item.key === 'bankStatement' ? 'Upload Latest Bank Statement' : `Complete ${item.label}`,
      description: item.key === 'incomeProof'
        ? 'Required to verify income'
        : item.key === 'bankStatement'
          ? 'Latest 3 months required'
          : 'Required before bank submission',
      priority: high ? 'High' : 'Medium',
      target: ['incomeProof', 'bankStatement', 'idDocument', 'proofOfResidence', 'consent'].includes(item.key) ? 'documents' : 'application',
    }
  })

  if (financials.monthlyExpenses.raw <= 0) {
    actions.push({
      id: 'monthly-expenses',
      title: 'Review Monthly Expenses',
      description: 'Please verify expense details',
      priority: 'Medium',
      target: 'application',
    })
  }

  return actions.slice(0, 5)
}

function buildRisk({ readinessPercent, transaction, onboardingFormData, financials, documents }) {
  const explicit = text(
    transaction?.risk_status ||
      transaction?.compliance_status ||
      onboardingFormData?.riskStatus ||
      onboardingFormData?.risk_status ||
      onboardingFormData?.affordabilityRisk ||
      onboardingFormData?.affordability_risk,
  )
  const explicitScore = number(transaction?.risk_score || onboardingFormData?.riskScore || onboardingFormData?.risk_score)
  const score = explicitScore || readinessPercent
  const lower = explicit.toLowerCase()
  const ratio = financials.expenseRatio.raw
  const missingIncome = !documents.find((item) => item.key === 'incomeProof')?.isUploaded
  const missingBank = !documents.find((item) => item.key === 'bankStatement')?.isUploaded
  const missingConsent = !documents.find((item) => item.key === 'consentForm')?.isUploaded
  const factors = [
    missingIncome ? 'Missing income proof' : '',
    ratio >= 40 ? 'Debt-to-income ratio elevated' : '',
    financials.deposit.raw <= 0 ? 'Deposit not confirmed' : '',
    missingConsent ? 'Consent not captured' : '',
    missingBank ? 'Bank statements missing' : '',
  ].filter(Boolean)

  let level = 'Incomplete'
  if (lower.includes('low')) level = 'Low Risk'
  else if (lower.includes('medium') || lower.includes('review')) level = 'Medium Risk'
  else if (lower.includes('high') || lower.includes('at risk') || lower.includes('blocked')) level = 'At Risk'
  else if (readinessPercent >= 85 && factors.length <= 1) level = 'Low Risk'
  else if (readinessPercent >= 65) level = 'Medium Risk'
  else if (readinessPercent > 0) level = 'At Risk'

  const recommendation = missingIncome
    ? 'Request updated payslip before bank submission.'
    : financials.deposit.raw <= 0
      ? 'Confirm deposit source before submission.'
      : ratio >= 40
        ? 'Review affordability before sending to banks.'
        : 'Application is tracking toward bank submission.'

  return {
    level,
    score,
    scoreLabel: explicitScore ? 'Risk Score' : 'Preliminary Risk View',
    factors: factors.length ? factors : ['No major risk factors detected'],
    recommendation,
    tone: level === 'Low Risk' ? 'success' : level === 'Medium Risk' ? 'warning' : level === 'At Risk' ? 'danger' : 'neutral',
  }
}

function buildActivity({ activityFeed = [], transaction, onboarding, documents }) {
  const mapped = activityFeed.slice(0, 4).map((entry, index) => ({
    id: entry.id || `activity-${index}`,
    title: entry.title || entry.type || 'Application update',
    description: entry.body || entry.description || '',
    createdAt: entry.createdAt || entry.created_at || entry.updatedAt || '',
    displayDate: formatDateTime(entry.createdAt || entry.created_at || entry.updatedAt || ''),
  }))

  if (mapped.length) return mapped

  return [
    transaction?.created_at
      ? { id: 'created', title: 'Application created', description: '', createdAt: transaction.created_at, displayDate: formatDateTime(transaction.created_at) }
      : null,
    onboarding?.created_at || onboarding?.updated_at
      ? { id: 'onboarding', title: 'Onboarding started', description: '', createdAt: onboarding.updated_at || onboarding.created_at, displayDate: formatDateTime(onboarding.updated_at || onboarding.created_at) }
      : null,
    documents?.some((item) => item.isUploaded)
      ? { id: 'documents', title: `Documents uploaded (${documents.filter((item) => item.isUploaded).length}/${documents.length})`, description: '', createdAt: '', displayDate: 'Recent' }
      : null,
  ].filter(Boolean)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function row(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || 'Not captured')}</td></tr>`
}

export function buildBondApplicationViewModel({
  transaction = {},
  buyer = {},
  development = {},
  unit = {},
  onboarding = {},
  onboardingFormData = {},
  bondApplication = null,
  documentRows = [],
  requiredDocumentRows = [],
  documentReadiness = {},
  activityFeed = [],
  reference = '',
  statusLabel = '',
  assignedConsultant = '',
} = {}) {
  const data = { transaction, buyer, development, unit, onboarding, onboardingFormData, bondApplication }
  const canonical = resolveCanonicalApplicationState({
    transaction,
    buyer,
    development,
    unit,
    onboarding,
    onboardingFormData,
    bondApplication,
  })
  const applicationState = canonical.state || {}
  const fieldAlignment = buildOriginatorFieldAlignment(applicationState)
  const buyerConfirmationConfidence = buildBuyerConfirmationConfidence(data, fieldAlignment)
  const primaryApplicant = buildApplicantViewModel(
    applicationState?.participants?.primaryApplicant || {},
    'primary_applicant',
    buyer?.name || lookup(data, ['fullName', 'full_name', 'buyerName', 'buyer_name', 'clientName', 'client_name', 'name']),
  )
  const applicants = [
    primaryApplicant,
    applicationState?.participants?.coApplicant
      ? buildApplicantViewModel(applicationState.participants.coApplicant, 'co_applicant')
      : null,
    ...(Array.isArray(applicationState?.participants?.sureties)
      ? applicationState.participants.sureties.map((surety) => buildApplicantViewModel(surety, 'surety'))
      : []),
  ].filter(Boolean)
  const fullName = primaryApplicant.fullName
  const email = primaryApplicant.email
  const phone = primaryApplicant.phone
  const employmentStatus = primaryApplicant.employmentStatus

  const purchasePrice = number(valueFrom(
    applicationState?.application?.finance?.purchasePrice,
    applicationState?.application?.finance?.purchase_price,
    lookup(data, ['purchase_price', 'sales_price', 'purchasePrice', 'loan_details.purchase_price']),
    transaction?.purchase_price,
    transaction?.sales_price,
  ))
  const deposit = number(valueFrom(
    applicationState?.application?.finance?.depositAmount,
    applicationState?.application?.finance?.deposit_amount,
    lookup(data, ['deposit', 'deposit_amount', 'loan_details.deposit_amount']),
    transaction?.deposit_amount,
  ))
  const grossIncome = applicants.reduce((total, applicant) => total + number(applicant.financials.grossIncome.raw), 0) ||
    number(lookup(data, ['grossMonthlyIncome', 'gross_monthly_income', 'monthlyIncome', 'income_deductions_expenses.primary.gross_salary']))
  const monthlyExpenses = applicants.reduce((total, applicant) => total + number(applicant.financials.monthlyExpenses.raw), 0) ||
    number(lookup(data, ['monthlyExpenses', 'monthly_expenses', 'income_deductions_expenses.primary.total_expenses']))
  const existingDebt = applicants.reduce((total, applicant) => total + number(applicant.financials.existingDebt.raw), 0) ||
    number(lookup(data, ['existingDebt', 'existing_debt', 'assets_liabilities.total_liabilities']))
  const monthlyCommitments = applicants.reduce((total, applicant) => total + number(applicant.financials.monthlyCommitments.raw), 0)
  const totalIncome = applicants.reduce((total, applicant) => total + number(applicant.financials.totalIncome.raw), 0) || grossIncome
  const bondAmountRequired = number(valueFrom(
    applicationState?.application?.finance?.requestedBondAmount,
    applicationState?.application?.finance?.requested_bond_amount,
    lookup(data, ['bondAmount', 'bond_amount', 'amount_to_be_registered', 'loan_details.amount_to_be_registered']),
    transaction?.bond_amount,
    purchasePrice && deposit ? purchasePrice - deposit : 0,
  ))
  const depositPercent = purchasePrice && deposit ? Math.round((deposit / purchasePrice) * 1000) / 10 : 0
  const expenseRatio = grossIncome && monthlyExpenses ? Math.round((monthlyExpenses / grossIncome) * 1000) / 10 : 0

  const propertyLabel = text(valueFrom(
    applicationState?.application?.property?.propertyReference,
    applicationState?.application?.property?.property_reference,
    unit?.unit_number ? `${development?.name || 'Development'} • Unit ${unit.unit_number}` : '',
    transaction?.property_description,
    transaction?.property_address_line_1,
    onboardingFormData?.property,
    onboardingFormData?.propertyLabel,
    onboardingFormData?.loan_details?.street_or_complex,
  )) || 'Property not captured'
  const propertyImageUrl = text(valueFrom(
    unit?.image_url,
    unit?.cover_image_url,
    unit?.primary_image_url,
    development?.image_url,
    development?.cover_image_url,
    transaction?.property_image_url,
    transaction?.listing_image_url,
  ))
  const applicationStatus = normalizeStatusLabel(valueFrom(statusLabel, transaction?.bond_application_status, transaction?.status, onboarding?.status))
  const documents = buildDocumentTiles(documentRows, requiredDocumentRows)
  const consentCaptured = Boolean(valueFrom(
    primaryApplicant.declarations?.loan_processing_consent,
    primaryApplicant.declarations?.credit_bureau_fraud_bank_data_consent,
    primaryApplicant.declarations?.declaration_accepted,
    onboardingFormData?.creditConsent,
    onboardingFormData?.credit_consent,
    onboardingFormData?.declarations_consents?.loan_processing_consent,
    onboardingFormData?.declarations_consents?.credit_bureau_fraud_bank_data_consent,
    onboardingFormData?.declarations_consents?.declaration_accepted,
  ))
  const readinessItems = buildReadinessItems({
    applicant: { fullName, email, phone },
    property: { label: propertyLabel },
    financials: {
      purchasePrice: { raw: purchasePrice },
      monthlyExpenses: { raw: monthlyExpenses },
      deposit: { raw: deposit },
    },
    documents,
    consentCaptured,
  })
  const completedRequiredItems = readinessItems.filter((item) => item.complete).length
  const readinessPercent = readinessItems.length ? Math.round((completedRequiredItems / readinessItems.length) * 100) : 0
  const completionPercent = number(transaction?.completion_percent || onboardingFormData?.completionPercent || onboardingFormData?.completion_percent || documentReadiness?.score) || readinessPercent
  const readiness = classifyReadiness(readinessPercent)
  const applicationActions = buildActions(readinessItems, {
    monthlyExpenses: { raw: monthlyExpenses },
  })
  const originatorReviewWorkspace = buildOriginatorReviewWorkspace({
    readinessPercent,
    fieldAlignment,
    buyerConfirmationConfidence,
    readinessItems,
    documents,
    actions: applicationActions,
  })
  const risk = buildRisk({ readinessPercent, transaction, onboardingFormData, financials: { deposit: { raw: deposit }, expenseRatio: { raw: expenseRatio } }, documents })
  const disposableIncome = Math.max(0, totalIncome - monthlyExpenses - monthlyCommitments)
  const ltv = purchasePrice && bondAmountRequired ? Math.round((bondAmountRequired / purchasePrice) * 1000) / 10 : 0
  const primaryApplicantDetail = {
    idNumber: primaryApplicant.idNumber,
    maritalStatus: primaryApplicant.maritalStatus,
    dependants: primaryApplicant.dependants,
    employer: primaryApplicant.employer,
    occupation: primaryApplicant.occupation,
    employmentDuration: primaryApplicant.employmentDuration,
    otherIncome: applicants.reduce((total, applicant) => total + number(applicant.financials.otherIncome.raw), 0)
      ? formatCurrency(applicants.reduce((total, applicant) => total + number(applicant.financials.otherIncome.raw), 0))
      : 'Not captured',
    totalIncome: formatCurrency(totalIncome),
    disposableIncome: formatCurrency(disposableIncome),
    monthlyCommitments: formatCurrency(monthlyCommitments),
    ltv: ltv ? `${ltv}%` : 'Not captured',
    loanPurpose: text(valueFrom(applicationState?.application?.finance?.loanPurpose, applicationState?.application?.finance?.loan_purpose, lookup(data, ['loan_details.loan_purpose', 'loanPurpose', 'loan_purpose', 'purpose']))) || 'Not captured',
    preferredTerm: text(valueFrom(applicationState?.application?.finance?.preferredTerm, applicationState?.application?.finance?.preferred_term, lookup(data, ['loan_details.preferred_term', 'preferredTerm', 'preferred_term', 'loan_term_months', 'loanTermMonths']))) || 'Not captured',
  }

  return {
    canonical: {
      storageMode: canonical.storageMode,
      normalizedApplicationId: canonical.normalizedApplicationId,
      schemaVersion: applicationState?.schemaVersion || null,
      intent: applicationState?.application?.intent || 'bond_application',
      preApproval: applicationState?.application?.preApproval || null,
      applicantStructure: applicationState?.application?.applicantStructure || (applicants.length > 1 ? 'joint' : 'sole'),
      selectedBankIds: applicationState?.application?.selectedBankIds || [],
    },
    applicants,
    primaryApplicantDetail,
    applicant: {
      fullName,
      initials: initialsFor(fullName),
      email,
      phone,
      employmentStatus,
    },
    application: {
      id: text(reference || transaction?.bond_application_id || transaction?.bondApplicationId || transaction?.application_reference || transaction?.id) || 'Pending',
      intent: applicationState?.application?.intent || 'bond_application',
      preApproval: applicationState?.application?.preApproval || null,
      status: applicationStatus,
      stage: toTitle(transaction?.stage || transaction?.current_stage || onboarding?.status || 'Onboarding'),
      createdAt: transaction?.created_at || onboarding?.created_at || '',
      updatedAt: transaction?.updated_at || onboarding?.updated_at || '',
      createdAtDisplay: formatDate(transaction?.created_at || onboarding?.created_at || ''),
      updatedAtDisplay: formatDateTime(transaction?.updated_at || onboarding?.updated_at || ''),
      completionPercent,
      readinessPercent,
      readinessLabel: readiness.label,
      readinessTone: readiness.tone,
      onboardingStatus: applicationStatus,
    },
    property: {
      label: propertyLabel,
      developmentName: text(development?.name || onboardingFormData?.developmentName || onboardingFormData?.development_name) || 'Not captured',
      unitNumber: text(unit?.unit_number || onboardingFormData?.unitNumber || onboardingFormData?.unit_number) || 'Not captured',
      imageUrl: propertyImageUrl,
    },
    financials: {
      purchasePrice: { raw: purchasePrice, display: formatCurrency(purchasePrice) },
      deposit: { raw: deposit, display: formatCurrency(deposit), secondary: depositPercent ? `${depositPercent}%` : '' },
      grossIncome: { raw: grossIncome, display: formatCurrency(grossIncome) },
      monthlyExpenses: { raw: monthlyExpenses, display: formatCurrency(monthlyExpenses), secondary: expenseRatio ? `${expenseRatio}%` : '' },
      expenseRatio: { raw: expenseRatio, display: expenseRatio ? `${expenseRatio}%` : 'Not captured' },
      existingDebt: { raw: existingDebt, display: formatCurrency(existingDebt) },
      monthlyCommitments: { raw: monthlyCommitments, display: formatCurrency(monthlyCommitments) },
      totalIncome: { raw: totalIncome, display: formatCurrency(totalIncome) },
      disposableIncome: { raw: disposableIncome, display: formatCurrency(disposableIncome) },
      bondAmountRequired: { raw: bondAmountRequired, display: formatCurrency(bondAmountRequired) },
    },
    documents,
    readinessItems,
    actions: applicationActions,
    fieldAlignment,
    originatorFieldAlignment: fieldAlignment,
    buyerConfirmationConfidence,
    confirmationConfidence: buyerConfirmationConfidence,
    originatorReviewWorkspace,
    activity: buildActivity({ activityFeed, transaction, onboarding, documents }),
    risk,
    consultant: text(assignedConsultant) || 'Unassigned',
    generatedAt: new Date().toISOString(),
  }
}

export function getBondApplicationPdfFilename(viewModel) {
  const applicant = text(viewModel?.applicant?.fullName || 'bond-application')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const id = text(viewModel?.application?.id || 'pending')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `bond-application-${applicant || 'applicant'}-${id || 'pending'}.pdf`
}

export function buildBondApplicationPdfHtml(viewModel, generatedAt = new Date().toISOString(), options = {}) {
  const vm = viewModel || {}
  const summaryTitle = vm.application?.intent === 'pre_approval' ? 'Pre-approval Application Pack' : 'Bond Application Pack'
  const referringAgency = options.referringAgency || vm.referringAgency || {}
  const bondBrand = options.bondBrand || {}
  const bondBrandName = text(bondBrand.name || 'BetterBond')
  const referringAgencyName = text(referringAgency.name || 'Referring Agency')
  const applicantRows = (Array.isArray(vm.applicants) && vm.applicants.length ? vm.applicants : [vm.applicant || {}])
    .map((applicant, index) => {
      const financials = applicant.financials || {}
      return `
        <article class="section-card applicant-card">
          <div class="section-title-row">
            <h2>${escapeHtml(applicant.roleLabel || (index ? `Applicant ${index + 1}` : 'Primary Applicant'))}</h2>
            <span class="badge">${escapeHtml(applicant.fullName || vm.applicant?.fullName || 'Applicant not captured')}</span>
          </div>
          <div class="columns">
            <table><tbody>
              ${row('Full name', applicant.fullName || vm.applicant?.fullName)}
              ${row('ID / Passport', applicant.idNumber)}
              ${row('Email', applicant.email || vm.applicant?.email)}
              ${row('Phone', applicant.phone || vm.applicant?.phone)}
              ${row('Marital status', applicant.maritalStatus)}
              ${row('Dependants', applicant.dependants)}
            </tbody></table>
            <table><tbody>
              ${row('Employment status', applicant.employmentStatus || vm.applicant?.employmentStatus)}
              ${row('Employer', applicant.employer)}
              ${row('Occupation', applicant.occupation)}
              ${row('Employment duration', applicant.employmentDuration)}
              ${row('Primary bank', applicant.banking?.primaryBank)}
              ${row('Accounts captured', applicant.banking?.accountCount || 0)}
            </tbody></table>
          </div>
          <div class="mini-metrics">
            <div><span>Gross income</span><strong>${escapeHtml(financials.grossIncome?.display || 'Not captured')}</strong></div>
            <div><span>Other income</span><strong>${escapeHtml(financials.otherIncome?.display || 'Not captured')}</strong></div>
            <div><span>Expenses</span><strong>${escapeHtml(financials.monthlyExpenses?.display || 'Not captured')}</strong></div>
            <div><span>Commitments</span><strong>${escapeHtml(financials.monthlyCommitments?.display || 'Not captured')}</strong></div>
            <div><span>Existing debt</span><strong>${escapeHtml(financials.existingDebt?.display || 'Not captured')}</strong></div>
            <div><span>Disposable</span><strong>${escapeHtml(financials.disposableIncome?.display || 'Not captured')}</strong></div>
          </div>
        </article>
      `
    })
    .join('')
  const fieldAlignment = vm.originatorFieldAlignment || vm.fieldAlignment || {}
  const fieldAlignmentSections = Object.entries(fieldAlignment.sections || {})
    .map(([label, summary]) => ({
      label,
      total: Number(summary?.total || 0),
      captured: Number(summary?.captured || 0),
      missing: Number(summary?.missing || 0),
    }))
    .filter((section) => section.total > 0)
  const fieldAlignmentRows = fieldAlignmentSections
    .map((section) => row(section.label, `${section.captured}/${section.total} captured${section.missing ? `, ${section.missing} missing` : ''}`))
    .join('')
  const fieldAlignmentMissingRows = (Array.isArray(fieldAlignment.fields) ? fieldAlignment.fields : [])
    .filter((field) => !field?.captured)
    .slice(0, 10)
    .map((field) => row(field.label || field.key, 'Missing'))
    .join('')
  const fieldAlignmentPercent = fieldAlignment.totalCount
    ? Math.round((Number(fieldAlignment.capturedCount || 0) / Number(fieldAlignment.totalCount || 1)) * 100)
    : 0
  const buyerConfirmationConfidence = vm.buyerConfirmationConfidence || vm.confirmationConfidence || {}
  const buyerConfirmationSectionRows = (Array.isArray(buyerConfirmationConfidence.sections) ? buyerConfirmationConfidence.sections : [])
    .map((section) => row(
      section.label || section.key,
      `${section.confirmedFields || 0}/${section.totalFields || 0} fields · ${toTitle(section.confidence || 'buyer confirmed prefill')}`,
    ))
    .join('')
  const buyerConfirmationMissingRows = (Array.isArray(buyerConfirmationConfidence.missingSections) ? buyerConfirmationConfidence.missingSections : [])
    .map((section) => row(section.label || section.key, 'Not confirmed'))
    .join('')
  const originatorReviewWorkspace = vm.originatorReviewWorkspace || {}
  const originatorSourceBucketRows = (Array.isArray(originatorReviewWorkspace.sourceBuckets) ? originatorReviewWorkspace.sourceBuckets : [])
    .map((bucket) => row(bucket.label || bucket.key, `${bucket.count || 0}/${bucket.total || 0}${bucket.percent || bucket.percent === 0 ? ` (${bucket.percent}%)` : ''}`))
    .join('')
  const originatorActionRows = (Array.isArray(originatorReviewWorkspace.missingOriginatorActions) ? originatorReviewWorkspace.missingOriginatorActions : [])
    .slice(0, 10)
    .map((item) => row(item.label || item.key, `${item.priority || 'Medium'} priority - ${item.action || 'Review required'}`))
    .join('')
  const documentRows = (vm.documents || [])
    .map((item) => row(item.label, item.status || (item.isUploaded ? 'Uploaded' : 'Missing')))
    .join('')
  const readinessRows = (vm.readinessItems || [])
    .map((item) => row(item.label, item.complete ? 'Complete' : 'Outstanding'))
    .join('')
  const actionRows = (vm.actions || [])
    .map((item) => row(item.title, `${item.priority} priority - ${item.description}`))
    .join('')
  const factors = (vm.risk?.factors || []).map((factor) => `<li>${escapeHtml(factor)}</li>`).join('')
  const bondLogo = text(bondBrand.logoUrl)
    ? `<img class="brand-logo-img" src="${escapeHtml(bondBrand.logoUrl)}" crossorigin="anonymous" alt="${escapeHtml(bondBrandName)} logo" />`
    : `<span class="betterbond-mark" aria-hidden="true"><i></i><b></b></span><strong class="betterbond-word" aria-label="BetterBond"><span>Better</span>Bond</strong>`
  const referringAgencyLogo = text(referringAgency.logoUrl)
    ? `<img class="agency-logo-img" src="${escapeHtml(referringAgency.logoUrl)}" crossorigin="anonymous" alt="${escapeHtml(referringAgencyName)} logo" />`
    : `<span class="agency-initials">${escapeHtml(initialsFor(referringAgencyName))}</span>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(vm.application?.id || 'Bond Application')}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; color: #101827; font-family: Inter, Arial, Helvetica, sans-serif; }
    body { width: 794px; }
    .page { width: 794px; min-height: 1123px; background: #f4f7fb; }
    .page-inner { padding: 26px; }
    .cover { overflow: hidden; border: 1px solid #d8e2ee; border-radius: 18px; background: #ffffff; page-break-inside: avoid; }
    .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 18px 20px; border-bottom: 1px solid #e5edf5; }
    .bond-brand, .agency-brand { display: flex; align-items: center; min-width: 0; gap: 12px; }
    .agency-brand { justify-content: flex-end; text-align: right; }
    .brand-logo-img, .agency-logo-img { max-width: 156px; max-height: 58px; object-fit: contain; }
    .betterbond-mark { position: relative; display: inline-block; width: 48px; height: 38px; flex: 0 0 auto; }
    .betterbond-mark i, .betterbond-mark b { position: absolute; display: block; width: 29px; height: 29px; border: 6px solid #0f2f63; border-radius: 999px; content: ""; }
    .betterbond-mark i { left: 3px; top: 6px; }
    .betterbond-mark b { right: 3px; top: 1px; border-color: #e2202d; background: transparent; }
    .betterbond-word { display: block; color: #172e5e; font-size: 24px; line-height: 1; letter-spacing: -0.02em; }
    .betterbond-word span { font-weight: 900; }
    .agency-initials { display: inline-flex; width: 48px; height: 48px; align-items: center; justify-content: center; border-radius: 14px; background: #eef7f2; color: #08704f; font-size: 15px; font-weight: 900; }
    .agency-meta { min-width: 0; }
    .agency-meta span, .brand-caption { display: block; color: #60758d; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .agency-meta strong { display: block; max-width: 210px; overflow: hidden; color: #101827; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
    .hero { padding: 26px 28px 28px; color: #ffffff; background: linear-gradient(135deg, #003b34, #08704f 58%, #0f8f68); }
    h1 { margin: 0 0 10px; font-size: 30px; line-height: 1.08; letter-spacing: -0.02em; }
    h2 { margin: 0; color: #0d1b2f; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; }
    p { margin: 0; }
    .sub { max-width: 560px; color: #d9fbe6; font-size: 13px; line-height: 1.55; }
    .hero-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 18px; }
    .hero-stat { border: 1px solid rgba(255,255,255,.22); border-radius: 14px; padding: 11px 12px; background: rgba(255,255,255,.08); }
    .hero-stat span { display: block; margin-bottom: 4px; color: #b8f5cc; font-size: 9px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
    .hero-stat strong { display: block; color: #ffffff; font-size: 17px; line-height: 1.2; }
    .content { padding: 16px 0 0; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .two { grid-template-columns: 1fr 1fr; }
    .section-card { border: 1px solid #dfe8ef; border-radius: 16px; padding: 15px; background: #ffffff; page-break-inside: avoid; break-inside: avoid; }
    .card { border: 1px solid #dfe8ef; border-radius: 16px; padding: 15px; background: #ffffff; page-break-inside: avoid; break-inside: avoid; }
    .metric { border-color: #d7eadf; background: #f7fbf8; }
    .label { display: block; margin-bottom: 6px; color: #60758d; font-size: 9px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
    .value { color: #101827; font-size: 17px; font-weight: 900; line-height: 1.2; }
    .section-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .badge { display: inline-flex; max-width: 260px; overflow: hidden; border-radius: 999px; background: #eef7f2; padding: 6px 10px; color: #08704f; font-size: 10px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
    .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .mini-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .mini-metrics div { border: 1px solid #e5edf5; border-radius: 12px; padding: 9px; background: #f8fafc; }
    .mini-metrics span { display: block; color: #60758d; font-size: 9px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .mini-metrics strong { display: block; margin-top: 4px; color: #101827; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e8eff5; padding: 8px 0; text-align: left; vertical-align: top; }
    tr:last-child th, tr:last-child td { border-bottom: 0; }
    th { width: 42%; padding-right: 12px; color: #60758d; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; }
    td { color: #101827; font-size: 11px; font-weight: 800; line-height: 1.35; }
    .section { margin-top: 12px; }
    .applicant-card + .applicant-card { margin-top: 12px; }
    .pill { display: inline-flex; margin-top: 14px; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; padding: 7px 11px; color: #ecfff2; font-size: 11px; font-weight: 900; }
    ul { margin: 8px 0 0; padding-left: 18px; color: #334155; font-size: 11px; line-height: 1.55; }
    .footer { margin-top: 12px; color: #60758d; font-size: 9px; text-align: center; }
    @media print {
      body { width: auto; background: #fff; }
      .page { width: auto; min-height: auto; background: #fff; }
    }
  </style>
</head>
<body>
  <main class="page" data-bond-application-pdf-page="true">
    <div class="page-inner">
      <section class="cover">
        <div class="brand-row">
          <div class="bond-brand">
            ${bondLogo}
          </div>
          <div class="agency-brand">
            <div class="agency-meta">
              <span>Referred by</span>
              <strong>${escapeHtml(referringAgencyName)}</strong>
            </div>
            ${referringAgencyLogo}
          </div>
        </div>
        <header class="hero">
          <h1>${escapeHtml(summaryTitle)}</h1>
          <p class="sub">${escapeHtml(vm.applicant?.fullName || 'Applicant not captured')} - ${escapeHtml(vm.property?.label || 'Property not captured')} - Generated ${escapeHtml(formatDateTime(generatedAt))}</p>
          <span class="pill">${escapeHtml(vm.application?.readinessLabel || 'Not Ready')} - ${escapeHtml(vm.risk?.level || 'Incomplete')}</span>
          <div class="hero-grid">
            <div class="hero-stat"><span>Application ID</span><strong>${escapeHtml(vm.application?.id || 'Pending')}</strong></div>
            <div class="hero-stat"><span>Consultant</span><strong>${escapeHtml(vm.consultant || 'Unassigned')}</strong></div>
            <div class="hero-stat"><span>Status</span><strong>${escapeHtml(vm.application?.status || 'Pending')}</strong></div>
          </div>
        </header>
      </section>
      <section class="content">
      <div class="grid">
        <article class="card metric"><span class="label">Completion</span><span class="value">${escapeHtml(vm.application?.completionPercent || 0)}%</span></article>
        <article class="card metric"><span class="label">Readiness</span><span class="value">${escapeHtml(vm.application?.readinessPercent || 0)}%</span></article>
        <article class="card metric"><span class="label">Risk</span><span class="value">${escapeHtml(vm.risk?.score || 0)}/100</span></article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Applicant Details</h2>
          <table><tbody>
            ${row('Applicant', vm.applicant?.fullName)}
            ${row('Email', vm.applicant?.email)}
            ${row('Phone', vm.applicant?.phone)}
            ${row('Employment', vm.applicant?.employmentStatus)}
            ${row('Consent Status', vm.readinessItems?.find((item) => item.key === 'consent')?.complete ? 'Captured' : 'Not captured')}
          </tbody></table>
        </article>
        <article class="card">
          <h2>Property / Unit</h2>
          <table><tbody>
            ${row('Property', vm.property?.label)}
            ${row('Development', vm.property?.developmentName)}
            ${row('Unit', vm.property?.unitNumber)}
            ${row('Purchase price', vm.financials?.purchasePrice?.display)}
            ${row('Deposit', `${vm.financials?.deposit?.display || 'Not captured'} ${vm.financials?.deposit?.secondary || ''}`)}
            ${row('Bond required', vm.financials?.bondAmountRequired?.display)}
          </tbody></table>
        </article>
      </div>
      <div class="section">${applicantRows}</div>
      <div class="section grid">
        <article class="card metric"><span class="label">Purchase Price</span><span class="value">${escapeHtml(vm.financials?.purchasePrice?.display)}</span></article>
        <article class="card metric"><span class="label">Deposit</span><span class="value">${escapeHtml(vm.financials?.deposit?.display)} ${escapeHtml(vm.financials?.deposit?.secondary || '')}</span></article>
        <article class="card metric"><span class="label">Bond Required</span><span class="value">${escapeHtml(vm.financials?.bondAmountRequired?.display)}</span></article>
        <article class="card metric"><span class="label">Monthly Income</span><span class="value">${escapeHtml(vm.financials?.grossIncome?.display)}</span></article>
        <article class="card metric"><span class="label">Monthly Expenses</span><span class="value">${escapeHtml(vm.financials?.monthlyExpenses?.display)} ${escapeHtml(vm.financials?.monthlyExpenses?.secondary || '')}</span></article>
        <article class="card metric"><span class="label">Existing Debt</span><span class="value">${escapeHtml(vm.financials?.existingDebt?.display)}</span></article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Submission Readiness</h2>
          <table><tbody>${readinessRows}</tbody></table>
        </article>
        <article class="card">
          <h2>Document Checklist</h2>
          <table><tbody>${documentRows}</tbody></table>
        </article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Risk / Recommendation</h2>
          <table><tbody>
            ${row('Risk Level', vm.risk?.level)}
            ${row('Risk Score', `${vm.risk?.score || 0}/100`)}
            ${row('Recommendation', vm.risk?.recommendation)}
          </tbody></table>
          <ul>${factors}</ul>
        </article>
        <article class="card">
          <h2>Outstanding Items</h2>
          <table><tbody>${actionRows || row('Status', 'No outstanding actions')}</tbody></table>
        </article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Originator Review Workspace</h2>
          <table><tbody>
            ${row('Review Score', `${originatorReviewWorkspace.score || 0}/100 - ${originatorReviewWorkspace.scoreLabel || 'Data Gaps'}`)}
            ${row('Recommended Action', originatorReviewWorkspace.recommendedAction || 'Review application data before submission.')}
            ${originatorSourceBucketRows || row('Source Separation', 'No source bucket data available')}
          </tbody></table>
        </article>
        <article class="card">
          <h2>Originator Action List</h2>
          <table><tbody>${originatorActionRows || row('Status', 'No originator action blockers detected')}</tbody></table>
        </article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Buyer Section Confirmations</h2>
          <table><tbody>
            ${row('Confirmation Coverage', buyerConfirmationConfidence.totalSupportedSections ? `${buyerConfirmationConfidence.confirmedCount || 0}/${buyerConfirmationConfidence.totalSupportedSections} buyer sections confirmed (${buyerConfirmationConfidence.percent || 0}%)` : 'Not available')}
            ${row('Confidence Level', toTitle(buyerConfirmationConfidence.confidenceLevel || 'none'))}
            ${row('Last Confirmed', formatDateTime(buyerConfirmationConfidence.lastConfirmedAt, 'Not confirmed'))}
            ${buyerConfirmationSectionRows || row('Confirmed Sections', 'No buyer-confirmed prefill sections yet')}
          </tbody></table>
        </article>
        <article class="card">
          <h2>Unconfirmed Buyer Sections</h2>
          <table><tbody>${buyerConfirmationMissingRows || row('Status', 'All supported buyer sections were confirmed')}</tbody></table>
        </article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Buyer Portal Field Alignment</h2>
          <table><tbody>
            ${row('Coverage', fieldAlignment.totalCount ? `${fieldAlignment.capturedCount || 0}/${fieldAlignment.totalCount} fields matched (${fieldAlignmentPercent}%)` : 'Not available')}
            ${fieldAlignmentRows || row('Tracked Sections', 'Not available')}
          </tbody></table>
        </article>
        <article class="card">
          <h2>Missing Originator Fields</h2>
          <table><tbody>${fieldAlignmentMissingRows || row('Status', 'All tracked buyer portal fields are available')}</tbody></table>
        </article>
      </div>
      </section>
      <p class="footer">Generated by Arch9 for bond application processing. Confirm captured information before bank submission.</p>
    </div>
  </main>
</body>
</html>`
}
