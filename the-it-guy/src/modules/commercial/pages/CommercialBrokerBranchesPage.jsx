import { useState } from 'react'
import { Building2, MapPin, Plus } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Field from '../../../components/ui/Field'
import Modal from '../../../components/ui/Modal'
import { createBranch } from '../../../services/agencyBranchService'
import { formatCurrency } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function CommercialBrokerBranchesPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ name: '', city: '', province: '', address: '' })
  const { data, loading, error } = useCommercialData(getCommercialBrokerageData, [refreshKey])
  const rows = data?.branchRows || []

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleCreateBranch(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await createBranch({
        ...form,
        metadata: {
          module: 'commercial',
          module_context: 'commercial',
          source: 'commercial_agency_branches',
        },
      })
      setForm({ name: '', city: '', province: '', address: '' })
      setModalOpen(false)
      setRefreshKey((value) => value + 1)
    } catch (createError) {
      setFormError(createError?.message || 'Branch could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Commercial Agency</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Branches</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Organise commercial brokers, listings, vacancies, deals, and branch-level pipeline in one place.</p>
          </div>
          <Button type="button" onClick={() => setModalOpen(true)} className="w-fit">
            <Plus size={16} /> Add Branch
          </Button>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Branches could not be loaded" description={error} /> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <div className="h-36 animate-pulse rounded-3xl bg-slate-100" /> : rows.map((branch) => (
          <article key={branch.id} className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[#102236]">{branch.name || 'Commercial Branch'}</h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><MapPin size={14} /> {[branch.city, branch.province].filter(Boolean).join(', ') || 'Location pending'}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{branch.is_active === false ? 'Inactive' : 'Active'}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Brokers</p><p className="mt-1 font-semibold text-[#102236]">{branch.brokers}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Active Deals</p><p className="mt-1 font-semibold text-[#102236]">{branch.activeDeals || 0}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Listings</p><p className="mt-1 font-semibold text-[#102236]">{branch.activeListings || 0}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Vacancies</p><p className="mt-1 font-semibold text-[#102236]">{branch.activeVacancies || 0}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Pipeline</p><p className="mt-1 font-semibold text-[#102236]">{formatCurrency(branch.pipelineValue)}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Forecast</p><p className="mt-1 font-semibold text-[#102236]">{formatCurrency(branch.expectedRevenue || branch.projectedCommission || 0)}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3"><p className="text-xs text-slate-400">Last Activity</p><p className="mt-1 font-semibold text-[#102236]">{branch.lastActivityAt ? new Date(branch.lastActivityAt).toLocaleDateString() : 'Pending'}</p></div>
            </div>
          </article>
        ))}
      </section>

      {!loading && !rows.length ? (
        <CommercialEmptyState
          title="No branches yet."
          description="Add your first branch to start organising brokers, listings and deals."
          primaryActionLabel="Add Branch"
          onPrimaryAction={() => setModalOpen(true)}
        />
      ) : null}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Add Commercial Branch"
        subtitle="Branches are scoped to this commercial organisation and can be used to organise brokers and stock."
        footer={(
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="commercial-branch-form" disabled={saving}>{saving ? 'Creating...' : 'Add Branch'}</Button>
          </div>
        )}
      >
        <form id="commercial-branch-form" className="grid gap-4" onSubmit={handleCreateBranch}>
          {formError ? <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{formError}</p> : null}
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Branch name
            <Field value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Sandton Commercial" required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              City / Area
              <Field value={form.city} onChange={(event) => updateField('city', event.target.value)} placeholder="Sandton" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Province
              <Field value={form.province} onChange={(event) => updateField('province', event.target.value)} placeholder="Gauteng" />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Address
            <Field value={form.address} onChange={(event) => updateField('address', event.target.value)} placeholder="Optional branch address" />
          </label>
        </form>
      </Modal>
    </div>
  )
}

export default CommercialBrokerBranchesPage
