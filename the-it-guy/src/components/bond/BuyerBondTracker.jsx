import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBuyerBondTrackerContext, uploadBuyerBondApplicationRuntimeDocument } from '../../lib/clientPortalApi.js'

const button = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50'
export default function BuyerBondTracker({ token, accessToken, onOpenDocuments, onBackToPortal, onOpenDocument }) {
  const [context, setContext] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState('')
  const generation = useRef(0)
  const load = useCallback(async () => {
    const id = generation.current
    const data = await fetchBuyerBondTrackerContext({ token, accessToken })
    if (generation.current === id) { setContext(data); setError('') }
  }, [token, accessToken])
  useEffect(() => {
    const id = ++generation.current
    setContext(null); setError(''); setUploading('')
    const refresh = () => load().catch(failure => { if (generation.current === id) { setContext(null); setError(failure.message || 'Your bond progress could not be loaded.') } })
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { generation.current += 1; window.removeEventListener('focus', refresh) }
  }, [load])
  const upload = async (requirement, file) => {
    const id = generation.current
    setUploading(requirement.document_key); setError('')
    try {
      await uploadBuyerBondApplicationRuntimeDocument({ token, accessToken, requirementKey: requirement.document_key, file })
      if (generation.current === id) await load()
    } catch (failure) { if (generation.current === id) setError(failure.message || 'The document could not be uploaded. Try again.') }
    finally { if (generation.current === id) setUploading('') }
  }
  return <section className="space-y-4 rounded-2xl border bg-white p-5" aria-label="Your bond progress">
    <h2 className="text-lg font-semibold">Your bond progress</h2>
    <p className="text-sm">Your bond originator manages the bank process and records progress here. You do not need to sign a bond application in Arch9.</p>
    {context ? <>
      <div className="space-y-2">{(context.submissions || []).map((row, index) => <article key={`${row.bankName}-${index}`} className="rounded-xl border p-3 text-sm"><strong>{row.bankName}</strong><p>{row.status?.replaceAll('_', ' ')}</p>{row.reference ? <p>Reference: {row.reference}</p> : null}</article>)}{!context.submissions?.length ? <p className="text-sm">Your originator has not recorded a bank submission yet.</p> : null}</div>
      {(context.requiredDocuments || []).filter(row => row.enabled !== false && !['inactive', 'superseded', 'waived'].includes(row.status)).map(row => {
        const document = (context.documents || []).find(doc => doc.id === row.uploaded_document_id || (row.canonical_requirement_instance_id && doc.canonical_requirement_instance_id === row.canonical_requirement_instance_id))
        const statement = /bank_statements?/.test(row.document_key || '')
        return <article key={row.id || row.document_key} className="space-y-2 rounded-xl border p-3 text-sm"><strong>{row.document_label || row.document_key}</strong><p>{row.status === 'rejected' ? 'Replacement requested' : document ? 'Received by your finance team' : 'Requested by your originator'}</p>{row.notes ? <p>{row.notes}</p> : null}
          {document && onOpenDocument ? <button type="button" className={button} onClick={() => onOpenDocument(document)}>View document</button> : null}
          {statement ? <p>Provide statements through the channel agreed with your originator. They track the bank process in Arch9.</p> : <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 font-semibold">{uploading === row.document_key ? 'Uploading…' : document ? 'Replace document' : 'Upload document'}<input className="sr-only" type="file" aria-label={`Upload ${row.document_label || row.document_key}`} disabled={Boolean(uploading)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(row, file) }} /></label>}
        </article>
      })}
    </> : !error ? <p role="status">Loading bond progress…</p> : null}
    <div className="flex flex-wrap gap-2">{onOpenDocuments ? <button type="button" className={button} onClick={onOpenDocuments}>Document Centre</button> : null}{onBackToPortal ? <button type="button" className={button} onClick={onBackToPortal}>Back to portal</button> : null}</div>
    {error ? <p role="alert" className="text-sm text-red-800">{error}<button type="button" className={`${button} ml-2`} onClick={() => void load().catch(failure => setError(failure.message))}>Retry</button></p> : null}
  </section>
}
