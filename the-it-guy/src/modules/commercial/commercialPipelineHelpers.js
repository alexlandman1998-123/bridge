import { formatCurrency, formatDate, formatList, formatNumber, titleize } from './commercialFormatters'

export function toLookupOptions(lookups = {}) {
  return {
    landlords: (lookups.landlords || []).map((row) => ({ value: row.id, label: row.name || 'Unnamed landlord' })),
    tenants: (lookups.tenants || []).map((row) => ({ value: row.id, label: row.name || 'Unnamed tenant' })),
    properties: (lookups.properties || []).map((row) => ({ value: row.id, label: row.property_name || 'Unnamed property' })),
    requirements: (lookups.requirements || []).map((row) => ({ value: row.id, label: row.requirement_name || 'Unnamed requirement' })),
    deals: (lookups.deals || []).map((row) => ({ value: row.id, label: row.deal_name || 'Unnamed deal' })),
  }
}

export function lookupLabel(lookups, kind, id, fallback = '-') {
  if (!id) return fallback
  const rows = Array.isArray(lookups?.[kind]) ? lookups[kind] : []
  const match = rows.find((row) => row.id === id)
  if (!match) return fallback
  return match.name || match.property_name || match.requirement_name || match.deal_name || fallback
}

export function formatSizeRange(row) {
  const min = Number(row?.min_size_m2)
  const max = Number(row?.max_size_m2)
  if (Number.isFinite(min) && Number.isFinite(max) && (min > 0 || max > 0)) return `${formatNumber(min, 'm²')} - ${formatNumber(max, 'm²')}`
  if (Number.isFinite(min) && min > 0) return `From ${formatNumber(min, 'm²')}`
  if (Number.isFinite(max) && max > 0) return `Up to ${formatNumber(max, 'm²')}`
  return '-'
}

export function formatBudgetRange(row) {
  const min = Number(row?.budget_min)
  const max = Number(row?.budget_max)
  if (Number.isFinite(min) && min > 0 && Number.isFinite(max) && max > 0) return `${formatCurrency(min)} - ${formatCurrency(max)}`
  if (Number.isFinite(min) && min > 0) return `From ${formatCurrency(min)}`
  if (Number.isFinite(max) && max > 0) return `Up to ${formatCurrency(max)}`
  return '-'
}

export function formatCommercialDate(value) {
  return formatDate(value)
}

export function formatCommercialList(value) {
  return formatList(value)
}

export function labelFromValue(value) {
  return titleize(value)
}
