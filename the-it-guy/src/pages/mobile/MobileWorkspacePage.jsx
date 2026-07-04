import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CheckCircle2,
  Clock3,
  ContactRound,
  FileText,
  FileUp,
  ListChecks,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  MoreHorizontal,
  Phone,
  Plus,
  StickyNote,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MobileCommandBriefPanel, MobileFieldModePanel, MobileHandoffReviewPanel, MobileLiveRoomPanel, MobileOfflineDraftPanel, MobileSmartActionBar, MobileUploadSheet } from '../../components/mobile-shell/MobileProductivity'
import { MobileCard, MobileEmptyState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates'
import { trackMobileMetric } from '../../services/observability/monitoring'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  addOfflineDraft,
  getMobileInboxThreads,
  getSmartActionsForWorkspace,
} from '../../services/mobileProductivityService'
import {
  getMobileApplicationWorkspace,
  getMobileCommercialLeadWorkspace,
  getMobileDealWorkspace,
  getMobileLeadWorkspace,
  getMobileListingWorkspace,
  getMobileMatterWorkspace,
  getMobileTransactionWorkspace,
} from '../../services/mobileWorkspaceService'

const LOADERS = {
  transaction: getMobileTransactionWorkspace,
  lead: getMobileLeadWorkspace,
  matter: getMobileMatterWorkspace,
  application: getMobileApplicationWorkspace,
  deal: getMobileDealWorkspace,
  commercialLead: getMobileCommercialLeadWorkspace,
  listing: getMobileListingWorkspace,
}

const TONE_CLASSES = {
  red: 'border-[#f3d4d1] bg-[#fff8f7] text-[#b42318]',
  amber: 'border-[#f2dfbd] bg-[#fffaf1] text-[#b7791f]',
  green: 'border-[#d9eadf] bg-[#f5fbf7] text-[#1f7a5a]',
}

const TONE_DOTS = {
  red: 'bg-[#ef4444]',
  amber: 'bg-[#f59e0b]',
  green: 'bg-[#1f7a5a]',
  blue: 'bg-[#2563eb]',
}

const MODULE_ACCENTS = {
  transaction: { label: 'Transaction', color: '#1f7a5a', soft: '#e8f6ef' },
  lead: { label: 'Lead', color: '#7c5a12', soft: '#fff6e5' },
  commercial_lead: { label: 'Commercial Lead', color: '#7c5a12', soft: '#fff6e5' },
  matter: { label: 'Matter', color: '#145ea8', soft: '#e8f1fb' },
  application: { label: 'Application', color: '#6146a6', soft: '#f0ebff' },
  deal: { label: 'Deal', color: '#9a4d17', soft: '#fff1e7' },
  listing: { label: 'Listing', color: '#274c69', soft: '#edf3f8' },
}

function stageState(stages = [], currentStage = '', index) {
  const currentIndex = stages.findIndex((stage) => stage.toLowerCase() === String(currentStage || '').toLowerCase())
  if (currentIndex < 0) return index === 0 ? 'current' : 'future'
  if (index < currentIndex) return 'complete'
  if (index === currentIndex) return 'current'
  return 'future'
}

function getAccent(workspace = {}) {
  return MODULE_ACCENTS[workspace.module] || MODULE_ACCENTS.transaction
}

function getOutstandingDocuments(documents = []) {
  const item = documents.find((entry) => String(entry.label || '').toLowerCase().includes('outstanding'))
  return Number(item?.value || 0)
}

function SectionHeader({ title, action = '', onAction = null }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[19px] font-semibold text-[#10243a]">{title}</h2>
      {action ? (
        <button type="button" className="min-h-11 rounded-full bg-white px-3 text-[12px] font-semibold text-[#60758d] shadow-[0_8px_18px_rgba(15,23,42,0.05)]" onClick={onAction || undefined}>
          {action}
        </button>
      ) : null}
    </div>
  )
}

function trackWorkspaceEvent(eventName, workspaceContext, workspace, metadata = {}) {
  void trackMobileMetric(eventName, {
    userId: workspaceContext.profile?.id || '',
    workspaceId: workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id || '',
    route: `/mobile/${workspace.module}`,
    metadata: {
      module: workspace.module,
      reference: workspace.reference,
      ...metadata,
    },
  })
}

export default function MobileWorkspacePage({ workspaceType }) {
  const params = useParams()
  const workspaceContext = useWorkspace()
  const workspaceId = params.workspaceId || params.id || ''
  const loader = useMemo(() => LOADERS[workspaceType] || getMobileTransactionWorkspace, [workspaceType])
  const workspace = useMemo(() => loader(workspaceId), [loader, workspaceId])
  const workspaceKey = `${workspace.module}:${workspaceId}`
  const [taskOverrides, setTaskOverrides] = useState({})
  const [noteOverrides, setNoteOverrides] = useState({})
  const [documentOverrides, setDocumentOverrides] = useState({})
  const [activityOverrides, setActivityOverrides] = useState({})
  const [statusOverrides, setStatusOverrides] = useState({})
  const [uploadOpen, setUploadOpen] = useState(false)
  const tasks = useMemo(() => taskOverrides[workspaceKey] || workspace.tasks || [], [taskOverrides, workspace.tasks, workspaceKey])
  const notes = useMemo(() => noteOverrides[workspaceKey] || workspace.notes || [], [noteOverrides, workspace.notes, workspaceKey])
  const documents = useMemo(() => documentOverrides[workspaceKey] || workspace.documents || [], [documentOverrides, workspace.documents, workspaceKey])
  const activity = useMemo(() => activityOverrides[workspaceKey] || workspace.activity || [], [activityOverrides, workspace.activity, workspaceKey])
  const displayStatus = statusOverrides[workspaceKey] || workspace.status
  const smartActions = useMemo(() => getSmartActionsForWorkspace({ ...workspace, tasks, status: displayStatus, currentStage: displayStatus }, workspaceContext), [displayStatus, tasks, workspace, workspaceContext])
  const communicationThread = useMemo(() => {
    const threads = getMobileInboxThreads()
    return threads.find((thread) => thread.module === workspace.module) || threads[0] || {
      title: 'Workspace Messages',
      subtitle: 'No conversation has been started for this workspace yet.',
      messages: [],
    }
  }, [workspace.module])
  const [noteDraft, setNoteDraft] = useState('')
  const [contact, setContact] = useState(null)
  const accent = getAccent(workspace)
  const primaryAction = workspace.priorityActions?.[0] || null
  const outstandingDocuments = getOutstandingDocuments(documents)
  const completedStages = workspace.stages.filter((stage, index) => stageState(workspace.stages, displayStatus || workspace.currentStage, index) === 'complete').length
  const progressPercent = workspace.stages.length ? Math.round(((completedStages + 1) / workspace.stages.length) * 100) : 0

  useEffect(() => {
    trackWorkspaceEvent('workspace_opened', workspaceContext, workspace)
  }, [workspace, workspaceContext])

  if (!workspace) {
    return <MobileLoadingState label="Loading mobile workspace" />
  }

  function handleAction(action) {
    const normalized = String(action || '').toLowerCase()
    if (normalized.includes('note')) {
      document.getElementById('mobile-workspace-note-input')?.focus()
      return
    }
    if (normalized.includes('document')) {
      setUploadOpen(true)
      return
    }
    if (normalized.includes('status') || normalized.includes('stage') || normalized.includes('milestone')) {
      handleStatusUpdate(action)
      return
    }
    const eventName = normalized.includes('document')
      ? 'document_uploaded'
      : normalized.includes('status') || normalized.includes('stage') || normalized.includes('milestone')
        ? 'status_updated'
        : 'workspace_action_used'
    trackWorkspaceEvent(eventName, workspaceContext, workspace, { action })
  }

  function handleStatusUpdate(action = 'Update Status') {
    const currentIndex = workspace.stages.findIndex((stage) => stage.toLowerCase() === String(displayStatus || workspace.currentStage || '').toLowerCase())
    const nextStage = workspace.stages[Math.min(currentIndex < 0 ? 1 : currentIndex + 1, workspace.stages.length - 1)] || displayStatus
    setStatusOverrides((current) => ({ ...current, [workspaceKey]: nextStage }))
    setActivityOverrides((current) => ({
      ...current,
      [workspaceKey]: [
        { id: `status-${Date.now()}`, title: 'Status Updated', body: `${action}: ${nextStage}`, time: 'Now' },
        ...(current[workspaceKey] || workspace.activity || []),
      ],
    }))
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      addOfflineDraft({ type: 'Status Change', title: nextStage, module: workspace.module, workspaceId })
    }
    trackWorkspaceEvent('status_updated', workspaceContext, workspace, { action, nextStage })
  }

  function handleSmartAction(action) {
    if (action.type === 'upload') {
      setUploadOpen(true)
      return
    }
    if (action.type === 'contact') {
      setContact(workspace.participants[0] || null)
      trackWorkspaceEvent('workspace_action_used', workspaceContext, workspace, { action: action.label })
      return
    }
    if (action.type === 'task' && tasks[0]) {
      handleCompleteTask(tasks[0].id)
      return
    }
    if (action.type === 'status' || action.type === 'request_document' || action.type === 'onboarding') {
      handleStatusUpdate(action.label)
      return
    }
    trackWorkspaceEvent('workspace_action_used', workspaceContext, workspace, { action: action.label })
  }

  function handleCommandBriefAction(action = '') {
    const normalized = String(action || '').toLowerCase()
    if (normalized.includes('document') || normalized.includes('scanner')) {
      setUploadOpen(true)
      return
    }
    if (normalized.includes('task')) {
      if (tasks[0]) handleCompleteTask(tasks[0].id)
      return
    }
    if (normalized.includes('status') || normalized.includes('handoff')) {
      handleStatusUpdate(action)
      return
    }
    if (normalized.includes('priority')) {
      document.querySelector('[data-mobile-priority-actions]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    trackWorkspaceEvent('mobile_command_brief_action', workspaceContext, workspace, { action })
  }

  function handleLiveRoomUpdate(update) {
    if (!update) return
    setActivityOverrides((current) => ({
      ...current,
      [workspaceKey]: [
        { id: `live-room-${Date.now()}`, title: 'Shared Update Prepared', body: update.text, time: 'Now', actor: workspaceContext.profile?.fullName || 'You', tone: 'blue' },
        ...(current[workspaceKey] || workspace.activity || []),
      ],
    }))
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      addOfflineDraft({ type: 'Shared Update', title: update.label, module: workspace.module, workspaceId, payload: update })
    }
    trackWorkspaceEvent('mobile_live_room_update_prepared', workspaceContext, workspace, { templateId: update.id, templateLabel: update.label })
  }

  function handleHandoffApproval(review) {
    if (!review) return
    setActivityOverrides((current) => ({
      ...current,
      [workspaceKey]: [
        { id: `handoff-${Date.now()}`, title: 'Mobile Handoff Reviewed', body: `${review.certificate} · ${review.score}`, time: 'Now', actor: workspaceContext.profile?.fullName || 'You', tone: review.score >= 86 ? 'green' : 'amber' },
        ...(current[workspaceKey] || workspace.activity || []),
      ],
    }))
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      addOfflineDraft({ type: 'Handoff Review', title: review.certificate, module: workspace.module, workspaceId, payload: { score: review.score } })
    }
    trackWorkspaceEvent('mobile_handoff_review_approved', workspaceContext, workspace, { score: review.score, certificate: review.certificate })
  }

  function handleUploaded(record) {
    const nextDocuments = (documents.length ? documents : workspace.documents || []).map((item) => {
      if (item.label === 'Uploaded Documents' || item.label === 'Recently Uploaded') {
        return { ...item, value: Number(item.value || 0) + 1 }
      }
      if (item.label === 'Outstanding Documents') {
        return { ...item, value: Math.max(Number(item.value || 0) - 1, 0) }
      }
      return item
    })
    setDocumentOverrides((current) => ({ ...current, [workspaceKey]: nextDocuments }))
    setActivityOverrides((current) => ({
      ...current,
      [workspaceKey]: [
        { id: `upload-${record.id}`, title: 'Document Uploaded', body: record.documentType, time: 'Now' },
        ...(current[workspaceKey] || workspace.activity || []),
      ],
    }))
    trackWorkspaceEvent('document_uploaded', workspaceContext, workspace, { documentType: record.documentType, source: record.source })
  }

  function handleAddNote() {
    const content = noteDraft.trim()
    if (!content) return
    const note = {
      id: `local-note-${Date.now()}`,
      user: workspaceContext.profile?.fullName || 'You',
      date: 'Now',
      content,
    }
    setNoteOverrides((current) => ({
      ...current,
      [workspaceKey]: [note, ...(current[workspaceKey] || workspace.notes || [])],
    }))
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      addOfflineDraft({ type: 'Note', title: content, module: workspace.module, workspaceId, payload: note })
    }
    setNoteDraft('')
    trackWorkspaceEvent('note_added', workspaceContext, workspace)
  }

  function handleCompleteTask(taskId) {
    setTaskOverrides((current) => ({
      ...current,
      [workspaceKey]: (current[workspaceKey] || workspace.tasks || []).filter((task) => task.id !== taskId),
    }))
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      addOfflineDraft({ type: 'Task Change', title: taskId, module: workspace.module, workspaceId })
    }
    trackWorkspaceEvent('task_completed', workspaceContext, workspace)
  }

  function handleContactAction(type, participant = contact) {
    if (!participant) return
    trackWorkspaceEvent(type === 'whatsapp' ? 'contact_whatsapp' : type === 'call' ? 'contact_called' : 'contact_emailed', workspaceContext, workspace, {
      participantRole: participant.role,
    })
  }

  return (
    <div className="space-y-5" data-mobile-workspace={workspace.module} data-workspace-reference={workspace.reference}>
      <section className="overflow-hidden rounded-[30px] bg-[#10243a] p-5 text-white shadow-[0_20px_46px_rgba(15,23,42,0.20)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">{workspace.moduleLabel || accent.label}</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight text-white">{workspace.title}</h1>
            <p className="mt-2 text-[14px] leading-5 text-[#dce8f2]">{workspace.reference} · {displayStatus}</p>
          </div>
          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white" aria-label="Actions menu">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto] gap-4 rounded-[24px] border border-white/10 bg-white/8 p-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase text-[#9fe0bd]">Now</p>
            <p className="mt-1 text-[18px] font-semibold leading-6 text-white">{workspace.nextAction || primaryAction?.title || 'Confirm next action'}</p>
            <p className="mt-2 text-[13px] leading-5 text-[#c7d7e4]">Owner: {workspace.owner || primaryAction?.owner || 'You'} · {workspace.sla || primaryAction?.due || 'Due today'}</p>
          </div>
          <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full bg-white text-[#10243a] shadow-[0_14px_28px_rgba(0,0,0,0.20)]">
            <span className="text-[20px] font-bold">{progressPercent}%</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        {workspace.header.map((item) => (
          <MobileCard key={item.label} className="p-3">
            <p className="text-[11px] font-semibold uppercase text-[#60758d]">{item.label}</p>
            <p className="mt-2 text-[15px] font-semibold text-[#10243a]">{item.label.toLowerCase().includes('stage') || item.label.toLowerCase().includes('milestone') ? displayStatus : item.value}</p>
          </MobileCard>
        ))}
      </section>

      <section className="grid grid-cols-3 gap-2">
        {[
          { label: 'Open Tasks', value: tasks.length, icon: ListChecks },
          { label: 'Docs Due', value: outstandingDocuments, icon: FileText },
          { label: 'Contacts', value: workspace.participants.length, icon: ContactRound },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-[22px] border border-white/80 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.055)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl" style={{ backgroundColor: accent.soft, color: accent.color }}><Icon className="h-4 w-4" /></span>
              <p className="mt-3 text-[22px] font-semibold text-[#10243a]">{item.value}</p>
              <p className="mt-1 text-[11px] font-semibold text-[#60758d]">{item.label}</p>
            </div>
          )
        })}
      </section>

      <MobileCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-[#10243a]">Progress Tracker</h2>
            <p className="mt-1 text-[13px] leading-5 text-[#60758d]">{displayStatus} is the active stage.</p>
          </div>
          <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ backgroundColor: accent.soft, color: accent.color }}>{completedStages + 1}/{workspace.stages.length}</span>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {workspace.stages.map((stage, index) => {
            const state = stageState(workspace.stages, displayStatus || workspace.currentStage, index)
            return (
              <div key={stage} className="flex min-w-[86px] flex-col items-center gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${state === 'complete' ? 'bg-[#1f7a5a] text-white' : state === 'current' ? 'bg-[#10243a] text-white shadow-[0_8px_18px_rgba(16,36,58,0.18)]' : 'bg-[#edf3f8] text-[#94a3b8]'}`}>
                  {state === 'complete' ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className={`text-center text-[11px] font-semibold ${state === 'future' ? 'text-[#94a3b8]' : 'text-[#10243a]'}`}>{stage}</span>
              </div>
            )
          })}
        </div>
      </MobileCard>

      <MobileFieldModePanel
        workspace={workspace}
        tasks={tasks}
        documents={documents}
        priorityActions={workspace.priorityActions}
        onOpenDocuments={() => setUploadOpen(true)}
      />

      <MobileCommandBriefPanel
        workspace={workspace}
        tasks={tasks}
        documents={documents}
        priorityActions={workspace.priorityActions}
        activity={activity}
        onAction={handleCommandBriefAction}
      />

      <MobileLiveRoomPanel
        workspace={workspace}
        tasks={tasks}
        documents={documents}
        activity={activity}
        communicationThread={communicationThread}
        onSendUpdate={handleLiveRoomUpdate}
      />

      <MobileHandoffReviewPanel
        workspace={workspace}
        tasks={tasks}
        documents={documents}
        activity={activity}
        priorityActions={workspace.priorityActions}
        communicationThread={communicationThread}
        onApprove={handleHandoffApproval}
      />

      <MobileSmartActionBar actions={smartActions} onAction={handleSmartAction} />

      <section data-mobile-priority-actions>
        <SectionHeader title="Priority Actions" action={workspace.priorityActions.length ? `${workspace.priorityActions.length} open` : ''} />
        {workspace.priorityActions.length ? (
          <div className="space-y-3">
            {workspace.priorityActions.slice(0, 5).map((item) => (
              <div key={item.id} className={`rounded-[24px] border p-4 ${TONE_CLASSES[item.tone] || TONE_CLASSES.amber}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOTS[item.tone] || TONE_DOTS.amber}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{item.title}</p>
                    <p className="mt-1 text-[14px] leading-5 opacity-80">{item.body}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-white/70 px-3 text-[12px] font-semibold"><UserRound className="h-3.5 w-3.5" /> {item.owner || workspace.owner || 'Owner'}</span>
                      <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-white/70 px-3 text-[12px] font-semibold"><CalendarDays className="h-3.5 w-3.5" /> {item.due || workspace.sla || 'Due today'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <MobileEmptyState title="No urgent actions." body="Everything looks clear for now." />}
      </section>

      {workspace.contactActions ? (
        <MobileCard>
          <h2 className="text-[18px] font-semibold text-[#10243a]">Contact Actions</h2>
          <p className="mt-1 text-[13px] leading-5 text-[#60758d]">Reach the primary contact without leaving the workspace.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: 'Call', icon: Phone, type: 'call' },
              { label: 'WhatsApp', icon: MessageCircle, type: 'whatsapp' },
              { label: 'Email', icon: Mail, type: 'email' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button key={item.label} type="button" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#e8f6ef] text-[13px] font-semibold text-[#1f7a5a]" onClick={() => handleContactAction(item.type, workspace.participants[0])}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </MobileCard>
      ) : null}

      <section>
        <SectionHeader title="Role Players" action="Tap for details" />
        <div className="space-y-2">
          {workspace.participants.map((participant) => (
            <button key={participant.id} type="button" className="flex min-h-[72px] w-full items-center gap-3 rounded-[22px] border border-[#e4ebf2] bg-white px-4 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)]" onClick={() => setContact(participant)}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: accent.soft, color: accent.color }}><UserRound className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-[#10243a]">{participant.name}</span>
                <span className="mt-1 block truncate text-[13px] text-[#60758d]">{participant.role} · {participant.organisation}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
            </button>
          ))}
        </div>
      </section>

      {documents.length ? (
        <section>
          <SectionHeader title="Documents Summary" action={outstandingDocuments ? `${outstandingDocuments} due` : 'Current'} />
          <div className="grid grid-cols-3 gap-2">
            {documents.map((item) => (
              <MobileCard key={item.label} className="p-3">
                <FileText className="h-4 w-4" style={{ color: accent.color }} />
                <p className="mt-3 text-[22px] font-semibold text-[#10243a]">{item.value}</p>
                <p className="mt-1 text-[11px] font-semibold text-[#60758d]">{item.label}</p>
              </MobileCard>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Tasks" action={tasks.length ? 'Complete in field' : ''} />
        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((task) => (
              <MobileCard key={task.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[#10243a]">{task.title}</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#60758d]">{task.related} · {task.due}</p>
                  </div>
                  <span className="rounded-full bg-[#fff6e5] px-2.5 py-1 text-[11px] font-semibold text-[#b7791f]">{task.priority}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className="min-h-11 rounded-2xl border border-[#d7e0ea] bg-white px-4 text-sm font-semibold text-[#10243a]" onClick={() => handleAction('View Timeline')}>View Item</button>
                  <button type="button" className="min-h-11 rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white" onClick={() => handleCompleteTask(task.id)}>Complete</button>
                </div>
              </MobileCard>
            ))}
          </div>
        ) : <MobileEmptyState title="No outstanding tasks." body="Completed tasks disappear from this mobile view." />}
      </section>

      <section>
        <SectionHeader title="Activity Feed" action="Newest first" />
        {activity.length ? (
          <div className="space-y-2 rounded-[22px] border border-[#e4ebf2] bg-[#f8fafc] p-2">
          {activity.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-[18px] bg-white px-3 py-3">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOTS[item.tone] || TONE_DOTS.green}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#10243a]">{item.title}</span>
                <span className="block truncate text-xs text-[#60758d]">{item.body}{item.actor ? ` · ${item.actor}` : ''}</span>
              </span>
              <span className="text-xs font-semibold text-[#94a3b8]">{item.time}</span>
            </div>
          ))}
          </div>
        ) : <MobileEmptyState title="No activity yet." body="Updates will appear here as this work progresses." />}
      </section>

      <section>
        <SectionHeader title="Communication" action={communicationThread.messages.length ? `${communicationThread.messages.length} updates` : ''} />
        <MobileCard>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: accent.soft, color: accent.color }}><MessageSquarePlus className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[#10243a]">{communicationThread.title}</p>
              <p className="mt-1 text-[13px] leading-5 text-[#60758d]">{communicationThread.subtitle}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {communicationThread.messages.map((message) => (
              <div key={message.id} className="rounded-[18px] bg-[#f8fafc] p-3">
                <p className="text-[11px] font-semibold uppercase" style={{ color: accent.color }}>{message.type}</p>
                <p className="mt-1 text-sm font-semibold text-[#10243a]">{message.body}</p>
                <p className="mt-1 text-xs text-[#60758d]">{message.author} · {message.time}</p>
              </div>
            ))}
          </div>
        </MobileCard>
      </section>

      <section>
        <SectionHeader title="Notes" action={notes.length ? `${notes.length} notes` : 'Add note'} />
        <MobileCard>
          <div className="flex gap-2">
            <input id="mobile-workspace-note-input" className="min-h-11 flex-1 rounded-2xl border border-[#d7e0ea] px-3 text-sm outline-none" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a quick note" />
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: accent.color }} onClick={handleAddNote} aria-label="Add note"><Plus className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 space-y-3">
            {notes.length ? notes.map((note) => (
              <div key={note.id} className="rounded-[18px] bg-[#f8fafc] p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#60758d]"><StickyNote className="h-4 w-4" /> {note.user} · {note.date}</div>
                <p className="mt-2 text-sm leading-6 text-[#10243a]">{note.content}</p>
              </div>
            )) : <MobileEmptyState title="No notes yet." body="Add a quick field note when there is context to capture." />}
          </div>
        </MobileCard>
      </section>

      <section>
        <SectionHeader title="Workspace Actions" />
        <div className="grid grid-cols-2 gap-3">
          {workspace.actions.map((action) => {
            const normalized = action.toLowerCase()
            const Icon = normalized.includes('document') ? FileUp : normalized.includes('note') ? StickyNote : normalized.includes('contact') ? ContactRound : normalized.includes('status') || normalized.includes('stage') || normalized.includes('milestone') ? CheckCircle2 : normalized.includes('timeline') ? Clock3 : ArrowUpRight
            return (
              <button key={action} type="button" className="flex min-h-[58px] items-center gap-3 rounded-[20px] bg-white px-3 text-left text-sm font-semibold text-[#10243a] shadow-[0_10px_24px_rgba(15,23,42,0.06)]" onClick={() => handleAction(action)}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: accent.soft, color: accent.color }}><Icon className="h-4 w-4" /></span>
                <span>{action}</span>
              </button>
            )
          })}
        </div>
      </section>

      <MobileOfflineDraftPanel />

      {contact ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-[#10243a]/35 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={() => setContact(null)} data-contact-drawer>
          <div className="mx-auto w-full max-w-[520px] rounded-[28px] bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase" style={{ color: accent.color }}>{contact.role}</p>
                <h2 className="mt-1 text-[24px] font-semibold text-[#10243a]">{contact.name}</h2>
                <p className="mt-2 text-sm text-[#60758d]">{contact.organisation}</p>
              </div>
              <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f6f9] text-[#60758d]" onClick={() => setContact(null)} aria-label="Close contact drawer"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-[#10243a]">
              <div className="rounded-2xl bg-[#f8fafc] p-3">
                <p className="text-[11px] font-semibold uppercase text-[#60758d]">Phone</p>
                <p className="mt-1 font-semibold">{contact.phone}</p>
              </div>
              <div className="rounded-2xl bg-[#f8fafc] p-3">
                <p className="text-[11px] font-semibold uppercase text-[#60758d]">Email</p>
                <p className="mt-1 truncate font-semibold">{contact.email}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <a className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-[13px] font-semibold" style={{ backgroundColor: accent.soft, color: accent.color }} href={`tel:${contact.phone}`} onClick={() => handleContactAction('call')}><Phone className="h-5 w-5" />Call</a>
              <a className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-[13px] font-semibold" style={{ backgroundColor: accent.soft, color: accent.color }} href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`} onClick={() => handleContactAction('whatsapp')}><MessageCircle className="h-5 w-5" />Chat</a>
              <a className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-[13px] font-semibold" style={{ backgroundColor: accent.soft, color: accent.color }} href={`mailto:${contact.email}`} onClick={() => handleContactAction('email')}><Mail className="h-5 w-5" />Email</a>
            </div>
          </div>
        </div>
      ) : null}

      <MobileUploadSheet
        open={uploadOpen}
        module={workspace.module}
        workspaceId={workspaceId}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
      />
    </div>
  )
}
