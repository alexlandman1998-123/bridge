import { normalizeFinanceType } from '../core/transactions/financeType.js'
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
    bond_help_requested: form.needsBondAssistance ? 'yes' : '',
  }

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
    bond_help_requested: finance.bond_help_requested,
    purchasers: [purchaser],
    finance,
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
    {
      key: 'signature',
      title: 'Digital Signature',
      description: 'Review and sign your offer.',
      required: 1,
      completed: options.reviewReady ? 1 : 0,
      complete: Boolean(options.reviewReady),
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
