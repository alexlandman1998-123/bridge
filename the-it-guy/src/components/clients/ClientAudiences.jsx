import { Copy, Eye, Plus, Search, Trash2, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import Modal from '../ui/Modal'
import {
  archiveEmailAudience,
  getSavedAudiences,
  getAudienceFilterOptions,
  previewSavedAudience,
  saveEmailAudience,
} from '../../services/emailCampaignService'

const FIELD_OPTIONS = [
  { value: 'contact_type', label: 'Contact type', kind: 'select', options: ['buyer', 'seller', 'investor', 'tenant', 'landlord', 'lead'] },
  { value: 'lead_stage', label: 'Lead status' },
  { value: 'preferred_area', label: 'Preferred area' },
  { value: 'tags', label: 'Tags' },
]

const EMPTY_RULE = { field: 'contact_type', operator: 'in', value: ['buyer'] }
const emptyRules = () => ({ operator: 'AND', rules: [{ ...EMPTY_RULE }] })
const normaliseRules = (rules) => {
  if (Array.isArray(rules?.rules)) return rules
  const legacy = [
    ['role_type', 'contact_type'], ['lead_stage', 'lead_stage'], ['area', 'preferred_area'], ['tag', 'tags'],
  ].flatMap(([legacyKey, field]) => rules?.[legacyKey] ? [{ field, operator: 'in', value: [rules[legacyKey]] }] : [])
  return legacy.length ? { operator: 'AND', rules: legacy } : emptyRules()
}
const copyRules = (rules) => JSON.parse(JSON.stringify(normaliseRules(rules)))
const relative = (value) => {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
  return days <= 0 ? 'Just now' : days === 1 ? 'Yesterday' : `${days} days ago`
}
const valuesFor = (rule) => Array.isArray(rule?.value) ? rule.value : [rule?.value].filter(Boolean)
const ruleIsComplete = (rule) => Boolean(rule?.field && valuesFor(rule).some((value) => String(value || '').trim()))
const rulesValid = (rules) => Array.isArray(rules?.rules) && rules.rules.length > 0 && rules.rules.every(ruleIsComplete)

const STARTING_POINTS = [
  { name: 'Buyers', field: 'contact_type', value: ['buyer'], detail: 'People looking to buy' },
  { name: 'Sellers', field: 'contact_type', value: ['seller'], detail: 'People looking to sell' },
  { name: 'Investors', field: 'contact_type', value: ['investor'], detail: 'Investment contacts' },
  { name: 'Clients by area', field: 'preferred_area', value: [], detail: 'Choose an existing area' },
  { name: 'Clients by tag', field: 'tags', value: [], detail: 'Choose an existing tag' },
]

function RuleRow({ rule, index, onChange, onRemove, canRemove, filterOptions, optionsLoading }) {
  const field = FIELD_OPTIONS.find((item) => item.value === rule.field) || FIELD_OPTIONS[0]
  const values = valuesFor(rule)
  // Preserve saved selections even if that value is no longer used by a contact.
  const options = [...new Set([...(field.options || filterOptions[field.value] || []), ...values])]
  return <div className="grid min-w-0 gap-3 rounded-xl border border-[#e4eaed] bg-[#fafcfc] p-3 md:grid-cols-[minmax(0,1fr)_145px_minmax(0,1.2fr)_36px] md:items-start">
    <select aria-label={`Filter ${index + 1} field`} className="min-h-11 min-w-0 w-full rounded-lg border border-[#dce6ed] bg-white px-3 text-sm" value={rule.field} onChange={(event) => onChange({ ...rule, field: event.target.value, value: [] })}>
      {FIELD_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    <select aria-label={`Filter ${index + 1} comparison`} className="min-h-11 min-w-0 w-full rounded-lg border border-[#dce6ed] bg-white px-3 text-sm" value={rule.operator || 'in'} onChange={(event) => onChange({ ...rule, operator: event.target.value })}>
      <option value="in">is any of</option><option value="not_in">is none of</option><option value="contains">contains</option>
    </select>
    <div className="min-w-0 space-y-2">

      <select aria-label={`Filter ${index + 1} ${field.label}`} className="min-h-11 w-full rounded-xl border border-[#dce6ed] bg-white px-3 text-sm" value="" disabled={optionsLoading && !field.options} onChange={(event) => { if (event.target.value) onChange({ ...rule, value: [...values, event.target.value] }) }}>
        <option value="">{optionsLoading && !field.options ? 'Loading choices…' : `Choose ${field.label.toLowerCase()}`}</option>
        {options.filter(option => !values.includes(option)).map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      {values.length ? <div className="flex flex-wrap gap-1">{values.map(value => <button type="button" key={value} className="inline-flex items-center gap-1 rounded-lg bg-[#edf7f3] px-2 py-1 text-xs text-[#244f43]" aria-label={`Remove ${value} from filter ${index + 1}`} onClick={() => onChange({ ...rule, value: values.filter(item => item !== value) })}>{value}<X size={12} /></button>)}</div> : !optionsLoading && !options.length ? <p className="text-xs text-[#688098]">No existing {field.label.toLowerCase()} values yet.</p> : null}
    </div>
    <button type="button" className="inline-flex h-11 w-9 items-center justify-center rounded-lg text-[#60758d] hover:bg-[#fff0f0] hover:text-[#ae3434] disabled:opacity-40" disabled={!canRemove} onClick={onRemove} aria-label={`Remove filter ${index + 1}`}><X size={18} /></button>
  </div>
}

function MatchingClients({ organisationId, audience, onClose }) {
  const [page, setPage] = useState(0)
  const [result, setResult] = useState({ count: 0, contacts: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const pageSize = 25
  const changePage = next => { setLoading(true); setError(''); setResult({ count: 0, contacts: [] }); setPage(next) }
  useEffect(() => {
    let active = true
    previewSavedAudience({ organisationId, rules: audience.rules || normaliseRules(audience.filter_json), limit: pageSize, offset: page * pageSize })
      .then(next => { if (active) setResult(next) })
      .catch(cause => { if (active) setError(cause.message || 'Unable to load matching clients.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [organisationId, audience, page, retry])
  return <Modal open title={`Matching clients · ${audience.name || 'Untitled audience'}`} subtitle="Membership updates as contact details change. Campaign eligibility is checked separately before sending." onClose={onClose} className="w-full max-w-5xl">
    {loading ? <p role="status" className="py-6 text-sm text-[#687e86]">Loading matching clients…</p> : error ? <div role="alert" className="py-6"><p className="text-sm text-[#b42318]">{error}</p><Button variant="secondary" onClick={() => { setLoading(true); setError(''); setRetry(value => value + 1) }}>Try again</Button></div> : <>
      <p className="mb-4 text-sm font-semibold text-[#244f43]">{result.count} matching clients</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f5f7f8] text-[#667b88]"><tr>{['Client', 'Type', 'Area', 'Lead status', 'Tags'].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{result.contacts.map(contact => <tr key={contact.id} className="border-b border-[#e8edef]"><td className="px-3 py-3"><strong className="block text-[#15332d]">{contact.name}</strong><span className="text-[#70828a]">{contact.email}</span></td><td className="px-3 py-3">{contact.contactType || '—'}</td><td className="px-3 py-3">{contact.area || '—'}</td><td className="px-3 py-3">{contact.leadStage || '—'}</td><td className="px-3 py-3">{contact.tags?.join(', ') || '—'}</td></tr>)}</tbody></table></div>
      {!result.contacts.length ? <p className="py-6 text-sm text-[#70828a]">No clients match these filters.</p> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-[#70828a]">{result.count ? `${page * pageSize + 1}–${page * pageSize + result.contacts.length} of ${result.count}` : '0 clients'}</span><div className="flex gap-2"><Button variant="secondary" disabled={page === 0} onClick={() => changePage(page - 1)}>Previous</Button><Button variant="secondary" disabled={(page + 1) * pageSize >= result.count} onClick={() => changePage(page + 1)}>Next</Button></div></div>
    </>}
  </Modal>
}

function AudienceBuilder({ audience, organisationId, userId, onClose, onSaved, filterOptions, optionsLoading, optionsError }) {
  const [draft, setDraft] = useState(() => audience ? { ...audience, rules: copyRules(audience.rules || audience.filter_json) } : { name: '', description: '', rules: emptyRules() })
  const [preview, setPreview] = useState({ count: 0, contacts: [] })
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [matchingAudience, setMatchingAudience] = useState(null)
  const valid = draft.name.trim() && rulesValid(draft.rules)

  useEffect(() => {
    let active = true
    if (!rulesValid(draft.rules)) { setPreview({ count: 0, contacts: [] }); setLoadingPreview(false); return undefined }
    setLoadingPreview(true)
    setPreview({ count: 0, contacts: [] })
    const timer = window.setTimeout(async () => {
      setLoadingPreview(true)
      try {
        const next = await previewSavedAudience({ organisationId, rules: draft.rules })
        if (active) { setPreview(next); setError('') }
      } catch (cause) {
        if (active) setError(cause.message || 'Unable to preview this audience.')
      } finally { if (active) setLoadingPreview(false) }
    }, 500)
    return () => { active = false; window.clearTimeout(timer) }
  }, [draft.rules, organisationId])

  const updateRule = (index, nextRule) => setDraft((current) => ({ ...current, rules: { ...current.rules, rules: current.rules.rules.map((rule, ruleIndex) => ruleIndex === index ? nextRule : rule) } }))
  const save = async () => {
    if (!valid) return
    setSaving(true); setError('')
    try {
      await saveEmailAudience({ organisationId, userId, audience: { id: draft.id, name: draft.name, description: draft.description, filterJson: draft.rules } })
      await onSaved(); onClose()
    } catch (cause) { setError(cause.message || 'Unable to save this audience.') } finally { setSaving(false) }
  }

  return <section className="overflow-hidden rounded-2xl border border-[#dfe7eb] bg-white shadow-sm">
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 p-5 md:p-6">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#425e79]">Audience name
            <input className="h-11 min-w-0 rounded-lg border border-[#dce6ed] px-3 font-normal text-[#15332d] outline-none focus:border-[#6ba78f] focus:ring-2 focus:ring-[#edf7f3]" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Cape Town buyers" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#425e79]"><span>Description <span className="font-normal text-[#74878d]">(optional)</span></span>
            <textarea rows={2} className="min-h-20 resize-y rounded-lg border border-[#dce6ed] px-3 py-2 font-normal text-[#15332d] outline-none focus:border-[#6ba78f] focus:ring-2 focus:ring-[#edf7f3]" value={draft.description || ''} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Who is this audience for?" />
          </label>
        </div>
        <div className="mt-6 border-t border-[#e6edf0] pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-[#15332d]">Filters</h2><span className="text-xs text-[#688098]">Contacts must match all filters</span></div>
          <div className="space-y-3">{draft.rules.rules.map((rule, index) => <div key={index}>{index > 0 ? <p className="mb-3 text-xs font-semibold text-[#688098]">AND</p> : null}<RuleRow rule={rule} index={index} canRemove={draft.rules.rules.length > 1} filterOptions={filterOptions} optionsLoading={optionsLoading} onChange={(next) => updateRule(index, next)} onRemove={() => setDraft((current) => ({ ...current, rules: { ...current.rules, rules: current.rules.rules.filter((_, ruleIndex) => ruleIndex !== index) } }))} /></div>)}</div>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => setDraft((current) => ({ ...current, rules: { ...current.rules, rules: [...current.rules.rules, { ...EMPTY_RULE }] } }))}><Plus size={16} /> Add filter</Button>
        </div>
        {optionsError ? <p role="alert" className="mt-4 text-sm text-[#b42318]">{optionsError}</p> : null}
        {error ? <p role="alert" className="mt-4 text-sm text-[#b42318]">{error}</p> : null}
      </div>
      <aside className="min-w-0 border-t border-[#e6edf0] bg-[#fafcfc] p-5 md:p-6 lg:border-l lg:border-t-0" aria-label="Audience preview">
        <h2 className="text-sm font-semibold text-[#425e79]">Matching contacts</h2>
        <p role="status" className="mt-3 text-3xl font-semibold tracking-tight text-[#15332d]">{loadingPreview ? '…' : error ? '—' : preview.count || 0}</p>
        <p className="mt-2 text-xs leading-5 text-[#688098]">Updates automatically as contact details change.</p>
        <div className="mt-5 space-y-2">{loadingPreview ? <p className="text-sm text-[#74878d]">Updating matches…</p> : error ? <p className="text-sm text-[#74878d]">Preview unavailable.</p> : preview.contacts?.length ? preview.contacts.map((contact) => <div key={contact.id} className="rounded-lg border border-[#e6edf0] bg-white px-3 py-2 text-sm"><strong className="block break-words text-[#15332d]">{contact.name}</strong><span className="text-xs text-[#698078]">{contact.contactType || 'Contact'}{contact.area ? ` · ${contact.area}` : ''}</span></div>) : <p className="text-sm leading-6 text-[#74878d]">{rulesValid(draft.rules) ? 'No contacts match these filters.' : 'Choose filter values to preview contacts.'}</p>}</div>
        <button type="button" className="mt-4 text-sm font-semibold text-[#244f43] underline underline-offset-4 disabled:opacity-40" disabled={!rulesValid(draft.rules) || loadingPreview || Boolean(error) || !preview.count} onClick={() => setMatchingAudience({ name: draft.name, rules: copyRules(draft.rules) })}>View matching clients →</button>
      </aside>
    </div>
    <div className="flex flex-wrap justify-end gap-3 border-t border-[#e6edf0] px-5 py-4 md:px-6"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" disabled={!valid || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save audience'}</Button></div>

    {matchingAudience ? <MatchingClients organisationId={organisationId} audience={matchingAudience} onClose={() => setMatchingAudience(null)} /> : null}
  </section>
}

export default function ClientAudiences({ organisationId, userId }) {
  const [audiences, setAudiences] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [editing, setEditing] = useState(null); const [deleteTarget, setDeleteTarget] = useState(null)
  const [matchingAudience, setMatchingAudience] = useState(null)
  const [filterOptions, setFilterOptions] = useState({})
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  useEffect(() => {
    let active = true
    setFilterOptions({}); setOptionsLoading(true); setOptionsError(''); setEditing(null); setMatchingAudience(null); setDeleteTarget(null)
    getAudienceFilterOptions(organisationId).then(options => { if (active) setFilterOptions(options) }).catch(() => { if (active) setOptionsError('Unable to load existing filter values. Close and reopen Audiences to retry.') }).finally(() => { if (active) setOptionsLoading(false) })
    return () => { active = false }
  }, [organisationId])
  const refreshRequest = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current
    setAudiences([]); setLoading(true)
    try {
      const saved = await getSavedAudiences(organisationId)
      const withCounts = await Promise.all(saved.map(async audience => ({ ...audience, matchCount: (await previewSavedAudience({ organisationId, rules: normaliseRules(audience.filter_json), limit: 1 })).count })))
      if (request === refreshRequest.current) { setAudiences(withCounts); setError('') }
    } catch (cause) {
      if (request === refreshRequest.current) setError(cause.message || 'Unable to load audiences.')
    } finally { if (request === refreshRequest.current) setLoading(false) }
  }, [organisationId])
  useEffect(() => {
    void refresh()
    return () => { refreshRequest.current += 1 }
  }, [refresh])
  const visible = useMemo(() => audiences.filter((audience) => `${audience.name} ${audience.description || ''}`.toLowerCase().includes(query.toLowerCase())), [audiences, query])
  const duplicate = (audience) => setEditing({ ...audience, id: null, name: `${audience.name} (copy)` })
  const remove = async () => { try { await archiveEmailAudience({ organisationId, audienceId: deleteTarget.id }); setDeleteTarget(null); await refresh() } catch (cause) { setError(cause.message || 'Unable to delete this audience.') } }
  return <section className="bg-[#f7f8f8] p-5 md:p-7">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight text-[#031011]">{editing ? editing.id ? 'Edit audience' : 'Create audience' : 'Audiences'}</h1>{!editing ? <Button type="button" onClick={() => setEditing({ name: '', description: '', rules: emptyRules() })}><Plus size={17} /> Create audience</Button> : null}</div>
    {!editing ? <div className="mb-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{STARTING_POINTS.map(point => <button type="button" key={point.name} className="rounded-xl border border-[#dfe7eb] bg-white p-4 text-left hover:border-[#6ba78f]" onClick={() => setEditing({ name: point.name, description: '', rules: { operator: 'AND', rules: [{ field: point.field, operator: 'in', value: [...point.value] }] } })}><strong className="block text-[#15332d]">{point.name}</strong><span className="mt-1 block text-xs text-[#70828a]">{point.detail}</span></button>)}</div></div> : null}

    {editing ? <AudienceBuilder key={editing.id || 'new'} audience={editing} organisationId={organisationId} userId={userId} onClose={() => setEditing(null)} onSaved={refresh} filterOptions={filterOptions} optionsLoading={optionsLoading} optionsError={optionsError} /> : <div className="rounded-[14px] border border-[#dfe7eb] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-[#031011]">Saved audiences</h2><label className="flex min-w-[230px] items-center gap-2 rounded-xl border border-[#dce6ed] px-3"><Search size={16} className="text-[#71828b]" /><input className="h-10 w-full border-0 outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audiences" /></label></div>{error ? <p className="mt-4 text-sm text-[#b42318]">{error}</p> : null}<div className="mt-5 overflow-x-auto rounded-xl border border-[#e3eaed]"><div className="min-w-[650px]"><div className="grid grid-cols-[minmax(0,1fr)_130px_130px_150px] gap-3 bg-[#f5f7f8] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#667b88]"><span>Audience</span><span>Matching contacts</span><span>Last updated</span><span>Actions</span></div>{loading ? <p className="p-5 text-sm text-[#687e86]">Loading audiences…</p> : visible.length ? visible.map((audience) => <div key={audience.id} className="grid grid-cols-[minmax(0,1fr)_130px_130px_150px] items-center gap-3 border-t border-[#e8edef] px-4 py-4 text-sm"><div><strong className="block text-[#15332d]">{audience.name}</strong><span className="mt-1 block truncate text-[#70828a]">{audience.description || 'No description'}</span></div><button type="button" className="text-left font-semibold text-[#244f43] underline underline-offset-4" onClick={() => setMatchingAudience(audience)} aria-label={`View matching clients for ${audience.name}`}>{audience.matchCount ?? '—'}</button><span className="text-[#70828a]">{relative(audience.updated_at)}</span><div className="flex gap-1"><button type="button" className="rounded-lg p-2 hover:bg-[#edf7f3]" onClick={() => setEditing(audience)} aria-label={`Edit ${audience.name}`}><Eye size={16} /></button><button type="button" className="rounded-lg p-2 hover:bg-[#edf7f3]" onClick={() => duplicate(audience)} aria-label={`Duplicate ${audience.name}`}><Copy size={16} /></button><button type="button" className="rounded-lg p-2 text-[#a43838] hover:bg-[#fff0f0]" onClick={() => setDeleteTarget(audience)} aria-label={`Delete ${audience.name}`}><Trash2 size={16} /></button></div></div>) : <div className="p-9 text-center"><UsersRound className="mx-auto text-[#6ba78f]" /><strong className="mt-3 block text-[#15332d]">Create your first audience to target the right contacts at the right time.</strong><Button type="button" className="mt-4" onClick={() => setEditing({ name: '', description: '', rules: emptyRules() })}>Create audience</Button></div>}</div></div></div>}
    {matchingAudience ? <MatchingClients organisationId={organisationId} audience={matchingAudience} onClose={() => setMatchingAudience(null)} /> : null}
    <ConfirmDialog open={Boolean(deleteTarget)} title="Delete this audience?" description="This removes the saved audience, not any of its contacts." confirmLabel="Delete audience" variant="destructive" onConfirm={() => void remove()} onCancel={() => setDeleteTarget(null)} />
  </section>
}
