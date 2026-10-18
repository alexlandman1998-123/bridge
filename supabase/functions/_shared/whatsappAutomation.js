import { buildTemplateMessage, previewTemplate, templateFields, templateIdentity } from './whatsappCampaign.js'

export function automationTemplate(template, values = {}, contact = { phone: '27820000000', full_name: 'Test Customer' }) {
  const definition = templateFields(template)
  if (definition.unsupported.length || definition.fields.some(field => field.kind !== 'text')) throw new Error('Choose an approved text template with supported text or button variables for automation.')
  if (Object.values(values).some(value => !['text', 'first_name', 'full_name'].includes(value?.source))) throw new Error('Choose a name field or fixed text for every template variable.')
  return { provider: buildTemplateMessage(template, values, contact), preview: previewTemplate(template, values, contact), identity: templateIdentity(template) }
}

export function automationDraft(input = {}) {
  const trigger = String(input.trigger || '')
  const kind = String(input.kind || '')
  const action = String(input.action || '')
  const name = String(input.name || '').trim()
  const stage = String(input.stage || '').trim().toLowerCase()
  const delay = Number(input.delayMinutes || 0)
  const start = Number(input.startMinute), end = Number(input.endMinute)
  const days = input.days
  const timezone = String(input.timezone || '')
  if (!name || name.length > 100 || !['new_lead', 'no_response', 'stage_changed'].includes(trigger) || !['buyer', 'seller', 'recruitment'].includes(kind) || !['message', 'task'].includes(action)) throw new Error('Choose a rule name, lead type, trigger and action.')
  if (trigger === 'stage_changed' && (!stage || stage.length > 100)) throw new Error('Choose the lead stage that starts this rule.')
  if (!Number.isInteger(delay) || delay < (trigger === 'no_response' ? 1 : 0) || delay > 10080) throw new Error('Choose a delay of up to seven days; follow-ups need at least one minute.')
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || start >= end || !Array.isArray(days) || !days.length || days.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error('Choose sending days and a daytime window with the end after the start.')
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format() } catch { throw new Error('Choose a valid time zone.') }
  if (kind === 'recruitment' && input.assignAgentId) throw new Error('Recruitment stays in the management pipeline.')
  if (trigger !== 'new_lead' && input.assignAgentId) throw new Error('Automatic assignment is available for new leads only.')
  const taskTitle = String(input.taskTitle || '').trim()
  if (action === 'task' && (!taskTitle || taskTitle.length > 200)) throw new Error('Write a task title of up to 200 characters.')
  if (action === 'message') automationTemplate(input.template, input.values)
  return { name, trigger, kind, action, stage: trigger === 'stage_changed' ? stage : '', delayMinutes: delay, startMinute: start, endMinute: end, days: [...new Set(days)], timezone, assignAgentId: input.assignAgentId || null, senderId: action === 'message' ? input.senderId : null, template: action === 'message' ? input.template : null, values: action === 'message' ? input.values || {} : {}, taskTitle: action === 'task' ? taskTitle : '' }
}
