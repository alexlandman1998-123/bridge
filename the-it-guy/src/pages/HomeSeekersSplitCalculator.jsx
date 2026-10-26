import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Mail } from 'lucide-react'
import { calculateSplitCosts, calculatorNegativeExplanation, calculatorRand, splitCalculatorDefaults, splitCalculatorErrors, splitCalculatorModels } from './homeSeekersSplitCalculatorModel'
import { isNextStepsLocalReview, readNextStepsReview, recordNextStepsPreviewEvent, saveNextStepsReview } from './homeSeekersNextStepsModel'
import { trackHomeSeekersCalculator } from './homeSeekersPixel'
import './HomeSeekersSplitCalculator.css'

function AnimatedDifference({ value }) {
  const [display, setDisplay] = useState(value)
  const last = useRef(value)
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { last.current = value; setDisplay(value); return undefined }
    const from = last.current
    let frame, start
    function tick(now) {
      start ??= now
      const progress = Math.min((now - start) / 420, 1)
      const next = from + (value - from) * (1 - (1 - progress) ** 3)
      last.current = next; setDisplay(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <><span aria-hidden="true">{calculatorRand(display)}</span><span className="hs-split__sr-only">{calculatorRand(value)}</span></>
}
function NumberField({ name, label, value, onChange, error, min = 0, max = 100000000, step = '0.01', suffix = 'R', range = false, rangeStep }) {
  const id = `hs-split-${name}`
  const displayValue = suffix === 'R' ? String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : value
  function update(event) {
    const input = event.currentTarget
    if (suffix !== 'R') { onChange(name, input.value); return }
    const raw = input.value, caret = input.selectionStart ?? raw.length
    const significant = raw.slice(0, caret).replace(/^R/i, '').replace(/[\s,]/g, '').length
    onChange(name, raw.replace(/^R/i, '').replace(/[\s,]/g, ''))
    // Preserve the editing position as grouping spaces are added or removed.
    queueMicrotask(() => {
      if (document.activeElement !== input) return
      let count = 0, position = 0
      while (position < input.value.length && count < significant) {
        if (!/\s/.test(input.value[position])) count++
        position++
      }
      input.setSelectionRange(position, position)
    })
  }
  return <div className="hs-split__field">
    <label htmlFor={id}>{label}</label>
    <div className="hs-split__input"><span aria-hidden="true">{suffix}</span><input id={id} name={name} type={suffix === 'R' ? 'text' : 'number'} inputMode={step === '1' ? 'numeric' : 'decimal'} min={min} max={max} step={step} value={displayValue} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={update} /></div>
    {range && <><input className="hs-split__slider" aria-label={`${label} slider`} type="range" min={min} max={max} step={rangeStep || step} value={Math.min(max, Math.max(min, Number(value) || min))} onChange={event => onChange(name, event.target.value)} /><div className="hs-split__range-labels" aria-hidden="true"><span>{suffix === 'R' ? calculatorRand(min) : `${min}%`}</span><span>{suffix === 'R' ? calculatorRand(max) : `${max}%`}</span></div></>}
    {error && <p className="hs-split__error" id={`${id}-error`}>{error}</p>}
  </div>
}
export default function HomeSeekersSplitCalculator({ onSession, onQualify }) {
  const [inputs, setInputs] = useState(splitCalculatorDefaults), [email, setEmail] = useState(''), [message, setMessage] = useState(''), [sent, setSent] = useState(null), [busy, setBusy] = useState(false)
  const completed = useRef(false), capture = useRef(null), working = useRef(false)
  const local = isNextStepsLocalReview(), result = calculateSplitCosts(inputs), errors = splitCalculatorErrors(inputs)
  useEffect(() => {
    if (!result || completed.current) return
    completed.current = true
    const receipt = crypto.randomUUID()
    try {
      if (local) recordNextStepsPreviewEvent('calculator_completed')
      else trackHomeSeekersCalculator('calculator_completed', receipt)
    } catch { /* A blocked tracker or local storage must not gate the results. */ }
  }, [local, result])
  function change(name, value) {
    setInputs(current => ({ ...current, [name]: value })); setSent(null); setMessage(''); capture.current = null
  }
  function submitEmail(event) {
    event.preventDefault()
    if (working.current) return
    setMessage('')
    if (!result) { setMessage('Check the calculator inputs before requesting a breakdown.'); return }
    const address = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) { setMessage('Enter a valid email address.'); event.currentTarget.querySelector('input[type=email]')?.focus(); return }
    if (!local) { setMessage('Email delivery is not configured yet. Your result is shown above.'); return }
    working.current = true; setBusy(true)
    try {
      capture.current ||= { id: crypto.randomUUID(), email: address, inputs: { ...inputs } }
      const record = saveNextStepsReview('calculator', { email: capture.current.email, inputs: capture.current.inputs }, { id: capture.current.id })
      setSent(record)
    } catch (error) { setMessage(error.message || 'The breakdown could not be saved. Your result is still shown above.') }
    finally { working.current = false; setBusy(false) }
  }
  const field = (name, label, props = {}) => <NumberField key={name} name={name} label={label} value={inputs[name]} onChange={change} error={errors[name]} {...props} />
  const negative = result?.difference < 0, equal = result?.difference === 0
  let previewRecords = []
  if (local) { try { previewRecords = readNextStepsReview().records.filter(record => record.type === 'calculator') } catch { /* Capture reports a persistence error without hiding the result. */ } }
  return <section className="hs-join__section hs-split" id="split-calculator" aria-labelledby="split-calculator-title">
    <header className="hs-split__heading"><p className="hs-split__eyebrow">Now use your numbers</p><h2 id="split-calculator-title">What did your split<br className="hs-split__desktop-break" /> cost you last year?</h2><p>Most agents have never worked it out. Takes thirty seconds.</p></header>
    <div className="hs-split__workspace">
      <div className="hs-split__controls" role="group" aria-label="Your brokerage calculator inputs">
        {field('sales', 'Registered sales in the last 12 months', { max: 9999, step: '1', suffix: 'No.' })}
        {field('averagePrice', 'Average selling price', { min: 500000, max: 15000000, step: '0.01', rangeStep: 50000, range: true })}
        {field('rate', 'Your commission rate', { min: 3, max: 10, step: '0.01', rangeStep: 0.1, range: true, suffix: '%' })}
        <div className="hs-split__field"><label htmlFor="hs-split-model">What are you on at the moment?</label><select id="hs-split-model" value={inputs.model} onChange={event => change('model', event.target.value)}>{splitCalculatorModels.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
        {['cap', 'deskPlusPct', 'fixedFee'].includes(inputs.model) && <fieldset className="hs-split__conditional"><legend>Your current fees</legend>
          {inputs.model === 'cap' && <><p>The cap model uses a 30% office share until the cap is reached.</p>{field('cap', 'Cap amount', { max: 10000000000 })}{field('capDesk', 'Monthly desk fee')}{field('capAdmin', 'Admin fee per transaction')}</>}
          {inputs.model === 'deskPlusPct' && <>{field('desk', 'Monthly desk fee')}{field('pct', 'Office percentage', { max: 100, suffix: '%' })}{field('admin', 'Admin fee per transaction')}</>}
          {inputs.model === 'fixedFee' && <>{field('fee', 'Monthly amount')}{field('perDeal', 'Per-deal fee')}</>}
        </fieldset>}
        <p className="hs-split__assumptions">Use amounts excluding VAT, with the same basis for your current fees. Estimates use the average price and rate you enter.</p>
      </div>
      <div className="hs-split__right">
        <div className="hs-split__result" aria-label="Your annual cost comparison">
          {result ? <>
            <p className="hs-split__result-eyebrow">Your last twelve months</p>
            <dl className="hs-split__breakdown"><div><dt>You wrote</dt><dd>{calculatorRand(result.gross)}<small>of commission.</small></dd></div><div><dt>Your office kept</dt><dd>{calculatorRand(result.currentCost)}</dd></div><div><dt>With Home Seekers it would have cost</dt><dd>{calculatorRand(result.homeSeekersCost)}</dd></div></dl>
            <div className="hs-split__difference" role="status" aria-live="polite" aria-atomic="true"><span>The difference</span><strong><AnimatedDifference value={result.difference} /></strong><p>{negative ? `${calculatorRand(-result.perMonth)} a month more with Home Seekers.` : equal ? 'The same cost over the year.' : `That’s ${calculatorRand(result.perMonth)} a month.`}</p></div>
            <p className="hs-split__percent">{result.hsPercentOfGross === null ? 'Our fee as a share of commission: not applicable with no sales.' : <>Our fee works out at <strong>{result.hsPercentOfGross.toFixed(1)}%</strong> of what you wrote.</>}</p>
            {negative && <div className="hs-split__honest"><h3>On these numbers, you’re better off where you are.</h3><p>{calculatorNegativeExplanation(inputs, result)}</p></div>}
            {equal && <div className="hs-split__honest"><h3>On these numbers, the costs are the same.</h3><p>There’s no fee saving on this comparison. Compare the support and terms before deciding.</p></div>}
            <p className="hs-split__vat">All figures exclude VAT. This compares brokerage costs, not take-home income.</p>
          </> : <div className="hs-split__invalid" role="status"><h3>Check your numbers.</h3><p>Complete the highlighted inputs to see your breakdown. Empty or invalid fields are never treated as zero.</p></div>}
        </div>
      </div>
    </div>
    <div className="hs-split__footer" id="calculator-follow-up">
        <div className="hs-split__capture">
          <h3>Want this breakdown in writing?</h3>
          <form onSubmit={submitEmail} noValidate aria-label="Email your split breakdown"><label className="hs-split__sr-only" htmlFor="hs-split-email">Email for this breakdown</label><input id="hs-split-email" type="email" autoComplete="email" placeholder="Your email address" value={email} maxLength={254} onChange={event => { setEmail(event.target.value); setSent(null); setMessage(''); capture.current = null }} aria-invalid={!!message} aria-describedby={message ? 'hs-split-email-error' : undefined} required /><button type="submit" disabled={busy || !result || !!sent}>{sent ? <><Check size={17} aria-hidden="true" />Saved for review</> : <>{busy ? 'Saving…' : 'Send it to me'}<Mail size={16} aria-hidden="true" /></>}</button></form>
          {message && <p id="hs-split-email-error" className="hs-split__error" role="alert">{message}</p>}
          {sent && <p className="hs-split__saved" role="status">Preview breakdown saved for {sent.details.email}. No email was sent and no CRM record was created.</p>}
          {local && <p className="hs-split__local">Local preview · no email is sent.</p>}
          {sent && <details className="hs-split__email-preview"><summary>View the email preview & captured inputs</summary><p><strong>Subject:</strong> Your Home Seekers split breakdown</p><p>You wrote {calculatorRand(sent.details.result.gross)} of commission. Your current office kept {calculatorRand(sent.details.result.currentCost)}. Home Seekers would have cost {calculatorRand(sent.details.result.homeSeekersCost)}. The difference is {calculatorRand(sent.details.result.difference)}. All figures exclude VAT.</p>{sent.details.result.difference < 0 && <p><strong>On these numbers, you’re better off where you are.</strong></p>}<pre>{JSON.stringify({ source: sent.source, outcome: sent.outcome, ...sent.details }, null, 2)}</pre></details>}
          {local && <details className="hs-split__preview-tools"><summary>Preview details</summary><p>Submissions and test events stay in this browser. No CRM updates or email delivery.</p><small>{previewRecords.length} calculator email {previewRecords.length === 1 ? 'capture' : 'captures'} saved locally.</small></details>}
        </div>
      <div className="hs-split__conversation">
        <h3>Prefer a conversation?</h3>
        <div className="hs-split__next-actions"><button type="button" onClick={onSession} aria-haspopup="dialog">Book a seat on the next session<ArrowRight size={18} aria-hidden="true" /></button><button type="button" onClick={onQualify} aria-haspopup="dialog">See if you qualify for a one on one<ArrowRight size={18} aria-hidden="true" /></button></div>
      </div>
    </div>
    <div className="hs-split__pricing-footer">
      <p className="hs-split__price-note"><strong>Prepaid: R9 000 a month + R1 500 per registered sale.</strong><span>Other options: R100 000 a year upfront, or R10 000 a month paid from registered deals. All fees exclude VAT.</span></p>
      <a href="#fees">Full price list<ArrowRight size={15} aria-hidden="true" /></a>
    </div>
  </section>
}
