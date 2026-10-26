import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import '../inbox/email-mailbox-settings.css'
import { Copy, Globe, Mail, Plus, RefreshCw, Send } from 'lucide-react'
import { createEmailSender, createEmailSendingDomain, getEmailSendingPolicy, refreshEmailSenderVerification, sendEmailCampaignTest, verifyEmailSendingDomain } from '../../services/emailCampaignService'

function EmailSendingSettings({ organisationId, userId, domains = [], identities = [], loading, error: loadError, onRefresh }) {
  const [domainName, setDomainName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [domainId, setDomainId] = useState('')
  const [identityId, setIdentityId] = useState(null)
  const [makeDefault, setMakeDefault] = useState(true)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [policy, setPolicy] = useState(null)
  const [policyLoaded, setPolicyLoaded] = useState(false)
  const current = useRef({ busy, loading, loadError, onRefresh })
  useEffect(() => { current.current = { busy, loading, loadError, onRefresh } }, [busy, loading, loadError, onRefresh])
  useEffect(() => {
    if (!organisationId) return
    let cancelled = false
    let running = false
    const check = async () => {
      if (running || current.current.busy || current.current.loading || current.current.loadError || document.hidden) return
      running = true
      setChecking(true)
      try {
        await refreshEmailSenderVerification(organisationId)
        const next = await getEmailSendingPolicy(organisationId)
        if (!cancelled) {
          setPolicy(next); setPolicyLoaded(true); setError('')
          await current.current.onRefresh()
        }
      } catch (cause) { if (!cancelled) setError(cause.message || 'Automatic verification is unavailable. Recheck shortly.') }
      finally { running = false; if (!cancelled) setChecking(false) }
    }
    // Keep watching after verification too, so removed DNS records become visible.
    const timer = setInterval(() => void check(), 30000)
    const visible = () => { if (!document.hidden) void check() }
    document.addEventListener('visibilitychange', visible)
    void check()
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [organisationId])
  const unavailable = busy || loading || Boolean(loadError) || !organisationId
  const selectedDomain = domains.find((domain) => domain.id === domainId)
  const verifiedDomain = domains.some((domain) => domain.verification_status === 'verified')
  const verifiedSender = identities.some((identity) => identity.verification_status === 'verified' && !identity.sending_paused_at)
  const ready = policyLoaded && policy?.approved_at && !policy?.paused_at && !policy?.self_service_blocked && verifiedSender && verifiedDomain
  const run = async (action) => {
    if (unavailable || checking) return
    setBusy(true); setError(''); setNotice('')
    try {
      const message = await action()
      await onRefresh()
      const next = await getEmailSendingPolicy(organisationId)
      setPolicy(next); setPolicyLoaded(true); setNotice(message)
    } catch (cause) { setError(cause.message || 'Unable to update email settings.') }
    finally { setBusy(false) }
  }
  const addDomain = (event) => {
    event.preventDefault()
    void run(async () => {
      const name = domainName.trim().toLowerCase()
      if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(name)) throw new Error('Enter a domain name such as updates.youragency.co.za, without https:// or a path.')
      const result = await createEmailSendingDomain({ organisationId, domain: name })
      setDomainName('')
      if (result.domain?.id) setDomainId(result.domain.id)
      return result.created ? 'Domain added. Publish the DNS records below. We will check verification automatically.' : 'This domain is already configured for your organisation.'
    })
  }
  const addSender = (event) => {
    event.preventDefault()
    void run(async () => {
      if (!displayName.trim()) throw new Error('Add a display name for this sender.')
      if (!selectedDomain) throw new Error('Choose a sending domain.')
      const address = email.trim().toLowerCase()
      if (address.split('@').at(-1) !== selectedDomain.domain_name.toLowerCase()) throw new Error(`Use an address ending in @${selectedDomain.domain_name}.`)
      const reply = replyTo.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply)) throw new Error('Add a working inbox for replies.')
      await createEmailSender({ organisationId, userId, displayName: displayName.trim(), email: address, sendingDomainId: domainId, replyToEmail: reply, makeDefault, identityId })
      setDisplayName(''); setEmail(''); setReplyTo(''); setIdentityId(null); setMakeDefault(true)
      return 'Sender saved. Sending activates automatically when the domain is verified.'
    })
  }
  const edit = (identity) => {
    setIdentityId(identity.id); setDomainId(identity.email_sending_domain_id); setDisplayName(identity.display_name)
    setEmail(identity.from_email); setReplyTo(identity.reply_to_email); setMakeDefault(identity.is_default); setNotice(''); setError('')
  }
  const copyRecord = async (value) => {
    try { await navigator.clipboard.writeText(String(value || '')); setNotice('DNS value copied.'); setError('') }
    catch { setError('Unable to copy. Select the DNS value and copy it manually.') }
  }
  const controlsDisabled = unavailable || checking
  return <section className="email-settings-workspace" aria-label="Email settings">
    <div className="email-section-heading"><div><h2>Connect your agency email</h2></div><button className="wa-secondary-button" type="button" disabled={controlsDisabled} onClick={() => void run(async () => { const result = await refreshEmailSenderVerification(organisationId); return `${result.domainsVerified || 0} of ${result.domainsChecked || 0} sending domains verified.` })}><RefreshCw size={15} /> Recheck verification</button></div>
    <ol className="email-setup-steps" aria-label="Email setup progress">
      <li aria-current={!domains.length ? 'step' : undefined}>{domains.length ? '✓ ' : '1. '}Add your domain</li>
      <li aria-current={domains.length && !verifiedDomain ? 'step' : undefined}>{verifiedDomain ? '✓ ' : '2. '}Publish DNS records</li>
      <li aria-current={verifiedDomain && !verifiedSender ? 'step' : undefined}>{verifiedSender ? '✓ ' : '3. '}Choose your sender</li>
      <li aria-current={ready ? 'step' : undefined}>4. Send yourself a test</li>
    </ol>
    <div className="email-setup-readiness" role="status">
      <strong>{ready ? 'Your agency is ready to send' : policy?.paused_at || policy?.self_service_blocked ? 'Sending is paused' : 'Finish connecting your agency email'}</strong>
      <p>{policy?.paused_at || policy?.self_service_blocked ? policy.pause_reason || 'Sending has been stopped for this agency. Contact support to resolve the stop.' : ready ? `Up to ${Math.min(policy.daily_recipient_limit || 500, 500)} recipients per day. Campaigns use your opted-in audience and honour unsubscribes.` : 'Add your DNS records and a sender address. Verification and activation happen automatically.'}</p>
      <small>{checking ? 'Checking domain verification…' : 'Verification checks run every 30 seconds while this page is open. DNS changes can take time to appear.'}</small>
    </div>
    {error && <p className="wa-error" role="alert">{error}</p>}{notice && <p className="wa-notice" role="status">{notice}</p>}
    {loading && <p className="email-settings-loading" role="status">Loading email settings…</p>}
    <div className="email-settings-grid">
      <article className="email-settings-card"><div className="email-settings-card-heading"><span className="email-settings-icon"><Globe size={20} /></span><div><h3>Sending domains</h3><p>Use a domain or subdomain your organisation controls.</p></div></div>
        <form onSubmit={addDomain}><label>Domain name<input required value={domainName} onChange={(event) => setDomainName(event.target.value)} placeholder="updates.youragency.co.za" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={controlsDisabled} /></label><small>A dedicated subdomain keeps campaign mail separate from everyday email. You or your domain administrator will need to add DNS records once.</small><button className="wa-primary-button" disabled={controlsDisabled} type="submit"><Plus size={15} /> Add domain</button></form>
        <div className="email-domain-cards">{!loading && !loadError && !domains.length && <p className="email-settings-empty">No sending domains yet. Add one above to get its DNS records.</p>}{domains.map((domain) => <article className="email-domain-card" key={domain.id}><div className="email-domain-title"><strong>{domain.domain_name}</strong><span className={`email-domain-status ${domain.verification_status === 'verified' ? 'is-verified' : ''}`}>{domain.verification_status || 'pending'}</span></div>
          {domain.last_provider_error && <p className="wa-error">{domain.last_provider_error}</p>}
          {Array.isArray(domain.dns_records) && domain.dns_records.length ? <><p>Add these records at your DNS provider. Keep your existing inbox records. Use the exact record name shown; some providers add your domain name automatically.</p><div className="email-settings-dns">{domain.dns_records.map((record, index) => <div key={`${record.name}-${index}`}><span><b>{record.record || record.type}</b><small>{record.type} · {record.name}{record.priority != null ? ` · Priority ${record.priority}` : ''} · {record.status || 'awaiting verification'}</small><code>{record.value}</code></span><button type="button" aria-label={`Copy DNS value for ${record.name}`} onClick={() => void copyRecord(record.value)}><Copy size={15} /></button></div>)}</div></> : <p>DNS records will appear after domain setup completes. Add the same domain again if setup failed.</p>}
          <button type="button" className="wa-secondary-button" disabled={controlsDisabled || !domain.provider_domain_id || domain.verification_status === 'disabled'} onClick={() => void run(async () => { const result = await verifyEmailSendingDomain({ organisationId, domainId: domain.id }); return result.domain?.status === 'verified' ? `${domain.domain_name} is verified.` : `Verification requested for ${domain.domain_name}. We will keep checking automatically.` })}>Check domain verification</button>
        </article>)}</div>
      </article>
      <article className="email-settings-card"><div className="email-settings-card-heading"><span className="email-settings-icon"><Mail size={20} /></span><div><h3>Sender identities</h3><p>The name and address shown on your agency emails.</p></div></div>
        <form onSubmit={addSender}><label>Display name<input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your agency" disabled={controlsDisabled} /></label><label>Sending domain<select required value={domainId} onChange={(event) => setDomainId(event.target.value)} disabled={controlsDisabled}><option value="">Choose a domain</option>{domains.filter((domain) => domain.verification_status !== 'disabled').map((domain) => <option value={domain.id} key={domain.id}>{domain.domain_name} · {domain.verification_status}</option>)}</select></label><label>Sender email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={selectedDomain ? `marketing@${selectedDomain.domain_name}` : 'marketing@youragency.co.za'} disabled={controlsDisabled} /></label><label>Reply-to inbox<input required type="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="office@youragency.co.za" disabled={controlsDisabled} /></label><small>Use an existing inbox where your team can receive replies. Connecting a sending domain does not create an inbox.</small><label className="email-default-choice"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} disabled={controlsDisabled} /> Use as the default agency sender</label><button type="submit" className="wa-primary-button" disabled={controlsDisabled || !selectedDomain}><Plus size={15} /> {identityId ? 'Save sender' : 'Add sender'}</button>{identityId && <button type="button" className="wa-secondary-button" onClick={() => { setIdentityId(null); setDisplayName(''); setEmail(''); setReplyTo(''); setMakeDefault(true) }}>Cancel editing</button>}</form>
        <div className="email-sender-cards">{!loading && !loadError && !identities.length && <p className="email-settings-empty">No sender addresses yet. Add a domain, then create your sender.</p>}{identities.map((identity) => <article key={identity.id}><span className="email-settings-icon"><Mail size={17} /></span><div><strong>{identity.display_name}{identity.is_default ? ' · Default' : ''}</strong><small>{identity.from_email}</small><small>Reply to: {identity.reply_to_email}</small><div className="email-sender-actions"><button type="button" className="wa-secondary-button" disabled={controlsDisabled || identity.verification_status === 'disabled'} onClick={() => edit(identity)}>Edit sender</button><button type="button" className="wa-secondary-button" disabled={controlsDisabled || !ready || identity.verification_status !== 'verified' || Boolean(identity.sending_paused_at)} onClick={() => void run(async () => { const result = await sendEmailCampaignTest({ organisationId, senderIdentityId: identity.id, setupTest: true }); return `Test accepted for sending to ${result.deliveredTo}. Check your inbox and spam folder, then reply to check your reply-to inbox.` })}><Send size={14} /> Send me a test</button></div></div><span className={`email-domain-status ${identity.verification_status === 'verified' ? 'is-verified' : ''}`}>{identity.sending_paused_at ? 'paused' : identity.verification_status || 'pending'}</span></article>)}</div>
      </article>
    </div>
  </section>
}

const EmailMailboxSettings = lazy(() => import('../inbox/EmailMailboxSettings.jsx'))
export default function EmailCampaignSettings(props) {
  const [section, setSection] = useState('sending')
  return <div>
    <div className="email-settings-nav" role="tablist" aria-label="Email settings sections">
      {[['sending','Sending domains & senders'],['mailboxes','Mailboxes'],['signatures','Signatures']].map(([key,label]) => <button type="button" key={key} role="tab" aria-selected={section === key} onClick={() => setSection(key)}>{label}</button>)}
    </div>
    {section === 'sending' ? <EmailSendingSettings {...props} /> : <Suspense fallback={<p role="status">Opening mailbox settings…</p>}><EmailMailboxSettings key={`${props.organisationId}:${props.userId}`} organisationId={props.organisationId} userId={props.userId} tab={section} showTabs={false} /></Suspense>}
  </div>
}
