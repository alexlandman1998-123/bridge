import { X } from 'lucide-react'

function Drawer({ open, onClose, title, subtitle = '', footer = null, className = '', children, widthClassName = '' }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[rgba(15,23,42,0.36)] backdrop-blur-sm no-print"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <aside
        className={`h-full w-full max-w-[560px] border-l border-[#dde4ee] bg-white shadow-[-18px_0_40px_rgba(15,23,42,0.16)] ${widthClassName} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Detail panel'}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f7] px-6 py-5">
          <div>
            {title ? <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h3> : null}
            {subtitle ? <p className="mt-2 text-[0.95rem] leading-7 text-[#6b7d93]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] border border-[#dde4ee] bg-white text-[#162334] transition duration-150 ease-out hover:bg-[#f8fafc]"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </header>
        <div className="h-[calc(100%-86px)] overflow-y-auto px-6 py-6">{children}</div>
        {footer ? <footer className="border-t border-[#edf2f7] px-6 py-4">{footer}</footer> : null}
      </aside>
    </div>
  )
}

export default Drawer
