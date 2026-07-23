import { Check, ShieldCheck } from 'lucide-react'
import { useEffect, useRef } from 'react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

export function DocumentCommitConfirmation({ model = null, open = false, busy = false, onConfirm = null, onCancel = null }) {
  const contentRef = useRef(null)
  const busyRef = useRef(busy)
  const onCancelRef = useRef(onCancel)
  busyRef.current = busy
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open || model?.contract !== 'arch9-document-commit-confirmation-v1') return undefined
    const previousFocus = document.activeElement
    const focusTimer = window.setTimeout(() => {
      const dialog = contentRef.current?.closest('[role="dialog"]')
      const preferred = dialog?.querySelector('[data-document-confirm-primary]:not(:disabled)')
      const fallback = dialog?.querySelector('button:not(:disabled)')
      ;(preferred || fallback)?.focus()
    }, 0)
    function handleKeyDown(event) {
      const dialog = contentRef.current?.closest('[role="dialog"]')
      if (!dialog) return
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onCancelRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [model?.contract, open])

  if (model?.contract !== 'arch9-document-commit-confirmation-v1') return null
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={model.title}
      className="max-w-[560px]"
      footer={(
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Go back and review</Button>
          <Button type="button" data-document-confirm-primary onClick={onConfirm} disabled={busy || !model.canConfirm}>
            <ShieldCheck size={16} aria-hidden="true" />{busy ? 'Processing…' : model.confirmLabel}
          </Button>
        </div>
      )}
    >
      <div ref={contentRef} data-testid="document-commit-confirmation">
        <p className="text-sm leading-6 text-[#526b83]">{model.summary}</p>
        {model.action === 'send_signature' && model.recipients?.length ? (
          <div className="mt-4 rounded-[14px] border border-[#dbe8f6] bg-[#f8fbff] p-3" data-testid="document-send-recipients">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#617995]">Confirm recipient email{model.recipients.length === 1 ? '' : 's'}</p>
            <ul className="mt-2 space-y-2">
              {model.recipients.map((recipient) => (
                <li key={`${recipient.label}:${recipient.email}`} className="rounded-[10px] border border-[#e1eaf4] bg-white px-3 py-2 text-sm text-[#35546c]">
                  <span className="font-semibold text-[#20344b]">{recipient.label}{recipient.name ? ` · ${recipient.name}` : ''}</span>
                  <span className="mt-0.5 block break-all text-xs text-[#617995]">{recipient.email}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="mt-4 space-y-2">
          {model.points.map((point) => <li key={point} className="flex items-start gap-2 text-sm text-[#35546c]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#237047]" aria-hidden="true" /><span>{point}</span></li>)}
        </ul>
      </div>
    </Modal>
  )
}
