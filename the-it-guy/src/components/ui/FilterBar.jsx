function FilterBar({ className = '', children }) {
  return <div className={`flex flex-wrap items-center gap-3 ${className}`.trim()}>{children}</div>
}

export function FilterBarGroup({ className = '', children, align = 'start' }) {
  const alignClass = align === 'end' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-3 ${alignClass} ${className}`.trim()}>{children}</div>
}

export function PillToggle({ items = [], value, onChange, className = '' }) {
  return (
    <div className={`ui-pill-group ${className}`.trim()} role="tablist">
      {items.map((item) => {
        const active = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            className={`ui-pill-button ${
              active
                ? 'border-primary bg-primary text-textInverse shadow-soft'
                : 'border-borderDefault bg-surface text-textBody'
            }`.trim()}
            onClick={() => onChange?.(item.key)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function ViewToggle({ items = [], value, onChange, className = '' }) {
  return (
    <div className={`ui-view-toggle ${className}`.trim()} role="tablist">
      {items.map((item) => {
        const Icon = item.icon
        const active = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            className={`${active ? 'is-active bg-primary text-textInverse' : 'text-textBody hover:bg-surfaceAlt'}`.trim()}
            onClick={() => onChange?.(item.key)}
          >
            {Icon ? <Icon size={15} /> : null}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export default FilterBar
