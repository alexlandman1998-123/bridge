import { requireClient, isMissingColumnError } from '../../lib/api/shared/readHelpers.js'
import { fetchDevelopmentIdsForOrganisation } from '../developments/scopeReadApi.js'
import { fetchDocumentRequirements, fetchTransactionRequiredDocumentsByTransactionIds, buildRequiredChecklistFromRows, buildDocumentChecklist } from './requirementReadModel.js'
import { loadSharedDocuments } from './listReadApi.js'
import { normalizeStage, byDevelopmentThenUnit } from '../../core/transactions/legacyReadModel.js'

export const DOCUMENT_WORKSPACE_PAGE_SIZE = 25

// The hub opens with selector metadata only. Never sign files or build every
// client's checklist while listing the available workspaces.
export async function fetchDocumentWorkspacePage({ organisationId, developmentId = null, userId = '', roleType = null, afterUnitId = null, referenceData = null } = {}) {
  if (!organisationId) throw new Error('An organisation is required to load document workspaces.')
  const client = requireClient()
  const loadScope = () => fetchDevelopmentIdsForOrganisation(client, organisationId, { parallel: true })
  const allowed = await (referenceData ? referenceData.read({ client, group: 'development_scope', key: organisationId, load: loadScope }) : loadScope())
  if (!allowed.length || (developmentId && !allowed.includes(developmentId))) return { rows: [], nextCursor: null }
  let participantUnitIds = null
  let accessibleTransactionIds = null
  if (roleType) {
    if (!userId) return { rows: [], nextCursor: null }
    const { getAccessibleTransactionIdsForUser } = await import('../access/transactionApi.js')
    const ids = await getAccessibleTransactionIdsForUser({ userId, roleType })
    if (!ids.length) return { rows: [], nextCursor: null }
    accessibleTransactionIds = new Set(ids)
    const result = await client.from('transactions').select('unit_id').in('id', ids)
    if (result.error) throw result.error
    participantUnitIds = [...new Set((result.data || []).map(row => row.unit_id).filter(Boolean))]
    if (!participantUnitIds.length) return { rows: [], nextCursor: null }
  }
  let query = client.from('units').select('id, development_id, unit_number, status, development:developments(id, name)')
    .in('development_id', developmentId ? [developmentId] : allowed)
  if (participantUnitIds) query = query.in('id', participantUnitIds)
  if (afterUnitId) query = query.gt('id', afterUnitId)
  const result = await query.order('id').limit(DOCUMENT_WORKSPACE_PAGE_SIZE + 1)
  if (result.error) throw result.error
  const units = (result.data || []).slice(0, DOCUMENT_WORKSPACE_PAGE_SIZE)
  if (!units.length) return { rows: [], nextCursor: null }
  const readTransactions = () => client.from('transactions').select('id, unit_id, buyer_id, stage, updated_at, created_at')
    .in('unit_id', units.map(unit => unit.id)).order('updated_at', { ascending: false })
  let transactions = await readTransactions().eq('is_active', true)
  if (transactions.error && isMissingColumnError(transactions.error, 'is_active')) transactions = await readTransactions()
  if (transactions.error) throw transactions.error
  const latest = new Map()
  for (const transaction of transactions.data || []) {
    if (normalizeStage(transaction.stage, null) !== 'Available' && !latest.has(transaction.unit_id)) latest.set(transaction.unit_id, transaction)
  }
  const current = units.map(unit => ({ unit, transaction: latest.get(unit.id) || null }))
    .filter(row => !accessibleTransactionIds || accessibleTransactionIds.has(row.transaction?.id))
  const buyerIds = [...new Set(current.map(row => row.transaction?.buyer_id).filter(Boolean))]
  const buyers = buyerIds.length ? await client.from('buyers').select('id, name').in('id', buyerIds) : { data: [] }
  if (buyers.error) throw buyers.error
  const names = new Map((buyers.data || []).map(buyer => [buyer.id, buyer.name]))
  const rows = current.map(({ unit, transaction }) => ({
    unit: { id: unit.id, development_id: unit.development_id, unit_number: unit.unit_number },
    development: unit.development,
    transaction: transaction ? { id: transaction.id } : null,
    buyer: transaction?.buyer_id ? { name: names.get(transaction.buyer_id) || 'Client' } : null,
    stage: normalizeStage(transaction?.stage, unit.status),
  })).sort(byDevelopmentThenUnit)
  return { rows, nextCursor: (result.data || []).length > DOCUMENT_WORKSPACE_PAGE_SIZE ? units[units.length - 1].id : null }
}

export async function fetchDocumentClientWorkspace(row, { referenceData = null } = {}) {
  if (!row?.transaction?.id) throw new Error('Select a client transaction before loading its documents.')
  const client = requireClient()
  const transactionIds = [row.transaction.id]
  const developmentId = row.development?.id || row.unit?.development_id
  const loadRequirements = () => fetchDocumentRequirements(client, developmentId)
  const [documents, requiredByTransaction, requirements] = await Promise.all([
    loadSharedDocuments(client, { transactionIds, viewer: 'internal' }),
    fetchTransactionRequiredDocumentsByTransactionIds(client, transactionIds),
    referenceData ? referenceData.read({ client, group: 'document_requirements', key: developmentId || '', load: loadRequirements }) : loadRequirements(),
  ])
  const required = requiredByTransaction[row.transaction.id] || []
  const checklist = required.length ? buildRequiredChecklistFromRows(required, documents) : buildDocumentChecklist(requirements, documents)
  return { ...row, documents, requiredChecklist: checklist.checklist, checklistSummary: checklist.summary }
}
