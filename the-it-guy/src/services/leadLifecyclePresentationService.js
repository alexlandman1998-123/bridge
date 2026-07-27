import { inferLeadCategoryFromRecord } from '../lib/leadCategory.js'
import { resolveBuyerLeadLifecycle } from '../core/leads/buyerLeadLifecycleContract.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase()
}

function titleCase(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

export function normalizeLeadLifecycleStageKey(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return 'lead'
  if (['canvassing', 'prospecting', 'new_prospect', 'new prospect', 'new_lead', 'new lead'].includes(normalized)) return 'lead'
  return normalized
}

function resolveLeadCategory(lead = {}) {
  return inferLeadCategoryFromRecord(lead, 'buyer')
}

function resolveBuyerLifecycleForLead(lead = {}) {
  return resolveLeadCategory(lead) === 'buyer' ? resolveBuyerLeadLifecycle(lead) : null
}

function resolveFunnelStage(lead = {}) {
  const buyerLifecycle = resolveBuyerLifecycleForLead(lead)
  if (buyerLifecycle) return buyerLifecycle.funnelStage
  const normalizedStage = normalizeLeadLifecycleStageKey(lead?.stage || lead?.status)
  if (normalizedStage === 'lead') return 'Lead'
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
  const buyerLifecycle = resolveBuyerLifecycleForLead(lead)
  if (buyerLifecycle) {
    if (linkedDeal) return 'deal_otp'
    return buyerLifecycle.columnId
  }
  const stage = normalizeLeadLifecycleStageKey(lead?.stage || lead?.status)
  const status = normalizeLeadLifecycleStageKey(lead?.status)
  const combined = `${stage} ${status}`
  const isSellerLead = resolveLeadCategory(lead) === 'seller'

  if (combined.includes('lost') || combined.includes('archive')) return 'lost'
  if (combined.includes('registered') || combined.includes('closed')) return 'registered'
  if (combined.includes('transfer')) return 'transfer'
  if (combined.includes('finance') || combined.includes('bond')) return 'finance'
  if (
    combined.includes('deal') ||
    combined.includes('otp') ||
    combined.includes('transaction') ||
    linkedDeal
  ) return 'deal_otp'
  if (isSellerLead) {
    if (combined.includes('offer') || combined.includes('negotiating')) return 'offer_received'
    if (combined.includes('converted to listing') || combined.includes('listing active')) return 'listing_active'
    if (combined.includes('mandate signed')) return 'mandate_signed'
    if (combined.includes('mandate sent') || combined.includes('mandate generated') || combined.includes('mandate ready')) return 'mandate_sent'
    if (combined.includes('valuation') || combined.includes('appointment') || combined.includes('viewing')) return 'valuation_scheduled'
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
  if (stage.includes('submit') || stage.includes('onboarding')) {
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

function resolveReportingFlags(label = '') {
  const stage = normalizeKey(label)
  const contactedStages = new Set([
    'contacted',
    'qualified',
    'appointment scheduled',
    'appointment completed',
    'offer submitted',
    'offer accepted',
    'follow-up',
    'negotiating',
    'deal created',
    'converted to transaction',
  ])
  const qualifiedStages = new Set([
    'qualified',
    'appointment scheduled',
    'appointment completed',
    'offer submitted',
    'offer accepted',
    'follow-up',
    'negotiating',
    'deal created',
    'converted to transaction',
  ])
  const appointmentStages = new Set([
    'appointment scheduled',
    'appointment completed',
    'offer submitted',
    'offer accepted',
    'follow-up',
    'negotiating',
    'deal created',
    'converted to transaction',
  ])
  const contacted = contactedStages.has(stage)
  const qualified = qualifiedStages.has(stage)
  const appointmentScheduled = appointmentStages.has(stage)
  const dealCreated = stage === 'deal created' || stage === 'converted to transaction'
  return { contacted, qualified, appointmentScheduled, dealCreated }
}

export function resolveLeadLifecyclePresentation(lead = {}, options = {}) {
  const rawStage = normalizeText(options?.stage || lead?.stage || lead?.status)
  const stageKey = normalizeLeadLifecycleStageKey(rawStage)
  const scopedLead = { ...lead, stage: rawStage || lead?.stage, status: lead?.status }
  const buyerLifecycle = resolveBuyerLifecycleForLead(scopedLead)
  const funnelStage = buyerLifecycle?.funnelStage || resolveFunnelStage(scopedLead)
  const label = stageKey === 'lead'
    ? 'Lead'
    : normalizeText(options?.label || rawStage || funnelStage || 'Lead') || titleCase(stageKey)
  const tone = resolveStageTone(label)
  return {
    key: stageKey,
    label,
    lifecycleStage: buyerLifecycle?.stage || stageKey,
    lifecycleStatus: buyerLifecycle?.lifecycleStatus || '',
    lifecycleOrder: buyerLifecycle?.order || 0,
    funnelStage,
    columnId: resolveColumnId(lead, options),
    category: resolveLeadCategory(lead),
    stageTone: tone,
    statusMeta: resolveStatusMeta(lead, funnelStage),
    reporting: resolveReportingFlags(label),
  }
}

export default resolveLeadLifecyclePresentation
