import { resolveCanonicalDocumentRequestsForScenario } from '../../core/documents/documentRequestCanonicalMatrix.js'
import { transactionPartyMissingDetails, transactionPartyDocumentSubjects } from '../../core/transactions/transactionPartyProfile.js'

export default function TransactionPartyDocumentPreview({ parties, financeType, sellerHasExistingBond = false }) {
  const requirements = resolveCanonicalDocumentRequestsForScenario({ transactionParties: parties, financeType, sellerHasExistingBond }, { includePendingPolicy: true })
  const missing = [...transactionPartyMissingDetails(parties.buyer, 'Buyer'), ...transactionPartyMissingDetails(parties.seller, 'Seller')]
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Party document requirements">
    <h3 className="font-semibold text-slate-800">Documents for these parties</h3>
    <p className="text-sm text-slate-600">This list uses the current document checklist. Changing the entity or marriage details updates it. Capturing a person does not mark their documents as received.</p>
    <div className="grid gap-4 sm:grid-cols-2">{['buyer', 'seller'].map((side) => <div key={side}><h4 className="mb-2 font-medium capitalize">{side}</h4><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{requirements.filter((requirement) => requirement.requestedFrom === side || requirement.ownerRole === side).map((requirement) => <li key={requirement.key}>{requirement.label}{requirement.level.startsWith('pending_policy_') ? ' (awaiting checklist approval)' : ''}{transactionPartyDocumentSubjects(requirement.key, parties).length ? ` — ${transactionPartyDocumentSubjects(requirement.key, parties).map((person) => person.name || 'Unnamed person').join(', ')}` : ''}</li>)}</ul></div>)}</div>
    {missing.length ? <p className="text-sm text-amber-800">Some party details are still unconfirmed. Complete them to finalise the document list.</p> : null}
  </section>
}
