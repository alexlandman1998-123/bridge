// Catalogue data only: custom transaction names never become global suggestions.
export async function loadDocumentTypeSuggestions(client, party) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('document_definitions')
      .select('key,display_label,description')
      .eq('is_active', true).contains('default_upload_roles', [party])
      .order('display_label').order('key').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 500) return rows
  }
}

const normalize = value => String(value || '').toLowerCase().replace(/[_\W]+/g, ' ').trim()
export function matchDocumentTypes(definitions, query) {
  const search = normalize(query)
  if (!search) return []
  const words = search.split(/\s+/)
  return definitions.filter(row => words.every(word => normalize(`${row.display_label} ${row.key} ${row.description || ''}`).includes(word)))
    .sort((a, b) => Number(normalize(b.display_label) === search) - Number(normalize(a.display_label) === search)
      || Number(normalize(b.display_label).startsWith(search)) - Number(normalize(a.display_label).startsWith(search))
      || a.display_label.localeCompare(b.display_label))
}
