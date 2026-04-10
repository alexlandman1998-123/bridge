import { X } from 'lucide-react'

function Modal({ open, onClose, title, subtitle = '', footer = null, className = '', children }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4 backdrop-blur-sm no-print"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div
        className={`w-full max-w-3xl rounded-[24px] border border-borderDefault bg-surface shadow-[0_24px_64px_rgba(15,23,42,0.18)] ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        <header className="flex items-start justify-between gap-4 border-b border-borderSoft px-6 py-5">
          <div>
            {title ? <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-textStrong">{title}</h3> : null}
            {subtitle ? <p className="mt-2 text-[0.95rem] leading-7 text-textMuted">{subtitle}</p> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] border border-borderDefault bg-surface text-textStrong transition duration-150 ease-out hover:bg-mutedBg"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          ) : null}
        </header>
        <div className="max-h-[72vh] overflow-y-auto px-6 py-6">{children}</div>
        {footer ? <footer className="border-t border-borderSoft px-6 py-4">{footer}</footer> : null}
      </div>
    </div>
  )
}

export default Modal
