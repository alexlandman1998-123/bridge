export function getLeadSourcePresentation(value = '') {
  const source = String(value || '').trim()
  let key = source.toLowerCase()
  if (/^property[\s_-]*24(?:[\s_-]|$)/i.test(source)) key = 'property24'
  else if (/^private[\s_-]*property(?:[\s_-]|$)/i.test(source)) key = 'private_property'
  else if (/^facebook(?:[\s_-]|$)/i.test(source)) key = 'facebook'
  else if (/^google(?:[\s_-]|$)/i.test(source)) key = 'google'
  else if (/^whats[\s_-]*app(?:[\s_-]|$)/i.test(source)) key = 'whatsapp'
  return {
    label: { property24: 'Property24', private_property: 'Private Property', facebook: 'Facebook', google: 'Google', whatsapp: 'WhatsApp', developer_direct: 'Developer direct', agency_introduced: 'Agency introduced' }[key] || source.replaceAll('_', ' '),
    logo: { property24: '/lead-sources/property24.png', private_property: '/lead-sources/private-property.jpeg', facebook: '/lead-sources/facebook.svg', google: '/lead-sources/google.png', whatsapp: '/lead-sources/whatsapp.svg' }[key] || '',
  }
}
