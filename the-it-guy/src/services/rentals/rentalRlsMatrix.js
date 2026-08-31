export const RENTAL_RLS_MATRIX_VERSION = 'arch9_rental_rls_matrix_v1'

export const RENTAL_RLS_MATRIX = Object.freeze([
  { key: 'agency_manager', tables: ['rental_properties', 'rental_units', 'rental_vacancies', 'rental_tenancies'], rule: 'Manager access is restricted to the authorised organisation and branch scope.' },
  { key: 'financial_manager', tables: ['rental_financial_charges', 'rental_financial_payments', 'rental_payment_import_batches', 'rental_landlord_statements'], rule: 'Financial operations require the financial-manager capability.' },
  { key: 'tenant', tables: ['rental_tenant_portal_access', 'rental_tenant_portal_actions'], rule: 'Tenant portal access is tenancy-bound and cannot alter canonical tenancy state.' },
  { key: 'landlord', tables: ['rental_landlord_portal_access', 'rental_landlord_portal_decisions'], rule: 'Landlord portal access is property-bound and read/control scoped.' },
  { key: 'operations', tables: ['rental_maintenance_requests', 'rental_field_inspections', 'rental_move_out_workflows'], rule: 'Operational staff access follows the authorised property and tenancy scope.' },
  { key: 'unauthenticated', tables: [], rule: 'Anonymous users cannot execute privileged Rentals RPCs.' },
])

export function evaluateRentalRlsMatrix({ tables = [], functions = [] } = {}) {
  const tableMap = new Map(tables.map((item) => [item.name, item]))
  const checks = RENTAL_RLS_MATRIX.flatMap((persona) => persona.tables.map((name) => {
    const table = tableMap.get(name)
    return { persona: persona.key, subject: name, type: 'table', status: table?.rlsEnabled === true && Number(table.policyCount) > 0 ? 'pass' : 'blocked' }
  }))
  checks.push(...functions.map((item) => ({ persona: 'unauthenticated', subject: item.name, type: 'function', status: item.anonExecute === false ? 'pass' : 'blocked' })))
  const blockers = checks.filter((check) => check.status === 'blocked')
  return { version: RENTAL_RLS_MATRIX_VERSION, status: blockers.length ? 'not_ready' : 'ready_for_pilot_review', checks, blockers, guardrail: 'This matrix verifies access boundaries only; it does not grant a role, change a policy, or enable Sales.' }
}
