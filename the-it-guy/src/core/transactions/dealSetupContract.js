export const DEAL_SETUP_CONTRACT_VERSION = 'deal_setup_v1'

const text = (value) => String(value ?? '').trim()
const number = (value) => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value)

export function buildDealSetup({ transaction = {}, buyerParties = [] } = {}) {
  const parties = Array.isArray(buyerParties) ? buyerParties.filter((party) => !party.removed_at && party.status !== 'removed') : []
  const primary = parties.find((party) => party.is_primary_buyer) || null
  return Object.freeze({
    version: DEAL_SETUP_CONTRACT_VERSION,
    transactionId: text(transaction.id),
    property: Object.freeze({ developmentId: text(transaction.development_id), unitId: text(transaction.unit_id), address: text(transaction.property_address_line_1), sellerName: text(transaction.seller_name) }),
    buyers: Object.freeze(parties),
    primaryBuyerId: text(primary?.buyer_party_id || transaction.buyer_id),
    terms: Object.freeze({ purchaserType: text(transaction.purchaser_type), purchasePrice: number(transaction.purchase_price ?? transaction.sales_price), depositAmount: number(transaction.deposit_amount), reservationRequired: Boolean(transaction.reservation_required), reservationAmount: number(transaction.reservation_amount) }),
    finance: Object.freeze({ type: text(transaction.finance_type), managedBy: text(transaction.finance_managed_by), cashAmount: number(transaction.cash_amount), bondAmount: number(transaction.bond_amount), bank: text(transaction.bank), bondOriginator: text(transaction.bond_originator) }),
  })
}

export function validateDealSetup(setup = {}) {
  const issues = []
  if (!text(setup.transactionId)) issues.push('Transaction is missing.')
  if (!setup.buyers?.length) issues.push('Add at least one buyer.')
  if (setup.buyers?.length && !text(setup.primaryBuyerId)) issues.push('Assign a primary buyer.')
  if (!text(setup.terms?.purchaserType)) issues.push('Select a purchaser type.')
  if (!text(setup.finance?.type)) issues.push('Select a finance type.')
  if (['bond', 'hybrid', 'combination'].includes(text(setup.finance?.type).toLowerCase()) && !text(setup.finance?.managedBy)) issues.push('Select who manages the finance route.')
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) })
}
