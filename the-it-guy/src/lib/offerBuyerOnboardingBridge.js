import { deriveFinanceManagedBy, normalizeFinanceType } from '../core/transactions/financeType.js'
import { resolveBuyerOnboardingFlow } from './buyerOnboardingFlow.js'
import {
  getOnboardingStepDefinitions,
  getRequiredDocumentsForPurchaserType,
} from './purchaserPersonas.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function moneyNumber(value) {
  const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function splitFullName(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1).join(' '),
  }
}

function isFilledValue(value) {
  if (value === 0 || value === '0') return true
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some((item) => isFilledValue(item))
  if (value && typeof value === 'object') return Object.values(value).some((item) => isFilledValue(item))
  return normalizeText(value).length > 0
}

function isBondFinanceType(value = '') {
  return ['bond', 'combination', 'hybrid'].includes(normalizeText(value).toLowerCase())
}

function normalizeBondAssistancePreference(form = {}) {
  const direct = normalizeText(
    form.bondAssistancePreference ||
      form.bond_assistance_preference ||
      form.bondHelpPreference ||
      form.bond_help_preference,
  ).toLowerCase()
  if (['self_managed', 'self-managed', 'self', 'own', 'buyer_managed', 'client', 'no'].includes(direct)) return 'self_managed'
  if (['originator_assisted', 'originator-assisted', 'assisted', 'help', 'bond_originator', 'yes'].includes(direct)) return 'originator_assisted'

  const requested = normalizeText(form.bond_help_requested || form.bondHelpRequested || form.ooba_assist_requested || form.oobaAssistRequested).toLowerCase()
  if (['yes', 'true', 'y', '1', 'on'].includes(requested)) return 'originator_assisted'
  if (['no', 'false', 'n', '0', 'off'].includes(requested)) return 'self_managed'
  if (form.needsBondAssistance === true) return 'originator_assisted'
  return ''
}

function bondHelpRequestedValue(preference = '') {
  if (preference === 'originator_assisted') return 'yes'
  if (preference === 'self_managed') return 'no'
  return ''
}

function fieldValue(formData = {}, fieldKey = '') {
  const key = normalizeText(fieldKey)
  if (!key) return ''
  if (key in formData) return formData[key]
  if (formData.finance && key in formData.finance) return formData.finance[key]
  const purchaser = Array.isArray(formData.purchasers) ? formData.purchasers[0] : null
  if (purchaser && key in purchaser) return purchaser[key]
  return ''
}

function isVisibleField(field = {}, formData = {}) {
  if (typeof field.visibleWhen !== 'function') return true
  try {
    return Boolean(field.visibleWhen(formData))
  } catch {
    return true
  }
}

function isRequiredField(field = {}, formData = {}) {
  if (typeof field.requiredWhen === 'function') {
    try {
      return Boolean(field.requiredWhen(formData))
    } catch {
      return Boolean(field.required)
    }
  }
  return Boolean(field.required)
}

function getSectionFieldStats(sections = [], formData = {}) {
  return sections.reduce(
    (acc, section) => {
      const visibleFields = (section.fields || []).filter((field) => isVisibleField(field, formData))
      visibleFields.forEach((field) => {
        if (!isRequiredField(field, formData)) return
        acc.required += 1
        if (isFilledValue(fieldValue(formData, field.key))) {
          acc.completed += 1
        }
      })
      return acc
    },
    { required: 0, completed: 0 },
  )
}

function makeSection({ key, title, description, formData = {}, sections = [], complete = false, extraRequired = 0, extraCompleted = 0 }) {
  const stats = getSectionFieldStats(sections, formData)
  const required = stats.required + extraRequired
  const completed = stats.completed + extraCompleted
  return {
    key,
    title,
    description,
    required,
    completed,
    complete: required > 0 ? completed >= required : Boolean(complete),
  }
}

function sectionMatches(section = {}, patterns = []) {
  const haystack = `${section.key || ''} ${section.title || ''}`.toLowerCase()
  return patterns.some((pattern) => haystack.includes(pattern))
}

export function mapOfferFormToBuyerOnboardingForm(form = {}, options = {}) {
  const financeType = normalizeFinanceType(form.financeType || options.financeType || 'bond')
  const bondAssistancePreference = isBondFinanceType(financeType) ? normalizeBondAssistancePreference(form) : ''
  const bondHelpRequested = bondHelpRequestedValue(bondAssistancePreference)
  const offerAmount = moneyNumber(options.offerAmount ?? form.offerAmount)
  const depositAmount = moneyNumber(options.depositAmount ?? form.depositAmount)
  const bondAmount = financeType === 'cash' ? 0 : moneyNumber(options.loanAmount ?? form.bondAmount) || Math.max(0, offerAmount - depositAmount)
  const cashAmount = financeType === 'bond' ? depositAmount : Math.max(depositAmount, moneyNumber(form.cashContribution))
  const { firstName, lastName } = splitFullName(form.fullName)
  const purchaser = {
    first_name: firstName,
    last_name: lastName,
    identity_number: normalizeText(form.idNumber),
    email: normalizeText(form.email),
    phone: normalizeText(form.phone),
  }
  const finance = {
    purchase_price: offerAmount ? String(offerAmount) : '',
    cash_amount: cashAmount ? String(cashAmount) : '',
    bond_amount: bondAmount ? String(bondAmount) : '',
    cash_contribution_available: depositAmount ? String(depositAmount) : '',
    proof_of_funds_available: normalizeText(form.proofOfFundsUrl) ? 'yes' : '',
    bond_assistance_preference: bondAssistancePreference,
    bond_help_requested: bondHelpRequested,
  }
  finance.finance_managed_by = deriveFinanceManagedBy({
    financeType,
    formData: {
      ...finance,
      finance,
    },
  })

  return {
    purchaser_type: 'individual',
    purchaser_entity_type: 'individual',
    purchase_finance_type: financeType,
    first_name: purchaser.first_name,
    last_name: purchaser.last_name,
    identity_number: purchaser.identity_number,
    email: purchaser.email,
    phone: purchaser.phone,
    purchase_price: finance.purchase_price,
    cash_amount: finance.cash_amount,
    bond_amount: finance.bond_amount,
    cash_contribution_available: finance.cash_contribution_available,
    proof_of_funds_available: finance.proof_of_funds_available,
    bond_assistance_preference: finance.bond_assistance_preference,
    bondAssistancePreference: finance.bond_assistance_preference,
    bond_help_requested: finance.bond_help_requested,
    ooba_assist_requested: finance.bond_help_requested,
    finance_managed_by: finance.finance_managed_by,
    financeManagedBy: finance.finance_managed_by,
    purchasers: [purchaser],
    finance,
  }
}

export function buildBuyerVerificationSubmissionSnapshot(submission = {}, options = {}) {
  const submittedAt = normalizeText(options.submittedAt) || new Date().toISOString()
  const formData = mapOfferFormToBuyerOnboardingForm(submission, options)
  const fullName = normalizeText(
    submission.fullName ||
      [formData.first_name, formData.last_name].filter(Boolean).join(' '),
  )
  const buyer = {
    fullName,
    firstName: normalizeText(formData.first_name),
    lastName: normalizeText(formData.last_name),
    email: normalizeText(submission.email || formData.email).toLowerCase(),
    phone: normalizeText(submission.phone || formData.phone),
    idNumber: normalizeText(submission.idNumber || formData.identity_number),
  }
  const financeType = normalizeFinanceType(formData.purchase_finance_type || submission.financeType || options.financeType || 'bond')
  const bondAssistancePreference = normalizeBondAssistancePreference({
    ...submission,
    bondAssistancePreference: submission.bondAssistancePreference || formData.bond_assistance_preference,
  })

  return {
    status: 'submitted',
    submittedAt,
    source: normalizeText(options.source) || 'buyer_verification_link',
    buyer,
    finance: {
      financeType,
      purchasePrice: moneyNumber(formData.purchase_price),
      cashAmount: moneyNumber(formData.cash_amount),
      bondAmount: moneyNumber(formData.bond_amount),
      cashContributionAvailable: moneyNumber(formData.cash_contribution_available),
      bondAssistancePreference,
      bondHelpRequested: bondHelpRequestedValue(bondAssistancePreference),
      financeManagedBy: normalizeText(formData.finance_managed_by),
    },
    formData,
    acknowledgements: {
      informationAccurate: Boolean(
        submission.acknowledgeInfoAccuracy ||
          submission.confirmedAccuracy ||
          options.confirmedAccuracy,
      ),
      verificationOnly: true,
    },
  }
}

export function buildOfferBuyerVerificationModel(form = {}, options = {}) {
  const formData = mapOfferFormToBuyerOnboardingForm(form, options)
  const financeType = normalizeFinanceType(formData.purchase_finance_type || 'bond')
  const flow = resolveBuyerOnboardingFlow(formData, options.transaction || {}, {
    purchaserType: formData.purchaser_type,
    financeType,
  })
  const detailStep = getOnboardingStepDefinitions(formData, {
    transaction: options.transaction,
    purchaserType: formData.purchaser_type,
    financeType,
  }).find((step) => step.key === 'details')
  const sections = Array.isArray(detailStep?.sections) ? detailStep.sections : []
  const documents = getRequiredDocumentsForPurchaserType(formData.purchaser_type, {
    formData,
    transaction: options.transaction,
    financeType,
    cashAmount: formData.cash_amount,
    bondAmount: formData.bond_amount,
  })

  const personalSections = sections.filter((section) =>
    sectionMatches(section, ['personal', 'contact', 'identity', 'address']),
  )
  const householdSections = sections.filter((section) =>
    sectionMatches(section, ['marital', 'spouse', 'ownership', 'dependant']),
  )
  const employmentSections = sections.filter((section) =>
    sectionMatches(section, ['employment', 'income', 'affordability']),
  )
  const financeSections = sections.filter((section) =>
    sectionMatches(section, ['finance', 'funding', 'cash', 'bond', 'pre-approval', 'preapproval']),
  )

  const cards = [
    makeSection({
      key: 'about',
      title: 'About You',
      description: 'Personal details and contact information.',
      formData,
      sections: personalSections,
    }),
    makeSection({
      key: 'household',
      title: 'Household',
      description: 'Marital status, dependants, and ownership context.',
      formData,
      sections: householdSections,
      complete: householdSections.length === 0,
    }),
    makeSection({
      key: 'employment',
      title: 'Employment',
      description: 'Employment and income details.',
      formData,
      sections: employmentSections,
      complete: employmentSections.length === 0,
    }),
    makeSection({
      key: 'finance',
      title: 'Finance',
      description: 'Bond originator and funding information.',
      formData,
      sections: financeSections,
    }),
    {
      key: 'documents',
      title: 'Documents',
      description: 'Supporting documents required by the buyer onboarding rules.',
      required: documents.length,
      completed: 0,
      complete: documents.length === 0,
    },
    {
      key: 'compliance',
      title: 'Compliance',
      description: 'FICA, POPIA and consent.',
      required: 1,
      completed: options.confirmedAccuracy ? 1 : 0,
      complete: Boolean(options.confirmedAccuracy),
    },
  ]

  return {
    formData,
    flow,
    sections: cards,
    requiredDocuments: documents,
    completion: {
      completed: cards.filter((item) => item.complete).length,
      total: cards.length,
    },
  }
}
