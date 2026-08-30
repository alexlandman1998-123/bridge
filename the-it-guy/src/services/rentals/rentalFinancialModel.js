export const RENTAL_FINANCIAL_MODEL_VERSION = 'arch9_rental_financial_model_v1'
export const RENTAL_FINANCIAL_INVARIANTS = Object.freeze([
  'All amounts are positive ZAR amounts recorded to two decimal places.',
  'Charges, payments, allocations and adjustments are append-only.',
  'A payment may remain unapplied; capture never silently allocates it.',
  'Allocated payment plus unapplied payment always equals the payment amount.',
  'Corrections use compensating adjustments or reversal rows, never edits or deletes.',
])
export function calculatePaymentBalance(paymentAmount, allocations = []) { const paid = Number(paymentAmount || 0); const allocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0); if (allocated < 0 || allocated > paid) throw new Error('Allocation total must be between zero and the payment amount.'); return { paymentAmount: paid, allocatedAmount: allocated, unappliedAmount: paid - allocated } }
export function calculateChargeBalance(chargeAmount, allocations = []) { const charged = Number(chargeAmount || 0); const allocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0); return { chargeAmount: charged, allocatedAmount: allocated, outstandingAmount: charged - allocated } }
