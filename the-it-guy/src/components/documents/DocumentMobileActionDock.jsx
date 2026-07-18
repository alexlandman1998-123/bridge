import { ArrowRight, Loader2 } from 'lucide-react'
import Button from '../ui/Button'

export function DocumentMobileActionDock({ model = null, busy = false, onAction = null }) {
  if (model?.contract !== 'arch9-document-mobile-action-v1' || !model.action) return null
  return (
    <nav data-testid="document-mobile-action" aria-label="Current document action" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d8e3ee] bg-white/95 px-4 pt-3 shadow-[0_-16px_40px_rgba(17,36,58,0.12)] backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="mx-auto flex max-w-[520px] items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.64rem] font-bold uppercase tracking-[0.1em] text-[#7389a2]">{model.contextLabel}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[#526b83]">{model.helper}</p>
        </div>
        <Button type="button" size="md" className="min-h-[48px] shrink-0" disabled={busy} onClick={() => onAction?.(model.action.id)}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
          {model.action.label}
          {!busy ? <ArrowRight size={16} aria-hidden="true" /> : null}
        </Button>
      </div>
    </nav>
  )
}
