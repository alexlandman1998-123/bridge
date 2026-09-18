import { Copy, Eye, Plus, Search, Trash2, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import {
  archiveEmailAudience,
  getSavedAudiences,
  previewSavedAudience,
  saveEmailAudience,
} from '../../services/emailCampaignService'

const FIELD_OPTIONS = [
  { value: 'contact_type', label: 'Contact type', kind: 'select', options: ['buyer', 'seller', 'investor', 'tenant', 'landlord', 'lead'] },
  { value: 'lead_stage', label: 'Lead status', kind: 'text', placeholder: 'e.g. qualified' },
  { value: 'preferred_area', label: 'Preferred area', kind: 'text', placeholder: 'e.g. Cape Town' },
  { value: 'tags', label: 'Tags', kind: 'text', placeholder: 'e.g. investor' },
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

function RuleRow({ rule, index, onChange, onRemove, canRemove }) {
  const field = FIELD_OPTIONS.find((item) => item.value === rule.field) || FIELD_OPTIONS[0]
  const values = valuesFor(rule)
  const value = values.join(', ')
  return <div className="grid gap-2 md:grid-cols-[92px_1fr_145px_minmax(180px,1fr)_36px] md:items-center">
    <span className={`inline-flex h-9 items-center justify-center rounded-lg bg-[#f2f5f8] px-2 text-xs font-semibold text-[#5d718b] ${index === 0 ? 'invisible' : ''}`}>AND</span>
    <select className="min-h-11 rounded-xl border border-[#dce6ed] bg-white px-3 text-sm" value={rule.field} onChange={(event) => onChange({ ...rule, field: event.target.value, value: [] })}>
      {FIELD_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    <select className="min-h-11 rounded-xl border border-[#dce6ed] bg-white px-3 text-sm" value={rule.operator || 'in'} onChange={(event) => onChange({ ...rule, operator: event.target.value })}>
      <option value="in">is any of</option><option value="not_in">is none of</option><option value="contains">contains</option>
    </select>
    {field.kind === 'select' ? <select className="min-h-11 rounded-xl border border-[#dce6ed] bg-white px-3 text-sm" value={values[0] || ''} onChange={(event) => onChange({ ...rule, value: event.target.value ? [event.target.value] : [] })}>
      <option value="">Choose a type</option>{field.options.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}
    </select> : <input className="min-h-11 rounded-xl border border-[#dce6ed] bg-white px-3 text-sm" value={value} placeholder={field.placeholder} onChange={(event) => onChange({ ...rule, value: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />}
    <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#60758d] hover:bg-[#fff0f0] hover:text-[#ae3434] disabled:opacity-40" disabled={!canRemove} onClick={onRemove} aria-label="Remove filter"><X size={18} /></button>
  </div>
}

function AudienceBuilder({ audience, organisationId, userId, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => audience ? { ...audience, rules: copyRules(audience.rules || audience.filter_json) } : { name: '', description: '', rules: emptyRules() })
  const [preview, setPreview] = useState({ count: 0, contacts: [] })
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const valid = draft.name.trim() && rulesValid(draft.rules)

  useEffect(() => {
    if (!rulesValid(draft.rules)) { setPreview({ count: 0, contacts: [] }); return undefined }
    const timer = window.setTimeout(async () => {
      const requestId = ++requestRef.current
      setLoadingPreview(true)
      try {
        const next = await previewSavedAudience({ organisationId, rules: draft.rules })
        if (requestId === requestRef.current) setPreview(next)
      } catch (cause) {
        if (requestId === requestRef.current) setError(cause.message || 'Unable to preview this audience.')
      } finally { if (requestId === requestRef.current) setLoadingPreview(false) }
    }, 500)
    return () => window.clearTimeout(timer)
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

  return <section className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(290px,0.8fr)]">
    <div className="rounded-[14px] border border-[#dfe7eb] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><input className="min-w-[260px] flex-1 border-0 bg-transparent text-2xl font-semibold tracking-[-0.03em] text-[#031011] outline-none" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Name this audience" /><button type="button" className="text-sm font-semibold text-[#52708a]" onClick={onClose}>Close</button></div>
      <div className="mt-5 flex items-center justify-between rounded-xl border border-[#d5eee4] bg-[#edf9f4] px-4 py-4 text-[#07543d]"><div className="flex items-center gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#44b982] text-white"><UsersRound size={19} /></span><strong>{loadingPreview ? 'Updating matches…' : `${preview.count || 0} contacts match this audience`}</strong></div><button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={() => document.getElementById('audience-preview')?.scrollIntoView({ behavior: 'smooth' })}>Preview contacts →</button></div>
      <p className="mt-5 text-sm font-semibold text-[#425e79]">Match contacts where</p>
      <div className="mt-3 space-y-3">{draft.rules.rules.map((rule, index) => <RuleRow key={index} rule={rule} index={index} canRemove={draft.rules.rules.length > 1} onChange={(next) => updateRule(index, next)} onRemove={() => setDraft((current) => ({ ...current, rules: { ...current.rules, rules: current.rules.rules.filter((_, ruleIndex) => ruleIndex !== index) } }))} />)}</div>
      <div className="mt-4 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => setDraft((current) => ({ ...current, rules: { ...current.rules, rules: [...current.rules.rules, { ...EMPTY_RULE }] } }))}><Plus size={16} /> Add filter</Button></div>
      <p className="mt-3 text-xs leading-5 text-[#688098]">All filters are matched together. More advanced OR groups and behavioural filters arrive with the next audience-data release.</p>
      {error ? <p className="mt-4 text-sm text-[#b42318]">{error}</p> : null}
      <div className="mt-6 flex justify-end gap-3 border-t border-[#e6edf0] pt-4"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" disabled={!valid || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save audience'}</Button></div>
    </div>
    <aside className="rounded-[14px] border border-[#dfe7eb] bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold text-[#031011]">Audience details</h2><label className="mt-4 grid gap-2 text-sm font-semibold text-[#425e79]">Description<textarea className="min-h-28 rounded-xl border border-[#dce6ed] p-3 font-normal" value={draft.description || ''} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Who is this audience for?" /></label><div id="audience-preview" className="mt-6 border-t border-[#e5ecef] pt-5"><p className="text-sm font-semibold text-[#425e79]">Preview contacts</p><div className="mt-3 space-y-2">{preview.contacts?.length ? preview.contacts.map((contact) => <div key={contact.id} className="rounded-lg bg-[#f6f8f8] px-3 py-2 text-sm"><strong className="block text-[#15332d]">{contact.name}</strong><span className="text-[#698078]">{contact.contactType || 'Contact'}{contact.area ? ` · ${contact.area}` : ''}</span></div>) : <p className="text-sm text-[#74878d]">Add a complete filter to see matching contacts.</p>}</div></div><div className="mt-6 rounded-xl bg-[#eff8f4] p-4 text-sm leading-6 text-[#3d6f5d]">Audience membership updates automatically as contact data changes.</div></aside>
  </section>
}

export default function ClientAudiences({ organisationId, userId }) {
  const [audiences, setAudiences] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [editing, setEditing] = useState(null); const [deleteTarget, setDeleteTarget] = useState(null)
  const refresh = async () => { if (!organisationId) return; setLoading(true); try { const saved = await getSavedAudiences(organisationId); const withCounts = await Promise.all(saved.map(async (audience) => ({ ...audience, matchCount: (await previewSavedAudience({ organisationId, rules: normaliseRules(audience.filter_json), limit: 1 })).count }))); setAudiences(withCounts); setError('') } catch (cause) { setError(cause.message || 'Unable to load audiences.') } finally { setLoading(false) } }
  useEffect(() => { void refresh() }, [organisationId])
  const visible = useMemo(() => audiences.filter((audience) => `${audience.name} ${audience.description || ''}`.toLowerCase().includes(query.toLowerCase())), [audiences, query])
  const duplicate = (audience) => setEditing({ ...audience, id: null, name: `${audience.name} (copy)` })
  const remove = async () => { try { await archiveEmailAudience({ organisationId, audienceId: deleteTarget.id }); setDeleteTarget(null); await refresh() } catch (cause) { setError(cause.message || 'Unable to delete this audience.') } }
  return <section className="bg-[#f7f8f8] p-5 md:p-7">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#031011]">Audiences</h1><p className="mt-2 text-[#60758a]">Create saved groups of contacts for campaigns, follow-ups and outreach.</p></div><Button type="button" onClick={() => setEditing({ name: '', description: '', rules: emptyRules() })}><Plus size={17} /> Create audience</Button></div>
    {editing ? <AudienceBuilder key={editing.id || 'new'} audience={editing} organisationId={organisationId} userId={userId} onClose={() => setEditing(null)} onSaved={refresh} /> : <div className="rounded-[14px] border border-[#dfe7eb] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-[#031011]">Saved audiences</h2><label className="flex min-w-[230px] items-center gap-2 rounded-xl border border-[#dce6ed] px-3"><Search size={16} className="text-[#71828b]" /><input className="h-10 w-full border-0 outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audiences" /></label></div>{error ? <p className="mt-4 text-sm text-[#b42318]">{error}</p> : null}<div className="mt-5 overflow-hidden rounded-xl border border-[#e3eaed]"><div className="grid grid-cols-[minmax(0,1fr)_130px_130px_150px] gap-3 bg-[#f5f7f8] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#667b88]"><span>Audience</span><span>Matching contacts</span><span>Last updated</span><span>Actions</span></div>{loading ? <p className="p-5 text-sm text-[#687e86]">Loading audiences…</p> : visible.length ? visible.map((audience) => <div key={audience.id} className="grid grid-cols-[minmax(0,1fr)_130px_130px_150px] items-center gap-3 border-t border-[#e8edef] px-4 py-4 text-sm"><div><strong className="block text-[#15332d]">{audience.name}</strong><span className="mt-1 block truncate text-[#70828a]">{audience.description || 'No description'}</span></div><span className="font-semibold text-[#244f43]">{audience.matchCount ?? '—'}</span><span className="text-[#70828a]">{relative(audience.updated_at)}</span><div className="flex gap-1"><button type="button" className="rounded-lg p-2 hover:bg-[#edf7f3]" onClick={() => setEditing(audience)} aria-label={`Edit ${audience.name}`}><Eye size={16} /></button><button type="button" className="rounded-lg p-2 hover:bg-[#edf7f3]" onClick={() => duplicate(audience)} aria-label={`Duplicate ${audience.name}`}><Copy size={16} /></button><button type="button" className="rounded-lg p-2 text-[#a43838] hover:bg-[#fff0f0]" onClick={() => setDeleteTarget(audience)} aria-label={`Delete ${audience.name}`}><Trash2 size={16} /></button></div></div>) : <div className="p-9 text-center"><UsersRound className="mx-auto text-[#6ba78f]" /><strong className="mt-3 block text-[#15332d]">Create your first audience to target the right contacts at the right time.</strong><Button type="button" className="mt-4" onClick={() => setEditing({ name: '', description: '', rules: emptyRules() })}>Create audience</Button></div>}</div></div>}
    <ConfirmDialog open={Boolean(deleteTarget)} title="Delete this audience?" description="This removes the saved audience, not any of its contacts." confirmLabel="Delete audience" variant="destructive" onConfirm={() => void remove()} onCancel={() => setDeleteTarget(null)} />
  </section>
}
