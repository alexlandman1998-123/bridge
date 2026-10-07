const stable = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item)
export function isRentalContextConfirmed(application = {}) {
  const confirmation = application.confirmation || application.confirmation_json || {}
  return confirmation.source === 'applicant' && confirmation.wordingVersion === 'rental-context-v1' && Boolean(confirmation.acceptedAt && confirmation.privacyAcceptedAt) && stable(confirmation.property) === stable(application.data?.property || application.application_data?.property || {}) && stable(confirmation.costs) === stable(application.costs || application.cost_snapshot_json || {})
}
export const rentalApplicationFeeLabel = (costs = {}) => Number(costs.amount) > 0 ? `R ${Number(costs.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'No application fee'
export function rentalApplicationFeeStatus(application = {}) {
  if (!(Number(application.costs?.amount) > 0)) return 'No application fee'
  return application.feeDueAt ? 'Payable — payment not recorded' : 'Payable after submission'
}
