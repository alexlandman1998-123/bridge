import { resolveTransactionSaleProfile } from '../transactions/transactionSaleProfile.js'

export const DEVELOPER_LEAD_PHASE17_CONTRACT = 'developer-leads-phase17-transaction-handoff-v1'

const TRANSACTION_READY_STATUSES = Object.freeze(['qualified', 'viewing', 'reserved'])
const EARLY_ONBOARDING_LINK_STATUSES = Object.freeze(['new', 'contacted', ...TRANSACTION_READY_STATUSES])
const ONBOARDING_CONTEXT_STATUSES = Object.freeze(['onboarding_sent', 'onboarding_submitted', 'otp'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function hasContactChannel(lead = {}) {
  return Boolean(normalizeText(lead.buyerEmail) || normalizeText(lead.buyerPhone))
}

function isAgencyFedLead(lead = {}) {
  return lead.leadOwner === 'agency' || lead.accessProfile?.agencyFed === true
}

function requiresAgencyHandover(lead = {}) {
  return isAgencyFedLead(lead) && lead.accessProfile?.requiresHandoverBeforePrivateDetails === true
}

function isConvertedLead(lead = {}) {
  return normalizeLower(lead.leadStatus) === 'converted'
}

function buildBlocker(code, message) {
  return Object.freeze({ code, message })
}

function buildWarning(code, message) {
  return Object.freeze({ code, message })
}

function resolveConversionDetailedStage(lead = {}) {
  const reservationState = normalizeLower(lead.reservationState)
  const reservationStatus = normalizeLower(lead.reservationStatus)

  if (reservationState === 'reserved' || reservationStatus === 'paid') return 'Deposit Paid'
  return 'Reserved'
}

function resolveConversionMainStage() {
  return 'DEP'
}

export function buildDeveloperLeadTransactionHandoff(lead = {}, {
  defaultPurchaserType = 'individual',
  defaultFinanceType = 'unknown',
  allowEarlyLeadStatus = false,
} = {}) {
  const leadStatus = normalizeLower(lead.leadStatus || 'new')
  const saleProfile = resolveTransactionSaleProfile({
    setup: {
      transactionType: 'developer_sale',
      developmentId: lead.primaryDevelopmentId,
      unitId: lead.preferredUnitId,
      assignedAgentId: lead.assignedAgentId,
    },
    lead,
    sourceContext: {
      leadOwner: lead.leadOwner,
      ownershipModel: lead.ownershipModel,
      sellingModel: lead.sellingModel,
      sourceAgencyOrgId: lead.sourceAgencyOrgId,
      assignedAgentId: lead.assignedAgentId,
    },
  })
  const readyStatuses = allowEarlyLeadStatus ? EARLY_ONBOARDING_LINK_STATUSES : TRANSACTION_READY_STATUSES
  const blockers = []
  const warnings = []

  if (!normalizeText(lead.developerLeadId)) {
    blockers.push(buildBlocker('lead_missing', 'A persisted developer lead is required.'))
  }

  if (isConvertedLead(lead)) {
    blockers.push(buildBlocker('already_converted', 'This lead is already in the transaction workflow.'))
  }

  if (ONBOARDING_CONTEXT_STATUSES.includes(leadStatus)) {
    blockers.push(buildBlocker('onboarding_already_started', 'Buyer onboarding has already been sent for this lead.'))
  }

  if (requiresAgencyHandover(lead)) {
    blockers.push(buildBlocker('agency_handover_required', 'Agency-fed buyer details must be handed over before buyer onboarding.'))
  }

  if (!readyStatuses.includes(leadStatus)) {
    blockers.push(buildBlocker(
      'lead_not_qualified',
      allowEarlyLeadStatus
        ? 'Capture or contact the lead before copying buyer onboarding.'
        : 'Move the lead to qualified, viewing, or reserved before buyer onboarding can be sent.',
    ))
  }

  if (!normalizeText(lead.buyerFullName)) {
    blockers.push(buildBlocker('buyer_name_missing', 'Buyer full name is required before buyer onboarding can be sent.'))
  }

  if (!hasContactChannel(lead)) {
    blockers.push(buildBlocker('buyer_contact_missing', 'Buyer email or phone is required before onboarding can be prepared.'))
  }

  if (!normalizeText(lead.buyerEmail)) {
    warnings.push(buildWarning('buyer_email_missing', 'Buyer onboarding can be prepared, but email delivery needs a buyer email address.'))
  }

  if (!normalizeText(lead.primaryDevelopmentId)) {
    blockers.push(buildBlocker('development_missing', 'Select one primary development before buyer onboarding.'))
  }

  if (!normalizeText(lead.preferredUnitId)) {
    blockers.push(buildBlocker('unit_missing', 'Select a preferred unit before buyer onboarding can be sent.'))
  }

  const handoff = {
    setup: {
      transactionType: 'developer_sale',
      saleRoute: saleProfile.saleRoute,
      saleChannel: saleProfile.saleChannel,
      sellerPartyType: saleProfile.sellerPartyType,
      leadOwner: normalizeText(lead.leadOwner),
      ownershipModel: normalizeText(lead.ownershipModel),
      sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId),
      sourceAgentUserId: normalizeText(lead.sourceAgentUserId),
      developmentId: normalizeText(lead.primaryDevelopmentId),
      unitId: normalizeText(lead.preferredUnitId),
      buyerName: normalizeText(lead.buyerFullName),
      buyerEmail: normalizeLower(lead.buyerEmail),
      buyerPhone: normalizeText(lead.buyerPhone),
      purchaserType: defaultPurchaserType,
      financeType: defaultFinanceType,
      assignedAgentId: normalizeText(lead.assignedAgentId),
    },
    finance: {
      reservationRequired: ['provisional', 'reserved'].includes(normalizeLower(lead.reservationState)),
      reservationStatus: normalizeLower(lead.reservationState) === 'reserved' ? 'paid' : 'not_required',
      nextAction: 'Send buyer onboarding link from the lead workspace.',
    },
    status: {
      stage: resolveConversionDetailedStage(lead),
      mainStage: resolveConversionMainStage(),
      nextAction: 'Send buyer onboarding link from the lead workspace.',
      notes: `Prepared from developer lead ${normalizeText(lead.publicReference || lead.developerLeadId)}.`,
    },
    options: {
      sourceContext: {
        origin: 'developer_lead',
        originLabel: 'Developer Lead',
        developerLeadId: normalizeText(lead.developerLeadId),
        developerOrgId: normalizeText(lead.developerOrgId),
        sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId),
        sourceAgentUserId: normalizeText(lead.sourceAgentUserId),
        assignedAgentId: normalizeText(lead.assignedAgentId),
        leadOwner: normalizeText(lead.leadOwner),
        ownershipModel: normalizeText(lead.ownershipModel),
        sellingModel: normalizeText(lead.sellingModel),
        saleRoute: saleProfile.saleRoute,
        saleChannel: saleProfile.saleChannel,
        sellerPartyType: saleProfile.sellerPartyType,
      },
    },
  }

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE17_CONTRACT,
    eligible: blockers.length === 0,
    status: blockers.length === 0 ? warnings.length > 0 ? 'attention' : 'ready' : 'blocked',
    label: blockers.length === 0 ? 'Ready to send onboarding' : 'Setup needed',
    blockers,
    warnings,
    handoff,
  })
}

export function summarizeDeveloperLeadTransactionHandoffs(leads = []) {
  const handoffs = (Array.isArray(leads) ? leads : []).map((lead) => buildDeveloperLeadTransactionHandoff(lead))
  const ready = handoffs.filter((handoff) => handoff.eligible).length
  const attention = handoffs.filter((handoff) => handoff.status === 'attention').length
  const blocked = handoffs.filter((handoff) => handoff.status === 'blocked').length

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE17_CONTRACT,
    total: handoffs.length,
    ready,
    attention,
    blocked,
    handoffs,
  })
}
