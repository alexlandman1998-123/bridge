import {
  BOND_APPLICATION_PREFILL_SOURCE_KEYS,
  BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
  BOND_APPLICATION_PREFILL_SOURCE_PRIORITY,
  getBondApplicationPrefillSource,
} from './bondApplicationPrefillSourceMatrix.js'

export const BOND_APPLICATION_PREFILL_CONFIRMATION_CARD_DEFINITIONS = Object.freeze([
  {
    key: 'application_summary',
    section: 'summary',
    title: 'Application summary',
    description: 'Confirm the purchase and application structure before continuing.',
    fields: [
      { path: 'summary.applicant_name', label: 'Applicant' },
      { path: 'summary.finance_type', label: 'Finance type' },
      { path: 'summary.purchase_price', label: 'Purchase price' },
      { path: 'summary.deposit_contribution', label: 'Deposit' },
      { path: 'summary.buyer_entity_type', label: 'Purchaser type' },
      { path: 'summary.buyer_entity_name', label: 'Entity name' },
      { path: 'summary.buyer_entity_registration_number', label: 'Registration number' },
    ],
  },
  {
    key: 'primary_applicant',
    section: 'personal_details',
    title: 'Primary applicant',
    description: 'Check the applicant identity details already captured.',
    fields: [
      { path: 'applicants.primary.first_name', label: 'First names' },
      { path: 'applicants.primary.last_name', label: 'Surname' },
      { path: 'applicants.primary.id_number', label: 'ID number' },
      { path: 'applicants.primary.passport_number', label: 'Passport number' },
      { path: 'applicants.primary.marital_status', label: 'Marital status' },
      { path: 'applicants.primary.nationality', label: 'Nationality' },
    ],
  },
  {
    key: 'contact_address',
    section: 'contact_address',
    title: 'Contact and address',
    description: 'Confirm how the bond team and banks should contact you.',
    fields: [
      { path: 'contact_address.email_address', label: 'Email' },
      { path: 'contact_address.cellphone_number', label: 'Cellphone' },
      { path: 'contact_address.residential_address_street', label: 'Street' },
      { path: 'contact_address.residential_address_suburb', label: 'Suburb' },
      { path: 'contact_address.residential_address_city', label: 'City' },
      { path: 'contact_address.residential_address_postal_code', label: 'Postal code' },
    ],
  },
  {
    key: 'finance_property',
    section: 'loan_details',
    title: 'Finance and property',
    description: 'Review the property and requested bond amount from the OTP and transaction setup.',
    fields: [
      { path: 'summary.property_reference', label: 'Property' },
      { path: 'summary.development_name', label: 'Development' },
      { path: 'summary.unit_reference', label: 'Unit' },
      { path: 'loan_details.street_or_complex', label: 'Street or complex' },
      { path: 'loan_details.suburb', label: 'Suburb' },
      { path: 'loan_details.amount_to_be_registered', label: 'Requested bond' },
    ],
  },
])

export const BOND_APPLICATION_PREFILL_CONFIRMATION_VERSION = 'phase-7-v1'

const SECTION_KEY_ALIASES = Object.freeze({
  application_summary: 'summary',
  summary: 'summary',
})

function normalizeSectionKey(section = '') {
  const key = String(section || '').trim()
  return SECTION_KEY_ALIASES[key] || key
}

function getSourceByPath(metadata = {}) {
  return metadata?.sourceByPath && typeof metadata.sourceByPath === 'object' ? metadata.sourceByPath : {}
}

function getMissingFields(metadata = {}) {
  return Array.isArray(metadata?.missingFields) ? metadata.missingFields : []
}

function getAppliedFields(metadata = {}) {
  return Array.isArray(metadata?.appliedFields) ? metadata.appliedFields : []
}

function getPreservedFields(metadata = {}) {
  return Array.isArray(metadata?.preservedFields) ? metadata.preservedFields : []
}

function getConfirmationSections(metadata = {}) {
  const sections = metadata?.confirmations?.sections
  return sections && typeof sections === 'object' && !Array.isArray(sections) ? sections : {}
}

function getSourceLabel(sourceKey = '') {
  return getBondApplicationPrefillSource(sourceKey)?.label || sourceKey || 'Existing data'
}

function isMeaningfulValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function valueForDisplay(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value).trim()
}

function pathSegments(path = '') {
  return String(path || '')
    .split('.')
    .filter(Boolean)
}

function getArrayRoleItem(items = [], roleKey = '') {
  if (!Array.isArray(items)) return undefined
  return items.find((item) => String(item?.key || '').trim().toLowerCase() === String(roleKey || '').trim().toLowerCase())
}

function getApplicationValue(application = {}, path = '') {
  const segments = pathSegments(path)
  if (segments[0] === 'applicants') {
    const applicant = getArrayRoleItem(application?.applicants, segments[1])
    return segments.slice(2).reduce((cursor, segment) => cursor?.[segment], applicant)
  }
  return segments.reduce((cursor, segment) => cursor?.[segment], application)
}

function getSourceDisplay(source = {}) {
  if (source.sourceKey === BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication) {
    return {
      status: 'saved',
      label: 'Saved answer',
      detail: 'Already in this application',
    }
  }

  return {
    status: source.applied ? 'prefilled' : 'confirmed',
    label: 'Already filled',
    detail: getSourceLabel(source.sourceKey),
  }
}

export function normalizeBondApplicationPrefillSectionKey(section = '') {
  return normalizeSectionKey(section)
}

export function getBondApplicationPrefillFieldReview(metadata = {}, path = '', {
  required = false,
  label = '',
  section = '',
  currentValue = undefined,
} = {}) {
  const source = getSourceByPath(metadata)[path]
  if (source) {
    const display = getSourceDisplay(source)
    return {
      path,
      label: display.label,
      detail: display.detail,
      status: display.status,
      sourceKey: source.sourceKey,
      sourceLabel: source.sourceLabel || getSourceLabel(source.sourceKey),
      sourcePath: source.sourcePath || '',
      fieldLabel: source.label || label,
      section: normalizeSectionKey(source.section || section),
      applied: Boolean(source.applied),
    }
  }

  const missing = getMissingFields(metadata).find((item) => item.path === path)
  const hasCurrentValue = isMeaningfulValue(currentValue)
  if ((missing || required) && !hasCurrentValue) {
    return {
      path,
      label: 'Needs input',
      detail: 'Required for submission',
      status: 'missing',
      sourceKey: '',
      sourceLabel: '',
      sourcePath: '',
      fieldLabel: missing?.label || label,
      section: normalizeSectionKey(missing?.section || section),
      applied: false,
    }
  }

  return null
}

export function buildBondApplicationPrefillReviewModel(metadata = {}, {
  activeSection = '',
  matrix = BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
} = {}) {
  const sourceByPath = getSourceByPath(metadata)
  const missingFields = getMissingFields(metadata)
  const appliedFields = getAppliedFields(metadata)
  const preservedFields = getPreservedFields(metadata)
  const missingPathSet = new Set(missingFields.map((item) => item.path))
  const appliedPathSet = new Set(appliedFields)
  const preservedPathSet = new Set(preservedFields)
  const auditedFields = Array.isArray(matrix) ? matrix : []
  const sectionMap = new Map()

  for (const field of auditedFields) {
    const sectionKey = normalizeSectionKey(field.section)
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, {
        key: sectionKey,
        label: sectionKey,
        totalFields: 0,
        sourcedFields: 0,
        appliedFields: 0,
        preservedFields: 0,
        missingRequiredFields: 0,
        missingRequiredLabels: [],
      })
    }

    const summary = sectionMap.get(sectionKey)
    summary.totalFields += 1
    if (sourceByPath[field.path]) summary.sourcedFields += 1
    if (appliedPathSet.has(field.path)) summary.appliedFields += 1
    if (preservedPathSet.has(field.path)) summary.preservedFields += 1
    if (missingPathSet.has(field.path)) {
      summary.missingRequiredFields += 1
      summary.missingRequiredLabels.push(field.label)
    }
  }

  const sourceCounts = BOND_APPLICATION_PREFILL_SOURCE_PRIORITY
    .map((source) => ({
      key: source.key,
      label: source.label,
      count: Object.values(sourceByPath).filter((item) => item.sourceKey === source.key).length,
    }))
    .filter((source) => source.count > 0)

  const activeSectionKey = normalizeSectionKey(activeSection)
  const sectionSummaries = Array.from(sectionMap.values())
  const activeSectionSummary = sectionMap.get(activeSectionKey) || null
  const sourcedFieldCount = Object.keys(sourceByPath).length
  const totalAuditedFields = auditedFields.length
  const confirmationSections = getConfirmationSections(metadata)
  const confirmedSectionKeys = getBondApplicationPrefillConfirmedSectionKeys(metadata)

  return {
    version: metadata?.version || '',
    generatedAt: metadata?.generatedAt || '',
    totalAuditedFields,
    sourcedFieldCount,
    appliedFieldCount: appliedFields.length,
    preservedFieldCount: preservedFields.length,
    missingRequiredFieldCount: missingFields.length,
    coveragePercent: totalAuditedFields > 0 ? Math.round((sourcedFieldCount / totalAuditedFields) * 100) : 0,
    sourceCounts,
    sectionSummaries,
    confirmedSectionKeys,
    confirmedSectionCount: confirmedSectionKeys.length,
    confirmationConfidenceBySection: Object.fromEntries(
      Object.entries(confirmationSections).map(([key, confirmation]) => [
        normalizeSectionKey(key),
        confirmation?.confidence || '',
      ]),
    ),
    activeSection: activeSectionKey,
    activeSectionSummary,
    hasMetadata: Boolean(metadata?.version),
  }
}

export function buildBondApplicationPrefillConfirmationCards(application = {}, metadata = {}, {
  activeSection = '',
  cardDefinitions = BOND_APPLICATION_PREFILL_CONFIRMATION_CARD_DEFINITIONS,
} = {}) {
  const activeSectionKey = normalizeSectionKey(activeSection)
  const definitions = Array.isArray(cardDefinitions) ? cardDefinitions : []

  return definitions
    .filter((card) => !activeSectionKey || normalizeSectionKey(card.section) === activeSectionKey)
    .map((card) => {
      const fields = card.fields.map((field) => {
        const value = getApplicationValue(application, field.path)
        const review = getBondApplicationPrefillFieldReview(metadata, field.path, {
          label: field.label,
          section: card.section,
          currentValue: value,
        })
        return {
          ...field,
          value,
          valueLabel: valueForDisplay(value),
          hasValue: isMeaningfulValue(value),
          review,
        }
      })
      const confirmedFields = fields.filter((field) => field.hasValue).length
      const missingFields = fields.filter((field) => !field.hasValue)
      const firstMissingField = missingFields[0] || null

      return {
        key: card.key,
        section: normalizeSectionKey(card.section),
        title: card.title,
        description: card.description,
        fields,
        confirmedFields,
        missingFields: missingFields.length,
        missingFieldLabels: missingFields.map((field) => field.label),
        firstMissingFieldPath: firstMissingField?.path || '',
        firstMissingFieldLabel: firstMissingField?.label || '',
        totalFields: fields.length,
        complete: missingFields.length === 0,
      }
    })
}

export function getBondApplicationPrefillConfirmedSectionKeys(metadata = {}) {
  return Object.entries(getConfirmationSections(metadata))
    .filter(([, confirmation]) => confirmation?.confirmed)
    .map(([sectionKey]) => normalizeSectionKey(sectionKey))
}

export function buildBondApplicationPrefillConfirmationMetadata(metadata = {}, cards = [], {
  confirmedSectionKeys = [],
  now = new Date().toISOString(),
} = {}) {
  const confirmedSectionSet = new Set((Array.isArray(confirmedSectionKeys) ? confirmedSectionKeys : []).map(normalizeSectionKey))
  const existingSections = getConfirmationSections(metadata)
  const nextSections = {}

  for (const card of Array.isArray(cards) ? cards : []) {
    const sectionKey = normalizeSectionKey(card.section)
    if (!confirmedSectionSet.has(sectionKey) || !card.complete) continue
    const existing = existingSections[sectionKey] || {}
    nextSections[sectionKey] = {
      section: sectionKey,
      confirmed: true,
      confirmedAt: existing.confirmedAt || now,
      updatedAt: now,
      confidence: 'buyer_confirmed_prefill',
      cardKeys: [card.key],
      confirmedFields: card.confirmedFields,
      totalFields: card.totalFields,
      missingFields: card.missingFields,
      fieldPaths: card.fields.map((field) => field.path),
    }
  }

  return {
    ...metadata,
    confirmations: {
      ...(metadata?.confirmations || {}),
      version: BOND_APPLICATION_PREFILL_CONFIRMATION_VERSION,
      updatedAt: now,
      confirmedSectionKeys: Object.keys(nextSections).sort(),
      sections: nextSections,
    },
  }
}

export function clearBondApplicationPrefillSectionConfirmation(metadata = {}, sectionKey = '', {
  now = new Date().toISOString(),
} = {}) {
  const normalizedSectionKey = normalizeSectionKey(sectionKey)
  const existingSections = getConfirmationSections(metadata)
  const nextSections = Object.fromEntries(
    Object.entries(existingSections).filter(([key]) => normalizeSectionKey(key) !== normalizedSectionKey),
  )

  return {
    ...metadata,
    confirmations: {
      ...(metadata?.confirmations || {}),
      version: BOND_APPLICATION_PREFILL_CONFIRMATION_VERSION,
      updatedAt: now,
      confirmedSectionKeys: Object.keys(nextSections).sort(),
      sections: nextSections,
    },
  }
}
