import { useEffect, useRef, useState } from 'react'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import { CHAT_EXPORT_MAX_BYTES, prepareWhatsAppChatImport, parseWhatsAppChatExport } from '../../../../supabase/functions/_shared/whatsappChatExport.js'
import './WhatsAppChatImport.css'

export default function WhatsAppChatImport({ onImported }) {
  const workspace = useMetaWorkspace()
  // Remounting clears customer data whenever the organisation changes.
  return workspace.canManage ? <ImportForm key={workspace.organisationId} workspace={workspace} onImported={onImported} /> : null
}

function ImportForm({ workspace, onImported }) {
  const [open, setOpen] = useState(false), [source, setSource] = useState(''), [filename, setFilename] = useState('')
  const [senderId, setSenderId] = useState(''), [phone, setPhone] = useState(''), [name, setName] = useState('')
  const [dateOrder, setOrder] = useState('DMY'), [utcOffset, setOffset] = useState('+02:00'), [businessAuthor, setAuthor] = useState('')
  const [preview, setPreview] = useState(null), [review, setReview] = useState(null), [checked, setChecked] = useState(false)
  const [error, setError] = useState(''), [receipt, setReceipt] = useState(null), [busy, setBusy] = useState(false)
  const alive = useRef(true), fileGeneration = useRef(0), dialog = useRef(null), opener = useRef(null), reviewPanel = useRef(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!open) return
    const button = opener.current
    dialog.current?.focus()
    return () => button?.focus()
  }, [open])
  useEffect(() => { if (review) { reviewPanel.current?.focus(); if (dialog.current) dialog.current.scrollTop = 0 } }, [review])
  useEffect(() => {
    setReview(null); setChecked(false)
    if (!source) { setPreview(null); return }
    try { setPreview(parseWhatsAppChatExport(source, { dateOrder, utcOffset })); setError('') }
    catch (cause) { setPreview(null); setError(cause.message) }
  }, [source, dateOrder, utcOffset, businessAuthor, senderId, phone, name])
  const senders = (workspace.senders || []).filter(row => row.connection_status === 'connected' && row.onboarding_mode === 'coexistence')
  async function readFile(event) {
    const file = event.target.files?.[0], generation = ++fileGeneration.current
    setSource(''); setAuthor(''); setReview(null); setError(''); setReceipt(null)
    if (!file) return
    if (!/\.txt$/i.test(file.name) || file.size > CHAT_EXPORT_MAX_BYTES) { setError('Choose the original WhatsApp .txt export, up to 1 MB. Extract a ZIP first.'); return }
    try {
      const data = await file.text()
      if (alive.current && generation === fileGeneration.current) { setSource(data); setFilename(file.name) }
    } catch { if (alive.current && generation === fileGeneration.current) setError('The file could not be read.') }
  }
  function close() { fileGeneration.current++; setOpen(false); setSource(''); setFilename(''); setPhone(''); setName(''); setAuthor(''); setError(''); setReceipt(null); setPreview(null); setReview(null) }
  function reviewFile(event) {
    event.preventDefault(); setError('')
    try {
      if (!senders.some(row => row.id === senderId)) throw Error('Choose a connected WhatsApp number.')
      if (!/^[1-9][0-9]{6,14}$/.test(phone.replace(/[\s()+.-]/g, ''))) throw Error('Enter the customer’s number with country code.')
      setReview(prepareWhatsAppChatImport(source, { dateOrder, utcOffset, businessAuthor })); setChecked(false)
    } catch (cause) { setError(cause.message) }
  }
  async function importFile() {
    if (!review || !checked || busy) return
    setBusy(true); setError('')
    try {
      const result = await metaIntegrationRequest(workspace.organisationId, 'import_chat_export', { source, senderId, contactPhone: phone, contactName: name, dateOrder, utcOffset, businessAuthor })
      if (alive.current) { setReceipt(result); setReview(null); setSource(''); setPreview(null); onImported?.(result) }
    } catch (cause) { if (alive.current) setError(cause.message) }
    finally { if (alive.current) setBusy(false) }
  }
  function dialogKey(event) {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); close() }
    if (event.key !== 'Tab') return
    const fields = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node => !node.closest('fieldset:disabled,[hidden]'))
    const first = fields[0], last = fields.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    if (!fields.length) event.preventDefault()
  }
  return <><button ref={opener} type="button" onClick={() => setOpen(true)}>Import WhatsApp chat</button>{open && <div className="wa-import-backdrop"><section ref={dialog} tabIndex={-1} onKeyDown={dialogKey} className="wa-import-dialog" role="dialog" aria-modal="true" aria-label="Import WhatsApp chat">
    <h2>Import WhatsApp chat</h2><p>Export one chat from WhatsApp → contact name → Export chat → Without media. If you receive a ZIP, extract it and choose the .txt file. This pilot supports up to 500 messages.</p>
    <p>Messages appear as historical records. Attachments are excluded. Importing does not open a reply window or add marketing consent. Matching existing text and timestamps are treated as duplicates because exports contain no Meta message IDs.</p>
    <form hidden={Boolean(review)} onSubmit={reviewFile}><fieldset disabled={busy}>
      <label>Business WhatsApp number<select required value={senderId} onChange={event => setSenderId(event.target.value)}><option value="">Choose number</option>{senders.map(row => <option key={row.id} value={row.id}>{row.business_display_name} {row.display_phone_number}</option>)}</select></label>
      {!senders.length && <p>No connected WhatsApp Business app numbers are available.</p>}
      <label>Customer WhatsApp number<input required value={phone} placeholder="+27 82 123 4567" onChange={event => setPhone(event.target.value)} /></label>
      <label>Customer name (optional)<input value={name} maxLength={160} onChange={event => setName(event.target.value)} /></label>
      <label>WhatsApp text export<input type="file" accept=".txt,text/plain" onChange={readFile} /></label>
      <label>Date order<select value={dateOrder} onChange={event => setOrder(event.target.value)}><option value="DMY">Day / month / year</option><option value="MDY">Month / day / year</option></select></label>
      <label>Export timezone (UTC offset)<input required value={utcOffset} onChange={event => setOffset(event.target.value)} /></label>
      {preview && <label>Your business appears in this export as<select required value={businessAuthor} onChange={event => setAuthor(event.target.value)}><option value="">Choose participant</option>{preview.participants.map(author => <option key={author}>{author}</option>)}</select></label>}
      <button type="submit" disabled={!preview || !businessAuthor || !!receipt}>Review import</button>
    </fieldset></form>
    {review && <section ref={reviewPanel} tabIndex={-1} aria-label="Review chat import"><h3>Review {filename}</h3><p>{review.messages.length} messages · {review.skipped} system notices excluded</p><p>{review.firstAt} to {review.lastAt} (UTC)</p><p>Customer: {name} {phone}<br />Business: {businessAuthor} · {senders.find(row => row.id === senderId)?.display_phone_number}</p><ol>{review.messages.slice(0, 5).map((row, index) => <li key={index}><time>{row.at}</time> · {row.direction === 'outbound' ? 'Business' : 'Customer'}<pre>{row.body}</pre></li>)}</ol><label><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} />I checked the customer number, dates and message directions.</label><button type="button" disabled={!checked || busy} onClick={importFile}>{busy ? 'Importing…' : 'Import reviewed messages'}</button><button type="button" disabled={busy} onClick={() => { setReview(null); setChecked(false) }}>Edit details</button></section>}
    {receipt && <p role="status">{receipt.imported} messages imported. {receipt.duplicates} duplicates skipped.</p>}
    {error && <p role="alert">{error}</p>}<button type="button" disabled={busy} onClick={close}>Close</button>
  </section></div>}</>
}
