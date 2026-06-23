const STORAGE_KEYS = Object.freeze({
  uploads: 'arch9.mobile.uploads.v1',
  offlineDrafts: 'arch9.mobile.offlineDrafts.v1',
  recentSearches: 'arch9.mobile.recentSearches.v1',
  notificationsEnabled: 'arch9.mobile.notificationsEnabled.v1',
})

const MODULE_LABELS = Object.freeze({
  transaction: 'Transaction',
  lead: 'Lead',
  commercial_lead: 'Commercial Lead',
  matter: 'Matter',
  application: 'Application',
  deal: 'Deal',
  listing: 'Listing',
})

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readStoredList(key) {
  if (!canUseStorage()) return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredList(key, list) {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(list))
}

function normalizeText(value = '', fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function nowLabel() {
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function roleCategory(workspace = {}) {
  const role = normalizeText(workspace.role || workspace.baseRole).toLowerCase()
  const type = normalizeText(workspace.workspaceType).toLowerCase()
  if (role.includes('attorney')) return 'attorney'
  if (role.includes('bond')) return 'bond_originator'
  if (role.includes('commercial') || type.includes('commercial')) return 'commercial'
  return 'agent'
}

export function getUploadOptionsForModule(module = '') {
  const normalized = String(module || '').toLowerCase()
  if (normalized === 'matter') return ['Transfer documents', 'Lodgement documents', 'Registration documents']
  if (normalized === 'application') return ['Bank requirements', 'Approval documents', 'Applicant documents']
  if (normalized === 'deal') return ['HOT documents', 'Lease agreements', 'Supporting documents']
  if (normalized === 'listing') return ['Listing photos', 'Mandate documents', 'Supporting documents']
  if (normalized.includes('lead')) return ['ID', 'Proof of Address', 'Financial documents']
  return ['OTP', 'FICA', 'Supporting docs']
}

export function createMobileUploadRecord({
  files = [],
  source = 'file',
  module = 'transaction',
  workspaceId = '',
  documentType = '',
} = {}) {
  const fileList = Array.from(files || [])
  const record = {
    id: `upload-${Date.now()}`,
    module,
    workspaceId,
    source,
    documentType: normalizeText(documentType, getUploadOptionsForModule(module)[0]),
    status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'queued' : 'uploaded',
    createdAt: new Date().toISOString(),
    createdLabel: nowLabel(),
    files: fileList.map((file) => ({
      name: normalizeText(file.name, source === 'camera' ? 'Camera photo' : 'Mobile upload'),
      type: normalizeText(file.type, 'application/octet-stream'),
      size: Number(file.size || 0),
    })),
    processing: {
      compressed: true,
      optimized: true,
      pdfReady: fileList.length > 1,
    },
  }
  const uploads = [record, ...readStoredList(STORAGE_KEYS.uploads)].slice(0, 40)
  writeStoredList(STORAGE_KEYS.uploads, uploads)
  if (record.status === 'queued') {
    addOfflineDraft({
      type: 'Document Queue',
      title: record.documentType,
      module,
      workspaceId,
      payload: { uploadId: record.id },
    })
  }
  return record
}

export function getMobileUploads() {
  return readStoredList(STORAGE_KEYS.uploads)
}

export function getMobileDocumentCentre() {
  const uploads = getMobileUploads()
  const uploadedDocs = uploads.map((upload) => ({
    id: upload.id,
    title: upload.documentType,
    related: MODULE_LABELS[upload.module] || 'Workspace',
    module: upload.module,
    status: upload.status === 'queued' ? 'Queued' : 'Uploaded',
    date: upload.createdLabel,
    actions: ['View', 'Download', 'Share'],
  }))

  return {
    filters: ['All', 'Transaction', 'Matter', 'Application', 'Deal'],
    recent: [
      ...uploadedDocs.slice(0, 5),
      { id: 'recent-otp', title: 'Signed OTP', related: 'Transaction', module: 'transaction', status: 'Uploaded', date: 'Today', actions: ['View', 'Download', 'Share'] },
      { id: 'recent-fica', title: 'Buyer FICA', related: 'Transaction', module: 'transaction', status: 'Uploaded', date: 'Yesterday', actions: ['View', 'Download', 'Share'] },
    ],
    outstanding: [
      { id: 'outstanding-id', title: 'Buyer ID', related: 'Transaction', module: 'transaction', status: 'Outstanding', date: 'Due today', actions: ['Upload'] },
      { id: 'outstanding-bank', title: 'Bank Requirement', related: 'Application', module: 'application', status: 'Requested', date: 'Due tomorrow', actions: ['Upload'] },
    ],
    requested: [
      { id: 'requested-fica', title: 'FICA documents', related: 'Matter', module: 'matter', status: 'Requested', date: 'Today', actions: ['Upload'] },
      { id: 'requested-hot', title: 'HOT signature page', related: 'Deal', module: 'deal', status: 'Requested', date: 'Today', actions: ['Upload'] },
    ],
    uploaded: uploadedDocs,
  }
}

export function getMobileNotifications(workspace = {}) {
  const category = roleCategory(workspace)
  const shared = [
    { id: 'notification-transaction', title: 'Document uploaded', body: 'Buyer uploaded ID', time: 'Now', module: 'transaction', to: '/mobile/transaction/demo-transaction', unread: true },
    { id: 'notification-registration', title: 'Registration complete', body: 'Transfer reached registration', time: '18m', module: 'matter', to: '/mobile/matter/demo-matter', unread: true },
  ]
  if (category === 'attorney') {
    return [
      { id: 'notification-instruction', title: 'New instruction received', body: 'Open the matter and update the milestone.', time: 'Now', module: 'matter', to: '/mobile/matter/demo-matter', unread: true },
      ...shared,
    ]
  }
  if (category === 'bond_originator') {
    return [
      { id: 'notification-bank-offer', title: 'Bank offer received', body: 'Review the offer and update application status.', time: 'Now', module: 'application', to: '/mobile/application/demo-application', unread: true },
      ...shared,
    ]
  }
  if (category === 'commercial') {
    return [
      { id: 'notification-viewing', title: 'Viewing scheduled', body: 'Confirm attendance for the deal.', time: 'Now', module: 'deal', to: '/mobile/deal/demo-deal', unread: true },
      { id: 'notification-hot', title: 'HOT signed', body: 'Upload the signed commercial document.', time: '22m', module: 'deal', to: '/mobile/deal/demo-deal', unread: false },
    ]
  }
  return [
    { id: 'notification-bond', title: 'Bond approved', body: 'Finance can move to the next stage.', time: 'Now', module: 'transaction', to: '/mobile/transaction/demo-transaction', unread: true },
    { id: 'notification-lodged', title: 'Transfer lodged', body: 'Attorney updated the matter.', time: '14m', module: 'matter', to: '/mobile/matter/demo-matter', unread: true },
    ...shared,
  ]
}

export function getMobileInboxThreads() {
  return [
    {
      id: 'thread-transaction',
      title: '12 Oak Street',
      subtitle: 'Transaction timeline',
      module: 'transaction',
      to: '/mobile/transaction/demo-transaction',
      messages: [
        { id: 'msg-1', type: 'System Message', author: 'Arch9', time: 'Now', body: 'Document Requested: Buyer FICA' },
        { id: 'msg-2', type: 'Internal Note', author: 'Agent', time: '24m', body: 'Attorney asked for buyer confirmation before lodgement.' },
      ],
    },
    {
      id: 'thread-application',
      title: 'Bond Application',
      subtitle: 'Originator updates',
      module: 'application',
      to: '/mobile/application/demo-application',
      messages: [
        { id: 'msg-3', type: 'System Message', author: 'Bank Queue', time: '1h', body: 'Bank offer received and ready for review.' },
      ],
    },
  ]
}

export function getSmartActionsForWorkspace(workspace = {}, workspaceContext = {}) {
  const module = workspace.module || 'transaction'
  const role = roleCategory(workspaceContext)
  const stage = normalizeText(workspace.currentStage || workspace.status).toLowerCase()
  const actions = []

  if (module === 'transaction' && stage.includes('buyer')) {
    actions.push({ key: 'send-onboarding', label: 'Send Onboarding', type: 'onboarding' })
    actions.push({ key: 'upload-document', label: 'Upload Document', type: 'upload' })
    actions.push({ key: 'contact-buyer', label: 'Contact Buyer', type: 'contact' })
  } else if (module === 'transaction' && stage.includes('finance')) {
    actions.push({ key: 'contact-originator', label: 'Contact Originator', type: 'contact' })
    actions.push({ key: 'upload-requirement', label: 'Upload Requirement', type: 'upload' })
    actions.push({ key: 'view-status', label: 'Update Status', type: 'status' })
  } else if (module === 'matter') {
    actions.push({ key: 'update-milestone', label: 'Update Milestone', type: 'status' })
    actions.push({ key: 'request-document', label: 'Request Document', type: 'request_document' })
    actions.push({ key: 'contact-agent', label: 'Contact Agent', type: 'contact' })
  } else if (module === 'application') {
    actions.push({ key: 'submit-bank', label: 'Submit Bank', type: 'status' })
    actions.push({ key: 'request-document', label: 'Request Document', type: 'request_document' })
    actions.push({ key: 'upload-document', label: 'Upload Document', type: 'upload' })
  } else if (module === 'deal') {
    actions.push({ key: 'viewing-update', label: 'Viewing Update', type: 'status' })
    actions.push({ key: 'hot-tracking', label: 'Track HOT', type: 'status' })
    actions.push({ key: 'upload-document', label: 'Upload Document', type: 'upload' })
  } else if (module === 'listing') {
    actions.push({ key: 'photo-upload', label: 'Photo Upload', type: 'upload' })
    actions.push({ key: 'lead-tracking', label: 'View Leads', type: 'status' })
    actions.push({ key: 'status-update', label: 'Update Status', type: 'status' })
  } else {
    actions.push({ key: 'upload-document', label: 'Upload Document', type: 'upload' })
    actions.push({ key: 'update-status', label: 'Update Status', type: 'status' })
    actions.push({ key: role === 'commercial' ? 'contact-broker' : 'contact-role-player', label: 'Contact', type: 'contact' })
  }

  if (Array.isArray(workspace.tasks) && workspace.tasks.length) {
    actions.unshift({ key: 'complete-task', label: 'Complete Task', type: 'task' })
  }
  return actions.slice(0, 4)
}

export function addOfflineDraft({ type = 'Note', title = '', module = '', workspaceId = '', payload = {} } = {}) {
  const draft = {
    id: `draft-${Date.now()}`,
    type,
    title: normalizeText(title, type),
    module,
    workspaceId,
    payload,
    createdAt: new Date().toISOString(),
    createdLabel: nowLabel(),
    status: 'pending',
  }
  writeStoredList(STORAGE_KEYS.offlineDrafts, [draft, ...readStoredList(STORAGE_KEYS.offlineDrafts)].slice(0, 30))
  return draft
}

export function getOfflineDrafts() {
  return readStoredList(STORAGE_KEYS.offlineDrafts)
}

export function syncOfflineDrafts() {
  const drafts = getOfflineDrafts()
  writeStoredList(STORAGE_KEYS.offlineDrafts, [])
  return { syncedCount: drafts.length, syncedAt: nowLabel() }
}

export function getNotificationPreference() {
  if (!canUseStorage()) return false
  return window.localStorage.getItem(STORAGE_KEYS.notificationsEnabled) === 'true'
}

export function setNotificationPreference(enabled) {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEYS.notificationsEnabled, enabled ? 'true' : 'false')
}

export function getSearchIndex(workspace = {}) {
  const category = roleCategory(workspace)
  const common = [
    { id: 'client-buyer', title: 'Buyer Client', type: 'Clients', description: 'Residential buyer', to: '/mobile/lead/demo-lead' },
    { id: 'property-oak', title: '12 Oak Street', type: 'Properties', description: 'Active property workspace', to: '/mobile/transaction/demo-transaction' },
  ]
  if (category === 'attorney') {
    return [
      { id: 'matter-transfer', title: 'Transfer Matter', type: 'Matters', description: 'FICA milestone', to: '/mobile/matter/demo-matter' },
      ...common,
    ]
  }
  if (category === 'bond_originator') {
    return [
      { id: 'application-bond', title: 'Bond Application', type: 'Applications', description: 'Banks stage', to: '/mobile/application/demo-application' },
      { id: 'applicant-main', title: 'Applicant', type: 'Applicants', description: 'Finance readiness', to: '/mobile/application/demo-application' },
      ...common,
    ]
  }
  if (category === 'commercial') {
    return [
      { id: 'deal-lease', title: 'Commercial Deal', type: 'Deals', description: 'Viewing stage', to: '/mobile/deal/demo-deal' },
      { id: 'listing-office', title: 'Office Listing', type: 'Properties', description: 'Active commercial listing', to: '/mobile/listing/demo-listing' },
      { id: 'tenant-contact', title: 'Tenant Contact', type: 'Tenants', description: 'Commercial lead', to: '/mobile/commercial-lead/demo-commercial-lead' },
    ]
  }
  return [
    { id: 'transaction-oak', title: '12 Oak Street', type: 'Transactions', description: 'Finance stage', to: '/mobile/transaction/demo-transaction' },
    { id: 'lead-buyer', title: 'New Buyer Lead', type: 'Leads', description: 'Website lead', to: '/mobile/lead/demo-lead' },
    { id: 'listing-sale', title: 'Residential Listing', type: 'Listings', description: 'Seller onboarding', to: '/mobile/listing/demo-listing' },
    ...common,
  ]
}

export function searchMobile(query = '', workspace = {}) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return getSearchIndex(workspace).slice(0, 6)
  return getSearchIndex(workspace).filter((item) => {
    return [item.title, item.type, item.description].join(' ').toLowerCase().includes(needle)
  })
}

export function getRecentSearches() {
  return readStoredList(STORAGE_KEYS.recentSearches)
}

export function saveRecentSearch(query = '') {
  const text = String(query || '').trim()
  if (!text) return getRecentSearches()
  const searches = [text, ...getRecentSearches().filter((item) => item !== text)].slice(0, 6)
  writeStoredList(STORAGE_KEYS.recentSearches, searches)
  return searches
}
