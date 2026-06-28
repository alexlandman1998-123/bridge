import { Loader2, MapPin, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatAreaLabel, searchArch9Areas, type Arch9Area } from '../../lib/location/areas'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { cn } from '../../lib/utils'
import { Input } from '../ui/input'

export type AreaAutocompleteProps = {
  value?: string
  onChange: (value: string, area?: Arch9Area | null) => void
  placeholder?: string
  label?: string
  description?: string
  required?: boolean
  disabled?: boolean
  error?: string
  allowFreeText?: boolean
}

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export default function AreaAutocomplete({
  value = '',
  onChange,
  placeholder = 'Start typing an area...',
  label,
  description,
  required = false,
  disabled = false,
  error = '',
  allowFreeText = true,
}: AreaAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value || '')
  const [areas, setAreas] = useState<Arch9Area[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loadError, setLoadError] = useState('')
  const requestIdRef = useRef(0)

  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  useEffect(() => {
    const query = normalizeText(inputValue)
    if (disabled || query.length < 2 || !isSupabaseConfigured) {
      setAreas([])
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
          setAreas(results)
          setIsOpen(true)
          setActiveIndex(-1)
        })
        .catch((problem) => {
          if (requestIdRef.current !== requestId) return
          setAreas([])
          setLoadError(problem?.message || 'Area suggestions are temporarily unavailable.')
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setIsFetching(false)
        })
    }, 300)

    return () => window.clearTimeout(timer)
  }, [disabled, inputValue])

  const helperText = useMemo(() => {
    if (error) return error
    if (loadError) return loadError
    if (!isSupabaseConfigured) return allowFreeText ? 'Area directory unavailable. Manual entry is still allowed.' : 'Area directory is unavailable.'
    return description
  }, [allowFreeText, description, error, loadError])

  function handleClear() {
    setInputValue('')
    setAreas([])
    setIsOpen(false)
    onChange('', null)
  }

  function handleSelect(area: Arch9Area) {
    const nextValue = normalizeText(area.name)
    setInputValue(nextValue)
    setAreas([])
    setIsOpen(false)
    setActiveIndex(-1)
    onChange(nextValue, area)
  }

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue)
    setLoadError('')
    if (allowFreeText) {
      onChange(nextValue, null)
    } else if (!normalizeText(nextValue)) {
      onChange('', null)
    }
  }

  function handleBlur() {
    if (allowFreeText) onChange(normalizeText(inputValue), null)
    window.setTimeout(() => setIsOpen(false), 120)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, areas.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && activeIndex >= 0 && areas[activeIndex]) {
      event.preventDefault()
      handleSelect(areas[activeIndex])
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="relative grid gap-2">
      {label ? (
        <label className="text-sm font-semibold text-[#2d445e]">
          {label}
          {required ? <span className="ml-1 text-[#b42318]">*</span> : null}
        </label>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa0b6]" />
        <Input
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => {
            if (areas.length || normalizeText(inputValue).length >= 2) setIsOpen(true)
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || (!allowFreeText && !isSupabaseConfigured)}
          required={required}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-invalid={Boolean(error)}
          className={cn(
            'h-12 rounded-[16px] border-[#dbe6f2] !pl-12 !pr-20 shadow-[0_10px_24px_rgba(15,23,42,0.06)]',
            error ? 'border-[#f1c8c8] focus:border-[#d92d20] focus:ring-[#fef3f2]' : '',
          )}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-[#607387]" /> : null}
          {inputValue && !disabled ? (
            <button
              type="button"
              onClick={handleClear}
              className="grid h-8 w-8 place-items-center rounded-full text-[#8aa0b6] transition hover:bg-[#eef4fa] hover:text-[#142132]"
              aria-label="Clear area"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      </div>
      {helperText ? (
        <p className={cn('text-xs leading-5 text-[#607387]', error || loadError ? 'text-[#b42318]' : '')}>
          {helperText}
        </p>
      ) : null}
      {isOpen && !disabled && isSupabaseConfigured ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-[18px] border border-[#dbe6f2] bg-white p-1 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          {isFetching ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-[#607387]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching Arch9 areas...
            </div>
          ) : areas.length ? (
            <ul role="listbox" className="grid gap-1">
              {areas.map((area, index) => (
                <li key={area.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(area)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-[14px] px-3 py-3 text-left transition',
                      activeIndex === index ? 'bg-[#eef5fb]' : 'hover:bg-[#f6f9fc]',
                    )}
                    role="option"
                    aria-selected={activeIndex === index}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0f8a5f]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#142132]">{area.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-[#607387]">
                        {[area.city, area.province].filter(Boolean).join(', ') || area.country || 'South Africa'}
                        {area.listingCount ? ` · ${area.listingCount} listings` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-4 text-sm text-[#607387]">
              {allowFreeText ? 'No saved area found. You can keep this as a new preferred area.' : 'No saved area found.'}
            </div>
          )}
        </div>
      ) : null}
      {inputValue && areas.length === 1 && normalizeText(inputValue).toLowerCase() === areas[0].name.toLowerCase() ? (
        <p className="sr-only">Selected area: {formatAreaLabel(areas[0])}</p>
      ) : null}
    </div>
  )
}
