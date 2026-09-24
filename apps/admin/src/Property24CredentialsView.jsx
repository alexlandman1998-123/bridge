import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { supabase } from './lib/supabaseClient'

const ARCH9_APP_URL = 'https://app.arch9.co.za'

function organisationName(organisation = {}) {
  return organisation.name || organisation.tradingName || organisation.displayName || 'Unnamed organisation'
}

export default function Property24CredentialsView({ access, organisations = [] }) {
  const [organisationId, setOrganisationId] = useState('')
  const [agencyId, setAgencyId] = useState('')
  const [credentialBlock, setCredentialBlock] = useState('')
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (access.level !== 'executive') return null

  function parseCredentialBlock(value = '') {
    const entries = String(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return ['', '']
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')]
      })
    const values = Object.fromEntries(entries)
    return {
      username: values.PROPERTY24_BASIC_AUTH_USERNAME || '',
      password: values.PROPERTY24_BASIC_AUTH_PASSWORD || '',
      userGroupId: values.PROPERTY24_USER_GROUP_ID || '',
    }
  }

  async function save(event) {
    event.preventDefault()
    setNotice('')
    const credentials = parseCredentialBlock(credentialBlock)
    const organisation = organisations.find((candidate) => candidate.id === organisationId)
    if (!organisationId || !organisation) {
      setNotice('Choose the organisation that owns these Property24 credentials.')
      return
    }
    if (!/^\d+$/.test(agencyId.trim()) || Number(agencyId) <= 0) {
      setNotice('Enter a valid Property24 agency ID.')
      return
    }
    if (!credentials.username || !credentials.password) {
      setNotice('Paste the Property24 username and password. Add a user-group only if Property24 supplied one.')
      return
    }
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setNotice('Your admin session has expired. Sign in again and retry.')
      return
    }
    setIsSaving(true)
    try {
      const result = await fetch(`${ARCH9_APP_URL}/api/admin/property24/credentials`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationId,
          agencyId: agencyId.trim(),
          username: credentials.username,
          password: credentials.password,
          userGroupId: credentials.userGroupId,
        }),
      })
      const body = await result.json().catch(() => ({}))
      if (!result.ok) throw new Error(body.message || 'The credentials could not be saved.')
      setCredentialBlock('')
      setNotice(`${organisationName(organisation)}’s production credentials are encrypted and saved. Publishing remains disabled.`)
    } catch (error) {
      setNotice(error.message || 'The credentials could not be saved.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="data-panel property24-credentials-panel">
      <div className="panel-title">
        <div>
          <h2>Property24 agency credentials</h2>
          <span>Internal-only · Production</span>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </div>
      <p>Choose an agency, enter its Property24 agency ID, then paste its credentials. Values are encrypted server-side and never displayed after saving. Saving never enables publishing.</p>
      <form onSubmit={save} className="property24-credentials-form">
        <label>
          <span>Organisation</span>
          <select autoComplete="off" onChange={(event) => setOrganisationId(event.target.value)} required value={organisationId}>
            <option value="">Choose an organisation</option>
            {[...organisations].sort((left, right) => organisationName(left).localeCompare(organisationName(right))).map((organisation) => (
              <option key={organisation.id} value={organisation.id}>{organisationName(organisation)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Property24 agency ID</span>
          <input autoComplete="off" inputMode="numeric" onChange={(event) => setAgencyId(event.target.value)} required value={agencyId} />
        </label>
        <label>
          <span>Property24 credential block</span>
          <textarea
            autoComplete="off"
            onChange={(event) => setCredentialBlock(event.target.value)}
            placeholder={'PROPERTY24_BASIC_AUTH_USERNAME=…\nPROPERTY24_BASIC_AUTH_PASSWORD=…\n# Optional only if supplied: PROPERTY24_USER_GROUP_ID=…'}
            rows={5}
            spellCheck="false"
            value={credentialBlock}
          />
        </label>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}
          <span>{isSaving ? 'Saving securely…' : 'Save encrypted credentials'}</span>
        </button>
      </form>
      {notice ? <p className="property24-credentials-notice">{notice}</p> : null}
    </section>
  )
}
