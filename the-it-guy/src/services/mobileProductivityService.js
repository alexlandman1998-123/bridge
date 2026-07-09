const STORAGE_KEYS = Object.freeze({
  uploads: 'arch9.mobile.uploads.v1',
  offlineDrafts: 'arch9.mobile.offlineDrafts.v1',
  createDrafts: 'arch9.mobile.createDrafts.v1',
  recentSearches: 'arch9.mobile.recentSearches.v1',
  notificationsEnabled: 'arch9.mobile.notificationsEnabled.v1',
})

export const MOBILE_CREATE_DRAFTS_STORAGE_KEY = STORAGE_KEYS.createDrafts
const MOBILE_CREATE_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7

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

function normalizeCreateDraftForm(form = {}) {
  return {
    primary: String(form.primary || ''),
    secondary: String(form.secondary || ''),
    notes: String(form.notes || ''),
  }
}

function hasCreateDraftContent(form = {}) {
  const normalized = normalizeCreateDraftForm(form)
  return Boolean(
    normalized.primary.trim() ||
      normalized.secondary.trim() ||
      normalized.notes.trim(),
  )
}

function createDraftIdentity(type = '', route = '') {
  const normalizedType = normalizeText(type, 'draft').toLowerCase()
  const normalizedRoute = normalizeText(route, '/mobile').toLowerCase()
  return `${normalizedType}:${normalizedRoute}`
}

function readCreateDraftMap() {
  if (!canUseStorage()) return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.createDrafts) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

function writeCreateDraftMap(map = {}) {
  if (!canUseStorage()) return
  const entries = Object.entries(map)
    .filter(([, draft]) => draft && typeof draft === 'object')
    .sort(([, left], [, right]) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .slice(0, 20)
  window.localStorage.setItem(STORAGE_KEYS.createDrafts, JSON.stringify(Object.fromEntries(entries)))
}

function isCreateDraftFresh(draft = {}, now = Date.now()) {
  const updatedAt = new Date(draft.updatedAt || draft.createdAt || 0).getTime()
  return Number.isFinite(updatedAt) && updatedAt > 0 && now - updatedAt <= MOBILE_CREATE_DRAFT_MAX_AGE_MS
}

function pruneCreateDraftMap(map = {}) {
  const now = Date.now()
  return Object.fromEntries(Object.entries(map).filter(([, draft]) => isCreateDraftFresh(draft, now)))
}

function nowLabel() {
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function onlineStatus() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
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
      scanQuality: source === 'camera' ? 'Camera scan' : source === 'photo' ? 'Photo import' : 'File upload',
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

export function getMobileScannerQueue() {
  return getMobileUploads()
    .filter((upload) => upload.source === 'camera' || upload.source === 'photo' || upload.processing?.scanQuality)
    .slice(0, 6)
    .map((upload) => ({
      id: upload.id,
      title: upload.documentType,
      module: upload.module,
      status: upload.status === 'queued' ? 'Queued for sync' : 'Ready',
      source: upload.processing?.scanQuality || 'Mobile scan',
      fileCount: upload.files?.length || 0,
      createdLabel: upload.createdLabel,
    }))
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
    recent: uploadedDocs.slice(0, 5),
    outstanding: [],
    requested: [],
    uploaded: uploadedDocs,
  }
}

export function getMobileNotifications() {
  return []
}

export function getMobileInboxThreads() {
  return []
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

export function getMobileCreateDrafts() {
  const map = pruneCreateDraftMap(readCreateDraftMap())
  writeCreateDraftMap(map)
  return Object.values(map).sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
}

export function getMobileCreateDraft({ type = '', route = '' } = {}) {
  const map = pruneCreateDraftMap(readCreateDraftMap())
  const draft = map[createDraftIdentity(type, route)] || null
  writeCreateDraftMap(map)
  return draft
}

export function saveMobileCreateDraft({
  type = '',
  route = '',
  module = '',
  title = '',
  form = {},
} = {}) {
  if (!canUseStorage()) return null
  const normalizedForm = normalizeCreateDraftForm(form)
  const key = createDraftIdentity(type, route)
  const map = pruneCreateDraftMap(readCreateDraftMap())

  if (!hasCreateDraftContent(normalizedForm)) {
    delete map[key]
    writeCreateDraftMap(map)
    return null
  }

  const previous = map[key] || {}
  const updatedAt = new Date().toISOString()
  const draft = {
    id: previous.id || `create-draft-${Date.now()}`,
    key,
    type: normalizeText(type, previous.type || 'draft'),
    title: normalizeText(title || normalizedForm.primary, previous.title || 'Unfinished capture'),
    module: normalizeText(module, previous.module || ''),
    route: normalizeText(route, previous.route || '/mobile'),
    form: normalizedForm,
    createdAt: previous.createdAt || updatedAt,
    updatedAt,
    updatedLabel: nowLabel(),
    status: 'unfinished',
  }
  map[key] = draft
  writeCreateDraftMap(map)
  return draft
}

export function clearMobileCreateDraft({ type = '', route = '' } = {}) {
  if (!canUseStorage()) return
  const map = readCreateDraftMap()
  delete map[createDraftIdentity(type, route)]
  writeCreateDraftMap(map)
}

export function subscribeToMobileCreateDrafts(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') return () => {}
  function handleStorage(event) {
    if (event.key === STORAGE_KEYS.createDrafts) {
      callback(getMobileCreateDrafts())
    }
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}

export function syncOfflineDrafts() {
  const drafts = getOfflineDrafts()
  writeStoredList(STORAGE_KEYS.offlineDrafts, [])
  return { syncedCount: drafts.length, syncedAt: nowLabel() }
}

export function getMobileFieldModeSnapshot({
  workspace = {},
  tasks = [],
  documents = [],
  priorityActions = [],
} = {}) {
  const drafts = getOfflineDrafts()
  const createDrafts = getMobileCreateDrafts()
  const uploads = getMobileUploads()
  const queuedUploads = uploads.filter((upload) => upload.status === 'queued')
  const outstandingDocs = documents.find((item) => String(item.label || '').toLowerCase().includes('outstanding'))
  const outstandingCount = Number(outstandingDocs?.value || 0)
  const highPriorityCount = priorityActions.filter((item) => item.tone === 'red').length
  const score = Math.max(32, Math.min(98, 92 - (tasks.length * 8) - (outstandingCount * 10) - (highPriorityCount * 12) - (queuedUploads.length * 6)))

  return {
    score,
    state: score >= 80 ? 'Field ready' : score >= 60 ? 'Needs attention' : 'Blocked in field',
    online: onlineStatus(),
    notificationsEnabled: getNotificationPreference(),
    pendingDrafts: drafts.length + createDrafts.length,
    unfinishedCaptures: createDrafts.length,
    queuedUploads: queuedUploads.length,
    recentScans: getMobileScannerQueue(),
    module: workspace.module || 'mobile',
    checks: [
      { label: 'Offline capture', status: drafts.length || createDrafts.length ? `${drafts.length + createDrafts.length} pending` : 'Ready' },
      { label: 'Document queue', status: queuedUploads.length ? `${queuedUploads.length} queued` : 'Clear' },
      { label: 'Push alerts', status: getNotificationPreference() ? 'Enabled' : 'Not enabled' },
      { label: 'Connection', status: onlineStatus() ? 'Online' : 'Offline' },
    ],
  }
}

function getOutstandingDocumentCount(documents = []) {
  const outstandingDocs = documents.find((item) => String(item.label || '').toLowerCase().includes('outstanding'))
  return Number(outstandingDocs?.value || 0)
}

export function getMobileCommandBrief({
  workspace = {},
  tasks = [],
  documents = [],
  priorityActions = [],
  activity = [],
} = {}) {
  const outstandingDocs = getOutstandingDocumentCount(documents)
  const highPriorityCount = priorityActions.filter((item) => item.tone === 'red').length
  const activeTasks = tasks.length
  const recentActivity = activity[0]?.title || 'No recent movement'
  const blocked = highPriorityCount > 0 || outstandingDocs > 0
  const commandScore = Math.max(18, Math.min(99, 90 - (activeTasks * 7) - (outstandingDocs * 9) - (highPriorityCount * 16)))
  const module = workspace.module || 'mobile'

  const recommendations = []
  if (highPriorityCount) recommendations.push({ id: 'resolve-priority', title: 'Resolve priority blocker', body: priorityActions[0]?.title || 'A high priority item needs attention.', tone: 'red', action: 'Open priority queue' })
  if (outstandingDocs) recommendations.push({ id: 'request-documents', title: 'Clear document dependency', body: `${outstandingDocs} document${outstandingDocs === 1 ? '' : 's'} still block progress.`, tone: 'amber', action: 'Open scanner hub' })
  if (activeTasks) recommendations.push({ id: 'complete-task', title: 'Complete next task', body: `${activeTasks} task${activeTasks === 1 ? '' : 's'} can be handled from mobile.`, tone: 'amber', action: 'Open tasks' })
  if (!recommendations.length) recommendations.push({ id: 'keep-moving', title: 'Keep workflow moving', body: 'No major blocker detected. Review the next stage or update the timeline.', tone: 'green', action: 'Update status' })

  return {
    score: commandScore,
    status: blocked ? 'Action recommended' : 'On track',
    headline: blocked ? 'This workspace needs a decision' : 'This workspace is moving cleanly',
    summary: `${workspace.moduleLabel || MODULE_LABELS[module] || 'Workspace'} · ${workspace.status || workspace.currentStage || 'Active'} · ${recentActivity}`,
    handoff: {
      label: blocked ? 'Handoff not ready' : 'Handoff ready',
      body: blocked ? 'Clear the highlighted dependency before progressing ownership.' : 'The next owner can receive a clean mobile handoff.',
    },
    recommendations: recommendations.slice(0, 3),
    automations: [
      {
        id: 'auto-reminder',
        title: 'Reminder automation',
        body: outstandingDocs ? 'Send document reminder if still outstanding by tomorrow.' : 'Remind owner if stage is unchanged tomorrow.',
        enabled: outstandingDocs > 0 || activeTasks > 0,
      },
      {
        id: 'auto-activity',
        title: 'Activity digest',
        body: 'Summarise new events for all role players at end of day.',
        enabled: activity.length > 0,
      },
      {
        id: 'auto-escalation',
        title: 'Escalation watch',
        body: highPriorityCount ? 'Escalate high-priority blocker if no action is logged.' : 'Monitor for stale stages and missed due dates.',
        enabled: highPriorityCount > 0,
      },
    ],
  }
}

export function getMobileLiveRoomBrief({
  workspace = {},
  tasks = [],
  documents = [],
  activity = [],
  communicationThread = {},
} = {}) {
  const outstandingDocs = getOutstandingDocumentCount(documents)
  const activeTasks = tasks.length
  const participants = Array.isArray(workspace.participants) ? workspace.participants : []
  const visibleMessages = Array.isArray(communicationThread.messages) ? communicationThread.messages : []
  const readiness = Math.max(24, Math.min(98, 88 - (activeTasks * 7) - (outstandingDocs * 10)))
  const nextOwner = tasks[0]?.owner || workspace.owner || workspace.participants?.[0]?.role || 'You'
  const nextAction = tasks[0]?.title || workspace.nextAction || 'Confirm next action'
  const moduleLabel = workspace.moduleLabel || MODULE_LABELS[workspace.module] || 'Workspace'
  const recentActivity = activity[0]?.title || 'No recent room activity'

  return {
    readiness,
    state: readiness >= 82 ? 'Live room is aligned' : readiness >= 62 ? 'Room needs one update' : 'Room needs attention',
    summary: `${moduleLabel} · ${participants.length} role players · ${visibleMessages.length} shared update${visibleMessages.length === 1 ? '' : 's'} · ${recentActivity}`,
    nextOwner,
    nextAction,
    clientUpdate: {
      label: readiness >= 82 ? 'Client-safe update ready' : 'Draft a client-safe update',
      body: outstandingDocs
        ? `${outstandingDocs} document${outstandingDocs === 1 ? '' : 's'} should be requested before a broad update is sent.`
        : `Share the latest ${workspace.status || workspace.currentStage || 'progress'} status without exposing internal notes.`,
    },
    lanes: [
      {
        id: 'decision',
        label: 'Decision',
        value: nextAction,
        tone: activeTasks ? 'amber' : 'green',
      },
      {
        id: 'documents',
        label: 'Documents',
        value: outstandingDocs ? `${outstandingDocs} due` : 'Clear',
        tone: outstandingDocs ? 'red' : 'green',
      },
      {
        id: 'communication',
        label: 'Comms',
        value: visibleMessages.length ? `${visibleMessages.length} shared` : 'No shared updates',
        tone: visibleMessages.length ? 'green' : 'amber',
      },
    ],
    accountability: participants.slice(0, 4).map((participant, index) => ({
      id: participant.id || `${participant.role}-${index}`,
      name: participant.name || participant.role,
      role: participant.role || 'Role player',
      state: index === 0 ? 'Driving next step' : index === 1 && outstandingDocs ? 'Input required' : 'Informed',
    })),
    suggestedUpdates: [
      {
        id: 'client-progress',
        label: 'Client Progress',
        text: `We are currently at ${workspace.status || workspace.currentStage || 'the active stage'} and the next step is ${nextAction.toLowerCase()}.`,
      },
      {
        id: 'role-handoff',
        label: 'Role Handoff',
        text: `${nextOwner} is responsible for the next action. We will update the room when it is complete.`,
      },
      {
        id: 'document-follow-up',
        label: 'Document Follow-up',
        text: outstandingDocs ? `There ${outstandingDocs === 1 ? 'is' : 'are'} ${outstandingDocs} outstanding document${outstandingDocs === 1 ? '' : 's'} needed to keep this moving.` : 'Document requirements are currently clear.',
      },
    ],
  }
}

export function getMobileHandoffReview({
  workspace = {},
  tasks = [],
  documents = [],
  activity = [],
  priorityActions = [],
  communicationThread = {},
} = {}) {
  const outstandingDocs = getOutstandingDocumentCount(documents)
  const activeTasks = tasks.length
  const redActions = priorityActions.filter((item) => item.tone === 'red').length
  const hasClientUpdate = activity.some((item) => String(item.title || '').toLowerCase().includes('shared update'))
    || Boolean(communicationThread.messages?.length)
  const stageLabel = workspace.status || workspace.currentStage || 'Active'
  const score = Math.max(22, Math.min(99, 94 - (outstandingDocs * 12) - (activeTasks * 8) - (redActions * 18) - (hasClientUpdate ? 0 : 6)))

  const gates = [
    {
      id: 'decision',
      label: 'Decision Path',
      status: redActions ? 'Blocked' : activeTasks ? 'Review' : 'Clear',
      body: redActions ? 'A priority decision still needs attention.' : activeTasks ? `${activeTasks} task${activeTasks === 1 ? '' : 's'} should be confirmed before handoff.` : 'No decision blocker is visible.',
      tone: redActions ? 'red' : activeTasks ? 'amber' : 'green',
    },
    {
      id: 'documents',
      label: 'Document Pack',
      status: outstandingDocs ? 'Incomplete' : 'Ready',
      body: outstandingDocs ? `${outstandingDocs} outstanding document${outstandingDocs === 1 ? '' : 's'} remain.` : 'Document indicators are clear for this mobile view.',
      tone: outstandingDocs ? 'red' : 'green',
    },
    {
      id: 'client-update',
      label: 'Client Update',
      status: hasClientUpdate ? 'Prepared' : 'Recommended',
      body: hasClientUpdate ? 'A shared update is available for handoff context.' : 'Prepare a client-safe update before external handoff.',
      tone: hasClientUpdate ? 'green' : 'amber',
    },
  ]

  return {
    score,
    state: score >= 86 ? 'Ready for clean handoff' : score >= 66 ? 'Handoff needs review' : 'Handoff blocked',
    stageLabel,
    owner: workspace.owner || tasks[0]?.owner || 'You',
    certificate: score >= 86 ? 'Clean mobile handoff' : score >= 66 ? 'Conditional mobile handoff' : 'Do not hand off yet',
    summary: `${workspace.moduleLabel || MODULE_LABELS[workspace.module] || 'Workspace'} · ${stageLabel} · ${activity.length} activity item${activity.length === 1 ? '' : 's'}`,
    gates,
    packet: [
      { label: 'Latest stage', value: stageLabel },
      { label: 'Next owner', value: workspace.owner || tasks[0]?.owner || 'You' },
      { label: 'Next action', value: tasks[0]?.title || workspace.nextAction || 'Confirm next action' },
      { label: 'Evidence', value: outstandingDocs ? `${outstandingDocs} docs due` : 'Documents clear' },
    ],
    audit: [
      { label: 'Mobile state', value: onlineStatus() ? 'Online' : 'Offline-ready' },
      { label: 'Room update', value: hasClientUpdate ? 'Prepared' : 'Pending' },
      { label: 'Review level', value: score >= 86 ? 'Standard' : score >= 66 ? 'Supervisor review' : 'Blocker review' },
    ],
  }
}

export function getNotificationPreference() {
  if (!canUseStorage()) return false
  return window.localStorage.getItem(STORAGE_KEYS.notificationsEnabled) === 'true'
}

export function setNotificationPreference(enabled) {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEYS.notificationsEnabled, enabled ? 'true' : 'false')
}

export function getSearchIndex() {
  return [
    {
      id: 'search-transaction-demo',
      title: 'Residential Transaction',
      type: 'Transaction',
      description: 'Finance stage, buyer documents, role players and activity.',
      to: '/mobile/transaction/demo-transaction',
    },
    {
      id: 'search-lead-demo',
      title: 'Residential Lead',
      type: 'Lead',
      description: 'Contacted lead with follow-up actions.',
      to: '/mobile/lead/demo-lead',
    },
    {
      id: 'search-matter-demo',
      title: 'Matter Workspace',
      type: 'Matter',
      description: 'FICA milestone, attorney participants and documents.',
      to: '/mobile/matter/demo-matter',
    },
    {
      id: 'search-application-demo',
      title: 'Bond Application',
      type: 'Application',
      description: 'Bank responses, offers and originator tasks.',
      to: '/mobile/application/demo-application',
    },
    {
      id: 'search-deal-demo',
      title: 'Commercial Deal',
      type: 'Deal',
      description: 'Viewing stage, heads of terms and deal parties.',
      to: '/mobile/deal/demo-deal',
    },
    {
      id: 'search-listing-demo',
      title: 'Commercial Listing',
      type: 'Listing',
      description: 'Active listing metrics, leads and viewing actions.',
      to: '/mobile/listing/demo-listing',
    },
    {
      id: 'search-documents',
      title: 'Documents',
      type: 'Module',
      description: 'Scanner queue, uploads and requested documents.',
      to: '/mobile/documents',
    },
    {
      id: 'search-tasks',
      title: 'Tasks',
      type: 'Module',
      description: 'Complete, snooze or open mobile work items.',
      to: '/mobile/tasks',
    },
    {
      id: 'search-command-brief',
      title: 'Command Brief',
      type: 'Mobile Intelligence',
      description: 'Risk signals, handoff readiness and suggested automations.',
      to: '/mobile/transaction/demo-transaction',
    },
    {
      id: 'search-live-room',
      title: 'Live Transaction Room',
      type: 'Mobile Collaboration',
      description: 'Role-player accountability, client-safe updates and room readiness.',
      to: '/mobile/transaction/demo-transaction',
    },
    {
      id: 'search-handoff-review',
      title: 'Handoff Review',
      type: 'Mobile Governance',
      description: 'Readiness gates, audit signals and clean handoff approval.',
      to: '/mobile/transaction/demo-transaction',
    },
  ]
}

export function searchMobile(query = '', workspace = {}) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return getSearchIndex(workspace).slice(0, 6)
  const queryTokens = needle.split(/\s+/).filter(Boolean)
  return getSearchIndex(workspace).filter((item) => {
    const haystack = [item.title, item.type, item.description].join(' ').toLowerCase()
    return haystack.includes(needle) || queryTokens.every((token) => haystack.includes(token))
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
