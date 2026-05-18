import { titleize } from '../commercialFormatters'

const STATUS_STYLES = {
  requested: 'border-amber-100 bg-amber-50 text-amber-700',
  uploaded: 'border-blue-100 bg-blue-50 text-blue-700',
  under_review: 'border-violet-100 bg-violet-50 text-violet-700',
  approved: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  rejected: 'border-rose-100 bg-rose-50 text-rose-700',
  completed: 'border-slate-200 bg-slate-50 text-slate-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-500',
}

function CommercialDocumentStatusPill({ value }) {
  const normalized = String(value || 'requested').trim().toLowerCase()
  return (
    <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[normalized] || STATUS_STYLES.requested}`}>
      {titleize(normalized)}
    </span>
  )
}

export default CommercialDocumentStatusPill
