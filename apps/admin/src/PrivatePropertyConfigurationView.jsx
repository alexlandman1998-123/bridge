import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

const ARCH9_APP_URL = 'https://app.arch9.co.za'
const PRODUCTION_URL = 'https://services.privateproperty.co.za/AgentImport/AgentImport.asmx'

function parseBlock(value) {
  const values = Object.fromEntries(String(value).split(/\r?\n/).map((line) => line.trimStart()).filter((line) => line.trim() && !line.startsWith('#')).map((line) => {
    const index = line.indexOf('=')
    if (index < 0) return ['', '']
    const key = line.slice(0, index).trim()
    const rawValue = line.slice(index + 1)
    const isQuoted = (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
    return [key, isQuoted ? rawValue.slice(1, -1) : rawValue.trim()]
  }))
  return { username: values.PRIVATE_PROPERTY_USERNAME || '', password: values.PRIVATE_PROPERTY_PASSWORD || '' }
}

export default function PrivatePropertyConfigurationView({ access, organisationId, organisationName = 'Selected organisation' }) {
  const [branchGuid, setBranchGuid] = useState('')
  const [credentialBlock, setCredentialBlock] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('Loading production configuration…')
  const [leadWebhook, setLeadWebhook] = useState(null)
  const [agencyId, setAgencyId] = useState('')
  const [signingSecret, setSigningSecret] = useState('')
  const [savingWebhook, setSavingWebhook] = useState(false)
  if (access.level !== 'executive') return null

  async function token() { const { data } = await supabase.auth.getSession(); return data.session?.access_token || '' }
  async function load() {
    try {
      const accessToken = await token(); if (!accessToken) return setStatus('Sign in to view the production configuration.')
      const response = await fetch(`${ARCH9_APP_URL}/api/admin/private-property/configuration?organisationId=${encodeURIComponent(organisationId)}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.message || 'Unable to load configuration.')
      setBranchGuid(result.config?.branchGuid || '')
      setLeadWebhook(result.leadWebhook || null)
      setAgencyId(result.leadWebhook?.agencyId || '')
      setSigningSecret('')
      setStatus(result.config ? `${result.credentialsConfigured ? 'Credentials encrypted' : 'Credentials still required'} · ${result.config.status} · publishing ${result.config.enabled ? 'enabled' : 'disabled'}` : 'No production connection saved yet.')
    } catch (error) { setStatus(error.message || 'Unable to load configuration.') }
  }
  useEffect(() => { void load() }, [organisationId])
  async function save(event) {
    event.preventDefault(); setNotice('')
    const credentials = parseBlock(credentialBlock)
    if (!branchGuid.trim()) return setNotice('Enter the Private Property branch GUID.')
    if (!credentials.username || !credentials.password) return setNotice('Paste PRIVATE_PROPERTY_USERNAME and PRIVATE_PROPERTY_PASSWORD.')
    setSaving(true)
    try {
      const accessToken = await token(); if (!accessToken) throw new Error('Your admin session has expired. Sign in again and retry.')
      const response = await fetch(`${ARCH9_APP_URL}/api/admin/private-property/configuration?organisationId=${encodeURIComponent(organisationId)}`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ branchGuid, baseUrl: PRODUCTION_URL, ...credentials }) })
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.message || 'The production connection could not be saved.')
      setCredentialBlock(''); setNotice('Encrypted production credentials saved. Publishing is still disabled until Arch9 completes verification.'); await load()
    } catch (error) { setNotice(error.message || 'The production connection could not be saved.') } finally { setSaving(false) }
  }
  async function saveLeadWebhook(event) {
    event.preventDefault(); setNotice(''); setSavingWebhook(true)
    try {
      const accessToken = await token(); if (!accessToken) throw new Error('Your admin session has expired. Sign in again and retry.')
      const response = await fetch(`${ARCH9_APP_URL}/api/admin/private-property/configuration?organisationId=${encodeURIComponent(organisationId)}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lead_webhook', agencyId, signingSecret }),
      })
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.message || 'Lead delivery setup could not be saved.')
      setSigningSecret(''); setLeadWebhook(result.leadWebhook); setNotice(result.message)
    } catch (error) { setNotice(error.message || 'Lead delivery setup could not be saved.') } finally { setSavingWebhook(false) }
  }
  return <section className="data-panel property24-credentials-panel">
    <div className="panel-title"><div><h2>{organisationName} Private Property production</h2><span>Internal-only · Arch9-managed</span></div><ShieldCheck size={20} aria-hidden="true" /></div>
    <p>Agencies cannot configure this connection. Paste the supplier credentials here; they are encrypted server-side, never displayed again, and publishing stays off until Arch9 verifies the mapping.</p>
    <p className="private-property-admin-status">{status}</p>
    <form onSubmit={save} className="property24-credentials-form"><label><span>Private Property branch GUID</span><input autoComplete="off" onChange={(event) => setBranchGuid(event.target.value)} value={branchGuid} /></label><label><span>Production credential block</span><textarea autoComplete="off" onChange={(event) => setCredentialBlock(event.target.value)} placeholder={'PRIVATE_PROPERTY_USERNAME=…\nPRIVATE_PROPERTY_PASSWORD=…'} rows={4} spellCheck="false" value={credentialBlock} /></label><button className="primary-button" disabled={saving} type="submit">{saving ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}<span>{saving ? 'Saving securely…' : 'Save encrypted production connection'}</span></button></form>
    <h3>Private Property lead delivery</h3>
    <p>In the <a href="https://admin.privateproperty.co.za" target="_blank" rel="noreferrer">Private Property Admin Portal</a>, an agency principal or group owner must add an HTTPS lead webhook. Use the endpoint below, then save the numeric agency ID and the signing secret Private Property issues. Listing API credentials do not activate lead delivery.</p>
    {leadWebhook?.endpoint ? <p><strong>Webhook endpoint:</strong> <code>{leadWebhook.endpoint}</code></p> : null}
    <p>{leadWebhook?.secretConfigured ? 'Signing secret encrypted.' : 'Signing secret still required.'} {leadWebhook?.lastReceivedAt ? `Last delivery: ${new Date(leadWebhook.lastReceivedAt).toLocaleString()}.` : 'No lead delivery received yet.'} {leadWebhook?.failedCount ? `${leadWebhook.failedCount} failed deliveries need review.` : ''}</p>
    <form onSubmit={saveLeadWebhook} className="property24-credentials-form">
      <label><span>Private Property agency ID</span><input inputMode="numeric" autoComplete="off" value={agencyId} onChange={(event) => setAgencyId(event.target.value)} required /></label>
      <label><span>Webhook signing secret</span><input type="password" autoComplete="new-password" value={signingSecret} onChange={(event) => setSigningSecret(event.target.value)} placeholder={leadWebhook?.secretConfigured ? 'Leave blank to retain the current secret' : 'Secret issued by Private Property'} required={!leadWebhook?.secretConfigured} /></label>
      <button className="primary-button" type="submit" disabled={savingWebhook || !branchGuid}>{savingWebhook ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}<span>{savingWebhook ? 'Saving securely…' : 'Save lead delivery setup'}</span></button>
    </form>
    {notice ? <p className="property24-credentials-notice">{notice}</p> : null}
  </section>
}
