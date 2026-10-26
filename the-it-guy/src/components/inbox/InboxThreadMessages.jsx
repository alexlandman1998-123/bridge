import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { safeEmailDocument } from '../../modules/sharedInbox/safeEmailDocument.js'
import { downloadMailAttachment, loadConversationPage, loadConversationActivity } from '../../modules/sharedInbox/receivedMailService.js'
import './inbox-thread.css'
import './inbox-outgoing.css'
function MailBody({ message }) {
  const [formatted, setFormatted] = useState(!message.body_text && Boolean(message.body_html))
  return <>
    {message.body_html && <button type="button" className="inbox-body-toggle" aria-pressed={formatted} onClick={() => setFormatted(value => !value)}>{formatted ? 'Show plain text' : 'Show formatted email'}</button>}
    {formatted && message.body_html ? <iframe title={`Formatted email ${message.id}`} sandbox="" referrerPolicy="no-referrer" srcDoc={safeEmailDocument(message.body_html)} className="inbox-email-body" /> : <p className="inbox-message-text">{message.body_text || 'This email has no plain text version. Choose “Show formatted email” to read it.'}</p>}
    {message.content_status === 'body_limited' && <small role="status">This message exceeds the display limit. Open the original mailbox for the complete email.</small>}
    {message.content_status === 'legacy_preview' && <small>Previously imported preview. A history import can retrieve the full message.</small>}
  </>
}
export default function InboxThreadMessages({ organisationId, conversation, agentName, revision, formatActivity }) {
  const [messages, setMessages] = useState([]), [activity, setActivity] = useState([]), [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [downloading, setDownloading] = useState('')
  const active = useRef(true), generation = useRef(0), lock = useRef(false), history = useRef(null), scroll = useRef(null)
  const load = useCallback(async (before = null) => {
    if (lock.current) return
    lock.current = true
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const result = await loadConversationPage({ organisationId, conversationId: conversation.id, before })
      if (!active.current || request !== generation.current) return
      scroll.current = before ? { height: history.current.scrollHeight, top: history.current.scrollTop } : { bottom: true }
      setMessages(current => before ? [...result.messages.filter(message => !current.some(row => row.id === message.id)),...current] : result.messages)
      setMore(result.hasMore === true)
    } catch { if (active.current && request === generation.current) setError('Messages could not be loaded. Refresh this conversation to try again.') }
    finally { if (request === generation.current) { lock.current = false; if (active.current) setLoading(false) } }
  }, [organisationId, conversation.id])
  useEffect(() => {
    let cancelled = false
    const requests = generation
    active.current = true; lock.current = false
    void load()
    loadConversationActivity({ organisationId, conversationId: conversation.id }).then(rows => { if (!cancelled) setActivity(rows) }).catch(() => {})
    return () => { cancelled = true; active.current = false; requests.current++ }
  }, [load, revision, organisationId, conversation.id])
  useLayoutEffect(() => {
    const node = history.current, change = scroll.current
    if (!node || !change) return
    node.scrollTop = change.bottom ? node.scrollHeight : change.top + node.scrollHeight - change.height
    scroll.current = null
  }, [messages])
  const download = async file => {
    if (downloading) return
    setDownloading(file.id); setError('')
    try {
      const blob = await downloadMailAttachment({ organisationId, attachmentId: file.id })
      if (!active.current) return
      const url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = file.filename; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { if (active.current) setError('Attachment unavailable. Refresh the conversation or check mailbox access.') }
    finally { if (active.current) setDownloading('') }
  }
  return <div className="revo-history" ref={history}>
    {more && <button type="button" disabled={loading} onClick={() => void load(messages[0])}>Load older messages</button>}
    {loading && <p role="status">Loading messages…</p>}
    {error && <p role="alert">{error} <button type="button" disabled={loading} onClick={() => void load()}>Refresh conversation</button></p>}
    {messages.map(message => <article key={message.id} className={message.message_type === 'note' ? 'note' : message.direction}><b>{message.message_type === 'note' ? 'N' : message.direction === 'inbound' ? conversation.name.slice(0,1) : 'R'}</b><div>
      <header><strong>{message.message_type === 'note' ? 'Internal note' : message.message_type === 'draft' ? 'Unsent draft' : message.direction === 'inbound' ? conversation.name : agentName}</strong><time>{new Date(message.occurred_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</time></header>
      {conversation.channel === 'email' && message.message_type !== 'note' && <small>From: {message.sender_address} · To: {message.recipient_addresses?.join(', ')}</small>}
      <MailBody message={message} />
      {message.direction==='outbound'&&message.message_type==='message'&&<small className="inbox-delivery-state">{{queued:'Queued for sending',sending:'Awaiting provider confirmation',sent:'Accepted by provider',delivered:'Delivered',read:'Read',failed:'Not sent — check outgoing email',uncertain:'Confirmation unavailable — check your provider before resending',cancelled:'Cancelled'}[message.delivery_status]||'Delivery status unavailable'}</small>}
      {message.attachments?.length > 0 && <ul className="inbox-message-attachments" aria-label="Attachments">{message.attachments.map(file => <li key={file.id}>{file.state === 'available' ? <button type="button" disabled={Boolean(downloading)} onClick={() => void download(file)}>{downloading === file.id ? 'Downloading…' : `Download ${file.filename}`} ({Math.ceil(file.size/1024)} KB)</button> : <span>{file.filename} · {file.state === 'too_large' ? 'Exceeds attachment limit; open in your mailbox' : 'This attachment type must be opened in your mailbox'}</span>}</li>)}</ul>}
    </div></article>)}
    {!loading && !error && !messages.length && <p className="revo-empty">No messages in this conversation yet.</p>}
    {activity.map(item => <p className="revo-activity" key={item.id}>{formatActivity ? formatActivity({ ...item, metadata: item.metadata_json }) : String(item.action).replaceAll('_',' ')} · {new Date(item.created_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</p>)}
  </div>
}
