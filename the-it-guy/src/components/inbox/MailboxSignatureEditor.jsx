import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { strFromU8, unzipSync } from 'fflate'
import { EMPTY_INBOX_SIGNATURE, normalizeInboxSignature, renderInboxSignature, renderSignatureBody, signatureUrl } from '../../../../supabase/functions/_shared/inboxSignature.js'
import { loadMailboxSignature, saveMailboxSignature } from '../../modules/sharedInbox/mailboxService.js'
import { hostSignatureImage } from '../../modules/sharedInbox/signatureImageService.js'

const MAX_HTML_SIGNATURE_BYTES = 256 * 1024
const MAX_SIGNATURE_ZIP_BYTES = 15 * 1024 * 1024
const IMAGE_MIME = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp' }
function signatureRunsFromHtml(html, htmlPath='', hostedImages={}) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const runs = []
  const blocked = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'VIDEO', 'AUDIO', 'LINK', 'META'])
  function walk(node, format = {}) {
    if (node.nodeType === 3) { if (node.textContent) runs.push({ text: node.textContent, ...format }); return }
    if (node.nodeType !== 1) return
    if (node.tagName === 'IMG') {
      const source=signatureArchiveReference(htmlPath,node.getAttribute('src'))
      const image=hostedImages[source]
      if(image)runs.push({imageUrl:image.url,alt:(node.getAttribute('alt')||image.name||'Email signature image').slice(0,200)})
      return
    }
    if (blocked.has(node.tagName)) return
    if (node.tagName === 'BR') { runs.push({ text: '\n' }); return }
    const next = { ...format }
    if (['B', 'STRONG'].includes(node.tagName)) next.bold = true
    if (['I', 'EM'].includes(node.tagName)) next.italic = true
    if (node.tagName === 'A') {
      const href = signatureUrl(node.getAttribute('href'))
      if (href) next.href = href
    }
    for (const child of node.childNodes) walk(child, next)
    if (['DIV', 'P', 'LI', 'TR'].includes(node.tagName) && node !== parsed.body) runs.push({ text: '\n' })
    if (node.tagName === 'TD' && node.nextElementSibling) runs.push({ text: '  ' })
  }
  walk(parsed.body)
  while (runs.length && runs[runs.length - 1].text === '\n') runs.pop()
  return normalizeInboxSignature({ ...EMPTY_INBOX_SIGNATURE, body: runs }).body
}
function signatureArchivePath(path) {
  const clean=String(path||'').replaceAll('\\','/')
  if(!clean||clean.startsWith('/'))return ''
  const parts=[]
  for(const part of clean.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)return '';parts.pop()}else parts.push(part)}
  return parts.join('/').toLowerCase()
}
function signatureArchiveReference(htmlPath,source) {
  const value=String(source||'').trim().split(/[?#]/,1)[0]
  if(!value||/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value))return ''
  let decoded;try{decoded=decodeURIComponent(value)}catch{return ''}
  const base=String(htmlPath||'').replaceAll('\\','/').split('/').slice(0,-1).join('/')
  return signatureArchivePath(base?`${base}/${decoded}`:decoded)
}

// Translate the edited DOM to text runs. HTML is never sent to storage.
function editorRuns(root) {
  const runs = []
  function walk(node, format = {}) {
    if (node.nodeType === 3) { if (node.textContent) runs.push({ text: node.textContent, ...format }); return }
    if (node.nodeType !== 1 || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return
    if(node.tagName==='IMG'){const imageUrl=signatureUrl(node.getAttribute('src'),true);if(imageUrl)runs.push({imageUrl,alt:(node.getAttribute('alt')||'Email signature image').slice(0,200)});return}
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
  const [importing, setImporting] = useState(false)
  const fileInput = useRef(null)
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
  const disabled = loading || loadFailed || busy || importing || !mailbox.permissions.manage
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
  const importHtml = async file => {
    if (!file) return
    setError(''); setNotice('')
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') { setError('Choose an .html or .htm signature file.'); return }
    if (file.size > MAX_HTML_SIGNATURE_BYTES) { setError('Keep the HTML signature file under 256 KB.'); return }
    setImporting(true)
    try {
      const body = signatureRunsFromHtml(await file.text())
      if (!body.length) throw new Error('No readable signature text was found in that HTML file.')
      setSignature(current => ({ ...current, body }))
      setNotice('HTML imported into the signature editor. Review it and save.')
    } catch (cause) { setError(cause.message || 'The HTML signature could not be imported.') }
    finally { setImporting(false); if (fileInput.current) fileInput.current.value = '' }
  }
  const importZip = async file => {
    if(!file)return
    setError('');setNotice('')
    if(!/\.zip$/i.test(file.name)){setError('Choose a .zip signature package.');return}
    if(file.size>MAX_SIGNATURE_ZIP_BYTES){setError('Keep the ZIP package under 15 MB.');return}
    setImporting(true)
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());let count=0,total=0
      const entries=unzipSync(bytes,{filter:info=>{
        const name=String(info.name||'');if(name.endsWith('/')||name.split('/').some(part=>part==='__MACOSX'||part.startsWith('._')))return false
        const path=signatureArchivePath(name);if(!path)throw new Error('The ZIP contains an invalid file path.')
        const ext=path.slice(path.lastIndexOf('.')).toLowerCase(),allowed=ext==='.html'||ext==='.htm'||Object.hasOwn(IMAGE_MIME,ext)
        if(!allowed)return false
        count++;total+=info.originalSize
        if(count>30||total>MAX_SIGNATURE_ZIP_BYTES)throw new Error('The ZIP may contain up to 30 HTML/image files and 15 MB of uncompressed content.')
        if((ext==='.html'||ext==='.htm')&&info.originalSize>MAX_HTML_SIGNATURE_BYTES)throw new Error('Keep the HTML file under 256 KB.')
        if(Object.hasOwn(IMAGE_MIME,ext)&&info.originalSize>5*1024*1024)throw new Error('Each signature image must be 5 MB or smaller.')
        return true
      }})
      const files=Object.entries(entries).map(([name,data])=>({name,path:signatureArchivePath(name),data,ext:signatureArchivePath(name).slice(signatureArchivePath(name).lastIndexOf('.')).toLowerCase()}))
      const htmlFiles=files.filter(item=>item.ext==='.html'||item.ext==='.htm')
      if(htmlFiles.length!==1)throw new Error('Include exactly one .html or .htm signature file in the ZIP.')
      const hostedImages={}
      for(const item of files.filter(item=>Object.hasOwn(IMAGE_MIME,item.ext))){
        const image=new File([item.data],item.name.split('/').pop(),{type:IMAGE_MIME[item.ext]})
        hostedImages[item.path]=await hostSignatureImage({organisationId,channelId:mailbox.id,file:image})
      }
      const html=strFromU8(htmlFiles[0].data)
      const body=signatureRunsFromHtml(html,htmlFiles[0].path,hostedImages)
      if(!body.length)throw new Error('No readable text or hosted images were found in that ZIP.')
      setSignature(current=>({...current,body}))
      setNotice(`ZIP imported. Hosted ${Object.keys(hostedImages).length} image${Object.keys(hostedImages).length===1?'':'s'} publicly for use in email. Review the signature and save.`)
    }catch(cause){setError(cause.message||'The ZIP signature package could not be imported.')}
    finally{setImporting(false);if(fileInput.current)fileInput.current.value=''}
  }
  const importFile=file=>{if(!file)return;if(/\.zip$/i.test(file.name))void importZip(file);else void importHtml(file)}
  if (loading) return <p role="status">Loading signature…</p>
  return <section aria-label={`Signature for ${mailbox.address}`}>
    <div className="inbox-settings-heading"><div><h3>Signature for {mailbox.address}</h3><p>One signature for this mailbox, with separate defaults for new messages and replies.</p></div><button type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload signature</button></div>
    {!mailbox.permissions.manage && <p>Only the mailbox owner or a mailbox manager can change this signature.</p>}
    {error && <p className="inbox-settings-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="inbox-signature-grid"><form onSubmit={save}>
      <label className={`inbox-signature-dropzone ${disabled || importing ? 'is-disabled' : ''}`} onDragOver={event => { if (!disabled && !importing) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }} onDrop={event => { event.preventDefault(); if (!disabled && !importing) importFile(event.dataTransfer.files?.[0]) }}>
        <Upload size={20} aria-hidden="true" /><strong>Drop an HTML file or ZIP package here</strong><span>or choose a file · HTML up to 256 KB · ZIP up to 15 MB</span>
        <input ref={fileInput} type="file" accept=".html,.htm,.zip,text/html,application/zip" disabled={disabled || importing} onChange={event => importFile(event.target.files?.[0])} />
      </label>
      <p className="inbox-signature-import-help">Imports text, bold and italic formatting, safe links, and hosted images from a ZIP. Scripts, custom styling, and remote images are excluded. Hosted signature images use public URLs so email recipients can see them.</p>
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
