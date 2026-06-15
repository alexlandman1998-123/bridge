import { Inbox } from 'lucide-react'

function CommercialEmptyState({ title, description, primaryActionLabel = '', onPrimaryAction }) {
  return (
    <div className="rounded-[28px] border border-[#e6edf4] bg-white p-6 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-8">
      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5f9fd] text-[#2d6ecf] shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
        <Inbox size={19} />
      </span>
      <p className="mt-4 text-base font-semibold tracking-[-0.03em] text-[#102236]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#60758d]">{description}</p>
      {primaryActionLabel && onPrimaryAction ? (
        <button
          type="button"
          onClick={onPrimaryAction}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#123b61] px-4 text-sm font-semibold text-white transition hover:bg-[#102f4d]"
        >
          {primaryActionLabel}
        </button>
      ) : null}
    </div>
  )
}

export default CommercialEmptyState
