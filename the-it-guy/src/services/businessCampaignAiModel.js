export const BUSINESS_AI_FAMILIES = ['sellers', 'thinking-of-selling', 'buyer-demand', 'buyers', 'first-time-buyer', 'meet-your-agent', 'client-success', 'market-update', 'key-handover', 'review-request', 'referral-request', 'client-check-in']
export function businessCampaignPlan(builder) {
  if (!BUSINESS_AI_FAMILIES.includes(builder?.template)) throw new Error('Choose a supported business campaign.')
  const audience = ['sellers', 'thinking-of-selling', 'buyer-demand'].includes(builder.template) ? 'Homeowners in the selected area with the required channel permission' : ['buyers', 'first-time-buyer'].includes(builder.template) ? 'Contacts with recorded buyer requirements and the required channel permission' : 'Existing or prospective contacts selected explicitly with the required channel permission'
  return { family: builder.template, area: builder.details?.area || '', audience, steps: ['Review confirmed public details and campaign facts', 'Prepare and review the selected channel draft', 'Choose eligible contacts in the channel audience tools', 'Review sender, timing and cost before sending'], boundary: 'This plan selects no recipients and sends or schedules nothing.' }
}
export function businessOpening(body = '') {
  const paragraphs = String(body).split('\n\n')
  const index = /^(hi(?: there)?|hello|good day|hallo|goeiedag)[,!]?$/i.test(paragraphs[0].trim()) && paragraphs.length > 1 ? 1 : 0
  return { paragraphs, index, text: paragraphs[index] }
}
export const businessOpeningIsProtected = (text, protectedText = []) => /\p{N}|https?:|mailto:|[“”"]/u.test(text) || protectedText.some((value) => typeof value === 'string' && value.trim() && text.includes(value.trim()))
export function applyBusinessCampaignCopy(content, { channel, target = 'both', copy, protectedText = [] }) {
  if (!['email', 'whatsapp', 'social'].includes(channel) || !content?.[channel] || !['both', 'title', 'opening'].includes(target)) throw new Error('Choose an available channel and wording section.')
  const next = { ...content[channel] }
  if (target !== 'opening') next.title = copy.heading
  if (target !== 'title') {
    const opening = businessOpening(next.body)
    const factualOpening = businessOpeningIsProtected(opening.text, protectedText)
    if (factualOpening) opening.paragraphs.splice(opening.index, 0, copy.intro)
    else opening.paragraphs[opening.index] = copy.intro
    next.body = opening.paragraphs.join('\n\n')
  }
  if (typeof next.title !== 'string' || !next.title.trim() || next.title.length > 240 || typeof next.body !== 'string' || !next.body.trim() || next.body.length > 12000) throw new Error('The proposed copy is too long. Shorten this channel draft before applying it.')
  return { ...content, [channel]: next }
}
export const businessCampaignStateKey = (builder, content) => JSON.stringify([builder, content])
