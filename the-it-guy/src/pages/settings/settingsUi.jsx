export const settingsPageClass =
  'space-y-8 rounded-[28px] border border-[#dbe4ee] bg-white px-6 py-7 shadow-[0_14px_34px_rgba(15,23,42,0.06)] lg:px-8'
export const settingsCardClass = 'rounded-[20px] border border-[#e4ebf2] bg-[#fbfdff] p-5'
export const settingsGridClass = 'grid gap-5 md:grid-cols-2'
export const settingsFieldClass = 'grid gap-2.5'
export const settingsFieldSpanClass = 'md:col-span-2'
export const settingsActionRowClass = 'flex flex-wrap items-center justify-end gap-3 border-t border-[#e8eef5] pt-5'
export const settingsTableClass = 'overflow-hidden rounded-[18px] border border-[#e3eaf2] bg-white'

function getAlertToneClasses(tone) {
  if (tone === 'success') {
    return 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
  }

  if (tone === 'warning') {
    return 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
  }

  return 'border-[#f6d4d4] bg-[#fff5f5] text-[#b42318]'
}

export function SettingsPageHeader({ kicker, title, description, actions }) {
  return (
    <header className="flex flex-col gap-4 border-b border-[#e8eef5] pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-3">
        {kicker ? <span className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[#7b8da6]">{kicker}</span> : null}
        <div className="space-y-2">
          <h2 className="text-[1.9rem] font-semibold leading-tight text-[#162334]">{title}</h2>
          {description ? <p className="max-w-3xl text-sm leading-6 text-[#6b7d93]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </header>
  )
}

export function SettingsSectionCard({ title, description, actions, className = '', children }) {
  return (
    <section className={`space-y-5 border-t border-[#e8eef5] pt-6 ${className}`.trim()}>
      {(title || description || actions) ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            {title ? <h3 className="text-base font-semibold uppercase tracking-[0.1em] text-[#2e4259]">{title}</h3> : null}
            {description ? <p className="text-sm leading-6 text-[#6b7d93]">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function SettingsBanner({ tone = 'warning', children }) {
  return <div className={`rounded-[14px] border px-4 py-3 text-sm leading-6 ${getAlertToneClasses(tone)}`}>{children}</div>
}

export function SettingsLoadingState({ label, compact = false }) {
  if (compact) {
    return (
      <div className="rounded-[14px] border border-dashed border-[#d9e4ef] bg-[#f9fbfe] px-5 py-12 text-center text-sm font-medium text-[#6b7d93]">
        {label}
      </div>
    )
  }

  return <div className={`${settingsPageClass} flex min-h-[220px] items-center justify-center text-sm font-medium text-[#6b7d93]`}>{label}</div>
}

export function SettingsEmptyState({ title, description, action }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-6 py-8 text-center">
      <div className="mx-auto max-w-xl space-y-2">
        <h3 className="text-lg font-semibold text-[#162334]">{title}</h3>
        <p className="text-sm leading-6 text-[#6b7d93]">{description}</p>
      </div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function SettingsToggleRow({ title, description, checked, disabled, onChange }) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-[#e8eef5] py-4 last:border-b-0">
      <div className="space-y-1">
        <strong className="block text-sm font-semibold text-[#162334]">{title}</strong>
        <span className="block max-w-2xl text-sm leading-6 text-[#6b7d93]">{description}</span>
      </div>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-[#c8d4e2] text-[#35546c] focus:ring-[#35546c]"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}
