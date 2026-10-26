import { calendarDateKey, shiftCalendarDate, validCalendarDate } from './marketingCalendarModel'

export const PLAYBOOK_CHANNELS = { email: 'Email', whatsapp: 'WhatsApp', social: 'Organic social', meta: 'Meta ads', chatgpt: 'ChatGPT Ads' }
export const RESPONSE_KINDS = { reply: 'Reply in the channel', url: 'Website / enquiry form', email: 'Email address', whatsapp: 'WhatsApp number' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const actions = { seller_leads: 'Request a valuation', buyer_leads: 'Tell us what you are looking for', promote_listing: 'Enquire about this property', reengage: 'Start a conversation', custom: 'Get in touch' }
export function playbookResponsePlaceholder(body, destination, label) {
  if (!destination) return body
  const replace = (value, needle) => {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return value.replace(new RegExp(`(^|[\\s("'<>])${escaped}(?=$|[\\s)"'<>\\]}])`, 'g'), (_match, prefix) => `${prefix}{response}`)
  }
  return replace(label ? replace(body, `${label}: ${destination}`) : body, destination)
}
const text = (value, limit) => { if (typeof value !== 'string' || value.length > limit) throw new Error('Shorten the playbook copy before saving.'); return value.trim() }
export function responseDestination(response) {
  if (!response || !Object.hasOwn(RESPONSE_KINDS, response.kind)) throw new Error('Choose where campaign responses should go.')
  const value = text(response.value, 2048)
  if (response.kind === 'reply') { if (value) throw new Error('Reply routing does not need a separate destination.'); return 'Reply to this message' }
  if (response.kind === 'email') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /[?#]/.test(value)) throw new Error('Enter a valid response email address.'); return value }
  if (response.kind === 'whatsapp') { if (!/^\+[1-9][0-9]{7,14}$/.test(value)) throw new Error('Use an international WhatsApp number starting with +.'); return `https://wa.me/${value.slice(1)}` }
  let url
  try { url = new URL(value) } catch { throw new Error('Use a complete HTTPS response link.') }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || value.includes('\\') || /\s/.test(value)) throw new Error('Use a complete HTTPS response link without login details.')
  return value
}
export function cleanCampaignPlaybook(input, channels) {
  if (!input || input.version !== 1 || !Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 12 || !Array.isArray(input.followUp) || input.followUp.length > 5) throw new Error('Use 1–12 communication steps and up to 5 follow-up actions.')
  const sourceRevision = input.sourceRevision ?? 0
  if (!Number.isInteger(sourceRevision) || sourceRevision < 0 || sourceRevision > 2147483647) throw new Error('Review the playbook against the current campaign brief.')
  const response = { kind: input.response?.kind, label: text(input.response?.label, 80), value: text(input.response?.value, 2048) }
  if (!response.label) throw new Error('Add a clear call to action.')
  responseDestination(response)
  const ids = new Set()
  const uniqueId = (value) => { if (!uuid.test(value || '') || ids.has(value)) throw new Error('Each playbook action needs its own identifier.'); ids.add(value); return value }
  const steps = input.steps.map((step) => {
    if (!Object.hasOwn(PLAYBOOK_CHANNELS, step.channel) || !channels.includes(step.channel)) throw new Error('Each playbook step must use a channel in this campaign. Add it in Edit campaign first.')
    if (!Number.isInteger(step.day) || step.day < 0 || step.day > 365) throw new Error('Choose a day from 0 to 365 for each communication.')
    const title = text(step.title, 240), body = text(step.body, 12000)
    if (!title || !body) throw new Error('Add a title and message to every communication step.')
    return { id: uniqueId(step.id), channel: step.channel, day: step.day, title, body }
  })
  const followUp = input.followUp.map((item) => {
    const title = text(item.title, 180)
    if (!title || !Number.isInteger(item.days) || item.days < 0 || item.days > 365) throw new Error('Add a follow-up action and a delay from 0 to 365 days.')
    return { id: uniqueId(item.id), title, days: item.days }
  })
  if (steps.some((step) => playbookStepCopy({ response }, step).body.length > 12000)) throw new Error('Shorten the message to leave room for the response destination.')
  const result = { version: 1, sourceRevision, response, steps, followUp }
  if (new TextEncoder().encode(JSON.stringify(result)).length > 59000) throw new Error('Shorten the total playbook copy before saving.')
  return result
}
export function createCampaignPlaybook(campaign) {
  const family = campaign.campaign_builder?.template || campaign.listing_builder?.template
  const af = /^af(?:-|$)/i.test(campaign.campaign_builder?.source?.language || campaign.listing_builder?.source?.language || '')
  const localActions = af ? { seller_leads: 'Vra ’n waardasie', buyer_leads: 'Vertel ons waarna jy soek', promote_listing: 'Doen navraag oor die eiendom', reengage: 'Kom ons gesels', custom: 'Kontak ons' } : actions
  const conversion = ['seller_leads', 'buyer_leads', 'promote_listing'].includes(campaign.goal)
  const label = family === 'review-request' ? af ? 'Deel jou ervaring' : 'Share your experience' : family === 'key-handover' ? af ? 'Kom ons bly in kontak' : 'Let’s stay in touch' : localActions[campaign.goal] || localActions.custom
  const response = { kind: 'reply', label, value: '' }
  const destination = (family === 'review-request' ? campaign.campaign_builder?.details?.reviewUrl : null) || campaign.campaign_builder?.source?.destination || campaign.listing_builder?.source?.destination
  if (destination) {
    const kind = destination.startsWith('https://wa.me/') ? 'whatsapp' : destination.startsWith('https://') ? 'url' : destination.includes('@') ? 'email' : 'reply'
    const value = kind === 'whatsapp' ? `+${destination.slice('https://wa.me/'.length)}` : kind === 'reply' ? '' : destination
    try { responseDestination({ kind, value }); Object.assign(response, { kind, value }) } catch { /* Keep channel replies until a destination is reviewed. */ }
  }
  const steps = campaign.planned_channels.map((channel) => ({
    id: crypto.randomUUID(), channel, day: conversion && channel === 'whatsapp' ? 3 : conversion && channel === 'meta' ? 1 : 0,
    title: campaign.channel_content?.[channel]?.title || campaign.name,
    body: (campaign.channel_content?.[channel]?.body ? playbookResponsePlaceholder(campaign.channel_content[channel].body, destination, label) : [campaign.offer || campaign.objective, campaign.area ? `For people in ${campaign.area}.` : '', '{response}'].filter(Boolean).join('\n\n')),
  }))
  if (conversion && campaign.planned_channels.includes('email')) steps.push({ id: crypto.randomUUID(), channel: 'email', day: 7, title: `${af ? 'Ons volg op' : 'A quick follow-up'}: ${campaign.channel_content?.email?.title || campaign.name}`.slice(0, 240), body: af ? `Ons volg op oor ${campaign.offer || campaign.objective}.\n\nAs dit by jou planne pas, gesels gerus met ons.\n\n{response}` : `I wanted to follow up on ${campaign.offer || campaign.objective}.\n\nIf this is relevant to your plans, let’s talk.\n\n{response}` })
  return { version: 1, sourceRevision: campaign.revision || 0, response, steps, followUp: [{ id: crypto.randomUUID(), title: af ? ({ seller_leads: 'Reël ’n waardasie met {contact}', buyer_leads: 'Bevestig koopvereistes met {contact}', promote_listing: 'Reël ’n besigtiging met {contact}' })[campaign.goal] || 'Volg op met {contact}' : ({ seller_leads: 'Arrange a valuation with {contact}', buyer_leads: 'Confirm buying requirements with {contact}', promote_listing: 'Arrange a viewing with {contact}' })[campaign.goal] || 'Follow up with {contact}', days: 1 }, { id: crypto.randomUUID(), title: af ? 'Bevestig die volgende stap met {contact}' : 'Confirm the next step with {contact}', days: 3 }] }
}
export function orderedPlaybookSteps(playbook) { return playbook.steps.map((item, index) => ({ ...item, order: index })).sort((a, b) => a.day - b.day || a.order - b.order) }
export function playbookStepDate(campaign, step) { return validCalendarDate(campaign.start_date) ? shiftCalendarDate(campaign.start_date, step.day) : null }
export function playbookStepCopy(playbook, step) {
  const action = `${playbook.response.label}: ${responseDestination(playbook.response)}`
  const body = step.body.replaceAll(`${playbook.response.label}: {response}`, '{response}')
  return { title: step.title, body: body.includes('{response}') ? body.replaceAll('{response}', action) : `${body}\n\n${action}`, timing: `Day ${step.day} · Planned; review and schedule in the channel` }
}
export function reusablePlaybook(playbook, channels) {
  if (!playbook) return null
  const clean = cleanCampaignPlaybook(playbook, channels)
  const destination = clean.response.value
  return { ...clean, sourceRevision: 0, response: { ...clean.response, kind: 'reply', value: '' }, steps: clean.steps.map((step) => ({ ...step, body: playbookResponsePlaceholder(step.body, destination, clean.response.label) })) }
}
export function playbookFollowUpSuggestion(recipe, entry) {
  const at = entry.responded_at ? calendarDateKey(entry.responded_at) : null
  return { title: recipe.title.replaceAll('{contact}', entry.name).slice(0, 180), dueDate: validCalendarDate(at) ? shiftCalendarDate(at, recipe.days) : '' }
}

export function personalisePlaybookChannel(playbook, channel, copy) {
  if (!playbook) return undefined
  const first = orderedPlaybookSteps(playbook).find((step) => step.channel === channel)
  if (!first) return playbook
  const fields = Object.fromEntries(Object.entries(copy).filter(([key]) => ['title', 'body'].includes(key)))
  return { ...playbook, steps: playbook.steps.map((step) => step.id === first.id ? { ...step, ...fields } : step) }
}

export function playbookForChannels(playbook, channels) {
  if (!playbook) return null
  const steps = playbook.steps.filter((step) => channels.includes(step.channel))
  return steps.length ? { ...playbook, steps } : null
}
