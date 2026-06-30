export const settingsPageClass =
  'space-y-6'
export const settingsCardClass = 'rounded-[16px] border border-[#e4ebf2] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]'
export const settingsGridClass = 'grid gap-4 md:grid-cols-2'
export const settingsFieldClass = 'grid gap-2 [&_.ui-input]:px-3.5 [&_.ui-input]:py-2.5 [&_.ui-select]:px-3.5 [&_.ui-select]:py-2.5 [&_.ui-textarea]:px-3.5 [&_.ui-textarea]:py-2.5'
export const settingsFieldSpanClass = 'md:col-span-2'
export const settingsActionRowClass = 'flex flex-wrap items-center justify-end gap-3 border-t border-[#e8eef5] pt-4'
export const settingsTableClass = 'overflow-hidden rounded-[16px] border border-[#e3eaf2] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]'

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
    <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        {kicker ? <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">{kicker}</span> : null}
        <div className="space-y-1.5">
          <h2 className="text-[1.75rem] font-bold leading-tight text-[#121c2d]">{title}</h2>
          {description ? <p className="max-w-3xl text-sm font-normal leading-6 text-[#607387]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </header>
  )
}

export function SettingsSectionCard({ title, description, actions, className = '', children }) {
  return (
    <section className={`space-y-5 rounded-[16px] border border-[#e4ebf2] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)] ${className}`.trim()}>
      {(title || description || actions) ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            {title ? <h3 className="text-base font-semibold text-[#162334]">{title}</h3> : null}
            {description ? <p className="text-sm font-normal leading-6 text-[#6b7d93]">{description}</p> : null}
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

  return <div className="flex min-h-[220px] items-center justify-center rounded-[16px] border border-[#e3eaf2] bg-white text-sm font-medium text-[#6b7d93]">{label}</div>
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

export function SettingsStickySaveBar({ dirty = false, saving = false, onDiscard, onSave }) {
  if (!dirty) return null

  return (
    <div className="sticky bottom-4 z-30 rounded-[16px] border border-[#dce7f1] bg-white/95 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.14)] backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#162334]">Unsaved changes</p>
          <p className="text-sm font-normal text-[#607387]">Make sure to save your changes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
            onClick={onDiscard}
            disabled={saving}
          >
            Discard changes
          </button>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(15,127,79,0.2)] transition hover:bg-[#0d6f45] disabled:opacity-60"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
