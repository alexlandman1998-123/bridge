import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const WET_INK_CONVERSION_MIGRATION_REVIEW_STATUSES = [
  { value: 'reviewed_historical', label: 'Reviewed historical record' },
  { value: 'requires_remediation', label: 'Requires remediation' },
  { value: 'not_applicable', label: 'Not applicable' },
]

export const WET_INK_CONVERSION_MIGRATION_DEPENDENCY_TYPES = {
  HISTORICAL_TRANSACTION_WITHOUT_WET_INK: 'historical_transaction_without_wet_ink',
  OFFER_TRANSACTION_LINK_MISMATCH: 'offer_transaction_link_mismatch',
  ACCEPTED_OFFER_MISSING_CONVERSION_FACTS: 'accepted_offer_missing_conversion_facts',
}

function text(value) {
  return String(value ?? '').trim()
}

function uuid(value, label) {
  const normalized = text(value)
  if (!UUID.test(normalized)) throw new Error(`${label} is required.`)
  return normalized
}

function client() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in to review conversion migration dependencies.')
  return supabase
}

export function mapWetInkConversionMigrationDependency(row = {}) {
  return {
    id: text(row.id),
    organisationId: text(row.organisationId || row.organisation_id),
    dependencyType: text(row.dependencyType || row.dependency_type),
    offerId: text(row.offerId || row.offer_id),
    transactionId: text(row.transactionId || row.transaction_id),
    listingId: text(row.listingId || row.listing_id),
    leadId: text(row.leadId || row.lead_id),
    reviewStatus: text(row.reviewStatus || row.review_status) || 'pending',
    reviewNote: text(row.reviewNote || row.review_note),
    sourceSnapshot: row.sourceSnapshot || row.source_snapshot || {},
    reviewedAt: row.reviewedAt || row.reviewed_at || null,
    createdAt: row.createdAt || row.created_at || null,
    lastDetectedAt: row.lastDetectedAt || row.last_detected_at || null,
  }
}

export async function listWetInkConversionMigrationDependencies({ organisationId = '', listingId = '' } = {}) {
  const payload = { p_organisation_id: uuid(organisationId, 'Organisation') }
  if (text(listingId)) payload.p_listing_id = uuid(listingId, 'Listing')
  const { data, error } = await client().rpc('bridge_list_wet_ink_conversion_migration_dependencies', payload)
  if (error) throw error
  return (Array.isArray(data?.dependencies) ? data.dependencies : []).map(mapWetInkConversionMigrationDependency)
}

export async function refreshWetInkConversionMigrationDependencies({ organisationId = '' } = {}) {
  const { data, error } = await client().rpc('bridge_refresh_wet_ink_conversion_migration_dependencies', {
    p_organisation_id: uuid(organisationId, 'Organisation'),
  })
  if (error) throw error
  return { dependenciesDetected: Number(data?.dependenciesDetected || 0) }
}

export async function resolveWetInkConversionMigrationDependency({ dependencyId = '', reviewStatus = '', reviewNote = '' } = {}) {
  const status = text(reviewStatus).toLowerCase()
  const note = text(reviewNote)
  if (!WET_INK_CONVERSION_MIGRATION_REVIEW_STATUSES.some((option) => option.value === status)) {
    throw new Error('Choose a valid conversion migration review outcome.')
  }
  if (note.length < 20) throw new Error('Record a review note of at least 20 characters.')

  const { data, error } = await client().rpc('bridge_resolve_wet_ink_conversion_migration_dependency', {
    p_dependency_id: uuid(dependencyId, 'Dependency'),
    p_review_status: status,
    p_review_note: note,
  })
  if (error) throw error
  return mapWetInkConversionMigrationDependency(data?.dependency || {})
}
