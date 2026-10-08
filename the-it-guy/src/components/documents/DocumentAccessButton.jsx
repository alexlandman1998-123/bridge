import { useEffect, useRef, useState } from 'react'
import { createTransactionDocumentSignedUrl } from '../../lib/transactionWorkspaceApi.js'
import { documentStorageReference } from '../../lib/documentAccess.js'

export default function DocumentAccessButton({ document, resolveUrl = createTransactionDocumentSignedUrl, children = 'View', className = 'ghost-button', download = false, 'aria-label': ariaLabel }) {
  const reference = documentStorageReference(document)
  const identity = `${reference.fileBucket}/${reference.filePath}`
  const current = useRef(identity)
  const pending = useRef(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    current.current = identity
    setError('')
    setOpening(false)
    return () => {
      current.current = null
      pending.current?.close()
      pending.current = null
    }
  }, [identity])

  async function open() {
    if (pending.current) return
    const operation = { close: () => {} }
    pending.current = operation
    setOpening(true)
    setError('')
    // Reserve the tab within the user gesture, before signing asynchronously.
    let tab
    let closed = false
    operation.close = () => { if (tab && !closed) { tab.close(); closed = true } }
    try {
      tab = window.open('about:blank', '_blank')
      if (tab) tab.opener = null
      if (!tab) throw new Error('Allow a new tab to open this document, then try again.')
      const signedUrl = await resolveUrl({ ...reference, download })
      if (current.current !== identity || pending.current !== operation) { operation.close(); return }
      const url = new URL(signedUrl)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The document link could not be opened. Please retry.')
      tab.location.replace(url.href)
    } catch (failure) {
      operation.close()
      if (current.current === identity) setError(failure?.message || 'Unable to open this document. Please retry.')
    } finally {
      if (pending.current === operation) {
        pending.current = null
        if (current.current === identity) setOpening(false)
      }
    }
  }

  // A cached URL alone is not a durable document identity.
  if (!reference.filePath) return <span className="text-xs text-slate-500">Document access unavailable</span>
  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" className={className} aria-label={ariaLabel} aria-busy={opening} disabled={opening} onClick={open}>{opening ? 'Opening…' : children}</button>
    {error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}
  </span>
}
