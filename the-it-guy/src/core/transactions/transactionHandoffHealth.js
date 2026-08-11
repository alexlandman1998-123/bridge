import { isBondFinanceType, normalizeFinanceType } from './financeType.js'

export const TRANSACTION_HANDOFF_HEALTH_VERSION = 'arch9_transaction_handoff_health_v1'

const COMPLETE_STATUSES = new Set(['complete', 'ok', 'done', 'ready', 'verified', 'approved', 'accepted'])
const ONBOARDING_SENT_STATUSES = new Set([
  'awaiting_client_onboarding',
  'agent_assisted_pending',
  'hard_copy_pending',
  'onboarding',
  'onboarding_pending',
  'onboarding_sent',
  'sent',
  'in_progress',
  'started',
  'submitted',
  'completed',
])
const ONBOARDING_SUBMITTED_STATUSES = new Set([
  'submitted',
  'completed',
  'complete',
  'buyer_submitted',
  'signed_otp_received',
  'otp_uploaded',
  'ready_for_transfer',
])
const BOND_INTAKE_STATUSES = new Set([
  'awaiting_buyer_application',
  'buyer_in_progress',
  'awaiting_documents',
  'ready_for_review',
  'accepted',
  'submitted',
  'submitted_to_banks',
  'approved',
])
const REGISTRATION_STATUSES = new Set(['reg', 'registered', 'registration', 'registration_confirmed', 'complete', 'completed'])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function compact(values = []) {
  return values.map(text).filter(Boolean)
}

function firstText(...values) {
  return compact(values)[0] || ''
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function plainObject(value) {
  return isPlainObject(value) ? value : {}
}

function statusIn(value, acceptedStatuses) {
  const normalized = lower(value).replace(/\s+/g, '_')
  return acceptedStatuses.has(normalized)
}

function hasCompletionSignal(...values) {
  return values.some((value) => statusIn(value, COMPLETE_STATUSES))
}

function roleRows(input = {}) {
  return [
    ...(Array.isArray(input.participants) ? input.participants : []),
    ...(Array.isArray(input.rolePlayers) ? input.rolePlayers : []),
    ...(Array.isArray(input.role_players) ? input.role_players : []),
  ]
}

function hasRole(input = {}, roleAliases = []) {
  const aliases = new Set(roleAliases.map((role) => lower(role).replace(/\s+/g, '_')))
  return roleRows(input).some((row) => {
    const role = lower(row?.role_type || row?.roleType || row?.transaction_role || row?.role || row?.type).replace(/\s+/g, '_')
    const rowStatus = lower(row?.status || row?.assignment_status || row?.assignmentStatus)
    return aliases.has(role) && !['inactive', 'removed', 'declined', 'rejected', 'cancelled'].includes(rowStatus)
  })
}

function resolveFinanceType({ offer = {}, transaction = {}, lead = {} } = {}) {
  return normalizeFinanceType(
    firstText(
      transaction.finance_type,
      transaction.financeType,
      transaction.purchase_finance_type,
      transaction.purchaseFinanceType,
      offer.financeType,
      offer.finance_type,
      offer.purchaseFinanceType,
      offer.purchase_finance_type,
      lead.financeType,
      lead.finance_type,
      lead.preferredFinanceType,
      lead.preferred_finance_type,
    ),
    { allowUnknown: true },
  )
}

function getOfferBuyerVerificationArtifacts(offer = {}) {
  const conditions = plainObject(offer.conditions || offer.conditionsJson || offer.conditions_json)
  return {
    buyerVerification: plainObject(offer.buyerVerification || conditions.buyerVerification),
    buyerOnboarding: plainObject(offer.buyerOnboarding || conditions.buyerOnboarding),
    buyerVerificationSubmittedAt: firstText(
      offer.buyerVerificationSubmittedAt,
      offer.buyer_verification_submitted_at,
      offer.verificationSubmittedAt,
      conditions.buyerVerificationSubmittedAt,
    ),
  }
}

function hasOfferBuyerVerificationRecord(offer = {}) {
  const { buyerVerification, buyerOnboarding, buyerVerificationSubmittedAt } = getOfferBuyerVerificationArtifacts(offer)
  return Boolean(
    buyerVerificationSubmittedAt ||
      buyerVerification.status ||
      buyerVerification.formData ||
      buyerOnboarding.status ||
      buyerOnboarding.formData,
  )
}

function hasOfferBuyerVerificationSubmitted(offer = {}) {
  const { buyerVerification, buyerOnboarding, buyerVerificationSubmittedAt } = getOfferBuyerVerificationArtifacts(offer)
  return Boolean(
    buyerVerificationSubmittedAt ||
      buyerVerification.submittedAt ||
      buyerVerification.submitted_at ||
      buyerOnboarding.submittedAt ||
      buyerOnboarding.submitted_at ||
      statusIn(buyerVerification.status, ONBOARDING_SUBMITTED_STATUSES) ||
      statusIn(buyerOnboarding.status, ONBOARDING_SUBMITTED_STATUSES),
  )
}

function hasOnboardingRecord({ offer = {}, transaction = {}, onboarding = {}, diagnostic = {} } = {}) {
  return Boolean(
    onboarding?.id ||
      onboarding?.token ||
      diagnostic?.checks?.onboardingReady ||
      transaction.onboarding_id ||
      transaction.onboardingId ||
      transaction.onboarding_token ||
      transaction.onboardingToken ||
      hasOfferBuyerVerificationRecord(offer),
  )
}

function hasOnboardingSubmitted({ offer = {}, transaction = {}, onboarding = {}, diagnostic = {} } = {}) {
  return Boolean(
    onboarding?.submitted_at ||
      onboarding?.submittedAt ||
      transaction.onboarding_completed_at ||
      transaction.onboardingCompletedAt ||
      transaction.buyer_onboarding_submitted_at ||
      transaction.buyerOnboardingSubmittedAt ||
      statusIn(onboarding?.status, ONBOARDING_SUBMITTED_STATUSES) ||
      statusIn(transaction.onboarding_status || transaction.onboardingStatus, ONBOARDING_SUBMITTED_STATUSES) ||
      hasOfferBuyerVerificationSubmitted(offer) ||
      diagnostic?.checks?.prefillReady === true && hasCompletionSignal(transaction.otp_status, transaction.otpStatus),
  )
}

function hasBondAssignment({ transaction = {}, diagnostic = {} } = {}) {
  return Boolean(
    firstText(
      transaction.assigned_bond_originator_email,
      transaction.assignedBondOriginatorEmail,
      transaction.bond_originator,
      transaction.bondOriginator,
      transaction.primary_bond_consultant_user_id,
      transaction.primaryBondConsultantUserId,
      transaction.bond_workspace_id,
      transaction.bondWorkspaceId,
    ) ||
      hasRole(transaction, ['bond_originator', 'bond originator', 'consultant']) ||
      hasRole(diagnostic, ['bond_originator', 'bond originator', 'consultant']),
  )
}

function hasBondIntake({ transaction = {}, onboarding = {}, diagnostic = {} } = {}) {
  const formData = isPlainObject(onboarding?.form_data)
    ? onboarding.form_data
    : isPlainObject(onboarding?.formData)
      ? onboarding.formData
      : {}
  const bondApplication = isPlainObject(formData.bond_application) ? formData.bond_application : {}
  return Boolean(
    firstText(
      transaction.bond_application_id,
      transaction.bondApplicationId,
      transaction.accepted_bond_offer_id,
      transaction.acceptedBondOfferId,
      bondApplication.started_at,
      bondApplication.submitted_at,
    ) ||
      statusIn(transaction.bond_originator_intake_status || transaction.bondOriginatorIntakeStatus, BOND_INTAKE_STATUSES) ||
      statusIn(transaction.bond_application_status || transaction.bondApplicationStatus, BOND_INTAKE_STATUSES) ||
      statusIn(bondApplication.status, BOND_INTAKE_STATUSES) ||
      diagnostic?.checks?.bondIntakeReady === true,
  )
}

function hasTransferAttorney({ transaction = {}, diagnostic = {}, legalHandoff = {} } = {}) {
  return Boolean(
    firstText(
      transaction.assigned_attorney_email,
      transaction.assignedAttorneyEmail,
      transaction.transfer_attorney_email,
      transaction.transferAttorneyEmail,
      transaction.attorney,
      transaction.transfer_attorney,
      transaction.transferAttorney,
    ) ||
      hasRole(transaction, ['transfer_attorney', 'transfer attorney', 'conveyancer', 'attorney']) ||
      hasRole(diagnostic, ['transfer_attorney', 'transfer attorney', 'conveyancer', 'attorney']) ||
      hasRole(legalHandoff, ['transfer_attorney', 'transfer attorney', 'conveyancer', 'attorney']),
  )
}

function hasAttorneyHandoff({ transaction = {}, diagnostic = {}, legalHandoff = {} } = {}) {
  return Boolean(
    legalHandoff?.prepared === true ||
      legalHandoff?.ok === true ||
      diagnostic?.legalHandoff?.prepared === true ||
      diagnostic?.checks?.legalHandoffReady === true ||
      firstText(
        transaction.legal_handoff_prepared_at,
        transaction.legalHandoffPreparedAt,
        transaction.attorney_instruction_id,
        transaction.attorneyInstructionId,
      ),
  )
}

function hasRegistrationSignal(transaction = {}) {
  return Boolean(
    firstText(
      transaction.registration_date,
      transaction.registrationDate,
      transaction.registration_confirmed_at,
      transaction.registrationConfirmedAt,
      transaction.title_deed_number,
      transaction.titleDeedNumber,
    ) ||
      statusIn(transaction.current_main_stage || transaction.currentMainStage, REGISTRATION_STATUSES) ||
      statusIn(transaction.lifecycle_state || transaction.lifecycleState, REGISTRATION_STATUSES) ||
      lower(transaction.stage).includes('registration') ||
      lower(transaction.status).includes('registered'),
  )
}

function makeCheck(key, label, status, detail, action = '') {
  return { key, label, status, detail, action }
}

/**
 * Fast operational read-model for the rollout question: can a lead travel from
 * accepted offer through transaction handoff without disappearing silently?
 */
export function buildTransactionHandoffHealth({
  lead = {},
  offer = {},
  transaction = {},
  onboarding = {},
  diagnostic = {},
  legalHandoff = {},
  registrationBlockers = [],
} = {}) {
  const acceptedOffer = Boolean(
    offer?.acceptedAt ||
      offer?.accepted_at ||
      transaction.accepted_offer_id ||
      transaction.acceptedOfferId ||
      ['accepted', 'converted_to_transaction'].includes(lower(offer?.status)),
  )
  const transactionId = firstText(
    transaction.id,
    transaction.transactionId,
    transaction.dealId,
    offer.transactionId,
    offer.transaction_id,
    lead.convertedTransactionId,
    lead.converted_transaction_id,
  )
  const transactionCreated = Boolean(transactionId || diagnostic?.checks?.transactionLinked)
  const onboardingRecord = hasOnboardingRecord({ offer, transaction, onboarding, diagnostic })
  const onboardingSent = onboardingRecord || statusIn(transaction.onboarding_status || transaction.onboardingStatus, ONBOARDING_SENT_STATUSES)
  const onboardingSubmitted = hasOnboardingSubmitted({ offer, transaction, onboarding, diagnostic })
  const financeType = resolveFinanceType({ offer, transaction, lead })
  const bondRequired = isBondFinanceType(financeType)
  const bondAssigned = hasBondAssignment({ transaction, diagnostic })
  const bondIntake = hasBondIntake({ transaction, onboarding, diagnostic })
  const transferAttorneyAssigned = hasTransferAttorney({ transaction, diagnostic, legalHandoff })
  const attorneyHandoffPrepared = hasAttorneyHandoff({ transaction, diagnostic, legalHandoff })
  const registrationReady = hasRegistrationSignal(transaction)
  const blockers = Array.isArray(registrationBlockers) ? registrationBlockers : []

  const checks = [
    makeCheck(
      'offer_accepted',
      'Offer accepted',
      acceptedOffer ? 'complete' : 'pending',
      acceptedOffer ? 'Accepted offer found.' : 'Waiting for accepted buyer offer.',
      'Accept or convert the buyer offer before transaction work starts.',
    ),
    makeCheck(
      'transaction_created',
      'Transaction created',
      transactionCreated ? 'complete' : acceptedOffer ? 'blocked' : 'pending',
      transactionCreated ? `Linked transaction ${transactionId || 'found'}.` : acceptedOffer ? 'Accepted offer has no linked transaction.' : 'No transaction expected yet.',
      'Run Create Transaction from the accepted offer and re-check the linkage.',
    ),
    makeCheck(
      'buyer_onboarding_sent',
      'Buyer onboarding sent',
      onboardingSent ? 'complete' : transactionCreated ? 'attention' : 'pending',
      onboardingSent ? 'Onboarding record or status exists.' : transactionCreated ? 'Transaction exists, but buyer onboarding is not visible.' : 'Waiting for transaction creation.',
      'Create or resend the active buyer onboarding link.',
    ),
    makeCheck(
      'buyer_onboarding_submitted',
      'Buyer onboarding submitted',
      onboardingSubmitted ? 'complete' : transactionCreated ? 'attention' : 'pending',
      onboardingSubmitted ? 'Buyer onboarding has a submitted/completed signal.' : transactionCreated ? 'No submitted onboarding signal found.' : 'Waiting for transaction creation.',
      'Chase buyer onboarding or mark assisted onboarding as complete with evidence.',
    ),
    makeCheck(
      'bond_originator_assigned',
      'Bond originator assigned',
      !bondRequired ? 'not_applicable' : bondAssigned ? 'complete' : transactionCreated ? 'attention' : 'pending',
      !bondRequired ? `${financeType === 'unknown' ? 'Finance type unknown' : 'Cash/developer finance'}; no bond handoff required yet.` : bondAssigned ? 'Bond role player found.' : transactionCreated ? 'Bond finance, but no originator assignment found.' : 'Waiting for transaction creation.',
      'Assign a bond originator or record buyer-managed finance.',
    ),
    makeCheck(
      'bond_application_intake',
      'Bond application intake',
      !bondRequired ? 'not_applicable' : bondIntake ? 'complete' : transactionCreated ? 'attention' : 'pending',
      !bondRequired ? 'Not required for this finance type.' : bondIntake ? 'Bond intake/application signal found.' : transactionCreated ? 'No bond application or intake status found.' : 'Waiting for transaction creation.',
      'Start the bond intake or capture the external application status.',
    ),
    makeCheck(
      'transfer_attorney_assigned',
      'Transfer attorney assigned',
      transferAttorneyAssigned ? 'complete' : transactionCreated ? 'attention' : 'pending',
      transferAttorneyAssigned ? 'Transfer attorney signal found.' : transactionCreated ? 'No transfer attorney assignment found.' : 'Waiting for transaction creation.',
      'Assign the transfer attorney before legal handoff.',
    ),
    makeCheck(
      'attorney_handoff_prepared',
      'Attorney handoff prepared',
      attorneyHandoffPrepared ? 'complete' : transactionCreated ? 'attention' : 'pending',
      attorneyHandoffPrepared ? 'Legal handoff has a prepared signal.' : transactionCreated ? firstText(legalHandoff?.error, diagnostic?.legalHandoff?.error) || 'No legal handoff prepared signal found.' : 'Waiting for transaction creation.',
      'Retry or manually prepare the attorney handoff pack.',
    ),
    makeCheck(
      'registration_ready',
      'Registration/close-out visible',
      registrationReady ? 'complete' : blockers.length ? 'blocked' : transactionCreated ? 'pending' : 'pending',
      registrationReady ? 'Registration signal found.' : blockers.length ? blockers.slice(0, 2).map((item) => text(item.label || item.reason || item)).join('; ') : transactionCreated ? 'No registration evidence yet.' : 'Waiting for transaction creation.',
      'Use registration blockers once the attorney workflow reaches lodgement/registration.',
    ),
  ]

  const actionableChecks = checks.filter((check) => check.status !== 'not_applicable')
  const attention = checks.filter((check) => ['attention', 'blocked'].includes(check.status))
  const firstAction = attention[0] || checks.find((check) => check.status === 'pending') || null
  const completeCount = actionableChecks.filter((check) => check.status === 'complete').length

  return {
    version: TRANSACTION_HANDOFF_HEALTH_VERSION,
    transactionId: transactionId || null,
    financeType,
    bondRequired,
    status: attention.some((check) => check.status === 'blocked') ? 'blocked' : attention.length ? 'attention' : completeCount ? 'clear' : 'pending',
    summary: {
      completeCount,
      totalActionable: actionableChecks.length,
      attentionCount: attention.length,
      pendingCount: actionableChecks.filter((check) => check.status === 'pending').length,
    },
    checks,
    nextAction: firstAction ? {
      key: firstAction.key,
      label: firstAction.label,
      detail: firstAction.detail,
      action: firstAction.action,
    } : null,
  }
}
