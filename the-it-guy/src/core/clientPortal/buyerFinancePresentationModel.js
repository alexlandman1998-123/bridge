const BOND_STAGE_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'application', label: 'Application received', helper: 'Your consultant reviews your application' }),
  Object.freeze({ key: 'submitted', label: 'Submitted to banks', helper: 'Banks assess the application' }),
  Object.freeze({ key: 'responses', label: 'Bank assessment', helper: 'Banks review your application' }),
  Object.freeze({ key: 'approval', label: 'Quotes received', helper: 'Review published bank quotes' }),
  Object.freeze({ key: 'guarantees', label: 'Final approval', helper: 'Your consultant confirms the final outcome' }),
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

function normalizeFinanceManager(value = '') {
  const normalized = key(value)
  return [
    'bond_originator',
    'bondoriginator',
    'originator',
    'originator_managed',
    'ooba',
    'ooba_assisted',
  ].includes(normalized)
    ? 'bond_originator'
    : normalized || 'bond_originator'
}

export function buyerFinanceBankKey(value) {
  const normalized = key(value)
  if (['fnb', 'first_national_bank', 'f_n_b'].includes(normalized)) return 'fnb'
  return normalized
}

export function isConfirmedBuyerBankSubmission(bank) {
  if (bank.application_type && bank.application_type !== 'bank_application') return false
  return Boolean(bank.submittedAt || bank.submitted_at) ||
    ['submitted', 'feedback_received', 'quote_received', 'additional_documents_required', 'declined', 'approved', 'buyer_approved', 'expired', 'under_assessment'].includes(key(bank.status))
}

function resolveOriginatorMilestone(finance, banks, offers) {
  if (!finance) return { stage: '', status: 'Finance updates unavailable', helper: 'Your consultant’s latest records could not be loaded. Please refresh in a moment.' }
  if ((finance.grantCaptures || []).some(grant => ['published_to_buyer', 'buyer_signed', 'submitted_for_instruction'].includes(grant.status) && (grant.published_at || grant.publishedAt))) {
    return { stage: 'guarantees', status: 'Final approval received', helper: 'Your consultant has shared the final approval.' }
  }
  if (offers.length) return { stage: 'approval', status: 'Quotes received', helper: 'Review the quotes shared by your consultant below.' }
  if (banks.some(bank => ['feedback_received', 'additional_documents_required', 'declined', 'approved', 'buyer_approved', 'expired', 'under_assessment'].includes(key(bank.status)))) {
    return { stage: 'responses', status: 'Bank assessment', helper: 'Your consultant is recording the banks’ responses.' }
  }
  if (banks.length) return { stage: 'submitted', status: 'Submitted to banks', helper: 'Your consultant has recorded the bank submissions shown below.' }
  return finance.applicationReceived
    ? { stage: 'application', status: 'Application received', helper: 'Your consultant has received your application.' }
    : { stage: '', status: 'Awaiting application receipt', helper: 'Your consultant has not confirmed receipt yet.' }
}

function resolveBondStage({ currentStage, status, offers = [], bankApplications = [] }) {
  const explicit = key(currentStage)
  if (BOND_STAGE_DEFINITIONS.some((stage) => stage.key === explicit)) return explicit
  const normalizedStatus = key(status)
  if (/guarantee|final_grant|registered|complete/.test(normalizedStatus)) return 'guarantees'
  if (/approv|accept|grant/.test(normalizedStatus) || offers.some((offer) => offer.isAccepted)) return 'approval'
  if (offers.length > 0) return 'approval'
  if (/response|offer|conditional|assess|review/.test(normalizedStatus)) return 'responses'
  if (/submit|review|assess|bank/.test(normalizedStatus) || bankApplications.some((bank) => key(bank.status) !== 'not_started')) return 'submitted'
  return 'application'
}

function normalizeBankApplication(bank = {}, index = 0) {
  const status = text(bank.status) || 'Preparing'
  const normalizedStatus = key(status)
  return Object.freeze({
    ...bank,
    id: text(bank.id || bank.bankId) || `bank-${index + 1}`,
    bankName: text(bank.bankName || bank.bank_name || bank.lenderName || bank.name) || `Bank ${index + 1}`,
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
  cashContribution = 0,
  loanToValue = '',
  progressPercent = 0,
  financeManagedBy = '',
  manager = null,
  originatorFinance = undefined,
  nextStep = null,
  requiredActions = [],
  bankApplications = [],
  bankApplicationsUnavailable = false,
  offers = [],
  accountSummary = {},
  accountCount = 0,
  loading = false,
  unavailable = false,
} = {}) {
  const mode = normalizeFinanceType(financeType)
  const isBondFinance = mode !== 'cash'
  const financeManager = normalizeFinanceManager(financeManagedBy)
  const isOriginatorManaged = isBondFinance && financeManager === 'bond_originator'
  const isDirectFinance = isBondFinance && !isOriginatorManaged
  const canonicalOriginator = isOriginatorManaged && source === 'production' && originatorFinance !== undefined
  const bankRows = canonicalOriginator ? originatorFinance?.bankApplications || [] : bankApplications
  const normalizedBanks = [...new Map((Array.isArray(bankRows) ? bankRows : []).filter(Boolean)
    .filter(bank => !canonicalOriginator || isConfirmedBuyerBankSubmission(bank))
    .map(normalizeBankApplication).map(bank => [buyerFinanceBankKey(bank.bankName), bank])).values()]
  const normalizedOffers = (Array.isArray(offers) ? offers : []).filter(Boolean)
    .filter(offer => !canonicalOriginator || (originatorFinance && offer.source === 'originator_capture' && ['published_to_buyer', 'accepted_by_buyer', 'declined_by_buyer'].includes(offer.status) && offer.publishedAt))
    .map(normalizeOffer)
  const milestone = canonicalOriginator ? resolveOriginatorMilestone(originatorFinance, normalizedBanks, normalizedOffers) : null
  if (canonicalOriginator) {
    manager = originatorFinance?.manager || null
    requestedAmount = originatorFinance?.requestedAmount || requestedAmount
    status = milestone.status
    statusHelper = milestone.helper
    requiredActions = []
  }
  const actions = (Array.isArray(requiredActions) ? requiredActions : []).filter(Boolean).map((action, index) => Object.freeze({
    ...action,
    id: text(action.id || action.key) || `finance-action-${index + 1}`,
    title: text(action.title || action.label) || 'Complete finance requirement',
    description: text(action.description || action.helper),
  }))
  const stageKey = isOriginatorManaged ? milestone ? milestone.stage : resolveBondStage({ currentStage, status, offers: normalizedOffers, bankApplications: normalizedBanks }) : 'account'
  const currentStageIndex = isOriginatorManaged ? BOND_STAGE_DEFINITIONS.findIndex((stage) => stage.key === stageKey) : -1
  const stages = isOriginatorManaged ? BOND_STAGE_DEFINITIONS.map((stage, index) => Object.freeze({
    ...stage,
    state: index < currentStageIndex ? 'complete' : index === currentStageIndex ? 'current' : 'upcoming',
  })) : []
  const balanceDue = Number(accountSummary?.balanceDue || 0)
  const openRequests = Number(accountSummary?.openRequests || 0)
  const documentCount = Number(accountSummary?.documentCount || 0)
  const resolvedStatus = text(status) || (isOriginatorManaged
    ? 'Application not started'
    : isDirectFinance
      ? 'Finance arranged directly'
      : accountCount ? 'Account published' : 'Account being prepared')
  const resolvedNextStep = actions[0] || (nextStep ? Object.freeze({
    title: text(nextStep.title || nextStep.label),
    description: text(nextStep.description || nextStep.helper),
  }) : null)

  return Object.freeze({
    source,
    mode,
    isBondFinance,
    isCashFinance: !isBondFinance,
    isOriginatorManaged,
    isDirectFinance,
    financeManager,
    title: isOriginatorManaged ? 'Finance' : 'Finance & payments',
    description: isOriginatorManaged
      ? 'Track your bond application, bank responses, and next finance action.'
      : isDirectFinance
        ? mode === 'hybrid'
          ? 'Track the cash contribution, direct finance documents, and payment requests shared with your legal team.'
          : 'Track direct finance documents, payment requests, and proof shared with your legal team.'
        : 'Track payment requests, statements, and proof shared with your legal team.',
    status: resolvedStatus,
    statusHelper: text(statusHelper) || (isOriginatorManaged
      ? 'Your live bond application status'
      : isDirectFinance
        ? 'Upload your bank approval or supporting documents for your legal team.'
        : 'Published by your legal team'),
    statusTone: actions.length ? 'action' : /approv|accept|complete|published/.test(key(resolvedStatus)) ? 'complete' : 'info',
    stageKey,
    stages: Object.freeze(stages),
    currentStageIndex,
    purchasePriceLabel: amountLabel(purchasePrice),
    requestedAmountLabel: isBondFinance ? amountLabel(requestedAmount) : amountLabel(balanceDue, currency.format(0)),
    requestedAmountCaption: isBondFinance ? 'Requested bond' : 'Balance due',
    cashContributionLabel: mode === 'hybrid' ? amountLabel(cashContribution) : '',
    hasCashContribution: mode === 'hybrid' && Number(cashContribution) > 0,
    loanToValue: text(loanToValue),
    progressPercent: canonicalOriginator ? Math.max(0, Math.round(currentStageIndex / (BOND_STAGE_DEFINITIONS.length - 1) * 100)) : Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0))),
    manager: manager && (manager.name || manager.company || manager.organisation || manager.email) ? Object.freeze({
      name: text(manager.name) || 'Finance team',
      company: text(manager.company || manager.organisation),
      logo: text(manager.logo || manager.logoUrl),
      avatar: text(manager.avatar || manager.profileImage),
      email: text(manager.email),
      phone: text(manager.phone),
    }) : null,
    nextStep: resolvedNextStep,
    requiredActions: Object.freeze(actions),
    firstAction: actions[0] || null,
    bankApplications: Object.freeze(normalizedBanks),
    bankApplicationsUnavailable: canonicalOriginator ? !originatorFinance : Boolean(bankApplicationsUnavailable),
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
