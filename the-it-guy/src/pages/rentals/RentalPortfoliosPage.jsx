import { BriefcaseBusiness, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { createRentalPortfolio, listRentalPortfolios } from '../../services/rentals/rentalPortfolioRepository.js'

const initialForm = { name: '', description: '' }
const text = (value) => String(value ?? '').trim()
function getScope(context = {}) {
  const membership = context.currentMembership || context.organisationMembership || {}
  return { organisationId: text(context.workspace?.id || membership.organisation_id || membership.organisationId), branchId: text(membership.branch_id || membership.branchId), userId: text(context.profile?.id || context.userId) }
}

export default function RentalPortfoliosPage() {
  const workspace = useWorkspace(); const scope = useMemo(() => getScope(workspace), [workspace])
  const [portfolios, setPortfolios] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [form, setForm] = useState(initialForm); const [creating, setCreating] = useState(false)
  const load = useCallback(async () => { if (!scope.organisationId) { setPortfolios([]); setLoading(false); return } try { setLoading(true); setError(''); setPortfolios(await listRentalPortfolios(scope)) } catch (cause) { setError(cause?.message || 'Unable to load rental portfolios.'); setPortfolios([]) } finally { setLoading(false) } }, [scope])
  useEffect(() => { void load() }, [load])
  const submit = async (event) => { event.preventDefault(); try { setCreating(true); setError(''); await createRentalPortfolio({ ...scope, ...form, assignedManagerId: scope.userId, createdBy: scope.userId }); setForm(initialForm); await load() } catch (cause) { setError(cause?.message || 'Unable to create rental portfolio.') } finally { setCreating(false) } }
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-sky-700">Rentals / Portfolio</p><h1 className="text-2xl font-bold text-slate-900">Portfolios</h1><p className="mt-1 text-sm text-slate-600">Properties and units load as one portfolio summary, separate from Sales.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" disabled={loading}><RefreshCw className="h-4 w-4"/>Refresh</button></header>
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-3"><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Portfolio name" className="rounded-lg border px-3 py-2"/><input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description (optional)" className="rounded-lg border px-3 py-2"/><button disabled={creating} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{creating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}Create portfolio</button></form>
    {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin"/></div> : portfolios.length ? <section className="grid gap-3 md:grid-cols-2">{portfolios.map((portfolio) => <Link key={portfolio.id} to={`/agent/rentals/portfolio/${portfolio.id}`} className="rounded-xl border bg-white p-4 shadow-sm transition hover:border-sky-300"><p className="text-xs font-semibold uppercase text-sky-700">{portfolio.status}</p><h2 className="mt-1 font-semibold text-slate-900">{portfolio.name}</h2>{portfolio.description && <p className="mt-1 text-sm text-slate-600">{portfolio.description}</p>}<p className="mt-3 text-sm font-medium text-slate-700">{portfolio.propertyCount} properties · {portfolio.unitCount} units</p></Link>)}</section> : <section className="rounded-xl border border-dashed p-10 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-slate-400"/><h2 className="mt-3 font-semibold">No portfolios yet</h2><p className="mt-1 text-sm text-slate-600">Create a portfolio, then assign managed rental properties.</p></section>}</main>
}
