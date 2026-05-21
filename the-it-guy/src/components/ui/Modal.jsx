import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

function Modal({ open, onClose, title, subtitle = '', footer = null, className = '', children }) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="ui-modal-overlay no-print"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div
        className={`ui-modal max-w-3xl ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        <header className="ui-modal-head flex items-start justify-between gap-4 border-b border-borderSoft">
          <div>
            {title ? <h3 className="text-card-title font-semibold text-textStrong">{title}</h3> : null}
            {subtitle ? <p className="mt-2 text-secondary text-textMuted">{subtitle}</p> : null}
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
