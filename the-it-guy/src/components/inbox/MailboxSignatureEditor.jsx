import { useEffect, useRef, useState } from 'react'
import { EMPTY_INBOX_SIGNATURE, normalizeInboxSignature, renderInboxSignature, renderSignatureBody, signatureUrl } from '../../../../supabase/functions/_shared/inboxSignature.js'
import { loadMailboxSignature, saveMailboxSignature } from '../../modules/sharedInbox/mailboxService.js'

// Translate the edited DOM to text runs. HTML is never sent to storage.
function editorRuns(root) {
  const runs = []
  function walk(node, format = {}) {
    if (node.nodeType === 3) { if (node.textContent) runs.push({ text: node.textContent, ...format }); return }
    if (node.nodeType !== 1 || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'IMG'].includes(node.tagName)) return
    if (node.tagName === 'BR') { runs.push({ text: '\n' }); return }
    const next = { ...format }
    if (['B', 'STRONG'].includes(node.tagName)) next.bold = true
    if (['I', 'EM'].includes(node.tagName)) next.italic = true
    if (node.tagName === 'A' && signatureUrl(node.getAttribute('href'))) next.href = signatureUrl(node.getAttribute('href'))
    for (const child of node.childNodes) walk(child, next)
    if (['DIV', 'P', 'LI'].includes(node.tagName) && node !== root) runs.push({ text: '\n' })
  }
  walk(root)
  return runs
}
function SignatureText({ value, onChange, disabled }) {
  const editor = useRef(null), selection = useRef(null)
  const [url, setUrl] = useState(''), [linkError, setLinkError] = useState('')
  useEffect(() => {
    if (editor.current && document.activeElement !== editor.current) editor.current.innerHTML = renderSignatureBody(value)
  }, [value])
  const remember = () => {
    const current = window.getSelection()
    if (current?.rangeCount && editor.current?.contains(current.anchorNode)) selection.current = current.getRangeAt(0).cloneRange()
  }
  const insert = (tag, text = '') => {
    if (disabled) return
    if (tag === 'a' && !signatureUrl(url)) return setLinkError('Use an https://, mailto: or tel: link.')
    editor.current.focus()
    let range = selection.current
    if (!range || !editor.current.contains(range.commonAncestorContainer)) {
      range = document.createRange(); range.selectNodeContents(editor.current); range.collapse(false)
    }
    const node = tag ? document.createElement(tag) : document.createTextNode(text)
    if (tag) {
      if (tag === 'a') node.setAttribute('href', signatureUrl(url))
      node.appendChild(range.extractContents())
      if (!node.textContent) node.textContent = tag === 'a' ? url : 'Text'
    } else range.deleteContents()
    range.insertNode(node); range.setStartAfter(node); range.collapse(true)
    const current = window.getSelection(); current.removeAllRanges(); current.addRange(range)
    selection.current = range.cloneRange(); onChange(editorRuns(editor.current)); setLinkError('')
  }
  return <div className="inbox-signature-text">
    <div className="inbox-formatting" role="group" aria-label="Signature formatting">
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => insert('strong')}>Bold</button>
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => insert('em')}>Italic</button>
      <label>Link destination<input type="text" inputMode="url" value={url} disabled={disabled} placeholder="https://… or mailto:…" onChange={event => setUrl(event.target.value)} /></label>
      <button type="button" disabled={disabled || !url} onClick={() => insert('a')}>Insert link</button>
    </div>
    <div ref={editor} role="textbox" aria-label="Signature message" aria-multiline="true" aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning
      onInput={() => onChange(editorRuns(editor.current))} onKeyUp={remember} onMouseUp={remember} onBlur={remember}
      onPaste={event => { event.preventDefault(); insert(null, event.clipboardData.getData('text/plain')) }}
      onDrop={event => { event.preventDefault(); insert(null, event.dataTransfer.getData('text/plain')) }} />
    {linkError && <p role="alert">{linkError}</p>}
  </div>
}
export default function MailboxSignatureEditor({ organisationId, mailbox }) {
  const [signature, setSignature] = useState({ ...EMPTY_INBOX_SIGNATURE, body: [] })
  const [defaults, setDefaults] = useState({ useForNew: true, useForReplies: false })
  const [revision, setRevision] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(true)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0)
  const active = useRef(true), saveLock = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let current = true
    setLoading(true); setError(''); setNotice('')
    loadMailboxSignature({ organisationId, channelId: mailbox.id }).then(row => {
      if (!current) return
      setSignature(normalizeInboxSignature(row?.signature_json || EMPTY_INBOX_SIGNATURE)); setLoadFailed(false)
      setDefaults({ useForNew: row?.use_for_new ?? true, useForReplies: row?.use_for_replies ?? false }); setRevision(row?.revision || 0)
    }).catch(cause => { if (current) { setLoadFailed(true); setError(cause.message || 'The signature could not be loaded.') } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [organisationId, mailbox.id, reload])
  const disabled = loading || loadFailed || busy || !mailbox.permissions.manage
  let preview = '', previewError = ''
  try { preview = renderInboxSignature(signature) } catch (cause) { previewError = cause.message }
  const save = async event => {
    event.preventDefault()
    if (disabled || saveLock.current || previewError) return
    saveLock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const saved = await saveMailboxSignature({ organisationId, channelId: mailbox.id, signature, ...defaults, revision })
      if (active.current) { setRevision(saved.revision); setNotice('Signature saved for this mailbox.'); setSignature(normalizeInboxSignature(saved.signature_json)) }
    } catch (cause) { if (active.current) setError(cause.message || 'The signature could not be saved.') }
    finally { saveLock.current = false; if (active.current) setBusy(false) }
  }
  if (loading) return <p role="status">Loading signature…</p>
  return <section aria-label={`Signature for ${mailbox.address}`}>
    <div className="inbox-settings-heading"><div><h3>Signature for {mailbox.address}</h3><p>One signature for this mailbox, with separate defaults for new messages and replies.</p></div><button type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload signature</button></div>
    {!mailbox.permissions.manage && <p>Only the mailbox owner or a mailbox manager can change this signature.</p>}
    {error && <p className="inbox-settings-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="inbox-signature-grid"><form onSubmit={save}>
      <fieldset disabled={disabled}><legend>Contact details</legend><div className="inbox-form-grid">{[['name','Full name'],['title','Job title'],['company','Company'],['phone','Phone'],['email','Email address'],['website','Website'],['logoUrl','Logo URL']].map(([key,label]) => <label key={key}>{label}<input value={signature[key]} type={key === 'email' ? 'email' : 'text'} maxLength={['website','logoUrl'].includes(key) ? 2048 : 500} placeholder={['website','logoUrl'].includes(key) ? 'https://…' : undefined} onChange={event => setSignature(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div></fieldset>
      <div className="inbox-field-heading">Signature message</div><SignatureText value={signature.body} onChange={body => setSignature(current => ({ ...current, body }))} disabled={disabled} />
      <fieldset disabled={disabled}><legend>Insert signature by default</legend>
        <label className="inbox-checkbox"><input type="checkbox" checked={defaults.useForNew} onChange={event => setDefaults(current => ({ ...current, useForNew: event.target.checked }))} />New messages</label>
        <label className="inbox-checkbox"><input type="checkbox" checked={defaults.useForReplies} onChange={event => setDefaults(current => ({ ...current, useForReplies: event.target.checked }))} />Replies</label>
      </fieldset>
      {previewError && <p role="alert" className="inbox-settings-error">{previewError}</p>}
      <button type="submit" className="inbox-primary" disabled={disabled || Boolean(previewError)}>{busy ? 'Saving signature…' : 'Save signature'}</button>
    </form><aside className="inbox-signature-preview"><h4>Live preview</h4><p>Your signature appears below your message.</p><iframe title="Signature preview" sandbox="" srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:20px;overflow-wrap:anywhere">${preview}</body></html>`} /><small>Defaults are saved here. Automatic insertion will be enabled when Inbox sending is available.</small></aside></div>
  </section>
}
