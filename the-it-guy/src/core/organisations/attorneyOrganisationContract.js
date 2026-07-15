export const ATTORNEY_ORGANISATION_CONTRACT_VERSION = 'attorney_organisation_identity_v2'

export const ATTORNEY_ORGANISATION_FIELD_CONTRACT = Object.freeze([
  { key: 'name', owner: 'organisations', canonicalPath: 'name', firmPath: 'name', required: true },
  { key: 'displayName', owner: 'organisations', canonicalPath: 'display_name', firmPath: 'name', required: true },
  { key: 'legalName', owner: 'organisations', canonicalPath: 'legal_name', firmPath: 'name', required: true },
  { key: 'registrationNumber', owner: 'organisations', canonicalPath: 'registration_number', firmPath: 'registration_number' },
  { key: 'vatNumber', owner: 'organisations', canonicalPath: 'vat_number', firmPath: 'vat_number' },
  { key: 'website', owner: 'organisations', canonicalPath: 'website', firmPath: 'website', comparison: 'url' },
  { key: 'email', owner: 'organisations', canonicalPath: 'company_email', firmPath: 'email', comparison: 'email' },
  { key: 'phone', owner: 'organisations', canonicalPath: 'company_phone', firmPath: 'phone', comparison: 'phone' },
  { key: 'addressLine1', owner: 'organisations', canonicalPath: 'address_line_1', firmPath: 'address_line_1' },
  { key: 'addressLine2', owner: 'organisations', canonicalPath: 'address_line_2', firmPath: 'address_line_2' },
  { key: 'city', owner: 'organisations', canonicalPath: 'city', firmPath: 'city' },
  { key: 'province', owner: 'organisations', canonicalPath: 'province', firmPath: 'province' },
  { key: 'postalCode', owner: 'organisations', canonicalPath: 'postal_code', firmPath: 'postal_code' },
  { key: 'country', owner: 'organisations', canonicalPath: 'country', firmPath: 'country' },
  {
    key: 'logoUrl',
    owner: 'organisations',
    canonicalPath: 'logo_url',
    firmPath: 'logo_url',
    brandingPath: 'logo_url',
    comparison: 'url',
  },
  {
    key: 'logoBucket',
    owner: 'organisations',
    canonicalPath: 'logo_bucket',
    brandingPath: 'logo_bucket',
  },
  {
    key: 'logoPath',
    owner: 'organisations',
    canonicalPath: 'logo_path',
    brandingPath: 'logo_path',
  },
  {
    key: 'logoDarkUrl',
    owner: 'organisations',
    canonicalPath: 'logo_dark_url',
    brandingPath: 'logo_dark_url',
    comparison: 'url',
  },
  {
    key: 'logoDarkBucket',
    owner: 'organisations',
    canonicalPath: 'logo_dark_bucket',
    brandingPath: 'logo_dark_bucket',
  },
  {
    key: 'logoDarkPath',
    owner: 'organisations',
    canonicalPath: 'logo_dark_path',
    brandingPath: 'logo_dark_path',
  },
  {
    key: 'primaryColour',
    owner: 'organisations',
    canonicalPath: 'primary_colour',
    firmPath: 'primary_colour',
    brandingPath: 'primary_colour',
  },
  {
    key: 'secondaryColour',
    owner: 'organisations',
    canonicalPath: 'secondary_colour',
    firmPath: 'secondary_colour',
    brandingPath: 'secondary_colour',
  },
])

export const ATTORNEY_ORGANISATION_SCHEMA_GAPS = Object.freeze([])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function readPath(value, path = '') {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => current?.[key], value)
}

function normalizeComparable(value, comparison = 'text') {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (comparison === 'email') return normalized.toLowerCase()
  if (comparison === 'phone') return normalized.replace(/[\s()-]/g, '')
  if (comparison === 'url') return normalized.toLowerCase().replace(/\/+$/, '')
  return normalized.replace(/\s+/g, ' ')
}

function resolveSourceValue(contract, firm, branding) {
  const brandingValue = contract.brandingPath ? readPath(branding, contract.brandingPath) : null
  const firmValue = contract.firmPath ? readPath(firm, contract.firmPath) : null
  return normalizeText(brandingValue) || normalizeText(firmValue)
}

function safeIssue(issue, includeValues) {
  if (includeValues) return issue
  const { expected, actual, ...safe } = issue
  return {
    ...safe,
    expectedPresent: Boolean(normalizeText(expected)),
    actualPresent: Boolean(normalizeText(actual)),
  }
}

export function buildAttorneyOrganisationDriftReport({
  firms = [],
  organisations = [],
  brandingRows = [],
  environmentIssues = [],
  includeValues = false,
} = {}) {
  const organisationById = new Map((organisations || []).map((row) => [normalizeText(row?.id), row]))
  const brandingByFirmId = new Map((brandingRows || []).map((row) => [normalizeText(row?.firm_id), row]))

  const rows = (firms || []).map((firm) => {
    const firmId = normalizeText(firm?.id)
    const organisationId = normalizeText(firm?.organisation_id)
    const organisation = organisationById.get(organisationId) || null
    const branding = brandingByFirmId.get(firmId) || null
    const issues = []

    if (!organisationId) {
      issues.push({ kind: 'missing_organisation_link', firmId, field: 'organisation_id' })
    } else if (!organisation) {
      issues.push({ kind: 'missing_organisation_row', firmId, organisationId, field: 'organisation_id' })
    }

    if (organisation && normalizeText(organisation.type) !== 'attorney_firm') {
      issues.push(safeIssue({
        kind: 'type_mismatch',
        firmId,
        organisationId,
        field: 'type',
        expected: 'attorney_firm',
        actual: organisation.type,
      }, includeValues))
    }

    if (organisation) {
      for (const contract of ATTORNEY_ORGANISATION_FIELD_CONTRACT) {
        const sourceValue = resolveSourceValue(contract, firm, branding)
        const canonicalValue = normalizeText(readPath(organisation, contract.canonicalPath))
        if (!sourceValue && !contract.required) continue

        if (!canonicalValue) {
          issues.push(safeIssue({
            kind: 'missing_canonical_value',
            firmId,
            organisationId,
            field: contract.key,
            expected: sourceValue,
            actual: canonicalValue,
          }, includeValues))
          continue
        }

        if (normalizeComparable(sourceValue, contract.comparison) !== normalizeComparable(canonicalValue, contract.comparison)) {
          issues.push(safeIssue({
            kind: 'value_mismatch',
            firmId,
            organisationId,
            field: contract.key,
            expected: sourceValue,
            actual: canonicalValue,
          }, includeValues))
        }
      }
    }

    return {
      firmId,
      organisationId: organisationId || null,
      linked: Boolean(organisationId && organisation),
      healthy: issues.length === 0,
      issues,
    }
  })

  const allIssues = rows.flatMap((row) => row.issues)
  const countKind = (kind) => allIssues.filter((issue) => issue.kind === kind).length

  return {
    contractVersion: ATTORNEY_ORGANISATION_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    summary: {
      firms: rows.length,
      linked: rows.filter((row) => row.linked).length,
      healthy: rows.filter((row) => row.healthy).length,
      withDrift: rows.filter((row) => !row.healthy).length,
      missingLinks: countKind('missing_organisation_link'),
      missingOrganisationRows: countKind('missing_organisation_row'),
      missingCanonicalValues: countKind('missing_canonical_value'),
      valueMismatches: countKind('value_mismatch') + countKind('type_mismatch'),
      schemaGaps: countKind('canonical_schema_gap'),
      environmentIssues: environmentIssues.length,
    },
    environmentIssues,
    rows,
  }
}
