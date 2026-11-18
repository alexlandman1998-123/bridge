import { useState } from 'react'
import { Mail } from 'lucide-react'
import { createEmailSender } from '../../services/emailCampaignService'
import { ARCH9_CAMPAIGN_EMAIL } from '../../../../supabase/functions/_shared/emailCampaignSender.js'

export default function Arch9CampaignSenderForm({ organisationId, identity, platformSender, disabled, onSaved }) {
  const [name, setName] = useState(identity?.display_name || '')
  const [replyTo, setReplyTo] = useState(identity?.reply_to_email || '')
  const [makeDefault, setMakeDefault] = useState(identity?.is_default ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const unavailable = disabled || busy || !organisationId || identity?.verification_status === 'disabled' || platformSender?.available === false
  return <article className="email-settings-card email-arch9-sender" aria-label="Send through Arch9">
    <div className="email-settings-card-heading">
      <span className="email-settings-icon"><Mail size={20} aria-hidden="true" /></span>
      <div><h3>Sender details</h3><p>Choose the name recipients see and the inbox that receives their replies.</p></div>
    </div>
    <div className="email-platform-address"><span>Sending address</span><strong>{ARCH9_CAMPAIGN_EMAIL}</strong></div>
    {platformSender?.available === false && <p className="wa-notice" role="status">Arch9 sending needs activation before it can be used.</p>}
    <form onSubmit={async event => {
      event.preventDefault()
      if (unavailable) return
      setBusy(true); setError(''); setNotice('')
      try {
        await createEmailSender({ organisationId, senderMode: 'arch9', displayName: name.trim(), replyToEmail: replyTo.trim(), makeDefault, identityId: identity?.id || null })
        await onSaved?.()
        setNotice('Arch9 sender saved. Choose it in your campaign’s From field.')
      } catch (cause) { setError(cause.message || 'The Arch9 sender could not be saved.') }
      finally { setBusy(false) }
    }}>
      <div className="email-arch9-fields">
        <div><label>Sender name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Your organisation" disabled={unavailable} aria-describedby="arch9-sender-preview" /></label><small id="arch9-sender-preview">Recipients see “{name.trim() || 'Your organisation'} via Arch9”.</small></div>
        <div><label>Reply-to inbox<input required type="email" value={replyTo} onChange={event => setReplyTo(event.target.value)} placeholder="office@yourcompany.co.za" disabled={unavailable} aria-describedby="arch9-reply-help" /></label><small id="arch9-reply-help">Use an existing inbox where your team can receive replies.</small></div>
      </div>
      <label className="email-default-choice"><input type="checkbox" checked={makeDefault} onChange={event => setMakeDefault(event.target.checked)} disabled={unavailable} /> Use Arch9 as the default sender</label>
      <button type="submit" className="wa-primary-button" disabled={unavailable}>{busy ? 'Saving…' : 'Save Arch9 sender'}</button>
    </form>
    {error && <p className="wa-error" role="alert">{error}</p>}
    {notice && <p className="wa-notice" role="status">{notice}</p>}
  </article>
}
