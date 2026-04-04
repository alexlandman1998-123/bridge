import Button from './ui/Button'

function PageActionBar({ actions = [], className = '' }) {
  if (!actions.length) {
    return null
  }

  return (
    <section className={`no-print flex flex-wrap items-center gap-3 ${className}`.trim()}>
      {actions.map((action) =>
        action.href ? (
          <a
            key={action.id}
            href={action.href}
            target={action.external ? '_blank' : undefined}
            rel={action.external ? 'noreferrer' : undefined}
            className={`${
              action.variant === 'primary'
                ? 'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[14px] border border-transparent bg-[#35546c] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:bg-[#2e475c]'
                : action.variant === 'secondary'
                  ? 'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[14px] border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]'
                  : 'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[12px] border border-transparent bg-transparent px-3 py-2 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:bg-[#eff4f8]'
            }`.trim()}
          >
            {action.icon}
            <span>{action.label}</span>
          </a>
        ) : (
          <Button
            key={action.id}
            variant={action.variant === 'primary' ? 'primary' : action.variant === 'secondary' ? 'secondary' : 'ghost'}
            className="page-action-button"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.icon}
            <span>{action.label}</span>
          </Button>
        ),
      )}
    </section>
  )
}

export default PageActionBar
