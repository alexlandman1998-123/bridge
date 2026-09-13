import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, ChevronDown, Clock3, Inbox, Mail, MessageCircle, MoreHorizontal, Plus, Search, Send, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { useOrganisation } from '../../context/OrganisationContext'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { isSharedInboxSchemaUnavailable, loadRevoInbox, markRevoInboxConversationRead, saveRevoInboxPrivateMessage, updateRevoInboxConversation } from '../../modules/revo/sharedInbox/revoSharedInboxService'
import './RevoSharedInboxPage.css'

const PREVIEW_CONVERSATIONS = Object.freeze([
  { id: 'preview-lerato', channel: 'whatsapp', providerKey: 'preview', channelAddress: '+27 11 555 0100', name: 'Lerato Mokoena', address: '+27 82 555 0142', subject: 'Viewing at The Mews', preview: 'That sounds perfect, thank you. What time can we view it?', updated: '9:42 AM', assignedTo: 'You', status: 'open', unread: true, messages: [{ id: '1', direction: 'inbound', bodyText: 'Hi, I saw the listing for The Mews. Is it still available?', occurredAt: '9:37 AM', messageType: 'message' }, { id: '2', direction: 'outbound', bodyText: 'Hi Lerato — yes, it is. I can arrange a viewing this week.', occurredAt: '9:40 AM', messageType: 'message' }, { id: '3', direction: 'inbound', bodyText: 'That sounds perfect, thank you. What time can we view it?', occurredAt: '9:42 AM', messageType: 'message' }] },
  { id: 'preview-michael', channel: 'email', providerKey: 'preview', channelAddress: 'inbox@revo.example', name: 'Michael Adams', address: 'michael.adams@example.test', subject: 'Offer documentation', preview: 'I have attached the signed offer and proof of payment for your review.', updated: '8:25 AM', assignedTo: 'Unassigned', status: 'open', unread: true, messages: [{ id: '4', direction: 'inbound', bodyText: 'I have attached the signed offer and proof of payment for your review.', occurredAt: '8:25 AM', messageType: 'message' }] },
  { id: 'preview-aisha', channel: 'whatsapp', providerKey: 'preview', channelAddress: '+27 11 555 0100', name: 'Aisha Patel', address: '+27 84 200 1818', subject: 'Valuation enquiry', preview: 'Could someone call me this afternoon?', updated: 'Yesterday', assignedTo: 'Tumi N.', status: 'open', unread: false, messages: [{ id: '5', direction: 'inbound', bodyText: 'Could someone call me this afternoon?', occurredAt: 'Yesterday, 4:18 PM', messageType: 'message' }] },
])
const VIEWS = Object.freeze([
  { key: 'all', label: 'All open' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'team', label: 'My team' },
  { key: 'waiting_on_us', label: 'Waiting on us' },
  { key: 'closed', label: 'Closed' },
])

function text(value = '') { return String(value ?? '').trim() }
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
  const { user } = useAuthSession()
  const [data, setData] = useState({ conversations: [], messages: [], activity: [], associations: [] })
  const [mode, setMode] = useState('loading')
  const [selectedId, setSelectedId] = useState('')
  const [view, setView] = useState('all')
  const [query, setQuery] = useState('')
  const [composerMode, setComposerMode] = useState('draft')
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!organisation?.id) return
    setMode('loading')
    try {
      const next = await loadRevoInbox(organisation.id)
      setData(next)
      setSelectedId((current) => current || next.conversations[0]?.id || '')
      setMode('live')
    } catch (error) {
      if (isSharedInboxSchemaUnavailable(error) || /not configured/i.test(text(error?.message))) {
        setMode('preview')
        setSelectedId((current) => current || PREVIEW_CONVERSATIONS[0].id)
        return
      }
      setMode('error')
      setNotice(text(error?.message) || 'Unable to load the Revo inbox.')
    }
  }, [organisation?.id])

  useEffect(() => { void load() }, [load])

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
  const visible = useMemo(() => conversations.filter((item) => matchesView(item, view, user?.id) && `${item.name} ${item.address} ${item.subject} ${item.preview}`.toLowerCase().includes(query.trim().toLowerCase())), [conversations, query, user?.id, view])
  const selected = conversations.find((item) => item.id === selectedId) || visible[0] || null
  const countFor = (key) => conversations.filter((item) => matchesView(item, key, user?.id)).length
  const selectedActivity = data.activity.filter((item) => item.conversationId === selected?.id)
  const selectedAssociations = data.associations.filter((item) => item.conversationId === selected?.id)
  const isLive = mode === 'live'

  const performUpdate = async (patch, successMessage) => {
    if (!selected || !isLive) { setNotice('This preview becomes operational after the Revo inbox migration is applied.'); return }
    setSaving(true)
    try {
      await updateRevoInboxConversation({ organisationId: organisation.id, conversationId: selected.id, ...patch })
      await load()
      setNotice(successMessage)
    } catch (error) { setNotice(text(error?.message) || 'The conversation could not be updated.') } finally { setSaving(false) }
  }
  const savePrivateWork = async () => {
    if (!selected || !isLive) { setNotice('This preview becomes operational after the Revo inbox migration is applied.'); return }
    setSaving(true)
    try {
      await saveRevoInboxPrivateMessage({ organisationId: organisation.id, conversation: selected, actorUserId: user?.id, bodyText: draft, type: composerMode })
      setDraft('')
      await load()
      setNotice(composerMode === 'note' ? 'Internal note saved.' : 'Draft saved. It has not been sent.')
    } catch (error) { setNotice(text(error?.message) || 'The private inbox item could not be saved.') } finally { setSaving(false) }
  }
  const selectConversation = async (conversationId) => {
    setSelectedId(conversationId)
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

  return <main className="revo-inbox-page">
    <header className="revo-inbox-topbar"><div><p><Inbox size={17} /> Revo <i /> Shared inbox</p><h1>Conversations</h1></div><div><span className="revo-preview"><Sparkles size={14} /> {isLive ? 'Revo workspace' : 'Preview workspace'}</span><Link className="revo-icon" to="/revo/inbox/settings" aria-label="Channel setup"><SlidersHorizontal size={18} /></Link><button className="revo-compose" type="button" onClick={() => setNotice('New conversations will be created when a Revo channel is connected.')}><Plus size={18} /> Compose</button></div></header>
    <section className="revo-inbox-shell" aria-label="Revo shared inbox">
      <aside className="revo-views"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search conversations" /></label><nav><small>INBOX</small>{VIEWS.map((item) => <button type="button" className={view === item.key ? 'active' : ''} key={item.key} onClick={() => setView(item.key)}><span>{item.label}</span><b>{countFor(item.key)}</b></button>)}</nav><nav><small>CHANNELS</small><button type="button"><span><Mail size={16} /> Email</span><b>{conversations.filter((item) => item.channel === 'email').length}</b></button><button type="button"><span><MessageCircle size={16} /> WhatsApp</span><b>{conversations.filter((item) => item.channel === 'whatsapp').length}</b></button></nav><p className="revo-connection"><Clock3 size={15} /> {isLive ? 'Channels can connect when Revo is ready.' : 'Preview data — no channel is connected.'}</p></aside>
      <section className="revo-list"><header><div><strong>{VIEWS.find((item) => item.key === view)?.label}</strong><span>{visible.length} conversations</span></div><button className="revo-icon" type="button" aria-label="Filter conversations"><SlidersHorizontal size={18} /></button></header><div>{mode === 'loading' ? <p className="revo-empty"><Clock3 size={22} /> Loading conversations</p> : visible.map((item) => <button type="button" className={`revo-row ${item.id === selected?.id ? 'selected' : ''}`} key={item.id} onClick={() => void selectConversation(item.id)}><span className={`revo-channel ${item.channel}`}><ChannelIcon channel={item.channel} /></span><span><span><strong>{item.name}</strong><time>{item.updated}</time></span><em>{item.subject}</em><small>{item.preview}</small></span>{item.unreadCount || item.unread ? <i aria-label={`${item.unreadCount || 1} unread messages`}>{item.unreadCount || 1}</i> : null}</button>)}{mode !== 'loading' && !visible.length ? <p className="revo-empty"><Inbox size={22} /> No conversations found</p> : null}</div></section>
      {selected ? <section className="revo-thread"><header><div><span className={`revo-channel ${selected.channel}`}><ChannelIcon channel={selected.channel} /></span><div><h2>{selected.subject || 'Conversation'}</h2><p>{selected.address}</p></div></div><div><button className="revo-icon" type="button" aria-label="Close conversation" disabled={saving} onClick={() => performUpdate({ status: selected.status === 'closed' ? 'open' : 'closed' }, selected.status === 'closed' ? 'Conversation reopened.' : 'Conversation closed.')}><CheckCircle2 size={19} /></button><button className="revo-icon" type="button" aria-label="Archive conversation"><Archive size={18} /></button><button className="revo-icon" type="button" aria-label="More options"><MoreHorizontal size={19} /></button></div></header><div className="revo-history"><span>Conversation</span>{selected.messages.map((message) => <article className={message.messageType === 'note' ? 'note' : message.direction} key={message.id}><b>{message.messageType === 'note' ? 'N' : message.direction === 'inbound' ? selected.name.slice(0, 1) : 'R'}</b><div><header><strong>{message.messageType === 'note' ? 'Internal note' : message.direction === 'inbound' ? selected.name : 'Revo Property Site'}</strong><time>{formatTime(message.occurredAt)}</time></header><p>{message.bodyText}</p></div></article>)}{selectedActivity.map((item) => <p className="revo-activity" key={item.id}>{activityCopy(item)} · {formatTime(item.createdAt)}</p>)}</div><div className="revo-composer"><header><button type="button" className={composerMode === 'draft' ? 'active' : ''} onClick={() => setComposerMode('draft')}>Draft reply</button><button type="button" className={composerMode === 'note' ? 'active' : ''} onClick={() => setComposerMode('note')}>Note</button><span>{composerMode === 'note' ? 'Internal only' : 'Not sent'}</span></header><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={composerMode === 'note' ? `Add an internal note about ${selected.name}…` : `Draft a reply to ${selected.name}…`} aria-label={composerMode === 'note' ? 'Internal note' : 'Reply draft'} /><footer><span><Plus size={16} /> Attachments connect later</span><button type="button" disabled={saving} onClick={() => void savePrivateWork()}><Send size={15} /> {saving ? 'Saving…' : composerMode === 'note' ? 'Save note' : 'Save draft'}</button></footer>{notice ? <p>{notice}</p> : null}</div></section> : null}
      {selected ? <aside className="revo-details"><div className="revo-avatar">{selected.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><h2>{selected.name}</h2><p>{selected.address}</p><button type="button">View contact <ChevronDown size={15} /></button><dl><div><dt>Conversation owner</dt><dd><button className="revo-assignment" type="button" disabled={saving} onClick={() => void performUpdate({ assignedUserId: selected.assignedUserId ? null : user?.id }, selected.assignedUserId ? 'Conversation unassigned.' : 'Conversation assigned to you.')}>{selected.assignedTo} <ChevronDown size={14} /></button></dd></div><div><dt>Status</dt><dd><select aria-label="Conversation status" value={selected.status} disabled={saving} onChange={(event) => void performUpdate({ status: event.target.value }, 'Conversation status updated.')}><option value="open">Open</option><option value="waiting_on_us">Waiting on us</option><option value="waiting_on_client">Waiting on client</option><option value="closed">Closed</option><option value="spam">Spam</option></select></dd></div><div><dt>Channel</dt><dd><ChannelIcon channel={selected.channel} /> {selected.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</dd></div></dl><section><strong>Linked records</strong>{selectedAssociations.length ? <ul>{selectedAssociations.map((association) => <li key={association.id}>{association.isPrimary ? 'Primary ' : ''}{association.entityType}</li>)}</ul> : <p>No contact, listing, lead or transaction linked yet.</p>}</section><section><strong>Contact details</strong><p>{isLive ? 'Conversation history, private notes, ownership, status and record associations are stored only in Revo.' : 'This preview will become live after the Revo inbox migration is approved and applied.'}</p></section></aside> : null}
    </section>
  </main>
}
