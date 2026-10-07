import { ArrowRight, Boxes, House, MapPin, Truck, Wrench } from 'lucide-react'
import { demoInsuranceBrandStyle } from '../insurance/demoInsuranceTheme'
import '../insurance/demo-insurance.css'
import './demo-home-services.css'

export function DemoHomeServicesHero({ theme, kind, propertyAddress = '' }) {
  const maintenance = kind === 'maintenance'
  const Icon = maintenance ? Wrench : Truck
  return <header className="demo-insurance demo-insurance-promotion home-services-hero" style={demoInsuranceBrandStyle(theme)}>
    <div className="demo-insurance-promotion-layout">
      <div className="demo-insurance-promotion-copy">
        <span className="demo-insurance-eyebrow"><Icon size={16} aria-hidden="true" />{maintenance ? 'A little care goes a long way' : 'Your next chapter, in motion'}</span>
        <h2>{maintenance ? 'Make yourself at home.' : 'New keys.\nA smooth move.'}</h2>
        <p>{maintenance ? 'From the first little fix to a fresh coat of paint. Find the right hands for your home.' : 'From your old front door to your new one. Find a move that fits your life.'}</p>
        {propertyAddress ? <p className="demo-insurance-promotion-property"><MapPin size={16} aria-hidden="true" />{propertyAddress}</p> : null}
      </div>
      <div className="home-services-hero-art" aria-hidden="true">
        <div className="demo-insurance-promotion-orbit" />
        {maintenance ? <>
          <span className="home-services-art-main"><House size={94} strokeWidth={1} /></span>
          <span className="home-services-art-small"><Wrench size={35} strokeWidth={1.3} /></span>
          <span className="home-services-art-caption">A home. Well cared for.</span>
        </> : <>
          <span className="home-services-art-main"><Truck size={108} strokeWidth={1} /></span>
          <span className="home-services-art-small"><Boxes size={36} strokeWidth={1.3} /></span>
          <span className="home-services-art-caption">Good things are on the move.</span>
        </>}
      </div>
    </div>
  </header>
}

export function DemoTruckIllustration({ size = 'medium' }) {
  const length = size === 'small' ? 76 : size === 'medium' ? 108 : 136
  return <svg className="home-services-truck-art" viewBox="0 0 240 130" fill="none" aria-hidden="true" focusable="false">
    <path d="M16 109h210" stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5" strokeLinecap="round" />
    <rect x={172 - length} y="25" width={length} height="70" rx="5" fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeWidth="2" />
    <path d="M172 52h26l21 26v17h-47V52Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M180 59h15l12 17h-27V59Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d={`M${181 - length} 34v51M${190 - length} 34v51`} stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5" />
    <circle cx={195 - length} cy="97" r="11" fill="white" stroke="currentColor" strokeWidth="2" /><circle cx="199" cy="97" r="11" fill="white" stroke="currentColor" strokeWidth="2" />
    <circle cx={195 - length} cy="97" r="3" fill="currentColor" /><circle cx="199" cy="97" r="3" fill="currentColor" />
    <path d="M21 65h20M26 76h15" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" strokeLinecap="round" />
  </svg>
}

export function DemoRouteSummary({ from, to }) {
  return <div className="home-services-route-summary">
    <div><span>From</span><strong>{from}</strong></div>
    <ArrowRight size={22} aria-hidden="true" />
    <div><span>To</span><strong>{to}</strong></div>
  </div>
}
