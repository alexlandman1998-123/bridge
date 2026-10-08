import { useState } from 'react'
import { DemoInsurancePromotion } from './DemoInsuranceComponents'
import DemoBondLifeSection from './DemoBondLifeSection'
import DemoInsuranceWorkspace from './DemoInsuranceWorkspace'
import './demo-insurance-preview.css'

const palettes = {
  'Only Realty': { primaryColour: '#0a173e', secondaryColour: '#111b36', accentColour: '#ad244a' },
  'Light brand': { primaryColour: '#f4cc23', secondaryColour: '#f4cc23', accentColour: '#101820' },
}

export default function DemoInsurancePreview() {
  const [palette, setPalette] = useState('Only Realty')
  const theme = palettes[palette]

  function exploreHomeCover() {
    document.getElementById('preview-home-quotes').scrollIntoView({ behavior: 'instant', block: 'start' })
    document.getElementById('preview-home-quotes').focus({ preventScroll: true })
  }

  return <main className="insurance-preview">
    <header className="insurance-preview-header"><div><p className="insurance-preview-kicker">Arch9 · Component preview</p><h1>Cover that feels simple.</h1><p>Vermillion product concepts and illustrative home insurance quotes.</p></div>
      <label>Brand palette<select value={palette} onChange={event => setPalette(event.target.value)}>{Object.keys(palettes).map(name => <option key={name}>{name}</option>)}</select></label>
    </header>
    <DemoInsurancePromotion theme={theme} onExplore={exploreHomeCover} />
    <DemoBondLifeSection theme={theme} />
    <section id="preview-home-quotes" tabIndex={-1} className="insurance-preview-home" aria-label="Home insurance preview">
      <DemoInsuranceWorkspace theme={theme} propertyAddress="2 Pine Avenue, Unit 4, Sea Point, Cape Town" />
    </section>
    <footer className="insurance-preview-footer">Insurance component preview · Sample data only · Fixed-rate repayment illustration.</footer>
  </main>
}
