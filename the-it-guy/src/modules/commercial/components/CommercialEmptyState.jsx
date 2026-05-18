import { Inbox } from 'lucide-react'

function CommercialEmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/75 p-5 text-center">
      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
        <Inbox size={19} />
      </span>
      <p className="mt-3 text-sm font-semibold text-[#102236]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">{description}</p>
    </div>
  )
}

export default CommercialEmptyState
