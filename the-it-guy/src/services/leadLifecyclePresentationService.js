import { inferLeadCategoryFromRecord } from '../lib/leadCategory.js'
import {
  RESIDENTIAL_OFFER_STAGE_KEYS,
  getResidentialOfferStage,
  normalizeResidentialOfferStageKey,
} from '../core/offers/residentialOfferLifecycle.js'
import {
  BUYER_PROCESS_STAGE_KEYS,
  getBuyerProcessStage,
  normalizeBuyerProcessStageKey,
} from './buyerProcessDefinitionService.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeToken(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function titleCase(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

const SELLER_LIFECYCLE_STAGES = Object.freeze({
  new_lead: 'New Lead',
  contacted: 'Contacted',
  seller_onboarding_sent: 'Onboarding Sent',
  seller_onboarding_submitted: 'Onboarding Submitted',
  mandate_sent: 'Mandate Sent',
  mandate_signed: 'Mandate Signed',
  listing_created: 'Listing Created',
  listing_live: 'Listing Live',
  documents_submitted: 'All Documents Submitted',
})

const SELLER_LIFECYCLE_STAGE_ALIASES = Object.freeze({
  lead: 'new_lead',
  new: 'new_lead',
  new_lead: 'new_lead',
  seller_lead: 'new_lead',
  lead_created: 'new_lead',
  contacted: 'contacted',
  active: 'contacted',
  onboarding_sent: 'seller_onboarding_sent',
  seller_onboarding_sent: 'seller_onboarding_sent',
  onboarding_submitted: 'seller_onboarding_submitted',
  onboarding_completed: 'seller_onboarding_submitted',
  seller_onboarding_submitted: 'seller_onboarding_submitted',
  seller_onboarding_completed: 'seller_onboarding_submitted',
  mandate_generated: 'mandate_sent',
  mandate_ready: 'mandate_sent',
  mandate_sent: 'mandate_sent',
  mandate_signed: 'mandate_signed',
  listing_created: 'listing_created',
  converted_to_listing: 'listing_created',
  listing_live: 'listing_live',
  listing_active: 'listing_live',
  all_documents_submitted: 'documents_submitted',
  documents_submitted: 'documents_submitted',
})

function normalizeSellerLifecycleStageKey(value = '') {
  const token = normalizeToken(value)
  if (!token) return ''
  return SELLER_LIFECYCLE_STAGE_ALIASES[token] || ''
}

function resolveSellerLifecycleStageKey(lead = {}, rawStage = '') {
  return normalizeSellerLifecycleStageKey(rawStage)
    || normalizeSellerLifecycleStageKey(lead?.stage)
    || normalizeSellerLifecycleStageKey(lead?.status)
}

export function normalizeLeadLifecycleStageKey(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return RESIDENTIAL_OFFER_STAGE_KEYS.lead
  if (['canvassing', 'prospecting', 'new_prospect', 'new prospect', 'new_lead', 'new lead'].includes(normalized)) return RESIDENTIAL_OFFER_STAGE_KEYS.lead
  return normalizeResidentialOfferStageKey(normalized, normalized)
}

function resolveLeadCategory(lead = {}) {
  return inferLeadCategoryFromRecord(lead, 'buyer')
}

function normalizeKnownBuyerProcessStageKey(value = '') {
  if (!normalizeText(value)) return ''
  return normalizeBuyerProcessStageKey(value, '')
}

function resolveFunnelStage(lead = {}) {
  if (resolveLeadCategory(lead) === 'seller') {
    const sellerStageKey = resolveSellerLifecycleStageKey(lead, lead?.stage || lead?.status)
    if (sellerStageKey) return SELLER_LIFECYCLE_STAGES[sellerStageKey] || 'New Lead'
  }
  const buyerStageKey = normalizeKnownBuyerProcessStageKey(lead?.stage || lead?.status)
  if (buyerStageKey) return getBuyerProcessStage(buyerStageKey).label
  const normalizedStage = normalizeLeadLifecycleStageKey(lead?.stage || lead?.status)
  if (normalizedStage === RESIDENTIAL_OFFER_STAGE_KEYS.lead) return 'Lead'
  if (normalizedStage === RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent) return 'Offer Link Sent'
  if (normalizedStage === RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted) return 'Offer Submitted'
  if (normalizedStage === RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired) return 'Agent Review'
  if (normalizedStage === RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp) return 'OTP Ready'
  if (normalizedStage === RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated) return 'OTP Generated'
  if (normalizedStage === RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties) return 'Signed OTP'
  if (normalizedStage === RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive) return 'Converted'
  const stage = normalizeText(lead?.stage || lead?.status).toLowerCase()
  if (!stage) return 'Cold'
  if (stage.includes('lost')) return 'Archived'
  if (stage.includes('converted') || stage.includes('deal created')) return 'Converted'
  if (stage.includes('offer')) return 'Offer Discussed'
  if (stage.includes('viewing completed')) return 'Viewed'
  if (stage.includes('appointment scheduled') || stage.includes('viewing')) return 'Viewing Scheduled'
  if (
    stage.includes('contacted') ||
    stage.includes('follow-up') ||
    stage.includes('qualified') ||
    stage.includes('negotiating')
  ) return 'Contacted'
  return 'Cold'
}

function resolveColumnId(lead = {}, { linkedDeal = null } = {}) {
  const isSellerLead = resolveLeadCategory(lead) === 'seller'
  if (!isSellerLead) {
    const buyerStageKey = normalizeKnownBuyerProcessStageKey(lead?.stage || lead?.status)
    if (buyerStageKey) {
      if (
        linkedDeal &&
        ![
          BUYER_PROCESS_STAGE_KEYS.lost,
          BUYER_PROCESS_STAGE_KEYS.closedWon,
          BUYER_PROCESS_STAGE_KEYS.closedLost,
        ].includes(buyerStageKey)
      ) {
        return BUYER_PROCESS_STAGE_KEYS.transaction
      }
      return buyerStageKey
    }
  }
  const sellerStageKey = isSellerLead ? resolveSellerLifecycleStageKey(lead, lead?.stage || lead?.status) : ''
  const stage = sellerStageKey || normalizeLeadLifecycleStageKey(lead?.stage || lead?.status)
  const status = normalizeLeadLifecycleStageKey(lead?.status)
  const sellerStageLabel = sellerStageKey ? normalizeKey(SELLER_LIFECYCLE_STAGES[sellerStageKey]) : ''
  const combined = `${stage} ${status} ${normalizeKey(lead?.stage)} ${normalizeKey(lead?.status)} ${sellerStageLabel}`

  if (combined.includes('lost') || combined.includes('archive')) return 'lost'
  if (combined.includes('registered') || combined.includes('closed')) return 'registered'
  if (combined.includes('transfer')) return 'transfer'
  if (combined.includes('finance') || combined.includes('bond')) return 'finance'
  if (!isSellerLead && (
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent) ||
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted) ||
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired) ||
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp) ||
    combined.includes('negotiating')
  )) return 'offer'
  if (
    combined.includes('deal') ||
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated) ||
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.buyerSigned) ||
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned) ||
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.sentToSeller) ||
    combined.includes('transaction') ||
    combined.includes(RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties) ||
    linkedDeal
  ) return 'deal_otp'
  if (isSellerLead) {
    if (combined.includes('offer') || combined.includes('negotiating')) return 'offer_received'
    if (combined.includes('converted to listing') || combined.includes('listing active')) return 'listing_active'
    if (combined.includes('mandate signed')) return 'mandate_signed'
    if (combined.includes('mandate sent') || combined.includes('mandate generated') || combined.includes('mandate ready')) return 'mandate_sent'
    if (combined.includes('valuation') || combined.includes('appointment') || combined.includes('viewing')) return 'valuation_scheduled'
    if (
      combined.includes('onboarding') ||
      combined.includes('contacted') ||
      combined.includes('new_lead') ||
      combined.includes('lead')
    ) return 'lead'
  }
  if (combined.includes('offer') || combined.includes('negotiating')) return 'offer'
  if (
    combined.includes('contacted') ||
    combined.includes('qualified') ||
    combined.includes('viewing') ||
    combined.includes('appointment') ||
    combined.includes('onboarding') ||
    combined.includes('follow-up')
  ) return 'viewing_contacted'
  return 'lead'
}

function resolveStageTone(label = '') {
  const stage = normalizeText(label).toLowerCase()
  if (stage.includes('appointment') || stage.includes('valuation') || stage.includes('viewing')) {
    return { iconKey: 'calendar', className: 'border-[#f4dfcb] bg-[#fff4ea] text-[#c4681f]' }
  }
  if (stage.includes('document')) {
    return { iconKey: 'paperclip', className: 'border-[#eadbf8] bg-[#f7f1ff] text-[#7c4bd9]' }
  }
  if (stage.includes('follow')) {
    return { iconKey: 'clock', className: 'border-[#f7e7bf] bg-[#fff9eb] text-[#b67b13]' }
  }
  if (stage.includes('submit') || stage.includes('onboarding') || stage.includes('offer +')) {
    return { iconKey: 'check', className: 'border-[#d7e6fb] bg-[#eef5ff] text-[#2f69dc]' }
  }
  if (stage.includes('complete') || stage.includes('qualified') || stage.includes('signed') || stage.includes('listing')) {
    return { iconKey: 'check', className: 'border-[#d5ebdb] bg-[#eef9f1] text-[#23834f]' }
  }
  return { iconKey: 'tag', className: 'border-[#dce7f2] bg-[#f8fbff] text-[#35546c]' }
}

function resolveStatusMeta(lead = {}, funnelStage = '') {
  const signal = normalizeText(`${funnelStage} ${lead?.stage || ''} ${lead?.status || ''} ${lead?.priority || ''}`).toLowerCase()
  if (signal.includes('lost') || signal.includes('archive')) {
    return { label: 'Archived', score: 1, className: 'border-[#ead4d1] bg-[#fff5f4] text-[#9a4038]', dotClassName: 'bg-[#d96b5f]' }
  }
  if (signal.includes('converted') || signal.includes('qualified') || signal.includes('deal') || signal.includes('signed')) {
    return { label: 'Qualified', score: 4, className: 'border-[#cfe8dc] bg-[#effaf3] text-[#26724c]', dotClassName: 'bg-[#35a66d]' }
  }
  if (signal.includes('hot') || signal.includes('offer') || signal.includes('view') || signal.includes('appointment')) {
    return { label: 'Hot', score: 5, className: 'border-[#cfe8dc] bg-[#effaf3] text-[#26724c]', dotClassName: 'bg-[#35a66d]' }
  }
  if (signal.includes('warm') || signal.includes('contact') || signal.includes('follow')) {
    return { label: 'Warm', score: 3, className: 'border-[#f1dfb8] bg-[#fff8e8] text-[#8a641d]', dotClassName: 'bg-[#d79d3f]' }
  }
  return { label: 'Cold', score: 2, className: 'border-[#d4e5fb] bg-[#f1f7ff] text-[#2d659a]', dotClassName: 'bg-[#4f82b8]' }
}

function resolveReportingFlags(label = '', { category = 'buyer' } = {}) {
  const buyerStageKey = category !== 'seller' ? normalizeKnownBuyerProcessStageKey(label) : ''
  if (buyerStageKey) {
    const contactedStages = new Set([
      BUYER_PROCESS_STAGE_KEYS.contacted,
      BUYER_PROCESS_STAGE_KEYS.qualification,
      BUYER_PROCESS_STAGE_KEYS.viewing,
      BUYER_PROCESS_STAGE_KEYS.buyerOnboardingSent,
      BUYER_PROCESS_STAGE_KEYS.offerReceived,
      BUYER_PROCESS_STAGE_KEYS.transaction,
      BUYER_PROCESS_STAGE_KEYS.onHold,
      BUYER_PROCESS_STAGE_KEYS.closedWon,
      BUYER_PROCESS_STAGE_KEYS.closedLost,
    ])
    const qualifiedStages = new Set([
      BUYER_PROCESS_STAGE_KEYS.qualification,
      BUYER_PROCESS_STAGE_KEYS.viewing,
      BUYER_PROCESS_STAGE_KEYS.buyerOnboardingSent,
      BUYER_PROCESS_STAGE_KEYS.offerReceived,
      BUYER_PROCESS_STAGE_KEYS.transaction,
      BUYER_PROCESS_STAGE_KEYS.closedWon,
      BUYER_PROCESS_STAGE_KEYS.closedLost,
    ])
    const appointmentStages = new Set([
      BUYER_PROCESS_STAGE_KEYS.viewing,
      BUYER_PROCESS_STAGE_KEYS.buyerOnboardingSent,
      BUYER_PROCESS_STAGE_KEYS.offerReceived,
      BUYER_PROCESS_STAGE_KEYS.transaction,
      BUYER_PROCESS_STAGE_KEYS.closedWon,
      BUYER_PROCESS_STAGE_KEYS.closedLost,
    ])
    const dealStages = new Set([
      BUYER_PROCESS_STAGE_KEYS.transaction,
      BUYER_PROCESS_STAGE_KEYS.closedWon,
      BUYER_PROCESS_STAGE_KEYS.closedLost,
    ])
    return {
      contacted: contactedStages.has(buyerStageKey),
      qualified: qualifiedStages.has(buyerStageKey),
      appointmentScheduled: appointmentStages.has(buyerStageKey),
      dealCreated: dealStages.has(buyerStageKey),
    }
  }

  const stage = normalizeLeadLifecycleStageKey(label)
  const contactedStages = new Set([
    'contacted',
    'qualified',
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled,
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted,
    RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
    RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
    RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated,
    RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
    'follow-up',
    'negotiating',
    'deal created',
    'converted to transaction',
  ])
  const qualifiedStages = new Set([
    'qualified',
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled,
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted,
    RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
    RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
    RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated,
    RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
    'follow-up',
    'negotiating',
    'deal created',
    'converted to transaction',
  ])
  const appointmentStages = new Set([
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled,
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted,
    RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
    RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
    RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated,
    RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
    'follow-up',
    'negotiating',
    'deal created',
    'converted to transaction',
  ])
  const contacted = contactedStages.has(stage)
  const qualified = qualifiedStages.has(stage)
  const appointmentScheduled = appointmentStages.has(stage)
  const dealCreated = stage === 'deal created' || stage === 'converted to transaction' || stage === RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive
  return { contacted, qualified, appointmentScheduled, dealCreated }
}

export function resolveLeadLifecyclePresentation(lead = {}, options = {}) {
  const rawStage = normalizeText(options?.stage || lead?.stage || lead?.status)
  const category = resolveLeadCategory(lead)
  const sellerStageKey = category === 'seller' ? resolveSellerLifecycleStageKey(lead, rawStage) : ''
  const buyerStageKey = category === 'seller' ? '' : normalizeKnownBuyerProcessStageKey(rawStage)
  const stageKey = sellerStageKey || buyerStageKey || normalizeLeadLifecycleStageKey(rawStage)
  const funnelStage = resolveFunnelStage({ ...lead, stage: rawStage || lead?.stage, status: lead?.status })
  const buyerStage = buyerStageKey ? getBuyerProcessStage(buyerStageKey) : null
  const residentialStage = sellerStageKey || buyerStage ? null : getResidentialOfferStage(stageKey)
  const sellerLabel = sellerStageKey ? SELLER_LIFECYCLE_STAGES[sellerStageKey] : ''
  const label = sellerLabel || buyerStage?.label || (stageKey === RESIDENTIAL_OFFER_STAGE_KEYS.lead
    ? 'Lead'
    : normalizeText(options?.label || residentialStage?.label || rawStage || funnelStage || 'Lead') || titleCase(stageKey))
  const tone = resolveStageTone(label)
  return {
    key: stageKey,
    label,
    funnelStage,
    columnId: resolveColumnId(lead, options),
    category,
    stageTone: tone,
    statusMeta: resolveStatusMeta(lead, funnelStage),
    reporting: resolveReportingFlags(stageKey, { category }),
  }
}

export default resolveLeadLifecyclePresentation
