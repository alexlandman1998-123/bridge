import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

// Keep row actions in the top layer so the table never clips the dropdown.
export default function ListingDocumentActions({ label, children }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, right: 16, maxHeight: 400 })
  const trigger = useRef(null)
  const panel = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - 24
      const above = rect.top - 24
      const upwards = below < 260 && above > below
      setPosition({
        top: upwards ? undefined : rect.bottom + 8,
        bottom: upwards ? window.innerHeight - rect.top + 8 : undefined,
        right: Math.max(16, window.innerWidth - rect.right),
        maxHeight: Math.max(120, upwards ? above : below),
      })
    }
    const dismiss = event => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false)
    }
    const keyboard = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    place()
    panel.current?.querySelector('button:not([disabled]), input:not([disabled])')?.focus()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', keyboard, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [open])

  return <>
    <button ref={trigger} type="button" aria-label={`Actions for ${label}`} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#315b7a] transition hover:bg-[#f4f8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6f9f]">
      Actions <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
    </button>
    {open ? createPortal(<div ref={panel} id={id} role="group" aria-label={`${label} actions`} style={position} onClick={event => {
      const button = event.target.closest('button')
      if (button && !button.closest('[data-document-review-actions]')) setOpen(false)
    }} onChange={event => { if (event.target.type === 'file') setOpen(false) }} onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && !trigger.current?.contains(event.relatedTarget)) setOpen(false)
    }} className="fixed z-[70] w-80 max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl border border-[#dbe6f2] bg-white p-2 shadow-[0_12px_36px_rgba(15,23,42,0.16)] [&_button]:border-0 [&_button]:bg-transparent [&_button]:shadow-none [&_button]:text-[#315b7a] [&_button:hover]:bg-[#f4f8fb] [&_label:has(input[type=file])]:border-0 [&_label:has(input[type=file]):hover]:bg-[#f4f8fb] [&_button]:w-full [&_button]:justify-start [&_button]:text-left [&_label:has(input[type=file])]:flex [&_label:has(input[type=file])]:w-full [&_label:has(input[type=file])]:items-center [&_div.flex]:flex-col">
      <p className="mb-2 border-b border-[#edf2f7] px-2 pb-2 pt-1 text-xs font-semibold text-[#607387]">{label}</p>
      {children}
    </div>, document.body) : null}
  </>
}
