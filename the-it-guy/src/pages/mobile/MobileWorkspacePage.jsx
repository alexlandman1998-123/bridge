import {
  Check,
  ChevronRight,
  FileText,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  StickyNote,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MobileOfflineDraftPanel, MobileSmartActionBar, MobileUploadSheet } from '../../components/mobile-shell/MobileProductivity'
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

function stageState(stages = [], currentStage = '', index) {
  const currentIndex = stages.findIndex((stage) => stage.toLowerCase() === String(currentStage || '').toLowerCase())
  if (currentIndex < 0) return index === 0 ? 'current' : 'future'
  if (index < currentIndex) return 'complete'
  if (index === currentIndex) return 'current'
  return 'future'
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
  const communicationThread = useMemo(() => getMobileInboxThreads().find((thread) => thread.module === workspace.module) || getMobileInboxThreads()[0], [workspace.module])
  const [noteDraft, setNoteDraft] = useState('')
  const [contact, setContact] = useState(null)

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

  function handleContactAction(type) {
    if (!contact) return
    trackWorkspaceEvent(type === 'whatsapp' ? 'contact_whatsapp' : type === 'call' ? 'contact_called' : 'contact_emailed', workspaceContext, workspace, {
      participantRole: contact.role,
    })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[26px] bg-[#10243a] p-5 text-white shadow-[0_18px_38px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">{workspace.reference}</p>
            <h1 className="mt-2 text-[27px] font-semibold leading-tight text-white">{workspace.title}</h1>
            <p className="mt-2 text-sm text-[#dce8f2]">{displayStatus}</p>
          </div>
          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white" aria-label="Actions menu">
            <MoreHorizontal className="h-5 w-5" />
          </button>
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

      <MobileCard>
        <h2 className="text-[18px] font-semibold text-[#10243a]">Progress</h2>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {workspace.stages.map((stage, index) => {
            const state = stageState(workspace.stages, displayStatus || workspace.currentStage, index)
            return (
              <div key={stage} className="flex min-w-[86px] flex-col items-center gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${state === 'complete' ? 'bg-[#1f7a5a] text-white' : state === 'current' ? 'bg-[#10243a] text-white' : 'bg-[#edf3f8] text-[#94a3b8]'}`}>
                  {state === 'complete' ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className={`text-center text-[11px] font-semibold ${state === 'future' ? 'text-[#94a3b8]' : 'text-[#10243a]'}`}>{stage}</span>
              </div>
            )
          })}
        </div>
      </MobileCard>

      <MobileSmartActionBar actions={smartActions} onAction={handleSmartAction} />

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Priority Actions</h2>
        {workspace.priorityActions.length ? (
          <div className="space-y-3">
            {workspace.priorityActions.slice(0, 5).map((item) => (
              <div key={item.id} className={`rounded-[22px] border p-4 ${TONE_CLASSES[item.tone] || TONE_CLASSES.amber}`}>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-sm opacity-80">{item.body}</p>
              </div>
            ))}
          </div>
        ) : <MobileEmptyState title="No urgent actions." body="Everything looks clear for now." />}
      </section>

      {workspace.contactActions ? (
        <MobileCard>
          <h2 className="text-[18px] font-semibold text-[#10243a]">Contact</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['Call', 'WhatsApp', 'Email'].map((label) => (
              <button key={label} type="button" className="min-h-12 rounded-2xl bg-[#e8f6ef] text-sm font-semibold text-[#1f7a5a]" onClick={() => handleContactAction(label.toLowerCase())}>{label}</button>
            ))}
          </div>
        </MobileCard>
      ) : null}

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Quick Information</h2>
        <div className="space-y-2">
          {workspace.participants.map((participant) => (
            <button key={participant.id} type="button" className="flex min-h-[64px] w-full items-center gap-3 rounded-[20px] border border-[#e4ebf2] bg-white px-4 text-left" onClick={() => setContact(participant)}>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#edf3f8] text-[#274c69]"><UserRound className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#10243a]">{participant.name}</span>
                <span className="block text-xs text-[#60758d]">{participant.role}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
            </button>
          ))}
        </div>
      </section>

      {documents.length ? (
        <section>
          <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Documents Summary</h2>
          <div className="grid grid-cols-3 gap-2">
            {documents.map((item) => (
              <MobileCard key={item.label} className="p-3">
                <FileText className="h-4 w-4 text-[#1f7a5a]" />
                <p className="mt-3 text-[22px] font-semibold text-[#10243a]">{item.value}</p>
                <p className="mt-1 text-[11px] font-semibold text-[#60758d]">{item.label}</p>
              </MobileCard>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Tasks</h2>
        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((task) => (
              <MobileCard key={task.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#10243a]">{task.title}</p>
                    <p className="mt-1 text-xs text-[#60758d]">{task.related} · {task.due}</p>
                  </div>
                  <span className="rounded-full bg-[#fff6e5] px-2.5 py-1 text-[11px] font-semibold text-[#b7791f]">{task.priority}</span>
                </div>
                <button type="button" className="mt-4 min-h-10 rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white" onClick={() => handleCompleteTask(task.id)}>Complete</button>
              </MobileCard>
            ))}
          </div>
        ) : <MobileEmptyState title="No outstanding tasks." body="Completed tasks disappear from this mobile view." />}
      </section>

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Activity Feed</h2>
        {activity.length ? (
          <div className="space-y-2 rounded-[22px] border border-[#e4ebf2] bg-[#f8fafc] p-2">
          {activity.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-[18px] bg-white px-3 py-3">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1f7a5a]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#10243a]">{item.title}</span>
                <span className="block truncate text-xs text-[#60758d]">{item.body}</span>
              </span>
              <span className="text-xs font-semibold text-[#94a3b8]">{item.time}</span>
            </div>
          ))}
          </div>
        ) : <MobileEmptyState title="No activity yet." body="Updates will appear here as this work progresses." />}
      </section>

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Communication</h2>
        <MobileCard>
          <p className="text-sm font-semibold text-[#10243a]">{communicationThread.title}</p>
          <p className="mt-1 text-xs text-[#60758d]">{communicationThread.subtitle}</p>
          <div className="mt-4 space-y-2">
            {communicationThread.messages.map((message) => (
              <div key={message.id} className="rounded-[18px] bg-[#f8fafc] p-3">
                <p className="text-[11px] font-semibold uppercase text-[#1f7a5a]">{message.type}</p>
                <p className="mt-1 text-sm font-semibold text-[#10243a]">{message.body}</p>
                <p className="mt-1 text-xs text-[#60758d]">{message.author} · {message.time}</p>
              </div>
            ))}
          </div>
        </MobileCard>
      </section>

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Notes</h2>
        <MobileCard>
          <div className="flex gap-2">
            <input id="mobile-workspace-note-input" className="min-h-11 flex-1 rounded-2xl border border-[#d7e0ea] px-3 text-sm outline-none" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a quick note" />
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1f7a5a] text-white" onClick={handleAddNote} aria-label="Add note"><Plus className="h-5 w-5" /></button>
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
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {workspace.actions.map((action) => (
            <button key={action} type="button" className="min-h-[56px] rounded-[20px] bg-white px-3 text-sm font-semibold text-[#10243a] shadow-[0_10px_24px_rgba(15,23,42,0.06)]" onClick={() => handleAction(action)}>{action}</button>
          ))}
        </div>
      </section>

      <MobileOfflineDraftPanel />

      {contact ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-[#10243a]/35 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={() => setContact(null)}>
          <div className="mx-auto w-full max-w-[520px] rounded-[28px] bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
            <p className="text-[11px] font-semibold uppercase text-[#1f7a5a]">{contact.role}</p>
            <h2 className="mt-1 text-[24px] font-semibold text-[#10243a]">{contact.name}</h2>
            <p className="mt-2 text-sm text-[#60758d]">{contact.organisation}</p>
            <div className="mt-4 space-y-2 text-sm text-[#10243a]">
              <p>{contact.phone}</p>
              <p>{contact.email}</p>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <a className="flex min-h-12 items-center justify-center rounded-2xl bg-[#e8f6ef] text-[#1f7a5a]" href={`tel:${contact.phone}`} onClick={() => handleContactAction('call')}><Phone className="h-5 w-5" /></a>
              <a className="flex min-h-12 items-center justify-center rounded-2xl bg-[#e8f6ef] text-[#1f7a5a]" href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`} onClick={() => handleContactAction('whatsapp')}><MessageCircle className="h-5 w-5" /></a>
              <a className="flex min-h-12 items-center justify-center rounded-2xl bg-[#e8f6ef] text-[#1f7a5a]" href={`mailto:${contact.email}`} onClick={() => handleContactAction('email')}><Mail className="h-5 w-5" /></a>
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
