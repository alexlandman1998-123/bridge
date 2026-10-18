import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, MessageCircle, RefreshCw, Send } from 'lucide-react'
import Button from '../ui/Button'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import WhatsAppCrmLink, { WhatsAppCrmConversations } from './WhatsAppCrmLink'

const date = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
const empty = { scope: '', conversations: [], error: '', loading: true }
function ConversationAssignment({ conversation, assignees, busy, onAssign }) {
  const [choice, setChoice] = useState(conversation.assigned_user_id || '')
  const [version, setVersion] = useState(conversation.assignment_version)
  if (version !== conversation.assignment_version) { setVersion(conversation.assignment_version); setChoice(conversation.assigned_user_id || '') }
  return <form className="flex flex-wrap items-end gap-3 border-b bg-blue-50/40 p-4" onSubmit={event => { event.preventDefault(); void onAssign(choice) }}>
    <label className="grid gap-1 text-sm font-semibold">Assign conversation<select className="rounded-lg border bg-white px-3 py-2 font-normal" value={choice} disabled={busy} onChange={event => setChoice(event.target.value)}><option value="">Agency queue</option>{conversation.assigned_user_id && !assignees.some(agent => agent.id === conversation.assigned_user_id) ? <option value={conversation.assigned_user_id} disabled>Unavailable agent</option> : null}{assignees.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
    <Button size="sm" type="submit" disabled={busy || choice === (conversation.assigned_user_id || '')}>Save assignment</Button>
  </form>
}

export default function WhatsAppInbox() {
  const workspace = useMetaWorkspace(), org = workspace.organisationId, scope = workspace.accessScope || org
  const [params, setParams] = useSearchParams()
  const requestedOrg = params.get('organisationId'), requestedConversation = params.get('conversation') || ''
  const crmKind = params.get('crmKind'), crmRecord = params.get('crmRecord')
  const [list, setList] = useState(empty), [selected, setSelected] = useState({ scope: '', id: '' })
  const [detail, setDetail] = useState({ scope: '', id: '', messages: [], loading: false }), [query, setQuery] = useState('')
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(null)
  const listGeneration = useRef(0), detailGeneration = useRef(0), sendLock = useRef(false)
  const invalidateDetail = useCallback(() => { detailGeneration.current++ }, [])
  const invalidateAll = useCallback(() => { listGeneration.current++; detailGeneration.current++ }, [])
  const selectedId = selected.scope === scope ? selected.id : ''
  const selectionKey = `${scope}:${selectedId}`
  const activeSelection = useRef(selectionKey)
  const listedSelection = useRef('')
  activeSelection.current = selectionKey
  const conversations = list.scope === scope ? list.conversations : []
  const current = detail.scope === scope && detail.id === selectedId ? detail : { messages: [], loading: Boolean(selectedId) }
  const refreshList = useCallback(async () => {
    const generation = ++listGeneration.current
    if (!org) return
    try {
      const data = await metaIntegrationRequest(org, 'inbox')
      if (generation === listGeneration.current) {
        const rows = data.conversations || []
        setList({ scope, conversations: rows, error: '', loading: false })
        const activeId = activeSelection.current.startsWith(`${scope}:`) ? activeSelection.current.slice(scope.length + 1) : ''
        if (activeId && rows.some(row => row.id === activeId)) listedSelection.current = activeSelection.current
        else if (activeId && listedSelection.current === activeSelection.current) {
          invalidateDetail(); setSelected({ scope, id: '' }); setDetail({ scope, id: '', messages: [], loading: false }); setDraft(''); setAttempt(null)
        }
      }
    } catch (failure) { if (generation === listGeneration.current) { invalidateDetail(); setList({ ...empty, scope, loading: false, error: failure.message }); setSelected({ scope, id: '' }); setDetail({ scope, id: '', messages: [], loading: false }); setDraft(''); setAttempt(null) } }
  }, [org, scope, invalidateDetail])
  const refreshDetail = useCallback(async () => {
    const generation = ++detailGeneration.current
    if (!org || !selectedId) return
    try {
      const data = await metaIntegrationRequest(org, 'messages', { conversationId: selectedId })
      if (generation === detailGeneration.current) setDetail({ ...data, scope, id: selectedId, loading: false })
    } catch (failure) { if (generation === detailGeneration.current) { setDetail({ scope, id: selectedId, messages: [], loading: false, error: failure.message }); setDraft(''); setAttempt(null); setError('') } }
  }, [org, scope, selectedId])
  useEffect(() => {
    listedSelection.current = ''
    setSelected({ scope, id: '' }); setQuery(''); setDraft(''); setAttempt(null); setError(''); setBusy('')
    void refreshList()
    return invalidateAll
  }, [scope, refreshList, invalidateAll])
  useEffect(() => {
    if (requestedOrg === org && requestedConversation) setSelected({ scope, id: requestedConversation })
  }, [scope, org, requestedOrg, requestedConversation])
  useEffect(() => {
    setDraft(''); setAttempt(null); setError(''); setBusy('')
    if (selectedId) { setDetail({ scope, id: selectedId, messages: [], loading: true }); void refreshDetail() }
    return invalidateDetail
  }, [scope, selectedId, refreshDetail, invalidateDetail])
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) { void refreshList(); void refreshDetail() } }, 15000)
    return () => window.clearInterval(timer)
  }, [refreshList, refreshDetail])
  async function sendReply() {
    if (sendLock.current || !selectedId || !(attempt?.body || draft.trim())) return
    const capturedKey = selectionKey, capturedOrg = org, conversationId = selectedId
    const reply = attempt || { id: crypto.randomUUID(), body: draft.trim() }
    sendLock.current = true; setBusy('reply'); setAttempt(reply); setError('')
    try {
      const data = await metaIntegrationRequest(capturedOrg, 'reply', { conversationId, message: reply.body, requestId: reply.id })
      if (capturedKey !== activeSelection.current) return
      setAttempt(null); setDraft('')
      if (['unknown','sending'].includes(data.message.delivery_status)) setError('The reply result is unconfirmed. Check the conversation before sending the message again.')
      else if (data.message.delivery_status === 'failed') setError(data.message.error_message || 'Meta did not send this reply.')
      await Promise.all([refreshList(), refreshDetail()])
    } catch (failure) { if (capturedKey === activeSelection.current) setError(`${failure.message} Use Check reply to reconcile this attempt.`) }
    finally { sendLock.current = false; if (capturedKey === activeSelection.current) setBusy('') }
  }
  async function setStatus() {
    const capturedKey = selectionKey
    setBusy('status'); setError('')
    try { await metaIntegrationRequest(org, 'conversation_status', { conversationId: selectedId, status: current.conversation.status === 'closed' ? 'open' : 'closed', assignmentVersion: current.conversation.assignment_version }); if (capturedKey === activeSelection.current) await Promise.all([refreshList(), refreshDetail()]) }
    catch (failure) { if (capturedKey === activeSelection.current) setError(failure.message) }
    finally { if (capturedKey === activeSelection.current) setBusy('') }
  }
  async function assignConversation(assignedUserId) {
    const capturedKey = selectionKey
    setBusy('assign'); setError('')
    try {
      await metaIntegrationRequest(org, 'assign_conversation', { conversationId: selectedId, assignedUserId: assignedUserId || null, assignmentVersion: current.conversation.assignment_version })
      if (capturedKey === activeSelection.current) await Promise.all([refreshList(), refreshDetail()])
    } catch (failure) { if (capturedKey === activeSelection.current) { setError(failure.message); await refreshDetail() } }
    finally { if (capturedKey === activeSelection.current) setBusy('') }
  }
  async function download(message) {
    const capturedKey = selectionKey
    setBusy(message.id); setError('')
    try {
      const file = await metaIntegrationRequest(org, 'media', { messageId: message.id })
      if (capturedKey !== activeSelection.current) return
      const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0))
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }))
      const anchor = document.createElement('a')
      anchor.href = objectUrl; anchor.download = (message.media_json?.filename || `whatsapp-${message.message_type}`).replace(/[^a-zA-Z0-9._-]/g, '_'); anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (failure) { if (capturedKey === activeSelection.current) setError(failure.message) }
    finally { if (capturedKey === activeSelection.current) setBusy('') }
  }
  const needle = query.trim().toLowerCase()
  const rows = conversations.filter(row => `${row.contact_name} ${row.contact_phone} ${row.last_message_preview}`.toLowerCase().includes(needle))
  function selectConversation(id, fromSidebar = false) {
    listedSelection.current = fromSidebar ? `${scope}:${id}` : ''
    setSelected({ scope, id })
    setParams(previous => { const next = new URLSearchParams(previous); next.set('organisationId', org); next.set('conversation', id); return next }, { replace: true })
  }
  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold text-slate-900">WhatsApp inbox</h1><p className="mt-1 text-sm text-slate-600">{workspace.canManage ? 'Agency conversations and agent assignments.' : 'Conversations assigned to you, including your connected WhatsApp Business number.'}</p></div><Button variant="secondary" disabled={Boolean(busy)} onClick={() => { void refreshList(); void refreshDetail() }}><RefreshCw size={16} />Refresh</Button></header>
    <nav aria-label="WhatsApp" className="flex gap-5 text-sm font-semibold text-blue-800"><Link to="/marketing?section=whatsapp">Campaigns</Link><span aria-current="page">Inbox</span><Link to="/settings/integrations/whatsapp">Connections</Link></nav>
    {(list.error || workspace.error) ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{list.error || workspace.error}</p> : null}
    {requestedOrg && requestedOrg !== org ? <p role="alert" className="rounded-xl border bg-white p-4 text-sm">This WhatsApp link belongs to another workspace. Switch to that workspace before opening it.</p> : null}
    {requestedOrg === org && crmKind && crmRecord ? <WhatsAppCrmConversations key={`${scope}:${crmKind}:${crmRecord}`} organisationId={org} accessScope={scope} kind={crmKind} recordId={crmRecord} onSelect={selectConversation} /> : null}
    {!workspace.loading && !conversations.length && !workspace.senders.some(sender => sender.connection_status === 'connected') ? <aside className="rounded-xl border bg-white p-5"><strong>Connect a WhatsApp business sender</strong><p className="mt-2 text-sm text-slate-600">Incoming messages will appear here after a number is connected and Meta delivers its webhooks.</p><Link className="mt-3 inline-block text-sm font-semibold text-blue-800" to="/settings/integrations/whatsapp">Connect WhatsApp</Link></aside> : null}
    <div className="grid overflow-hidden rounded-2xl border bg-white shadow-sm lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="border-b p-4 lg:border-b-0 lg:border-r"><label className="grid gap-2 text-sm font-semibold">Search recent conversations<input className="rounded-lg border px-3 py-2 font-normal" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, number or message" /></label><p className="mt-2 text-xs text-slate-500">Latest 100 conversations · updates every 15 seconds</p><div className="mt-4 max-h-[65vh] space-y-2 overflow-auto">{list.scope !== scope || list.loading ? <p role="status">Loading conversations…</p> : rows.length ? rows.map(row => <button key={row.id} className={`w-full rounded-xl border p-3 text-left ${selectedId === row.id ? 'border-blue-400 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`} onClick={() => selectConversation(row.id, true)} aria-pressed={selectedId === row.id}><span className="flex justify-between gap-2"><strong className="truncate text-sm">{row.contact_name || row.contact_phone}</strong>{row.unread_count > 0 ? <span className="rounded-full bg-green-700 px-2 text-xs text-white">{row.unread_count}</span> : null}</span><span className="mt-1 block truncate text-xs text-slate-600">{row.last_message_preview || 'Attachment received'}</span><span className="mt-2 block text-xs text-slate-500">{date(row.last_message_at)} · {row.status}</span></button>) : <p className="py-5 text-sm text-slate-600">No conversations found.</p>}</div></aside>
      <section className="flex min-h-[500px] min-w-0 flex-col">{!selectedId ? <div className="m-auto p-10 text-center text-slate-500"><MessageCircle className="mx-auto mb-3" /><p>Select a conversation to read and reply.</p></div> : current.loading ? <p role="status" className="p-6">Loading messages…</p> : current.error ? <p role="alert" className="p-6 text-red-800">{current.error}</p> : <>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">{current.conversation?.contact_name || current.conversation?.contact_phone}</h2><p className="text-xs text-slate-500">{current.conversation?.contact_phone} · {current.conversation?.status}</p></div><Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => void setStatus()}>{current.conversation?.status === 'closed' ? 'Reopen' : 'Close conversation'}</Button></header>
        {current.conversation && workspace.canManage ? <ConversationAssignment key={selectedId} conversation={current.conversation} assignees={workspace.assignees || []} busy={Boolean(busy) || Boolean(attempt)} onAssign={assignConversation} /> : current.conversation?.assigned_user_id ? <p className="border-b px-4 py-2 text-xs font-semibold text-blue-800">Assigned to you</p> : null}
        {current.sender?.display_phone_number ? <p className="border-b px-4 py-2 text-xs text-slate-600">Replying from {current.sender.display_phone_number}</p> : null}
        {current.conversation ? <WhatsAppCrmLink key={`${scope}:${selectedId}:${current.conversation.assignment_version}`} organisationId={org} accessScope={scope} conversationId={selectedId} assignmentVersion={current.conversation.assignment_version} /> : null}
        <div className="max-h-[55vh] flex-1 space-y-4 overflow-auto bg-slate-50 p-5" aria-label="Recent messages">{current.messages.map(message => <article key={message.id} className={`max-w-[90%] rounded-xl border p-3 sm:max-w-[80%] ${message.direction === 'outbound' ? 'ml-auto border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}><p className="mb-1 text-xs font-semibold text-slate-600">{message.direction === 'outbound' ? message.created_by === workspace.currentUserId ? 'You' : 'Your team' : current.conversation?.contact_name || 'Customer'}</p>{message.body_text ? <p className="whitespace-pre-wrap break-words text-sm">{message.body_text}</p> : <p className="text-sm capitalize">{message.message_type} received</p>}{message.media_json?.id ? <Button variant="ghost" size="sm" className="mt-2" disabled={Boolean(busy)} onClick={() => void download(message)}><Download size={14} />{message.media_json.filename || `Download ${message.message_type}`}</Button> : null}<p className="mt-2 text-[11px] text-slate-500">{date(message.event_at)} · {message.delivery_status === 'unknown' ? 'Unconfirmed' : message.delivery_status}</p>{message.error_message ? <p className="mt-1 text-xs text-red-800">{message.error_message}</p> : null}</article>)}</div>
        <div className="border-t p-4">{error ? <p role="alert" className="mb-3 text-sm text-red-800">{error}</p> : null}{current.conversation?.canReply || attempt ? <><label className="grid gap-2 text-sm font-semibold">Reply<textarea className="min-h-24 rounded-xl border p-3 font-normal" value={attempt?.body || draft} maxLength={4096} disabled={Boolean(busy) || Boolean(attempt)} onChange={event => setDraft(event.target.value)} /></label><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Reply window: 24 hours after the last customer message</span><Button disabled={Boolean(busy) || !(attempt?.body || draft.trim())} onClick={() => void sendReply()}><Send size={15} />{busy === 'reply' ? 'Checking…' : attempt ? 'Check reply' : 'Send reply'}</Button></div></> : <p className="text-sm text-slate-600">The 24-hour reply window has closed. Use an <Link className="font-semibold text-blue-800" to="/marketing?section=whatsapp&view=create">approved template campaign</Link> to contact this person.</p>}</div>
      </>}</section>
    </div>
  </section>
}
