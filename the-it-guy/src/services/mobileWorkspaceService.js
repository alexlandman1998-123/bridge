import { getAgentDemoTransactionRowsFromStorage } from '../lib/agentDemoTransactionStorage.js'

function normalizeText(value = '', fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function getDaysSince(value = null) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 0
  return Math.max(Math.floor((Date.now() - timestamp) / 86400000), 0)
}

function findAgentTransaction(id = '') {
  const targetId = String(id || '').trim()
  return getAgentDemoTransactionRowsFromStorage().find((row) => {
    const transaction = row.transaction || row
    return String(transaction.id || row.id || '').trim() === targetId
  }) || null
}

function buildParticipant(id, role, name, organisation = 'Arch9 Network') {
  return {
    id: `${id}-${role.toLowerCase().replace(/\s+/g, '-')}`,
    role,
    name,
    phone: '+27 82 000 0000',
    email: `${role.toLowerCase().replace(/\s+/g, '.')}@arch9.local`,
    organisation,
  }
}

function baseNotes(module, id) {
  return [
    {
      id: `${module}-${id}-note-1`,
      user: 'Arch9',
      date: 'Today',
      content: 'Mobile workspace opened. Add field notes here as work progresses.',
    },
  ]
}

function baseActivity(module, title) {
  return [
    { id: `${module}-activity-1`, module, title: 'Workspace updated', body: title, time: 'Now', actor: 'Arch9', tone: 'green' },
    { id: `${module}-activity-2`, module, title: 'Status checked', body: 'Mobile snapshot prepared', time: '1h ago', actor: 'Mobile', tone: 'blue' },
  ]
}

function baseTasks(module, title) {
  return [
    {
      id: `${module}-task-1`,
      title: 'Confirm next action',
      related: title,
      due: 'Today',
      priority: 'High',
      tone: 'red',
      module,
      owner: 'You',
    },
  ]
}

function buildWorkspaceMeta(module, label, owner = 'You', nextAction = 'Confirm next action') {
  return {
    moduleLabel: label,
    owner,
    nextAction,
    blocker: 'No hard blocker',
    sla: 'Due today',
    syncStatus: 'Live mobile snapshot',
  }
}

function buildTransactionWorkspace(id) {
  const row = findAgentTransaction(id)
  const transaction = row?.transaction || row || {}
  const title = normalizeText(transaction.property_address_line_1 || row?.unit?.address || row?.unit?.name, 'Residential Transaction')
  const stage = normalizeText(transaction.current_main_stage || transaction.stage, 'Finance Stage')
  const daysActive = getDaysSince(transaction.created_at || row?.created_at)
  return {
    ...buildWorkspaceMeta('transaction', 'Residential Transaction', normalizeText(transaction.assigned_agent, 'Assigned Agent'), 'Upload outstanding buyer documents'),
    module: 'transaction',
    title,
    reference: normalizeText(transaction.transaction_reference || transaction.matter_number || id, `TXN-${String(id).slice(0, 8)}`),
    status: stage,
    header: [
      { label: 'Transaction Type', value: normalizeText(transaction.transaction_type, 'Residential Sale') },
      { label: 'Days Active', value: daysActive || 1 },
      { label: 'Current Stage', value: stage },
    ],
    stages: ['Offer', 'OTP', 'Buyer Onboarding', 'Finance', 'Transfer', 'Registration'],
    currentStage: stage,
    priorityActions: [
      { id: 'buyer-id', title: 'Buyer ID Outstanding', body: 'Request the missing identity document.', tone: 'red', due: 'Today', owner: 'Buyer' },
      { id: 'fica', title: 'FICA Documents Missing', body: 'Follow up before finance can progress.', tone: 'amber', due: 'Tomorrow', owner: 'Agent' },
    ],
    participants: [
      buildParticipant(id, 'Agent', normalizeText(transaction.assigned_agent, 'Assigned Agent')),
      buildParticipant(id, 'Buyer', normalizeText(transaction.buyer_name, 'Buyer')),
      buildParticipant(id, 'Seller', 'Seller'),
      buildParticipant(id, 'Transfer Attorney', normalizeText(transaction.attorney, 'Transfer Attorney')),
      buildParticipant(id, 'Bond Attorney', 'Bond Attorney'),
      buildParticipant(id, 'Bond Originator', normalizeText(transaction.bond_originator, 'Bond Originator')),
    ],
    documents: [
      { label: 'Uploaded Documents', value: Number(transaction.uploaded_documents_count || 0) },
      { label: 'Outstanding Documents', value: Number(transaction.required_documents_missing || transaction.missing_documents_count || 0) },
      { label: 'Recently Uploaded', value: 0 },
    ],
    tasks: baseTasks('transaction', title),
    activity: baseActivity('transaction', title),
    notes: baseNotes('transaction', id),
    actions: ['Upload Document', 'Add Note', 'View Contacts', 'View Timeline'],
  }
}

function buildLeadWorkspace(id, commercial = false) {
  const title = commercial ? 'Commercial Lead' : 'Residential Lead'
  return {
    ...buildWorkspaceMeta(commercial ? 'commercial_lead' : 'lead', commercial ? 'Commercial Lead' : 'Residential Lead', commercial ? 'Assigned Broker' : 'Assigned Agent', commercial ? 'Qualify lead requirement' : 'Follow up with lead'),
    module: commercial ? 'commercial_lead' : 'lead',
    title,
    reference: `LEAD-${String(id).slice(0, 8)}`,
    status: commercial ? 'Qualified' : 'Contacted',
    header: commercial
      ? [
          { label: 'Lead Type', value: 'Tenant' },
          { label: 'Broker', value: 'Assigned Broker' },
          { label: 'Status', value: 'Qualified' },
        ]
      : [
          { label: 'Lead Name', value: 'New Buyer Lead' },
          { label: 'Source', value: 'Website' },
          { label: 'Assigned Agent', value: 'Assigned Agent' },
        ],
    stages: commercial ? ['Captured', 'Qualified', 'Requirement', 'Viewing', 'Deal'] : ['Captured', 'Contacted', 'Qualified', 'Viewing', 'Offer'],
    currentStage: commercial ? 'Qualified' : 'Contacted',
    priorityActions: [{ id: 'follow-up', title: 'Follow up required', body: 'Contact this lead today.', tone: 'amber', due: 'Today', owner: commercial ? 'Broker' : 'Agent' }],
    participants: [
      buildParticipant(id, commercial ? 'Broker' : 'Agent', commercial ? 'Assigned Broker' : 'Assigned Agent'),
      buildParticipant(id, 'Lead', commercial ? 'Commercial Contact' : 'Lead Contact'),
    ],
    documents: [],
    tasks: baseTasks(commercial ? 'commercial-lead' : 'lead', title),
    activity: baseActivity(commercial ? 'commercial-lead' : 'lead', title),
    notes: baseNotes(commercial ? 'commercial-lead' : 'lead', id),
    actions: commercial ? ['Qualify', 'Assign', 'Convert', 'Archive'] : ['Convert', 'Update Status', 'Assign', 'Archive'],
    contactActions: true,
  }
}

function buildMatterWorkspace(id) {
  const title = 'Matter Workspace'
  return {
    ...buildWorkspaceMeta('matter', 'Attorney Matter', 'Attorney', 'Review FICA milestone'),
    module: 'matter',
    title,
    reference: `MAT-${String(id).slice(0, 8)}`,
    status: 'FICA',
    header: [
      { label: 'Matter Type', value: 'Transfer' },
      { label: 'Days Open', value: 8 },
      { label: 'Current Milestone', value: 'FICA' },
    ],
    stages: ['Instruction', 'FICA', 'Drafting', 'Lodgement', 'Registration'],
    currentStage: 'FICA',
    priorityActions: [{ id: 'fica-review', title: 'FICA Review Required', body: 'Review uploaded client documents.', tone: 'amber', due: 'Today', owner: 'Attorney' }],
    participants: ['Buyer', 'Seller', 'Agent', 'Attorney', 'Originator'].map((role) => buildParticipant(id, role, role)),
    documents: [
      { label: 'Uploaded Documents', value: 0 },
      { label: 'Outstanding Documents', value: 1 },
      { label: 'Recently Uploaded', value: 0 },
    ],
    tasks: baseTasks('matter', title),
    activity: baseActivity('matter', title),
    notes: baseNotes('matter', id),
    actions: ['Update Milestone', 'Upload Document', 'Add Note', 'View Timeline'],
  }
}

function buildApplicationWorkspace(id) {
  const title = 'Bond Application'
  return {
    ...buildWorkspaceMeta('application', 'Bond Application', 'Bond Originator', 'Follow up bank responses'),
    module: 'application',
    title,
    reference: `APP-${String(id).slice(0, 8)}`,
    status: 'Banks',
    header: [
      { label: 'Applicant', value: 'Applicant' },
      { label: 'Property', value: 'Property Pending' },
      { label: 'Days Open', value: 5 },
    ],
    stages: ['Submitted', 'Banks', 'Offers', 'Accepted', 'Instructed', 'Registered'],
    currentStage: 'Banks',
    priorityActions: [{ id: 'bank-follow-up', title: 'Bank Responses Pending', body: 'Follow up on outstanding bank feedback.', tone: 'amber', due: 'Today', owner: 'Originator' }],
    participants: ['Applicant', 'Agent', 'Originator', 'Bank Consultant'].map((role) => buildParticipant(id, role, role)),
    documents: [
      { label: 'Banks Submitted', value: 3 },
      { label: 'Responses Received', value: 1 },
      { label: 'Offers Available', value: 0 },
    ],
    tasks: baseTasks('application', title),
    activity: baseActivity('application', title),
    notes: baseNotes('application', id),
    actions: ['Upload Document', 'Add Note', 'View Offers', 'Update Status'],
  }
}

function buildDealWorkspace(id) {
  const title = 'Commercial Deal'
  return {
    ...buildWorkspaceMeta('deal', 'Commercial Deal', 'Assigned Broker', 'Confirm heads of terms path'),
    module: 'deal',
    title,
    reference: `DEAL-${String(id).slice(0, 8)}`,
    status: 'Viewing',
    header: [
      { label: 'Type', value: 'Lease' },
      { label: 'Broker', value: 'Assigned Broker' },
      { label: 'Current Stage', value: 'Viewing' },
    ],
    stages: ['Lead', 'Requirement', 'Viewing', 'HOT', 'Lease', 'Occupied'],
    currentStage: 'Viewing',
    priorityActions: [{ id: 'hot-follow-up', title: 'Heads of Terms Follow-up', body: 'Confirm next commercial deal step.', tone: 'amber', due: 'Today', owner: 'Broker' }],
    participants: ['Landlord', 'Tenant', 'Broker', 'Attorney'].map((role) => buildParticipant(id, role, role)),
    documents: [
      { label: 'Uploaded Documents', value: 0 },
      { label: 'Outstanding Documents', value: 0 },
      { label: 'Recently Uploaded', value: 0 },
    ],
    tasks: baseTasks('deal', title),
    activity: baseActivity('deal', title),
    notes: baseNotes('deal', id),
    actions: ['Add Note', 'Update Stage', 'Upload Document', 'View Timeline'],
  }
}

function buildListingWorkspace(id) {
  const title = 'Commercial Listing'
  return {
    ...buildWorkspaceMeta('listing', 'Commercial Listing', 'Assigned Broker', 'Review new listing interest'),
    module: 'listing',
    title,
    reference: `LIST-${String(id).slice(0, 8)}`,
    status: 'Active',
    header: [
      { label: 'Asset Class', value: 'Office' },
      { label: 'Status', value: 'Active' },
      { label: 'Property', value: 'Listing Property' },
    ],
    stages: ['Draft', 'Active', 'Leads', 'Viewings', 'Offers'],
    currentStage: 'Active',
    priorityActions: [{ id: 'listing-follow-up', title: 'Listing Follow-up', body: 'Review new listing interest.', tone: 'green', due: 'This week', owner: 'Broker' }],
    participants: ['Landlord', 'Broker', 'Viewing Contact'].map((role) => buildParticipant(id, role, role)),
    documents: [
      { label: 'Views', value: 0 },
      { label: 'Leads', value: 0 },
      { label: 'Viewings', value: 0 },
      { label: 'Offers', value: 0 },
    ],
    tasks: baseTasks('listing', title),
    activity: baseActivity('listing', title),
    notes: baseNotes('listing', id),
    actions: ['Edit', 'Add Vacancy', 'Add Note', 'View Leads'],
  }
}

export function getMobileTransactionWorkspace(id) {
  return buildTransactionWorkspace(id)
}

export function getMobileLeadWorkspace(id) {
  return buildLeadWorkspace(id)
}

export function getMobileMatterWorkspace(id) {
  return buildMatterWorkspace(id)
}

export function getMobileApplicationWorkspace(id) {
  return buildApplicationWorkspace(id)
}

export function getMobileDealWorkspace(id) {
  return buildDealWorkspace(id)
}

export function getMobileCommercialLeadWorkspace(id) {
  return buildLeadWorkspace(id, true)
}

export function getMobileListingWorkspace(id) {
  return buildListingWorkspace(id)
}

export function getMobileSharedTasks() {
  return [
    { id: 'task-1', title: 'Confirm next action', related: 'Mobile transaction workspace', due: 'Today', priority: 'High', tone: 'red', module: 'transaction', owner: 'You', route: '/mobile/transaction/demo-transaction' },
    { id: 'task-2', title: 'Review outstanding documents', related: 'Matter documents', due: 'Tomorrow', priority: 'Medium', tone: 'amber', module: 'matter', owner: 'Attorney', route: '/mobile/matter/demo-matter' },
    { id: 'task-3', title: 'Follow up bank response', related: 'Bond application', due: 'Today', priority: 'Medium', tone: 'amber', module: 'application', owner: 'Originator', route: '/mobile/application/demo-application' },
  ]
}

export function getMobileSharedActivity() {
  return [
    { id: 'activity-1', module: 'transaction', title: 'Transaction Activity', body: 'Workspace status checked', time: 'Now', actor: 'Sarah Williams' },
    { id: 'activity-2', module: 'matter', title: 'Matter Activity', body: 'Document summary updated', time: '1h ago', actor: 'Attorney' },
    { id: 'activity-3', module: 'application', title: 'Application Activity', body: 'Bank queue reviewed', time: '2h ago', actor: 'Originator' },
    { id: 'activity-4', module: 'deal', title: 'Deal Activity', body: 'Commercial pipeline opened', time: '3h ago', actor: 'Broker' },
    { id: 'activity-5', module: 'lead', title: 'Lead Activity', body: 'Follow-up task created', time: '4h ago', actor: 'Arch9' },
  ]
}
