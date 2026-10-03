import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'

export default function ListingChannelManageMenu({ children, channelName }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && ref.current?.contains(event.target)) return
      if (ref.current) ref.current.open = false
      if (event.type === 'keydown') ref.current?.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [open])
  return <details ref={ref} className="listing-channel-manage-menu relative open:z-40" onToggle={(event) => {
    const nextOpen = event.currentTarget.open
    setOpen(nextOpen)
    if (nextOpen) document.querySelectorAll('.listing-channel-manage-menu[open]').forEach((menu) => { if (menu !== event.currentTarget) menu.open = false })
  }}>
    <summary aria-label={channelName ? 'Manage ' + channelName : 'Manage channel'} className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#35546c] hover:bg-[#f7fbff] [&::-webkit-details-marker]:hidden"><SlidersHorizontal size={15} />Manage</summary>
    <div className="absolute left-0 z-30 mt-2 grid w-64 lg:left-auto lg:right-0 gap-1.5 rounded-[16px] border border-[#dbe6f2] bg-white p-1.5 shadow-[0_18px_34px_rgba(15,23,42,0.14)]" onClickCapture={(event) => {
      const action = event.target.closest('button, a')
      if (action && !action.disabled && action.getAttribute('aria-disabled') !== 'true' && ref.current) ref.current.open = false
    }}>{children}</div>
  </details>
}
