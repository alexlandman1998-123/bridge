import EmailDomainDnsRecords from './EmailDomainDnsRecords'
import { sendingSetupReadiness, normaliseSendingDomain } from './emailSendingSetup'
import Arch9CampaignSenderForm from "./Arch9CampaignSenderForm"
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import '../inbox/email-mailbox-settings.css'
import { Globe, Mail, Plus, RefreshCw, Send } from 'lucide-react'
import { createEmailSender, createEmailSendingDomain, getEmailSendingPolicy, setEmailSendingControls, refreshEmailSenderVerification, sendEmailCampaignTest, verifyEmailSendingDomain } from '../../services/emailCampaignService'

export function EmailSendingSettings({ organisationId, userId, domains = [], identities = [], loading, error: loadError, onRefresh }) {
  const [addingDomain, setAddingDomain] = useState(false)
  const [showSenderForm, setShowSenderForm] = useState(false)
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
  const [dailyLimit, setDailyLimit] = useState(null)
  const [platformSender, setPlatformSender] = useState(null)
  const [senderMode, setSenderMode] = useState('')
  const [policyLoaded, setPolicyLoaded] = useState(false)
  const current = useRef({ busy, loading, loadError, onRefresh })
  useEffect(() => { current.current = { busy, loading, loadError, onRefresh } }, [busy, loading, loadError, onRefresh])
  useEffect(() => {
    if (!organisationId) return
    setDailyLimit(null); setPolicy(null); setPolicyLoaded(false)
    let cancelled = false
    let running = false
    const check = async () => {
      if (running || current.current.busy || current.current.loading || current.current.loadError || document.hidden) return
      running = true
      setChecking(true)
      try {
        const verification = await refreshEmailSenderVerification(organisationId)
        if (!cancelled) setPlatformSender(verification?.platformSender || null)
        const next = await getEmailSendingPolicy(organisationId)
        if (!cancelled) {
          setPolicy(next); setPolicyLoaded(true); setError(verification?.customDomainCheckError || '')
          await current.current.onRefresh()
        }
      } catch (cause) { if (!cancelled) { setPolicyLoaded(false); setError(cause.message || 'Automatic verification is unavailable. Recheck shortly.') } }
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
  const senderReady = identity => identity.verification_status === 'verified' && !identity.sending_paused_at && (
    identity.sender_mode === 'arch9' ? platformSender?.ready : domains.some(domain => domain.id === identity.email_sending_domain_id && domain.verification_status === 'verified')
  )
  const readiness = sendingSetupReadiness({ mode: senderMode, domain: selectedDomain, identities, platformSender, policy, loaded: policyLoaded })
  const arch9Identity = identities.find(identity => identity.sender_mode === 'arch9')
  const customIdentities = identities.filter(identity => identity.sender_mode !== 'arch9')
  useEffect(() => {
    if (!loading && !addingDomain && !domains.some(domain => domain.id === domainId)) setDomainId(domains.find(domain => domain.verification_status !== 'disabled')?.id || '')
  }, [loading, domains, domainId, addingDomain])
  const domainIdentities = customIdentities.filter(identity => identity.email_sending_domain_id === domainId)
  useEffect(() => {
    if (loading || senderMode) return
    if (arch9Identity) setSenderMode('arch9')
    else if (domains.length || customIdentities.length) setSenderMode('custom')
  }, [arch9Identity, customIdentities.length, domains.length, loading, senderMode])
  const identityStatus = identity => identity.sending_paused_at ? 'paused' : identity.sender_mode === 'arch9' && !platformSender?.ready ? 'awaiting activation' : identity.verification_status || 'pending'
  const run = async (action) => {
    if (unavailable || checking) return
    setBusy(true); setError(''); setNotice('')
    try {
      const message = await action()
      await onRefresh()
      const next = await getEmailSendingPolicy(organisationId)
      setPolicy(next); setPolicyLoaded(true); setNotice(message)
    } catch (cause) {
      setError(cause.message || 'Unable to update email settings.')
      // Provider creation may have succeeded before a response or DNS lookup failed.
      // Recover the saved reservation without clearing the user's form.
      try { await onRefresh() } catch { /* Keep the original actionable error. */ }
    }
    finally { setBusy(false) }
  }
  const addDomain = (event) => {
    event.preventDefault()
    void run(async () => {
      const name = normaliseSendingDomain(domainName)
      if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(name)) throw new Error('Enter a domain name such as updates.youragency.co.za, without https:// or a path.')
      const result = await createEmailSendingDomain({ organisationId, domain: name })
      setDomainName('')
      if (result.domain?.id) { setDomainId(result.domain.id); setAddingDomain(false) }
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
      setDisplayName(''); setEmail(''); setReplyTo(''); setIdentityId(null); setMakeDefault(true); setShowSenderForm(false)
      return 'Sender saved. Check the sending status below, then send yourself a test when available.'
    })
  }
  const edit = (identity) => {
    setShowSenderForm(true); setIdentityId(identity.id); setDomainId(identity.email_sending_domain_id); setDisplayName(identity.display_name)
    setEmail(identity.from_email); setReplyTo(identity.reply_to_email); setMakeDefault(identity.is_default); setNotice(''); setError('')
  }
  const copyRecord = async (value) => {
    try { await navigator.clipboard.writeText(String(value || '')); setNotice('Copied to clipboard.'); setError('') }
    catch { setError('Unable to copy. Select the DNS value and copy it manually.') }
  }
  const controlsDisabled = unavailable || checking
  return <section className="email-settings-workspace" aria-label="Email sending setup">
    <div className="email-section-heading">
      <div><span className="email-step-label">STEP 1 · SENDING METHOD</span><h2>Choose how to send campaign emails</h2><p>Use Arch9 to get started, or connect a domain your organisation owns.</p></div>
      <button className="wa-secondary-button email-verification-refresh" type="button" title="Check the latest sending domain status" aria-label="Refresh sending domain status" disabled={controlsDisabled} onClick={() => void run(async () => { const result = await refreshEmailSenderVerification(organisationId); setPlatformSender(result.platformSender || null); if (result.customDomainCheckError) throw new Error(result.customDomainCheckError); return 'Sending status refreshed.' })}><RefreshCw size={15} aria-hidden="true" /> <span>Refresh status</span></button>
    </div>
    {error && <p className="wa-error" role="alert">{error}</p>}{notice && <p className="wa-notice" role="status">{notice}</p>}
    {loading && <p className="email-settings-loading" role="status">Loading email settings…</p>}
    <div className="email-sender-choice-grid" role="group" aria-label="Choose a campaign email sender">
      <button type="button" aria-pressed={senderMode === 'arch9'} className={`email-sender-choice ${senderMode === 'arch9' ? 'is-selected' : ''}`} onClick={() => { setSenderMode('arch9'); setIdentityId(null) }}>
        <span className="email-choice-mark" aria-hidden="true">{senderMode === 'arch9' ? '✓' : '1'}</span><span><strong>Send using Arch9</strong><small>No DNS setup needed. Recipients see your organisation name; replies go to your chosen inbox.</small></span>
      </button>
      <button type="button" aria-pressed={senderMode === 'custom'} className={`email-sender-choice ${senderMode === 'custom' ? 'is-selected' : ''}`} onClick={() => { setSenderMode('custom'); setIdentityId(null) }}>
        <span className="email-choice-mark" aria-hidden="true">{senderMode === 'custom' ? '✓' : '2'}</span><span><strong>Send using your own domain</strong><small>Verify a domain your organisation controls, then send from its email address.</small></span>
      </button>
    </div>
    {senderMode ? <section className="email-sender-step-two" aria-labelledby="email-sender-step-two-heading">
      <div className="email-section-heading email-step-two-heading"><div><span className="email-step-label">STEP 2</span><h2 id="email-sender-step-two-heading">{senderMode === 'arch9' ? 'Set up your Arch9 sender' : 'Connect and verify your domain'}</h2><p>{senderMode === 'arch9' ? 'Save the name recipients will see and where replies should go.' : 'Add your sending domain, publish the DNS records, then create a sender address.'}</p></div></div>
      <div className="email-setup-readiness" role="status">
        <strong>{readiness.title}</strong><p>{readiness.detail}</p>

      </div>
      {senderMode === 'arch9' ? <>
        <Arch9CampaignSenderForm key={`${organisationId}:${arch9Identity?.id || 'new'}`} organisationId={organisationId} identity={arch9Identity} platformSender={platformSender} disabled={controlsDisabled}
          onSaved={async () => { await onRefresh(); const next = await getEmailSendingPolicy(organisationId); setPolicy(next); setPolicyLoaded(true) }} />
        <div className="email-sender-cards">{!loading && !loadError && !arch9Identity && <p className="email-settings-empty">Save your Arch9 sender above. It will appear here with a test-send option.</p>}{arch9Identity && <SenderIdentityCard organisationId={organisationId} identity={arch9Identity} senderReady={senderReady} identityStatus={identityStatus} controlsDisabled={controlsDisabled} policy={policyLoaded ? policy : null} run={run} onEdit={edit} />}</div>
      </> : <>
        <ol className="email-setup-steps" aria-label="Own domain setup progress">
          {['Add domain', 'Verify DNS', 'Save sender', 'Send a test'].map((label, index) => <li key={label} aria-current={index === (!selectedDomain ? 0 : selectedDomain.verification_status !== 'verified' ? 1 : !domainIdentities.length ? 2 : 3) ? 'step' : undefined}>{index + 1}. {label}</li>)}
        </ol>
        <div className="email-domain-setup-stack">
          <article className="email-settings-card">
            <h3>1. Sending domain</h3>
            <p>Use a domain you own and can edit in your DNS provider. We recommend a campaign subdomain such as updates.youragency.co.za.</p>
            {domains.length > 0 && !addingDomain && <div className="email-domain-selection"><label>Sending domain<select disabled={controlsDisabled} value={domainId} onChange={event => { setDomainId(event.target.value); setIdentityId(null); setShowSenderForm(false) }}>{domains.map(domain => <option key={domain.id} value={domain.id}>{domain.domain_name} · {domain.verification_status}</option>)}</select></label><button type="button" className="wa-secondary-button" disabled={controlsDisabled} onClick={() => setAddingDomain(true)}>Add another domain</button></div>}
            {(!domains.length || addingDomain) && <form onSubmit={addDomain}><label>Domain name<input required value={domainName} onChange={event => setDomainName(event.target.value)} placeholder="updates.youragency.co.za" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={controlsDisabled} /></label><small>Enter the domain only, without https://, a page path or an email address. This does not create an inbox or change your website.</small><div className="email-sender-actions"><button className="wa-primary-button" disabled={controlsDisabled} type="submit"><Plus size={15} /> Add domain</button>{domains.length > 0 && <button type="button" className="wa-secondary-button" onClick={() => setAddingDomain(false)}>Cancel</button>}</div></form>}
          </article>
          {selectedDomain && !addingDomain && <>
            <details className="email-dns-disclosure" open={selectedDomain.verification_status !== 'verified'}><summary>{selectedDomain.verification_status === 'verified' ? '2. DNS verified — view records' : '2. DNS records need verification'}</summary>
              <EmailDomainDnsRecords domain={selectedDomain} onCopy={copyRecord} disabled={controlsDisabled} checking={checking}
                onVerify={() => void run(async () => { const result = await verifyEmailSendingDomain({ organisationId, domainId }); if (result.domain?.status === 'failed') throw new Error('DNS verification needs attention. Check the saved records and any existing host conflicts, then retry.'); return result.domain?.status === 'verified' ? 'DNS verified. Continue with your sender details.' : 'Verification requested. DNS changes may take up to 72 hours; we will keep checking while this page is open.' })}
                onReconnect={() => void run(async () => { await createEmailSendingDomain({ organisationId, domain: selectedDomain.domain_name }); return 'Domain reconnected. Check the current DNS records before making changes.' })} />
            </details>
            {selectedDomain.verification_status === 'verified' ? <>
          <article className="email-settings-card"><div className="email-settings-card-heading"><span className="email-settings-icon"><Mail size={20} /></span><div><h3>3. Sender details</h3><p>The name and address shown on your agency emails.</p></div></div>
            {(!domainIdentities.length || showSenderForm) ? <form onSubmit={addSender}><label>Display name<input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your agency" disabled={controlsDisabled} /></label><label>Sender email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={selectedDomain ? `marketing@${selectedDomain.domain_name}` : 'marketing@youragency.co.za'} disabled={controlsDisabled} /></label><label>Reply-to inbox<input required type="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="office@youragency.co.za" disabled={controlsDisabled} /></label><small>Use an existing inbox where your team can receive replies. Connecting a sending domain does not create an inbox.</small><label className="email-default-choice"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} disabled={controlsDisabled} /> Use as the default agency sender</label><button type="submit" className="wa-primary-button" disabled={controlsDisabled || !selectedDomain}><Plus size={15} /> {identityId ? 'Save sender' : 'Add sender'}</button>{identityId && <button type="button" className="wa-secondary-button" onClick={() => { setIdentityId(null); setDisplayName(''); setEmail(''); setReplyTo(''); setMakeDefault(true); setShowSenderForm(false) }}>Cancel editing</button>}</form> : <button type="button" className="wa-secondary-button" disabled={controlsDisabled} onClick={() => setShowSenderForm(true)}>Add another sender</button>}
            <h3 className="email-settings-test-heading">4. Send a test</h3><p>The test goes to your signed-in email address. Check delivery, then reply to confirm replies reach your chosen inbox.</p><div className="email-sender-cards">{!loading && !loadError && !domainIdentities.length && <p className="email-settings-empty">No sender addresses yet. Add a domain, then create your sender.</p>}{domainIdentities.map(identity => <SenderIdentityCard key={identity.id} organisationId={organisationId} identity={identity} senderReady={senderReady} identityStatus={identityStatus} controlsDisabled={controlsDisabled} policy={policyLoaded ? policy : null} run={run} onEdit={edit} />)}</div>
          </article>
            </> : <p className="email-next-step">Sender details and the test email become available after this domain is verified.</p>}
          </>}
        </div>
      </>}
    </section> : null}
      <details className="email-settings-advanced"><summary>Advanced sending settings</summary>
        <div className="email-settings-advanced-grid">
          <article className="email-settings-card" aria-label="Engagement tracking settings"><h3>Engagement tracking</h3><p>Open tracking and its DNS records are separate from sending verification.</p><ul>{[{ domain_name: 'Arch9 sender', tracking_settings: platformSender?.tracking }, ...domains].map(domain => <li key={domain.id || 'platform'}><strong>{domain.domain_name}</strong> · Opens: {domain.tracking_settings?.openStatus || 'unknown'} · Provider clicks: {domain.tracking_settings?.clickStatus || 'unknown'}{domain.tracking_settings?.clickEnabled && <small> · Provider redirects also enabled; raw events can overlap Arch9 link events.</small>}{domain.tracking_checked_at ? ` · Checked ${new Date(domain.tracking_checked_at).toLocaleString()}` : ''}</li>)}</ul><small>Arch9 tracks campaign HTML links separately. Disabled or unknown open tracking cannot confirm that a recipient did not read an email.</small></article>
          {policyLoaded && policy && <article className="email-settings-card" aria-label="Organisation sending controls">
            <h3>Sending controls</h3>
            {policy.reserved_today != null && <p>{policy.reserved_today} recipients reserved today for this organisation.</p>}
            {policy.account_ready === false && <p role="status">Campaign sending is waiting for Arch9 account capacity. Your queued campaigns are retained.</p>}
            <p>These controls apply to your organisation’s campaigns and tests. Queued campaigns wait while paused. Safety stops require support.</p>
            <form onSubmit={event => { event.preventDefault(); void run(async () => {
              await setEmailSendingControls({ organisationId, paused: Boolean(policy.manual_paused_at), dailyLimit: dailyLimit ?? policy.organisation_daily_limit ?? 500 })
              setDailyLimit(null); return 'Daily sending limit saved.'
            }) }}>
              <label>Daily recipient limit<input type="number" min="1" max={Math.min(policy.daily_recipient_limit || 500, 500)} required value={dailyLimit ?? policy.organisation_daily_limit ?? 500} onChange={event => setDailyLimit(event.target.value)} disabled={controlsDisabled} /></label>
              <small>Tests and reserved campaign deliveries count toward this limit. A lower limit applies to new reservations. Pause sending to stop queued work immediately.</small>
              <button type="submit" className="wa-secondary-button" disabled={controlsDisabled}>Save daily limit</button>
            </form>
            <button type="button" className="wa-secondary-button" disabled={controlsDisabled} onClick={() => void run(async () => {
              await setEmailSendingControls({ organisationId, paused: !policy.manual_paused_at, dailyLimit: policy.organisation_daily_limit || 500 })
              return policy.manual_paused_at ? 'Your sending pause was removed. Any safety stop still applies.' : 'Campaign and test sending paused for your organisation.'
            })}>{policy.manual_paused_at ? 'Resume organisation sending' : 'Pause organisation sending'}</button>
          </article>}
        </div>
      </details>
    </section>
}

function SenderIdentityCard({ organisationId, identity, senderReady, identityStatus, controlsDisabled, policy, run, onEdit }) {
  return <article key={identity.id}>
    <span className="email-settings-icon"><Mail size={17} /></span>
    <div>
      <strong>{identity.display_name}{identity.sender_mode === 'arch9' ? ' via Arch9' : ''}{identity.is_default ? ' · Default' : ''}</strong>
      <small>{identity.from_email || 'Arch9 campaign sender'}</small>
      <small>Reply to: {identity.reply_to_email}</small>
      <div className="email-sender-actions">
        {identity.sender_mode !== 'arch9' && <button type="button" className="wa-secondary-button" disabled={controlsDisabled || identity.verification_status === 'disabled'} onClick={() => onEdit(identity)}>Edit sender</button>}
        <button type="button" className="wa-secondary-button" disabled={controlsDisabled || policy?.account_ready !== true || !policy?.approved_at || policy?.paused_at || policy?.manual_paused_at || policy?.self_service_blocked || !senderReady(identity)} onClick={() => void run(async () => { const result = await sendEmailCampaignTest({ organisationId, senderIdentityId: identity.id, setupTest: true }); return `Test accepted for sending to ${result.deliveredTo}. Check your inbox and spam folder, then reply to check your reply-to inbox.` })}><Send size={14} /> Send me a test</button>
      </div>
    </div>
    <span className={`email-domain-status ${senderReady(identity) ? 'is-verified' : ''}`}>{identityStatus(identity)}</span>
  </article>
}

const EmailMailboxSettings = lazy(() => import('../inbox/EmailMailboxSettings.jsx'))
export default function EmailCampaignSettings(props) {
  const [section, setSection] = useState('sending')
  return <div>
    <div className="email-settings-nav" role="tablist" aria-label="Email settings sections">
      {[['sending','Sending domains & senders'],['mailboxes','Mailboxes'],['signatures','Signatures']].map(([key,label]) => <button type="button" key={key} role="tab" aria-selected={section === key} onClick={() => setSection(key)}>{label}</button>)}
    </div>
    {section === 'sending' ? <EmailSendingSettings key={props.organisationId} {...props} /> : <Suspense fallback={<p role="status">Opening mailbox settings…</p>}><EmailMailboxSettings key={`${props.organisationId}:${props.userId}`} organisationId={props.organisationId} userId={props.userId} tab={section} showTabs={false} /></Suspense>}
  </div>
}
