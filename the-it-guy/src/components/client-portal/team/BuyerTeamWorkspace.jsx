import {
  Building2,
  CalendarDays,
  ChevronRight,
  FileSignature,
  FileText,
  Lock,
  Mail,
  MessageCircle,
  PhoneCall,
  UserRound,
  Users,
} from 'lucide-react'
import { buyerPortalHexToRgba, createBuyerPortalTheme } from '../buyerPortalTheme'

const ROUTE_ICONS = {
  general: MessageCircle,
  finance: Building2,
  legal: FileSignature,
  documents: FileText,
}

function Avatar({ member, large = false }) {
  const classes = large ? 'h-20 w-20' : 'h-14 w-14'
  return member?.avatar ? (
    <img src={member.avatar} alt={member.name} className={`${classes} shrink-0 rounded-full border border-[#dbe5ef] bg-white object-cover`} />
  ) : (
    <span className={`${classes} grid shrink-0 place-items-center rounded-full border border-[#dbe5ef] bg-[#eef4fb] text-sm font-semibold text-[#35546c]`} aria-hidden="true">{member?.initials || 'TM'}</span>
  )
}

function ContactActions({ member, theme, prominent = false }) {
  if (!member?.canEmail && !member?.canCall) return null
  return (
    <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
      {member.canEmail ? (
        <a href={`mailto:${member.email}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border px-3 text-sm font-semibold" style={prominent ? { backgroundColor: theme.primary, borderColor: theme.primary, color: '#fff' } : { borderColor: buyerPortalHexToRgba(theme.primary, 0.3), color: theme.primary }}><Mail size={15} />Message</a>
      ) : null}
      {member.canCall ? (
        <a href={`tel:${member.phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border bg-white px-3 text-sm font-semibold" style={{ borderColor: buyerPortalHexToRgba(theme.primary, 0.3), color: theme.primary }}><PhoneCall size={15} />Call</a>
      ) : null}
    </div>
  )
}

function TeamMemberCard({ member, theme, prominent = false }) {
  return (
    <article data-team-member={member.id} className="flex h-full flex-col rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <Avatar member={member} large={prominent} />
        <div className="flex flex-col items-end gap-2">
          {member.isMainContact ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase text-sky-700">Main contact</span> : null}
          {member.isActive ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase text-emerald-700">Active now</span> : null}
        </div>
      </div>
      <div className="mt-4"><h3 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">{member.name}</h3><p className="mt-2 text-sm font-semibold text-[#52657b]">{member.role}</p>{member.organisation ? <p className="mt-1 text-sm text-[#6b7d93]">{member.organisation}</p> : null}</div>
      <div className="mt-5 border-t border-[#e4ebf3] pt-5"><p className="text-sm leading-6 text-[#52657b]">{member.description}</p></div>
      {member.note ? <p className="mt-4 rounded-[14px] border border-[#d7eadf] bg-[#f4fbf6] px-3 py-2 text-sm leading-6 text-[#1f6f46]">{member.note}</p> : null}
      {member.currentActivity ? <div className="mt-4 rounded-[14px] p-3.5" style={{ backgroundColor: buyerPortalHexToRgba(theme.primary, 0.07) }}><p className="text-sm font-semibold text-[#142132]"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: theme.primary }} />Current: {member.currentActivity}</p></div> : null}
      <ContactActions member={member} theme={theme} prominent={prominent} />
    </article>
  )
}

function ContactRoute({ route, theme }) {
  const Icon = ROUTE_ICONS[route.key] || Users
  const href = route.member.canEmail ? `mailto:${route.member.email}` : `tel:${route.member.phone}`
  return (
    <a data-contact-route={route.key} href={href} className="flex min-h-[102px] items-center gap-4 rounded-[16px] border border-[#dbe5ef] bg-[#fbfdff] p-4 transition hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.07)]">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border" style={{ borderColor: buyerPortalHexToRgba(theme.primary, 0.18), backgroundColor: buyerPortalHexToRgba(theme.primary, 0.07), color: theme.primary }}><Icon size={21} /></span>
      <div className="min-w-0 flex-1"><p className="text-[0.68rem] font-medium text-[#52657b]">I need help with...</p><h3 className="mt-1 text-sm font-semibold leading-5 text-[#142132]">{route.title}</h3><p className="mt-1 text-xs leading-5 text-[#52657b]">{route.helper}</p></div>
      <ChevronRight size={18} className="shrink-0" style={{ color: theme.primary }} />
    </a>
  )
}

export default function BuyerTeamWorkspace({ model, theme: themeInput }) {
  const theme = themeInput?.primary ? themeInput : createBuyerPortalTheme(themeInput)
  if (model?.isEmpty) {
    return <section data-buyer-team="workspace" data-team-source={model?.source || 'unknown'} className="rounded-[24px] border border-dashed border-[#d5e1ee] bg-white px-6 py-10 text-center"><Users className="mx-auto text-[#7b8ca2]" size={32} /><h1 className="mt-4 text-xl font-semibold text-[#142132]">Your transaction team</h1><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6b7d93]">Your assigned contacts will appear here as the transaction team is confirmed.</p></section>
  }
  const mainContact = model.mainContact
  const activeMember = model.activeMember
  const process = model.currentProcess
  const summaryItems = [
    { label: 'Your main contact', value: mainContact?.name, helper: mainContact?.role, icon: UserRound },
    { label: 'Currently handling your transaction', value: activeMember?.name, helper: activeMember?.role, icon: FileSignature },
    { label: 'Current process', value: process?.title || 'Transaction progress', helper: process?.helper || process?.status || 'Your team will share the next update.', icon: CalendarDays },
  ]

  return (
    <section data-buyer-team="workspace" data-team-source={model?.source || 'unknown'} className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h1 className="text-3xl font-semibold tracking-[-0.06em] text-[#142132]">{model.heading}</h1><p className="mt-2 max-w-3xl text-base leading-6 text-[#52657b]">{model.description}</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dde7f1] bg-white px-4 py-2 text-sm font-semibold text-[#64748b]"><Users size={16} />{model.members.length} team contact{model.members.length === 1 ? '' : 's'}</span></header>

      <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]"><div className="grid gap-4 lg:grid-cols-3 lg:divide-x lg:divide-[#dbe5ef]">{summaryItems.map((item) => { const SummaryIcon = item.icon; return <article key={item.label} className="flex items-start gap-4 lg:px-6 first:lg:pl-0 last:lg:pr-0"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border" style={{ borderColor: buyerPortalHexToRgba(theme.primary, 0.18), backgroundColor: buyerPortalHexToRgba(theme.primary, 0.07), color: theme.primary }}><SummaryIcon size={21} /></span><div><p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{item.label}</p><h2 className="mt-1 text-base font-semibold text-[#142132]">{item.value}</h2><p className="mt-1 text-sm leading-5 text-[#52657b]">{item.helper}</p></div></article> })}</div></section>

      <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)] xl:items-start"><div><h2 className="mb-4 text-lg font-semibold tracking-[-0.04em] text-[#142132]">Your main contact</h2><TeamMemberCard member={mainContact} theme={theme} prominent /></div><div><h2 className="mb-4 text-lg font-semibold tracking-[-0.04em] text-[#142132]">Your specialist team</h2>{model.specialists.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{model.specialists.map((member) => <TeamMemberCard key={member.id} member={member} theme={theme} />)}</div> : <div className="rounded-[22px] border border-dashed border-[#d5e1ee] bg-white p-6 text-sm leading-6 text-[#6b7d93]">Specialist contacts will appear here when they join the transaction.</div>}</div></section>

      {model.routes.length ? <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]"><h2 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">Not sure who to contact?</h2><p className="mt-2 text-sm leading-6 text-[#52657b]">Choose a topic and contact the person responsible for it.</p><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{model.routes.map((route) => <ContactRoute key={route.key} route={route} theme={theme} />)}</div></section> : null}

      <p className="flex items-center justify-center gap-2 text-sm text-[#52657b]"><Lock size={15} />Only authorised parties involved in your transaction can access your information.</p>
    </section>
  )
}
