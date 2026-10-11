import { clientMatchesStoredId, clientSourceKey, normalizeClientPhone, resolveClientRedirect } from './clientIdentity'
import { loadClientIdentities } from '../../services/clientIdentityService'
import { loadLatestClientActivity } from '../../services/clientActivityService'
import { listAgencyCrmLeadContacts } from '../../lib/agencyCrmRepository'
import { listCanvassingWorkspace } from '../../lib/canvassingRepository'
import { fetchOrganisationSettings, listOrganisationUsersForWorkspace } from '../../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { fetchTransactionsByParticipantSummary } from '../../lib/transactionsListApi'
import { getOrganisationPrivateListings } from '../../services/privateListingService'
import { assertResolvedWorkspaceContext } from '../../services/workspaceResolutionService'

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

const DIRECTORY_CACHE_TTL_MS = 30_000
const directoryCache = new Map()
const directoryInflight = new Map()
let directoryGeneration = 0

export function invalidateAgentClientDirectoryCache() {
  directoryGeneration += 1
  directoryCache.clear()
  directoryInflight.clear()
}

// Cache only in memory, and discard it whenever the signed-in session changes.
const authSubscription = typeof window !== 'undefined'
  ? supabase?.auth?.onAuthStateChange?.(invalidateAgentClientDirectoryCache)?.data?.subscription
  : null
if (import.meta.hot) import.meta.hot.dispose(() => authSubscription?.unsubscribe())

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function isMissingColumnError(error, columnName = '') {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message || error?.details || error?.hint)
  const target = normalizeLower(columnName)
  if (code === '42703' || code === 'PGRST204') return !target || message.includes(target)
  return target ? message.includes(target) && message.includes('column') : message.includes('column') && message.includes('does not exist')
}

function isSeedOrDemoRow(row = {}) {
  const metadata = row?.demo_metadata && typeof row.demo_metadata === 'object' ? row.demo_metadata : {}
  return (
    row?.is_demo_data === true ||
    row?.isDemoData === true ||
    metadata?.isDemoData === true ||
    metadata?.is_demo_data === true ||
    metadata?.seedData === true ||
    metadata?.seed_data === true ||
    metadata?.migratedFromLocalStorage === true
  )
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
  if (type.includes('tenant')) return 'Tenant'
  if (type.includes('landlord')) return 'Landlord'
  if (type.includes('investor')) return 'Investor'
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
  if (source.identityId) return [`client:${source.identityId}`]
  const organisationId = normalizeText(source.organisationId)
  const email = normalizeLower(source.email)
  // Names and phones only suggest duplicates. They never combine records.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return [`email:${organisationId}:${email}`]
  const recordId = clientSourceKey(source)
  return recordId ? [`record:${organisationId}:${recordId}`] : []
}

function createEmptyClient(source = {}) {
  const fallbackId = source.sourceRecordId || source.leadId || source.transactionId || source.contactId || source.prospectId || source.name
  return {
    id: sourceKeys(source)[0] || `client:${normalizeLower(fallbackId) || Date.now()}`,
    identityId: source.identityId || null,
    identityVersion: source.identityProfile?.version || null,
    identityAvailable: Boolean(source.identityAvailable),
    canManageIdentity: Boolean(source.canManageIdentity && source.identityId),
    mergedIdentityIds: source.mergedIdentityIds || [],
    emails: source.identityIdentifiers?.filter((item) => item.kind === 'email').map((item) => item.value) || [],
    phones: source.identityIdentifiers?.filter((item) => item.kind === 'phone').map((item) => item.value) || [],
    name: source.identityProfile?.name || source.name || 'Unnamed contact',
    email: normalizeLower(source.identityProfile ? source.identityProfile.primary_email : source.email),
    phone: normalizeText(source.identityProfile ? source.identityProfile.primary_phone : source.phone),
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
  if (!client.identityId && !client.email && nextEmail) client.email = nextEmail
  if (nextEmail && !client.emails.includes(nextEmail)) client.emails.push(nextEmail)
  if (!client.identityId && !client.phone && nextPhone) client.phone = nextPhone
  const normalizedPhone = normalizeClientPhone(nextPhone)
  if (normalizedPhone && !client.phones.some((phone) => normalizeClientPhone(phone) === normalizedPhone)) client.phones.push(client.identityId ? normalizedPhone : nextPhone)
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
    ...client.emails,
    ...client.phones,
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
    const kindScore = (record) => (record?.kind === 'transaction' ? 4 : record?.kind === 'listing' ? 3 : record?.kind === 'lead' ? 2 : record?.kind === 'prospect' ? 1 : 0)
    const scoreDelta = kindScore(right) - kindScore(left)
    if (scoreDelta) return scoreDelta
    return toDateValue(right?.lastActivityAt || right?.updatedAt || right?.createdAt) - toDateValue(left?.lastActivityAt || left?.updatedAt || left?.createdAt)
  })
  return sorted[0] || null
}

export function getAgentClientOpenPath(client = {}) {
  const record = resolvePrimaryLinkedRecord(client)
  if (record?.path && record.kind !== 'client') return record.path
  if (record?.path && record.kind === 'client') {
    const recordReference = decodeURIComponent(normalizeText(record.path).split('/').at(-1) || '')
    if (recordReference.startsWith('buyer:')) return record.path
  }
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
      identitySource: { kind: 'lead', id: leadId },
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
        identitySource: { kind: 'contact', id: contactId },
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
      identitySource: { kind: 'prospect', id: prospectId },
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
        identitySource: { kind: 'transaction_buyer', id: transactionId },
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
        identitySource: { kind: 'transaction_seller', id: transactionId },
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
    identitySource: { kind: 'buyer', id: buyer?.id },
    organisationId: normalizeText(buyer?.organisation_id),
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

function getListingSellerFormData(listing = {}) {
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || listing?.onboarding || {}
  const formData = onboarding?.formData || onboarding?.form_data || listing?.formData || listing?.form_data || {}
  return formData && typeof formData === 'object' ? formData : {}
}

function getListingSellerFacts(listing = {}) {
  const facts = listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || listing?.sellerOnboarding?.canonicalFacts || {}
  return facts && typeof facts === 'object' ? facts : {}
}

function getListingPropertyLabel(listing = {}) {
  return normalizeText(
    listing?.title ||
      listing?.listingTitle ||
      listing?.propertyAddress ||
      listing?.formattedAddress ||
      listing?.addressLine1 ||
      listing?.address_line_1 ||
      [listing?.suburb, listing?.city].map(normalizeText).filter(Boolean).join(', ') ||
      listing?.listingReference ||
      listing?.listing_reference,
  ) || 'Private listing'
}

function buildPrivateListingSellerSources(rows = []) {
  return (rows || [])
    .map((listing) => {
      const listingId = normalizeText(listing?.id || listing?.listingId || listing?.listing_id)
      if (!listingId) return null
      const formData = getListingSellerFormData(listing)
      const facts = getListingSellerFacts(listing)
      const propertyLabel = getListingPropertyLabel(listing)
      const seller = listing?.seller && typeof listing.seller === 'object' ? listing.seller : {}
      const sellerName = normalizeText(
        listing?.sellerName ||
          listing?.seller_name ||
          seller?.name ||
          facts?.fullName ||
          facts?.sellerName ||
          facts?.name ||
          [facts?.firstName, facts?.lastName].map(normalizeText).filter(Boolean).join(' ') ||
          formData?.sellerName ||
          formData?.fullName ||
          [formData?.sellerFirstName || formData?.firstName, formData?.sellerSurname || formData?.lastName].map(normalizeText).filter(Boolean).join(' '),
      )
      const email = normalizeLower(
        listing?.sellerEmail ||
          listing?.seller_email ||
          seller?.email ||
          facts?.email ||
          facts?.sellerEmail ||
          formData?.sellerEmail ||
          formData?.email ||
          formData?.contactEmail,
      )
      const phone = normalizeText(
        listing?.sellerPhone ||
          listing?.seller_phone ||
          seller?.phone ||
          facts?.phone ||
          facts?.sellerPhone ||
          facts?.mobile ||
          formData?.sellerPhone ||
          formData?.phone ||
          formData?.contactNumber ||
          formData?.mobile,
      )
      const lastActivityAt = latestDate(listing?.updatedAt, listing?.updated_at, listing?.createdAt, listing?.created_at)
      return {
        identitySource: { kind: 'listing_seller', id: listingId },
        sourceRecordId: `listing:${listingId}`,
        name: sellerName || `Seller for ${propertyLabel}`,
        email,
        phone,
        typeLabel: 'Seller',
        sourceLabel: 'Private Listing',
        status: listing?.sellerOnboardingStatus || listing?.seller_onboarding_status || listing?.listingStatus || listing?.listing_status || listing?.status || 'Active',
        stage: listing?.listingStatus || listing?.listing_status || listing?.status,
        leadId: normalizeText(listing?.sellerLeadId || listing?.seller_lead_id || listing?.originatingCrmLeadId || listing?.originating_crm_lead_id),
        listingId,
        organisationId: normalizeText(listing?.organisationId || listing?.organisation_id),
        assignedAgentId: normalizeText(listing?.assignedAgentId || listing?.assigned_agent_id),
        assignedAgentName: normalizeText(listing?.assignedAgentName || listing?.assignedAgent),
        assignedAgentEmail: normalizeLower(listing?.assignedAgentEmail || listing?.assigned_agent_email),
        lastActivityAt,
        createdAt: listing?.createdAt || listing?.created_at,
        updatedAt: listing?.updatedAt || listing?.updated_at,
        linkedRecord: {
          kind: 'listing',
          id: listingId,
          label: propertyLabel,
          reference: normalizeText(listing?.listingReference || listing?.listing_reference || listingId),
          path: `/agent/listings/${encodeURIComponent(listingId)}`,
          lastActivityAt,
        },
      }
    })
    .filter(Boolean)
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

async function fetchManualBuyerRows({ organisationId = '' } = {}) {
  const workspaceId = normalizeText(organisationId)
  if (!isSupabaseConfigured || !supabase || !isUuidLike(workspaceId)) return []
  try {
    let result = await supabase
      .from('buyers')
      .select('id, name, phone, email, organisation_id, is_demo_data, demo_metadata, created_at, updated_at')
      .eq('organisation_id', workspaceId)
      .neq('is_demo_data', true)
      .order('updated_at', { ascending: false })
      .limit(500)
    if (result.error) {
      if (isMissingColumnError(result.error, 'organisation_id')) return []
      if (isMissingColumnError(result.error, 'is_demo_data') || isMissingColumnError(result.error, 'demo_metadata')) {
        result = await supabase
          .from('buyers')
          .select('id, name, phone, email, organisation_id, created_at, updated_at')
          .eq('organisation_id', workspaceId)
          .order('updated_at', { ascending: false })
          .limit(500)
      }
    }
    if (result.error) return []
    return (result.data || [])
      .filter((row) => normalizeText(row?.organisation_id) === workspaceId)
      .filter((row) => !isSeedOrDemoRow(row))
  } catch {
    return []
  }
}

async function fetchManualBuyerRow({ buyerId = '', organisationId = '' } = {}) {
  const recordId = normalizeText(buyerId)
  const workspaceId = normalizeText(organisationId)
  if (!isSupabaseConfigured || !supabase || !isUuidLike(recordId) || !isUuidLike(workspaceId)) return null

  let result = await supabase
    .from('buyers')
    .select('id, name, phone, email, organisation_id, is_demo_data, demo_metadata, created_at, updated_at')
    .eq('id', recordId)
    .eq('organisation_id', workspaceId)
    .maybeSingle()

  if (result.error && (isMissingColumnError(result.error, 'is_demo_data') || isMissingColumnError(result.error, 'demo_metadata'))) {
    result = await supabase
      .from('buyers')
      .select('id, name, phone, email, organisation_id, created_at, updated_at')
      .eq('id', recordId)
      .eq('organisation_id', workspaceId)
      .maybeSingle()
  }

  if (result.error) throw result.error
  if (!result.data || normalizeText(result.data.organisation_id) !== workspaceId || isSeedOrDemoRow(result.data)) return null
  return result.data
}

async function resolveAgentOrganisationId({ profile = {}, role = 'agent', workspace = null } = {}) {
  let organisationId = normalizeText(workspace?.id)
  if (!isUuidLike(organisationId)) {
    const settings = await fetchOrganisationSettings()
    organisationId = normalizeText(settings?.organisation?.id)
  }
  assertResolvedWorkspaceContext({ organisationId, profile, appRole: role }, { service: 'agentClientDirectory.loadAgentClientProfile' })
  return organisationId
}

export function buildAgentClientDirectory(sourceRows = [], identities = {}) {
  const profiles = identities.profiles || []
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))
  const identifiersByClient = new Map()
  for (const identifier of identities.identifiers || []) {
    const values = identifiersByClient.get(identifier.client_id) || []
    values.push(identifier)
    identifiersByClient.set(identifier.client_id, values)
  }
  const redirectsByClient = new Map()
  for (const profile of profiles) {
    if (!profile.merged_into) continue
    const values = redirectsByClient.get(profile.merged_into) || []
    values.push(profile.id)
    redirectsByClient.set(profile.merged_into, values)
  }
  const links = new Map((identities.links || []).map((link) => [`${link.source_kind}:${link.source_id}`, link.client_id]))
  const grouped = { clients: new Map(), keyIndex: new Map() }
  const represented = new Set()
  const enrich = (source, identityProfile) => ({
    ...source,
    identityId: identityProfile?.id,
    identityProfile,
    identityAvailable: identities.available,
    canManageIdentity: identities.canManage,
    mergedIdentityIds: redirectsByClient.get(identityProfile?.id) || [],
    identityIdentifiers: identifiersByClient.get(identityProfile?.id) || [],
  })
  for (const source of sourceRows) {
    const identityProfile = resolveClientRedirect(profilesById, links.get(clientSourceKey(source)))
    if (identityProfile) represented.add(identityProfile.id)
    addSource(grouped, enrich(source, identityProfile))
  }
  for (const profile of profiles) {
    if (profile.merged_into || represented.has(profile.id)) continue
    addSource(grouped, enrich({ sourceRecordId: profile.id, organisationId: profile.organisation_id, name: profile.name,
      sourceLabel: 'Client profile', typeLabel: 'Client', status: 'Active', createdAt: profile.created_at, updatedAt: profile.updated_at }, profile))
  }
  return [...grouped.clients.values()]
    .map((client) => finalizeClient({ ...client,
      legacyDirectoryIds: [...new Set(client.sources.flatMap((source) => [
        source.email ? `email:${normalizeLower(source.email)}` : '',
        source.phone ? `phone:${normalizeClientPhone(source.phone)}` : '',
        source.name ? `name:${normalizeLower(source.name)}` : '',
      ].filter(Boolean)))],
      transactions: [...new Map(client.transactions.map((row) => [row.transaction?.id, row])).values()],
      linkedRecords: [...new Map(client.linkedRecords.map((record) => [`${record.kind}:${record.id}`, record])).values()],
    }))
    .sort((left, right) => toDateValue(right.lastActivityAt) - toDateValue(left.lastActivityAt))
}

const buildDirectory = buildAgentClientDirectory

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

async function readAgentClientDirectory({ organisationId, profile, role, currentAgent, forceRefresh }) {
  // Only seller rows depend on the transaction result. Everything else can start
  // together once the workspace is known.
  const transactions = isSupabaseConfigured && profile?.id
    ? fetchTransactionsByParticipantSummary({
        userId: profile.id,
        roleType: role,
        organisationId,
        identityContext: { email: currentAgent.email, fullName: currentAgent.fullName },
        includePropertyDetails: false,
        forceRefresh,
      }).then((rows) => rows.filter((row) => !isSeedOrDemoRow(row?.transaction || row) && !isSeedOrDemoRow(row?.buyer || {})))
    : Promise.resolve([])
  const transactionSources = transactions.then(async (transactionRows) => ({
    transactionRows,
    sellerRows: await fetchTransactionSellerRows(transactionRows.map((row) => normalizeText(row?.transaction?.id)).filter(Boolean)),
  }))
  const [crm, transaction, buyers, listings, canvassing, identitiesResult, usersResult] = await Promise.allSettled([
    listAgencyCrmLeadContacts(organisationId, { includeLocalFallback: false }),
    transactionSources,
    fetchManualBuyerRows({ organisationId }),
    getOrganisationPrivateListings(organisationId, {
      includeRequirementsAndDocuments: false,
      includeExternalLinks: false,
      includePublicationDetails: false,
    }),
    listCanvassingWorkspace(organisationId, { includeLocalFallback: false }),
    loadClientIdentities(organisationId),
    listOrganisationUsersForWorkspace({ organisationId }),
  ])
  if (crm.status === 'rejected') throw crm.reason
  if (identitiesResult.status === 'rejected') throw identitiesResult.reason
  const identities = identitiesResult.value
  const transactionRows = transaction.status === 'fulfilled' ? transaction.value.transactionRows : []
  const sellerRows = transaction.status === 'fulfilled' ? transaction.value.sellerRows : []
  const users = usersResult.status === 'fulfilled' && usersResult.value?.length
    ? usersResult.value
    : [{ id: currentAgent.id, userId: currentAgent.id, fullName: currentAgent.fullName, email: currentAgent.email }]
  const sourceRows = [
    ...buildLeadSources(crm.value),
    ...buildProspectSources({ ...(canvassing.status === 'fulfilled' ? canvassing.value : {}), organisationId, sourceLabel: 'Canvassing' }),
    ...buildTransactionBuyerSources(transactionRows),
    ...buildTransactionSellerSources(transactionRows, sellerRows),
    ...buildManualBuyerSources(buyers.status === 'fulfilled' ? buyers.value : []),
    ...buildPrivateListingSellerSources(listings.status === 'fulfilled' ? listings.value : []),
  ]
  const clients = buildDirectory(sourceRows, identities)
  const directory = {
    clients,
    activityWarning: '',
    organisationId,
    identityAvailable: identities.available,
    canManageIdentities: identities.canManage,
    users,
    filters: buildFilterOptions(clients, users),
  }
  // Keep the core list usable while activity loads. Enrichment creates new rows
  // so a cached list and another caller's render cannot be mutated underneath it.
  if (identities.available) {
    directory.activityPromise = loadLatestClientActivity(organisationId).then((latest) => ({
      ...directory,
      clients: clients.map((client) => ({ ...client, lastActivityAt: latestDate(client.lastActivityAt, latest.get(client.identityId)) }))
        .sort((left, right) => toDateValue(right.lastActivityAt) - toDateValue(left.lastActivityAt)),
    })).catch(() => ({ ...directory, activityWarning: 'Recent client activity could not load. Open the client activity timeline to retry.' }))
  }
  // Preserve existing optional-source fallbacks, but retry them on the next visit.
  const cacheable = [transaction, buyers, listings, canvassing, usersResult].every((result) => result.status === 'fulfilled')
  return { directory, cacheable }
}

export async function loadAgentClientDirectory({
  profile = {}, role = 'agent', workspace = null, currentMembership = null,
  businessWorkspaceId = '', forceRefresh = false, deferActivity = false,
} = {}) {
  const currentAgent = {
    id: normalizeText(profile?.id || profile?.email),
    email: normalizeLower(profile?.email),
    fullName: normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')) || 'Current Agent',
  }
  // WorkspaceContext already resolved this identity; avoid bootstrapping it again.
  const organisationId = await resolveAgentOrganisationId({ profile, role, workspace })
  const key = JSON.stringify([
    organisationId, currentAgent.id, currentAgent.email, currentAgent.fullName, role, businessWorkspaceId,
    currentMembership?.id, currentMembership?.role, currentMembership?.workspaceRole || currentMembership?.workspace_role,
    currentMembership?.branchId || currentMembership?.branch_id, currentMembership?.status,
  ])
  if (forceRefresh) invalidateAgentClientDirectoryCache()
  let directory = directoryCache.get(key)?.expiresAt > Date.now() ? directoryCache.get(key).directory : null
  if (!directory) {
    let request = directoryInflight.get(key)
    if (!request) {
      const generation = directoryGeneration
      request = readAgentClientDirectory({ organisationId, profile, role, currentAgent, forceRefresh }).then(({ directory: result, cacheable }) => {
        if (generation === directoryGeneration && cacheable) {
          for (const [cacheKey, entry] of directoryCache) if (entry.expiresAt <= Date.now()) directoryCache.delete(cacheKey)
          directoryCache.set(key, { directory: result, expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS })
        }
        return result
      }).finally(() => {
        if (directoryInflight.get(key) === request) directoryInflight.delete(key)
      })
      directoryInflight.set(key, request)
    }
    directory = await request
  }
  return !deferActivity && directory.activityPromise ? directory.activityPromise : directory
}

export async function loadAgentClientProfile({ clientId = '', profile = {}, role = 'agent', workspace = null } = {}) {
  const decodedId = decodeURIComponent(normalizeText(clientId))
  const [recordType, recordId] = decodedId.split(':', 2)
  if (recordType !== 'buyer' || !isUuidLike(recordId)) return undefined

  const organisationId = await resolveAgentOrganisationId({ profile, role, workspace })
  const identities = await loadClientIdentities(organisationId)
  if (identities.available) return undefined
  const buyer = await fetchManualBuyerRow({ buyerId: recordId, organisationId })
  if (!buyer) return null

  const client = buildDirectory(buildManualBuyerSources([buyer]))[0]
  if (!client) return null
  const stableClient = { ...client, id: decodedId }
  return getAgentClientProfile([stableClient], decodedId)
}

export function filterAgentClientDirectory(
  clients = [],
  { search = '', type = 'all', status = 'all', source = 'all', assignedAgent = 'all', archivedIds = [] } = {},
) {
  const normalizedSearch = normalizeLower(search)
  const archivedSet = new Set((archivedIds || []).map(normalizeText))
  return (clients || [])
    .map((client) => {
      if (!clientMatchesStoredId(client, archivedSet)) return client
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
  const [legacyKind, ...legacyParts] = decodedId.split(':')
  const legacyId = legacyParts.join(':')
  const matches = (clients || []).filter((item) => normalizeText(item.id) === normalizeText(clientId) || decodeURIComponent(normalizeText(item.id)) === decodedId
    || (item.mergedIdentityIds || []).includes(decodedId.replace(/^client:/, ''))
    || (['buyer', 'contact'].includes(legacyKind) && (item.sources || []).some((source) => source.identitySource?.kind === legacyKind && source.identitySource?.id === legacyId))
    || (legacyKind === 'email' && (item.emails || []).includes(legacyId))
    || (item.legacyDirectoryIds || []).includes(decodedId))
  const client = matches.length === 1 ? matches[0] : null
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
      imageUrl: [row?.transaction?.property_image_url, row?.transaction?.listing_image_url, row?.transaction?.primary_image_url, row?.transaction?.cover_image_url, row?.transaction?.hero_image_url, row?.transaction?.image_url, row?.transaction?.thumbnail_url, row?.unit?.cover_image_url, row?.unit?.primary_image_url, row?.unit?.image_url, row?.unit?.thumbnail_url, row?.unit?.gallery_images?.[0]?.url || row?.unit?.gallery_images?.[0], row?.development?.cover_image_url].find(value => typeof value === 'string' && value.trim()) || '',
      price: Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price) || null,
      deposit: Number(row?.transaction?.deposit_amount) || null,
      financeLabel: normalizeText(row?.transaction?.finance_type).replaceAll('_', ' '),
      assignedAgentName: normalizeText(row?.transaction?.assigned_agent),
      attorneyName: normalizeText(row?.transaction?.attorney),
      expectedTransferDate: row?.transaction?.expected_transfer_date || null,
      nextAction: normalizeText(row?.transaction?.next_action),
    }))
    .sort((left, right) => toDateValue(right.lastActivityAt) - toDateValue(left.lastActivityAt))

  return {
    client,
    transactions,
    linkedRecords: client.linkedRecords || [],
  }
}
