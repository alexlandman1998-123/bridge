import { X } from 'lucide-react'

function Drawer({ open, onClose, title, subtitle = '', footer = null, className = '', children, widthClassName = '' }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[var(--color-overlay)] backdrop-blur-sm no-print"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <aside
        className={`h-full w-full max-w-[560px] border-l border-borderDefault bg-surface shadow-[-18px_0_40px_rgba(15,23,42,0.16)] ${widthClassName} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Detail panel'}
      >
        <header className="flex items-start justify-between gap-4 border-b border-borderSoft px-6 py-5">
          <div>
            {title ? <h3 className="text-card-title font-semibold text-textStrong">{title}</h3> : null}
            {subtitle ? <p className="mt-2 text-secondary text-textMuted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] border border-borderDefault bg-surface text-textStrong transition duration-150 ease-out hover:bg-mutedBg"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </header>
        <div className="h-[calc(100%-86px)] overflow-y-auto px-6 py-6">{children}</div>
        {footer ? <footer className="border-t border-borderSoft px-6 py-4">{footer}</footer> : null}
      </aside>
    </div>
  )
}

export default Drawer
