// Shared by the campaign form and server; Meta remains the source of template definitions.
export const MAX_CAMPAIGN_RECIPIENTS = 500
export const clean = (value) => typeof value === 'string' ? value.trim() : ''
export function normalizePhone(value) {
  let phone = clean(value).replace(/[\s().-]/g, '')
  if (phone.startsWith('+')) phone = phone.slice(1)
  else if (phone.startsWith('00')) phone = phone.slice(2)
  else if (/^0\d{9}$/.test(phone)) phone = `27${phone.slice(1)}`
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : ''
}
function variables(text) {
  const keys = [...new Set([...String(text || '').matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1]))]
  if (keys.every((key) => /^\d+$/.test(key))) return keys.sort((a, b) => Number(a) - Number(b))
  return keys
}
export function templateFields(template) {
  const fields = []
  const unsupported = []
  if (!template || !Array.isArray(template.components)) return { fields, unsupported: ['Choose a template from Meta.'] }
  if (!['MARKETING', 'UTILITY'].includes(template.category)) unsupported.push('Authentication templates are not supported for campaigns.')
  for (const component of template.components) {
    const type = String(component.type).toUpperCase()
    if (type === 'BODY' || (type === 'HEADER' && component.format === 'TEXT')) {
      for (const key of variables(component.text)) fields.push({ key: `${type.toLowerCase()}.${key}`, name: key, section: type.toLowerCase(), kind: 'text', label: `${type === 'BODY' ? 'Body' : 'Header'} · ${key}` })
    } else if (type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(component.format)) {
      fields.push({ key: 'header.media', section: 'header', kind: component.format.toLowerCase(), label: `${component.format.toLowerCase()} header URL` })
    } else if (type === 'BUTTONS') {
      for (const [index, button] of (component.buttons || []).entries()) {
        if (button.type === 'URL') {
          const keys = variables(button.url)
          if (keys.length > 1) unsupported.push('This URL button uses an unsupported variable layout.')
          if (keys.length) fields.push({ key: `button.${index}`, section: 'button', kind: 'text', index, name: keys[0], label: `${button.text} · URL suffix` })
        } else if (!['PHONE_NUMBER', 'QUICK_REPLY'].includes(button.type)) unsupported.push(`${button.type} buttons are not supported in this version.`)
      }
    } else if (type !== 'FOOTER') unsupported.push(`${type}${component.format ? ` (${component.format})` : ''} templates are not supported in this version.`)
  }
  if (!template.components.some((c) => c.type === 'BODY')) unsupported.push('The template is missing its body.')
  return { fields, unsupported }
}
export function resolveValue(value, contact = {}) {
  if (value?.source === 'first_name') return clean(contact.full_name).split(/\s+/)[0] || ''
  if (value?.source === 'full_name') return clean(contact.full_name)
  return clean(value?.text)
}
function publicMediaUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)
  } catch { return false }
}
export function buildTemplateMessage(template, values, contact) {
  if (template?.status !== 'APPROVED') throw new Error('Meta must approve this template before sending.')
  if (!clean(template.name) || !clean(template.language)) throw new Error('The Meta template name and language are required.')
  const { fields, unsupported } = templateFields(template)
  if (unsupported.length) throw new Error(unsupported.join(' '))
  const to = normalizePhone(contact?.phone)
  if (!to) throw new Error('The recipient needs a valid international phone number.')
  const components = []
  for (const field of fields) {
    const text = resolveValue(values?.[field.key], contact)
    if (!text) throw new Error(`Fill in ${field.label} for ${contact.full_name || to}.`)
    const maxLength = field.section === 'header' && field.kind === 'text' ? 60 : 1024
    if (text.length > maxLength || /[\r\n\t]| {5}/.test(text)) throw new Error(`${field.label} must be a single line of at most ${maxLength} characters, without tabs or more than four consecutive spaces.`)
    if (field.kind !== 'text' && !publicMediaUrl(text)) throw new Error(`${field.label} must be a public HTTPS link.`)
    if (field.section === 'button') {
      components.push({ type: 'button', sub_type: 'url', index: String(field.index), parameters: [{ type: 'text', text }] })
    } else {
      let component = components.find((c) => c.type === field.section)
      if (!component) { component = { type: field.section, parameters: [] }; components.push(component) }
      component.parameters.push(field.kind === 'text'
        ? { type: 'text', text, ...(!/^\d+$/.test(field.name) ? { parameter_name: field.name } : {}) }
        : { type: field.kind, [field.kind]: { link: text } })
    }
  }
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name: template.name, language: { code: template.language }, ...(components.length ? { components } : {}) } }
}
export function previewTemplate(template, values, contact) {
  return (template?.components || []).filter((c) => ['HEADER', 'BODY', 'FOOTER'].includes(c.type) && c.text).map((c) => String(c.text).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (match, key) => resolveValue(values?.[`${c.type.toLowerCase()}.${key}`], contact) || match)).join('\n\n')
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function templateIdentity(template) {
  return canonicalJson({ id: template?.id, name: template?.name, language: template?.language, category: template?.category, components: template?.components })
}
