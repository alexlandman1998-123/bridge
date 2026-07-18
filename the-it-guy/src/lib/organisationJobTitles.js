export const ORGANISATION_JOB_TITLE_OPTIONS = Object.freeze([
  { value: '', label: 'Not assigned' },
  { value: 'organisation_owner', label: 'Organisation Owner' },
  { value: 'principal', label: 'Principal' },
  { value: 'director', label: 'Director' },
  { value: 'partner', label: 'Partner' },
  { value: 'administrator', label: 'Administrator' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'sales_manager', label: 'Sales Manager' },
  { value: 'development_manager', label: 'Development Manager' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'senior_agent', label: 'Senior Agent' },
  { value: 'property_practitioner', label: 'Property Practitioner' },
  { value: 'agent', label: 'Agent' },
  { value: 'transaction_coordinator', label: 'Transaction Coordinator' },
  { value: 'listing_coordinator', label: 'Listing Coordinator' },
  { value: 'admin_coordinator', label: 'Admin Coordinator' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'conveyancer', label: 'Conveyancer' },
  { value: 'paralegal', label: 'Paralegal' },
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'bond_consultant', label: 'Bond Consultant' },
  { value: 'processor', label: 'Processor' },
  { value: 'consultant', label: 'Consultant' },
])

const JOB_TITLE_LABEL_BY_VALUE = new Map(
  ORGANISATION_JOB_TITLE_OPTIONS.map((option) => [option.value, option.label]),
)

export function normalizeOrganisationJobTitle(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return JOB_TITLE_LABEL_BY_VALUE.has(normalized) ? normalized : ''
}

export function getOrganisationJobTitleLabel(value = '', fallback = '') {
  return JOB_TITLE_LABEL_BY_VALUE.get(normalizeOrganisationJobTitle(value)) || fallback
}
