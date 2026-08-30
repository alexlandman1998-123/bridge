export const RENTAL_VACANCY_MARKETING_VERSION = 'arch9_rental_vacancy_marketing_v2'
export const RENTAL_VACANCY_MARKETING_STATUSES = Object.freeze(['draft', 'ready_for_review', 'approved', 'paused', 'archived'])

const text = (value) => String(value ?? '').trim()
const allowedTransitions = Object.freeze({
  draft: ['ready_for_review', 'archived'],
  ready_for_review: ['draft', 'approved', 'archived'],
  approved: ['paused', 'archived'],
  paused: ['approved', 'archived'],
  archived: [],
})

export function canTransitionRentalVacancyMarketing(fromStatus = '', toStatus = '') {
  return (allowedTransitions[text(fromStatus)] || []).includes(text(toStatus))
}

export function createRentalVacancyMarketingPayload(values = {}) {
  if (!text(values.organisationId || values.organisation_id) || !text(values.vacancyId || values.vacancy_id)) throw new Error('Organisation and vacancy are required.')
  const title = text(values.title)
  const description = text(values.description)
  if (title.length > 140) throw new Error('Marketing title must be 140 characters or fewer.')
  if (description.length > 8_000) throw new Error('Marketing description must be 8,000 characters or fewer.')
  return {
    organisation_id: text(values.organisationId || values.organisation_id),
    vacancy_id: text(values.vacancyId || values.vacancy_id),
    branch_id: text(values.branchId || values.branch_id) || null,
    title,
    description,
    features_json: Array.isArray(values.features) ? values.features.map(text).filter(Boolean).slice(0, 40) : [],
    visibility: 'internal',
  }
}

export function evaluateRentalVacancyMarketingReadiness({ marketing = {}, mediaCount = 0, vacancy = {} } = {}) {
  const blockers = []
  if (!text(marketing.title)) blockers.push('title')
  if (text(marketing.description).length < 80) blockers.push('description')
  if (Number(mediaCount) < 1) blockers.push('media')
  if (!['preparing', 'marketing', 'applications_open'].includes(text(vacancy.status))) blockers.push('vacancy_status')
  return { ready: blockers.length === 0, blockers }
}

export function buildRentalVacancyMarketingPreview({ marketing = {}, vacancy = {}, property = {}, unit = {} } = {}) {
  return Object.freeze({
    title: text(marketing.title) || [text(property.name), text(unit.unitLabel)].filter(Boolean).join(' — ') || 'Untitled rental',
    description: text(marketing.description),
    features: Array.isArray(marketing.features) ? marketing.features : [],
    monthlyRent: Number(vacancy.askingRent || 0),
    depositAmount: Number(vacancy.depositAmount || 0),
    availableFrom: vacancy.availableFrom || null,
    bedrooms: Number(unit.bedrooms || 0),
    bathrooms: Number(unit.bathrooms || 0),
    status: text(marketing.status || 'draft'),
    externalPublication: 'not_published',
  })
}

export function mapRentalVacancyMarketing(row = {}) {
  return {
    id: text(row.id), organisationId: text(row.organisation_id), vacancyId: text(row.vacancy_id), branchId: text(row.branch_id),
    title: text(row.title), description: text(row.description), features: Array.isArray(row.features_json) ? row.features_json : [],
    visibility: 'internal', status: text(row.status || 'draft'), version: Number(row.version || 1), approvedAt: row.approved_at || null,
    approvedBy: text(row.approved_by), pausedAt: row.paused_at || null, archivedAt: row.archived_at || null, updatedAt: row.updated_at || null, raw: row,
  }
}
