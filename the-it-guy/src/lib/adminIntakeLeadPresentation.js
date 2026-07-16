export const LEAD_STAGE_OPTIONS = [
  { value: 'all', label: 'All stages' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'demo_scheduled', label: 'Demo scheduled' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'closed', label: 'Closed' },
  { value: 'spam', label: 'Spam' },
]

export const LEAD_PRIORITY_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

export const LEAD_STAGE_TONES = {
  new: 'border-[#bfe6d2] bg-[#edf9f2] text-[#17613f]',
  contacted: 'border-[#d9e2eb] bg-[#f5f8fb] text-[#3b5268]',
  qualified: 'border-[#c8dcf7] bg-[#f0f6ff] text-[#245790]',
  demo_scheduled: 'border-[#d7cff5] bg-[#f6f3ff] text-[#5b43a6]',
  proposal: 'border-[#ead8b3] bg-[#fff8e9] text-[#825b12]',
  won: 'border-[#a8d9bf] bg-[#e7f7ee] text-[#125d38]',
  lost: 'border-[#e5d7d4] bg-[#faf6f5] text-[#76514b]',
  closed: 'border-[#d9e2eb] bg-[#f5f8fb] text-[#3b5268]',
  spam: 'border-[#efcbc8] bg-[#fff4f3] text-[#9b2c25]',
}

export function normalizeLeadText(value = '') {
  return String(value || '').trim()
}

export function getLeadName(lead = {}) {
  return [lead.first_name, lead.last_name].map(normalizeLeadText).filter(Boolean).join(' ') || 'Unnamed contact'
}

export function formatLeadDate(value, { includeTime = true } = {}) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date)
}

export function formatLeadList(value = []) {
  if (!Array.isArray(value)) return normalizeLeadText(value) || 'Not provided'
  return value.map(normalizeLeadText).filter(Boolean).join(', ') || 'Not provided'
}

export function formatLeadStage(value = 'new') {
  const stage = normalizeLeadText(value) || 'new'
  return LEAD_STAGE_OPTIONS.find((option) => option.value === stage)?.label || stage.replace(/_/g, ' ')
}

export function formatIntakeKind(value = '') {
  if (value === 'new_business_partner') return 'New business partner'
  if (value === 'demo_request') return 'Demo request'
  return normalizeLeadText(value).replace(/_/g, ' ') || 'Website intake'
}

export function isLeadOverdue(lead = {}) {
  if (!lead.next_action_at || ['won', 'lost', 'closed', 'spam'].includes(lead.sales_stage)) return false
  const dueAt = new Date(lead.next_action_at)
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now()
}

