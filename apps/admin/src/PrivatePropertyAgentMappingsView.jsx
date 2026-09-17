import { Link2, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

const KINGDOM_ORGANISATION_ID = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'
const ARCH9_APP_URL = 'https://app.arch9.co.za'
const KNOWN_REFERENCES = [
  { label: 'Kevin Croft · current 6 listings', value: '5a58409e-3f06-4226-a43c-0e7e42102bd7' },
  { label: 'Esmerie Croft · current 3 listings', value: '1d07aab0-e261-4bf1-9a7c-1fd56be6a768' },
  { label: 'Kevin C · alternative record', value: '9c916708-15bb-439a-83e3-3ecd4490315c' },
  { label: 'Kevin Croft · lead-routing record', value: 'dc43fbd6-f387-445d-8087-c8117b716dcd' },
]

export default function PrivatePropertyAgentMappingsView({ access }) {
  const [data, setData] = useState({ users: [], mappings: [], privatePropertyAgents: [], credentialDiagnostics: null })
  const [form, setForm] = useState({ arch9UserId: '', privatePropertyAgentId: '', sourceReference: '', isDefaultForOrganisation: false, notes: '' })
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  if (access.level !== 'executive') return null
  async function token() { const { data: session } = await supabase.auth.getSession(); return session.session?.access_token || '' }
  async function load() {
    setLoading(true)
    setNotice('')
    try {
      const accessToken = await token(); if (!accessToken) throw new Error('Sign in again to manage mappings.')
      const response = await fetch(`${ARCH9_APP_URL}/api/admin/private-property/agent-mappings?organisationId=${KINGDOM_ORGANISATION_ID}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const body = await response.json().catch(() => ({})); if (!response.ok) { if (body.credentialDiagnostics) setData((current) => ({ ...current, credentialDiagnostics: body.credentialDiagnostics })); throw new Error(body.message || 'Unable to load agent mappings.') }
      setData({ users: body.users || [], mappings: body.mappings || [], privatePropertyAgents: body.privatePropertyAgents || [], credentialDiagnostics: body.credentialDiagnostics || null })
      setNotice('')
    } catch (error) { setNotice(error.message || 'Unable to load agent mappings.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  async function save(event) {
    event.preventDefault(); setNotice('')
    if (!form.arch9UserId || !form.privatePropertyAgentId.trim() || !form.sourceReference.trim()) return setNotice('Choose the Arch9 user, then enter the PP agent ID and source reference.')
    setSaving(true)
    try {
      const accessToken = await token(); if (!accessToken) throw new Error('Sign in again to save the mapping.')
      const response = await fetch(`${ARCH9_APP_URL}/api/admin/private-property/agent-mappings?organisationId=${KINGDOM_ORGANISATION_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || 'Unable to save the mapping.')
      setForm({ arch9UserId: '', privatePropertyAgentId: '', sourceReference: '', isDefaultForOrganisation: false, notes: '' }); setNotice('Agent mapping saved.'); await load()
    } catch (error) { setNotice(error.message || 'Unable to save the mapping.') } finally { setSaving(false) }
  }
  const activeUsers = data.users.filter((user) => user.status === 'active' || user.membership_status === 'active' || user.membership_status === 'accepted')
  const availableAgents = data.privatePropertyAgents.filter((agent) => agent.active)
  function selectUser(userId) {
    const user = activeUsers.find((candidate) => candidate.user_id === userId)
    const matchedAgent = availableAgents.find((agent) => agent.email && agent.email === user?.email?.toLowerCase())
    setForm({ ...form, arch9UserId: userId, privatePropertyAgentId: matchedAgent?.privatePropertyAgentId || form.privatePropertyAgentId })
  }
  const diagnostic = data.credentialDiagnostics
  const diagnosticMessage = diagnostic?.runtimeCredentialsPresent ? (diagnostic.vaultMatchesRuntime ? 'Admin Vault credentials match the Vercel production credentials.' : 'Admin Vault credentials differ from the Vercel production credentials.') : 'No Private Property runtime credentials are configured in Vercel; the encrypted Admin Vault connection is in use.'
  return <section className="data-panel property24-credentials-panel"><div className="panel-title"><div><h2>Kingdom Private Property agent mappings</h2><span>Internal-only · Production</span></div><Link2 size={20} aria-hidden="true" /></div><p>Link each Arch9 user to the matching Private Property agent. The production agent list is loaded securely from Private Property; selecting an Arch9 user will prefill an exact email match.</p>{diagnostic ? <p className="private-property-admin-status">{diagnosticMessage}</p> : null}<form onSubmit={save} className="property24-credentials-form"><label><span>Arch9 user</span><select value={form.arch9UserId} onChange={(event) => selectUser(event.target.value)}><option value="">Choose a user</option>{activeUsers.map((user) => <option key={user.user_id} value={user.user_id}>{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email} · {user.email}</option>)}</select></label><label><span>Private Property agent</span><select value={form.privatePropertyAgentId} onChange={(event) => setForm({ ...form, privatePropertyAgentId: event.target.value })}><option value="">Choose a Private Property agent</option>{availableAgents.map((agent) => <option key={agent.privatePropertyAgentId} value={agent.privatePropertyAgentId}>{[agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email} · {agent.email} · {agent.privatePropertyAgentId}</option>)}</select></label><label><span>Private Property source reference</span><select value={form.sourceReference} onChange={(event) => setForm({ ...form, sourceReference: event.target.value })}><option value="">Choose the PP stock-file reference</option>{KNOWN_REFERENCES.map((reference) => <option key={reference.value} value={reference.value}>{reference.label}</option>)}</select></label><label className="private-property-mapping-check"><input type="checkbox" checked={form.isDefaultForOrganisation} onChange={(event) => setForm({ ...form, isDefaultForOrganisation: event.target.checked })} />Use as Kingdom’s default PP agent</label><button className="primary-button" disabled={saving || loading} type="submit">{saving ? <Loader2 className="spin" size={16} /> : <Link2 size={16} />}<span>{saving ? 'Saving mapping…' : 'Save agent mapping'}</span></button></form><div className="private-property-mapping-list"><div><strong>Saved mappings</strong><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />Refresh</button></div>{loading ? <p>Loading mappings…</p> : data.mappings.length ? <ul>{data.mappings.map((mapping) => <li key={mapping.id}>{mapping.firstNameSnapshot} {mapping.lastNameSnapshot} · PP ID {mapping.privatePropertyAgentId} · {mapping.sourceReference}</li>)}</ul> : <p>No agent mappings saved yet.</p>}</div>{notice ? <p className="property24-credentials-notice">{notice}</p> : null}</section>
}
