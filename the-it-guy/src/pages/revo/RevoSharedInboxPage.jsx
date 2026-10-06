import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, PanelRightClose, PanelRightOpen, ArrowLeft, RefreshCw, CalendarDays, CheckCircle2, Clock3, FileText, Inbox, Mail, MessageCircle, Search, SlidersHorizontal } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { useOrganisation } from '../../context/OrganisationContext'
import { Link, useSearchParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { createRevoInboxWorkflowRequest, isSharedInboxSchemaUnavailable, loadRevoInbox, loadRevoInboxChannels, markRevoInboxConversationRead, saveRevoInboxPrivateMessage, updateRevoInboxConversation } from '../../modules/revo/sharedInbox/revoSharedInboxService'
import { REVO_INBOX_VIEWS as VIEWS, resolveRevoInboxView } from '../../modules/revo/sharedInbox/sharedInboxViews'
import './RevoSharedInboxPage.css'

const PREVIEW_CONVERSATIONS = Object.freeze([
  { id: 'preview-lerato', channel: 'whatsapp', providerKey: 'preview', channelAddress: '+27 11 555 0100', name: 'Lerato Mokoena', address: '+27 82 555 0142', subject: 'Viewing at The Mews', preview: 'That sounds perfect, thank you. What time can we view it?', updated: '9:42 AM', assignedTo: 'You', status: 'open', unread: true, messages: [{ id: '1', direction: 'inbound', bodyText: 'Hi, I saw the listing for The Mews. Is it still available?', occurredAt: '9:37 AM', messageType: 'message' }, { id: '2', direction: 'outbound', bodyText: 'Hi Lerato — yes, it is. I can arrange a viewing this week.', occurredAt: '9:40 AM', messageType: 'message' }, { id: '3', direction: 'inbound', bodyText: 'That sounds perfect, thank you. What time can we view it?', occurredAt: '9:42 AM', messageType: 'message' }] },
  { id: 'preview-michael', channel: 'email', providerKey: 'preview', channelAddress: 'inbox@revo.example', name: 'Michael Adams', address: 'michael.adams@example.test', subject: 'Offer documentation', preview: 'I have attached the signed offer and proof of payment for your review.', updated: '8:25 AM', assignedTo: 'Unassigned', status: 'open', unread: true, messages: [{ id: '4', direction: 'inbound', bodyText: 'I have attached the signed offer and proof of payment for your review.', occurredAt: '8:25 AM', messageType: 'message' }] },
  { id: 'preview-aisha', channel: 'whatsapp', providerKey: 'preview', channelAddress: '+27 11 555 0100', name: 'Aisha Patel', address: '+27 84 200 1818', subject: 'Valuation enquiry', preview: 'Could someone call me this afternoon?', updated: 'Yesterday', assignedTo: 'Tumi N.', status: 'open', unread: false, messages: [{ id: '5', direction: 'inbound', bodyText: 'Could someone call me this afternoon?', occurredAt: 'Yesterday, 4:18 PM', messageType: 'message' }] },
])
function text(value = '') { return String(value ?? '').trim() }
function contactInitials(value = '') {
  const names = text(value).split(/\s+/).filter(Boolean)
  return `${names[0]?.[0] || '?'}${names.length > 1 ? names.at(-1)[0] : ''}`.toUpperCase()
}
function statusLabel(value = '') { return text(value).replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) }
function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return new Intl.DateTimeFormat('en-ZA', { hour: 'numeric', minute: '2-digit' }).format(date)
}
function ChannelIcon({ channel }) { return channel === 'whatsapp' ? <MessageCircle size={16} aria-label="WhatsApp" /> : <Mail size={16} aria-label="Email" /> }
function matchesView(item, view, userId) {
  if (view === 'unassigned') return !item.assignedUserId && item.assignedTo === 'Unassigned'
  if (view === 'mine') return item.assignedUserId ? item.assignedUserId === userId : item.assignedTo === 'You'
  if (view === 'team') return Boolean(item.assignedTeamId)
  if (view === 'waiting_on_us') return item.status === 'waiting_on_us'
  if (view === 'closed') return item.status === 'closed'
  return !['closed', 'spam'].includes(item.status)
}
function activityCopy(item) {
  if (item.action === 'assignment_changed') return 'Conversation ownership changed'
  if (item.action === 'status_changed') return `Status changed to ${item.metadata?.toStatus || 'updated'}`
  if (item.action === 'note_added') return 'Internal note added'
  if (item.action === 'draft_saved') return 'Draft saved'
  return 'Conversation created'
}

export default function RevoSharedInboxPage() {
  const { organisation } = useOrganisation()
  const { user, profile } = useAuthSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState({ conversations: [], messages: [], activity: [], associations: [] })
  const [mode, setMode] = useState('loading')
  const [selectedId, setSelectedId] = useState('')
  const view = resolveRevoInboxView(searchParams.get('view'))
  const setView = (nextView) => setSearchParams((current) => {
    const next = new URLSearchParams(current)
    next.set('view', nextView)
    return next
  }, { replace: true })
  const [query, setQuery] = useState('')
  const [composerMode, setComposerMode] = useState('draft')
  const [work, setWork] = useState({})
  const [inboxId, setInboxId] = useState('all')
  const [channels, setChannels] = useState([])
  const [channelFilter, setChannelFilter] = useState('all')
  const [sort, setSort] = useState('latest')
  const [mobileReader, setMobileReader] = useState(false)
  const [popup, setPopup] = useState(null)
  const [popupConversationId, setPopupConversationId] = useState('')
  const requestVersion = useRef(0)
  const saveLock = useRef(false)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [detailsCollapsed, setDetailsCollapsed] = useState(true)
  const agentName = text(profile?.fullName || profile?.full_name || user?.email) || 'You'

  const load = useCallback(async () => {
    if (!organisation?.id) return
    const version = ++requestVersion.current
    try {
      const [next, nextChannels] = await Promise.all([loadRevoInbox(organisation.id), loadRevoInboxChannels(organisation.id)])
      if (version !== requestVersion.current) return
      setChannels(nextChannels)
      setData(next)
      setSelectedId((current) => current || next.conversations[0]?.id || '')
      setMode('live')
    } catch (error) {
      if (version !== requestVersion.current) return
      if (isSharedInboxSchemaUnavailable(error) || /not configured/i.test(text(error?.message))) {
        setMode('preview')
        setSelectedId((current) => current || PREVIEW_CONVERSATIONS[0].id)
        return
      }
      setMode('error')
      setNotice(text(error?.message) || 'Unable to load the Revo inbox.')
    }
  }, [organisation?.id])

  useEffect(() => { setMode('loading'); setData({ conversations: [], messages: [], activity: [], associations: [] }); setChannels([]); setSelectedId(''); setWork({}); setInboxId('all'); setNotice(''); void load(); return () => { requestVersion.current += 1 } }, [load])
  useEffect(() => {
    if (!popup) return undefined
    const onClose = () => setPopup(null)
    popup.addEventListener('beforeunload', onClose)
    return () => { popup.removeEventListener('beforeunload', onClose); if (!popup.closed) popup.close() }
  }, [popup])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !organisation?.id) return undefined
    const channel = supabase
      .channel(`revo-inbox-${organisation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revo_inbox_conversations', filter: `organisation_id=eq.${organisation.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revo_inbox_messages', filter: `organisation_id=eq.${organisation.id}` }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load, organisation?.id])

  const conversations = useMemo(() => {
    if (mode === 'preview') return PREVIEW_CONVERSATIONS
    return data.conversations.map((item) => ({
      ...item,
      name: item.contactName || item.contactAddress,
      address: item.contactAddress,
      preview: item.lastMessagePreview,
      updated: formatTime(item.lastMessageAt),
      assignedTo: item.assignedUserId === user?.id ? 'You' : item.assignedUserId ? 'Assigned' : 'Unassigned',
      unread: false,
      messages: data.messages.filter((message) => message.conversationId === item.id),
    }))
  }, [data, mode, user?.id])
  const inboxes = useMemo(() => mode === 'preview' ? [
    { id: 'preview-email', address: 'inbox@revo.example', displayName: 'Email preview', connectionStatus: 'preview' },
    { id: 'preview-whatsapp', address: '+27 11 555 0100', displayName: 'WhatsApp preview', connectionStatus: 'preview' },
  ] : channels, [channels, mode])
  const scoped = useMemo(() => conversations.filter((item) => inboxId === 'all' || (mode === 'preview' ? item.channelAddress === inboxes.find((channel) => channel.id === inboxId)?.address : item.channelId === inboxId)), [conversations, inboxId, inboxes, mode])
  const visible = useMemo(() => scoped.filter((item) => matchesView(item, view, user?.id)
    && (channelFilter === 'all' || item.channel === channelFilter)
    && `${item.name} ${item.address} ${item.subject} ${item.preview}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'unread' ? (b.unreadCount || Number(b.unread)) - (a.unreadCount || Number(a.unread)) : sort === 'oldest' ? (Date.parse(a.lastMessageAt) || 0) - (Date.parse(b.lastMessageAt) || 0) : (Date.parse(b.lastMessageAt) || 0) - (Date.parse(a.lastMessageAt) || 0)), [scoped, query, user?.id, view, channelFilter, sort])
  const selected = visible.find((item) => item.id === selectedId) || visible[0] || null
  const draftKey = `${organisation?.id}:${selected?.id}:${composerMode}`
  const draft = work[draftKey] || ''
  const countFor = (key) => scoped.filter((item) => matchesView(item, key, user?.id)).length
  const selectedAssociations = data.associations.filter((item) => item.conversationId === selected?.id)
  const isLive = mode === 'live'

  const performUpdate = async (patch, successMessage, selectedConversation = selected) => {
    if (!selectedConversation || !isLive) { setNotice('This preview becomes operational after the Revo inbox migration is applied.'); return }
    if (saveLock.current) return
    saveLock.current = true
    setSaving(true)
    try {
      await updateRevoInboxConversation({ organisationId: organisation.id, conversationId: selectedConversation.id, ...patch })
      await load()
      setNotice(successMessage)
    } catch (error) { setNotice(text(error?.message) || 'The conversation could not be updated.') } finally { saveLock.current = false; setSaving(false) }
  }
  const savePrivateWork = async (selectedConversation = selected, body = draft, type = composerMode, workKey = draftKey) => {
    if (!selectedConversation || !isLive) { setNotice('This preview becomes operational after the Revo inbox migration is applied.'); return }
    if (saveLock.current) return
    saveLock.current = true
    setSaving(true)
    try {
      await saveRevoInboxPrivateMessage({ organisationId: organisation.id, conversation: selectedConversation, actorUserId: user?.id, bodyText: body, type })
      setWork((current) => ({ ...current, [workKey]: '' }))
      await load()
      setNotice(type === 'note' ? 'Internal note saved.' : 'Draft saved. It has not been sent.')
    } catch (error) { setNotice(text(error?.message) || 'The private inbox item could not be saved.') } finally { saveLock.current = false; setSaving(false) }
  }
  const selectConversation = async (conversationId) => {
    setSelectedId(conversationId)
    setMobileReader(true)
    setNotice('')
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!isLive || !conversation?.unreadCount) return
    try {
      await markRevoInboxConversationRead({ organisationId: organisation.id, conversationId })
      await load()
    } catch (error) {
      setNotice(text(error?.message) || 'The conversation could not be marked as read.')
    }
  }
  const requestWorkflowAction = async (actionType) => {
    if (!selected || !isLive) return setNotice('Connect a live Revo inbox before using workflow actions.')
    const listingId = selectedAssociations.find((item) => item.entityType === 'listing')?.entityId || null
    const leadId = selectedAssociations.find((item) => item.entityType === 'lead')?.entityId || null
    if (saveLock.current) return
    saveLock.current = true
    setSaving(true)
    try {
      await createRevoInboxWorkflowRequest({ organisationId: organisation.id, conversationId: selected.id, actionType, listingId, leadId, requestedBy: user?.id })
      setNotice(actionType === 'create_viewing' ? 'Viewing request created.' : 'Transaction handoff created; Arch9 will check for duplicates before creating a transaction.')
    } catch (error) { setNotice(text(error?.message) || 'The workflow action could not be created.') } finally { saveLock.current = false; setSaving(false) }
  }

  const openPopout = () => {
    if (popup && !popup.closed) { popup.focus(); return }
    const next = window.open('', '', 'popup,width=1050,height=850')
    if (!next) { setNotice('Allow pop-ups for Arch9 to open the email reader.'); return }
    next.document.title = 'Revo inbox — email reader'
    for (const style of document.querySelectorAll('link[rel="stylesheet"], style')) next.document.head.appendChild(style.cloneNode(true))
    next.document.body.className = 'revo-popout-body'
    setPopupConversationId(selected.id)
    setPopup(next)
  }
  const renderReader = (selected) => {
    const readerKey = `${organisation?.id}:${selected?.id}:${composerMode}`
    const draft = work[readerKey] || ''
    const setDraft = (value) => setWork((current) => ({ ...current, [readerKey]: value }))
    const selectedActivity = data.activity.filter((item) => item.conversationId === selected?.id)
    return selected ? <section className={`revo-thread ${selected.channel === 'email' ? 'revo-email-reader' : ''}`} aria-label="Conversation reader">
    <header><div><button className="revo-icon revo-mobile-back" type="button" aria-label="Back to conversations" onClick={() => { setMobileReader(false); setDetailsCollapsed(true) }}><ArrowLeft size={18} /></button><div className="revo-avatar revo-avatar-small" aria-hidden="true">{contactInitials(selected.name)}</div><div><h2>{selected.name}</h2><p>{selected.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} · {selected.address}</p></div></div><div>
      {selected.channel === 'email' ? <button className="revo-icon" type="button" onClick={openPopout} aria-label="Pop out email"><ExternalLink size={18} /></button> : null}
      <button className="revo-icon" type="button" disabled={saving || !isLive} aria-label={selected.status === 'closed' ? 'Reopen conversation' : 'Close conversation'} onClick={() => void performUpdate({ status: selected.status === 'closed' ? 'open' : 'closed' }, selected.status === 'closed' ? 'Conversation reopened.' : 'Conversation closed.', selected)}><CheckCircle2 size={18} /></button>
      <button className="revo-icon" type="button" aria-expanded={!detailsCollapsed} aria-label={detailsCollapsed ? 'Expand contact panel' : 'Collapse contact panel'} onClick={() => setDetailsCollapsed((current) => !current)}>{detailsCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}</button>
    </div></header>
    <div className="revo-thread-context"><span>{selected.subject || 'No subject'}</span><span className="revo-conversation-status"><Clock3 size={13} />{statusLabel(selected.status)}</span></div>
    <div className="revo-history">{selected.messages.map((message) => <article className={message.messageType === 'note' ? 'note' : message.direction} key={message.id}><b>{message.messageType === 'note' ? 'N' : message.direction === 'inbound' ? selected.name.slice(0, 1) : 'R'}</b><div><header><strong>{message.messageType === 'note' ? 'Internal note' : message.messageType === 'draft' ? 'Unsent draft' : message.direction === 'inbound' ? selected.name : 'Revo Property'}</strong><time>{formatTime(message.occurredAt)}</time></header>{selected.channel === 'email' && message.messageType !== 'note' ? <small>From: {message.senderAddress || (message.direction === 'inbound' ? selected.address : selected.channelAddress)} · To: {message.recipientAddresses?.join(', ') || (message.direction === 'inbound' ? selected.channelAddress : selected.address)}</small> : null}<p>{message.bodyText}</p></div></article>)}{!selected.messages.length ? <p className="revo-empty">No messages in this conversation yet.</p> : null}{selectedActivity.map((item) => <p className="revo-activity" key={item.id}>{activityCopy(item)} · {formatTime(item.createdAt)}</p>)}</div>
    <div className="revo-composer" data-mode={composerMode}><header><div className="revo-composer-tabs" role="group" aria-label="Composer mode"><button type="button" disabled={saving} aria-pressed={composerMode === 'draft'} className={composerMode === 'draft' ? 'active' : ''} onClick={() => setComposerMode('draft')}>Reply draft</button><button type="button" disabled={saving} aria-pressed={composerMode === 'note'} className={composerMode === 'note' ? 'active' : ''} onClick={() => setComposerMode('note')}>Internal note</button></div><span>{composerMode === 'note' ? 'Only your team can see this' : 'Private · not sent'}</span></header><textarea value={draft} disabled={saving} onChange={(event) => setDraft(event.target.value)} placeholder={composerMode === 'note' ? 'Leave context for your team…' : 'Write your reply…'} aria-label={composerMode === 'note' ? 'Internal note' : 'Reply draft'} /><footer><small>{composerMode === 'note' ? 'Private team note' : `To: ${selected.address}`}</small><button type="button" disabled={saving || !isLive || !draft.trim()} onClick={() => void savePrivateWork(selected, draft, composerMode, readerKey)}><FileText size={15} /> {saving ? 'Saving…' : composerMode === 'note' ? 'Save note' : 'Save draft'}</button></footer></div>
  </section> : <section className="revo-thread revo-reader-empty"><Inbox size={32} /><h2>Your conversations, in one place</h2><p>Select a conversation or adjust your filters.</p></section>
  }
  const reader = renderReader(selected)
  return <main className="revo-inbox-page">
    <header className="revo-inbox-topbar"><div className="revo-title"><h1>Inbox</h1><label className="revo-inbox-selector"><select aria-label="Select inbox" value={inboxId} onChange={(event) => { setInboxId(event.target.value); setMobileReader(false) }}><option value="all">All inboxes</option>{inboxes.map((item) => <option key={item.id} value={item.id}>{item.displayName || item.address} · {item.address} ({item.connectionStatus})</option>)}</select></label></div><div><button className="revo-icon" type="button" onClick={() => void load()} aria-label="Refresh inbox" title="Refresh inbox"><RefreshCw size={17} /></button><Link className="revo-compose" to="/revo/inbox/settings" aria-label="Manage inboxes" title="Manage inboxes"><SlidersHorizontal size={16} /><span>Manage inboxes</span></Link></div></header>
    {notice ? <p className="revo-notice" role="status">{notice}</p> : null}
    {mode === 'preview' ? <p className="revo-notice">Preview conversations — connect your inbox to start working with real messages.</p> : null}
    <section className={`revo-inbox-shell ${detailsCollapsed ? 'revo-details-collapsed' : ''} ${mobileReader ? 'revo-mobile-reader' : ''}`} aria-label="Revo shared inbox">
      <section className="revo-list" aria-label="Conversations"><header><label className="revo-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label><div className="revo-list-filters"><select aria-label="Conversation view" value={view} onChange={(event) => { setView(event.target.value); setMobileReader(false) }}>{VIEWS.map((item) => <option key={item.key} value={item.key}>{item.label} ({countFor(item.key)})</option>)}</select><select aria-label="Filter by channel" value={channelFilter} onChange={(event) => { setChannelFilter(event.target.value); setMobileReader(false) }}><option value="all">All channels</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></div><div className="revo-list-summary"><span aria-live="polite">{visible.length} {visible.length === 1 ? 'conversation' : 'conversations'}</span><select aria-label="Sort conversations" value={sort} onChange={(event) => setSort(event.target.value)}><option value="latest">Latest first</option><option value="oldest">Oldest first</option><option value="unread">Unread first</option><option value="name">Name A–Z</option></select></div></header><div>{mode === 'loading' ? <p className="revo-empty"><Clock3 size={22} />Loading conversations</p> : visible.map((item) => <button type="button" className={`revo-row ${item.id === selected?.id ? 'selected' : ''}`} aria-pressed={item.id === selected?.id} key={item.id} onClick={() => void selectConversation(item.id)}><span className="revo-row-avatar" aria-hidden="true">{contactInitials(item.name)}</span><span><span><strong>{item.name}</strong><time>{item.updated}</time></span><em>{item.subject || 'No subject'}</em><small>{item.preview || 'No message preview'}</small><small className="revo-row-meta"><ChannelIcon channel={item.channel} />{item.assignedTo} · {statusLabel(item.status)}</small></span>{item.unreadCount || item.unread ? <i aria-label={`${item.unreadCount || 1} unread messages`}>{item.unreadCount || 1}</i> : null}</button>)}{mode !== 'loading' && !visible.length ? <p className="revo-empty"><Inbox size={22} />{mode === 'error' ? 'Inbox could not be loaded. Try refreshing.' : 'No conversations match these filters.'}</p> : null}</div></section>
      {reader}
      {selected && !detailsCollapsed ? <aside className="revo-details" aria-label="Contact details" onKeyDown={(event) => { if (event.key === 'Escape') setDetailsCollapsed(true) }}><div className="revo-details-heading"><strong>Contact details</strong><button type="button" className="revo-icon" aria-label="Hide contact details" onClick={() => setDetailsCollapsed(true)}><PanelRightClose size={17} /></button></div><div className="revo-contact"><div className="revo-avatar" aria-hidden="true">{contactInitials(selected.name)}</div><h2>{selected.name}</h2><p>{selected.address}</p></div><dl><div><dt>Conversation owner</dt><dd><select aria-label="Conversation owner" value={selected.assignedUserId || ''} disabled={saving || !isLive} onChange={(event) => void performUpdate({ assignedUserId: event.target.value || null }, 'Conversation owner updated.')}><option value="">Unassigned</option><option value={user?.id || 'me'}>{agentName} (you)</option>{selected.assignedUserId && selected.assignedUserId !== user?.id ? <option value={selected.assignedUserId}>Assigned team member</option> : null}</select></dd></div><div><dt>Status</dt><dd><select aria-label="Conversation status" value={selected.status} disabled={saving || !isLive} onChange={(event) => void performUpdate({ status: event.target.value }, 'Conversation status updated.')}><option value="open">Open</option><option value="waiting_on_us">Waiting on us</option><option value="waiting_on_client">Waiting on client</option><option value="closed">Closed</option><option value="spam">Spam</option></select></dd></div></dl><section><strong>Linked records</strong>{selectedAssociations.length ? <ul>{selectedAssociations.map((item) => <li key={item.id}><FileText size={15} />{item.isPrimary ? 'Primary ' : ''}{item.entityType}</li>)}</ul> : <p>No linked records yet.</p>}</section><section><strong>Workflow requests</strong><div className="revo-quick-actions"><button type="button" disabled={saving || !isLive} onClick={() => void requestWorkflowAction('create_viewing')}><CalendarDays size={15} />Request viewing</button><button type="button" disabled={saving || !isLive} onClick={() => void requestWorkflowAction('create_transaction')}><FileText size={15} />Request transaction</button></div></section></aside> : null}
    </section>
    {popup && !popup.closed ? createPortal(<main className="revo-inbox-page revo-popout"><header className="revo-inbox-topbar"><h1>Email reader</h1><button type="button" className="revo-icon" aria-label="Close email window" onClick={() => setPopup(null)}><ArrowLeft size={18} /></button></header>{notice ? <p className="revo-notice" role="status">{notice}</p> : null}{renderReader(conversations.find((item) => item.id === popupConversationId))}</main>, popup.document.body) : null}
  </main>
}
