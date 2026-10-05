import { useEffect, useState } from 'react'
import { Globe2, Plus, RefreshCw } from 'lucide-react'
import Button from '../../components/ui/Button'
import { useOrganisation } from '../../context/OrganisationContext'
import { REVO_ORGANISATION_ID } from '../../modules/revo/revoExtensionRegistry'
import { manageExternalWebsite } from '../../services/externalWebsiteService'
import { SettingsBanner, SettingsLoadingState, SettingsSectionCard, settingsCardClass, settingsPageClass } from './settingsUi'

const initialForm = { name: '', website_url: '', mode: 'leads_only', scope: 'organisation', branch_ids: [], development_id: '', fallback_user_id: '', enabled: true, public_contacts: false, include_sold: false, include_rented: false, webhook_url: '' }
const inputClass = 'ui-input w-full rounded-[10px] border border-[#dbe5ee] bg-white px-3 py-2 text-sm'
const date = (value) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : 'No activity yet'
function Field({ label, children }) { return <label className="grid gap-2 text-sm font-semibold text-[#43566d]">{label}{children}</label> }

export function ExternalWebsiteWorkspace({ organisationId, manage = manageExternalWebsite }) {
  const [overview, setOverview] = useState(null)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [editing, setEditing] = useState(false)
  const [credential, setCredential] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    manage(organisationId).then((data) => { if (active) setOverview(data) }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [organisationId, manage])
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  async function refresh(includeDetail = false) {
    setOverview(await manage(organisationId))
    if (includeDetail && detail?.connection?.id) setDetail(await manage(organisationId, 'detail', detail.connection.id))
  }
  async function select(connection) {
    setBusy(true); setError(''); setCredential(null); setEditing(false); setNotice('')
    try { const next = await manage(organisationId, 'detail', connection.id); setDetail(next); setForm({ ...initialForm, ...next.connection }) }
    catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  async function run(action, config = {}) {
    setBusy(true); setError(''); setNotice(''); setCredential(null)
    try {
      const result = await manage(organisationId, action, detail?.connection?.id || null, config)
      setDetail(result); setForm({ ...initialForm, ...result.connection }); setEditing(false)
      if (result.credential) setCredential({ token: result.credential, secret: result.webhookSecret })
      setNotice(action === 'revoke' ? 'Credentials revoked. This website can no longer access Arch9.' : action === 'retry' ? 'Delivery queued for another attempt.' : 'Connection saved.')
      await refresh()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  function create() { setDetail(null); setCredential(null); setForm(initialForm); setEditing(true); setError(''); setNotice('') }
  const c = detail?.connection
  const fallbackUsers = (overview?.users || []).filter((user) => form.scope !== 'branches' || form.branch_ids.includes(user.branchId))
  return (
    <div className={`${settingsPageClass} text-[#162334]`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">External Websites</h1><p className="mt-2 text-sm text-[#61748a]">Connect Revo’s main website and development websites to Arch9 listings and enquiries.</p></div>
        <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => { setBusy(true); refresh(true).catch((failure) => setError(failure.message)).finally(() => setBusy(false)) }}><RefreshCw size={16} />Refresh</Button><Button disabled={busy || !overview} onClick={create}><Plus size={16} />New website</Button></div>
      </header>
      {error ? <div role="alert"><SettingsBanner tone="error">{error}</SettingsBanner></div> : null}
      {notice ? <div role="status"><SettingsBanner tone="success">{notice}</SettingsBanner></div> : null}
      {!overview && !error ? <SettingsLoadingState label="Loading Revo website connections…" /> : null}
      {overview?.connections?.length === 0 ? <p className={`${settingsCardClass} text-sm text-[#61748a]`}>No external websites connected. Add Revo’s main website or a development website to begin.</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(overview?.connections || []).map((connection) => <button key={connection.id} type="button" disabled={busy} onClick={() => select(connection)} className={`${settingsCardClass} text-left transition hover:border-[#0f7f4f] ${c?.id === connection.id ? 'ring-2 ring-[#9dd9bd]' : ''}`}>
          <div className="flex items-center justify-between gap-2"><Globe2 size={18} className="text-[#0f7f4f]" /><span className="rounded-full bg-[#eef7f2] px-2 py-1 text-xs">{connection.enabled ? connection.credentialsConfigured ? 'Enabled' : 'Credentials revoked' : 'Disabled'}</span></div>
          <h2 className="mt-3 font-semibold">{connection.name}</h2><p className="mt-1 break-all text-xs text-[#61748a]">{connection.website_url}</p>
          <p className="mt-3 text-sm">{connection.mode === 'leads_only' ? 'Leads only' : 'Listings and leads'} · {connection.scopeLabel}</p>
          <dl className="mt-3 space-y-1 text-xs text-[#61748a]"><div>Listing request: {date(connection.last_listing_request_at)}</div><div>Webhook delivered: {date(connection.last_webhook_at)}</div><div>Enquiry: {date(connection.last_enquiry_at)}</div><div className={connection.recentFailures ? 'text-[#b42318]' : ''}>{connection.recentFailures} recent failures</div></dl>
        </button>)}
      </div>
      {editing || c ? <div className={`${settingsCardClass} space-y-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{c ? c.name : 'New website connection'}</h2>{c ? <p className="mt-1 break-all text-xs text-[#61748a]">Connection ID: {c.id}</p> : null}</div>{c && !editing ? <Button variant="secondary" disabled={busy} onClick={() => { setEditing(true); setCredential(null) }}>Edit configuration</Button> : null}</div>
        {editing ? <form onSubmit={(event) => { event.preventDefault(); run(c ? 'save' : 'create', form) }} className="grid gap-4 md:grid-cols-2">
          <Field label="Website name"><input className={inputClass} required minLength={2} maxLength={160} value={form.name} onChange={(event) => change('name', event.target.value)} /></Field>
          <Field label="Website URL"><input className={inputClass} type="url" required placeholder="https://www.revo.example" value={form.website_url} onChange={(event) => change('website_url', event.target.value)} /></Field>
          <Field label="Connection mode"><select className={inputClass} value={form.mode} onChange={(event) => change('mode', event.target.value)}><option value="leads_only">Leads only</option><option value="listings_and_leads">Listings and leads</option></select></Field>
          <Field label="Approved scope"><select className={inputClass} value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value, branch_ids: [], development_id: '', fallback_user_id: '' }))}><option value="organisation">Whole Revo organisation</option><option value="branches">Selected branches</option><option value="development">One development</option></select></Field>
          {form.scope === 'branches' ? <fieldset className="rounded-lg border p-3"><legend className="text-sm font-semibold">Permitted branches</legend>{(overview?.branches || []).map((branch) => <label key={branch.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={form.branch_ids.includes(branch.id)} onChange={(event) => setForm((current) => ({ ...current, fallback_user_id: '', branch_ids: event.target.checked ? [...current.branch_ids, branch.id] : current.branch_ids.filter((id) => id !== branch.id) }))} />{branch.name}</label>)}</fieldset> : null}
          {form.scope === 'development' ? <Field label="Development"><select className={inputClass} required value={form.development_id || ''} onChange={(event) => change('development_id', event.target.value)}><option value="">Choose development</option>{(overview?.developments || []).map((development) => <option key={development.id} value={development.id}>{development.name}</option>)}</select></Field> : null}
          <Field label="Fallback enquiry assignee"><select className={inputClass} required value={form.fallback_user_id} onChange={(event) => change('fallback_user_id', event.target.value)}><option value="">Choose an active Revo team member</option>{fallbackUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
          <Field label="Webhook URL (optional)"><input className={inputClass} type="url" placeholder="https://your-website.example/arch9/webhook" value={form.webhook_url || ''} onChange={(event) => change('webhook_url', event.target.value)} /></Field>
          <p className="text-xs leading-5 text-[#61748a] md:col-span-2">Property enquiries go to the active listing agent, then the fallback above. Principal notifications follow Arch9’s existing rule. Scope also applies to lead targets. Street addresses and coordinates are kept private.</p>
          {[["enabled","Connection enabled"], ["public_contacts","Approve public agent and branch names, email and telephone"], ["include_sold","Keep sold properties while their public projection remains published"], ["include_rented","Keep rented properties while their public projection remains published"]].map(([key,label]) => <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form[key]} onChange={(event) => change(key, event.target.checked)} />{label}</label>)}
          <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(false); if (c) setForm({ ...initialForm, ...c }) }}>Cancel</Button><Button type="submit" disabled={busy || (form.scope === 'branches' && !form.branch_ids.length)}>{busy ? 'Saving…' : c ? 'Save configuration' : 'Create connection'}</Button></div>
        </form> : null}
        {c ? <SettingsSectionCard title="Credentials" description="Keep credentials on the website backend. They appear only when created or rotated.">
          <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => run('rotate')}>{c.credentialsConfigured ? 'Rotate credentials' : 'Generate credentials'}</Button><Button variant="secondary" disabled={busy || !c.credentialsConfigured} onClick={() => run('revoke')}>Revoke credentials</Button></div>
          {credential ? <div className="rounded-xl bg-[#f2fbf5] p-4"><p className="text-sm font-semibold">Save these now. Rotating invalidates the previous credential and signing secret.</p><Field label="Backend API credential"><input className={`${inputClass} mt-2 font-mono text-xs`} readOnly value={credential.token} /></Field><div className="mt-3"><Field label="Webhook signing secret"><input className={`${inputClass} font-mono text-xs`} readOnly value={credential.secret} /></Field></div><Button variant="secondary" className="mt-3" onClick={() => setCredential(null)}>Hide credentials</Button></div> : null}
        </SettingsSectionCard> : null}
        {c ? <SettingsSectionCard title="Website developer setup" description="Your developers control the website cards, search and property pages.">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#61748a]"><li>Send <code>Authorization: Bearer &lt;credential&gt;</code> from the website backend to <code className="break-all">{window.location.origin}/api/integrations/v1</code>.</li><li>Use <code>GET /listings</code> and <code>GET /listings/:id</code> for approved properties. Leads-only connections cannot read listings.</li><li>Send enquiries to <code>POST /leads</code> with a stable submission ID, source page URL and recorded consent. Marketing consent is separate.</li><li>Verify webhook signatures against the raw request body and timestamp. Save event IDs and versions; remove withdrawn properties from the cache.</li><li>Poll <code>GET /changes?cursor=0</code>, follow <code>nextCursor</code>, and retain the cursor to recover missed updates and removals.</li></ol>
        </SettingsSectionCard> : null}
        {c ? <SettingsSectionCard title="Webhook deliveries" description="Failures retain their outcome and retry automatically with backoff.">
          {detail.deliveries?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Status</th><th className="p-2">Attempts</th><th className="p-2">Next attempt / outcome</th><th className="p-2">Action</th></tr></thead><tbody>{detail.deliveries.map((delivery) => <tr key={delivery.id} className="border-t border-[#e8eef5]"><td className="p-2">{delivery.status}</td><td className="p-2">{delivery.attempts}</td><td className="p-2">{delivery.error_code || (delivery.status === 'delivered' ? date(delivery.completed_at) : date(delivery.next_attempt_at))}</td><td className="p-2">{['failed','retry'].includes(delivery.status) ? <Button variant="secondary" disabled={busy} onClick={() => run('retry', { delivery_id: delivery.id })}>Retry delivery</Button> : '—'}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[#61748a]">No deliveries recorded.</p>}
        </SettingsSectionCard> : null}
        {c ? <SettingsSectionCard title="Enquiry follow-ups" description="Internal follow-ups use Arch9’s existing notification queue.">
          {detail.notifications?.length ? <ul className="space-y-2 text-sm text-[#61748a]">{detail.notifications.map((notification) => <li key={notification.id}>{notification.status} · {notification.attempts}/{notification.maxAttempts} attempts · {notification.status === 'sent' ? date(notification.sentAt) : date(notification.nextAttemptAt)}</li>)}</ul> : <p className="text-sm text-[#61748a]">No follow-ups queued for this connection.</p>}
        </SettingsSectionCard> : null}
        {c ? <SettingsSectionCard title="Recent activity" description="These logs omit enquiry contents and credentials.">{detail.activity?.length ? <ul className="space-y-2 text-sm text-[#61748a]">{detail.activity.map((entry,index) => <li key={`${entry.created_at}-${index}`}>{date(entry.created_at)} · {entry.action} · {entry.outcome}</li>)}</ul> : <p className="text-sm">No activity recorded.</p>}</SettingsSectionCard> : null}
      </div> : null}
    </div>
  )
}

export default function SettingsExternalWebsitesPage() {
  const { organisation } = useOrganisation()
  if (organisation?.id !== REVO_ORGANISATION_ID) return <SettingsBanner>External Websites is available for Revo Properties only.</SettingsBanner>
  return <ExternalWebsiteWorkspace key={organisation.id} organisationId={organisation.id} />
}
