import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { buildRentalPortfolioListQuery, createRentalPortfolioAssignmentPayload, createRentalPortfolioPayload, mapRentalPortfolio } from './rentalPortfolioModel.js'

const SELECT_FIELDS = 'id, organisation_id, branch_id, assigned_manager_id, name, description, status, metadata_json, created_by, created_at, updated_at, property_count, unit_count'
const DETAIL_FIELDS = 'id, organisation_id, branch_id, assigned_manager_id, name, description, status, metadata_json, created_by, created_at, updated_at'
const text = (value) => String(value ?? '').trim()
function requireClient(client = supabase) { if (!isSupabaseConfigured || !client) throw new Error('Rental portfolios require Supabase configuration.'); return client }
function unavailable(error = {}) { const missing = ['42P01', 'PGRST204', 'PGRST205'].includes(String(error.code || '').toUpperCase()); return new Error(missing ? 'Rental portfolio foundation is not yet applied to this environment.' : (error.message || 'Rental portfolio request failed.')) }

export async function listRentalPortfolios(input = {}, { client = supabase } = {}) {
  const options = buildRentalPortfolioListQuery(input)
  if (!options.organisationId) return []
  let query = requireClient(client).from('rental_portfolio_summaries').select(SELECT_FIELDS).eq('organisation_id', options.organisationId).order('updated_at', { ascending: false }).limit(options.limit)
  if (options.branchId) query = query.eq('branch_id', options.branchId)
  if (options.status && options.status !== 'all') query = query.eq('status', options.status)
  if (options.search) query = query.ilike('name', `%${options.search}%`)
  const result = await query
  if (result.error) throw unavailable(result.error)
  return (result.data || []).map(mapRentalPortfolio)
}

export async function getRentalPortfolio(portfolioId = '', { client = supabase } = {}) {
  if (!text(portfolioId)) return null
  const result = await requireClient(client).from('rental_portfolios').select(DETAIL_FIELDS).eq('id', text(portfolioId)).maybeSingle()
  if (result.error) throw unavailable(result.error)
  return result.data ? mapRentalPortfolio(result.data) : null
}

export async function createRentalPortfolio(values = {}, { client = supabase } = {}) {
  const result = await requireClient(client).from('rental_portfolios').insert(createRentalPortfolioPayload(values)).select(DETAIL_FIELDS).single()
  if (result.error) throw unavailable(result.error)
  return mapRentalPortfolio(result.data)
}

export async function assignRentalPropertyToPortfolio(values = {}, { client = supabase } = {}) {
  const payload = createRentalPortfolioAssignmentPayload(values)
  const result = await requireClient(client).from('rental_portfolio_properties').upsert(payload, { onConflict: 'property_id' }).select('portfolio_id, property_id').single()
  if (result.error) throw unavailable(result.error)
  return result.data
}
