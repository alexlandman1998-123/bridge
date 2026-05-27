import { Inbox } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function BondEmptyState({
  title = 'Nothing to show yet',
  description = '',
  className = '',
  icon = Inbox,
  compact = false,
}) {
  const Icon = icon

  return (
    <div
      className={cn(
        'rounded-[20px] border border-dashed border-[#d8e2ec] bg-[#fbfdff] text-[#60758d]',
        compact ? 'px-4 py-4' : 'px-5 py-6',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-[14px] border border-[#dbe5f0] bg-white p-2 text-[#6f8399]">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#142132]">{title}</p>
          {description ? <p className="mt-1.5 text-sm leading-6 text-[#60758d]">{description}</p> : null}
        </div>
      </div>
    </div>
  )
}
