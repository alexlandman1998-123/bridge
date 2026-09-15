import { useEffect, useState } from 'react'
import { ArrowRight, Menu, X } from 'lucide-react'
import './HomeSeekersMobileNav.css'

/** A shared mobile drawer so every Home Seekers route feels like one site. */
export default function HomeSeekersMobileNav({ links, active, onValuation }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const close = () => setOpen(false)
  return <div className="hs-mobile-nav">
    <button className="hs-mobile-nav__trigger" type="button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}>
      <span>Menu</span><Menu size={19} />
    </button>
    {open && <div className="hs-mobile-nav__overlay" role="presentation" onClick={close}>
      <aside className="hs-mobile-nav__drawer" role="dialog" aria-modal="true" aria-label="Home Seekers navigation" onClick={(event) => event.stopPropagation()}>
        <div className="hs-mobile-nav__drawer-top"><span>HOME SEEKERS / MENU</span><button type="button" onClick={close} aria-label="Close navigation"><X size={22} /></button></div>
        <p>Move forward,<br /><em>faster.</em></p>
        <nav>{links.map(([label, href]) => <a className={active === label.toLowerCase() ? 'is-active' : ''} href={href} key={label} onClick={close}><span>{label}</span><ArrowRight size={18} /></a>)}</nav>
        {onValuation && <button className="hs-mobile-nav__cta" type="button" onClick={() => { close(); onValuation() }}>Book a free valuation <ArrowRight size={17} /></button>}
      </aside>
    </div>}
  </div>
}
