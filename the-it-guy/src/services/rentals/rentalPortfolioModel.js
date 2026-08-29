export const RENTAL_PORTFOLIO_CONTRACT_VERSION = 'arch9_rental_portfolio_v1'

export const RENTAL_PORTFOLIO_STATUSES = Object.freeze(['active', 'archived'])

const text = (value) => String(value ?? '').trim()
const number = (value) => Number(value || 0)

export function validateRentalPortfolio(values = {}) {
  const errors = {}
  if (!text(values.organisationId || values.organisation_id)) errors.organisationId = 'Organisation is required.'
  if (!text(values.name)) errors.name = 'Portfolio name is required.'
  if (!RENTAL_PORTFOLIO_STATUSES.includes(text(values.status || 'active').toLowerCase())) errors.status = 'Choose a supported portfolio status.'
  return { valid: Object.keys(errors).length === 0, errors }
}

export function createRentalPortfolioPayload(values = {}) {
  const validation = validateRentalPortfolio(values)
  if (!validation.valid) throw new Error(Object.values(validation.errors)[0])
  return {
    organisation_id: text(values.organisationId || values.organisation_id),
    branch_id: text(values.branchId || values.branch_id) || null,
    assigned_manager_id: text(values.assignedManagerId || values.assigned_manager_id) || null,
    name: text(values.name), description: text(values.description) || null,
    status: text(values.status || 'active').toLowerCase(),
    metadata_json: values.metadata && typeof values.metadata === 'object' && !Array.isArray(values.metadata) ? values.metadata : {},
    created_by: text(values.createdBy || values.created_by) || null,
  }
}

export function mapRentalPortfolio(row = {}) {
  return {
    id: text(row.id), organisationId: text(row.organisation_id), branchId: text(row.branch_id), assignedManagerId: text(row.assigned_manager_id),
    name: text(row.name), description: text(row.description), status: text(row.status),
    propertyCount: number(row.property_count), unitCount: number(row.unit_count), createdAt: row.created_at || null, updatedAt: row.updated_at || null,
    metadata: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {}, raw: row,
  }
}

export function buildRentalPortfolioListQuery({ organisationId = '', branchId = '', status = '', search = '', limit = 50 } = {}) {
  return {
    organisationId: text(organisationId), branchId: text(branchId), status: text(status).toLowerCase(),
    search: text(search).slice(0, 120), limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
  }
}

export function createRentalPortfolioAssignmentPayload({ portfolioId = '', propertyId = '', organisationId = '', assignedBy = '' } = {}) {
  if (!text(portfolioId)) throw new Error('Portfolio is required.')
  if (!text(propertyId)) throw new Error('Property is required.')
  if (!text(organisationId)) throw new Error('Organisation is required.')
  return { portfolio_id: text(portfolioId), property_id: text(propertyId), organisation_id: text(organisationId), assigned_by: text(assignedBy) || null }
}
