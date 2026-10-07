import { isRentalListingWithinBudget } from './rentalLeadMatchingModel.js'

const text = (value) => String(value ?? '').trim()
export const TENANT_WORKSPACE_TABS = [
  'Overview',
  'Matches',
  'Tenant profile',
  'Application',
  'Documents',
  'Appointments',
  'Activity',
]
export const TENANT_JOURNEY = [
  'Captured',
  'Contacted',
  'Qualified',
  'Viewing',
  'Tenant onboarding sent',
  'Tenant application submitted',
  'Lease',
  'Tenancy',
]
export const TENANT_QUESTIONS = [
  {
    key: 'monthlyBudget',
    label: 'Monthly budget',
    question: 'What is your maximum monthly rent?',
    type: 'number',
  },
  {
    key: 'desiredArea',
    label: 'Preferred areas',
    question: 'Which areas should we focus on?',
  },
  {
    key: 'occupationDate',
    label: 'Move date',
    question: 'When would you like to move?',
    type: 'date',
  },
  {
    key: 'employmentStatus',
    label: 'Employment',
    question: 'What is your employment or income situation?',
    options: ['Employed', 'Self-employed', 'Student', 'Retired', 'Other'],
  },
  {
    key: 'depositAvailable',
    label: 'Deposit available',
    question: 'Is the rental deposit available?',
    options: ['Yes', 'No'],
    boolean: true,
  },
  {
    key: 'screeningConsent',
    label: 'Screening consent',
    question: 'Has the tenant agreed to screening?',
    options: ['Yes', 'No'],
    boolean: true,
  },
  {
    key: 'propertyNeed',
    label: 'Property needs',
    question: 'What type of property and features do you need?',
  },
  {
    key: 'occupants',
    label: 'Occupants',
    question: 'How many people will live in the property?',
    type: 'number',
  },
  {
    key: 'pets',
    label: 'Pets',
    question: 'Will any pets live with you?',
    options: ['No pets', 'Pet friendly required'],
    boolean: true,
  },
  {
    key: 'additionalNotes',
    label: 'Call notes',
    question: 'What did the tenant say on the call?',
    type: 'textarea',
  },
]
export function tenantQualificationValues(lead = {}) {
  const saved = lead.qualification || {}
  return {
    ...Object.fromEntries(
      TENANT_QUESTIONS.map(({ key }) => [key, saved[key] ?? lead[key] ?? '']),
    ),
    bedrooms: saved.bedrooms ?? lead.bedrooms ?? '',
  }
}
export function tenantQualificationProgress(lead = {}) {
  const values = tenantQualificationValues(lead)
  const count = TENANT_QUESTIONS.filter(
    ({ key }) =>
      (text(values[key]) !== '' && text(values[key]) !== 'Not captured') ||
      (key === 'additionalNotes' && lead.qualification?.source === 'tenant_qualification_link' && Boolean(lead.qualification?.submittedAt)),
  ).length
  return {
    count,
    total: TENANT_QUESTIONS.length,
    percent: Math.round((count / TENANT_QUESTIONS.length) * 100),
  }
}
export function tenantJourneyStage(lead = {}, conversions = [], applications = []) {
  if (
    conversions.some(
      (item) =>
        ['active', 'notice_given', 'move_out_pending', 'closed'].includes(
          item.status,
        ),
    )
  )
    return 7
  if (conversions.some((item) => (item.rental_leases || []).length)) return 6
  if (lead.relationships?.tenancyId) return 6
  if (
    [
      'application_submitted',
      'screening_pending',
      'fica_pending',
      'fica_complete',
      'placement_ready',
    ].includes(lead.stage)
  )
    return 5
  if (applications.some((item) => ['submitted', 'under_review', 'approved', 'declined'].includes(item.status))) return 5
  if (lead.stage === 'application_pending' || applications.some((item) => item.data?.onboarding?.sentAt)) return 4
  if (['viewing_scheduled', 'viewing_completed'].includes(lead.stage)) return 3
  return { new: 0, contacted: 1, qualified: 2 }[lead.stage] ?? 0
}
export function tenantBudgetMatches(lead = {}, matches = []) {
  return matches.filter(({ listing }) => isRentalListingWithinBudget(lead, listing))
}
export function tenantEnquiryProperty(lead = {}, matches = [], vacancies = []) {
  const id = text(
    lead.relationships?.listingId ||
      lead.raw?.enquiredListingId ||
      lead.raw?.enquired_listing_id ||
      lead.raw?.listingId,
  )
  const listing = matches.find((item) => text(item.listing.id) === id)?.listing
  if (listing) return listing
  const vacancy = vacancies.find(
    (item) => item.id === lead.relationships?.vacancyId,
  )
  const title = text(
    lead.raw?.enquiredPropertyTitle || lead.raw?.enquired_property_title,
  )
  const address = text(
    lead.raw?.enquiredPropertyAddress || lead.raw?.enquired_property_address,
  )
  if (id || vacancy || title || address)
    return {
      id,
      listingTitle: title || 'Enquired rental property',
      propertyAddress: address,
      monthlyRent:
        vacancy?.askingRent ?? lead.raw?.enquiredPropertyPrice ?? null,
    }
  return null
}
export function normalizeTenantQualification(values = {}, previous = {}) {
  const merged = { ...previous, ...values }
  const result = Object.fromEntries(
    TENANT_QUESTIONS.map(({ key }) => [key, text(merged[key])]),
  )
  for (const key of ['monthlyBudget', 'bedrooms', 'occupants']) {
    const value = merged[key]
    result[key] = value === '' || value == null ? null : Number(value)
    if (
      result[key] !== null &&
      (!Number.isFinite(result[key]) || result[key] < 0)
    )
      throw new Error(
        `${key === 'monthlyBudget' ? 'Monthly budget' : key === 'bedrooms' ? 'Bedrooms' : 'Occupants'} must be zero or more.`,
      )
    if (
      key !== 'monthlyBudget' &&
      result[key] !== null &&
      !Number.isInteger(result[key])
    )
      throw new Error('Bedrooms and occupants must be whole numbers.')
  }
  if (!result.desiredArea) throw new Error('Desired area is required.')
  if (
    result.occupationDate &&
    Number.isNaN(new Date(result.occupationDate).getTime())
  )
    throw new Error('Occupation date must be valid.')
  for (const key of ['depositAvailable', 'screeningConsent'])
    if (result[key] && !['Yes', 'No'].includes(result[key]))
      throw new Error('Choose Yes or No for deposit and screening consent.')
  return result
}
