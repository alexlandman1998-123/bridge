import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, CheckCircle2, House, MapPin, Package, Truck, Users } from 'lucide-react'
import Modal from '../../ui/Modal'
import { demoInsuranceBrandStyle } from '../insurance/demoInsuranceTheme'
import { DemoHomeServicesHero, DemoRouteSummary, DemoTruckIllustration } from './DemoHomeServicesVisuals'
import { HOME_SERVICES_NOTICE, MOVE_QUOTES, MOVE_QUOTE_ASSUMPTION, MOVE_TRUCKS } from './demoHomeServicesData'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
const steps = ['Your route', 'Truck size', 'Your quotes']

export default function DemoMoveWorkspace({ theme, propertyAddress = '', currentAddress = '' }) {
  const id = useId()
  const heading = useRef(null)
  const previousStep = useRef(0)
  const fromInput = useRef(null)
  const toInput = useRef(null)
  const [step, setStep] = useState(0)
  const [from, setFrom] = useState(currentAddress)
  const [to, setTo] = useState(propertyAddress)
  const [truckId, setTruckId] = useState('medium')
  const [error, setError] = useState('')
  const [selectedQuote, setSelectedQuote] = useState(null)
  const truck = MOVE_TRUCKS.find(item => item.id === truckId)

  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus()
    previousStep.current = step
  }, [step])

  function continueRoute(event) {
    event.preventDefault()
    if (!from.trim() || !to.trim()) {
      setError('Add both addresses to plan your move.')
      const missingInput = !from.trim() ? fromInput : toInput
      missingInput.current?.focus()
      return
    }
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
      setError('Choose a different destination for your move.')
      toInput.current?.focus()
      return
    }
    setFrom(from.trim())
    setTo(to.trim())
    setError('')
    setStep(1)
  }

  return <section className="home-services-workspace" style={demoInsuranceBrandStyle(theme)} data-home-services-source="demo">
    <DemoHomeServicesHero theme={theme} kind="move" />
    <ol className="home-services-steps" aria-label="Moving quote steps">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={step > index}><span>{step > index ? <Check size={16} aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>

    <section className="home-services-move-panel" aria-labelledby={`${id}-heading`}>
      <div className="home-services-panel-heading"><div><span className="home-services-eyebrow">Step {step + 1} of 3</span><h3 id={`${id}-heading`} ref={heading} tabIndex={-1}>{step === 0 ? 'Where are we taking you?' : step === 1 ? 'A little space. Or a lot.' : 'Three ways to get you home.'}</h3><p>{step === 0 ? currentAddress ? 'Your current and new home are already filled in. Check the addresses, or change them if needed.' : 'Your new home is already filled in. Just add where you’re moving from.' : step === 1 ? 'Choose the truck that feels right for your home.' : 'Compare a few sample options for your move.'}</p></div>{step > 0 ? <button type="button" className="home-services-back" onClick={() => setStep(step - 1)}><ArrowLeft size={16} aria-hidden="true" />Back</button> : null}</div>

      {step === 0 ? <form onSubmit={continueRoute} noValidate>
        <div className="home-services-route-inputs">
          <label className="home-services-address"><span className="home-services-address-label"><MapPin size={17} aria-hidden="true" />From</span><span className="home-services-address-caption">Your current front door</span><input ref={fromInput} name="from" aria-label="From address" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} value={from} onChange={event => { setFrom(event.target.value); setError('') }} placeholder="Enter your current address" required maxLength={240} autoComplete="off" /></label>
          <button type="button" className="home-services-swap" aria-label="Swap from and to addresses" onClick={() => { setFrom(to); setTo(from); setError('') }}><ArrowLeftRight size={20} aria-hidden="true" /></button>
          <label className="home-services-address home-services-address-destination"><span className="home-services-address-label"><House size={17} aria-hidden="true" />To</span><span className="home-services-address-caption">Your next chapter</span><input ref={toInput} name="to" aria-label="To address" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} value={to} onChange={event => { setTo(event.target.value); setError('') }} placeholder="Enter your new address" required maxLength={240} autoComplete="off" /></label>
        </div>
        {error ? <p id={`${id}-error`} className="home-services-error" role="alert">{error}</p> : null}
        <div className="home-services-next-row"><span><Package size={17} aria-hidden="true" />One less thing on your moving list.</span><button type="submit" className="home-services-button">Next: truck size<ArrowRight size={18} aria-hidden="true" /></button></div>
      </form> : null}

      {step === 1 ? <>
        <DemoRouteSummary from={from} to={to} />
        <fieldset className="home-services-truck-choices"><legend className="sr-only">Choose a truck size</legend><div className="home-services-truck-grid">{MOVE_TRUCKS.map(item => <label key={item.id} className="home-services-truck-option" data-selected={truckId === item.id}><input type="radio" name={`${id}-truck`} value={item.id} checked={truckId === item.id} onChange={() => setTruckId(item.id)} /><span className="home-services-truck-top"><span>{item.volume}</span><span className="home-services-truck-check"><Check size={15} aria-hidden="true" /></span></span><DemoTruckIllustration size={item.id} /><strong>{item.label}</strong><span className="home-services-truck-home">{item.home}</span><span className="home-services-truck-description">{item.description}</span><span className="home-services-truck-crew"><Users size={15} aria-hidden="true" />{item.crew}</span></label>)}</div></fieldset>
        <div className="home-services-next-row"><span>Not sure? These sizes are a starting point.</span><button type="button" className="home-services-button" onClick={() => setStep(2)}>See quotes<ArrowRight size={18} aria-hidden="true" /></button></div>
      </> : null}

      {step === 2 ? <>
        <div className="home-services-move-summary"><DemoRouteSummary from={from} to={to} /><span className="home-services-truck-pill"><Truck size={17} aria-hidden="true" />{truck.label} · {truck.volume}</span><button type="button" className="home-services-text-button" onClick={() => setStep(0)}>Edit route</button></div>
        <div className="home-services-moving-quotes">{MOVE_QUOTES.map((quote, index) => <article key={quote.id} className="home-services-moving-quote"><div className="home-services-moving-brand"><span className="home-services-moving-monogram" data-variant={index}>{quote.initials}</span><span className="home-services-eyebrow">Moving, made easier</span></div><h4>{quote.name}</h4><p>{quote.tagline}</p><div className="home-services-moving-price"><span>Sample once-off quote</span><strong>{money.format(quote.prices[truckId])}</strong></div><ul>{quote.features.map(feature => <li key={feature}><CheckCircle2 size={16} aria-hidden="true" />{feature}</li>)}</ul><button type="button" className="home-services-button" aria-label={`View ${quote.name} quote`} onClick={() => setSelectedQuote(quote)}>View quote<ArrowRight size={17} aria-hidden="true" /></button></article>)}</div>
        <p className="home-services-footnote">{MOVE_QUOTE_ASSUMPTION}</p>
      </> : null}
    </section>
    <p className="home-services-footnote">{HOME_SERVICES_NOTICE}</p>

    <Modal open={Boolean(selectedQuote)} onClose={() => setSelectedQuote(null)} title={selectedQuote?.name || 'Moving quote'} subtitle="Your sample move, at a glance." className="home-services-dialog">
      {selectedQuote ? <div className="home-services-dialog-content" style={demoInsuranceBrandStyle(theme)}>
        <div className="home-services-moving-detail-price"><div><span className="home-services-eyebrow">Sample once-off quote</span><p className="home-services-total">{money.format(selectedQuote.prices[truckId])}</p></div><Truck size={58} strokeWidth={1.1} aria-hidden="true" /></div>
        <DemoRouteSummary from={from} to={to} /><div className="home-services-moving-detail-specs"><span><Truck size={18} aria-hidden="true" />{truck.label} · {truck.volume}</span><span><Users size={18} aria-hidden="true" />{truck.crew}</span></div>
        <h4 className="home-services-detail-heading">What’s included</h4><ul className="home-services-moving-detail-features">{selectedQuote.features.map(feature => <li key={feature}><CheckCircle2 size={17} aria-hidden="true" />{feature}</li>)}</ul><p className="home-services-detail-copy">{selectedQuote.detail}</p><p className="home-services-footnote">{MOVE_QUOTE_ASSUMPTION}</p><p className="home-services-footnote">{HOME_SERVICES_NOTICE}</p>
      </div> : null}
    </Modal>
  </section>
}
