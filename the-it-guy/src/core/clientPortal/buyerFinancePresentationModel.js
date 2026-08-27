const BOND_STAGE_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'application', label: 'Application', helper: 'Prepare and confirm your details' }),
  Object.freeze({ key: 'submitted', label: 'Submitted to banks', helper: 'Banks assess the application' }),
  Object.freeze({ key: 'responses', label: 'Bank responses', helper: 'Compare lender outcomes' }),
  Object.freeze({ key: 'approval', label: 'Approval', helper: 'Accept the right offer' }),
  Object.freeze({ key: 'guarantees', label: 'Guarantees', helper: 'Finance completes before registration' }),
])

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function amountLabel(value, fallback = 'Not set') {
  if (typeof value === 'string' && /[A-Za-z]/.test(value)) return text(value) || fallback
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? currency.format(amount) : fallback
}

function normalizeFinanceType(value = '') {
  const normalized = key(value)
  if (['bond', 'mortgage', 'home_loan'].includes(normalized)) return 'bond'
  if (['hybrid', 'combination', 'cash_and_bond', 'bond_and_cash'].includes(normalized)) return 'hybrid'
  return 'cash'
}

function resolveBondStage({ currentStage, status, offers = [], bankApplications = [] }) {
  const explicit = key(currentStage)
  if (BOND_STAGE_DEFINITIONS.some((stage) => stage.key === explicit)) return explicit
  const normalizedStatus = key(status)
  if (/guarantee|final_grant|registered|complete/.test(normalizedStatus)) return 'guarantees'
  if (/approv|accept|grant/.test(normalizedStatus) || offers.some((offer) => offer.isAccepted)) return 'approval'
  if (/response|offer|conditional/.test(normalizedStatus) || offers.length > 0) return 'responses'
  if (/submit|review|assess|bank/.test(normalizedStatus) || bankApplications.some((bank) => key(bank.status) !== 'not_started')) return 'submitted'
  return 'application'
}

function normalizeBankApplication(bank = {}, index = 0) {
  const status = text(bank.status) || 'Preparing'
  const normalizedStatus = key(status)
  return Object.freeze({
    ...bank,
    id: text(bank.id || bank.bankId) || `bank-${index + 1}`,
    bankName: text(bank.bankName || bank.lenderName || bank.name) || `Bank ${index + 1}`,
    status,
    statusTone: bank.statusTone || (/approv|accept|grant/.test(normalizedStatus) ? 'complete' : /declin|reject/.test(normalizedStatus) ? 'danger' : 'info'),
    amountLabel: amountLabel(bank.approvedAmount || bank.offeredAmount || bank.requestedAmount, ''),
    rateLabel: text(bank.interestRateDisplay || bank.interestRate || bank.rate),
    repaymentLabel: text(bank.estimatedRepayment || bank.monthlyRepayment),
    isRecommended: Boolean(bank.isRecommended),
  })
}

function normalizeOffer(offer = {}, index = 0) {
  const decision = key(offer.buyerDecision || offer.decision || offer.status)
  return Object.freeze({
    ...offer,
    id: text(offer.id || offer.bankId || offer.offerId) || `offer-${index + 1}`,
    bankName: text(offer.bankName || offer.lenderName || offer.name) || `Lender ${index + 1}`,
    amountLabel: amountLabel(offer.approvedAmount || offer.offeredAmount || offer.amount, 'Amount pending'),
    rateLabel: text(offer.interestRateDisplay || offer.interestRate || offer.rate),
    repaymentLabel: text(offer.estimatedRepayment || offer.monthlyRepayment),
    conditionsSummary: text(offer.conditionsSummary || offer.conditions || offer.latestUpdate),
    isRecommended: Boolean(offer.isRecommended),
    isAccepted: decision === 'accepted' || Boolean(offer.isAccepted),
    isDeclined: decision === 'declined' || Boolean(offer.isDeclined),
  })
}

export function buildBuyerFinancePresentationModel({
  source = 'unknown',
  financeType = 'cash',
  status = '',
  statusHelper = '',
  currentStage = '',
  purchasePrice = 0,
  requestedAmount = 0,
  loanToValue = '',
  progressPercent = 0,
  manager = null,
  nextStep = null,
  requiredActions = [],
  bankApplications = [],
  offers = [],
  accountSummary = {},
  accountCount = 0,
  loading = false,
  unavailable = false,
} = {}) {
  const mode = normalizeFinanceType(financeType)
  const isBondFinance = mode !== 'cash'
  const normalizedBanks = (Array.isArray(bankApplications) ? bankApplications : []).filter(Boolean).map(normalizeBankApplication)
  const normalizedOffers = (Array.isArray(offers) ? offers : []).filter(Boolean).map(normalizeOffer)
  const actions = (Array.isArray(requiredActions) ? requiredActions : []).filter(Boolean).map((action, index) => Object.freeze({
    ...action,
    id: text(action.id || action.key) || `finance-action-${index + 1}`,
    title: text(action.title || action.label) || 'Complete finance requirement',
    description: text(action.description || action.helper),
  }))
  const stageKey = isBondFinance ? resolveBondStage({ currentStage, status, offers: normalizedOffers, bankApplications: normalizedBanks }) : 'account'
  const currentStageIndex = isBondFinance ? BOND_STAGE_DEFINITIONS.findIndex((stage) => stage.key === stageKey) : -1
  const stages = isBondFinance ? BOND_STAGE_DEFINITIONS.map((stage, index) => Object.freeze({
    ...stage,
    state: index < currentStageIndex ? 'complete' : index === currentStageIndex ? 'current' : 'upcoming',
  })) : []
  const balanceDue = Number(accountSummary?.balanceDue || 0)
  const openRequests = Number(accountSummary?.openRequests || 0)
  const documentCount = Number(accountSummary?.documentCount || 0)
  const resolvedStatus = text(status) || (isBondFinance ? 'Application not started' : accountCount ? 'Account published' : 'Account being prepared')
  const resolvedNextStep = actions[0] || (nextStep ? Object.freeze({
    title: text(nextStep.title || nextStep.label),
    description: text(nextStep.description || nextStep.helper),
  }) : null)

  return Object.freeze({
    source,
    mode,
    isBondFinance,
    isCashFinance: !isBondFinance,
    title: isBondFinance ? 'Finance' : 'Finance & payments',
    description: isBondFinance
      ? 'Track your bond application, bank responses, and next finance action.'
      : 'Track payment requests, statements, and proof shared with your legal team.',
    status: resolvedStatus,
    statusHelper: text(statusHelper) || (isBondFinance ? 'Your live bond application status' : 'Published by your legal team'),
    statusTone: actions.length ? 'action' : /approv|accept|complete|published/.test(key(resolvedStatus)) ? 'complete' : 'info',
    stageKey,
    stages: Object.freeze(stages),
    currentStageIndex,
    purchasePriceLabel: amountLabel(purchasePrice),
    requestedAmountLabel: isBondFinance ? amountLabel(requestedAmount) : amountLabel(balanceDue, currency.format(0)),
    requestedAmountCaption: isBondFinance ? 'Requested bond' : 'Balance due',
    loanToValue: text(loanToValue),
    progressPercent: Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0))),
    manager: manager ? Object.freeze({
      name: text(manager.name) || 'Finance team',
      company: text(manager.company || manager.organisation),
      avatar: text(manager.avatar || manager.profileImage),
    }) : null,
    nextStep: resolvedNextStep,
    requiredActions: Object.freeze(actions),
    firstAction: actions[0] || null,
    bankApplications: Object.freeze(normalizedBanks),
    offers: Object.freeze(normalizedOffers.sort((left, right) => Number(right.isRecommended) - Number(left.isRecommended))),
    account: Object.freeze({
      accountCount: Number(accountCount || 0),
      balanceDue,
      balanceDueLabel: amountLabel(balanceDue, currency.format(0)),
      openRequests,
      overdueRequests: Number(accountSummary?.overdueRequests || 0),
      documentCount,
      eventCount: Number(accountSummary?.eventCount || 0),
    }),
    loading: Boolean(loading),
    unavailable: Boolean(unavailable),
    hasAction: actions.length > 0 || (!isBondFinance && openRequests > 0),
  })
}

export { BOND_STAGE_DEFINITIONS }
