// finance owns these operations and their existing recovery behavior.
import { normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { normalizeReservationStatus } from '../documents/uploadAutomation.js'
import { resolvePurchasePrice } from '../transactions/attorneyAllocation.js'

export function toBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['true', 'yes', '1'].includes(normalized)) {
    return true
  }

  if (['false', 'no', '0'].includes(normalized)) {
    return false
  }

  return fallback
}

export function getOnboardingFinanceSnapshot({ formData = {}, transaction = null } = {}) {
  const financeType = normalizeFinanceType(formData.purchase_finance_type || transaction?.finance_type || 'cash')
  const purchasePrice = resolvePurchasePrice({ formData, transaction })
  const cashAmount = normalizeOptionalNumber(formData.cash_amount ?? transaction?.cash_amount)
  const bondAmount = normalizeOptionalNumber(formData.bond_amount ?? transaction?.bond_amount)
  const depositAmount = normalizeOptionalNumber(formData.deposit_amount ?? transaction?.deposit_amount)
  const reservationRequired = toBoolean(formData.reservation_required, Boolean(transaction?.reservation_required))
  const reservationAmount = reservationRequired
    ? normalizeOptionalNumber(formData.reservation_amount ?? transaction?.reservation_amount)
    : null
  const reservationStatus = normalizeReservationStatus(formData.reservation_status || transaction?.reservation_status, {
    required: reservationRequired,
  })

  const reservationPaidDate =
    reservationRequired && ['paid', 'verified'].includes(reservationStatus)
      ? String(
          formData.reservation_paid_date || transaction?.reservation_paid_date || new Date().toISOString().slice(0, 10),
        )
      : null

  return {
    financeType,
    purchasePrice,
    cashAmount,
    bondAmount,
    depositAmount,
    reservationRequired,
    reservationAmount,
    reservationStatus,
    reservationPaidDate,
  }
}
