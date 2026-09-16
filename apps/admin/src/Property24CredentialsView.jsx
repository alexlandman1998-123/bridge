import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { supabase } from './lib/supabaseClient'

const KINGDOM_ORGANISATION_ID = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'
const ARCH9_APP_URL = 'https://app.arch9.co.za'

export default function Property24CredentialsView({ access }) {
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
          organisationId: KINGDOM_ORGANISATION_ID,
          username: credentials.username,
          password: credentials.password,
          userGroupId: credentials.userGroupId,
        }),
      })
      const body = await result.json().catch(() => ({}))
      if (!result.ok) throw new Error(body.message || 'The credentials could not be saved.')
      setCredentialBlock('')
      setNotice('Kingdom’s production credentials are encrypted and saved. They are not shown again.')
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
          <h2>Kingdom Property24 credentials</h2>
          <span>Internal-only · Production · Agency 39227</span>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </div>
      <p>Paste the Property24 username and password here. A user-group is optional and must only be included when Property24 supplied one. Values are encrypted server-side and never displayed after saving.</p>
      <form onSubmit={save} className="property24-credentials-form">
        <label>
          <span>Kingdom credential block</span>
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
