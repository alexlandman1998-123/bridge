import { useId, useRef, useState } from 'react'
import { ArrowRight, Check, Clock3, Droplets, Leaf, MapPin, PaintRoller, Sparkles, Wrench, Zap } from 'lucide-react'
import Modal from '../../ui/Modal'
import DemoHomeSupport from '../support/DemoHomeSupport'
import { demoInsuranceBrandStyle } from '../insurance/demoInsuranceTheme'
import { DemoHomeServicesHero } from './DemoHomeServicesVisuals'
import { HOME_SERVICES_NOTICE, MAINTENANCE_CATEGORIES } from './demoHomeServicesData'

const categoryIcons = { plumbing: Droplets, electrical: Zap, painting: PaintRoller, cleaning: Sparkles, garden: Leaf }
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export default function DemoMaintenanceWorkspace({ theme, propertyAddress = '' }) {
  const id = useId()
  const tabs = useRef([])
  const [categoryId, setCategoryId] = useState('plumbing')
  const [providerId, setProviderId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const category = MAINTENANCE_CATEGORIES.find(item => item.id === categoryId)
  const provider = category.providers.find(item => item.id === providerId)
  const service = category.services.find(item => item.id === serviceId)
  const Icon = categoryIcons[categoryId]

  function changeCategory(nextId) {
    setCategoryId(nextId)
    setProviderId('')
    setServiceId('')
  }

  function moveTab(event, index) {
    const count = MAINTENANCE_CATEGORIES.length
    const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null
    if (next === null) return
    event.preventDefault()
    changeCategory(MAINTENANCE_CATEGORIES[next].id)
    tabs.current[next]?.focus()
  }

  return <section className="home-services-workspace" style={demoInsuranceBrandStyle(theme)} data-home-services-source="demo">
    <DemoHomeServicesHero theme={theme} kind="maintenance" propertyAddress={propertyAddress} />
    <DemoHomeSupport theme={theme} propertyAddress={propertyAddress} />
    <div className="home-services-category-tabs" role="tablist" aria-label="Maintenance categories">
      {MAINTENANCE_CATEGORIES.map((item, index) => {
        const CategoryIcon = categoryIcons[item.id]
        return <button key={item.id} type="button" role="tab" ref={element => { tabs.current[index] = element }} id={`${id}-${item.id}`} aria-controls={`${id}-providers`} aria-selected={categoryId === item.id} tabIndex={categoryId === item.id ? 0 : -1} onClick={() => changeCategory(item.id)} onKeyDown={event => moveTab(event, index)}><CategoryIcon size={22} strokeWidth={1.6} aria-hidden="true" />{item.label}</button>
      })}
    </div>
    <div role="tabpanel" id={`${id}-providers`} aria-labelledby={`${id}-${categoryId}`} tabIndex={0}>
      <div className="home-services-provider-grid">
        {category.providers.map((item, index) => {
          const from = Math.min(...category.services.map(entry => entry.labour + entry.materials)) + item.callout
          return <button type="button" key={item.id} className={`home-services-provider home-services-category-${categoryId}`} onClick={() => { setProviderId(item.id); setServiceId('') }} aria-label={`View ${item.name} services`}>
            <span className="home-services-provider-cover" data-variant={index} aria-hidden="true"><span className="home-services-provider-monogram">{item.initials}</span><Icon size={82} strokeWidth={.9} /><span className="home-services-provider-cover-label">{category.label}</span></span>
            <span className="home-services-provider-body"><strong className="home-services-provider-name">{item.name}</strong><span className="home-services-provider-description">{item.description}</span><span className="home-services-provider-area"><MapPin size={14} aria-hidden="true" />{item.area}</span><span className="home-services-provider-price">From <strong>{money.format(from)}</strong><span>/ service</span></span><span className="home-services-card-action">View {category.services.length} services<ArrowRight size={18} aria-hidden="true" /></span></span>
          </button>
        })}
      </div>
    </div>
    <p className="home-services-footnote">{HOME_SERVICES_NOTICE}</p>

    <Modal open={Boolean(provider)} onClose={() => setProviderId('')} title={provider?.name || 'Maintenance services'} subtitle="Choose a service to explore a sample estimate." className="home-services-dialog">
      {provider ? <div className="home-services-dialog-content" style={demoInsuranceBrandStyle(theme)}>
        <div className="home-services-provider-intro"><span className={`home-services-category-icon home-services-category-${categoryId}`}><Icon size={28} strokeWidth={1.5} aria-hidden="true" /></span><div><strong>{category.label}, made simple.</strong><p>{provider.description}</p></div></div>
        <div className="home-services-estimate-layout">
          <fieldset className="home-services-service-list"><legend>Select a service</legend>{category.services.map(item => <label key={item.id} className="home-services-service-option" data-selected={serviceId === item.id}><input type="radio" name={`${id}-service`} value={item.id} checked={serviceId === item.id} onChange={() => setServiceId(item.id)} /><span><strong>{item.name}</strong><span>{item.detail}</span><small><Clock3 size={13} aria-hidden="true" />{item.duration}</small></span><Check className="home-services-service-check" size={17} aria-hidden="true" /></label>)}</fieldset>
          <section className="home-services-estimate" aria-label="Service estimate" aria-live="polite" aria-atomic="true">
            {service ? <><span className="home-services-eyebrow">Your sample estimate</span><h4>{service.name}</h4><p className="home-services-total">{money.format(service.labour + service.materials + provider.callout)}</p><span className="home-services-estimate-caption">Estimated once-off total</span><dl><div><dt>Labour</dt><dd>{money.format(service.labour)}</dd></div><div><dt>Materials</dt><dd>{service.materials ? money.format(service.materials) : 'Not included'}</dd></div><div><dt>Call-out</dt><dd>{money.format(provider.callout)}</dd></div></dl><p className="home-services-estimate-note">Scope and final price would be confirmed before any work starts.</p></> : <div className="home-services-estimate-empty"><Wrench size={42} strokeWidth={1.2} aria-hidden="true" /><h4>A little clarity on cost.</h4><p>Choose a service to see the estimated total and what goes into it.</p></div>}
          </section>
        </div>
        <p className="home-services-footnote">{HOME_SERVICES_NOTICE}</p>
      </div> : null}
    </Modal>
  </section>
}
