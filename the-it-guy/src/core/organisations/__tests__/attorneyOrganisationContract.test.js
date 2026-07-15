import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ATTORNEY_ORGANISATION_CONTRACT_VERSION,
  ATTORNEY_ORGANISATION_FIELD_CONTRACT,
  ATTORNEY_ORGANISATION_SCHEMA_GAPS,
  buildAttorneyOrganisationDriftReport,
} from '../attorneyOrganisationContract.js'

assert.equal(ATTORNEY_ORGANISATION_CONTRACT_VERSION, 'attorney_organisation_identity_v2')
assert.equal(new Set(ATTORNEY_ORGANISATION_FIELD_CONTRACT.map((field) => field.key)).size, ATTORNEY_ORGANISATION_FIELD_CONTRACT.length)
assert.deepEqual(ATTORNEY_ORGANISATION_SCHEMA_GAPS, [])

const firm = {
  id: 'firm-1',
  organisation_id: 'org-1',
  name: 'Example Legal',
  registration_number: '2020/123456/07',
  vat_number: '4123456789',
  website: 'https://example.co.za/',
  email: 'INFO@EXAMPLE.CO.ZA',
  phone: '+27 (11) 555 0100',
  address_line_1: '12 Main Road',
  address_line_2: 'Suite 4',
  city: 'Johannesburg',
  province: 'Gauteng',
  postal_code: '2000',
  country: 'South Africa',
  logo_url: 'https://cdn.example.co.za/old-logo.png',
}

const branding = {
  firm_id: 'firm-1',
  logo_url: 'https://cdn.example.co.za/logo.png',
  logo_dark_url: 'https://cdn.example.co.za/logo-dark.png',
  primary_colour: '#112233',
  secondary_colour: '#445566',
}

const organisation = {
  id: 'org-1',
  type: 'attorney_firm',
  name: 'Example Legal',
  display_name: 'Example Legal',
  legal_name: 'Example Legal',
  registration_number: '2020/123456/07',
  vat_number: '4123456789',
  website: 'https://example.co.za',
  company_email: 'info@example.co.za',
  company_phone: '+27115550100',
  address_line_1: '12 Main Road',
  address_line_2: 'Suite 4',
  city: 'Johannesburg',
  province: 'Gauteng',
  postal_code: '2000',
  country: 'South Africa',
  logo_url: 'https://cdn.example.co.za/logo.png',
  logo_dark_url: 'https://cdn.example.co.za/logo-dark.png',
  primary_colour: '#112233',
  secondary_colour: '#445566',
}

const aligned = buildAttorneyOrganisationDriftReport({
  firms: [firm],
  organisations: [organisation],
  brandingRows: [branding],
})
assert.equal(aligned.summary.firms, 1)
assert.equal(aligned.summary.linked, 1)
assert.equal(aligned.summary.healthy, 1)

const drifted = buildAttorneyOrganisationDriftReport({
  firms: [firm, { id: 'firm-2', name: 'Unlinked Legal' }],
  organisations: [{ ...organisation, website: '', address_line_2: 'Wrong suite', logo_url: '' }],
  brandingRows: [branding],
})

assert.equal(drifted.summary.firms, 2)
assert.equal(drifted.summary.missingLinks, 1)
assert.equal(drifted.summary.missingCanonicalValues, 2)
assert.equal(drifted.summary.valueMismatches, 1)
assert.equal(drifted.summary.schemaGaps, 0)
assert.equal(drifted.rows[0].issues.some((issue) => issue.field === 'website' && issue.kind === 'missing_canonical_value'), true)
assert.equal(drifted.rows[0].issues.some((issue) => issue.field === 'addressLine2' && issue.kind === 'value_mismatch'), true)
assert.equal(drifted.rows[0].issues.some((issue) => issue.field === 'logoUrl' && issue.kind === 'missing_canonical_value'), true)
assert.equal('expected' in drifted.rows[0].issues.find((issue) => issue.field === 'website'), false)

const diagnostic = buildAttorneyOrganisationDriftReport({
  firms: [firm],
  organisations: [organisation],
  brandingRows: [branding],
  environmentIssues: [{ kind: 'missing_expected_columns', table: 'attorney_firm_branding' }],
  includeValues: true,
})
const logoIssue = diagnostic.rows[0].issues.find((issue) => issue.field === 'logoUrl')
assert.equal(logoIssue, undefined)
assert.equal(diagnostic.rows[0].issues.find((issue) => issue.field === 'vatNumber'), undefined)
assert.equal(diagnostic.summary.environmentIssues, 1)
assert.equal(diagnostic.environmentIssues[0].table, 'attorney_firm_branding')

const reporterSource = readFileSync(
  new URL('../../../../scripts/report-attorney-organisation-drift.mjs', import.meta.url),
  'utf8',
)
assert.match(reporterSource, /\.from\(table\)\.select\(columns\)/, 'Phase 0 reporter must use select queries.')
assert.doesNotMatch(
  reporterSource,
  /\.(insert|update|upsert|delete)\s*\(/,
  'Phase 0 reporter must remain read-only.',
)
assert.match(reporterSource, /--include-values/, 'Sensitive compared values must require an explicit option.')

console.log('attorney organisation Phase 0 contract and drift diagnostics passed')
