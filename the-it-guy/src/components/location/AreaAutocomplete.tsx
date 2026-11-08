import { Loader2, MapPin, Plus, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { searchArch9Areas, type Arch9Area } from '../../lib/location/areas'
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

export default function AreaAutocomplete({ value = '', onChange, placeholder = 'Start typing an area...', label, description, required = false, disabled = false, error = '', allowFreeText = true }: AreaAutocompleteProps) {
  const inputId = useId()
  const listId = `${inputId}-options`
  const helperId = `${inputId}-help`
  const [inputValue, setInputValue] = useState(value || '')
  const [areas, setAreas] = useState<Arch9Area[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loadError, setLoadError] = useState('')
  const requestIdRef = useRef(0)
  const selectedAreaRef = useRef<Arch9Area | null>(null)

  useEffect(() => {
    setInputValue(value || '')
    if (selectedAreaRef.current?.name !== value) selectedAreaRef.current = null
  }, [value])

  useEffect(() => {
    const requestId = ++requestIdRef.current
    const query = normalizeText(inputValue)
    if (!isOpen || disabled || query.length < 2 || !isSupabaseConfigured) {
      setAreas([])
      setIsFetching(false)
      return
    }
    setIsFetching(true)
    setLoadError('')
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchArch9Areas(query)
        if (requestIdRef.current === requestId) setAreas(results)
      } catch {
        if (requestIdRef.current === requestId) {
          setAreas([])
          setLoadError(allowFreeText ? 'Suggestions are unavailable. You can still enter an area.' : 'Area suggestions are temporarily unavailable.')
        }
      } finally {
        if (requestIdRef.current === requestId) setIsFetching(false)
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      if (requestIdRef.current === requestId) requestIdRef.current += 1
    }
  }, [allowFreeText, disabled, inputValue, isOpen])

  const query = normalizeText(inputValue)
  const canAdd = allowFreeText && query.length >= 2 && !areas.some(area => area.name.toLowerCase() === query.toLowerCase())
  const optionCount = areas.length + Number(canAdd)
  const showOptions = isOpen && !disabled && query.length >= 2
  const helperText = error || loadError || (!isSupabaseConfigured ? allowFreeText ? 'Area directory unavailable. You can still enter an area.' : 'Area directory is unavailable.' : description)

  function closeOptions() {
    requestIdRef.current += 1
    setIsOpen(false)
    setIsFetching(false)
    setActiveIndex(-1)
  }

  function selectArea(area: Arch9Area | null) {
    const nextValue = area ? normalizeText(area.name) : query
    selectedAreaRef.current = area
    setInputValue(nextValue)
    setAreas([])
    closeOptions()
    onChange(nextValue, area)
  }

  function handleInputChange(nextValue: string) {
    requestIdRef.current += 1
    selectedAreaRef.current = null
    setInputValue(nextValue)
    setAreas([])
    setLoadError('')
    setActiveIndex(-1)
    setIsOpen(normalizeText(nextValue).length >= 2)
    if (allowFreeText || !normalizeText(nextValue)) onChange(nextValue, null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && showOptions) {
      event.preventDefault()
      event.stopPropagation()
      closeOptions()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (query.length < 2) return
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex(current => event.key === 'ArrowDown' ? Math.min(current + 1, optionCount - 1) : Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && showOptions) {
      event.preventDefault()
      if (activeIndex >= 0 && areas[activeIndex]) {
        selectArea(areas[activeIndex])
      } else if (canAdd) {
        selectArea(null)
      }
    }
  }

  return <div className="grid min-w-0 gap-1.5">
    {label ? <label htmlFor={inputId} className="text-sm font-semibold text-[#2d445e]">{label}{required ? <span className="ml-1 text-[#b42318]">*</span> : null}</label> : null}
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa0b6]" />
      <Input id={inputId} value={inputValue} placeholder={placeholder} required={required}
        disabled={disabled || (!allowFreeText && !isSupabaseConfigured)}
        onChange={event => handleInputChange(event.target.value)}
        onFocus={() => { setActiveIndex(-1); setIsOpen(query.length >= 2) }}
        onBlur={() => { closeOptions(); if (allowFreeText) onChange(query, selectedAreaRef.current) }}
        onKeyDown={handleKeyDown}
        role="combobox" aria-label={label || placeholder} aria-autocomplete="list" aria-expanded={showOptions}
        aria-controls={showOptions ? listId : undefined} aria-activedescendant={showOptions && activeIndex >= 0 && activeIndex < optionCount ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={Boolean(error)} aria-describedby={helperText ? helperId : undefined}
        className={cn('h-11 rounded-xl border-[#dbe6f2] !pl-10 !pr-16 shadow-none', error ? 'border-[#f1c8c8]' : '')} />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {isFetching ? <Loader2 aria-label="Searching areas" className="h-4 w-4 animate-spin text-[#607387]" /> : null}
        {inputValue && !disabled ? <button type="button" aria-label="Clear area" className="grid h-8 w-8 place-items-center rounded-lg text-[#8aa0b6] hover:bg-[#eef4fa] hover:text-[#142132]"
          onMouseDown={event => event.preventDefault()} onClick={() => { selectedAreaRef.current = null; setInputValue(''); setAreas([]); setLoadError(''); closeOptions(); onChange('', null) }}><X size={15} /></button> : null}
      </div>
      {showOptions ? <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-[#dbe6f2] bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
        {isFetching ? <p role="status" className="px-3 py-2 text-xs text-[#607387]">Searching saved areas…</p> : null}
        <ul id={listId} role="listbox" aria-label="Area suggestions" className="grid gap-0.5">
          {areas.map((area, index) => <li key={area.id}>
            <button id={`${listId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={activeIndex === index}
              onMouseDown={event => event.preventDefault()} onClick={() => selectArea(area)}
              className={cn('flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-[#f1f7f5]', activeIndex === index ? 'bg-[#eef5f2]' : '')}>
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#167653]" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-[#142132]">{area.name}</span><span className="block truncate text-xs text-[#607387]">{[area.city, area.province].filter(Boolean).join(', ') || area.country || 'South Africa'}</span></span>
            </button>
          </li>)}
          {canAdd ? <li><button id={`${listId}-${areas.length}`} type="button" role="option" tabIndex={-1} aria-selected={activeIndex === areas.length}
            onMouseDown={event => event.preventDefault()} onClick={() => selectArea(null)}
            className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[#167653] hover:bg-[#f1f7f5]', activeIndex === areas.length ? 'bg-[#eef5f2]' : '')}>
            <Plus className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">Use “{query}”</span>
          </button></li> : null}
        </ul>
        {!isFetching && !optionCount ? <p className="px-3 py-2 text-xs text-[#607387]">No saved areas match this search.</p> : null}
      </div> : null}
    </div>
    {helperText ? <p id={helperId} className={cn('text-xs leading-5 text-[#607387]', error ? 'text-[#b42318]' : '')}>{helperText}</p> : null}
  </div>
}
