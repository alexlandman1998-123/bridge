import { Command } from 'cmdk'
import { Building2, Check, ChevronDown, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/utils'

function getInitials(name = '') {
  const words = String(name).trim().split(/\s+/).filter((word) => /[a-z0-9]/i.test(word))
  if (!words.length) return 'A9'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

function getAttorneyMeta(attorney = {}) {
  const service = attorney.serviceType || attorney.specialties?.[0] || 'Conveyancing'
  const location = attorney.city || attorney.branch || attorney.province || 'South Africa'
  return `${service} • ${location}`
}

function AttorneyAvatar({ attorney, size = 'large' }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState('')
  const logoUrl = attorney?.logoUrl || attorney?.logo_url || ''
  const firmName = attorney?.companyName || attorney?.firm_name || 'Attorney firm'

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 font-semibold tracking-[-0.04em] text-slate-700',
        size === 'large' ? 'h-12 w-12 text-sm' : 'h-11 w-11 text-[13px]',
      )}
      aria-hidden="true"
    >
      {logoUrl && failedLogoUrl !== logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-cover" onError={() => setFailedLogoUrl(logoUrl)} />
      ) : getInitials(firmName)}
    </span>
  )
}

function ConnectedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      Connected
    </span>
  )
}

function AttorneyRow({ attorney, selected, onSelect }) {
  const firmName = attorney.companyName || attorney.firm_name || 'Connected attorney'
  return (
    <Command.Item
      value={firmName}
      keywords={[
        attorney.city,
        attorney.province,
        attorney.branch,
        attorney.contactPerson,
        attorney.serviceType,
        ...(attorney.specialties || []),
      ].filter(Boolean)}
      onSelect={() => onSelect(attorney.id)}
      className={cn(
        'group mt-1 flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 outline-none transition-colors duration-150',
        'data-[selected=true]:bg-slate-50',
        selected && 'bg-blue-50/80 data-[selected=true]:bg-blue-50',
      )}
    >
      <AttorneyAvatar attorney={attorney} size="small" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-slate-950">{firmName}</span>
        <span className="mt-0.5 block truncate text-sm text-slate-500">{getAttorneyMeta(attorney)}</span>
        {attorney.contactPerson ? <span className="sr-only">Contact: {attorney.contactPerson}</span> : null}
      </span>
      <ConnectedBadge />
      <Check className={cn('h-5 w-5 shrink-0 text-blue-700 transition-opacity', selected ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
    </Command.Item>
  )
}

function SelectorSkeleton() {
  return (
    <div className="flex min-h-[82px] items-center gap-4 rounded-[18px] border border-slate-200 bg-white px-4" aria-label="Loading connected attorneys">
      <span className="h-12 w-12 animate-pulse rounded-full bg-slate-100" />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="block h-4 w-40 animate-pulse rounded bg-slate-100" />
        <span className="block h-3 w-56 max-w-full animate-pulse rounded bg-slate-100" />
      </span>
      <span className="hidden h-7 w-24 animate-pulse rounded-full bg-slate-100 sm:block" />
    </div>
  )
}

export default function AttorneySelector({ attorneys = [], value = '', loading = false, onValueChange, onConnect }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const listId = useId()
  const selectedAttorney = useMemo(
    () => attorneys.find((attorney) => String(attorney.id) === String(value)) || null,
    [attorneys, value],
  )

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({ left: rect.left, top: rect.bottom + 8, width: rect.width })
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const updateMobile = () => setIsMobile(media.matches)
    updateMobile()
    media.addEventListener('change', updateMobile)
    return () => media.removeEventListener('change', updateMobile)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [open, updatePosition])

  const openSelector = (initialSearch = '') => {
    if (loading || !attorneys.length) return
    updatePosition()
    setSearch(initialSearch)
    setOpen(true)
  }

  const selectAttorney = (attorneyId) => {
    onValueChange?.(attorneyId)
    setOpen(false)
    setSearch('')
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  if (loading) return <SelectorSkeleton />

  if (!attorneys.length) {
    return (
      <div className="flex flex-col items-center rounded-[18px] border border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-950">No connected attorneys found.</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Connect a trusted attorney firm before sending seller onboarding.</p>
        <button type="button" onClick={onConnect} className="mt-4 min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50">
          Connect Attorney
        </button>
      </div>
    )
  }

  const panel = open && typeof document !== 'undefined' ? createPortal(
    <div className={cn(isMobile && 'fixed inset-0 z-[130] bg-slate-950/25')} aria-hidden={false}>
      <div
        ref={panelRef}
        id={listId}
        className={cn(
          'attorney-selector-popover z-[131] overflow-hidden border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]',
          isMobile ? 'fixed inset-x-0 bottom-0 max-h-[78dvh] rounded-t-[22px]' : 'fixed max-h-[430px] rounded-[18px]',
        )}
        style={!isMobile && position ? { left: position.left, top: position.top, width: position.width } : undefined}
      >
        {isMobile ? <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" aria-hidden="true" /> : null}
        <Command className="flex max-h-[inherit] flex-col" label="Connected attorney selector">
          <div className="sticky top-0 z-10 bg-white p-3 pb-2">
            <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
              <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                placeholder="Search connected attorneys..."
                className="h-12 min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
            <Command.Empty className="px-4 py-10 text-center">
              <Search className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-900">No matching attorneys</p>
              <p className="mt-1 text-sm text-slate-500">Try a firm, city, branch or contact name.</p>
            </Command.Empty>
            {attorneys.map((attorney) => (
              <AttorneyRow
                key={attorney.id}
                attorney={attorney}
                selected={String(attorney.id) === String(value)}
                onSelect={selectAttorney}
              />
            ))}
          </Command.List>
        </Command>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Connected attorney"
        onClick={() => (open ? setOpen(false) : openSelector())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'Enter', ' '].includes(event.key)) {
            event.preventDefault()
            openSelector()
          } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault()
            openSelector(event.key)
          }
        }}
        className={cn(
          'flex min-h-[82px] w-full items-center gap-4 rounded-[18px] border bg-white px-4 text-left outline-none transition duration-150',
          'hover:border-slate-300 hover:shadow-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-100',
          open ? 'border-blue-400 ring-4 ring-blue-100' : 'border-slate-200',
        )}
      >
        {selectedAttorney ? <AttorneyAvatar attorney={selectedAttorney} /> : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Users className="h-5 w-5" /></span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold tracking-[-0.025em] text-slate-950">
            {selectedAttorney?.companyName || 'Select an attorney'}
          </span>
          <span className="mt-0.5 block truncate text-sm text-slate-500">
            {selectedAttorney ? getAttorneyMeta(selectedAttorney) : 'Choose a connected professional firm'}
          </span>
        </span>
        {selectedAttorney ? <span className="hidden sm:inline-flex"><ConnectedBadge /></span> : null}
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-700 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {panel}
    </>
  )
}
