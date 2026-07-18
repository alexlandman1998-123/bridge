import { ArrowRight } from 'lucide-react'
import Button from '../ui/Button'

export default function DocumentRoleActionBar({ model = null, busy = false, compact = false, onAction = null }) {
  if (model?.contract !== 'arch9-document-role-actions-v1' || !model.actions?.length) return null
  return (
    <section data-testid="document-role-actions" aria-label="Recommended document actions" className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-3'}`}>
      {model.actions.map((item) => (
        <div key={item.id} className="flex min-h-[116px] flex-col rounded-[16px] border border-[#dce5ef] bg-white p-3">
          <p className="text-sm font-semibold text-[#142132]">{item.label}</p>
          <p className="mt-1 flex-1 text-xs leading-5 text-[#607387]">{item.description}</p>
          <Button type="button" size="sm" variant={item.priority === 'primary' ? 'primary' : 'secondary'} className="mt-2 w-full" disabled={busy || item.disabled} onClick={() => onAction?.(item.id)}>
            {item.disabled ? 'Not available yet' : item.label} <ArrowRight size={14} />
          </Button>
        </div>
      ))}
    </section>
  )
}
