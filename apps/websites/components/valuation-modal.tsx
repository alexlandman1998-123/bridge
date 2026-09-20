'use client'

import { useEffect, useRef, useState } from 'react'
import { LeadForm } from './lead-form'
import styles from './valuation-modal.module.css'

export function ValuationModal({ privacyPolicyUrl, triggerClassName = '' }: { privacyPolicyUrl?: string; triggerClassName?: string }) {
  const [open, setOpen] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', escape)
    closeButton.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return <>
    <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>See your home’s value</button>
    {open ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="valuation-modal-title">
        <aside className={styles.intro}><p>A local price perspective</p><h2 id="valuation-modal-title">See what your home could achieve.</h2><span>A considered valuation informed by your property, your area and your next move.</span><b>LWP PROPERTIES<br />BEYOND THE SALE.</b></aside>
        <div className={styles.formPanel}><button className={styles.close} ref={closeButton} type="button" onClick={() => setOpen(false)} aria-label="Close valuation form">×</button><p className={styles.overline}>Start your LWP valuation</p><LeadForm purpose="valuation_request" variant="valuation-modal" privacyPolicyUrl={privacyPolicyUrl} source="valuation_modal" submitLabel="Get my valuation" /></div>
      </section>
    </div> : null}
  </>
}
