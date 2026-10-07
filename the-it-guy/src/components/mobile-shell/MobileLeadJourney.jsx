import { Check, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export default function MobileLeadJourney({ stages = [], title = 'Buyer journey', loading = false, error = '', onRetry }) {
  const stripRef = useRef(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const currentStage = stages.find((stage) => stage.state === 'current')
  const completed = stages.filter((stage) => stage.state === 'completed').length

  useEffect(() => {
    const strip = stripRef.current
    const current = strip?.querySelector('[aria-current="step"]')
    if (current) strip.scrollTo?.({ left: Math.max(0, current.offsetLeft - parseFloat(getComputedStyle(strip).paddingLeft || '0')), behavior: 'instant' })
  }, [currentStage?.key, loading, error])

  return <section className="mobile-lead-section mobile-lead-journey mobile-glass-surface" aria-label={title}>
    <div className="mobile-lead-journey-heading"><div><h2>{title}</h2><p>{loading ? 'Loading saved progress…' : error ? 'Saved progress unavailable' : `${completed} of ${stages.length} steps complete`}</p></div><span className="mobile-lead-swipe-hint" aria-hidden="true">Swipe<ChevronRight size={14} /></span></div>
    {loading ? <p role="status">Loading journey…</p> : error ? <div className="mobile-lead-journey-error"><p role="alert">We couldn’t load the saved journey. Please try again.</p><button type="button" onClick={onRetry}>Retry journey</button></div> : <>
      <ol ref={stripRef} className="mobile-lead-journey-strip" tabIndex={0} aria-label={`${title} stages`} onScroll={(event) => { const strip = event.currentTarget; const range = strip.scrollWidth - strip.clientWidth; setScrollProgress(range > 0 ? Math.max(0, Math.min(1, strip.scrollLeft / range)) : 0) }}>
        {stages.map((stage, index) => <li key={stage.key} className={`mobile-lead-journey-step is-${stage.state}`} aria-current={stage.state === 'current' ? 'step' : undefined}>
          <span className="mobile-lead-step-number" aria-hidden="true">{stage.state === 'completed' ? <Check size={16} strokeWidth={2.5} /> : String(index + 1).padStart(2, '0')}</span>
          <strong>{stage.label}</strong><small>{stage.overridden || stage.paymentReviewPending ? stage.detail : stage.state === 'completed' ? 'Completed' : stage.state === 'current' ? 'Current step' : 'Upcoming'}</small>
        </li>)}
      </ol>
      <div className="mobile-lead-journey-scroll-indicator" aria-hidden="true"><span style={{ transform: `translateX(${scrollProgress * 34}px)` }} /></div>
      {currentStage && <p className="mobile-lead-journey-current">Now: <strong>{currentStage.label}</strong> · {currentStage.detail}</p>}
    </>}
  </section>
}
