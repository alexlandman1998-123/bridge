import { useState } from 'react'
import { Copy, Globe, Mail, Plus, RefreshCw } from 'lucide-react'
import { createEmailSender, createEmailSendingDomain, refreshEmailSenderVerification, verifyEmailSendingDomain } from '../../services/emailCampaignService'

export default function EmailCampaignSettings({ organisationId, userId, domains = [], identities = [], loading, error: loadError, onRefresh }) {
  const [domainName, setDomainName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [domainId, setDomainId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const unavailable = busy || loading || Boolean(loadError) || !organisationId
  const selectedDomain = domains.find((domain) => domain.id === domainId)
  const run = async (action) => {
    if (unavailable) return
    setBusy(true); setError(''); setNotice('')
    try { const message = await action(); await onRefresh(); setNotice(message) }
    catch (cause) { setError(cause.message || 'Unable to update email settings.') }
    finally { setBusy(false) }
  }
  const addDomain = (event) => {
    event.preventDefault()
    void run(async () => {
      const name = domainName.trim().toLowerCase()
      if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(name)) throw new Error('Enter a domain name such as updates.youragency.co.za, without https:// or a path.')
      const result = await createEmailSendingDomain({ organisationId, domain: name })
      setDomainName('')
      return result.created ? 'Domain added. Publish the DNS records below, then check verification.' : 'This domain is already configured for your organisation.'
    })
  }
  const addSender = (event) => {
    event.preventDefault()
    void run(async () => {
      if (!displayName.trim()) throw new Error('Add a display name for this sender.')
      if (!selectedDomain) throw new Error('Choose a sending domain.')
      const address = email.trim().toLowerCase()
      if (address.split('@').at(-1) !== selectedDomain.domain_name.toLowerCase()) throw new Error(`Use an address ending in @${selectedDomain.domain_name}.`)
      await createEmailSender({ organisationId, userId, displayName: displayName.trim(), email: address, sendingDomainId: domainId })
      setDisplayName(''); setEmail('')
      return 'Sender added. It becomes available when its domain is verified.'
    })
  }
  const copyRecord = async (value) => {
    try { await navigator.clipboard.writeText(String(value || '')); setNotice('DNS value copied.'); setError('') }
    catch { setError('Unable to copy. Select the DNS value and copy it manually.') }
  }
  return <section className="email-settings-workspace" aria-label="Email settings">
    <div className="email-section-heading"><div><h2>Email settings</h2><p>Set up your sending domains and the addresses your audience will hear from.</p></div><button className="wa-secondary-button" type="button" disabled={unavailable} onClick={() => void run(async () => { const result = await refreshEmailSenderVerification(organisationId); return `${result.verified} of ${result.checked} sender domains verified.` })}><RefreshCw size={15} /> Recheck verification</button></div>
    {error && <p className="wa-error" role="alert">{error}</p>}{notice && <p className="wa-notice" role="status">{notice}</p>}
    {loading && <p className="email-settings-loading" role="status">Loading email settings…</p>}
    <div className="email-settings-grid">
      <article className="email-settings-card"><div className="email-settings-card-heading"><span className="email-settings-icon"><Globe size={20} /></span><div><h3>Sending domains</h3><p>Use a domain or subdomain your organisation controls.</p></div></div>
        <form onSubmit={addDomain}><label>Domain name<input required value={domainName} onChange={(event) => setDomainName(event.target.value)} placeholder="updates.youragency.co.za" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={unavailable} /></label><small>A dedicated subdomain keeps campaign mail separate from everyday email.</small><button className="wa-primary-button" disabled={unavailable} type="submit"><Plus size={15} /> Add domain</button></form>
        <div className="email-domain-cards">{!loading && !loadError && !domains.length && <p className="email-settings-empty">No sending domains yet. Add one above to get its DNS records.</p>}{domains.map((domain) => <article className="email-domain-card" key={domain.id}><div className="email-domain-title"><strong>{domain.domain_name}</strong><span className={`email-domain-status ${domain.verification_status === 'verified' ? 'is-verified' : ''}`}>{domain.verification_status || 'pending'}</span></div>
          {domain.last_provider_error && <p className="wa-error">{domain.last_provider_error}</p>}
          {Array.isArray(domain.dns_records) && domain.dns_records.length ? <><p>Add these records at your DNS provider:</p><div className="email-settings-dns">{domain.dns_records.map((record, index) => <div key={`${record.name}-${index}`}><span><b>{record.record || record.type}</b><small>{record.type} · {record.name}{record.priority != null ? ` · Priority ${record.priority}` : ''}</small><code>{record.value}</code></span><button type="button" aria-label={`Copy DNS value for ${record.name}`} onClick={() => void copyRecord(record.value)}><Copy size={15} /></button></div>)}</div></> : <p>DNS records will appear after domain setup completes.</p>}
          <button type="button" className="wa-secondary-button" disabled={unavailable || !domain.provider_domain_id} onClick={() => void run(async () => { const result = await verifyEmailSendingDomain({ organisationId, domainId: domain.id }); return result.domain?.status === 'verified' ? `${domain.domain_name} is verified.` : `Verification requested for ${domain.domain_name}. DNS changes can take time to appear.` })}>Check domain verification</button>
        </article>)}</div>
      </article>
      <article className="email-settings-card"><div className="email-settings-card-heading"><span className="email-settings-icon"><Mail size={20} /></span><div><h3>Sender identities</h3><p>The name and address shown on campaign emails.</p></div></div>
        <form onSubmit={addSender}><label>Display name<input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your agency" disabled={unavailable} /></label><label>Sending domain<select required value={domainId} onChange={(event) => setDomainId(event.target.value)} disabled={unavailable}><option value="">Choose a domain</option>{domains.map((domain) => <option value={domain.id} key={domain.id}>{domain.domain_name} · {domain.verification_status}</option>)}</select></label><label>Sender email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={selectedDomain ? `marketing@${selectedDomain.domain_name}` : 'marketing@youragency.co.za'} disabled={unavailable} /></label><button type="submit" className="wa-primary-button" disabled={unavailable || !selectedDomain}><Plus size={15} /> Add sender</button></form>
        <div className="email-sender-cards">{!loading && !loadError && !identities.length && <p className="email-settings-empty">No sender addresses yet. Add a domain, then create your sender.</p>}{identities.map((identity) => <article key={identity.id}><span className="email-settings-icon"><Mail size={17} /></span><div><strong>{identity.display_name}</strong><small>{identity.from_email}</small>{identity.reply_to_email && identity.reply_to_email !== identity.from_email && <small>Reply to: {identity.reply_to_email}</small>}</div><span className={`email-domain-status ${identity.verification_status === 'verified' ? 'is-verified' : ''}`}>{identity.verification_status || 'pending'}</span></article>)}</div>
      </article>
    </div>
  </section>
}
