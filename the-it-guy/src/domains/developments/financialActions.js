// Extracted without changing validation, persistence order or recovery behaviour.
import { normalizeDevelopmentFinancialsRow } from './readApi.js'
import { normalizeTextValue, requireClient, normalizeNullableText, isMissingTableError } from '../../lib/api/shared/readHelpers.js'
import { upsertByDevelopmentIdWithFallback } from './persistenceHelpers.js'

export function hasDevelopmentFinancialInputs(input = {}) {
  const normalized = normalizeDevelopmentFinancialsRow(input)
  return (
    [
      normalized.landCost,
      normalized.buildCost,
      normalized.professionalFees,
      normalized.marketingCost,
      normalized.infrastructureCost,
      normalized.otherCosts,
      normalized.totalProjectedCost,
      normalized.projectedGrossSalesValue,
      normalized.projectedProfit,
      normalized.targetMargin,
    ].some((value) => value !== null && value !== 0) || Boolean(normalizeTextValue(normalized.notes))
  )
}

export async function saveDevelopmentFinancials(developmentId, input = {}) {
  const client = requireClient()

  if (!developmentId) {
    throw new Error('Development is required.')
  }

  const normalized = normalizeDevelopmentFinancialsRow({
    ...input,
    development_id: developmentId,
  })
  const payload = {
    development_id: developmentId,
    land_cost: normalized.landCost,
    build_cost: normalized.buildCost,
    professional_fees: normalized.professionalFees,
    marketing_cost: normalized.marketingCost,
    infrastructure_cost: normalized.infrastructureCost,
    other_costs: normalized.otherCosts,
    total_projected_cost: normalized.totalProjectedCost,
    projected_gross_sales_value: normalized.projectedGrossSalesValue,
    projected_profit: normalized.projectedProfit,
    target_margin: normalized.targetMargin,
    notes: normalizeNullableText(normalized.notes),
  }

  const { data, error } = await upsertByDevelopmentIdWithFallback(client, {
    table: 'development_financials',
    payload,
    selectClause:
      'id, development_id, land_cost, build_cost, professional_fees, marketing_cost, infrastructure_cost, other_costs, total_projected_cost, projected_gross_sales_value, projected_profit, target_margin, notes',
    expectSingleRow: true,
  })

  if (error) {
    if (isMissingTableError(error, 'development_financials')) {
      throw new Error('development_financials table not found. Run sql/schema.sql first.')
    }
    throw error
  }

  return normalizeDevelopmentFinancialsRow(data)
}
