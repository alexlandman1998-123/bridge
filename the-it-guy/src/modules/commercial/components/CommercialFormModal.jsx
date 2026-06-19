import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

function normalizeInitialValue(field, record) {
  if (typeof field.getInitialValue === 'function') {
    return field.getInitialValue(record)
  }
  if (record && record[field.name] !== undefined && record[field.name] !== null) {
    if (field.type === 'multiText' && Array.isArray(record[field.name])) return record[field.name].join(', ')
    return String(record[field.name])
  }
  if (typeof field.defaultValue === 'function') return field.defaultValue(record)
  if (field.type === 'checkbox') return Boolean(field.defaultValue)
  return field.defaultValue ?? ''
}

function isFieldVisible(field, values, record) {
  if (typeof field.visibleWhen === 'function') return Boolean(field.visibleWhen(values, record))
  if (field.visibleWhen && typeof field.visibleWhen === 'object') {
    const targetField = field.visibleWhen.field || field.visibleWhen.name
    const expected = field.visibleWhen.equals
    return String(values?.[targetField] ?? '') === String(expected ?? '')
  }
  return true
}

function isValidEmail(value) {
  if (!value) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidDate(value) {
  if (!value) return true
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

function friendlyError(error) {
  const message = String(error?.message || error || '').trim()
  if (!message) return 'Something went wrong while saving this record.'
  if (/row-level security|permission denied|not authorized/i.test(message)) {
    return 'You do not have permission to save this commercial record.'
  }
  if (/auth session/i.test(message)) {
    return 'Your session is not ready. Please sign in again before saving.'
  }
  if (/organisation context/i.test(message)) {
    return 'A valid organisation is required before commercial records can be saved.'
  }
  if (/supabase is not configured/i.test(message)) {
    return 'Commercial data storage is not configured in this environment.'
  }
  return 'The record could not be saved. Please check the form and try again.'
}

function validateForm(fields, values, crossValidate) {
  const errors = {}

  for (const field of fields) {
    const value = values[field.name]
    const textValue = String(value ?? '').trim()
    if (field.required && !textValue) {
      errors[field.name] = `${field.label} is required.`
      continue
    }
    if (field.type === 'email' && !isValidEmail(textValue)) errors[field.name] = 'Enter a valid email address.'
    if ((field.type === 'number' || field.type === 'percentage') && textValue && !Number.isFinite(Number(textValue))) {
      errors[field.name] = `${field.label} must be a number.`
    }
    if (field.type === 'percentage' && textValue) {
      const parsed = Number(textValue)
      if (Number.isFinite(parsed) && (parsed < 0 || parsed > 100)) errors[field.name] = 'Percentage must be between 0 and 100.'
    }
    if (field.type === 'date' && !isValidDate(textValue)) errors[field.name] = 'Enter a valid date.'
    if (field.type === 'time' && textValue && !/^\d{2}:\d{2}(:\d{2})?$/.test(textValue)) errors[field.name] = 'Enter a valid time.'
  }

  return { ...errors, ...(crossValidate?.(values) || {}) }
}

function serializeValues(fields, values) {
  const payload = {}

  for (const field of fields) {
    if (field.persist === false) continue
    const value = values[field.name]
    if (field.readOnly) continue
    if (field.type === 'number' || field.type === 'percentage') {
      payload[field.name] = String(value ?? '').trim() ? Number(value) : null
    } else if (field.type === 'checkbox') {
      payload[field.name] = Boolean(value)
    } else if (field.type === 'multiText') {
      payload[field.name] = String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    } else {
      payload[field.name] = String(value ?? '').trim() || null
    }
  }

  return payload
}

function CommercialFormModal({ open, mode = 'create', title, fields = [], record, lookups = {}, crossValidate, onClose, onSubmit }) {
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const initialValues = useMemo(() => {
    const next = {}
    fields.forEach((field) => {
      next[field.name] = normalizeInitialValue(field, record)
    })
    return next
  }, [fields, record])
  const visibleFields = useMemo(() => fields.filter((field) => isFieldVisible(field, values, record)), [fields, record, values])

  useEffect(() => {
    if (!open) return
    setValues(initialValues)
    setErrors({})
    setSaveError('')
  }, [initialValues, open])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validateForm(visibleFields, values, crossValidate)
    setErrors(nextErrors)
    setSaveError('')
    if (Object.keys(nextErrors).length) return

    try {
      setSaving(true)
      await onSubmit?.(serializeValues(visibleFields, values))
      onClose?.()
    } catch (error) {
      setSaveError(friendlyError(error))
    } finally {
      setSaving(false)
    }
  }

  function renderField(field) {
    const value = values[field.name] ?? ''
    const options = typeof field.options === 'function'
      ? field.options(values, record)
      : field.options || lookups[field.optionsFrom] || []
    const commonClass = 'min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'

    if (field.type === 'textarea') {
      return (
        <textarea
          rows={4}
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value
            setValues((previous) => {
              const next = { ...previous, [field.name]: nextValue }
              field.onChange?.(nextValue, previous, next)
              return next
            })
          }}
          className={`${commonClass} py-3`}
        />
      )
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value
            setValues((previous) => {
              const next = { ...previous, [field.name]: nextValue }
              field.onChange?.(nextValue, previous, next)
              return next
            })
          }}
          className={commonClass}
        >
          <option value="">{field.placeholder || 'Select...'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    if (field.type === 'checkbox') {
      return (
        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => {
              const nextValue = event.target.checked
              setValues((previous) => {
                const next = { ...previous, [field.name]: nextValue }
                field.onChange?.(nextValue, previous, next)
                return next
              })
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Yes
        </label>
      )
    }

    return (
      <input
        type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : field.type === 'number' || field.type === 'percentage' ? 'number' : field.type === 'email' ? 'email' : 'text'}
        value={value}
        step={field.step || (field.type === 'number' || field.type === 'percentage' ? 'any' : undefined)}
        onChange={(event) => {
          const nextValue = event.target.value
          setValues((previous) => {
            const next = { ...previous, [field.name]: nextValue }
            field.onChange?.(nextValue, previous, next)
            return next
          })
        }}
        className={commonClass}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-3 py-4 backdrop-blur-sm sm:px-4">
      <form onSubmit={handleSubmit} className="my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{mode === 'edit' ? 'Edit record' : 'Create record'}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {saveError ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{saveError}</div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {visibleFields.map((field) => (
              <label key={field.name} className={field.span === 'full' ? 'grid gap-1.5 md:col-span-2' : 'grid gap-1.5'}>
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  {field.label}
                  {field.required ? <span className="text-rose-500"> *</span> : null}
                </span>
                {renderField(field)}
                {field.help ? <span className="text-xs text-slate-400">{field.help}</span> : null}
                {errors[field.name] ? <span className="text-xs font-semibold text-rose-600">{errors[field.name]}</span> : null}
              </label>
            ))}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-2xl bg-[#102b46] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default CommercialFormModal
