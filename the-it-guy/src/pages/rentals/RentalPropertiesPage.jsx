import { Building2, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { createRentalProperty, listRentalProperties } from '../../services/rentals/rentalPropertyRepository.js'

const initialForm = { name: '', propertyType: 'house', addressLine1: '', city: '', province: '', postalCode: '' }
const propertyTypes = ['house', 'apartment', 'townhouse', 'duplex', 'studio', 'estate', 'commercial', 'other']
function text(value) { return String(value ?? '').trim() }
function getScope(context = {}) {
  const membership = context.currentMembership || context.organisationMembership || {}
  return { organisationId: text(context.workspace?.id || membership.organisation_id || membership.organisationId), branchId: text(membership.branch_id || membership.branchId), userId: text(context.profile?.id || context.userId) }
}

export function RentalPropertiesPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => getScope(workspace), [workspace])
  const [properties, setProperties] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [form, setForm] = useState(initialForm); const [creating, setCreating] = useState(false)
  const load = useCallback(async () => {
    if (!scope.organisationId) { setProperties([]); setLoading(false); return }
    try { setLoading(true); setError(''); setProperties(await listRentalProperties(scope)) } catch (cause) { setError(cause?.message || 'Unable to load rental properties.'); setProperties([]) } finally { setLoading(false) }
  }, [scope])
  useEffect(() => { void load() }, [load])
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event) => { event.preventDefault(); try { setCreating(true); setError(''); await createRentalProperty({ ...scope, ...form, assignedManagerId: scope.userId, createdBy: scope.userId }); setForm(initialForm); await load() } catch (cause) { setError(cause?.message || 'Unable to create rental property.') } finally { setCreating(false) } }
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-sky-700">Rentals / Portfolio</p><h1 className="text-2xl font-bold text-slate-900">Properties</h1><p className="mt-1 text-sm text-slate-600">Managed properties are separate from marketing listings.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</button></header>
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-3"><input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Property name" className="rounded-lg border px-3 py-2"/><select value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)} className="rounded-lg border px-3 py-2">{propertyTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><input required value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)} placeholder="Address line 1" className="rounded-lg border px-3 py-2"/><input required value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="City" className="rounded-lg border px-3 py-2"/><input value={form.province} onChange={(e) => update('province', e.target.value)} placeholder="Province" className="rounded-lg border px-3 py-2"/><button className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create property</button></form>
    {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : properties.length ? <section className="grid gap-3 md:grid-cols-2">{properties.map((property) => <Link key={property.id} to={`/agent/rentals/portfolio/properties/${property.id}`} className="rounded-xl border bg-white p-4 shadow-sm transition hover:border-sky-300"><p className="text-xs font-semibold uppercase text-sky-700">{property.propertyType} · {property.status}</p><h2 className="mt-1 font-semibold text-slate-900">{property.name}</h2><p className="mt-1 text-sm text-slate-600">{property.address.line1}, {property.address.city}</p></Link>)}</section> : <section className="rounded-xl border border-dashed p-10 text-center"><Building2 className="mx-auto h-8 w-8 text-slate-400"/><h2 className="mt-3 font-semibold">No managed properties yet</h2><p className="mt-1 text-sm text-slate-600">Create a property before adding units or marketing vacancies.</p></section>}</main>
}
