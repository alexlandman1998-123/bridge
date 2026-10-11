import { supabase } from '../lib/supabaseClient.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISSUE_FIELDS = [
  'id, development_id, unit_id, transaction_id, buyer_id, category, description, location, priority, status, created_at, updated_at',
  'id, development_id, unit_id, buyer_id, category, description, location, priority, status, created_at, updated_at',
  'id, development_id, unit_id, buyer_id, category, description, location, priority, status, created_at',
]

async function readAll(buildQuery, signal) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    let query = buildQuery().range(offset, offset + 999)
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) return rows
  }
}

async function readLinked(client, table, fields, column, ids, signal) {
  const rows = []
  for (let index = 0; index < ids.length; index += 200) {
    rows.push(...await readAll(() => client.from(table).select(fields).in(column, ids.slice(index, index + 200)).order('id'), signal))
  }
  return rows
}

export async function fetchDevelopmentSnagSubmissions({ developmentId, signal, client = supabase }) {
  if (!UUID.test(developmentId || '')) throw new Error('A valid development is required to load snags.')
  if (!client) throw new Error('Connect Arch9 to load snag submissions.')
  let issues
  for (let index = 0; index < ISSUE_FIELDS.length; index += 1) {
    try {
      issues = await readAll(() => client.from('client_issues').select(ISSUE_FIELDS[index]).eq('development_id', developmentId).order('created_at', { ascending: false }).order('id'), signal)
      break
    } catch (error) {
      const missingOptionalColumn = ['transaction_id', 'updated_at'].some(column => String(error.message || '').includes(column))
      if (!['42703', 'PGRST204'].includes(error.code) || !missingOptionalColumn || index === ISSUE_FIELDS.length - 1) throw error
    }
  }
  if (!issues.length) return []
  const buyerIds = [...new Set(issues.map(issue => issue.buyer_id).filter(Boolean))]
  const unitIds = [...new Set(issues.map(issue => issue.unit_id).filter(Boolean))]
  const [buyers, units, handovers] = await Promise.all([
    readLinked(client, 'buyers', 'id, name', 'id', buyerIds, signal),
    readLinked(client, 'units', 'id, unit_number', 'id', unitIds, signal),
    readAll(() => client.from('transaction_handover').select('id, transaction_id, unit_id, buyer_id, handover_date, status').eq('development_id', developmentId).order('id'), signal),
  ])
  const buyerById = new Map(buyers.map(buyer => [buyer.id, buyer]))
  const unitById = new Map(units.map(unit => [unit.id, unit]))
  return issues.map(issue => ({
    ...issue,
    buyer: buyerById.get(issue.buyer_id) || null,
    unit: unitById.get(issue.unit_id) || null,
    // Never attach a later purchaser's handover to an earlier snag submission.
    handover: handovers.find(item => issue.transaction_id
      ? item.transaction_id === issue.transaction_id
      : issue.buyer_id && item.unit_id === issue.unit_id && item.buyer_id === issue.buyer_id) || null,
  }))
}
