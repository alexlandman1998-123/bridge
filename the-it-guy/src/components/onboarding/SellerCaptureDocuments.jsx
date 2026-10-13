import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { getPrivateListing, getSellerOnboardingByToken } from '../../services/privateListingService'

// Both forms read the existing checklist and saved files through the same
// token-authorised journey. No file metadata is copied into form_data.
export default function SellerCaptureDocuments({ listing, token, onUpload = null, compact = false, initialListing = null }) {
  const [context, setContext] = useState(initialListing ? { listing: initialListing } : null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    if (!token || !listing?.id) return undefined
    if (reload === 0 && initialListing?.id === listing.id && Array.isArray(initialListing.documentRequirements)) return undefined
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
  return <section className={compact ? 'space-y-4' : 'space-y-3 rounded-[18px] border border-[#dce6f2] bg-white p-4'}>
    {!compact ? <>
      <h3 className="font-semibold text-[#172334]">Documents you already have</h3>
      <p className="text-sm text-[#60748b]">Uploads are optional. These are the same files used in the seller workspace. A saved file still needs any required review.</p>
    </> : null}
    {busy ? <p role="status">Loading documents…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {!busy && !error && !files.length ? <p className="text-sm text-[#60748b]">{onUpload ? 'No documents added yet.' : 'Documents will appear here when they are available through this link.'}</p> : null}
    <ul className="space-y-2">{files.map(file => {
      const name = file.documentName || file.document_name || file.name || 'Saved document'
      const status = ['approved', 'verified', 'accepted'].includes(file.status) ? 'Reviewed' : 'Saved, awaiting review'
      return <li key={file.id} className={compact ? 'flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-4 py-3 text-sm' : 'text-sm'}>
        {compact ? <><span className="min-w-0 break-all font-medium">{name}</span><span className="text-xs text-[#60748b]">{status}</span></> : `${name} — ${status}`}
      </li>
    })}</ul>
    {onUpload ? <div className="space-y-2">{requirements.filter(row => !['not_applicable', 'retired', 'superseded'].includes(row.status)).map(row => {
      const name = row.requirementName || row.requirement_name || row.label || row.requirementKey || row.requirement_key
      return <div key={row.id} className={compact ? 'flex items-center justify-between gap-3 rounded-[14px] border border-[#dce6f2] bg-white px-4 py-3 text-sm' : 'grid gap-1.5 text-sm'}>
      <span className="min-w-0 break-words font-medium text-[#2a4057]">{name}</span>
      <label className={compact ? `shrink-0 cursor-pointer rounded-[10px] border border-[#d7e2ed] px-3 py-2 font-medium text-[#2a4057] focus-within:ring-2 focus-within:ring-[#315879] ${busy ? 'opacity-60' : 'hover:bg-[#f4f7fa]'}` : ''}>
      {compact ? 'Add file' : null}
      <input aria-label={name} className={compact ? 'sr-only' : undefined} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setBusy(true); setError('')
        try { await onUpload(file, row); setReload(value => value + 1) }
        catch (reason) { setError(reason.message || 'The file could not be saved. Try again.') }
        finally { setBusy(false) }
      }} />
      </label>
    </div>})}</div> : null}
    <Button type="button" variant={compact ? 'ghost' : 'secondary'} size={compact ? 'sm' : undefined} disabled={busy} onClick={() => setReload(value => value + 1)}>Refresh documents</Button>
  </section>
}
