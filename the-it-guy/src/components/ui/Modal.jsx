import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function Modal({ open, onClose, title, subtitle = '', footer = null, className = '', children }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const subtitleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTimer = window.setTimeout(() => {
      const preferredTarget = dialogRef.current?.querySelector('[autofocus]')
        || dialogRef.current?.querySelector(FOCUSABLE_SELECTOR)
        || dialogRef.current
      preferredTarget?.focus()
    }, 0)

    function handleKeyDown(event) {
      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
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
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="ui-modal-overlay no-print"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`ui-modal max-w-3xl ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : 'Dialog'}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <header className="ui-modal-head flex items-start justify-between gap-4 border-b border-borderSoft">
          <div>
            {title ? <h3 id={titleId} className="text-card-title font-semibold text-textStrong">{title}</h3> : null}
            {subtitle ? <p id={subtitleId} className="mt-2 text-secondary text-textMuted">{subtitle}</p> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              className="ui-icon-button h-10 w-10"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          ) : null}
        </header>
        <div className="ui-modal-body">{children}</div>
        {footer ? <footer className="ui-modal-footer border-t border-borderSoft">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
