import { csvEscape, pickImportValue } from '../../lib/csvImport.js'
import { resolveRentalLeadRole } from './rentalLeadPipelineModel.js'

export const RENTAL_LEAD_IMPORT_VERSION = 'arch9_rental_lead_import_v2'
export const RENTAL_LEAD_INGESTION_SOURCES = Object.freeze(['manual', 'manual_import', 'website', 'property24', 'private_property', 'whatsapp', 'referral', 'api'])

export const RENTAL_LEAD_IMPORT_HEADERS = Object.freeze([
  'Role', 'First Name', 'Last Name', 'Email', 'Phone', 'Source', 'Campaign',
  'Property Address', 'Property Type', 'Expected Monthly Rent',
  'Desired Area', 'Monthly Budget', 'Bedrooms', 'Occupation Date', 'Pets',
  'Portfolio ID', 'Property ID', 'Unit ID', 'Vacancy ID', 'Privacy Consent', 'Marketing Consent', 'Screening Consent', 'Notes',
])

const text = (value) => String(value ?? '').trim()
const normalize = (value) => text(value).toLowerCase()
const numberOrEmpty = (value) => text(value) === '' ? '' : Number(value)
const sourceKey = (value) => normalize(value).replace(/[\s-]+/g, '_')

export function normaliseRentalLeadIngestionSource(value = '') {
  const key = sourceKey(value)
  const aliases = { property_24: 'property24', privateproperty: 'private_property', manual_import: 'manual_import', csv: 'manual_import', web: 'website' }
  return RENTAL_LEAD_INGESTION_SOURCES.includes(aliases[key] || key) ? aliases[key] || key : ''
}

export function getRentalLeadIngestionSourceLabel(value = '') {
  return ({ manual: 'Manual', manual_import: 'Manual Import', website: 'Website', property24: 'Property24', private_property: 'Private Property', whatsapp: 'WhatsApp', referral: 'Referral', api: 'API' })[normaliseRentalLeadIngestionSource(value)] || 'Unknown'
}

function inferRole(row = {}) {
  const explicit = text(pickImportValue(row, ['Role', 'role', 'Rental Role', 'rental_role']))
  if (explicit) return resolveRentalLeadRole(explicit)
  return text(pickImportValue(row, ['Property Address', 'property_address', 'Expected Monthly Rent', 'expected_monthly_rent'])) ? 'landlord' : 'tenant'
}

function duplicateKeys(values = {}) {
  return [
    text(values.email) ? `email:${normalize(values.email)}` : '',
    text(values.phone) ? `phone:${text(values.phone).replace(/[^+\d]/g, '')}` : '',
  ].filter(Boolean)
}

export function createRentalLeadImportTemplateCsv() {
  return `${RENTAL_LEAD_IMPORT_HEADERS.map(csvEscape).join(',')}\n`
}

export function mapRentalLeadImportRow(row = {}, { organisationId = '', defaultSource = 'Manual Import' } = {}) {
  const pick = (keys) => pickImportValue(row, keys)
  const role = inferRole(row)
  return {
    rowNumber: Number(row.__rowNumber) || null,
    role,
    firstName: pick(['First Name', 'first_name', 'firstName', 'Name', 'name', 'Full Name', 'full_name']),
    lastName: pick(['Last Name', 'last_name', 'lastName']),
    email: pick(['Email', 'email']),
    phone: pick(['Phone', 'phone', 'Mobile', 'mobile']),
    source: getRentalLeadIngestionSourceLabel(pick(['Source', 'source']) || defaultSource),
    ingestionSource: normaliseRentalLeadIngestionSource(pick(['Source', 'source']) || defaultSource),
    campaign: pick(['Campaign', 'campaign', 'Campaign Name', 'campaign_name']),
    propertyAddress: pick(['Property Address', 'property_address', 'Address', 'address']),
    propertyType: pick(['Property Type', 'property_type']),
    expectedMonthlyRent: numberOrEmpty(pick(['Expected Monthly Rent', 'expected_monthly_rent', 'Monthly Rent', 'monthly_rent'])),
    desiredArea: pick(['Desired Area', 'desired_area', 'Area', 'area', 'Suburb', 'suburb']),
    monthlyBudget: numberOrEmpty(pick(['Monthly Budget', 'monthly_budget', 'Budget', 'budget'])),
    bedrooms: numberOrEmpty(pick(['Bedrooms', 'bedrooms'])),
    occupationDate: pick(['Occupation Date', 'occupation_date', 'Move Date', 'move_date']),
    pets: pick(['Pets', 'pets']),
    portfolioId: pick(['Portfolio ID', 'portfolio_id']),
    propertyId: pick(['Property ID', 'property_id']),
    unitId: pick(['Unit ID', 'unit_id']),
    vacancyId: pick(['Vacancy ID', 'vacancy_id']),
    consents: {
      privacy: pick(['Privacy Consent', 'privacy_consent', 'privacy']) || 'not_captured',
      marketing: pick(['Marketing Consent', 'marketing_consent', 'marketing']) || 'not_captured',
      screening: pick(['Screening Consent', 'screening_consent', 'screening']) || 'not_captured',
    },
    notes: pick(['Notes', 'notes', 'Message', 'message']),
    organisationId: text(organisationId),
  }
}

export function validateRentalLeadImportRow(candidate = {}) {
  const errors = []
  if (!text(candidate.organisationId)) errors.push('No active organisation is selected.')
  if (!candidate.ingestionSource) errors.push('Choose a supported rental lead source.')
  if (!text(candidate.firstName)) errors.push('First name is required.')
  if (!text(candidate.phone) && !text(candidate.email)) errors.push('A phone number or email address is required.')
  if (candidate.role === 'landlord' && !text(candidate.propertyAddress)) errors.push('Property address is required for a landlord lead.')
  if (candidate.role === 'tenant' && !text(candidate.desiredArea)) errors.push('Desired area is required for a tenant lead.')
  if (text(candidate.expectedMonthlyRent) && !Number.isFinite(Number(candidate.expectedMonthlyRent))) errors.push('Expected monthly rent must be a number.')
  if (text(candidate.monthlyBudget) && !Number.isFinite(Number(candidate.monthlyBudget))) errors.push('Monthly budget must be a number.')
  return errors
}

export function buildRentalLeadImportAuditContext(candidate = {}, context = {}) {
  return {
    method: 'csv_import', source: normaliseRentalLeadIngestionSource(candidate.ingestionSource || candidate.source),
    batchId: text(context.batchId), importedAt: text(context.importedAt) || new Date().toISOString(), importedBy: text(context.importedBy),
  }
}

export function buildRentalLeadImportPreview(rows = [], { organisationId = '', existingLeads = [], defaultSource = 'Manual Import' } = {}) {
  const knownKeys = new Set((Array.isArray(existingLeads) ? existingLeads : []).flatMap((lead) => duplicateKeys(lead)))
  const importedKeys = new Set()
  const previewRows = (Array.isArray(rows) ? rows : []).map((row, index) => {
    const candidate = mapRentalLeadImportRow(row, { organisationId, defaultSource })
    const errors = validateRentalLeadImportRow(candidate)
    const keys = duplicateKeys(candidate)
    const matchesExisting = keys.filter((key) => knownKeys.has(key))
    const matchesImport = keys.filter((key) => importedKeys.has(key))
    keys.forEach((key) => importedKeys.add(key))
    const duplicateReason = matchesExisting.length ? 'Matches an existing rental lead.' : matchesImport.length ? 'Duplicates another row in this file.' : ''
    const status = errors.length ? 'invalid' : duplicateReason ? 'possible_duplicate' : 'ready'
    return { id: `${candidate.rowNumber || index + 1}:${index}`, candidate, errors, duplicateReason, status, importable: status === 'ready' }
  })
  return {
    version: RENTAL_LEAD_IMPORT_VERSION,
    rows: previewRows,
    summary: {
      total: previewRows.length,
      ready: previewRows.filter((row) => row.status === 'ready').length,
      invalid: previewRows.filter((row) => row.status === 'invalid').length,
      possibleDuplicates: previewRows.filter((row) => row.status === 'possible_duplicate').length,
    },
  }
}
