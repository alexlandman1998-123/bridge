const fields = new Set(['contact_type', 'lead_stage', 'preferred_area', 'tags'])
const operators = new Set(['in', 'not_in', 'contains'])
export function copyClientAudienceFilters(filter) {
  return JSON.parse(JSON.stringify(filter ?? {}))
}
export function canEditClientAudienceFilters(filter) {
  return Boolean(filter && !Array.isArray(filter) && Object.keys(filter).every(key => ['operator', 'rules'].includes(key))
    && ['AND', 'OR'].includes(filter.operator || 'AND') && Array.isArray(filter.rules) && filter.rules.length
    && filter.rules.every(rule => rule && typeof rule === 'object' && fields.has(rule.field) && operators.has(rule.operator || 'in')
      && !rule.rules && Object.keys(rule).every(key => ['field', 'operator', 'value'].includes(key))
      && Array.isArray(rule.value) && rule.value.every(value => typeof value === 'string')))
}
