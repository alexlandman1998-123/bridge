import { titleize } from '../commercialFormatters'

function CommercialStatusPill({ value = 'active' }) {
  const status = String(value || 'active').trim().toLowerCase()
  const tones = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    draft: 'border-slate-200 bg-slate-50 text-slate-600',
    archived: 'border-slate-200 bg-slate-100 text-slate-500',
    inactive: 'border-slate-200 bg-slate-100 text-slate-500',
    closed_won: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    signed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    closed_lost: 'border-rose-200 bg-rose-50 text-rose-700',
    terminated: 'border-rose-200 bg-rose-50 text-rose-700',
    expired: 'border-amber-200 bg-amber-50 text-amber-700',
    expiring_soon: 'border-amber-200 bg-amber-50 text-amber-700',
  }

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[status] || 'border-blue-200 bg-blue-50 text-blue-700'}`}>
      {titleize(status)}
    </span>
  )
}

export default CommercialStatusPill
