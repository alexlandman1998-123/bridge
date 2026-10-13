import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { getPrivateListing, getSellerOnboardingByToken } from '../../services/privateListingService'

// Both forms read the existing checklist and saved files through the same
// token-authorised journey. No file metadata is copied into form_data.
export default function SellerCaptureDocuments({ listing, token, onUpload = null }) {
  const [context, setContext] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    if (!token || !listing?.id) return undefined
    setBusy(true)
    const read = onUpload
      ? getPrivateListing(listing.id, { includeRequirementsAndDocuments: true }).then(value => ({ listing: value }))
      : getSellerOnboardingByToken(token, { includeRequirementsAndDocuments: true })
    read.then(value => {
      if (active) { setContext(value); setError('') }
    }).catch(reason => { if (active) setError(reason.message || 'Documents could not be loaded. Try again.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
    // The upload callback changes with the current draft; only its presence
    // selects the existing staff or seller access path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id, token, reload, Boolean(onUpload)])
  const files = (context?.listing?.documents || context?.documents || []).filter(file =>
    ['seller_visible', 'client_visible'].includes(file.visibility || file.document_visibility),
  )
  const requirements = context?.listing?.documentRequirements || context?.requirements || []
  return <section className="space-y-3 rounded-[18px] border border-[#dce6f2] bg-white p-4">
    <h3 className="font-semibold text-[#172334]">Documents you already have</h3>
    <p className="text-sm text-[#60748b]">Uploads are optional. These are the same files used in the seller workspace. A saved file still needs any required review.</p>
    {busy ? <p role="status">Loading documents…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {!busy && !error && !files.length ? <p className="text-sm text-[#60748b]">{onUpload ? 'No documents added yet.' : 'Documents will appear here when they are available through this link.'}</p> : null}
    <ul className="space-y-2">{files.map(file => <li key={file.id} className="text-sm">
      {file.documentName || file.document_name || file.name || 'Saved document'} — {['approved', 'verified', 'accepted'].includes(file.status) ? 'Reviewed' : 'Saved, awaiting review'}
    </li>)}</ul>
    {onUpload ? <div className="space-y-3">{requirements.filter(row => !['not_applicable', 'retired', 'superseded'].includes(row.status)).map(row => <label key={row.id} className="grid gap-1.5 text-sm">
      <span>{row.requirementName || row.requirement_name || row.label || row.requirementKey || row.requirement_key}</span>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setBusy(true); setError('')
        try { await onUpload(file, row); setReload(value => value + 1) }
        catch (reason) { setError(reason.message || 'The file could not be saved. Try again.') }
        finally { setBusy(false) }
      }} />
    </label>)}</div> : null}
    <Button type="button" variant="secondary" disabled={busy} onClick={() => setReload(value => value + 1)}>Refresh documents</Button>
  </section>
}
