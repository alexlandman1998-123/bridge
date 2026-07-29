export const BOND_APPLICATION_TRANSFORMATION_REGISTRY_VERSION = 'phase-8-transformations-v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeDate(value) {
  const text = normalizeText(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function normalizeDecimalString(value) {
  if (value && typeof value === 'object' && 'amount' in value) return normalizeDecimalString(value.amount)
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2)
  const text = normalizeText(value).replace(/\s/g, '').replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const [major, fraction = ''] = text.split('.')
  return `${major}.${`${fraction}00`.slice(0, 2)}`
}

function enumMap(value, mapping = {}) {
  const key = normalizeText(value).toLowerCase()
  return mapping[key] ?? mapping[normalizeText(value)] ?? null
}

export const BOND_APPLICATION_TRANSFORMATIONS = {
  date_to_yyyy_mm_dd: {
    key: 'date_to_yyyy_mm_dd',
    transform: normalizeDate,
  },
  boolean_to_yes_no: {
    key: 'boolean_to_yes_no',
    transform(value) {
      if (value === true) return 'Yes'
      if (value === false) return 'No'
      const text = normalizeText(value).toLowerCase()
      if (['yes', 'y', 'true', '1'].includes(text)) return 'Yes'
      if (['no', 'n', 'false', '0'].includes(text)) return 'No'
      return null
    },
  },
  boolean_to_y_n: {
    key: 'boolean_to_y_n',
    transform(value) {
      const normalized = BOND_APPLICATION_TRANSFORMATIONS.boolean_to_yes_no.transform(value)
      if (normalized === 'Yes') return 'Y'
      if (normalized === 'No') return 'N'
      return null
    },
  },
  exact_money_to_decimal_string: {
    key: 'exact_money_to_decimal_string',
    transform: normalizeDecimalString,
  },
  exact_money_to_minor_units: {
    key: 'exact_money_to_minor_units',
    transform(value) {
      const decimal = normalizeDecimalString(value)
      if (!decimal) return null
      const negative = decimal.startsWith('-')
      const unsigned = negative ? decimal.slice(1) : decimal
      const [major, fraction = '00'] = unsigned.split('.')
      const result = `${major}${`${fraction}00`.slice(0, 2)}`.replace(/^0+(?=\d)/, '')
      return Number(`${negative ? '-' : ''}${result || '0'}`)
    },
  },
  enum_to_destination_enum: {
    key: 'enum_to_destination_enum',
    transform: enumMap,
  },
  participant_role_to_destination_role: {
    key: 'participant_role_to_destination_role',
    transform(value, mapping = {
      primary_applicant: 'primary_applicant',
      co_applicant: 'co_applicant',
      surety: 'surety',
    }) {
      return enumMap(value, mapping)
    },
  },
  document_type_to_destination_category: {
    key: 'document_type_to_destination_category',
    transform(value, mapping = {}) {
      return enumMap(value, mapping)
    },
  },
  phone_to_e164_or_block: {
    key: 'phone_to_e164_or_block',
    transform(value) {
      const text = normalizeText(value).replace(/\s/g, '')
      if (!text) return null
      if (/^\+[1-9]\d{7,14}$/.test(text)) return text
      return { blocked: true, reason: 'phone_not_e164', value: text }
    },
  },
}

export function applyBondApplicationTransformation(key, value, options = {}) {
  const entry = BOND_APPLICATION_TRANSFORMATIONS[key]
  if (!entry) throw new Error(`Unknown bond application export transformation: ${key}`)
  return entry.transform(value, options)
}

