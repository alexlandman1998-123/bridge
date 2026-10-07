export function getLeadSourcePresentation(value = '') {
  const source = String(value || '').trim()
  const key = /^property[\s_-]*24(?:[\s_-]|$)/i.test(source) ? 'property24' : /^private[\s_-]*property(?:[\s_-]|$)/i.test(source) ? 'private_property' : source.toLowerCase()
  return {
    label: { property24: 'Property24', private_property: 'Private Property', developer_direct: 'Developer direct', agency_introduced: 'Agency introduced' }[key] || source.replaceAll('_', ' '),
    logo: { property24: '/lead-sources/property24.png', private_property: '/lead-sources/private-property.jpeg' }[key] || '',
  }
}
