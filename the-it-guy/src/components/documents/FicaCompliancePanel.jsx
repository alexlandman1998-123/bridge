import { CheckCircle2, CircleAlert, FileCheck2 } from 'lucide-react'
import { buildFicaCompliancePanel } from '../../services/propertyIntelligence/ficaComplianceReviewService.js'

export default function FicaCompliancePanel({ compliance }) {
  const panel = buildFicaCompliancePanel(compliance)
  return <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="FICA compliance review">
    <div className="flex items-center gap-2"><FileCheck2 size={17} className="text-[#1769dc]" /><h3 className="font-semibold text-slate-900">FICA compliance</h3></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{panel.steps.map((step) => <div key={step.label} className="rounded-lg bg-white p-2.5 text-xs"><p className="flex items-center gap-1 font-semibold text-slate-800">{step.status === 'complete' ? <CheckCircle2 size={14} className="text-emerald-600" /> : <CircleAlert size={14} className="text-amber-600" />}{step.label}</p><p className="mt-1 text-slate-500">{step.detail}</p></div>)}</div>
    <p className="mt-3 text-xs text-slate-600">Certificate: <strong>{panel.certificate.detail}</strong></p>
  </section>
}
