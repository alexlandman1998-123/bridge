import { Check, CheckCircle2 } from 'lucide-react'
import Modal from '../../ui/Modal'
import { demoInsuranceBrandStyle } from '../insurance/demoInsuranceTheme'
import './demo-home-support.css'

export function DemoSupportDialog({ theme, title, steps, stage, onClose, children }) {
  return <Modal open onClose={onClose} title={title} subtitle="Here when you need us." className="demo-home-support-dialog">
    <div className="demo-home-support" style={demoInsuranceBrandStyle(theme)}>
      <p className="demo-home-support-notice">Demo only. No claim is sent and no assistance is dispatched.</p>
      {stage < steps.length ? <ol className="demo-home-support-steps" aria-label={`${title} steps`}>{steps.map((label, index) => <li key={label} aria-current={stage === index ? 'step' : undefined} data-complete={stage > index}><span>{stage > index ? <Check size={14} aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol> : null}
      {children}
    </div>
  </Modal>
}

export function DemoSupportReceipt({ reference, title, description, stages, children }) {
  return <div className="demo-home-support-receipt">
    <div className="demo-home-support-success"><span><CheckCircle2 size={32} strokeWidth={1.4} aria-hidden="true" /></span><div><p className="demo-home-support-eyebrow">Simulation complete</p><h4>{title}</h4><p>{description}</p></div></div>
    <div className="demo-home-support-reference"><span>Your demo reference</span><strong>{reference}</strong><span className="demo-home-support-status">Created locally</span></div>
    {children}
    <ol className="demo-home-support-timeline" aria-label="Illustrative progress">{stages.map((label, index) => <li key={label} data-complete={index === 0}><span>{index === 0 ? <Check size={14} aria-hidden="true" /> : index + 1}</span><div><strong>{label}</strong><small>{index === 0 ? 'Demo step complete' : 'Not started in this demo'}</small></div></li>)}</ol>
  </div>
}
