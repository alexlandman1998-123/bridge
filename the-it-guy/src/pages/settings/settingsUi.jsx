export const settingsPageClass = 'space-y-5'
export const settingsCardClass =
  'rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'
export const settingsGridClass = 'grid gap-4 md:grid-cols-2'
export const settingsFieldClass = 'grid gap-2'
export const settingsFieldSpanClass = 'md:col-span-2'
export const settingsActionRowClass = 'flex flex-wrap items-center justify-end gap-3'
export const settingsTableClass = 'overflow-hidden rounded-[20px] border border-[#e4ebf3] bg-[#fbfdff]'

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
    <header className={`${settingsCardClass} flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between`}>
      <div className="space-y-3">
        {kicker ? <span className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-[#7b8da6]">{kicker}</span> : null}
        <div className="space-y-2">
          <h2 className="text-[2rem] font-semibold leading-tight text-[#162334]">{title}</h2>
          {description ? <p className="max-w-3xl text-sm leading-6 text-[#6b7d93]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </header>
  )
}

export function SettingsSectionCard({ title, description, actions, className = '', children }) {
  return (
    <section className={`${settingsCardClass} ${className}`.trim()}>
      {(title || description || actions) ? (
        <div className="mb-5 flex flex-col gap-3 border-b border-[#edf2f7] pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            {title ? <h3 className="text-lg font-semibold text-[#162334]">{title}</h3> : null}
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
  return <div className={`rounded-[18px] border px-4 py-3 text-sm leading-6 ${getAlertToneClasses(tone)}`}>{children}</div>
}

export function SettingsLoadingState({ label }) {
  return (
    <div className={`${settingsCardClass} flex min-h-[180px] items-center justify-center text-sm font-medium text-[#6b7d93]`}>
      {label}
    </div>
  )
}

export function SettingsEmptyState({ title, description, action }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#d7e2ee] bg-[#f8fbff] px-6 py-8 text-center">
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
    <label className="flex items-start justify-between gap-4 rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-4 transition duration-150 ease-out hover:border-[#d6e1ec]">
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
