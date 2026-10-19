import { UserRound } from 'lucide-react'
import Button from '../ui/Button'

const types = { individual: 'Individual', married_coc: 'Married', company: 'Company / CC', trust: 'Trust' }
const typeLabel = value => types[value] || value || 'Not captured'

export default function DealSetupPartyOverview({ buyers = [], buyerDetails, purchaserType, sellerDetails, sellerType, onSelectParty }) {
  const activeBuyers = buyers.filter(party => !party.removed_at && party.status !== 'removed')
  const buyerRows = activeBuyers.length ? activeBuyers.map(party => ({
    name: party.participant_name || party.name || '', email: party.participant_email || party.email || '',
    phone: party.participant_phone || party.phone || '', type: party.entity_type || purchaserType,
  })) : [{ ...buyerDetails, type: purchaserType }]
  const groups = [
    { key: 'buyer', title: 'Buyer', people: buyerRows },
    { key: 'seller', title: 'Seller', people: [{ ...sellerDetails, type: sellerType }] },
  ]
  return <div className="grid items-stretch gap-4 md:grid-cols-2">
    {groups.map(group => <section key={group.key} aria-label={`${group.title} summary`} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 p-5"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><UserRound size={20} aria-hidden="true" /></span><h3 className="text-base font-semibold text-slate-950">{group.title}</h3></header>
      <div className="flex-1 divide-y divide-slate-100 px-5">{group.people.map((person, index) => <dl key={index} className="space-y-4 py-5">
        <div><dt className="text-xs text-slate-500">Name</dt><dd className="mt-1 break-words text-base font-semibold text-slate-950">{person.name || 'Not captured'}</dd></div>
        <div><dt className="text-xs text-slate-500">Entity type</dt><dd className="mt-1 text-sm text-slate-800">{typeLabel(person.type)}</dd></div>
        <div><dt className="text-xs text-slate-500">Email</dt><dd className="mt-1 break-all text-sm text-slate-800">{person.email ? <a href={`mailto:${person.email}`} className="hover:text-emerald-700 hover:underline">{person.email}</a> : 'Not captured'}</dd></div>
        <div><dt className="text-xs text-slate-500">Phone</dt><dd className="mt-1 text-sm text-slate-800">{person.phone ? <a href={`tel:${String(person.phone).replace(/[^+\d]/g, '')}`} className="hover:text-emerald-700 hover:underline">{person.phone}</a> : 'Not captured'}</dd></div>
      </dl>)}</div>
      <footer className="border-t border-slate-100 p-4"><Button type="button" variant="secondary" className="w-full justify-center" onClick={() => onSelectParty(group.key)}>{group.title} details</Button></footer>
    </section>)}
  </div>
}
