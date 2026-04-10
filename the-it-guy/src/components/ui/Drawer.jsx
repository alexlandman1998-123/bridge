import { X } from 'lucide-react'

function Drawer({ open, onClose, title, subtitle = '', footer = null, className = '', children, widthClassName = '' }) {
  if (!open) return null

  return (
    <div
      className="ui-drawer-overlay no-print"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <aside
        className={`ui-drawer max-w-[560px] ${widthClassName} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Detail panel'}
      >
        <header className="ui-drawer-head">
          <div>
            {title ? <h3 className="text-card-title font-semibold text-textStrong">{title}</h3> : null}
            {subtitle ? <p className="mt-2 text-secondary text-textMuted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="ui-icon-button h-10 w-10"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </header>
        <div className="ui-drawer-body">{children}</div>
        {footer ? <footer className="ui-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  )
}

export default Drawer
