import { sellerContactEmail } from '../../../core/clientPortal/sellerContactDetails.js'
import { Mail, PhoneCall, UserRound } from 'lucide-react'

function ContactCard({ member, agencyName, primary = false }) {
  const email = sellerContactEmail(member?.email)
  return <article className="min-w-0 rounded-[20px] border border-[#dbe5ef] bg-white p-5 sm:p-6">
    <div className="flex items-start gap-4">
      {member?.avatar ? <img src={member.avatar} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" /> : <span aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e6f2ef] font-semibold text-[#123f3a]">{member?.initials || <UserRound size={24} />}</span>}
      <div className="min-w-0"><p className="text-xs font-semibold text-[#64748b]">{primary ? 'Your agent · Main contact' : member.role}</p><h2 className="mt-1 break-words text-xl font-semibold text-[#142132]">{member?.name || 'Agent details not yet available'}</h2>{member?.organisation || agencyName ? <p className="mt-2 break-words text-sm text-[#64748b]">{member?.organisation || agencyName}</p> : null}</div>
    </div>
    <p className="mt-4 text-sm leading-6 text-[#52657b]">{member?.description || 'Your assigned agent’s contact details will appear here when available.'}</p>
    {email || member?.phone ? <div className="mt-5 grid gap-3 border-t border-[#e4ebf2] pt-4">
      {email ? <a href={`mailto:${email}`} className="inline-flex min-h-11 min-w-0 items-center gap-3 text-sm text-[#123f3a]"><Mail size={18} className="shrink-0" /><span className="break-all">{email}</span></a> : null}
      {member.phone ? <a href={`tel:${member.phone}`} className="inline-flex min-h-11 items-center gap-3 text-sm text-[#123f3a]"><PhoneCall size={18} className="shrink-0" />{member.phone}</a> : null}
    </div> : null}
  </article>
}

export default function SellerTeamWorkspace({ model, agencyName = '', hasTransaction = false }) {
  const members = model?.members || []
  const agent = members.find((member) => member.role === 'Estate Agent')
  const legalTeam = members.filter((member) => /attorney|conveyanc|secretary/i.test(member.role))
  return <section aria-label="Your team" className="space-y-5">
    <header><h1 className="text-2xl font-semibold tracking-tight text-[#142132] sm:text-3xl">Your Team</h1><p className="mt-2 text-sm leading-6 text-[#52657b]">Your contacts for listing updates, documents and transfer.</p></header>
    <ContactCard member={agent} agencyName={agencyName} primary />
    {legalTeam.length ? <section><h2 className="mb-3 text-lg font-semibold text-[#142132]">Your legal team</h2><div className="grid gap-4 md:grid-cols-2">{legalTeam.map((member) => <ContactCard key={member.id} member={member} />)}</div></section> : <p role="status" className="rounded-[16px] border border-[#dbe5ef] bg-white p-5 text-sm leading-6 text-[#52657b]">{hasTransaction ? 'Your legal contacts will appear here once their assignment details are available.' : 'Your legal team will appear here when a transaction is opened and an attorney is assigned.'}</p>}
  </section>
}
