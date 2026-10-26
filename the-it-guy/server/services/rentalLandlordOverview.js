export async function loadRentalOverviewRows(query) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const result = await query().order('id').range(offset, offset + 499)
    if (result.error) throw result.error
    rows.push(...(result.data || []))
    if ((result.data || []).length < 500) return rows
  }
}

const cents = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 100)
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10)
const sum = rows => rows.reduce((total, row) => total + (cents(row.amount) || 0), 0)
const dateInSA = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

export function buildRentalLandlordOverview({ units = [], tenancies = [], charges = [], payments = [], allocations = [], adjustments = [], corrections = [], financialAvailable = true, now = new Date() }) {
  const today = dateInSA(now), month = today.slice(0, 7)
  const active = tenancies.filter(row => ['active', 'notice_given', 'move_out_pending'].includes(row.status))
  const rents = active.map(row => cents(row.lease?.monthlyRent))
  const expected = rents.every(value => value !== null) ? rents.reduce((total, value) => total + value, 0) : null
  const occupied = units.filter(unit => unit.status === 'occupied' || active.some(row => row.unitId === unit.id)).length
  const scope = new Set(tenancies.map(row => row.id))
  const inScope = rows => rows.filter(row => scope.has(row.tenancy_id))
  charges = inScope(charges).filter(row => day(row.effective_date) <= today)
  payments = inScope(payments).filter(row => day(row.received_date) <= today)
  allocations = inScope(allocations).filter(row => day(row.allocated_on) <= today)
  adjustments = inScope(adjustments).filter(row => day(row.effective_date) <= today)
  const reversedPayments = new Set(inScope(corrections).filter(row => row.status === 'applied' && row.correction_kind === 'payment_reversal' && day(row.effective_date) <= today).map(row => row.original_payment_id))
  const rentCharges = new Set(charges.filter(row => row.charge_type === 'rent' && !row.reversal_of_charge_id).map(row => row.id))
  const currentPayments = new Set(payments.filter(row => day(row.received_date).startsWith(month) && !row.reversal_of_payment_id && !reversedPayments.has(row.id)).map(row => row.id))
  const collected = sum(allocations.filter(row => rentCharges.has(row.charge_id) && currentPayments.has(row.payment_id)))
  const dueCharges = charges.filter(row => day(row.due_date || row.effective_date) <= today)
  const paymentIds = new Set(payments.map(row => row.id))
  const balances = tenancies.map(tenancy => {
    const due = dueCharges.filter(row => row.tenancy_id === tenancy.id)
    const chargeIds = new Set(due.map(row => row.id))
    const allocated = allocations.filter(row => row.tenancy_id === tenancy.id && chargeIds.has(row.charge_id) && paymentIds.has(row.payment_id))
    const changes = adjustments.filter(row => row.tenancy_id === tenancy.id)
    return Math.max(0, sum(due) - sum(allocated) + sum(changes.filter(row => row.adjustment_type === 'debit')) - sum(changes.filter(row => row.adjustment_type === 'credit')))
  })
  return {
    asOf: today, period: month, financialAvailable,
    expectedRent: expected === null ? null : expected / 100, activeLeases: active.length,
    collectedRent: financialAvailable ? collected / 100 : null,
    collectionRate: financialAvailable && expected > 0 ? Math.round(collected / expected * 100) : null,
    outstanding: financialAvailable ? balances.reduce((total, value) => total + value, 0) / 100 : null,
    attentionCount: financialAvailable ? balances.filter(value => value > 0).length : null,
    occupied, totalUnits: units.length, occupancyRate: units.length ? Math.round(occupied / units.length * 100) : 0,
  }
}

export async function loadRentalLandlordOverview(db, organisationId, units, tenancies) {
  if (!tenancies.length) return buildRentalLandlordOverview({ units, tenancies })
  const fields = {
    rental_financial_charges: 'id,tenancy_id,charge_type,effective_date,due_date,amount,reversal_of_charge_id',
    rental_financial_payments: 'id,tenancy_id,received_date,amount,reversal_of_payment_id',
    rental_financial_allocations: 'id,tenancy_id,payment_id,charge_id,amount,allocated_on',
    rental_financial_adjustments: 'id,tenancy_id,adjustment_type,effective_date,amount',
    rental_financial_correction_requests: 'id,tenancy_id,correction_kind,status,effective_date,original_payment_id',
  }
  try {
    // Each query is bounded to the already authorised property's tenancies.
    const results = await Promise.all(Object.entries(fields).map(async ([table, columns]) => {
      const rows = []
      for (let i = 0; i < tenancies.length; i += 100) {
        rows.push(...await loadRentalOverviewRows(() => db.from(table).select(columns).eq('organisation_id', organisationId).in('tenancy_id', tenancies.slice(i, i + 100).map(row => row.id))))
      }
      return rows
    }))
    const [charges, payments, allocations, adjustments, corrections] = results
    return buildRentalLandlordOverview({ units, tenancies, charges, payments, allocations, adjustments, corrections })
  } catch {
    // A failed or unavailable ledger must never look like zero debt or full payment.
    return buildRentalLandlordOverview({ units, tenancies, financialAvailable: false })
  }
}
