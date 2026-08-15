import {
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
  isPlainObject,
} from '../bondApplicationState.js'
import { getPurchaserEntityType, normalizePurchaserType } from '../../../../lib/purchaserPersonas.js'
import { buildLegacyBondApplicationDraft } from './buildLegacyBondApplicationDraft.js'

const KNOWN_LEGACY_TOP_LEVEL_PATHS = new Set([
  'status',
  'submitted_at',
  'selected_banks',
  'selectedBanks',
  'applicants',
  'summary',
  'personal_details',
  'contact_address',
  'employment',
  'credit_history',
  'loan_details',
  'income_deductions_expenses',
  'banking_liabilities',
  'assets_liabilities',
  'declarations_consents',
  'consent',
  'offers',
  'income',
  'expenses',
  'assets',
  '_meta',
  '_guided_repeatables',
])

function diagnostic(type, path, message) {
  return { type, path, message }
}

function firstPresentValue(...values) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim().length > 0)
}

function normalizeBuyerEntityType(value) {
  return getPurchaserEntityType(normalizePurchaserType(value || 'individual'))
}

function getApplicant(legacy, key) {
  const applicants = Array.isArray(legacy?.applicants) ? legacy.applicants : []
  return applicants.find((applicant) => String(applicant?.key || '').toLowerCase() === key) || null
}

function hasMeaningfulApplicantData(applicant = {}) {
  return Object.entries(applicant || {}).some(([key, value]) => {
    if (['key', 'label', 'role', 'legacyApplicantKey'].includes(key)) return false
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value).length > 0
    return Boolean(value)
  })
}

function buildDiagnostics(legacy) {
  const diagnostics = []
  if (!isPlainObject(legacy)) {
    diagnostics.push(diagnostic('unsupported_legacy_type', '', 'Legacy bond application was not an object.'))
    return diagnostics
  }

  Object.keys(legacy).forEach((key) => {
    if (!KNOWN_LEGACY_TOP_LEVEL_PATHS.has(key)) {
      diagnostics.push(diagnostic('passthrough_preserved', key, 'Legacy field is preserved through compatibility passthrough.'))
    }
  })

  if (legacy?.credit_history?.surety_details || legacy?.credit_history?.surety_amount) {
    diagnostics.push(diagnostic('ambiguous_surety_mapping', 'credit_history', 'Surety fields remain legacy credit-history answers in Phase 1.'))
  }

  const applicants = Array.isArray(legacy?.applicants) ? legacy.applicants : []
  const extraApplicants = applicants.filter((applicant) => !['primary', 'co_applicant'].includes(String(applicant?.key || '').toLowerCase()))
  extraApplicants.forEach((applicant, index) => {
    diagnostics.push(diagnostic('unsupported_participant_mapping', `applicants.${index}`, `Applicant key ${String(applicant?.key || '') || '(missing)'} is preserved through passthrough.`))
  })

  return diagnostics
}

function buildParticipant({ role, legacyApplicantKey, applicant = {}, employment = {}, incomeExpenses = {}, credit = {}, declarations = {} }) {
  const clonedApplicant = cloneBondApplicationValue(applicant) || {}
  return {
    role,
    legacyApplicantKey,
    personal: clonedApplicant,
    contact: {
      email: clonedApplicant.email ?? null,
      phone: clonedApplicant.phone ?? null,
    },
    address: {},
    marital: {
      maritalStatus: clonedApplicant.marital_status ?? null,
    },
    employment: cloneBondApplicationValue(employment) || {},
    incomeSources: [],
    expenses: cloneBondApplicationValue(incomeExpenses) || {},
    monthlyCommitments: [],
    bankAccounts: [],
    debts: [],
    assets: [],
    liabilities: [],
    existingProperties: [],
    credit: cloneBondApplicationValue(credit) || {},
    declarations: cloneBondApplicationValue(declarations) || {},
    legacySignature: {
      typedSignatureName: declarations?.digital_signature_name ?? null,
      typedSignatureDate: declarations?.digital_signature_date ?? null,
    },
  }
}

function getGuidedRepeatables(legacy = {}) {
  return isPlainObject(legacy._guided_repeatables) ? cloneBondApplicationValue(legacy._guided_repeatables) : {}
}

function hasGuidedIdentity(record = {}) {
  const id = String(record?.id || record?.guidedItemId || '').trim()
  return Boolean(id) || record?.source === 'guided'
}

function mergeGuidedRecords(mappedRecords = [], guidedRecords = []) {
  if (!Array.isArray(guidedRecords) || guidedRecords.length === 0) return mappedRecords
  return [
    ...mappedRecords,
    ...guidedRecords.map((record) => ({
      ...cloneBondApplicationValue(record),
      source: record?.source || 'guided',
    })),
  ]
}

function mapBankAccounts(legacy = {}) {
  const bank = legacy.banking_liabilities || {}
  if (!bank.primary_bank_name && !bank.primary_account_number && !bank.primary_account_type) return []
  return [{
    legacyKey: 'primary',
    bankName: bank.primary_bank_name ?? null,
    accountType: bank.primary_account_type ?? null,
    accountHolderName: bank.primary_account_holder_name ?? null,
    accountNumber: bank.primary_account_number ?? null,
    balanceType: bank.primary_balance_debit_credit ?? null,
    firstConsiderationConsent: bank.primary_bank_first_consideration_consent ?? null,
    businessBankAccount: bank.business_bank_account ?? null,
    legalEntityAccountNameMatch: bank.legal_entity_account_name_match ?? null,
  }]
}

function mapDebts(legacy = {}) {
  const bank = legacy.banking_liabilities || {}
  const debts = []
  if (bank.home_loan_1_bank || bank.home_loan_1_account_number) {
    debts.push({
      legacyKey: 'home_loan_1',
      type: 'home_loan',
      bank: bank.home_loan_1_bank ?? null,
      accountHolderName: bank.home_loan_1_account_holder_name ?? null,
      accountNumber: bank.home_loan_1_account_number ?? null,
      outstandingBalance: bank.home_loan_1_outstanding_balance ?? null,
      monthlyInstalment: bank.home_loan_1_monthly_instalment ?? null,
      sellingProperty: bank.home_loan_1_selling_property ?? null,
      newInstalmentIfReduced: bank.home_loan_1_new_instalment_if_reduced ?? null,
    })
  }
  if (bank.other_finance_1_bank || bank.other_finance_1_account_type || bank.other_finance_1_current_balance) {
    debts.push({
      legacyKey: 'other_finance_1',
      type: bank.other_finance_1_account_type ?? null,
      bank: bank.other_finance_1_bank ?? null,
      currentBalance: bank.other_finance_1_current_balance ?? null,
      monthlyPayment: bank.other_finance_1_monthly_payment ?? null,
      settled: bank.other_finance_1_settled ?? null,
      businessAccount: bank.other_finance_1_business_account ?? null,
      legalEntityAccount: bank.other_finance_1_legal_entity_account ?? null,
    })
  }
  if (bank.retail_account_name || bank.retail_current_balance) {
    debts.push({
      legacyKey: 'retail_account',
      type: 'retail_account',
      accountName: bank.retail_account_name ?? null,
      currentBalance: bank.retail_current_balance ?? null,
      monthlyPayment: bank.retail_monthly_payment ?? null,
      settled: bank.retail_settled ?? null,
    })
  }
  return debts
}

function mapAssets(legacy = {}) {
  const assets = legacy.assets_liabilities || {}
  return [
    ['fixed_property', assets.fixed_property],
    ['vehicles', assets.vehicles],
    ['investments', assets.investments],
    ['furniture_and_fittings', assets.furniture_and_fittings],
    ['other_assets', assets.other_assets_value],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([legacyKey, value]) => ({
      legacyKey,
      value,
      description: legacyKey === 'other_assets' ? assets.other_assets_description ?? null : null,
    }))
}

function mapLiabilities(legacy = {}) {
  const liabilities = legacy.assets_liabilities || {}
  return [
    ['liabilities_total', liabilities.liabilities_total],
    ['other_liabilities', liabilities.other_liabilities_value],
    ['total_liabilities', liabilities.total_liabilities],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([legacyKey, value]) => ({
      legacyKey,
      value,
      description: legacyKey === 'other_liabilities' ? liabilities.other_liabilities_description ?? null : null,
    }))
}

function mapMonthlyCommitments(legacy = {}) {
  const expenses = legacy.income_deductions_expenses?.primary || {}
  const commitments = []
  const mappings = [
    ['rental_expense', 'Rent'],
    ['groceries', 'Groceries and household costs'],
    ['transport', 'Transport'],
    ['medical_aid', 'Medical aid and healthcare'],
    ['education', 'Education and childcare'],
    ['maintenance_amount', 'Maintenance paid'],
  ]
  mappings.forEach(([key, description]) => {
    if (expenses[key] !== undefined) {
      commitments.push({
        legacyKey: key,
        description,
        monthlyAmount: expenses[key],
      })
    }
  })
  return commitments
}

export function fromLegacyBondApplication(legacyApplication = {}, options = {}) {
  const legacy = isPlainObject(legacyApplication) ? cloneBondApplicationValue(legacyApplication) : {}
  const state = createEmptyBondApplicationState()
  const primaryApplicant = getApplicant(legacy, 'primary') || {}
  const coApplicant = getApplicant(legacy, 'co_applicant')
  const diagnostics = buildDiagnostics(legacyApplication)
  const guidedRepeatables = getGuidedRepeatables(legacy)

  state.meta.status = legacy.status ?? null
  state.meta.submittedAt = legacy.submitted_at ?? null
  state.application.transactionId = options.transactionId ?? options.portal?.transaction?.id ?? null
  state.application.applicantStructure = legacy.summary?.has_surety === 'yes'
    ? 'surety'
    : legacy.summary?.has_co_applicant === 'yes'
      ? 'joint'
      : legacy.summary?.has_co_applicant === 'no'
        ? 'sole'
        : hasMeaningfulApplicantData(coApplicant)
          ? 'joint'
          : null
  state.application.requiresSurety = legacy.summary?.has_surety ?? null
  state.application.property = {
    developmentId: options.developmentId ?? options.portal?.development?.id ?? options.portal?.unit?.development?.id ?? null,
    developmentName: legacy.summary?.development_name ?? options.portal?.development?.name ?? options.portal?.unit?.development?.name ?? null,
    unitId: options.unitId ?? options.portal?.unit?.id ?? null,
    unitReference: legacy.summary?.unit_reference ?? null,
    propertyReference: legacy.summary?.property_reference ?? null,
  }
  state.application.finance = {
    purchasePrice: legacy.summary?.purchase_price ?? null,
    depositAmount: legacy.summary?.deposit_contribution ?? legacy.summary?.deposit_amount ?? null,
    requestedBondAmount: legacy.loan_details?.amount_to_be_registered ?? null,
    financeType: legacy.summary?.finance_type ?? null,
  }
  state.application.buyerEntity = {
    entityType: normalizeBuyerEntityType(firstPresentValue(
      legacy.summary?.buyer_entity_type,
      legacy.summary?.purchaser_type,
      options.portal?.onboardingFormData?.formData?.buyer_entity_type,
      options.portal?.onboardingFormData?.formData?.purchaser_entity_type,
      options.portal?.onboardingFormData?.formData?.purchaser_type,
      options.portal?.transaction?.buyer_entity_type,
      options.portal?.transaction?.purchaser_type,
      options.portal?.purchaserType,
    )),
    name: firstPresentValue(
      legacy.summary?.buyer_entity_name,
      options.portal?.onboardingFormData?.formData?.buyer_entity_name,
      options.portal?.onboardingFormData?.formData?.purchaser_entity_name,
      options.portal?.onboardingFormData?.formData?.company_name,
      options.portal?.onboardingFormData?.formData?.trust_name,
    ) || null,
    registrationNumber: firstPresentValue(
      legacy.summary?.buyer_entity_registration_number,
      options.portal?.onboardingFormData?.formData?.buyer_entity_registration_number,
      options.portal?.onboardingFormData?.formData?.purchaser_entity_registration_number,
      options.portal?.onboardingFormData?.formData?.company_registration_number,
      options.portal?.onboardingFormData?.formData?.trust_registration_number,
      options.portal?.onboardingFormData?.formData?.registration_number,
    ) || null,
  }
  state.application.selectedBankIds = Array.isArray(legacy.selected_banks)
    ? cloneBondApplicationValue(legacy.selected_banks)
    : Array.isArray(legacy.selectedBanks)
      ? cloneBondApplicationValue(legacy.selectedBanks)
      : []

  state.participants.primaryApplicant = buildParticipant({
    role: 'primary_applicant',
    legacyApplicantKey: 'primary',
    applicant: primaryApplicant,
    employment: legacy.employment?.primary || {},
    incomeExpenses: legacy.income_deductions_expenses?.primary || {},
    credit: legacy.credit_history || {},
    declarations: legacy.declarations_consents || {},
  })
  state.participants.primaryApplicant.address = cloneBondApplicationValue(legacy.contact_address) || {}
  state.participants.primaryApplicant.incomeSources = cloneBondApplicationValue(guidedRepeatables.income_sources || [])
  state.participants.primaryApplicant.monthlyCommitments = mergeGuidedRecords(mapMonthlyCommitments(legacy), guidedRepeatables.monthly_commitments)
  state.participants.primaryApplicant.bankAccounts = mergeGuidedRecords(mapBankAccounts(legacy), guidedRepeatables.bank_accounts)
  state.participants.primaryApplicant.debts = mergeGuidedRecords(mapDebts(legacy), guidedRepeatables.debts)
  state.participants.primaryApplicant.assets = mergeGuidedRecords(mapAssets(legacy), guidedRepeatables.assets)
  state.participants.primaryApplicant.liabilities = mergeGuidedRecords(mapLiabilities(legacy), guidedRepeatables.liabilities)
  state.participants.primaryApplicant.existingProperties = cloneBondApplicationValue(guidedRepeatables.existing_properties || [])

  state.participants.coApplicant = coApplicant && hasMeaningfulApplicantData(coApplicant)
    ? buildParticipant({
        role: 'co_applicant',
        legacyApplicantKey: 'co_applicant',
        applicant: coApplicant,
        employment: legacy.employment?.co_applicant || {},
        incomeExpenses: legacy.income_deductions_expenses?.co_applicant || {},
        declarations: legacy.declarations_consents || {},
      })
    : null

  state.legacySubmission = {
    status: legacy.status ?? null,
    submittedAt: legacy.submitted_at ?? null,
    typedSignatureName: legacy.declarations_consents?.digital_signature_name ?? null,
    typedSignatureDate: legacy.declarations_consents?.digital_signature_date ?? null,
    consents: {
      declarations_consents: cloneBondApplicationValue(legacy.declarations_consents) || {},
      consent: cloneBondApplicationValue(legacy.consent) || {},
    },
  }
  state.compatibility = {
    legacyBase: legacy,
    unmappedPaths: diagnostics.filter((item) => item.type === 'passthrough_preserved').map((item) => item.path),
    warnings: diagnostics.filter((item) => item.type !== 'passthrough_preserved'),
    diagnostics,
  }

  return state
}

function upsertApplicant(applicants, applicant) {
  const key = String(applicant?.key || '').toLowerCase()
  if (!key) return applicants
  const index = applicants.findIndex((item) => String(item?.key || '').toLowerCase() === key)
  if (index >= 0) {
    const next = applicants.slice()
    next[index] = { ...next[index], ...cloneBondApplicationValue(applicant), key: applicant.key, label: applicant.label || next[index].label }
    return next
  }
  return [...applicants, cloneBondApplicationValue(applicant)]
}

function applyBankAccountToLegacy(legacy, state) {
  const account = state?.participants?.primaryApplicant?.bankAccounts?.find((item) => item?.legacyKey === 'primary')
  if (!account) return
  const next = { ...(legacy.banking_liabilities || {}) }
  const mappings = {
    primary_bank_name: account.bankName,
    primary_account_type: account.accountType,
    primary_account_holder_name: account.accountHolderName,
    primary_account_number: account.accountNumber,
    primary_balance_debit_credit: account.balanceType,
    primary_bank_first_consideration_consent: account.firstConsiderationConsent,
    business_bank_account: account.businessBankAccount,
    legal_entity_account_name_match: account.legalEntityAccountNameMatch,
  }
  Object.entries(mappings).forEach(([key, value]) => {
    if (value !== null && value !== undefined) next[key] = value
    else if (Object.prototype.hasOwnProperty.call(next, key)) next[key] = value
  })
  legacy.banking_liabilities = next
}

function amountNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

function sumAmounts(records = [], path = 'value') {
  return records.reduce((total, record) => {
    const value = String(path).split('.').filter(Boolean).reduce((current, key) => current?.[key], record)
    const number = amountNumber(value)
    return number === null ? total : total + number
  }, 0)
}

function guidedOnly(records = []) {
  return Array.isArray(records)
    ? records.filter((record) => hasGuidedIdentity(record)).map((record) => cloneBondApplicationValue(record))
    : []
}

function applyGuidedRepeatablesToLegacy(legacy, state) {
  const applicant = state?.participants?.primaryApplicant || {}
  const existingRepeatables = getGuidedRepeatables(legacy)
  const nextRepeatables = {
    ...existingRepeatables,
    income_sources: cloneBondApplicationValue(applicant.incomeSources || []),
    monthly_commitments: guidedOnly(applicant.monthlyCommitments),
    bank_accounts: guidedOnly(applicant.bankAccounts),
    debts: guidedOnly(applicant.debts),
    existing_properties: cloneBondApplicationValue(applicant.existingProperties || []),
    assets: guidedOnly(applicant.assets),
    liabilities: guidedOnly(applicant.liabilities),
  }
  Object.keys(nextRepeatables).forEach((key) => {
    if (Array.isArray(nextRepeatables[key]) && nextRepeatables[key].length === 0 && !Array.isArray(existingRepeatables[key])) {
      delete nextRepeatables[key]
    }
  })
  if (Object.keys(nextRepeatables).length > 0) legacy._guided_repeatables = nextRepeatables

  const primaryExpenses = { ...(legacy.income_deductions_expenses?.primary || {}) }
  ;(applicant.monthlyCommitments || []).forEach((record) => {
    if (record?.legacyKey && record.monthlyAmount !== undefined) primaryExpenses[record.legacyKey] = record.monthlyAmount
  })
  legacy.income_deductions_expenses = {
    ...(legacy.income_deductions_expenses || {}),
    primary: {
      ...primaryExpenses,
      ...(legacy.income_deductions_expenses?.primary || {}),
    },
  }

  const guidedAssets = guidedOnly(applicant.assets)
  const guidedLiabilities = guidedOnly(applicant.liabilities)
  const assetTotal = sumAmounts(guidedAssets, 'value')
  const liabilityTotal = sumAmounts(guidedLiabilities, 'value')
  if (assetTotal || liabilityTotal) {
    legacy.assets_liabilities = {
      ...(legacy.assets_liabilities || {}),
      total_assets: assetTotal ? String(assetTotal) : legacy.assets_liabilities?.total_assets,
      total_liabilities: liabilityTotal ? String(liabilityTotal) : legacy.assets_liabilities?.total_liabilities,
      net_asset_value: assetTotal || liabilityTotal ? String(assetTotal - liabilityTotal) : legacy.assets_liabilities?.net_asset_value,
    }
  }
}

function applyKnownMappedState(legacy, state) {
  const buyerEntity = state?.application?.buyerEntity || {}
  const buyerEntityType = normalizeBuyerEntityType(buyerEntity.entityType)
  const shouldWriteBuyerEntity =
    Boolean(legacy.summary?.buyer_entity_type || legacy.summary?.purchaser_type || legacy.summary?.buyer_entity_name || legacy.summary?.buyer_entity_registration_number) ||
    buyerEntityType !== 'individual' ||
    Boolean(buyerEntity.name || buyerEntity.registrationNumber)
  legacy.status = state?.legacySubmission?.status ?? state?.meta?.status ?? legacy.status
  legacy.submitted_at = state?.legacySubmission?.submittedAt ?? state?.meta?.submittedAt ?? legacy.submitted_at
  legacy.selected_banks = cloneBondApplicationValue(state?.application?.selectedBankIds || [])
  legacy.summary = {
    ...(legacy.summary || {}),
    development_name: state?.application?.property?.developmentName ?? legacy.summary?.development_name,
    unit_reference: state?.application?.property?.unitReference ?? legacy.summary?.unit_reference,
    property_reference: state?.application?.property?.propertyReference ?? legacy.summary?.property_reference,
    purchase_price: state?.application?.finance?.purchasePrice ?? legacy.summary?.purchase_price,
    deposit_contribution: state?.application?.finance?.depositAmount ?? legacy.summary?.deposit_contribution,
    finance_type: state?.application?.finance?.financeType ?? legacy.summary?.finance_type,
    ...(shouldWriteBuyerEntity ? {
      purchaser_type: buyerEntityType,
      buyer_entity_type: buyerEntityType,
      buyer_entity_name: buyerEntity.name ?? legacy.summary?.buyer_entity_name ?? '',
      buyer_entity_registration_number: buyerEntity.registrationNumber ?? legacy.summary?.buyer_entity_registration_number ?? '',
    } : {}),
    has_co_applicant: state?.application?.applicantStructure === 'joint'
      ? 'yes'
      : state?.application?.applicantStructure === 'sole'
        ? 'no'
        : legacy.summary?.has_co_applicant,
    has_surety: state?.application?.applicantStructure === 'surety'
      ? 'yes'
      : state?.application?.requiresSurety ?? legacy.summary?.has_surety,
  }
  legacy.loan_details = {
    ...(legacy.loan_details || {}),
    amount_to_be_registered: state?.application?.finance?.requestedBondAmount ?? legacy.loan_details?.amount_to_be_registered,
  }

  const applicants = Array.isArray(legacy.applicants) ? cloneBondApplicationValue(legacy.applicants) : []
  const primaryContact = state?.participants?.primaryApplicant?.contact || {}
  const primary = state?.participants?.primaryApplicant?.personal
  if (primary) {
    legacy.applicants = upsertApplicant(applicants, {
      ...primary,
      email: primaryContact.email ?? primary.email,
      phone: primaryContact.phone ?? primary.phone,
      key: 'primary',
      label: primary.label || 'Primary applicant',
    })
  }
  const coApplicant = state?.participants?.coApplicant?.personal
  if (coApplicant) {
    legacy.applicants = upsertApplicant(legacy.applicants || applicants, {
      ...coApplicant,
      key: 'co_applicant',
      label: coApplicant.label || 'Co-applicant',
    })
  }

  legacy.contact_address = cloneBondApplicationValue(state?.participants?.primaryApplicant?.address || legacy.contact_address || {})
  if (primaryContact.email !== undefined && primaryContact.email !== null) {
    legacy.contact_address.email_address = primaryContact.email
  }
  if (primaryContact.phone !== undefined && primaryContact.phone !== null) {
    legacy.contact_address.cellphone_number = primaryContact.phone
  }
  legacy.employment = {
    ...(legacy.employment || {}),
    primary: cloneBondApplicationValue(state?.participants?.primaryApplicant?.employment || legacy.employment?.primary || {}),
    co_applicant: cloneBondApplicationValue(state?.participants?.coApplicant?.employment || legacy.employment?.co_applicant || {}),
  }
  legacy.income_deductions_expenses = {
    ...(legacy.income_deductions_expenses || {}),
    primary: cloneBondApplicationValue(state?.participants?.primaryApplicant?.expenses || legacy.income_deductions_expenses?.primary || {}),
    co_applicant: cloneBondApplicationValue(state?.participants?.coApplicant?.expenses || legacy.income_deductions_expenses?.co_applicant || {}),
  }
  legacy.credit_history = cloneBondApplicationValue(state?.participants?.primaryApplicant?.credit || legacy.credit_history || {})
  legacy.declarations_consents = cloneBondApplicationValue(state?.legacySubmission?.consents?.declarations_consents || legacy.declarations_consents || {})
  legacy.declarations_consents.digital_signature_name =
    state?.legacySubmission?.typedSignatureName ?? legacy.declarations_consents.digital_signature_name
  legacy.declarations_consents.digital_signature_date =
    state?.legacySubmission?.typedSignatureDate ?? legacy.declarations_consents.digital_signature_date
  legacy.consent = cloneBondApplicationValue(state?.legacySubmission?.consents?.consent || legacy.consent || {})
  applyBankAccountToLegacy(legacy, state)
  applyGuidedRepeatablesToLegacy(legacy, state)
  return legacy
}

export function toLegacyBondApplication(applicationState = {}) {
  const legacyBase = applicationState?.compatibility?.legacyBase && isPlainObject(applicationState.compatibility.legacyBase)
    ? applicationState.compatibility.legacyBase
    : {}
  const legacy = cloneBondApplicationValue(legacyBase) || {}
  return applyKnownMappedState(legacy, applicationState)
}

export function buildBondApplicationState(portal, options = {}) {
  const legacyDraft = buildLegacyBondApplicationDraft(portal)
  return fromLegacyBondApplication(legacyDraft, {
    ...options,
    portal,
    transactionId: options.transactionId ?? portal?.transaction?.id ?? null,
    unitId: options.unitId ?? portal?.unit?.id ?? null,
    developmentId: options.developmentId ?? portal?.development?.id ?? portal?.unit?.development?.id ?? null,
  })
}
