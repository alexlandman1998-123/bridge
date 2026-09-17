import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

const KINGDOM_ORGANISATION_ID = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'
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

export default function PrivatePropertyConfigurationView({ access }) {
  const [branchGuid, setBranchGuid] = useState('366F17E8-0A28-482F-99E8-D0CAB95D4308')
  const [credentialBlock, setCredentialBlock] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('Loading production configuration…')
  if (access.level !== 'executive') return null

  async function token() { const { data } = await supabase.auth.getSession(); return data.session?.access_token || '' }
  async function load() {
    try {
      const accessToken = await token(); if (!accessToken) return setStatus('Sign in to view the production configuration.')
      const response = await fetch(`${ARCH9_APP_URL}/api/admin/private-property/configuration?organisationId=${KINGDOM_ORGANISATION_ID}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.message || 'Unable to load configuration.')
      if (result.config?.branchGuid) setBranchGuid(result.config.branchGuid)
      setStatus(result.config ? `${result.credentialsConfigured ? 'Credentials encrypted' : 'Credentials still required'} · ${result.config.status} · publishing ${result.config.enabled ? 'enabled' : 'disabled'}` : 'No production connection saved yet.')
    } catch (error) { setStatus(error.message || 'Unable to load configuration.') }
  }
  useEffect(() => { void load() }, [])
  async function save(event) {
    event.preventDefault(); setNotice('')
    const credentials = parseBlock(credentialBlock)
    if (!branchGuid.trim()) return setNotice('Enter the Private Property branch GUID.')
    if (!credentials.username || !credentials.password) return setNotice('Paste PRIVATE_PROPERTY_USERNAME and PRIVATE_PROPERTY_PASSWORD.')
    setSaving(true)
    try {
      const accessToken = await token(); if (!accessToken) throw new Error('Your admin session has expired. Sign in again and retry.')
      const response = await fetch(`${ARCH9_APP_URL}/api/admin/private-property/configuration?organisationId=${KINGDOM_ORGANISATION_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ branchGuid, baseUrl: PRODUCTION_URL, ...credentials }) })
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.message || 'The production connection could not be saved.')
      setCredentialBlock(''); setNotice('Encrypted production credentials saved. Publishing is still disabled until Arch9 completes verification.'); await load()
    } catch (error) { setNotice(error.message || 'The production connection could not be saved.') } finally { setSaving(false) }
  }
  return <section className="data-panel property24-credentials-panel">
    <div className="panel-title"><div><h2>Kingdom Private Property production</h2><span>Internal-only · Arch9-managed</span></div><ShieldCheck size={20} aria-hidden="true" /></div>
    <p>Agencies cannot configure this connection. Paste the supplier credentials here; they are encrypted server-side, never displayed again, and publishing stays off until Arch9 verifies the mapping.</p>
    <p className="private-property-admin-status">{status}</p>
    <form onSubmit={save} className="property24-credentials-form"><label><span>Private Property branch GUID</span><input autoComplete="off" onChange={(event) => setBranchGuid(event.target.value)} value={branchGuid} /></label><label><span>Production credential block</span><textarea autoComplete="off" onChange={(event) => setCredentialBlock(event.target.value)} placeholder={'PRIVATE_PROPERTY_USERNAME=…\nPRIVATE_PROPERTY_PASSWORD=…'} rows={4} spellCheck="false" value={credentialBlock} /></label><button className="primary-button" disabled={saving} type="submit">{saving ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}<span>{saving ? 'Saving securely…' : 'Save encrypted production connection'}</span></button></form>
    {notice ? <p className="property24-credentials-notice">{notice}</p> : null}
  </section>
}
