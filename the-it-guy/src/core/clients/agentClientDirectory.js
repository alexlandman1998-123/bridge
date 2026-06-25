import { listAgencyCrmLeadContacts } from '../../lib/agencyCrmRepository'
import { fetchTransactionsByParticipant } from '../../lib/api'
import { listCanvassingWorkspace } from '../../lib/canvassingRepository'
import { isUnsafeFallbackAllowed } from '../../lib/envValidation'
import { fetchOrganisationSettings, listOrganisationUsers } from '../../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { assertResolvedWorkspaceContext, logUnsafeFallbackBlocked } from '../../services/workspaceResolutionService'

const CANVASSING_STORAGE_PREFIX = 'itg:agency-canvassing:v1'
const QUICK_CREATE_STORAGE_KEY = 'bridge:quick-create-records:v1'

const TYPE_PRIORITY = [
  'Seller Lead',
  'Buyer Lead',
  'Prospect',
  'Seller',
  'Buyer',
  'Company Contact',
  'Trust Contact',
  'Client',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizePhone(value) {
  const digits = normalizeText(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('27') && digits.length >= 11) return digits
  if (digits.startsWith('0') && digits.length === 10) return `27${digits.slice(1)}`
  return digits
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(normalizeText(value))
}

function readJsonStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  if (!isUnsafeFallbackAllowed()) {
    logUnsafeFallbackBlocked({
      service: 'agentClientDirectory.readJsonStorage',
      missingContextType: 'workspace_scoped_local_storage',
      attemptedFallbackType: 'local_client_directory_snapshot',
      metadata: { storageKey: key },
    })
    return fallback
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '')
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function getCanvassingStorageKey(organisationId) {
  const workspaceId = normalizeText(organisationId)
  if (!workspaceId) throw new Error('A resolved workspace id is required before loading canvassing data.')
  return `${CANVASSING_STORAGE_PREFIX}:${workspaceId}`
}

function readCanvassingStore(organisationId) {
  const parsed = readJsonStorage(getCanvassingStorageKey(organisationId), { prospects: [], activities: [] })
  return {
    prospects: Array.isArray(parsed?.prospects) ? parsed.prospects : [],
    activities: Array.isArray(parsed?.activities) ? parsed.activities : [],
  }
}

function readQuickCreateStore() {
  const parsed = readJsonStorage(QUICK_CREATE_STORAGE_KEY, { prospects: [], appointments: [] })
  return {
    prospects: Array.isArray(parsed?.prospects) ? parsed.prospects : [],
    appointments: Array.isArray(parsed?.appointments) ? parsed.appointments : [],
  }
}

function toDateValue(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function latestDate(...values) {
  return values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort((left, right) => toDateValue(right) - toDateValue(left))[0] || null
}

function fullName(...parts) {
  return parts.map(normalizeText).filter(Boolean).join(' ')
}

function getLeadContact(lead = {}, contactsById = new Map()) {
  const contact = contactsById.get(normalizeText(lead?.contactId || lead?.contact_id)) || {}
  const name = fullName(
    contact.firstName || contact.first_name || lead.firstName,
    contact.lastName || contact.last_name || lead.lastName,
  )

  return {
    name: name || normalizeText(lead?.contactName || lead?.sellerName || lead?.buyerName) || 'Unnamed lead',
    email: normalizeLower(contact.email || lead.email || lead.sellerEmail || lead.buyerEmail),
    phone: normalizeText(contact.phone || lead.phone || lead.sellerPhone || lead.buyerPhone),
  }
}

function getPropertyLabelFromTransactionRow(row = {}) {
  const transaction = row?.transaction || row
  const unit = row?.unit || {}
  const development = row?.development || {}
  return (
    [
      transaction?.property_address_line_1,
      transaction?.suburb || transaction?.city,
    ]
      .map(normalizeText)
      .filter(Boolean)
      .join(', ') ||
    transaction?.property_description ||
    (development?.name || unit?.unit_number ? `${development?.name || 'Development'}${unit?.unit_number ? ` Unit ${unit.unit_number}` : ''}` : '') ||
    normalizeText(transaction?.transaction_reference) ||
    'Transaction'
  )
}

function getTransactionReference(row = {}) {
  const transaction = row?.transaction || row
  return normalizeText(transaction?.transaction_reference) || (transaction?.id ? `TRX-${String(transaction.id).replaceAll('-', '').slice(0, 8).toUpperCase()}` : '')
}

function getTransactionPath(row = {}, role = 'agent') {
  const transaction = row?.transaction || row
  if (role === 'attorney' && transaction?.id) return `/transactions/${transaction.id}`
  if (transaction?.id) return `/transactions/${transaction.id}`
  if (row?.unit?.id) return `/units/${row.unit.id}`
  return '/transactions'
}

function inferLeadTypeLabel(lead = {}) {
  const category = normalizeLower(lead?.leadCategory || lead?.lead_category)
  if (category.includes('seller')) return 'Seller Lead'
  if (category.includes('company')) return 'Company Contact'
  if (category.includes('trust')) return 'Trust Contact'
  return 'Buyer Lead'
}

function inferProspectTypeLabel(prospect = {}) {
  const type = normalizeLower(prospect?.prospectType || prospect?.type)
  if (type.includes('company')) return 'Company Contact'
  if (type.includes('trust')) return 'Trust Contact'
  return 'Prospect'
}

function inferContactTypeLabel(contact = {}) {
  const type = normalizeLower(contact?.contactType || contact?.contact_type)
  if (type.includes('seller')) return 'Seller Lead'
  if (type.includes('buyer')) return 'Buyer Lead'
  if (type.includes('company')) return 'Company Contact'
  if (type.includes('trust')) return 'Trust Contact'
  return 'Client'
}

function inferSourceLabel(value = '') {
  const normalized = normalizeLower(value)
  if (normalized.includes('property24')) return 'Property24'
  if (normalized.includes('private')) return 'Private Property'
  if (normalized.includes('bridge')) return 'Arch9 Listings'
  if (normalized.includes('referral')) return 'Referral'
  if (normalized.includes('website')) return 'Website'
  if (normalized.includes('manual')) return 'Manual'
  if (normalized.includes('canvassing')) return 'Canvassing'
  if (normalized.includes('import')) return 'Imported'
  return normalizeText(value) || 'Manual'
}

function resolveStatusKey(source = {}) {
  const status = normalizeLower(source.status || source.stage)
  if (source.transactionId) return 'transaction_linked'
  if (source.archived || status.includes('archived') || status.includes('lost') || status.includes('inactive')) return 'archived'
  if (source.followUpDue) return 'follow_up_due'
  if (!status || status === 'lead' || status.includes('new')) return 'new'
  return 'active'
}

function statusLabelFromKeys(keys = []) {
  if (keys.includes('transaction_linked')) return 'Transaction Linked'
  if (keys.includes('follow_up_due')) return 'Follow-up Due'
  if (keys.includes('active')) return 'Active'
  if (keys.includes('new')) return 'New'
  if (keys.includes('archived')) return 'Archived'
  return 'Active'
}

function typeFilterKeys(typeLabels = []) {
  const keys = new Set()
  for (const label of typeLabels) {
    const normalized = normalizeLower(label)
    if (normalized.includes('buyer lead')) keys.add('buyer_leads')
    if (normalized.includes('seller lead')) keys.add('seller_leads')
    if (normalized.includes('prospect')) keys.add('prospects')
    if (normalized === 'buyer' || normalized.includes('buyer ')) keys.add('buyers')
    if (normalized === 'seller' || normalized.includes('seller ')) keys.add('sellers')
    if (normalized.includes('company')) keys.add('companies')
    if (normalized.includes('trust')) keys.add('trusts')
  }
  return [...keys]
}

function sourceKeys(source = {}) {
  const keys = []
  const email = normalizeLower(source.email)
  const phone = normalizePhone(source.phone)
  const name = normalizeLower(source.name)
  if (email) keys.push(`email:${email}`)
  if (phone) keys.push(`phone:${phone}`)
  if (name) keys.push(`name:${name}`)
  return keys
}

function createEmptyClient(source = {}) {
  const fallbackId = source.sourceRecordId || source.leadId || source.transactionId || source.contactId || source.prospectId || source.name
  return {
    id: sourceKeys(source)[0] || `client:${normalizeLower(fallbackId) || Date.now()}`,
    name: source.name || 'Unnamed contact',
    email: normalizeLower(source.email),
    phone: normalizeText(source.phone),
    organisationId: normalizeText(source.organisationId),
    assignedAgentId: normalizeText(source.assignedAgentId),
    assignedAgentName: normalizeText(source.assignedAgentName),
    assignedAgentEmail: normalizeLower(source.assignedAgentEmail),
    sourceLabels: [],
    typeLabels: [],
    typeKeys: [],
    statusKeys: [],
    linkedLeadIds: [],
    linkedTransactionIds: [],
    linkedListingIds: [],
    linkedDevelopmentIds: [],
    linkedRecords: [],
    sources: [],
    searchText: '',
    lastActivityAt: source.lastActivityAt || source.updatedAt || source.createdAt || null,
    latestRecord: null,
    transactions: [],
  }
}

function choosePrimaryType(typeLabels = []) {
  for (const type of TYPE_PRIORITY) {
    if (typeLabels.includes(type)) return type
  }
  return typeLabels[0] || 'Client'
}

function mergeClientSource(client, source = {}) {
  const nextEmail = normalizeLower(source.email)
  const nextPhone = normalizeText(source.phone)
  const nextName = normalizeText(source.name)
  if ((!client.name || client.name === 'Unnamed contact') && nextName) client.name = nextName
  if (!client.email && nextEmail) client.email = nextEmail
  if (!client.phone && nextPhone) client.phone = nextPhone
  if (!client.organisationId && source.organisationId) client.organisationId = normalizeText(source.organisationId)
  if (!client.assignedAgentId && source.assignedAgentId) client.assignedAgentId = normalizeText(source.assignedAgentId)
  if (!client.assignedAgentName && source.assignedAgentName) client.assignedAgentName = normalizeText(source.assignedAgentName)
  if (!client.assignedAgentEmail && source.assignedAgentEmail) client.assignedAgentEmail = normalizeLower(source.assignedAgentEmail)

  if (source.sourceLabel && !client.sourceLabels.includes(source.sourceLabel)) client.sourceLabels.push(source.sourceLabel)
  if (source.typeLabel && !client.typeLabels.includes(source.typeLabel)) client.typeLabels.push(source.typeLabel)
  const statusKey = resolveStatusKey(source)
  if (statusKey && !client.statusKeys.includes(statusKey)) client.statusKeys.push(statusKey)
  if (source.leadId && !client.linkedLeadIds.includes(source.leadId)) client.linkedLeadIds.push(source.leadId)
  if (source.transactionId && !client.linkedTransactionIds.includes(source.transactionId)) client.linkedTransactionIds.push(source.transactionId)
  if (source.listingId && !client.linkedListingIds.includes(source.listingId)) client.linkedListingIds.push(source.listingId)
  if (source.developmentId && !client.linkedDevelopmentIds.includes(source.developmentId)) client.linkedDevelopmentIds.push(source.developmentId)

  client.sources.push(source)
  if (source.linkedRecord) client.linkedRecords.push(source.linkedRecord)
  if (source.transactionRow) client.transactions.push(source.transactionRow)

  const sourceActivityAt = source.lastActivityAt || source.updatedAt || source.createdAt || null
  if (!client.lastActivityAt || toDateValue(sourceActivityAt) > toDateValue(client.lastActivityAt)) {
    client.lastActivityAt = sourceActivityAt
    client.latestRecord = source.linkedRecord || null
  }
}

function finalizeClient(client) {
  const typeLabels = client.typeLabels.length ? client.typeLabels : ['Client']
  const primaryTypeLabel = choosePrimaryType(typeLabels)
  const activeTransactions = client.transactions.filter((row) => {
    const stage = normalizeLower(row?.stage || row?.transaction?.stage)
    return !stage.includes('registered') && !stage.includes('closed')
  }).length
  const completedTransactions = client.transactions.length - activeTransactions
  const linkedRecord = resolvePrimaryLinkedRecord(client)
  const linkedRecordLabel = linkedRecord?.label || client.latestRecord?.label || client.linkedRecords[0]?.label || 'No linked record'
  const sourceLabel = client.sourceLabels.join(', ') || 'Manual'
  const statusLabel = statusLabelFromKeys(client.statusKeys)
  const status = normalizeLower(statusLabel).replace(/\s+/g, '_').replace(/-/g, '_')
  const latestPropertyLabel = client.linkedRecords.find((item) => item?.kind === 'transaction')?.label ||
    client.linkedRecords.find((item) => item?.kind === 'lead')?.label ||
    ''
  const searchText = [
    client.name,
    client.email,
    client.phone,
    sourceLabel,
    primaryTypeLabel,
    statusLabel,
    linkedRecordLabel,
    latestPropertyLabel,
    ...client.linkedRecords.map((item) => `${item?.label || ''} ${item?.reference || ''}`),
  ]
    .map((value) => normalizeLower(value))
    .join(' ')

  return {
    ...client,
    id: client.id,
    typeLabel: primaryTypeLabel,
    roleLabel: typeLabels.join(' + '),
    typeKeys: typeFilterKeys(typeLabels),
    sourceLabel,
    linkedRecordLabel,
    status,
    statusLabel,
    activeTransactions,
    completedTransactions,
    totalTransactions: client.transactions.length,
    latestTransactionId: client.linkedTransactionIds[0] || null,
    latestPropertyLabel,
    latestStage: client.sources[0]?.stage || '',
    primaryPath: getAgentClientOpenPath({ ...client, linkedRecords: client.linkedRecords }),
    searchText,
  }
}

function resolvePrimaryLinkedRecord(client = {}) {
  const records = Array.isArray(client.linkedRecords) ? client.linkedRecords : []
  const sorted = [...records].sort((left, right) => {
    const kindScore = (record) => (record?.kind === 'transaction' ? 4 : record?.kind === 'lead' ? 3 : record?.kind === 'prospect' ? 2 : 1)
    const scoreDelta = kindScore(right) - kindScore(left)
    if (scoreDelta) return scoreDelta
    return toDateValue(right?.lastActivityAt || right?.updatedAt || right?.createdAt) - toDateValue(left?.lastActivityAt || left?.updatedAt || left?.createdAt)
  })
  return sorted[0] || null
}

export function getAgentClientOpenPath(client = {}) {
  const record = resolvePrimaryLinkedRecord(client)
  if (record?.path && record.kind !== 'client') return record.path
  return `/clients/${encodeURIComponent(client.id || '')}`
}

function addSource(grouped, source = {}) {
  const keys = sourceKeys(source)
  if (!keys.length) return
  let client = null
  for (const key of keys) {
    if (grouped.keyIndex.has(key)) {
      client = grouped.clients.get(grouped.keyIndex.get(key))
      break
    }
  }
  if (!client) {
    client = createEmptyClient(source)
    grouped.clients.set(client.id, client)
  }
  mergeClientSource(client, source)
  for (const key of keys) {
    grouped.keyIndex.set(key, client.id)
  }
}

function buildLeadSources({ leads = [], contacts = [], leadActivities = [], tasks = [] } = {}) {
  const contactsById = new Map((contacts || []).map((contact) => [normalizeText(contact?.contactId || contact?.contact_id), contact]))
  const latestActivityByLeadId = new Map()
  for (const activity of leadActivities || []) {
    const leadId = normalizeText(activity?.leadId || activity?.lead_id)
    if (!leadId) continue
    const existing = latestActivityByLeadId.get(leadId)
    if (!existing || toDateValue(activity?.activityDate || activity?.createdAt) > toDateValue(existing?.activityDate || existing?.createdAt)) {
      latestActivityByLeadId.set(leadId, activity)
    }
  }
  const dueTaskLeadIds = new Set(
    (tasks || [])
      .filter((task) => {
        const due = new Date(task?.dueDate || task?.due_date || 0)
        return Number.isFinite(due.getTime()) && due.getTime() <= Date.now() && !normalizeLower(task?.status).includes('done')
      })
      .map((task) => normalizeText(task?.leadId || task?.lead_id))
      .filter(Boolean),
  )
  const leadContactIds = new Set()
  const leadSources = (leads || []).map((lead) => {
    const leadId = normalizeText(lead?.leadId || lead?.lead_id || lead?.id)
    leadContactIds.add(normalizeText(lead?.contactId || lead?.contact_id))
    const contact = getLeadContact(lead, contactsById)
    const typeLabel = inferLeadTypeLabel(lead)
    const listingId = normalizeText(lead?.listingId || lead?.listing_id)
    const propertyLabel =
      normalizeText(lead?.propertyInterest || lead?.sellerPropertyAddress || lead?.areaInterest) ||
      (listingId ? `Listing ${listingId}` : '')
    const latestActivity = latestActivityByLeadId.get(leadId)
    const lastActivityAt = latestDate(latestActivity?.activityDate, latestActivity?.createdAt, lead?.updatedAt, lead?.createdAt)
    return {
      sourceRecordId: leadId,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      typeLabel,
      sourceLabel: inferSourceLabel(lead?.leadSource || lead?.lead_source),
      status: lead?.status || lead?.stage,
      stage: lead?.stage,
      followUpDue: dueTaskLeadIds.has(leadId),
      leadId,
      transactionId: normalizeText(lead?.convertedTransactionId || lead?.converted_transaction_id),
      listingId,
      organisationId: normalizeText(lead?.organisationId || lead?.organisation_id),
      assignedAgentId: normalizeText(lead?.assignedAgentId || lead?.assigned_agent_id),
      assignedAgentName: normalizeText(lead?.assignedAgentName),
      assignedAgentEmail: normalizeLower(lead?.assignedAgentEmail),
      lastActivityAt,
      createdAt: lead?.createdAt || lead?.created_at,
      updatedAt: lead?.updatedAt || lead?.updated_at,
      linkedRecord: {
        kind: 'lead',
        id: leadId,
        label: propertyLabel || `${typeLabel} ${leadId ? leadId.slice(0, 8) : ''}`,
        reference: leadId,
        path: leadId ? `/pipeline/leads/${leadId}` : '/pipeline/leads',
        lastActivityAt,
      },
    }
  })

  const contactOnlySources = (contacts || [])
    .filter((contact) => !leadContactIds.has(normalizeText(contact?.contactId || contact?.contact_id)))
    .map((contact) => {
      const contactId = normalizeText(contact?.contactId || contact?.contact_id)
      const name = fullName(contact?.firstName || contact?.first_name, contact?.lastName || contact?.last_name) || 'Unnamed contact'
      return {
        sourceRecordId: contactId,
        name,
        email: normalizeLower(contact?.email),
        phone: normalizeText(contact?.phone),
        typeLabel: inferContactTypeLabel(contact),
        sourceLabel: 'Manual',
        status: 'Active',
        organisationId: normalizeText(contact?.organisationId || contact?.organisation_id),
        assignedAgentId: normalizeText(contact?.assignedAgentId || contact?.assigned_agent_id),
        assignedAgentName: normalizeText(contact?.assignedAgentName),
        assignedAgentEmail: normalizeLower(contact?.assignedAgentEmail),
        lastActivityAt: contact?.updatedAt || contact?.updated_at || contact?.createdAt || contact?.created_at,
        createdAt: contact?.createdAt || contact?.created_at,
        updatedAt: contact?.updatedAt || contact?.updated_at,
        linkedRecord: {
          kind: 'client',
          id: contactId,
          label: 'Manual contact record',
          reference: contactId,
          path: contactId ? `/clients/${encodeURIComponent(`contact:${contactId}`)}` : '/clients',
        },
      }
    })

  return [...leadSources, ...contactOnlySources]
}

function buildProspectSources({ prospects = [], activities = [], organisationId = '', sourceLabel = 'Canvassing' } = {}) {
  const latestActivityByProspectId = new Map()
  for (const activity of activities || []) {
    const prospectId = normalizeText(activity?.prospectId)
    if (!prospectId) continue
    const existing = latestActivityByProspectId.get(prospectId)
    if (!existing || toDateValue(activity?.activityDate || activity?.createdAt) > toDateValue(existing?.activityDate || existing?.createdAt)) {
      latestActivityByProspectId.set(prospectId, activity)
    }
  }
  return (prospects || []).map((prospect) => {
    const prospectId = normalizeText(prospect?.id)
    const latestActivity = latestActivityByProspectId.get(prospectId)
    const lastActivityAt = latestDate(latestActivity?.activityDate, latestActivity?.createdAt, prospect?.updatedAt, prospect?.createdAt)
    const propertyLabel = normalizeText(prospect?.area || prospect?.propertyType || prospect?.interest || prospect?.timeline)
    return {
      sourceRecordId: prospectId,
      prospectId,
      name: normalizeText(prospect?.name) || fullName(prospect?.firstName, prospect?.lastName) || 'Unnamed prospect',
      email: normalizeLower(prospect?.email),
      phone: normalizeText(prospect?.phone),
      typeLabel: inferProspectTypeLabel(prospect),
      sourceLabel,
      status: prospect?.status || 'New',
      followUpDue: Boolean(prospect?.nextFollowUpDate && new Date(prospect.nextFollowUpDate).getTime() <= Date.now()),
      leadId: normalizeText(prospect?.convertedLeadId),
      organisationId: normalizeText(prospect?.organisationId || organisationId),
      assignedAgentId: normalizeText(prospect?.assignedAgentId),
      assignedAgentName: normalizeText(prospect?.assignedAgentName || prospect?.assignedAgent),
      assignedAgentEmail: normalizeLower(prospect?.assignedAgentEmail),
      lastActivityAt,
      createdAt: prospect?.createdAt,
      updatedAt: prospect?.updatedAt,
      linkedRecord: {
        kind: 'prospect',
        id: prospectId,
        label: propertyLabel || 'Prospect record',
        reference: prospectId,
        path: '/pipeline/canvassing',
        lastActivityAt,
      },
    }
  })
}

function buildTransactionBuyerSources(rows = []) {
  return (rows || [])
    .filter((row) => row?.buyer)
    .map((row) => {
      const transaction = row?.transaction || {}
      const buyer = row?.buyer || {}
      const transactionId = normalizeText(transaction?.id)
      const propertyLabel = getPropertyLabelFromTransactionRow(row)
      const lastActivityAt = latestDate(transaction?.updated_at, transaction?.created_at, row?.unit?.updated_at, row?.unit?.created_at)
      return {
        sourceRecordId: buyer?.id || transactionId,
        name: normalizeText(buyer?.name) || 'Buyer pending',
        email: normalizeLower(buyer?.email),
        phone: normalizeText(buyer?.phone),
        typeLabel: transaction?.purchaser_type === 'company' ? 'Company Contact' : transaction?.purchaser_type === 'trust' ? 'Trust Contact' : 'Buyer',
        sourceLabel: 'Transaction',
        status: row?.stage || transaction?.stage || 'Active',
        transactionId,
        listingId: normalizeText(transaction?.listing_id || transaction?.unit_id || row?.unit?.id),
        developmentId: normalizeText(transaction?.development_id || row?.development?.id || row?.unit?.development_id),
        organisationId: normalizeText(transaction?.organisation_id),
        assignedAgentId: normalizeText(transaction?.assigned_agent_id),
        assignedAgentName: normalizeText(transaction?.assigned_agent),
        assignedAgentEmail: normalizeLower(transaction?.assigned_agent_email),
        lastActivityAt,
        createdAt: transaction?.created_at,
        updatedAt: transaction?.updated_at,
        transactionRow: row,
        linkedRecord: {
          kind: 'transaction',
          id: transactionId,
          label: propertyLabel,
          reference: getTransactionReference(row),
          path: getTransactionPath(row),
          lastActivityAt,
        },
      }
    })
}

function buildTransactionSellerSources(rows = [], sellerRows = []) {
  const sellerByTransactionId = new Map((sellerRows || []).map((row) => [normalizeText(row?.transaction_id || row?.id), row]))
  return (rows || [])
    .map((row) => {
      const transaction = row?.transaction || {}
      const transactionId = normalizeText(transaction?.id)
      const seller = sellerByTransactionId.get(transactionId) || transaction?.seller || row?.seller || null
      const name = normalizeText(seller?.seller_name || seller?.name || transaction?.seller_name)
      const email = normalizeLower(seller?.seller_email || seller?.email || transaction?.seller_email)
      const phone = normalizeText(seller?.seller_phone || seller?.phone || transaction?.seller_phone)
      if (!name && !email && !phone) return null
      const propertyLabel = getPropertyLabelFromTransactionRow(row)
      const lastActivityAt = latestDate(seller?.updated_at, transaction?.updated_at, transaction?.created_at)
      return {
        sourceRecordId: `seller:${transactionId}`,
        name: name || 'Seller',
        email,
        phone,
        typeLabel: 'Seller',
        sourceLabel: 'Transaction',
        status: row?.stage || transaction?.stage || 'Active',
        transactionId,
        listingId: normalizeText(transaction?.listing_id || transaction?.unit_id || row?.unit?.id),
        developmentId: normalizeText(transaction?.development_id || row?.development?.id || row?.unit?.development_id),
        organisationId: normalizeText(transaction?.organisation_id),
        assignedAgentId: normalizeText(transaction?.assigned_agent_id),
        assignedAgentName: normalizeText(transaction?.assigned_agent),
        assignedAgentEmail: normalizeLower(transaction?.assigned_agent_email),
        lastActivityAt,
        createdAt: transaction?.created_at,
        updatedAt: transaction?.updated_at,
        transactionRow: row,
        linkedRecord: {
          kind: 'transaction',
          id: transactionId,
          label: propertyLabel,
          reference: getTransactionReference(row),
          path: getTransactionPath(row),
          lastActivityAt,
        },
      }
    })
    .filter(Boolean)
}

function buildManualBuyerSources(rows = []) {
  return (rows || []).map((buyer) => ({
    sourceRecordId: buyer?.id,
    name: normalizeText(buyer?.name) || 'Unnamed client',
    email: normalizeLower(buyer?.email),
    phone: normalizeText(buyer?.phone),
    typeLabel: 'Buyer',
    sourceLabel: 'Manual',
    status: 'Active',
    lastActivityAt: buyer?.updated_at || buyer?.created_at,
    createdAt: buyer?.created_at,
    updatedAt: buyer?.updated_at,
    linkedRecord: {
      kind: 'client',
      id: buyer?.id,
      label: 'Manual client record',
      reference: buyer?.id,
      path: buyer?.id ? `/clients/${encodeURIComponent(`buyer:${buyer.id}`)}` : '/clients',
    },
  }))
}

async function fetchTransactionSellerRows(transactionIds = []) {
  if (!isSupabaseConfigured || !supabase || !transactionIds.length) return []
  try {
    const result = await supabase
      .from('transactions')
      .select('id, seller_name, seller_email, seller_phone, updated_at')
      .in('id', transactionIds)
    if (result.error) return []
    return result.data || []
  } catch {
    return []
  }
}

async function fetchManualBuyerRows() {
  if (!isSupabaseConfigured || !supabase) return []
  try {
    let result = await supabase
      .from('buyers')
      .select('id, name, phone, email, created_at, updated_at')
      .limit(500)
    if (result.error) {
      result = await supabase.from('buyers').select('id, name, phone, email').limit(500)
    }
    if (result.error) return []
    return result.data || []
  } catch {
    return []
  }
}

function buildDirectory(sourceRows = []) {
  const grouped = { clients: new Map(), keyIndex: new Map() }
  for (const source of sourceRows) addSource(grouped, source)
  return [...grouped.clients.values()]
    .map((client) => finalizeClient(client))
    .sort((left, right) => toDateValue(right.lastActivityAt) - toDateValue(left.lastActivityAt))
}

function buildFilterOptions(clients = [], users = []) {
  const sourceOptions = [...new Set(clients.flatMap((client) => client.sourceLabels || []))].filter(Boolean).sort()
  const assignedAgents = new Map()
  for (const user of users || []) {
    const id = normalizeText(user?.userId || user?.id || user?.email)
    if (!id) continue
    assignedAgents.set(id, {
      id,
      label: normalizeText(user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`) || normalizeText(user?.email) || 'Agent',
    })
  }
  for (const client of clients) {
    const id = normalizeText(client.assignedAgentId || client.assignedAgentEmail)
    if (!id || assignedAgents.has(id)) continue
    assignedAgents.set(id, {
      id,
      label: normalizeText(client.assignedAgentName || client.assignedAgentEmail) || 'Agent',
    })
  }
  return {
    sources: sourceOptions,
    assignedAgents: [...assignedAgents.values()].sort((left, right) => left.label.localeCompare(right.label)),
  }
}

export async function loadAgentClientDirectory({ profile = {}, role = 'agent', workspace = null } = {}) {
  const currentAgent = {
    id: normalizeText(profile?.id || profile?.email),
    email: normalizeLower(profile?.email),
    fullName: normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')) || 'Current Agent',
  }

  let organisationId = normalizeText(workspace?.id)
  let users = []
  try {
    const [settingsResult, usersResult] = await Promise.allSettled([
      fetchOrganisationSettings(),
      listOrganisationUsers(),
    ])
    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
    const rawOrganisationId = normalizeText(settings?.organisation?.id)
    organisationId = isUuidLike(organisationId) ? organisationId : rawOrganisationId
    users = usersResult.status === 'fulfilled' ? usersResult.value || [] : []
  } catch (error) {
    console.warn('[agentClientDirectory] workspace settings lookup failed', error)
  }
  assertResolvedWorkspaceContext({ organisationId, profile, appRole: role }, { service: 'agentClientDirectory.loadAgentClientDirectory' })
  if (!users.length) {
    users = [{
      id: currentAgent.id,
      userId: currentAgent.id,
      fullName: currentAgent.fullName,
      email: currentAgent.email,
    }]
  }

  let crmSnapshot = {
    contacts: [],
    leads: [],
    leadActivities: [],
    tasks: [],
  }
  crmSnapshot = await listAgencyCrmLeadContacts(organisationId)

  let transactionRows = []
  if (isSupabaseConfigured && profile?.id) {
    try {
      transactionRows = await fetchTransactionsByParticipant({ userId: profile.id, roleType: role })
      if (workspace?.id && workspace.id !== 'all') {
        transactionRows = transactionRows.filter((row) => (row?.development?.id || row?.unit?.development_id) === workspace.id)
      }
    } catch {
      transactionRows = []
    }
  }

  const transactionIds = transactionRows.map((row) => normalizeText(row?.transaction?.id)).filter(Boolean)
  const [sellerRows, manualBuyerRows] = await Promise.all([
    fetchTransactionSellerRows(transactionIds),
    fetchManualBuyerRows(),
  ])
  let canvassingStore = { prospects: [], activities: [] }
  try {
    canvassingStore = await listCanvassingWorkspace(organisationId)
  } catch {
    canvassingStore = readCanvassingStore(organisationId)
  }
  const quickCreateStore = readQuickCreateStore()
  const sourceRows = [
    ...buildLeadSources(crmSnapshot),
    ...buildProspectSources({ ...canvassingStore, organisationId, sourceLabel: 'Canvassing' }),
    ...buildProspectSources({ prospects: quickCreateStore.prospects, activities: [], organisationId, sourceLabel: 'Manual' }),
    ...buildTransactionBuyerSources(transactionRows),
    ...buildTransactionSellerSources(transactionRows, sellerRows),
    ...buildManualBuyerSources(manualBuyerRows),
  ]

  const clients = buildDirectory(sourceRows)
  return {
    clients,
    organisationId,
    users,
    filters: buildFilterOptions(clients, users),
  }
}

export function filterAgentClientDirectory(
  clients = [],
  { search = '', type = 'all', status = 'all', source = 'all', assignedAgent = 'all', archivedIds = [] } = {},
) {
  const normalizedSearch = normalizeLower(search)
  const archivedSet = new Set((archivedIds || []).map(normalizeText))
  return (clients || [])
    .map((client) => {
      if (!archivedSet.has(normalizeText(client.id))) return client
      return {
        ...client,
        status: 'archived',
        statusLabel: 'Archived',
        statusKeys: [...new Set([...(client.statusKeys || []), 'archived'])],
      }
    })
    .filter((client) => {
      if (type !== 'all' && !(client.typeKeys || []).includes(type)) return false
      if (status !== 'all' && !(client.statusKeys || []).includes(status)) return false
      if (source !== 'all' && !(client.sourceLabels || []).includes(source)) return false
      if (assignedAgent !== 'all') {
        const agentKeys = [client.assignedAgentId, client.assignedAgentEmail].map(normalizeText).filter(Boolean)
        if (!agentKeys.includes(assignedAgent)) return false
      }
      if (!normalizedSearch) return true
      return normalizeLower(client.searchText).includes(normalizedSearch)
    })
}

export function getAgentClientProfile(clients = [], clientId = '') {
  const decodedId = decodeURIComponent(normalizeText(clientId))
  const client = (clients || []).find((item) => normalizeText(item.id) === normalizeText(clientId) || decodeURIComponent(normalizeText(item.id)) === decodedId)
  if (!client) return null
  const transactions = (client.transactions || [])
    .map((row) => ({
      id: row?.transaction?.id || null,
      unitId: row?.unit?.id || null,
      reference: getTransactionReference(row),
      propertyLabel: getPropertyLabelFromTransactionRow(row),
      stageLabel: row?.stage || row?.transaction?.stage || 'Unknown',
      type: row?.transaction?.transaction_type || 'transaction',
      typeLabel: row?.transaction?.transaction_type === 'private_property' ? 'Private' : 'Transaction',
      status: normalizeLower(row?.stage || row?.transaction?.stage).includes('registered') ? 'Completed' : 'Active',
      lastActivityAt: latestDate(row?.transaction?.updated_at, row?.transaction?.created_at),
    }))
    .sort((left, right) => toDateValue(right.lastActivityAt) - toDateValue(left.lastActivityAt))

  return {
    client,
    transactions,
    linkedRecords: client.linkedRecords || [],
  }
}
