import { useState } from 'react'
import { getSellerPortalAccessState, manageSellerPortalAccess } from '../../services/privateListingService.js'

export default function SellerPortalAccessControls({ token, accessState, onStateChange }) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [confirmation, setConfirmation] = useState('')
  if (!token) return null
  const active = accessState?.linkActive !== false
  async function applyAction(action) {
    setBusy(true)
    setFeedback('')
    try {
      await manageSellerPortalAccess(token, { action })
      // Reflect the acknowledged mutation even if the subsequent read fails.
      if (action !== 'revoke_sessions') onStateChange?.({ ...accessState, linkActive: action === 'reactivate' })
      setConfirmation('')
      setFeedback(action === 'revoke_sessions' ? 'Seller sessions signed out.' : action === 'revoke' ? 'Portal access revoked.' : 'Portal access reactivated.')
      try { onStateChange?.(await getSellerPortalAccessState(token)) } catch { /* Keep the acknowledged state. */ }
    } catch (error) {
      setFeedback(error.message || 'Unable to update portal access. Please retry.')
    } finally { setBusy(false) }
  }
  return <section aria-label="Portal Access" className="mt-4 rounded-xl border border-[#dbe6f2] bg-[#f7fbff] p-4">
    <h3 className="text-sm font-semibold">Portal Access</h3>
    <p className="mt-1 text-sm text-[#607387]">{accessState ? active ? 'Active seller portal' : 'Seller portal access revoked' : 'Access state unavailable. Refresh before changing access.'}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy || !accessState} onClick={() => setConfirmation('revoke_sessions')} className="ui-button-secondary min-h-11">Sign Out Sessions</button>
      <button type="button" disabled={busy || !accessState} onClick={() => setConfirmation(active ? 'revoke' : 'reactivate')} className="ui-button-secondary min-h-11">{active ? 'Revoke Portal' : 'Reactivate Portal'}</button>
    </div>
    {confirmation ? <div className="mt-3 text-sm"><p>{confirmation === 'revoke' ? 'The seller will lose portal access until it is reactivated.' : confirmation === 'revoke_sessions' ? 'The seller will need to sign in again on all devices.' : 'The seller will be able to sign in using the existing portal link.'}</p><div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => void applyAction(confirmation)} className="ui-button-primary min-h-11">{busy ? 'Updating…' : 'Confirm'}</button><button type="button" disabled={busy} onClick={() => setConfirmation('')} className="ui-button-secondary min-h-11">Cancel</button></div></div> : null}
    {feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}
  </section>
}
