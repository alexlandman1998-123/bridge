export const RENTAL_RELEASE_ONE_BRIDGE_VERSION = 'arch9_rental_internal_marketing_operations_v2'

const text = (value) => String(value ?? '').trim()

/** Internal-only pilot gate. It deliberately permits no external listing or portal operation. */
export function resolveRentalInternalMarketingPilotGate({ enabled = false, pilotVacancyIds = [], vacancyId = '' } = {}) {
  const allowed = new Set(Array.isArray(pilotVacancyIds) ? pilotVacancyIds.map(text).filter(Boolean) : [])
  if (enabled !== true) return { allowed: false, reason: 'rental_internal_marketing_disabled' }
  if (!allowed.has(text(vacancyId))) return { allowed: false, reason: 'vacancy_not_in_pilot_cohort' }
  return { allowed: true, reason: 'internal_marketing_pilot_allowed' }
}

export function buildRentalLegacyRentalDataDryRun(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const rental = String(row.listing_category || row.listingCategory || '').toLowerCase() === 'rental'
    const address = text(row.address || row.property_address)
    const rent = Number(row.asking_price || row.askingPrice || 0)
    const confidence = rental && address && rent > 0 ? 'high' : rental ? 'ambiguous' : 'excluded'
    return { recordId: text(row.id), confidence, action: confidence === 'high' ? 'review_link' : 'do_not_convert', reasons: [!rental && 'not_rental_marked', !address && 'missing_address', !(rent > 0) && 'missing_rent'].filter(Boolean) }
  })
}
