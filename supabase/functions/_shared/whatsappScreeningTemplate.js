import { buildTemplateMessage, previewTemplate, templateFields } from './whatsappCampaign.js'
import { screeningQuestions } from './whatsappScreening.js'

export function screeningTemplate(profile, contact) {
  const { template, values = {}, context, kind } = profile
  const fields = templateFields(template)
  if (fields.unsupported.length || fields.fields.some(field => field.kind !== 'text')) throw new Error('Choose an approved text opening template.')
  const fixed = {
    property: context.propertyLabel, location: context.location, agency: context.agencyName,
    question_count: String(screeningQuestions(kind, context).length),
  }
  const resolved = {}
  for (const field of fields.fields) {
    const mapping = values[field.key]
    if (!mapping || !['text', 'first_name', 'full_name', ...Object.keys(fixed)].includes(mapping.source)) throw new Error('Choose a value for every opening-template variable.')
    resolved[field.key] = Object.hasOwn(fixed, mapping.source) ? { source: 'text', text: fixed[mapping.source] } : mapping
  }
  const body = previewTemplate(template, resolved, contact)
  if (body.length > 4096) throw new Error('The opening is too long for a WhatsApp message.')
  if (!Object.values(values).some(value => value?.source === 'question_count')) throw new Error('Map the maximum question count into the opening template.')
  if (!/\bSTART\b/i.test(body) || !/\bAGENT\b/i.test(body) || !/\bSTOP\b/i.test(body)) throw new Error('The opening template must explain START, AGENT and STOP.')
  // Bind the opening to its property, so simultaneous enquiries are never vague.
  if (!body.includes(context.propertyLabel)) throw new Error('Include the property name/reference in the opening template.')
  return { payload: buildTemplateMessage(template, resolved, contact), body }
}
