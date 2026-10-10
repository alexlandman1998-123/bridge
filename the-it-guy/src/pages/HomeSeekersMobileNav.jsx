import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import { homeSeekersPath } from './homeSeekersRoutes.js'
import HomeSeekersLoginLink from './HomeSeekersLoginLink'
import './HomeSeekersMobileNav.css'

/** A shared mobile drawer so every Home Seekers route feels like one site. */
export default function HomeSeekersMobileNav({ links, active, onValuation }) {
  const [open, setOpen] = useState(false)
  const drawerId = useId()
  const triggerRef = useRef(null)
  const drawerRef = useRef(null)
  const navigation = [
    ...(!links.some(([, href]) => href === homeSeekersPath('/')) ? [['Home', homeSeekersPath('/')]] : []),
    ...links,
    ...(!links.some(([, href]) => href === homeSeekersPath('/contact')) ? [['Contact', homeSeekersPath('/contact')]] : []),
  ]

  useEffect(() => {
    if (!open) return undefined
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...(drawerRef.current?.querySelectorAll('a[href],button:not([disabled])') || [])]
    focusable()[0]?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0]; const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !drawerRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !drawerRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
    }
  }, [open])

  const close = () => setOpen(false)
  return <div className="hs-mobile-nav">
    <button ref={triggerRef} className="hs-mobile-nav__trigger" type="button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open} aria-controls={open ? drawerId : undefined}>
      <span>Menu</span><Menu size={24} aria-hidden="true" />
    </button>
    {open && createPortal(<div className="hs-mobile-nav__overlay" role="presentation" onClick={close}>
      <aside id={drawerId} ref={drawerRef} className="hs-mobile-nav__drawer" role="dialog" aria-modal="true" aria-label="Home Seekers navigation" onClick={(event) => event.stopPropagation()}>
        <div className="hs-mobile-nav__drawer-top"><span>HOME SEEKERS / MENU</span><button type="button" onClick={close} aria-label="Close navigation"><X size={22} /></button></div>
        <p>Move forward,<br /><em>faster.</em></p>
        <nav aria-label="Mobile navigation">{navigation.map(([label, href]) => <a className={active === label.toLowerCase() ? 'is-active' : ''} href={href} key={label} onClick={close}><span>{label}</span><ArrowRight size={18} aria-hidden="true" /></a>)}<HomeSeekersLoginLink /></nav>
        {onValuation && <button className="hs-mobile-nav__cta" type="button" onClick={() => { close(); onValuation() }}>Book a free valuation <ArrowRight size={17} /></button>}
      </aside>
    </div>, document.body)}
  </div>
}
