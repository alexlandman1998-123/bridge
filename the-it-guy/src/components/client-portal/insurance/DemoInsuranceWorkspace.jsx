import { useId, useRef, useState } from 'react'
import { Armchair, ArrowRight, Car, Check, Heart, HeartPulse, House, Layers3, Plus, ShieldCheck } from 'lucide-react'
import Modal from '../../ui/Modal'
import DemoHomeSupport from '../support/DemoHomeSupport'
import { DemoInsurancePromotion, DemoInsuranceQuoteCard, DemoInsuranceQuoteDetails } from './DemoInsuranceComponents'
import { demoInsuranceBrandStyle } from './demoInsuranceTheme'
import { DEMO_ADDITIONAL_COVER, DEMO_HOME_COVER_INTRODUCTION, DEMO_INSURANCE_BUNDLE, DEMO_INSURANCE_CATEGORIES, DEMO_INSURANCE_QUOTES } from './demoInsuranceData'

const coverIcons = { car: Car, life: Heart, gap: HeartPulse }
const categoryIcons = { building: House, contents: Armchair, combined: Layers3 }

export default function DemoInsuranceWorkspace({ theme, propertyAddress = '' }) {
  const id = useId()
  const tabRefs = useRef([])
  const [categoryId, setCategoryId] = useState('combined')
  const [selectedQuote, setSelectedQuote] = useState(null)
  const [selectedCover, setSelectedCover] = useState([])
  const [selectionReady, setSelectionReady] = useState(false)
  const category = DEMO_INSURANCE_CATEGORIES.find(item => item.id === categoryId)
  const choices = DEMO_ADDITIONAL_COVER.filter(item => selectedCover.includes(item.id))

  function selectCategory(nextId) {
    setCategoryId(nextId)
    setSelectedQuote(null)
  }

  function moveTab(event, index) {
    const lastIndex = DEMO_INSURANCE_CATEGORIES.length - 1
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % (lastIndex + 1)
      : event.key === 'ArrowLeft' ? (index + lastIndex) % (lastIndex + 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? lastIndex : null
    if (nextIndex === null) return
    event.preventDefault()
    selectCategory(DEMO_INSURANCE_CATEGORIES[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  function toggleCover(coverId) {
    setSelectedCover(current => current.includes(coverId) ? current.filter(item => item !== coverId) : [...current, coverId])
    setSelectionReady(false)
  }

  return <section className="demo-insurance demo-insurance-workspace" style={demoInsuranceBrandStyle(theme)} data-insurance-source="demo">
    <DemoInsurancePromotion theme={theme} content={DEMO_HOME_COVER_INTRODUCTION} showAction={false} propertyAddress={propertyAddress} />
    <DemoHomeSupport theme={theme} propertyAddress={propertyAddress} includeClaim />

    <div className="demo-insurance-home-quotes">
      <div className="demo-insurance-cover-tabs" role="tablist" aria-label="Home insurance cover">
        {DEMO_INSURANCE_CATEGORIES.map((item, index) => {
          const Icon = categoryIcons[item.id]
          return <button key={item.id} ref={element => { tabRefs.current[index] = element }} type="button" role="tab" id={`${id}-${item.id}`} aria-selected={item.id === categoryId} aria-controls={`${id}-quotes`} tabIndex={item.id === categoryId ? 0 : -1} onClick={() => selectCategory(item.id)} onKeyDown={event => moveTab(event, index)}><span className="demo-insurance-cover-tab-icon" aria-hidden="true"><Icon size={24} strokeWidth={1.6} /></span><span>{item.label}</span></button>
        })}
      </div>
      <div role="tabpanel" id={`${id}-quotes`} aria-labelledby={`${id}-${categoryId}`} tabIndex={0} className="demo-insurance-quote-panel">
        <div className="demo-insurance-quote-grid">
          {DEMO_INSURANCE_QUOTES.filter(quote => quote.category === categoryId).map(quote => <DemoInsuranceQuoteCard key={quote.id} theme={theme} quote={quote} onViewQuote={setSelectedQuote} />)}
        </div>
      </div>
    </div>

    <section className="demo-insurance-promotion demo-insurance-bundle" aria-labelledby={`${id}-bundle`}>
      <div className="demo-insurance-promotion-layout">
        <div className="demo-insurance-promotion-copy">
          <p className="demo-insurance-eyebrow"><Layers3 size={16} aria-hidden="true" />A little more peace of mind</p>
          <h2 id={`${id}-bundle`}>{DEMO_INSURANCE_BUNDLE.title}</h2>
          <p>{DEMO_INSURANCE_BUNDLE.description}</p>
        </div>
        <div className="demo-insurance-bundle-art" aria-hidden="true">
          <div className="demo-insurance-promotion-orbit" />
          <span className="demo-insurance-bundle-art-home"><House size={48} strokeWidth={1.3} /></span>
          <span className="demo-insurance-bundle-art-car"><Car size={48} strokeWidth={1.3} /></span>
          <span className="demo-insurance-bundle-art-life"><Heart size={40} strokeWidth={1.3} /></span>
        </div>
      </div>
    </section>
    <div className="demo-insurance-additional">
      <fieldset>
        <legend className="sr-only">Additional insurance cover</legend>
        <div className="demo-insurance-additional-grid">
          {DEMO_ADDITIONAL_COVER.map(item => {
            const Icon = coverIcons[item.id]
            const selected = selectedCover.includes(item.id)
            return <label key={item.id} className={`demo-insurance-additional-option demo-insurance-additional-option-${item.id}`}>
              <span className="demo-insurance-additional-top"><span className="demo-insurance-additional-icon"><Icon size={32} strokeWidth={1.5} aria-hidden="true" /></span><input type="checkbox" checked={selected} onChange={() => toggleCover(item.id)} aria-label={item.label} /></span>
              <span className="demo-insurance-additional-copy"><strong>{item.label}</strong><span>{item.description}</span></span>
              <span className="demo-insurance-additional-state"><span>{selected ? 'Added to selection' : 'Add to selection'}</span>{selected ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}</span>
            </label>
          })}
        </div>
      </fieldset>
      <button type="button" className="demo-insurance-button" disabled={!choices.length || selectionReady} onClick={() => setSelectionReady(true)}>{DEMO_INSURANCE_BUNDLE.actionLabel}<ArrowRight size={16} aria-hidden="true" /></button>
      {selectionReady ? <p className="demo-insurance-selection-summary" role="status">Demo selection ready: {choices.map(item => item.label).join(', ')}. A personalised quote would use your details with your permission. Nothing has been sent.</p> : null}
    </div>
    <p className="demo-insurance-notice">{DEMO_HOME_COVER_INTRODUCTION.notice}</p>

    <Modal open={Boolean(selectedQuote)} onClose={() => setSelectedQuote(null)} title={selectedQuote ? `${selectedQuote.insurer} · ${category.label}` : 'Home cover quote'} subtitle="Illustrative demo quote" className="demo-insurance-quote-dialog">
      {selectedQuote ? <DemoInsuranceQuoteDetails theme={theme} quote={selectedQuote} /> : null}
    </Modal>
  </section>
}
