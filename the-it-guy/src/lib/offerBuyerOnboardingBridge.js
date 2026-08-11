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

function normalizePurchaserEntityType(form = {}, fallback = 'individual') {
  const normalized = normalizeText(
    form.purchaser_entity_type ||
      form.purchaserEntityType ||
      form.purchaser_type ||
      form.purchaserType ||
      fallback,
  ).toLowerCase()
  if (['company', 'trust', 'foreign_purchaser'].includes(normalized)) return normalized
  return 'individual'
}

function normalizeAssociatedPerson(entry = {}, fallbackRole = 'Director') {
  return {
    full_name: normalizeText(entry.full_name || entry.fullName),
    id_number: normalizeText(entry.id_number || entry.idNumber || entry.identity_number || entry.passport_number),
    phone: normalizeText(entry.phone),
    email: normalizeText(entry.email),
    residential_address: normalizeText(entry.residential_address || entry.residentialAddress),
    role_title: normalizeText(entry.role_title || entry.roleTitle) || fallbackRole,
    signing_authority: entry.signing_authority === true || entry.signing_authority === 'yes' ? 'yes' : 'no',
  }
}

function normalizeAssociatedPeople(entries = [], fallbackRole = 'Director') {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeAssociatedPerson(entry, fallbackRole))
    .filter((entry) => [entry.full_name, entry.id_number, entry.phone, entry.email, entry.residential_address].some(Boolean))
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
  const purchaserEntityType = normalizePurchaserEntityType(form)
  const financeType = normalizeFinanceType(form.financeType || options.financeType || 'bond')
  const bondAssistancePreference = isBondFinanceType(financeType) ? normalizeBondAssistancePreference(form) : ''
  const bondHelpRequested = bondHelpRequestedValue(bondAssistancePreference)
  const purchaseAmount = moneyNumber(
    options.purchasePrice ??
      options.offerAmount ??
      form.purchasePrice ??
      form.purchase_price ??
      form.listingAskingPrice ??
      form.askingPrice ??
      form.offerAmount,
  )
  const depositAmount = moneyNumber(options.depositAmount ?? form.depositAmount)
  const bondAmount = financeType === 'cash' ? 0 : moneyNumber(options.loanAmount ?? form.bondAmount) || Math.max(0, purchaseAmount - depositAmount)
  const cashAmount = financeType === 'bond' ? depositAmount : Math.max(depositAmount, moneyNumber(form.cashContribution))
  const contactName = normalizeText(
    form.fullName ||
      form.company_contact_name ||
      form.authorised_signatory_name ||
      form.trust_contact_name ||
      form.authorised_trustee_name ||
      form.company_name ||
      form.trust_name,
  )
  const { firstName, lastName } = splitFullName(contactName)
  const purchaser = {
    first_name: firstName,
    last_name: lastName,
    identity_number: normalizeText(form.idNumber || form.authorised_signatory_identity_number || form.authorised_trustee_identity_number),
    email: normalizeText(form.email || form.company_contact_email || form.authorised_signatory_email || form.trust_contact_email || form.authorised_trustee_email),
    phone: normalizeText(form.phone || form.company_contact_phone || form.authorised_signatory_phone || form.trust_contact_phone || form.authorised_trustee_phone),
  }
  const finance = {
    purchase_price: purchaseAmount ? String(purchaseAmount) : '',
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

  const directors = normalizeAssociatedPeople(form.directors || form.company?.directors, 'Director')
  const trustees = normalizeAssociatedPeople(form.trustees || form.trust?.trustees, 'Trustee')
  const company = {
    name: normalizeText(form.company_name || form.company?.name),
    registration_number: normalizeText(form.company_registration_number || form.company?.registration_number),
    registered_address: normalizeText(form.company_registered_address || form.company?.registered_address),
    business_address: normalizeText(form.company_business_address || form.company?.business_address),
    tax_number: normalizeText(form.company_tax_number || form.company?.tax_number),
    vat_number: normalizeText(form.vat_number || form.company?.vat_number),
    nature_of_business: normalizeText(form.nature_of_business || form.company?.nature_of_business),
    contact: {
      name: normalizeText(form.company_contact_name || form.company?.contact?.name),
      email: normalizeText(form.company_contact_email || form.company?.contact?.email),
      phone: normalizeText(form.company_contact_phone || form.company?.contact?.phone),
    },
    authorised_signatory: {
      name: normalizeText(form.authorised_signatory_name || form.company?.authorised_signatory?.name),
      identity_number_or_passport_number: normalizeText(form.authorised_signatory_identity_number || form.company?.authorised_signatory?.identity_number_or_passport_number),
      email: normalizeText(form.authorised_signatory_email || form.company?.authorised_signatory?.email),
      phone: normalizeText(form.authorised_signatory_phone || form.company?.authorised_signatory?.phone),
      capacity: normalizeText(form.authorised_signatory_capacity || form.company?.authorised_signatory?.capacity),
    },
    board_resolution_available: normalizeText(form.board_resolution_available || form.company_resolution_available || form.company?.board_resolution_available),
    resolution_date: normalizeText(form.resolution_date || form.company?.resolution_date),
    authority_basis: normalizeText(form.authority_basis || form.company?.authority_basis),
    directors,
  }
  const trust = {
    name: normalizeText(form.trust_name || form.trust?.name),
    registration_number: normalizeText(form.trust_registration_number || form.trust?.registration_number),
    type: normalizeText(form.trust_type || form.trust?.type),
    masters_office_reference: normalizeText(form.masters_office_reference || form.trust?.masters_office_reference),
    registered_address: normalizeText(form.trust_registered_address || form.trust?.registered_address),
    tax_number: normalizeText(form.trust_tax_number || form.trust?.tax_number),
    contact: {
      name: normalizeText(form.trust_contact_name || form.trust?.contact?.name),
      email: normalizeText(form.trust_contact_email || form.trust?.contact?.email),
      phone: normalizeText(form.trust_contact_phone || form.trust?.contact?.phone),
    },
    authorised_trustee: {
      name: normalizeText(form.authorised_trustee_name || form.trust?.authorised_trustee?.name),
      identity_number_or_passport_number: normalizeText(form.authorised_trustee_identity_number || form.trust?.authorised_trustee?.identity_number_or_passport_number),
      email: normalizeText(form.authorised_trustee_email || form.trust?.authorised_trustee?.email),
      phone: normalizeText(form.authorised_trustee_phone || form.trust?.authorised_trustee?.phone),
      capacity: normalizeText(form.authorised_trustee_capacity || form.trust?.authorised_trustee?.capacity),
    },
    authority_basis: normalizeText(form.authority_basis || form.trust?.authority_basis),
    trust_deed_available: normalizeText(form.trust_deed_available || form.trust?.trust_deed_available),
    letters_of_authority_available: normalizeText(form.letters_of_authority_available || form.trust?.letters_of_authority_available),
    resolution_available: normalizeText(form.trust_resolution_available || form.trust?.resolution_available),
    all_trustees_signing: normalizeText(form.all_trustees_signing || form.trust?.all_trustees_signing),
    trustees,
  }

  return {
    purchaser_type: purchaserEntityType,
    purchaser_entity_type: purchaserEntityType,
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
    purchasers: purchaserEntityType === 'individual' || purchaserEntityType === 'foreign_purchaser' ? [purchaser] : [],
    ...(purchaserEntityType === 'company' ? {
      company,
      directors,
      company_name: company.name,
      company_registration_number: company.registration_number,
      company_registered_address: company.registered_address,
      company_business_address: company.business_address,
      company_tax_number: company.tax_number,
      vat_number: company.vat_number,
      nature_of_business: company.nature_of_business,
      company_contact_name: company.contact.name,
      company_contact_email: company.contact.email,
      company_contact_phone: company.contact.phone,
      authorised_signatory_name: company.authorised_signatory.name,
      authorised_signatory_identity_number: company.authorised_signatory.identity_number_or_passport_number,
      authorised_signatory_email: company.authorised_signatory.email,
      authorised_signatory_phone: company.authorised_signatory.phone,
      authorised_signatory_capacity: company.authorised_signatory.capacity,
      board_resolution_available: company.board_resolution_available,
      company_resolution_available: company.board_resolution_available,
      resolution_date: company.resolution_date,
      authority_basis: company.authority_basis,
    } : {}),
    ...(purchaserEntityType === 'trust' ? {
      trust,
      trustees,
      trust_name: trust.name,
      trust_registration_number: trust.registration_number,
      trust_type: trust.type,
      masters_office_reference: trust.masters_office_reference,
      trust_registered_address: trust.registered_address,
      trust_tax_number: trust.tax_number,
      trust_contact_name: trust.contact.name,
      trust_contact_email: trust.contact.email,
      trust_contact_phone: trust.contact.phone,
      authorised_trustee_name: trust.authorised_trustee.name,
      authorised_trustee_identity_number: trust.authorised_trustee.identity_number_or_passport_number,
      authorised_trustee_email: trust.authorised_trustee.email,
      authorised_trustee_phone: trust.authorised_trustee.phone,
      authorised_trustee_capacity: trust.authorised_trustee.capacity,
      trust_deed_available: trust.trust_deed_available,
      letters_of_authority_available: trust.letters_of_authority_available,
      trust_resolution_available: trust.resolution_available,
      all_trustees_signing: trust.all_trustees_signing,
      authority_basis: trust.authority_basis,
    } : {}),
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
