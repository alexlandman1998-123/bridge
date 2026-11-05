import { useState } from 'react'
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
  return <article className="email-settings-card" aria-label="Send through Arch9">
    <h3>Send through Arch9</h3>
    <p>Send from <strong>{ARCH9_CAMPAIGN_EMAIL}</strong> with your organisation name. Replies go to your chosen inbox. No domain setup is needed.</p>
    <p role="status">{platformSender?.available === false ? 'Arch9 sending needs the platform update and activation before it can be used.' : platformSender?.ready ? 'Arch9 campaign sending is available.' : 'Arch9 campaign sending is awaiting activation. You can save your sender details now.'}</p>
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
      <label>Arch9 sender name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Your organisation" disabled={unavailable} /></label>
      <small>Recipients see “{name.trim() || 'Your organisation'} via Arch9”.</small>
      <label>Arch9 reply-to inbox<input required type="email" value={replyTo} onChange={event => setReplyTo(event.target.value)} placeholder="office@yourcompany.co.za" disabled={unavailable} /></label>
      <label className="email-default-choice"><input type="checkbox" checked={makeDefault} onChange={event => setMakeDefault(event.target.checked)} disabled={unavailable} /> Use Arch9 as the default sender</label>
      <button type="submit" className="wa-primary-button" disabled={unavailable}>{busy ? 'Saving…' : 'Save Arch9 sender'}</button>
    </form>
    {error && <p className="wa-error" role="alert">{error}</p>}
    {notice && <p className="wa-notice" role="status">{notice}</p>}
  </article>
}
