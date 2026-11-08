import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useId } from 'react'
import { getBuyerQualificationReadiness } from '../../services/buyerIntakeModel.js'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import BuyerQualificationFields from './BuyerQualificationFields.jsx'

export default function BuyerQualificationDialog({ open, buyerName, form, onChange, onClose, onSubmit, saving = false, error = '' }) {
  const formId = useId()
  const readiness = getBuyerQualificationReadiness(form)
  return <Modal
    open={open}
    title="Complete buyer qualification"
    subtitle={buyerName ? `Confirm the details for ${buyerName}, then move the journey forward.` : 'Confirm the buyer’s details, then move the journey forward.'}
    className="!max-w-3xl"
    onClose={saving ? undefined : onClose}
    footer={<div className="flex w-full flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-[#60758b]">{readiness.answeredCount} answers ready to save · {readiness.minimumCount} needed</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" form={formId} disabled={saving || !readiness.complete}><CheckCircle2 className="h-4 w-4" />{saving ? 'Saving…' : 'Save and complete'}</Button>
      </div>
    </div>}
  >
    {error ? <div role="alert" className="flex gap-3 rounded-xl border border-[#f1d5b0] bg-[#fffbf2] p-4 text-sm text-[#794b16]">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div><p className="font-semibold">Qualification needs your attention</p><p className="mt-1 leading-5">{error}</p></div>
    </div> : null}
    <p className="mt-3 text-sm leading-5 text-[#60758b]">Available lead details are filled in below. Confirm at least two answers about budget, area, timing or finance, then save to complete this step. Property preferences and call notes are extra context.</p>
    <form id={formId} onSubmit={onSubmit}>
      <BuyerQualificationFields id={`${formId}-fields`} form={form} onChange={onChange} disabled={saving} />
    </form>
  </Modal>
}
