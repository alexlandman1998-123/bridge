export const DEAL_SETUP_CONTRACT_VERSION = 'deal_setup_v1'

const text = (value) => String(value ?? '').trim()
const number = (value) => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value)

// Only explicit supported values are recognised; scanned prose is never guessed.
export function resolveDealSetupFinanceType(value) {
  const key = text(value).toLowerCase()
  if (['hybrid', 'combination', 'cash and bond', 'cash+bond', 'cash_bond'].includes(key)) return 'hybrid'
  return ['cash', 'bond'].includes(key) ? key : ''
}

export function dealSetupFinanceLabel(value) {
  return ({ cash: 'Cash', bond: 'Bond', hybrid: 'Cash and bond' })[resolveDealSetupFinanceType(value)] || ''
}

export function getActiveDealSetupBuyers(buyerParties = []) {
  return (Array.isArray(buyerParties) ? buyerParties : []).filter((party) => !party.removed_at && text(party.status).toLowerCase() !== 'removed')
}

export function getPrimaryDealSetupBuyer(buyerParties = []) {
  const primary = getActiveDealSetupBuyers(buyerParties).filter((party) => party.is_primary_buyer === true)
  return primary.length === 1 ? primary[0] : null
}

export function getDealSetupBuyerLinkIssues({ transaction = {}, buyerParties = [] } = {}) {
  const parties = getActiveDealSetupBuyers(buyerParties)
  const primaries = parties.filter((party) => party.is_primary_buyer === true)
  const primary = getPrimaryDealSetupBuyer(parties)
  const issues = []
  const issue = (code, message) => issues.push({ code, message })
  if (text(transaction.buyer_id) && !parties.some((party) => text(party.buyer_party_id) === text(transaction.buyer_id))) {
    issue('unlinked_captured_buyer', 'A buyer is saved on this transaction but is not linked in the Buyers section. Check the captured details before linking an existing profile.')
  }
  if (primaries.length > 1) issue('multiple_primary_buyers', 'More than one buyer is marked as primary. Choose the correct primary buyer.')
  if (text(transaction.primary_buyer_participant_id) && !parties.some((party) => text(party.id) === text(transaction.primary_buyer_participant_id) && party.is_primary_buyer === true)) {
    issue('invalid_primary_participant_link', 'The saved primary buyer link does not point to an active primary buyer. Check the buyer assignments.')
  }
  if (primary && text(transaction.buyer_id) && text(primary.buyer_party_id) !== text(transaction.buyer_id)) {
    issue('primary_profile_mismatch', 'The primary buyer and the buyer saved on the transaction differ. Confirm which buyer belongs to this deal.')
  }
  if (primary && text(transaction.primary_buyer_participant_id) && text(primary.id) !== text(transaction.primary_buyer_participant_id)) {
    issue('primary_participant_mismatch', 'The saved primary buyer assignment differs from the Buyers section. Check the buyer assignments.')
  }
  return issues
}

// Compare money in cents, so rounding cannot hide a funding shortfall.
const moneyCents = (value) => {
  const raw = text(value)
  if (!/^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(raw)) return null
  const [whole, fraction = ''] = raw.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export function validateDealSetupCommercialTerms(terms = {}) {
  const issues = []
  if (!['individual', 'married_coc', 'company', 'trust'].includes(text(terms.purchaserType))) issues.push('Select a supported purchaser type.')
  const price = moneyCents(terms.purchasePrice), deposit = moneyCents(terms.depositAmount)
  if (price === null || price <= 0) issues.push('Enter a positive purchase price with at most two decimal places.')
  if (deposit === null) issues.push('Enter the deposit, including 0 if no deposit is required.')
  else if (price !== null && deposit > price) issues.push('The deposit cannot exceed the purchase price.')
  return { valid: issues.length === 0, issues }
}

export function validateDealSetupFunding({ terms = {}, finance = {} } = {}) {
  const issues = validateDealSetupCommercialTerms({ ...terms, purchaserType: 'individual' }).issues
  const type = resolveDealSetupFinanceType(finance.type)
  const price = moneyCents(terms.purchasePrice), deposit = moneyCents(terms.depositAmount)
  const cash = moneyCents(finance.cashAmount), bond = moneyCents(finance.bondAmount)
  const usesCash = ['cash', 'hybrid'].includes(type), usesBond = ['bond', 'hybrid'].includes(type)
  if (!type) issues.push(text(finance.type) ? 'The imported finance type is unresolved. Select the correct finance type.' : 'Select a finance type.')
  if (usesCash && (cash === null || cash <= 0)) issues.push('Enter a positive cash amount with at most two decimal places.')
  if (usesBond && (bond === null || bond <= 0)) issues.push('Enter a positive bond amount with at most two decimal places.')
  if (usesBond && !['client', 'bond_originator'].includes(text(finance.managedBy))) issues.push('Select Buyer or Bond originator to manage the bond.')
  if (usesCash && deposit !== null && cash !== null && deposit > cash) issues.push('The deposit must be included in, and cannot exceed, the cash amount.')
  const amountsPresent = type === 'cash' ? cash !== null : type === 'bond' ? bond !== null && deposit !== null : type === 'hybrid' ? cash !== null && bond !== null : false
  if (price !== null && price > 0 && amountsPresent) {
    const total = type === 'cash' ? cash : type === 'bond' ? bond + deposit : cash + bond
    if (total !== price) issues.push(type === 'bond' ? 'Deposit plus bond must equal the purchase price.' : 'Cash plus bond must equal the purchase price. The deposit is already included in cash.')
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] }
}

export function buildDealSetupCommercialPayload({ terms = {}, finance = {} } = {}) {
  const financeType = resolveDealSetupFinanceType(finance.type)
  if (text(finance.type) && !financeType) throw new Error('The imported finance type is unresolved. Select Cash, Bond, or Cash and bond before saving.')
  const usesCash = ['cash', 'hybrid', 'combination'].includes(financeType)
  const usesBond = ['bond', 'hybrid', 'combination'].includes(financeType)
  return {
    purchaser_type: text(terms.purchaserType) || null,
    purchase_price: number(terms.purchasePrice),
    deposit_amount: number(terms.depositAmount),
    finance_type: financeType || null,
    finance_managed_by: usesBond || !financeType ? text(finance.managedBy) || null : null,
    cash_amount: usesCash || !financeType ? number(finance.cashAmount) : null,
    bond_amount: usesBond || !financeType ? number(finance.bondAmount) : null,
    bank: usesBond || !financeType ? text(finance.bank) || null : null,
  }
}

export function buildDealSetup({ transaction = {}, buyerParties = [] } = {}) {
  const parties = getActiveDealSetupBuyers(buyerParties)
  const primary = getPrimaryDealSetupBuyer(parties)
  return Object.freeze({
    version: DEAL_SETUP_CONTRACT_VERSION,
    transactionId: text(transaction.id),
    property: Object.freeze({ developmentId: text(transaction.development_id), unitId: text(transaction.unit_id), address: text(transaction.property_address_line_1), sellerName: text(transaction.seller_name) }),
    buyers: Object.freeze(parties),
    // A manually captured buyer may not yet have a reusable buyers-table
    // profile. Their participant record is still a valid primary buyer.
    primaryBuyerId: text(primary?.buyer_party_id || primary?.id),
    capturedBuyerId: text(transaction.buyer_id),
    buyerLinkIssues: Object.freeze(getDealSetupBuyerLinkIssues({ transaction, buyerParties: parties })),
    terms: Object.freeze({ purchaserType: text(transaction.purchaser_type), purchasePrice: number(transaction.purchase_price ?? transaction.sales_price), depositAmount: number(transaction.deposit_amount), reservationRequired: Boolean(transaction.reservation_required), reservationAmount: number(transaction.reservation_amount) }),
    finance: Object.freeze({ type: text(transaction.finance_type), managedBy: text(transaction.finance_managed_by), cashAmount: number(transaction.cash_amount), bondAmount: number(transaction.bond_amount), bank: text(transaction.bank), bondOriginator: text(transaction.bond_originator) }),
  })
}

export function validateDealSetup(setup = {}) {
  const issues = []
  if (!text(setup.transactionId)) issues.push('Transaction is missing.')
  if (!setup.buyers?.length) issues.push('Add at least one buyer.')
  if (setup.buyers?.length && !text(setup.primaryBuyerId)) issues.push('Assign a primary buyer.')
  issues.push(...(setup.buyerLinkIssues || []).map((issue) => issue.message))
  issues.push(...validateDealSetupCommercialTerms(setup.terms).issues, ...validateDealSetupFunding(setup).issues)
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze([...new Set(issues)]) })
}
