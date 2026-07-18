const AUDIENCE_META = {
  client: { key: 'client', label: 'Buyer & seller', visibility: 'client_visible' },
  professional: { key: 'professional', label: 'Professional team', visibility: 'shared' },
  internal: { key: 'internal', label: 'Internal team', visibility: 'internal' },
}

const ATTENTION_STATUSES = new Set(['needs_correction', 'overdue', 'due_today', 'urgent'])
const CLOSED_STATUSES = new Set(['closed', 'complete', 'completed', 'resolved', 'cancelled'])

function text(value = '') {
  return String(value || '').trim()
}

function timestamp(value = '') {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function audienceFromVisibility(visibility = '', fallback = '') {
  const normalized = text(visibility).toLowerCase()
  const normalizedFallback = text(fallback).toLowerCase()
  if (normalized.includes('client') || normalized.includes('buyer') || ['client', 'buyer', 'seller'].includes(normalizedFallback)) return 'client'
  if (normalized.includes('internal') || normalizedFallback === 'attorney' || normalizedFallback === 'internal') return 'internal'
  return 'professional'
}

function communicationAudience(entry = {}) {
  return audienceFromVisibility(
    entry.visibility || entry.visibilityScope || entry.visibility_scope,
    entry.commentType || entry.discussionType || entry.messageType,
  )
}

function isHumanCommunication(entry = {}) {
  if (entry.kind === 'system') return false
  return Boolean(text(entry.body || entry.message || entry.title))
}

function formatReference(reference = '') {
  return text(reference) || 'this matter'
}

export function buildAttorneyCommunicationTemplates({
  matterReference = '',
  stageLabel = '',
  nextActionLabel = '',
} = {}) {
  const reference = formatReference(matterReference)
  const stage = text(stageLabel) || 'the current conveyancing stage'
  const nextAction = text(nextActionLabel) || 'the next required step'

  return [
    {
      key: 'client_progress',
      audience: 'client',
      title: 'Client progress update',
      description: 'Plain-language update for the buyer and seller.',
      body: `Matter ${reference}: We are currently at ${stage}. The next step is ${nextAction}. We will let you know as soon as there is further progress.`,
    },
    {
      key: 'professional_follow_up',
      audience: 'professional',
      title: 'Professional follow-up',
      description: 'Chase an outstanding item with the professional team.',
      body: `Matter ${reference}: Please provide an update on the outstanding item so that we can proceed with ${nextAction}. Kindly confirm the expected completion date.`,
    },
    {
      key: 'internal_note',
      audience: 'internal',
      title: 'Internal file note',
      description: 'Record a private note or handover for the legal team.',
      body: `Matter ${reference}: Internal note regarding ${stage}. Next action: ${nextAction}.`,
    },
  ].map((template) => ({ ...AUDIENCE_META[template.audience], ...template }))
}

function normalizeFollowUp(item = {}, workflow = {}, index = 0) {
  const status = text(item.status).toLowerCase() || 'open'
  if (CLOSED_STATUSES.has(status) || item.actioned) return null
  const audience = audienceFromVisibility(item.visibility, item.audience)
  return {
    id: text(item.id) || `${text(workflow.key || workflow.lane?.laneKey) || 'workflow'}-${index}`,
    title: text(item.title) || 'Workflow follow-up',
    description: text(item.description) || 'A response or document is still outstanding.',
    status,
    statusLabel: text(item.statusLabel) || status.replaceAll('_', ' '),
    dueDate: text(item.dueDate),
    priority: text(item.priority) || 'required',
    audience,
    audienceLabel: text(item.audienceLabel) || AUDIENCE_META[audience].label,
    laneLabel: text(item.laneLabel || workflow.label || workflow.lane?.label),
    needsAttention: ATTENTION_STATUSES.has(status),
    item,
    workflow,
  }
}

function followUpRank(item = {}) {
  const order = { needs_correction: 0, overdue: 1, due_today: 2, urgent: 3, due_soon: 4, review_pending: 5, open: 6, unscheduled: 7 }
  return order[item.status] ?? 8
}

export function buildAttorneyCommunicationControl({
  activityFeed = [],
  workflows = [],
  matterReference = '',
  stageLabel = '',
  nextActionLabel = '',
} = {}) {
  const communications = (Array.isArray(activityFeed) ? activityFeed : [])
    .filter(isHumanCommunication)
    .map((entry) => ({ ...entry, audience: communicationAudience(entry) }))
    .sort((left, right) => timestamp(right.createdAt || right.timestamp) - timestamp(left.createdAt || left.timestamp))

  const latestByAudience = Object.keys(AUDIENCE_META).reduce((result, audience) => {
    result[audience] = communications.find((entry) => entry.audience === audience) || null
    return result
  }, {})

  const followUps = (Array.isArray(workflows) ? workflows : [])
    .filter((workflow) => workflow?.required !== false)
    .flatMap((workflow) => {
      const items = workflow?.lane?.followUpSummary?.items || workflow?.lane?.followUps || []
      return (Array.isArray(items) ? items : []).map((item, index) => normalizeFollowUp(item, workflow, index)).filter(Boolean)
    })
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((left, right) => followUpRank(left) - followUpRank(right))

  const templates = buildAttorneyCommunicationTemplates({ matterReference, stageLabel, nextActionLabel })
  const attentionCount = followUps.filter((item) => item.needsAttention).length
  const recommendedAudience = followUps[0]?.audience || (!latestByAudience.client ? 'client' : 'professional')
  const recommendedTemplate = templates.find((template) => template.audience === recommendedAudience) || templates[0]

  return {
    audiences: AUDIENCE_META,
    templates,
    recommendedTemplateKey: recommendedTemplate?.key || '',
    latestByAudience,
    recentCommunications: communications.slice(0, 6),
    followUps,
    counts: {
      awaitingResponse: followUps.length,
      needsAttention: attentionCount,
      overdue: followUps.filter((item) => item.status === 'overdue').length,
    },
  }
}
