import { createContext, useContext, useId, useRef, useState } from 'react'
import { ArrowRight, FileHeart, LifeBuoy } from 'lucide-react'
import { demoInsuranceBrandStyle } from '../insurance/demoInsuranceTheme'
import DemoClaimFlow from './DemoClaimFlow'
import DemoEmergencyFlow from './DemoEmergencyFlow'
import './demo-home-support.css'

const DemoHomeSupportContext = createContext(null)

// In-memory only: references survive page navigation within this buyer demo.
export function DemoHomeSupportProvider({ children }) {
  const [records, setRecords] = useState({ claim: null, assist: null })
  const sequence = useRef(1000)
  function createRecord(kind, details) {
    const record = { ...details, reference: `DEMO-${kind === 'claim' ? 'CLM' : 'AST'}-${++sequence.current}` }
    setRecords(current => ({ ...current, [kind]: record }))
    return record
  }
  return <DemoHomeSupportContext.Provider value={{ records, createRecord }}>{children}</DemoHomeSupportContext.Provider>
}

export default function DemoHomeSupport({ theme, propertyAddress = '', includeClaim = false }) {
  const id = useId()
  const shared = useContext(DemoHomeSupportContext)
  // The standalone component previews and focused tests can run without a provider.
  const [localRecords, setLocalRecords] = useState({ claim: null, assist: null })
  const localSequence = useRef(1000)
  const [dialog, setDialog] = useState(null)
  const records = shared?.records || localRecords

  function createRecord(kind, details) {
    if (shared) return shared.createRecord(kind, details)
    const record = { ...details, reference: `DEMO-${kind === 'claim' ? 'CLM' : 'AST'}-${++localSequence.current}` }
    setLocalRecords(current => ({ ...current, [kind]: record }))
    return record
  }

  return <section className="demo-home-support demo-home-support-panel" style={demoInsuranceBrandStyle(theme)} aria-labelledby={`${id}-heading`} data-home-support-source="demo">
    <div className="demo-home-support-panel-heading"><h3 id={`${id}-heading`}>Here when you need us.</h3><span>Explore with sample details</span></div>
    <div className="demo-home-support-actions" data-single={!includeClaim}>
      {includeClaim ? <button type="button" className="demo-home-support-action" onClick={() => setDialog({ kind: 'claim', receipt: false })}><span className="demo-home-support-action-icon"><FileHeart size={28} strokeWidth={1.4} aria-hidden="true" /></span><span><strong>Submit a claim</strong><span>Something happened? Take the next step.</span></span><ArrowRight size={20} aria-hidden="true" /></button> : null}
      <button type="button" className="demo-home-support-action demo-home-support-action-assist" onClick={() => setDialog({ kind: 'assist', receipt: false })}><span className="demo-home-support-action-icon"><LifeBuoy size={30} strokeWidth={1.4} aria-hidden="true" /></span><span><strong>Emergency assist</strong><span>Plumbing, electrical or a lockout. Help starts here.</span></span><ArrowRight size={20} aria-hidden="true" /></button>
    </div>
    {(includeClaim && records.claim) || records.assist ? <div className="demo-home-support-recent" aria-label="Your demo requests">{['claim', 'assist'].filter(kind => records[kind] && (kind !== 'claim' || includeClaim)).map(kind => <button key={kind} type="button" onClick={() => setDialog({ kind, receipt: true })}><span><strong>{kind === 'claim' ? 'Demo claim' : `${records[kind].service.label} · demo assistance`}</strong><span>{records[kind].reference} · Created locally</span></span><span>View {kind === 'claim' ? 'claim' : 'request'}<ArrowRight size={16} aria-hidden="true" /></span></button>)}</div> : null}
    {dialog?.kind === 'claim' ? <DemoClaimFlow theme={theme} propertyAddress={propertyAddress} existingRecord={dialog.receipt ? records.claim : null} onCreate={createRecord} onClose={() => setDialog(null)} /> : null}
    {dialog?.kind === 'assist' ? <DemoEmergencyFlow theme={theme} propertyAddress={propertyAddress} existingRecord={dialog.receipt ? records.assist : null} onCreate={createRecord} onClose={() => setDialog(null)} /> : null}
  </section>
}
