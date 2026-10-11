import PropertyDisclosureQuestionnaire from '../onboarding/PropertyDisclosureQuestionnaire.jsx'
import { normalizePropertyDisclosure } from '../../lib/propertyDisclosure.js'

/** Captures answers only. Seller attestation happens on the reviewed document. */
export default function SellerDisclosurePreparation({ disclosure = {}, onChange, disabled = false }) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  const patch = (values) => onChange({ ...normalized, ...values })
  return <section style={{ '--seller-brand-action': '#315879', '--seller-brand-action-soft': '#eef5fb', '--seller-brand-action-softer': '#eef5fb' }} aria-label="Disclosure document answers" className="space-y-3 rounded-xl border border-[#dce6f2] bg-white p-4">
    <h3 className="text-sm font-semibold text-[#243d56]">Prepare disclosure answers</h3>
    <p className="text-sm leading-6 text-[#607387]">Record the seller’s answers before generating this document. Every question needs Yes, No or Unsure. The seller reviews and signs the prepared copy. Capturing these answers does not record a signature.</p>
    <PropertyDisclosureQuestionnaire
      disclosure={normalized}
      disabled={disabled}
      onAnswerChange={(key, answer) => patch({ responses: { ...normalized.responses, [key]: { ...normalized.responses[key], answer } } })}
      onNoteChange={(key, note) => patch({ responses: { ...normalized.responses, [key]: { ...normalized.responses[key], note } } })}
      onDisclosureChange={(key, value) => patch({ [key]: value })}
    />
  </section>
}
