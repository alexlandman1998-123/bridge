import { CheckCircle2, FileSignature, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COMMERCIAL_HOT_STATUSES } from '../commercialDocumentConstants'
import { formatCurrency, formatNumber, titleize } from '../commercialFormatters'
import { createHeadsOfTerms, getHeadsOfTermsByDeal, updateHeadsOfTerms, updateHeadsOfTermsStatus } from '../services/commercialApi'

const HOT_FIELDS = [
  { name: 'premises_description', label: 'Premises description', type: 'textarea', span: 'full' },
  { name: 'lease_commencement_date', label: 'Lease commencement date', type: 'date' },
  { name: 'lease_term_months', label: 'Lease term months', type: 'number' },
  { name: 'monthly_rental', label: 'Monthly rental', type: 'number' },
  { name: 'rental_per_m2', label: 'Rental per m²', type: 'number' },
  { name: 'escalation_percentage', label: 'Escalation percentage', type: 'number' },
  { name: 'deposit_amount', label: 'Deposit', type: 'number' },
  { name: 'tenant_installation_allowance', label: 'Tenant installation allowance', type: 'number' },
  { name: 'rent_free_period_months', label: 'Rent-free period months', type: 'number' },
  { name: 'beneficial_occupation_date', label: 'Beneficial occupation date', type: 'date' },
  { name: 'permitted_use', label: 'Permitted use', span: 'full' },
  { name: 'special_conditions', label: 'Special conditions', type: 'textarea', span: 'full' },
  { name: 'broker_commission_notes', label: 'Broker commission notes', type: 'textarea', span: 'full' },
]

function normalizeValue(value) {
  return value === null || value === undefined ? '' : String(value)
}

function serializeHot(values) {
  const payload = {}
  for (const field of HOT_FIELDS) {
    const value = values[field.name]
    if (field.type === 'number') payload[field.name] = String(value || '').trim() ? Number(value) : null
    else payload[field.name] = String(value || '').trim() || null
  }
  return payload
}

function buildInitialValues(hot, deal) {
  const values = {}
  HOT_FIELDS.forEach((field) => {
    values[field.name] = normalizeValue(hot?.[field.name])
  })
  if (!hot) {
    values.monthly_rental = normalizeValue(deal?.deal_value)
  }
  return values
}

function CommercialHeadsOfTermsPanel({ organisationId = '', deal, onActivityChange }) {
  const [hot, setHot] = useState(null)
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadHot = useCallback(async () => {
    if (!deal?.id) return
    setLoading(true)
    setError('')
    try {
      const nextHot = await getHeadsOfTermsByDeal(deal.id, organisationId)
      setHot(nextHot)
      setValues(buildInitialValues(nextHot, deal))
    } catch (loadError) {
      setError(loadError?.message || 'Heads of Terms could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [deal, organisationId])

  useEffect(() => {
    void loadHot()
  }, [loadHot])

  const statusLabel = useMemo(() => COMMERCIAL_HOT_STATUSES.find((status) => status.value === hot?.status)?.label || titleize(hot?.status || 'draft'), [hot])
  const readyForLease = hot?.status === 'ready_for_lease'

  async function handleSave(event) {
    event.preventDefault()
    if (!deal?.id) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...serializeHot(values),
        organisation_id: organisationId,
        deal_id: deal.id,
        tenant_id: deal.tenant_id,
        landlord_id: deal.landlord_id,
        property_id: deal.property_id,
      }
      const saved = hot?.id ? await updateHeadsOfTerms(hot.id, payload) : await createHeadsOfTerms(payload)
      setHot(saved)
      setValues(buildInitialValues(saved, deal))
      onActivityChange?.()
    } catch (saveError) {
      setError(saveError?.message || 'Heads of Terms could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(status) {
    if (!hot?.id || hot.status === status) return
    setSaving(true)
    setError('')
    try {
      const saved = await updateHeadsOfTermsStatus(hot.id, status)
      setHot(saved)
      setValues(buildInitialValues(saved, deal))
      onActivityChange?.()
    } catch (statusError) {
      setError(statusError?.message || 'Heads of Terms status could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  function renderField(field) {
    const commonClass = 'min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'
    if (field.type === 'textarea') {
      return (
        <textarea
          rows={3}
          value={values[field.name] || ''}
          onChange={(event) => setValues((previous) => ({ ...previous, [field.name]: event.target.value }))}
          className={`${commonClass} py-3`}
        />
      )
    }
    return (
      <input
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
        step={field.type === 'number' ? 'any' : undefined}
        value={values[field.name] || ''}
        onChange={(event) => setValues((previous) => ({ ...previous, [field.name]: event.target.value }))}
        className={commonClass}
      />
    )
  }

  return (
    <section className={`rounded-2xl border p-4 ${deal?.stage === 'heads_of_terms' ? 'border-[#8bc7aa] bg-emerald-50/55' : 'border-slate-200 bg-[#fbfcfe]'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <FileSignature size={18} className="text-[#1267a3]" />
            <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Heads of Terms</h3>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{statusLabel}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Structured HOT capture for future PDF generation and lease pack workflows.</p>
          {readyForLease ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={14} />
              Ready for lease draft. Consider moving this deal to Lease Draft.
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <select
            value={hot?.status || 'draft'}
            disabled={!hot?.id || saving}
            onChange={(event) => handleStatusChange(event.target.value)}
            className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]"
          >
            {COMMERCIAL_HOT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <p className="text-right text-xs text-slate-500">{loading ? 'Loading...' : hot ? 'Draft available' : 'No HOT yet'}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Monthly rental</p>
          <p className="mt-1 text-sm font-semibold text-[#102236]">{formatCurrency(hot?.monthly_rental)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Rental / m²</p>
          <p className="mt-1 text-sm font-semibold text-[#102236]">{formatCurrency(hot?.rental_per_m2)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Escalation</p>
          <p className="mt-1 text-sm font-semibold text-[#102236]">{hot?.escalation_percentage ? `${formatNumber(hot.escalation_percentage)}%` : '-'}</p>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      <form onSubmit={handleSave} className="mt-4 grid gap-4 md:grid-cols-2">
        {HOT_FIELDS.map((field) => (
          <label key={field.name} className={field.span === 'full' ? 'grid gap-1.5 md:col-span-2' : 'grid gap-1.5'}>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{field.label}</span>
            {renderField(field)}
          </label>
        ))}
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? 'Saving...' : hot ? 'Save draft' : 'Create Heads of Terms'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default CommercialHeadsOfTermsPanel
