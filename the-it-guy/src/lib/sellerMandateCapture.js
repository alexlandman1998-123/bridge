import { SELLER_MANDATE_WORDING_RELEASE, SELLER_MANDATE_AGENCY_APPROVALS } from '../core/documents/sellerMandateWordingRelease.js'
// Captured instructions only. This does not select or approve contractual wording.
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const pick = (value, keys, fallback = '') => {
  const key = keys.find(key => own(value, key) && value[key] !== undefined && value[key] !== null)
  return key ? text(value[key]) : text(fallback)
}

export const MANDATE_CAPTURE_STATUS_OPTIONS = [['', 'Not captured'], ['captured', 'Details supplied'], ['none', 'None'], ['not_applicable', 'Not applicable']]
export const MANDATE_VAT_OPTIONS = [['', 'Not captured'], ['inclusive', 'VAT inclusive'], ['exclusive', 'VAT exclusive'], ['no', 'No VAT charged']]
export const MANDATE_AGENCY_FIELDS = [
  ['legalName', 'Contracting legal name'], ['tradingName', 'Trading name (optional)'],
  ['registrationStatus', 'Registration details', 'registration'], ['registrationNumber', 'Registration number'],
  ['address', 'Business address'], ['businessFfcNumber', 'Business FFC number'], ['businessFfcExpiry', 'Business FFC expiry', 'date'], ['businessFfcReference', 'Business FFC evidence reference'],
  ['practitionerName', 'Responsible practitioner'], ['practitionerFfcNumber', 'Practitioner FFC number'], ['practitionerFfcExpiry', 'Practitioner FFC expiry', 'date'], ['practitionerFfcReference', 'Practitioner FFC evidence reference'],
  ['representativeName', 'Authorised agency representative'], ['representativeCapacity', 'Representative capacity'], ['representativeEmail', 'Representative email', 'email'],
  ['noticeEmail', 'Notice email', 'email'], ['noticeAddress', 'Notice address'],
  ['vatStatus', 'VAT registration', 'vatStatus'], ['vatNumber', 'VAT number'],
  ['privacyNoticeUrl', 'Privacy notice URL', 'url'], ['informationOfficerContact', 'Information Officer contact'], ['paiaManualUrl', 'PAIA manual URL', 'url'],
]
export const MANDATE_CAPTURE_GROUPS = [
  { key: 'authority', label: 'Seller capacity and authority', fields: [['capacity', 'Signing capacity'], ['details', 'Authority basis and evidence references', 'textarea']] },
  { key: 'priceExclusions', label: 'Purchase-price exclusions', fields: [['details', 'Items excluded from the commission calculation', 'textarea']] },
  { key: 'buyerExclusions', label: 'Excluded buyers or transactions', fields: [['details', 'Named exclusions and fee treatment', 'textarea']] },
  { key: 'existingIntroductions', label: 'Existing mandates and introductions', fields: [['details', 'Agencies, buyers and introduction dates', 'textarea']] },
  { key: 'marketing', label: 'Marketing commitments', fields: [['details', 'Channels, tasks and responsible people', 'textarea'], ['startDate', 'Agreed preparation / marketing date', 'date'], ['accessDetails', 'Viewing and access arrangements', 'textarea'], ['reporting', 'Seller update frequency and contact']] },
  { key: 'expenses', label: 'Separately approved expenses', fields: [['details', 'Approved items and approval reference', 'textarea'], ['maximumAmount', 'Maximum amount (Rand)', 'number'], ['vatHandling', 'Expense VAT treatment', 'vat'], ['paymentTrigger', 'Agreed payment trigger']] },
  { key: 'annexures', label: 'Attached schedules and annexures', fields: [['details', 'Titles, versions and attachment references', 'textarea']] },
]
const allocationFields = [['rule', 'Allocation rule'], ['agencyAPercentage', 'Agency A share'], ['agencyBPercentage', 'Agency B share'], ['agencyAVatHandling', 'Agency A VAT'], ['agencyBVatHandling', 'Agency B VAT'], ['details', 'Allocation instructions'], ['annexureReference', 'Signed allocation annexure reference']]

export function normalizeSellerMandateType(value) {
  const type = text(value).toLowerCase()
  if (['sole', 'exclusive', 'sole_mandate', 'exclusive_mandate'].includes(type)) return 'sole'
  if (['open', 'open_mandate'].includes(type)) return 'open'
  if (['dual', 'dual_mandate'].includes(type)) return 'dual'
  return type
}

function moneyInput(value) {
  const raw = text(value), amount = raw.replace(/^R\s*/i, '').replace(/[\s,]/g, '')
  return /^\d+(?:\.\d+)?$/.test(amount) ? amount : raw
}

/** Absence stays absent for legacy copies; known blank fields remain explicit blanks. */
export function normalizeSellerMandateCapture(value) {
  if (value === undefined || value === null) return undefined
  const source = record(value)
  // An unfamiliar stored version must never be silently rewritten as v1.
  if (source.version !== undefined && source.version !== 1) return structuredClone(source)
  const select = (group, fields) => Object.fromEntries(fields.map(([key]) => [key, text(record(source[group])[key])]))
  return {
    version: 1,
    agencyA: select('agencyA', MANDATE_AGENCY_FIELDS), agencyB: select('agencyB', MANDATE_AGENCY_FIELDS),
    ...Object.fromEntries(MANDATE_CAPTURE_GROUPS.map(group => [group.key, { status: text(record(source[group.key]).status), ...select(group.key, group.fields) }])),
    allocation: select('allocation', allocationFields),
    notices: select('notices', [['sellerEmail'], ['sellerAddress']]),
  }
}

export function readSellerMandateTerms(value = {}, fallback = {}) {
  const source = record(value), legacy = record(fallback)
  const terms = {
    mandateType: normalizeSellerMandateType(pick(source, ['mandateType'], legacy.mandateType)),
    askingPrice: moneyInput(pick(source, ['askingPrice', 'asking_price', 'price'], legacy.askingPrice)),
    startDate: pick(source, ['startDate', 'mandateStartDate', 'mandate_start_date'], legacy.startDate ?? legacy.mandateStartDate).slice(0, 10),
    endDate: pick(source, ['endDate', 'mandateEndDate', 'mandate_end_date', 'expiryDate', 'mandateExpiryDate', 'mandate_expiry_date'], legacy.endDate ?? legacy.expiryDate).slice(0, 10),
    mandateDuration: pick(source, ['mandateDuration']),
    protectionPeriod: pick(source, ['protectionPeriod', 'protectionPeriodDays', 'mandateProtectionPeriod', 'mandate_protection_period']),
    otherAgencyName: pick(source, ['otherAgencyName', 'coAgencyName', 'co_agency_name']),
    commissionBasis: pick(source, ['commissionBasis', 'commission_basis']),
    commissionPercentage: pick(source, ['commissionPercentage', 'commission_percent', 'mandateCommissionPercentage']),
    commissionAmount: pick(source, ['commissionAmount', 'commission_amount']),
    vatHandling: pick(source, ['vatHandling', 'vat_handling']),
    specialConditions: pick(source, ['specialConditions', 'mandateTerms', 'mandateCommissionTerms']),
  }
  // Infer only the recorded duration of legacy Open copies, never a price or fee.
  if (!terms.mandateDuration) terms.mandateDuration = terms.mandateType === 'open' && !terms.endDate ? 'until_cancelled' : 'fixed'
  if (terms.mandateType === 'open' && terms.mandateDuration === 'until_cancelled') terms.endDate = ''
  const capture = normalizeSellerMandateCapture(source.mandateCapture)
  const review = source.mandateAcceptanceReview
  return { ...terms, ...(capture ? { mandateCapture: capture } : {}), ...(review && typeof review === 'object' ? { mandateAcceptanceReview: {
    authorityVerified: review.authorityVerified === true, disclosureVerified: review.disclosureVerified === true, ffcVerified: review.ffcVerified === true,
    ...Object.fromEntries(['reviewedBy', 'reviewedAt', 'authorityReference', 'disclosureReference', 'agencySchedulesDigest'].map(key => [key, String(review[key] ?? '').trim().slice(0, 500)])),
  } } : {}) }
}

export function buildSellerMandateTermsFormPatch(value = {}) {
  const terms = readSellerMandateTerms(value)
  const capture = validateSellerMandateCapture(value.mandateCapture)
  return {
    mandateType: terms.mandateType, askingPrice: terms.askingPrice,
    otherAgencyName: terms.otherAgencyName, coAgencyName: terms.otherAgencyName,
    mandateDuration: terms.mandateDuration,
    mandateStartDate: terms.startDate, mandate_start_date: terms.startDate, startDate: terms.startDate,
    mandateEndDate: terms.endDate, mandate_end_date: terms.endDate, endDate: terms.endDate, expiryDate: terms.endDate,
    mandateExpiryDate: terms.endDate, mandate_expiry_date: terms.endDate,
    protectionPeriod: terms.protectionPeriod, protectionPeriodDays: terms.protectionPeriod, mandateProtectionPeriod: terms.protectionPeriod, mandate_protection_period: terms.protectionPeriod,
    commissionBasis: terms.commissionBasis, commission_basis: terms.commissionBasis,
    commissionPercentage: terms.commissionBasis === 'fixed' ? '' : terms.commissionPercentage,
    commission_percent: terms.commissionBasis === 'fixed' ? '' : terms.commissionPercentage,
    mandateCommissionPercentage: terms.commissionBasis === 'fixed' ? '' : terms.commissionPercentage,
    commissionAmount: terms.commissionBasis === 'percentage' ? '' : terms.commissionAmount,
    commission_amount: terms.commissionBasis === 'percentage' ? '' : terms.commissionAmount,
    vatHandling: terms.vatHandling, vat_handling: terms.vatHandling,
    specialConditions: terms.specialConditions, mandateTerms: terms.specialConditions, mandateCommissionTerms: terms.specialConditions,
    ...(capture ? { mandateCapture: capture } : {}),
    ...(terms.mandateAcceptanceReview ? { mandateAcceptanceReview: terms.mandateAcceptanceReview } : {}),
  }
}

export function isMandateCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const positive = value => /^\d+(?:\.\d{1,2})?$/.test(text(value)) && Number(value) > 0
const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value))
const url = value => { try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false } }

export function getSellerMandateCaptureMissing(value, { mandateType = '', ownershipType = '' } = {}) {
  const capture = normalizeSellerMandateCapture(value)
  if (!capture) return []
  if (capture.version !== 1) return ['Unsupported mandate capture version; preserve this record and review a replacement']
  const missing = [], type = normalizeSellerMandateType(mandateType)
  const requireValue = (value, label) => { if (!text(value)) missing.push(label) }
  for (const key of type === 'dual' ? ['agencyA', 'agencyB'] : ['agencyA']) {
    const agency = capture[key], label = key === 'agencyA' ? 'Agency A' : 'Agency B'
    for (const field of ['legalName', 'address', 'businessFfcNumber', 'businessFfcReference', 'practitionerName', 'practitionerFfcNumber', 'practitionerFfcReference', 'representativeName', 'representativeCapacity', 'noticeAddress', 'informationOfficerContact']) requireValue(agency[field], `${label}: ${MANDATE_AGENCY_FIELDS.find(([key]) => key === field)[1]}`)
    for (const field of ['businessFfcExpiry', 'practitionerFfcExpiry']) if (!isMandateCalendarDate(agency[field])) missing.push(`${label}: valid ${field === 'businessFfcExpiry' ? 'business' : 'practitioner'} FFC expiry`)
    for (const field of ['noticeEmail', 'representativeEmail']) if (!email(agency[field])) missing.push(`${label}: valid ${field === 'noticeEmail' ? 'notice' : 'representative'} email`)
    for (const field of ['privacyNoticeUrl', 'paiaManualUrl']) if (!url(agency[field])) missing.push(`${label}: ${field === 'privacyNoticeUrl' ? 'privacy notice' : 'PAIA manual'} URL`)
    if (!['captured', 'not_applicable'].includes(agency.registrationStatus)) missing.push(`${label}: registration status`)
    if (agency.registrationStatus === 'captured') requireValue(agency.registrationNumber, `${label}: registration number`)
    if (!['registered', 'not_registered'].includes(agency.vatStatus)) missing.push(`${label}: VAT registration status`)
    if (agency.vatStatus === 'registered') requireValue(agency.vatNumber, `${label}: VAT number`)
  }
  for (const group of MANDATE_CAPTURE_GROUPS) {
    const entry = capture[group.key]
    if (!['captured', 'none', 'not_applicable'].includes(entry.status)) missing.push(`${group.label}: explicit choice`)
    if (entry.status === 'captured') for (const [field, label] of group.fields) requireValue(entry[field], `${group.label}: ${label}`)
  }
  requireValue(capture.authority.capacity, 'Seller signing capacity')
  if (capture.authority.status === 'none' || (capture.authority.status === 'not_applicable' && !['individual', 'married', 'foreign_individual', 'multiple_owners'].includes(text(ownershipType)))) missing.push('Seller authority evidence')
  if (capture.marketing.status !== 'captured') missing.push('Agreed marketing commitments')
  if (capture.marketing.status === 'captured' && !isMandateCalendarDate(capture.marketing.startDate)) missing.push('Valid marketing date')
  if (capture.expenses.status === 'captured') {
    if (!positive(capture.expenses.maximumAmount)) missing.push('Positive maximum approved expense')
    if (!MANDATE_VAT_OPTIONS.some(([key]) => key && key === capture.expenses.vatHandling)) missing.push('Expense VAT treatment')
  }
  if (!email(capture.notices.sellerEmail)) missing.push('Seller notice email')
  requireValue(capture.notices.sellerAddress, 'Seller notice address')
  if (type === 'dual') {
    const allocation = capture.allocation
    if (!['effective_cause', 'agreed_split'].includes(allocation.rule)) missing.push('Dual commission allocation rule')
    for (const field of ['agencyAVatHandling', 'agencyBVatHandling']) if (!MANDATE_VAT_OPTIONS.some(([key]) => key && key === allocation[field])) missing.push(`Dual ${field === 'agencyAVatHandling' ? 'Agency A' : 'Agency B'} VAT treatment`)
    if (allocation.rule === 'agreed_split') {
      const valid = [allocation.agencyAPercentage, allocation.agencyBPercentage].every(value => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) >= 0 && Number(value) <= 100)
      if (!valid || Math.abs(Number(allocation.agencyAPercentage) + Number(allocation.agencyBPercentage) - 100) > 0.00001) missing.push('Dual shares must total 100%')
      requireValue(allocation.details, 'Dual allocation instructions')
      requireValue(allocation.annexureReference, 'Dual allocation annexure reference')
    }
  }
  return [...new Set(missing)]
}

/** Drafts may be incomplete, but malformed choices and oversized values never persist. */
export function validateSellerMandateCapture(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value.version !== undefined && value.version !== 1)) throw new Error('Unsupported mandate capture data.')
  const capture = normalizeSellerMandateCapture(value)
  for (const [group, entries] of Object.entries(capture)) {
    if (group === 'version') continue
    if (own(value, group) && (!value[group] || typeof value[group] !== 'object' || Array.isArray(value[group]))) throw new Error('Invalid mandate capture section.')
    for (const [key, entry] of Object.entries(entries)) {
      const raw = record(value[group])[key]
      if (raw !== undefined && raw !== null && !['string', 'number'].includes(typeof raw)) throw new Error('Mandate capture fields must contain text or numbers.')
      if (entry.length > (['details', 'accessDetails'].includes(key) ? 4000 : 500)) throw new Error('A mandate capture field is too long.')
    }
  }
  for (const group of MANDATE_CAPTURE_GROUPS) if (!MANDATE_CAPTURE_STATUS_OPTIONS.some(([key]) => key === capture[group.key].status)) throw new Error('Invalid mandate capture status.')
  for (const key of ['agencyA', 'agencyB']) {
    if (!['', 'captured', 'not_applicable'].includes(capture[key].registrationStatus) || !['', 'registered', 'not_registered'].includes(capture[key].vatStatus)) throw new Error('Invalid agency registration status.')
  }
  if (!['', 'effective_cause', 'agreed_split'].includes(capture.allocation.rule)) throw new Error('Invalid dual allocation rule.')
  for (const value of [capture.expenses.vatHandling, capture.allocation.agencyAVatHandling, capture.allocation.agencyBVatHandling]) if (!MANDATE_VAT_OPTIONS.some(([key]) => key === value)) throw new Error('Invalid mandate VAT treatment.')
  return capture
}

export function getSellerMandateTermsMissing(value = {}, { requireCapture = true, ownershipType = '' } = {}) {
  const terms = readSellerMandateTerms(value), missing = []
  if (!['sole', 'open', 'dual'].includes(terms.mandateType)) missing.push('Mandate type')
  if (!positive(terms.askingPrice.replace(/^R\s*/i, '').replace(/[\s,]/g, ''))) missing.push('Positive asking price')
  if (!isMandateCalendarDate(terms.startDate)) missing.push('Valid mandate start date')
  const fixed = terms.mandateType !== 'open' || terms.mandateDuration === 'fixed'
  if (!['fixed', 'until_cancelled'].includes(terms.mandateDuration) || (terms.mandateType !== 'open' && terms.mandateDuration !== 'fixed')) missing.push('Mandate duration')
  if (fixed && (!isMandateCalendarDate(terms.endDate) || terms.endDate < terms.startDate)) missing.push('Valid mandate end date on or after start')
  if (!/^\d+$/.test(terms.protectionPeriod) || !Number.isSafeInteger(Number(terms.protectionPeriod))) missing.push('Protection days (enter 0 for none)')
  if (!['percentage', 'fixed'].includes(terms.commissionBasis) || !positive(terms.commissionBasis === 'fixed' ? terms.commissionAmount : terms.commissionPercentage) || (terms.commissionBasis === 'percentage' && Number(terms.commissionPercentage) > 100)) missing.push('Valid commission amount or percentage')
  if (!MANDATE_VAT_OPTIONS.some(([key]) => key && key === terms.vatHandling)) missing.push('Commission VAT treatment')
  if (terms.mandateType === 'dual' && !terms.otherAgencyName) missing.push('A second agency name')
  if (requireCapture) missing.push(...getSellerMandateCaptureMissing(terms.mandateCapture, { mandateType: terms.mandateType, ownershipType }))
  return missing
}

// Capture can be saved before counsel approves the exact revised signing copy.
export function getSellerMandatePreparationIssues(value = {}, options = {}) {
  const missing = getSellerMandateTermsMissing(value, { ...options, requireCapture: value.mandateCapture !== undefined })
  const release = SELLER_MANDATE_WORDING_RELEASE[readSellerMandateTerms(value).mandateType]
  if (value.mandateCapture !== undefined && (release?.approval?.status !== 'approved' || release.approval.wordingDigest !== release.wordingDigest || !release.approval.businessApprover || !release.approval.counselApprover || !release.approval.reference || !release.approval.approvedAt)) missing.push('The full mandate layout is ready for review. Record exact business/legal approval of this wording and contracting-agency schedules before preparing a signing copy')
  if (value.mandateCapture !== undefined && release?.approval?.status === 'approved' && !SELLER_MANDATE_AGENCY_APPROVALS.some(entry => entry.status === 'approved' && entry.wordingDigest === release.wordingDigest)) missing.push('The mandate wording is approved. Record exact business/legal approval of the contracting-agency schedules before preparing a signing copy')
  return missing
}
