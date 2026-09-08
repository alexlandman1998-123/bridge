'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

type Item = { href: string; label: string }

export function MobileNavigation({ items, currentHref, enquiryHref, enquiryLabel }: {
  items: Item[]
  currentHref?: string
  enquiryHref: string
  enquiryLabel: string
}) {
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const navigationId = useId()
  const pathname = usePathname()

  useEffect(() => { setOpen(false) }, [pathname, currentHref])

  useEffect(() => {
    const close = () => setOpen(false)
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.dataset.open === 'true') {
        close()
        menu.current.querySelector('button')?.focus()
      }
    }
    const resize = () => {
      if (window.innerWidth > 760) close()
      const element = menu.current
      const header = element?.closest('header')
      if (element && header) {
        element.style.setProperty('--menu-top', `${Math.max(0, header.getBoundingClientRect().bottom)}px`)
      }
    }
    resize()
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', resize)
    window.addEventListener('popstate', close)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', resize)
      window.removeEventListener('popstate', close)
    }
  }, [])

  return <div ref={menu} className="mobile-menu" data-open={open}>
    <button type="button" className="mobile-menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls={navigationId} onClick={() => {
      const element = menu.current
      if (element) {
        const bottom = element.closest('header')?.getBoundingClientRect().bottom || 0
        element.style.setProperty('--menu-top', `${Math.max(0, bottom)}px`)
      }
      setOpen(value => !value)
    }}><span /><span /><span /></button>
    <nav id={navigationId} aria-label="Mobile primary" hidden={!open} onClick={event => {
      if (event.target instanceof Element && event.target.closest('a')) setOpen(false)
    }}>
      {items.map(item => <Link href={item.href} aria-current={currentHref === item.href ? 'page' : undefined} key={`${item.href}-${item.label}`}>{item.label}</Link>)}
      <Link className="header-cta" href={enquiryHref}>{enquiryLabel}</Link>
    </nav>
  </div>
}
