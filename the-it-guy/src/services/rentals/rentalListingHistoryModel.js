const text = value => String(value ?? '').trim()
const identity = row => row.storage_bucket && row.storage_path
  ? `${row.storage_bucket}/${row.storage_path}` : text(row.file_url)
const same = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
const display = value => value == null || value === '' ? 'Not saved'
  : Array.isArray(value) ? value.map(display).join(', ') || 'None'
    : typeof value === 'object' ? JSON.stringify(value) : String(value)

function compareFields(before, after, prefix, result) {
  for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    const previous = before?.[key]
    const current = after?.[key]
    if (same(previous, current)) continue
    const path = prefix ? `${prefix} / ${key}` : key
    if ((previous && typeof previous === 'object' && !Array.isArray(previous)) || (current && typeof current === 'object' && !Array.isArray(current))) {
      compareFields(previous, current, path, result)
    } else result.push({ field: path, before: display(previous), after: display(current) })
  }
}

export function buildRentalHistoryChanges(metadata = {}) {
  if (metadata.source !== 'rental_atomic_save' || metadata.schemaVersion !== 1 || !metadata.before || !metadata.after) return []
  const changes = []
  compareFields(metadata.before.details, metadata.after.details, '', changes)
  compareFields(metadata.before.facts, metadata.after.facts, 'Rental details', changes)
  // Durable object identities prevent renewed signed links appearing as photo edits.
  const media = snapshot => (snapshot.media || []).map(row => ({
    id: row.id, type: row.media_type, asset: identity(row), caption: row.caption || '', order: row.sort_order, cover: Boolean(row.is_cover),
  }))
  const previous = media(metadata.before)
  const current = media(metadata.after)
  for (const row of previous) {
    const saved = current.find(item => item.id === row.id)
    if (!saved) changes.push({ field: `${row.type}: removed`, before: row.asset, after: 'Removed' })
    else if (!same(row, saved)) changes.push({ field: `${row.type}: changed`, before: `${row.asset}${row.cover ? ' (cover)' : ''} · ${row.caption} · position ${row.order}`, after: `${saved.asset}${saved.cover ? ' (cover)' : ''} · ${saved.caption} · position ${saved.order}` })
  }
  for (const row of current) if (!previous.some(item => item.id === row.id)) changes.push({ field: `${row.type}: added`, before: 'Not saved', after: row.asset })
  return changes
}

export function buildRentalAuditMediaEvidence(listing, event) {
  if (event.metadata?.source !== 'rental_atomic_save' || event.metadata?.schemaVersion !== 1) return []
  const current = new Set((listing.listingMedia || []).map(identity))
  const result = []
  for (const [type, label] of [['image','Photos'],['floor_plan','Floor plans'],['video','Video'],['virtual_tour','Virtual tour']]) {
    const old = new Set((event.metadata.before?.media || []).filter(row => row.media_type === type).map(identity).filter(Boolean))
    const missing = [...old].filter(value => !current.has(value))
    if (missing.length) result.push({ id: `${event.id}:${type}`, label, count: missing.length, recordedAt: event.created_at, source: event.activity_title || 'Rental save history' })
  }
  return result
}
