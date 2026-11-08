import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { safeEmailDocument } from '../../modules/sharedInbox/safeEmailDocument.js'
import { deletePrivateMailDraft, downloadMailAttachment, loadInlineMailImages, loadConversationPage, loadConversationActivity } from '../../modules/sharedInbox/receivedMailService.js'
import './inbox-thread.css'
import './inbox-outgoing.css'
function EmailFrame({ html, title }) {
  const observer = useRef(null)
  const [height, setHeight] = useState(96)
  useEffect(() => () => observer.current?.disconnect(), [])
  const measure = event => {
    observer.current?.disconnect()
    const content = event.currentTarget.contentDocument?.getElementById('mail-content')
    if (!content) return
    const resize = () => setHeight(Math.max(48, Math.min(12000, Math.ceil(content.getBoundingClientRect().height) + 24)))
    resize()
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(resize)
      observer.current.observe(content)
    }
  }
  return <iframe title={title} sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={html} onLoad={measure} style={{ height }} className="inbox-email-body" />
}
function MailBody({ message, allowHtml, organisationId }) {
  const html = allowHtml ? message.body_html?.trim() : ''
  const [showPlainText, setShowPlainText] = useState(false)
  const [loadImages, setLoadImages] = useState(true)
  const [inlineImages, setInlineImages] = useState({})
  const [imageError, setImageError] = useState('')
  useEffect(() => {
    let active = true
    if (html && /cid:/i.test(html)) {
      loadInlineMailImages({ organisationId, messageId: message.id })
        .then(images => { if (active) setInlineImages(images) })
        .catch(() => { if (active) setImageError('Some embedded pictures could not be loaded. You can still download available attachments below.') })
    }
    return () => { active = false }
  }, [html, organisationId, message.id])
  const formatted = Boolean(html) && !showPlainText
  return <>
    {html && <button type="button" className="inbox-body-toggle" aria-pressed={formatted} onClick={() => setShowPlainText(value => !value)}>{formatted ? 'Show plain text' : 'Show formatted email'}</button>}
    {formatted && /<img\b/i.test(html) && <div className="inbox-image-controls"><button type="button" className="inbox-body-toggle" aria-pressed={loadImages} onClick={() => setLoadImages(value => !value)}>{loadImages ? 'Block external images' : 'Load images'}</button>{!loadImages && <small>External pictures are blocked for privacy.</small>}</div>}
    {imageError && <small role="status">{imageError}</small>}
    {formatted ? <EmailFrame title={`Formatted email ${message.id}`} html={safeEmailDocument(html, { loadRemoteImages: loadImages, inlineImages })} /> : <p className="inbox-message-text">{message.body_text || 'This email has no plain text version. Choose “Show formatted email” to read it.'}</p>}
    {message.content_status === 'body_limited' && <small role="status">This message exceeds the display limit. Open the original mailbox for the complete email.</small>}
  </>
}
export default function InboxThreadMessages({ organisationId, conversation, agentName, revision, formatActivity, userId }) {
  const [messages, setMessages] = useState([]), [activity, setActivity] = useState([]), [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [downloading, setDownloading] = useState('')
  const [deleting, setDeleting] = useState(''), [confirmDelete, setConfirmDelete] = useState('')
  const deleteLock = useRef(false)
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
  const removeDraft = async message => {
    if(deleteLock.current)return
    deleteLock.current=true;setDeleting(message.id);setError('')
    try {
      await deletePrivateMailDraft({organisationId,conversationId:conversation.id,messageId:message.id,userId})
      if(active.current){setMessages(rows=>rows.filter(row=>row.id!==message.id));setConfirmDelete('')}
    } catch(cause) {if(active.current)setError(cause.message||'Draft could not be deleted.')}
    finally {deleteLock.current=false;if(active.current)setDeleting('')}
  }
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
      <div className="inbox-message-heading"><header><strong>{message.message_type === 'note' ? 'Internal note' : message.message_type === 'draft' ? 'Unsent draft' : message.direction === 'inbound' ? conversation.name : agentName}</strong><time>{new Date(message.occurred_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</time>{message.message_type==='draft'&&message.direction==='internal'&&message.delivery_status==='queued'&&userId&&message.created_by===userId&&<button type="button" className="inbox-delete-draft" aria-label="Delete unsent draft" title="Delete draft" disabled={Boolean(deleting)} onClick={()=>setConfirmDelete(message.id)}><Trash2 size={15}/></button>}</header>
      {conversation.channel === 'email' && message.message_type !== 'note' && <small>From: {message.sender_address} · To: {message.recipient_addresses?.join(', ')}</small>}
      </div>
      {confirmDelete===message.id&&<div className="inbox-delete-confirm" role="group" aria-label="Confirm draft deletion"><span>Delete this unsent draft?</span><button type="button" disabled={Boolean(deleting)} onClick={()=>void removeDraft(message)}>{deleting===message.id?'Deleting…':'Delete draft'}</button><button type="button" disabled={Boolean(deleting)} onClick={()=>setConfirmDelete('')}>Cancel</button></div>}
      <MailBody key={`${organisationId}:${message.id}:${message.body_html || ''}`} organisationId={organisationId} message={message} allowHtml={conversation.channel === 'email' && message.message_type === 'message'} />
      {message.direction==='outbound'&&message.message_type==='message'&&message.delivery_status!=='sent'&&<small className="inbox-delivery-state">{{queued:'Queued for sending',sending:'Awaiting provider confirmation',sent:'Accepted by provider',delivered:'Delivered',read:'Read',failed:'Not sent — check outgoing email',uncertain:'Confirmation unavailable — check your provider before resending',cancelled:'Cancelled'}[message.delivery_status]||'Delivery status unavailable'}</small>}
      {message.attachments?.length > 0 && <ul className="inbox-message-attachments" aria-label="Attachments">{message.attachments.map(file => <li key={file.id}>{file.state === 'available' ? <button type="button" disabled={Boolean(downloading)} onClick={() => void download(file)}>{downloading === file.id ? 'Downloading…' : `Download ${file.filename}`} ({Math.ceil(file.size/1024)} KB)</button> : <span>{file.filename} · {file.state === 'too_large' ? 'Exceeds attachment limit; open in your mailbox' : 'This attachment type must be opened in your mailbox'}</span>}</li>)}</ul>}
    </div></article>)}
    {!loading && !error && !messages.length && <p className="revo-empty">No messages in this conversation yet.</p>}
    {activity.filter(item => !['status_changed', 'received', 'message_received', 'email_received'].includes(item.action)).map(item => <p className="revo-activity" key={item.id}>{formatActivity ? formatActivity({ ...item, metadata: item.metadata_json }) : String(item.action).replaceAll('_',' ')} · {new Date(item.created_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</p>)}
  </div>
}
