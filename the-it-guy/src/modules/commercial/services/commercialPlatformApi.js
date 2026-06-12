import {
  getCommercialActivity,
  getCommercialAllDocumentRequests,
  getCommercialAllDocuments,
  getCommercialAllHeadsOfTerms,
  getCommercialCommissions,
  getCommercialCompanies,
  getCommercialContacts,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialListings,
  getCommercialProperties,
  getCommercialRecentActivity,
  getCommercialRequirements,
  getCommercialTenants,
  getCommercialTransactions,
  getCommercialVacancies,
} from './commercialApi'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function daysBetween(left, right) {
  const leftDate = asDate(left)
  const rightDate = asDate(right)
  if (!leftDate || !rightDate) return null
  return Math.ceil((rightDate.getTime() - leftDate.getTime()) / 86400000)
}

function latestDate(...values) {
  return values
    .map(asDate)
    .filter(Boolean)
    .sort((left, right) => right - left)[0] || null
}

function recordUpdatedAt(row = {}) {
  if (!row) return ''
  return row.updated_at || row.created_at || row.signed_at || row.sent_at || row.lease_start_date || ''
}

function firstById(rows = []) {
  return new Map(rows.filter((row) => row?.id).map((row) => [row.id, row]))
}

function brokerLabel(id, brokers = []) {
  const brokerId = normalizeText(id)
  if (!brokerId) return 'Unassigned'
  const broker = brokers.find((row) => [row.id, row.userId, row.user_id].map(normalizeText).includes(brokerId))
  return broker?.name || broker?.fullName || [broker?.firstName, broker?.lastName].filter(Boolean).join(' ') || broker?.email || 'Assigned broker'
}

function pickBrokerId(...records) {
  for (const record of records) {
    const brokerId = normalizeText(record?.assigned_broker || record?.broker_id || record?.owner_id)
    if (brokerId) return brokerId
  }
  return ''
}

function deriveTransactionStatus({ deal, hot, lease }) {
  const leaseStage = normalizeCommercialLifecycleStage('leases', lease?.status, '')
  if (leaseStage === 'active') return 'Lease Active'
  if (['executed', 'pending_signature', 'draft'].includes(leaseStage)) return 'Lease Pending'
  const hotStage = normalizeCommercialLifecycleStage('headsOfTerms', hot?.status, '')
  if (hotStage === 'converted') return 'Lease Pending'
  if (hotStage === 'signed') return 'Signed HOT'
  if (['accepted', 'under_review', 'sent', 'draft'].includes(hotStage)) return `HOT ${hotStage.replace(/_/g, ' ')}`
  const dealStage = normalizeCommercialLifecycleStage('deals', deal?.stage || deal?.status, 'new')
  if (dealStage === 'converted') return 'Converted'
  if (dealStage === 'lost') return 'Lost'
  return `Deal ${dealStage.replace(/_/g, ' ')}`
}

function createTimelineItem({ id, type, title, body = '', timestamp = '', actor = 'Commercial team', source = 'commercial' }) {
  return {
    id,
    type,
    title,
    body,
    timestamp,
    actor,
    source,
  }
}

function documentsForTransaction(transaction, documents = []) {
  const entityPairs = [
    ['commercial_transaction', transaction.id],
    ['commercial_deal', transaction.deal?.id],
    ['commercial_heads_of_terms', transaction.hot?.id],
    ['commercial_lease', transaction.lease?.id],
    ['commercial_property', transaction.property?.id],
    ['commercial_company', transaction.company?.id],
    ['commercial_contact', transaction.contact?.id],
    ['commercial_tenant', transaction.tenant?.id],
    ['commercial_landlord', transaction.landlord?.id],
  ]
  const keys = new Set(entityPairs.filter(([, id]) => id).map(([type, id]) => `${type}:${id}`))
  return documents.filter((document) => keys.has(`${document.entity_type}:${document.entity_id}`))
}

function documentRequestsForTransaction(transaction, documentRequests = []) {
  const entityPairs = [
    ['commercial_transaction', transaction.id],
    ['commercial_deal', transaction.deal?.id],
    ['commercial_heads_of_terms', transaction.hot?.id],
    ['commercial_lease', transaction.lease?.id],
    ['commercial_property', transaction.property?.id],
    ['commercial_company', transaction.company?.id],
    ['commercial_contact', transaction.contact?.id],
    ['commercial_tenant', transaction.tenant?.id],
    ['commercial_landlord', transaction.landlord?.id],
  ]
  const keys = new Set(entityPairs.filter(([, id]) => id).map(([type, id]) => `${type}:${id}`))
  return documentRequests.filter((request) => keys.has(`${request.entity_type}:${request.entity_id}`))
}

function activityForTransaction(transaction, activity = []) {
  const entityPairs = [
    ['commercial_transaction', transaction.id],
    ['commercial_deal', transaction.deal?.id],
    ['commercial_heads_of_terms', transaction.hot?.id],
    ['commercial_lease', transaction.lease?.id],
    ['commercial_requirement', transaction.requirement?.id],
    ['commercial_property', transaction.property?.id],
    ['commercial_vacancy', transaction.vacancy?.id],
    ['commercial_listing', transaction.listing?.id],
    ['commercial_company', transaction.company?.id],
    ['commercial_contact', transaction.contact?.id],
    ['commercial_tenant', transaction.tenant?.id],
    ['commercial_landlord', transaction.landlord?.id],
  ]
  const keys = new Set(entityPairs.filter(([, id]) => id).map(([type, id]) => `${type}:${id}`))
  return activity.filter((row) => keys.has(`${row.entity_type}:${row.entity_id}`))
}

export function buildCommercialRoleplayers(transaction = {}, brokers = []) {
  const brokerId = transaction.brokerId || pickBrokerId(transaction.lease, transaction.hot, transaction.deal, transaction.requirement, transaction.property)
  return [
    { role: 'Company', name: transaction.company?.company_name || transaction.company?.name || transaction.tenant?.name || 'Company pending', type: 'commercial_company', recordId: transaction.company?.id || '' },
    { role: 'Contact', name: transaction.contact?.name || 'Contact pending', type: 'commercial_contact', recordId: transaction.contact?.id || '' },
    { role: 'Landlord', name: transaction.landlord?.name || 'Landlord pending', type: 'commercial_landlord', recordId: transaction.landlord?.id || '' },
    { role: 'Broker', name: brokerLabel(brokerId, brokers), type: 'broker', recordId: brokerId },
    { role: 'Agency', name: transaction.organisationName || 'Commercial brokerage', type: 'organisation', recordId: transaction.organisationId || '' },
    { role: 'Property Manager', name: transaction.property?.property_manager_name || transaction.property?.manager_name || 'Not assigned yet', type: 'contact', recordId: '' },
    { role: 'Legal Contact', name: transaction.lease?.legal_contact_name || transaction.hot?.legal_contact_name || 'Not instructed yet', type: 'contact', recordId: '' },
    { role: 'Finance Contact', name: transaction.tenant?.finance_contact_name || transaction.landlord?.finance_contact_name || 'Not captured yet', type: 'contact', recordId: '' },
  ]
}

export function buildCommercialCommissionSnapshot(transaction = {}) {
  const deal = transaction.deal || {}
  const lease = transaction.lease || {}
  const commissionRecord = transaction.commissionRecord || {}
  const dealValue = toNumber(deal.deal_value || transaction.value)
  const monthlyRental = toNumber(lease.monthly_rental || transaction.hot?.monthly_rental || deal.monthly_rental)
  const termMonths = toNumber(lease.term_months || transaction.hot?.lease_term_months || deal.lease_term_months || 12)
  const leaseValue = toNumber(lease.total_value) || monthlyRental * Math.max(termMonths, 1)
  const commissionPercent = toNumber(commissionRecord.commission_percent || deal.commission_percent || transaction.commission_percent || 5)
  const commissionValue = toNumber(commissionRecord.commission_amount || deal.commission_value || transaction.commission_value) || (dealValue || leaseValue) * (commissionPercent / 100)
  const status = normalizeLower(commissionRecord.status || deal.commission_status || transaction.commission_status)
    || (normalizeCommercialLifecycleStage('leases', lease.status, '') === 'active' ? 'approved' : transaction.hot?.signed_at ? 'projected' : 'projected')

  return {
    id: commissionRecord.id || '',
    dealValue,
    leaseValue,
    commissionPercent,
    commissionValue,
    status,
    manualOverride: Boolean(commissionRecord.manual_override),
    splits: [
      { label: 'Broker', percent: toNumber(deal.broker_split_percent) || 70, value: commissionValue * ((toNumber(deal.broker_split_percent) || 70) / 100) },
      { label: 'Team', percent: toNumber(deal.team_split_percent) || 20, value: commissionValue * ((toNumber(deal.team_split_percent) || 20) / 100) },
      { label: 'Branch', percent: toNumber(deal.branch_split_percent) || 10, value: commissionValue * ((toNumber(deal.branch_split_percent) || 10) / 100) },
    ],
  }
}

export function buildCommercialTransactionTimeline(transaction = {}, { activity = [], documents = [] } = {}) {
  const items = []
  const requirement = transaction.requirement || {}
  const vacancy = transaction.vacancy || {}
  const deal = transaction.deal || {}
  const hot = transaction.hot || {}
  const lease = transaction.lease || {}

  if (requirement.id) {
    items.push(createTimelineItem({
      id: `requirement-${requirement.id}`,
      type: 'requirement',
      title: 'Tenant requirement created',
      body: requirement.requirement_name || transaction.tenant?.name || 'Requirement captured',
      timestamp: requirement.created_at,
    }))
  }
  if (vacancy.id) {
    items.push(createTimelineItem({
      id: `vacancy-${vacancy.id}`,
      type: 'vacancy',
      title: 'Vacancy matched',
      body: vacancy.vacancy_name || transaction.property?.property_name || 'Vacancy linked to transaction',
      timestamp: vacancy.updated_at || vacancy.created_at,
    }))
  }
  if (deal.id) {
    items.push(createTimelineItem({
      id: `deal-${deal.id}`,
      type: 'deal',
      title: 'Deal created',
      body: deal.deal_name || 'Commercial deal opened',
      timestamp: deal.created_at,
    }))
  }
  if (hot.id) {
    items.push(createTimelineItem({
      id: `hot-${hot.id}`,
      type: 'hot',
      title: 'Heads of Terms generated',
      body: hot.premises_description || 'Commercial terms prepared',
      timestamp: hot.created_at,
    }))
  }
  if (hot.sent_at || normalizeCommercialLifecycleStage('headsOfTerms', hot.status, '') === 'sent') {
    items.push(createTimelineItem({
      id: `hot-sent-${hot.id}`,
      type: 'hot',
      title: 'HOT sent',
      body: 'Heads of Terms sent for review',
      timestamp: hot.sent_at || hot.updated_at,
    }))
  }
  if (hot.signed_at || normalizeCommercialLifecycleStage('headsOfTerms', hot.status, '') === 'signed') {
    items.push(createTimelineItem({
      id: `hot-signed-${hot.id}`,
      type: 'hot',
      title: 'HOT signed',
      body: 'Signed Heads of Terms ready for lease creation',
      timestamp: hot.signed_at || hot.updated_at,
    }))
  }
  if (lease.id) {
    items.push(createTimelineItem({
      id: `lease-${lease.id}`,
      type: 'lease',
      title: 'Lease generated',
      body: lease.lease_name || `Lease ${String(lease.id).slice(0, 8)}`,
      timestamp: lease.created_at,
    }))
  }
  if (normalizeCommercialLifecycleStage('leases', lease.status, '') === 'active') {
    items.push(createTimelineItem({
      id: `lease-active-${lease.id}`,
      type: 'lease',
      title: 'Lease activated',
      body: 'Commercial lease is active',
      timestamp: lease.lease_start_date || lease.updated_at,
    }))
  }

  documentsForTransaction(transaction, documents).forEach((document) => {
    items.push(createTimelineItem({
      id: `document-${document.id}`,
      type: 'document',
      title: `${document.document_name || document.name || 'Document'} uploaded`,
      body: document.category || document.status || '',
      timestamp: document.uploaded_at || document.created_at,
      actor: document.uploaded_by || 'Commercial team',
    }))
  })

  activity.forEach((row) => {
    items.push(createTimelineItem({
      id: `activity-${row.id}`,
      type: row.entity_type || row.activity_type || 'activity',
      title: row.title || String(row.activity_type || 'Commercial activity').replace(/_/g, ' '),
      body: row.body || row.description || '',
      timestamp: row.created_at,
      actor: row.created_by || 'Commercial team',
      source: 'bridge_activity',
    }))
  })

  return items
    .filter((item) => item.timestamp)
    .sort((left, right) => asDate(right.timestamp || 0) - asDate(left.timestamp || 0))
}

export function buildCommercialTasks(transaction = {}, { documentRequests = [] } = {}) {
  const hotStage = normalizeCommercialLifecycleStage('headsOfTerms', transaction.hot?.status, '')
  const leaseStage = normalizeCommercialLifecycleStage('leases', transaction.lease?.status, '')
  const requests = documentRequestsForTransaction(transaction, documentRequests)
  const today = startOfToday()
  const tasks = []

  requests
    .filter((request) => !['approved', 'completed', 'archived'].includes(normalizeLower(request.status)))
    .forEach((request) => {
      const due = asDate(request.due_date)
      tasks.push({
        id: `document-request-${request.id}`,
        title: `Follow up ${request.category || 'document request'}`,
        status: due && due < today ? 'overdue' : 'open',
        owner: transaction.brokerName || 'Assigned broker',
        dueDate: request.due_date || '',
        source: 'documents',
      })
    })

  if (['accepted', 'signed'].includes(hotStage) && !transaction.lease?.id) {
    tasks.push({
      id: `create-lease-${transaction.hot?.id || transaction.id}`,
      title: 'Create lease from signed HOT',
      status: 'open',
      owner: transaction.brokerName || 'Assigned broker',
      dueDate: '',
      source: 'workflow',
    })
  }

  if (transaction.lease?.id && ['draft', 'pending_signature'].includes(leaseStage)) {
    tasks.push({
      id: `execute-lease-${transaction.lease.id}`,
      title: leaseStage === 'draft' ? 'Review lease draft' : 'Confirm lease signature',
      status: 'open',
      owner: transaction.brokerName || 'Assigned broker',
      dueDate: transaction.lease.lease_start_date || '',
      source: 'lease',
    })
  }

  const daysToExpiry = daysBetween(today, transaction.lease?.lease_end_date)
  if (daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 180) {
    tasks.push({
      id: `renewal-${transaction.lease.id}`,
      title: 'Start renewal review',
      status: daysToExpiry <= 30 ? 'urgent' : 'open',
      owner: transaction.brokerName || 'Assigned broker',
      dueDate: transaction.lease.lease_end_date,
      source: 'renewal',
    })
  }

  return tasks
}

export function buildCommercialNotifications(transaction = {}, { documentRequests = [] } = {}) {
  const notifications = []
  const hotStage = normalizeCommercialLifecycleStage('headsOfTerms', transaction.hot?.status, '')
  const daysToExpiry = daysBetween(startOfToday(), transaction.lease?.lease_end_date)

  if (hotStage === 'sent') notifications.push({ id: `hot-sent-${transaction.hot.id}`, title: 'HOT sent', channel: 'in_app', status: 'ready' })
  if (hotStage === 'accepted') notifications.push({ id: `hot-accepted-${transaction.hot.id}`, title: 'HOT accepted', channel: 'in_app', status: 'ready' })
  if (hotStage === 'signed') notifications.push({ id: `hot-signed-${transaction.hot.id}`, title: 'HOT signed', channel: 'in_app', status: 'ready' })
  if (transaction.lease?.id) notifications.push({ id: `lease-created-${transaction.lease.id}`, title: 'Lease created', channel: 'in_app', status: 'ready' })
  if (daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 90) {
    notifications.push({ id: `lease-expiry-${transaction.lease.id}`, title: `Lease expires in ${daysToExpiry} days`, channel: 'in_app', status: 'ready' })
  }
  documentRequestsForTransaction(transaction, documentRequests)
    .filter((request) => normalizeLower(request.status) === 'requested')
    .forEach((request) => {
      notifications.push({ id: `document-requested-${request.id}`, title: `${request.category || 'Document'} requested`, channel: 'in_app', status: 'ready' })
    })

  return notifications
}

export function buildCommercialTransactions({
  organisationId = '',
  organisationName = '',
  transactions = [],
  commissions = [],
  companies = [],
  contacts = [],
  landlords = [],
  tenants = [],
  properties = [],
  requirements = [],
  deals = [],
  listings = [],
  headsOfTerms = [],
  leases = [],
  vacancies = [],
  documents = [],
  documentRequests = [],
  activity = [],
  brokers = [],
} = {}) {
  const companiesById = firstById(companies)
  const contactsById = firstById(contacts)
  const tenantsById = firstById(tenants)
  const landlordsById = firstById(landlords)
  const propertiesById = firstById(properties)
  const requirementsById = firstById(requirements)
  const vacanciesById = firstById(vacancies)
  const dealsById = firstById(deals)
  const listingsById = firstById(listings)
  const commissionsByTransactionId = new Map(commissions.filter((row) => row?.transaction_id).map((row) => [row.transaction_id, row]))
  const hotByDeal = new Map()
  headsOfTerms.forEach((hot) => {
    const dealId = hot.deal_id
    if (!dealId) return
    const existing = hotByDeal.get(dealId)
    if (!existing || asDate(recordUpdatedAt(hot)) > asDate(recordUpdatedAt(existing))) hotByDeal.set(dealId, hot)
  })
  const leaseByDeal = new Map()
  const leaseByHot = new Map()
  leases.forEach((lease) => {
    if (lease.deal_id) leaseByDeal.set(lease.deal_id, lease)
    if (lease.heads_of_terms_id) leaseByHot.set(lease.heads_of_terms_id, lease)
  })

  if (transactions.length) {
    return transactions.map((row) => {
      const deal = dealsById.get(row.deal_id) || null
      const requirement = requirementsById.get(row.requirement_id || deal?.requirement_id) || null
      const hot = hotByDeal.get(row.deal_id) || null
      const lease = leaseByDeal.get(row.deal_id) || (hot?.id ? leaseByHot.get(hot.id) : null) || null
      const listing = listingsById.get(row.listing_id || deal?.listing_id) || null
      const property = propertiesById.get(row.property_id || lease?.property_id || hot?.property_id || deal?.property_id || listing?.property_id) || null
      const company = companiesById.get(row.company_id || deal?.company_id || requirement?.company_id) || null
      const contact = contactsById.get(row.contact_id || deal?.contact_id || requirement?.contact_id || company?.primary_contact_id) || null
      const tenant = tenantsById.get(deal?.tenant_id || lease?.tenant_id || hot?.tenant_id || requirement?.tenant_id || row.company_id) || null
      const landlord = landlordsById.get(deal?.landlord_id || lease?.landlord_id || hot?.landlord_id || property?.landlord_id) || null
      const vacancy = vacanciesById.get(row.vacancy_id || lease?.vacancy_id || hot?.vacancy_id || deal?.vacancy_id || listing?.vacancy_id) || null
      const updatedAt = latestDate(recordUpdatedAt(row), recordUpdatedAt(lease), recordUpdatedAt(hot), recordUpdatedAt(deal), recordUpdatedAt(requirement), recordUpdatedAt(vacancy))
      const transaction = {
        id: row.id,
        organisationId: row.organisation_id || organisationId,
        organisationName,
        title: row.transaction_name || company?.company_name || company?.name || tenant?.name || deal?.deal_name || `Commercial transaction ${String(row.id).slice(0, 8)}`,
        transactionName: row.transaction_name || '',
        transactionType: row.transaction_type || (normalizeLower(deal?.deal_type) === 'sale' ? 'sale' : 'lease'),
        tenant,
        company: company || tenant,
        contact,
        landlord,
        property,
        vacancy,
        listing,
        requirement,
        deal,
        hot,
        lease,
        status: normalizeCommercialLifecycleStage('transactions', row.status, 'draft'),
        currentStage: normalizeCommercialLifecycleStage('transactions', row.status, 'draft'),
        brokerId: row.broker_id || pickBrokerId(lease, hot, deal, requirement, property),
        brokerName: brokerLabel(row.broker_id || pickBrokerId(lease, hot, deal, requirement, property), brokers),
        branchId: normalizeText(row.branch_id || lease?.branch_id || hot?.branch_id || deal?.branch_id || property?.branch_id),
        teamId: normalizeText(row.team_id || lease?.team_id || hot?.team_id || deal?.team_id || property?.team_id),
        value: toNumber(row.target_value || deal?.deal_value || lease?.total_value) || toNumber(hot?.monthly_rental) * Math.max(toNumber(hot?.lease_term_months || lease?.term_months || 12), 1),
        targetValue: toNumber(row.target_value || deal?.deal_value || 0),
        expectedCloseDate: row.expected_close_date || '',
        actualCloseDate: row.actual_close_date || '',
        createdAt: row.created_at || '',
        updatedAt: updatedAt ? updatedAt.toISOString() : '',
        notes: row.notes || deal?.notes || '',
        commissionRecord: commissionsByTransactionId.get(row.id) || null,
      }
      transaction.documents = documentsForTransaction(transaction, documents)
      transaction.documentRequests = documentRequestsForTransaction(transaction, documentRequests)
      transaction.activity = activityForTransaction(transaction, activity)
      transaction.timeline = buildCommercialTransactionTimeline(transaction, { activity: transaction.activity, documents })
      transaction.roleplayers = buildCommercialRoleplayers(transaction, brokers)
      transaction.commission = buildCommercialCommissionSnapshot(transaction)
      transaction.tasks = buildCommercialTasks(transaction, { documentRequests })
      transaction.notifications = buildCommercialNotifications(transaction, { documentRequests })
      return transaction
    }).sort((left, right) => asDate(right.updatedAt || 0) - asDate(left.updatedAt || 0))
  }

  const usedHotIds = new Set()
  const usedLeaseIds = new Set()
  const transactionRows = deals.map((deal) => {
    const hot = hotByDeal.get(deal.id) || null
    const lease = leaseByDeal.get(deal.id) || (hot?.id ? leaseByHot.get(hot.id) : null) || null
    if (hot?.id) usedHotIds.add(hot.id)
    if (lease?.id) usedLeaseIds.add(lease.id)
    return { deal, hot, lease }
  })

  headsOfTerms.forEach((hot) => {
    if (usedHotIds.has(hot.id)) return
    const lease = leaseByHot.get(hot.id) || null
    if (lease?.id) usedLeaseIds.add(lease.id)
    transactionRows.push({ deal: hot.deal_id ? dealsById.get(hot.deal_id) || null : null, hot, lease })
  })

  leases.forEach((lease) => {
    if (usedLeaseIds.has(lease.id)) return
    transactionRows.push({ deal: lease.deal_id ? dealsById.get(lease.deal_id) || null : null, hot: lease.heads_of_terms_id ? headsOfTerms.find((hot) => hot.id === lease.heads_of_terms_id) || null : null, lease })
  })

  return transactionRows.map(({ deal, hot, lease }) => {
    const property = propertiesById.get(lease?.property_id || hot?.property_id || deal?.property_id) || null
    const tenant = tenantsById.get(lease?.tenant_id || hot?.tenant_id || deal?.tenant_id) || null
    const landlord = landlordsById.get(lease?.landlord_id || hot?.landlord_id || deal?.landlord_id || property?.landlord_id) || null
    const vacancy = vacanciesById.get(lease?.vacancy_id || hot?.vacancy_id || deal?.vacancy_id) || null
    const requirement = requirementsById.get(deal?.requirement_id || hot?.requirement_id || lease?.requirement_id) || null
    const listing = listingsById.get(deal?.listing_id) || null
    const brokerId = pickBrokerId(lease, hot, deal, requirement, property)
    const primaryId = deal?.id || hot?.id || lease?.id
    const typePrefix = deal?.id ? 'deal' : hot?.id ? 'hot' : 'lease'
    const updatedAt = latestDate(recordUpdatedAt(lease), recordUpdatedAt(hot), recordUpdatedAt(deal), recordUpdatedAt(requirement), recordUpdatedAt(vacancy))
    const transaction = {
      id: `ctx-${typePrefix}-${primaryId}`,
      organisationId,
      organisationName,
      title: tenant?.name || deal?.deal_name || hot?.premises_description || lease?.lease_name || `Commercial transaction ${String(primaryId).slice(0, 8)}`,
      tenant,
      company: tenant,
      landlord,
      property,
      vacancy,
      listing,
      requirement,
      deal,
      hot,
      lease,
      status: deriveTransactionStatus({ deal, hot, lease }),
      brokerId,
      brokerName: brokerLabel(brokerId, brokers),
      branchId: normalizeText(lease?.branch_id || hot?.branch_id || deal?.branch_id || property?.branch_id),
      teamId: normalizeText(lease?.team_id || hot?.team_id || deal?.team_id || property?.team_id),
      value: toNumber(deal?.deal_value) || toNumber(lease?.total_value) || toNumber(hot?.monthly_rental) * Math.max(toNumber(hot?.lease_term_months || lease?.term_months || 12), 1),
      updatedAt: updatedAt ? updatedAt.toISOString() : '',
      commissionRecord: null,
    }
    transaction.documents = documentsForTransaction(transaction, documents)
    transaction.documentRequests = documentRequestsForTransaction(transaction, documentRequests)
    transaction.activity = activityForTransaction(transaction, activity)
    transaction.timeline = buildCommercialTransactionTimeline(transaction, { activity: transaction.activity, documents })
    transaction.roleplayers = buildCommercialRoleplayers(transaction, brokers)
    transaction.commission = buildCommercialCommissionSnapshot(transaction)
    transaction.tasks = buildCommercialTasks(transaction, { documentRequests })
    transaction.notifications = buildCommercialNotifications(transaction, { documentRequests })
    return transaction
  }).sort((left, right) => asDate(right.updatedAt || 0) - asDate(left.updatedAt || 0))
}

export function buildCommercialFinancialSummary(transactions = []) {
  const summary = transactions.reduce((totals, transaction) => {
    const commission = transaction.commission || buildCommercialCommissionSnapshot(transaction)
    const commissionStatus = normalizeLower(commission.status || 'projected')
    const transactionStatus = normalizeLower(transaction.status)
    const commissionValue = toNumber(commission.commissionValue)
    totals.pipelineValue += ['lost', 'cancelled'].includes(transactionStatus) ? 0 : toNumber(transaction.value)
    totals.projectedRevenue += commissionStatus === 'projected' && !['lost', 'cancelled'].includes(transactionStatus) ? commissionValue : 0
    totals.approvedRevenue += commissionStatus === 'approved' ? commissionValue : 0
    totals.paidRevenue += commissionStatus === 'paid' ? commissionValue : 0
    totals.activeLeaseValue += normalizeCommercialLifecycleStage('leases', transaction.lease?.status, '') === 'active' ? toNumber(commission.leaseValue) : 0
    const broker = transaction.brokerName || 'Unassigned'
    const brokerRow = totals.brokerProduction.get(broker) || { label: broker, value: 0, commission: 0, projectedRevenue: 0, approvedRevenue: 0, paidRevenue: 0, count: 0 }
    brokerRow.value += toNumber(transaction.value)
    brokerRow.commission += commissionValue
    brokerRow.projectedRevenue += commissionStatus === 'projected' && !['lost', 'cancelled'].includes(transactionStatus) ? commissionValue : 0
    brokerRow.approvedRevenue += commissionStatus === 'approved' ? commissionValue : 0
    brokerRow.paidRevenue += commissionStatus === 'paid' ? commissionValue : 0
    brokerRow.count += 1
    totals.brokerProduction.set(broker, brokerRow)
    const branch = transaction.branchId || 'Unassigned branch'
    const branchRow = totals.branchProduction.get(branch) || { label: branch, value: 0, commission: 0, projectedRevenue: 0, approvedRevenue: 0, paidRevenue: 0, count: 0 }
    branchRow.value += toNumber(transaction.value)
    branchRow.commission += commissionValue
    branchRow.projectedRevenue += commissionStatus === 'projected' && !['lost', 'cancelled'].includes(transactionStatus) ? commissionValue : 0
    branchRow.approvedRevenue += commissionStatus === 'approved' ? commissionValue : 0
    branchRow.paidRevenue += commissionStatus === 'paid' ? commissionValue : 0
    branchRow.count += 1
    totals.branchProduction.set(branch, branchRow)
    return totals
  }, {
    pipelineValue: 0,
    projectedRevenue: 0,
    approvedRevenue: 0,
    paidRevenue: 0,
    activeLeaseValue: 0,
    brokerProduction: new Map(),
    branchProduction: new Map(),
  })

  return {
    pipelineValue: summary.pipelineValue,
    projectedRevenue: summary.projectedRevenue,
    approvedRevenue: summary.approvedRevenue,
    paidRevenue: summary.paidRevenue,
    expectedCommission: summary.projectedRevenue,
    earnedCommission: summary.approvedRevenue + summary.paidRevenue,
    activeLeaseValue: summary.activeLeaseValue,
    brokerProduction: Array.from(summary.brokerProduction.values()).sort((left, right) => right.value - left.value).slice(0, 8),
    branchProduction: Array.from(summary.branchProduction.values()).sort((left, right) => right.value - left.value).slice(0, 8),
  }
}

export function buildCommercialRenewalRisk(transactions = []) {
  const today = startOfToday()
  return transactions
    .map((transaction) => {
      const expiryDate = transaction.lease?.lease_end_date
      const daysToExpiry = daysBetween(today, expiryDate)
      if (daysToExpiry === null || daysToExpiry < 0 || daysToExpiry > 365) return null
      return {
        id: transaction.id,
        title: transaction.title,
        property: transaction.property?.property_name || 'Property pending',
        tenant: transaction.tenant?.name || 'Tenant pending',
        broker: transaction.brokerName || 'Unassigned',
        expiryDate,
        daysToExpiry,
        risk: daysToExpiry <= 30 ? 'critical' : daysToExpiry <= 90 ? 'high' : daysToExpiry <= 180 ? 'medium' : 'watch',
        nextAction: daysToExpiry <= 180 ? 'Start renewal review' : 'Monitor lease',
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.daysToExpiry - right.daysToExpiry)
}

export function buildCommercialSearchIndex({
  transactions = [],
  companies = [],
  contacts = [],
  landlords = [],
  tenants = [],
  properties = [],
  deals = [],
  headsOfTerms = [],
  leases = [],
} = {}) {
  const rows = [
    ...transactions.map((row) => ({
      id: row.id,
      type: 'Commercial Transaction',
      title: row.title,
      detail: [row.company?.company_name || row.company?.name || row.tenant?.name, row.contact?.name, row.property?.property_name, row.vacancy?.vacancy_name, row.brokerName, row.status, row.id].filter(Boolean).join(' · '),
      to: `/commercial/transactions/${row.id}`,
    })),
    ...companies.map((row) => ({ id: `company-${row.id}`, type: 'Commercial Company', title: row.company_name || row.name, detail: [row.company_type, row.industry, row.email, row.phone].filter(Boolean).join(' · '), to: `/commercial/companies/${row.id}` })),
    ...contacts.map((row) => ({ id: `contact-${row.id}`, type: 'Commercial Contact', title: row.name || [row.first_name, row.last_name].filter(Boolean).join(' '), detail: [row.job_title, row.email, row.mobile || row.phone].filter(Boolean).join(' · '), to: `/commercial/contacts/${row.id}` })),
    ...properties.map((row) => ({ id: `property-${row.id}`, type: 'Commercial Property', title: row.property_name, detail: row.address || row.area || '', to: '/commercial/properties' })),
    ...tenants.map((row) => ({ id: `tenant-${row.id}`, type: 'Commercial Tenant', title: row.name, detail: row.industry || row.email || '', to: '/commercial/clients' })),
    ...landlords.map((row) => ({ id: `landlord-${row.id}`, type: 'Commercial Landlord', title: row.name, detail: row.email || row.phone || '', to: '/commercial/landlords' })),
    ...deals.map((row) => ({ id: `deal-${row.id}`, type: 'Commercial Deal', title: row.deal_name, detail: row.stage || row.status || '', to: '/commercial/deals/leasing' })),
    ...headsOfTerms.map((row) => ({ id: `hot-${row.id}`, type: 'Heads of Terms', title: row.premises_description || `HOT ${String(row.id).slice(0, 8)}`, detail: row.status || '', to: '/commercial/heads-of-terms' })),
    ...leases.map((row) => ({ id: `lease-${row.id}`, type: 'Commercial Lease', title: row.lease_name || `Lease ${String(row.id).slice(0, 8)}`, detail: row.status || '', to: '/commercial/leases' })),
  ]

  return rows
    .filter((row) => normalizeText(row.title))
    .map((row) => ({
      ...row,
      keywords: [row.title, row.detail, row.type].map(normalizeLower).join(' '),
    }))
}

export function searchCommercialIndex(index = [], query = '') {
  const needle = normalizeLower(query)
  if (!needle) return index.slice(0, 8)
  return index.filter((row) => row.keywords.includes(needle)).slice(0, 12)
}

function findCommercialTransactionByLegacyId(transactions = [], transactionId = '') {
  if (!String(transactionId).startsWith('ctx-')) return null
  const match = String(transactionId).match(/^ctx-([^-]+)-(.+)$/)
  const type = match?.[1] || ''
  const entityId = match?.[2] || ''
  if (!type || !entityId) return null
  if (type === 'deal') return transactions.find((row) => row.deal?.id === entityId || row.deal_id === entityId) || null
  if (type === 'hot') return transactions.find((row) => row.hot?.id === entityId) || null
  if (type === 'lease') return transactions.find((row) => row.lease?.id === entityId) || null
  return null
}

export async function getCommercialTransactionWorkspaceData(organisationId, transactionId) {
  const [
    transactionRows,
    commissions,
    companies,
    contacts,
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    listings,
    leases,
    vacancies,
    headsOfTerms,
    documents,
    documentRequests,
    activity,
  ] = await Promise.all([
    getCommercialTransactions(organisationId),
    getCommercialCommissions(organisationId),
    getCommercialCompanies(organisationId),
    getCommercialContacts(organisationId),
    getCommercialLandlords(organisationId),
    getCommercialTenants(organisationId),
    getCommercialProperties(organisationId),
    getCommercialRequirements(organisationId),
    getCommercialDeals(organisationId),
    getCommercialListings(organisationId),
    getCommercialLeases(organisationId),
    getCommercialVacancies(organisationId),
    getCommercialAllHeadsOfTerms(organisationId),
    getCommercialAllDocuments(organisationId),
    getCommercialAllDocumentRequests(organisationId),
    getCommercialRecentActivity(organisationId, 250),
  ])

  const transactions = buildCommercialTransactions({
    organisationId,
    transactions: transactionRows,
    commissions,
    companies,
    contacts,
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    listings,
    leases,
    vacancies,
    headsOfTerms,
    documents,
    documentRequests,
    activity,
  })

  const transaction = transactions.find((row) => row.id === transactionId) || findCommercialTransactionByLegacyId(transactions, transactionId) || null
  const scopedActivity = transaction ? await Promise.all([
    getCommercialActivity({ organisationId, entityType: 'commercial_transaction', entityId: transaction.id }),
    transaction.deal?.id ? getCommercialActivity({ organisationId, entityType: 'commercial_deal', entityId: transaction.deal.id }) : [],
    transaction.requirement?.id ? getCommercialActivity({ organisationId, entityType: 'commercial_requirement', entityId: transaction.requirement.id }) : [],
    transaction.vacancy?.id ? getCommercialActivity({ organisationId, entityType: 'commercial_vacancy', entityId: transaction.vacancy.id }) : [],
    transaction.listing?.id ? getCommercialActivity({ organisationId, entityType: 'commercial_listing', entityId: transaction.listing.id }) : [],
    transaction.hot?.id ? getCommercialActivity({ organisationId, entityType: 'commercial_heads_of_terms', entityId: transaction.hot.id }) : [],
    transaction.lease?.id ? getCommercialActivity({ organisationId, entityType: 'commercial_lease', entityId: transaction.lease.id }) : [],
  ]) : []
  const transactionWithScopedActivity = transaction ? {
    ...transaction,
    activity: (scopedActivity.flat ? scopedActivity.flat() : [].concat(...scopedActivity))
      .filter(Boolean)
      .sort((left, right) => asDate(right.created_at || 0) - asDate(left.created_at || 0)),
  } : null
  if (transactionWithScopedActivity) {
    transactionWithScopedActivity.timeline = buildCommercialTransactionTimeline(transactionWithScopedActivity, {
      activity: transactionWithScopedActivity.activity,
      documents,
    })
  }
  return {
    transaction: transactionWithScopedActivity,
    transactions,
    searchIndex: buildCommercialSearchIndex({ transactions, companies, contacts, landlords, tenants, properties, deals, headsOfTerms, leases }),
    financialSummary: buildCommercialFinancialSummary(transactions),
    renewalRisk: buildCommercialRenewalRisk(transactions),
  }
}
