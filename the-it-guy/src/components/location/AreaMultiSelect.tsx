import { Loader2, MapPin, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { searchArch9Areas, type Arch9Area } from '../../lib/location/areas'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { cn } from '../../lib/utils'

export type AreaMultiSelectProps = {
  value?: string[] | string | null
  onChange: (value: string[]) => void
  label?: string
  placeholder?: string
  description?: string
  disabled?: boolean
  error?: string
  allowFreeText?: boolean
  className?: string
}

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function parseAreas(value: AreaMultiSelectProps['value']) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  return text.split(/[,;\n]/).map(normalizeText).filter(Boolean)
}

function uniqueAreas(items: string[]) {
  const seen = new Set<string>()
  const rows: string[] = []
  for (const item of items) {
    const area = normalizeText(item)
    const key = area.toLowerCase()
    if (!area || seen.has(key)) continue
    seen.add(key)
    rows.push(area)
  }
  return rows
}

export default function AreaMultiSelect({
  value = [],
  onChange,
  label = 'Areas',
  placeholder = 'Search or add area...',
  description,
  disabled = false,
  error = '',
  allowFreeText = true,
  className = '',
}: AreaMultiSelectProps) {
  const selectedAreas = useMemo(() => uniqueAreas(parseAreas(value)), [value])
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Arch9Area[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loadError, setLoadError] = useState('')
  const requestIdRef = useRef(0)

  useEffect(() => {
    const query = normalizeText(inputValue)
    if (disabled || query.length < 2 || !isSupabaseConfigured) {
      setSuggestions([])
      setIsFetching(false)
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsFetching(true)
    setLoadError('')

    const timer = window.setTimeout(() => {
      searchArch9Areas(query)
        .then((results) => {
          if (requestIdRef.current !== requestId) return
          const selectedKeys = new Set(selectedAreas.map((area) => area.toLowerCase()))
          setSuggestions(results.filter((area) => !selectedKeys.has(normalizeText(area.name).toLowerCase())))
          setIsOpen(true)
          setActiveIndex(-1)
        })
        .catch((problem) => {
          if (requestIdRef.current !== requestId) return
          setSuggestions([])
          setLoadError(problem?.message || 'Area suggestions are temporarily unavailable.')
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setIsFetching(false)
        })
    }, 300)

    return () => window.clearTimeout(timer)
  }, [disabled, inputValue, selectedAreas])

  const helperText = useMemo(() => {
    if (error) return error
    if (loadError) return loadError
    if (!isSupabaseConfigured) return allowFreeText ? 'Area directory unavailable. Manual entries are still allowed.' : 'Area directory is unavailable.'
    return description
  }, [allowFreeText, description, error, loadError])

  function commitAreas(items: string[]) {
    onChange(uniqueAreas(items))
  }

  function addArea(areaName: string) {
    const nextArea = normalizeText(areaName)
    if (!nextArea) return
    commitAreas([...selectedAreas, nextArea])
    setInputValue('')
    setSuggestions([])
    setIsOpen(false)
    setActiveIndex(-1)
  }

  function selectArea(area: Arch9Area) {
    addArea(area.name)
  }

  function removeArea(areaName: string) {
    const target = normalizeText(areaName).toLowerCase()
    commitAreas(selectedAreas.filter((area) => area.toLowerCase() !== target))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && isOpen) {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1))
      return
    }
    if (event.key === 'ArrowUp' && isOpen) {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Escape') {
      setIsOpen(false)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        selectArea(suggestions[activeIndex])
        return
      }
      if (allowFreeText) addArea(inputValue)
    }
  }

  return (
    <label className={cn('relative grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400', className)}>
      {label}
      <div className="min-h-11 rounded-xl border border-slate-200 bg-white px-2 py-2 normal-case tracking-normal shadow-[0_10px_24px_rgba(15,23,42,0.04)] focus-within:border-blue-300">
        <div className="flex flex-wrap items-center gap-2">
          {selectedAreas.map((area) => (
            <span key={area.toLowerCase()} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
              {area}
              <button
                type="button"
                onClick={() => removeArea(area)}
                disabled={disabled}
                className="grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed"
                aria-label={`Remove ${area}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <div className="flex min-w-[180px] flex-1 items-center gap-2">
            <input
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value)
                setLoadError('')
              }}
              onFocus={() => {
                if (suggestions.length || normalizeText(inputValue).length >= 2) setIsOpen(true)
              }}
              onKeyDown={handleKeyDown}
              disabled={disabled || (!allowFreeText && !isSupabaseConfigured)}
              className="min-h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              placeholder={selectedAreas.length ? 'Add another area' : placeholder}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-invalid={Boolean(error)}
            />
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
            {allowFreeText && normalizeText(inputValue) ? (
              <button
                type="button"
                onClick={() => addArea(inputValue)}
                className="grid h-7 w-7 place-items-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800"
                aria-label="Add area"
              >
                <Plus size={14} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {helperText ? (
        <span className={cn('text-[0.72rem] font-medium normal-case leading-5 tracking-normal text-slate-500', error || loadError ? 'text-rose-600' : '')}>
          {helperText}
        </span>
      ) : null}
      {isOpen && !disabled && isSupabaseConfigured ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-[18px] border border-slate-200 bg-white p-1 normal-case tracking-normal shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          {isFetching ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm font-medium text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching Arch9 areas...
            </div>
          ) : suggestions.length ? (
            <ul role="listbox" className="grid gap-1">
              {suggestions.map((area, index) => (
                <li key={area.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectArea(area)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-[14px] px-3 py-3 text-left transition',
                      activeIndex === index ? 'bg-slate-100' : 'hover:bg-slate-50',
                    )}
                    role="option"
                    aria-selected={activeIndex === index}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{area.name}</span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                        {[area.city, area.province].filter(Boolean).join(', ') || area.country || 'South Africa'}
                        {area.listingCount ? ` · ${area.listingCount} listings` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-4 text-sm font-medium text-slate-500">
              {allowFreeText ? 'No saved area found. Press Enter or + to add it.' : 'No saved area found.'}
            </div>
          )}
        </div>
      ) : null}
    </label>
  )
}
