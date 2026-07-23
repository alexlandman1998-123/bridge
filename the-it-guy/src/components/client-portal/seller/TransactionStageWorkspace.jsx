/* eslint-disable react-refresh/only-export-components -- stage registry and resolver intentionally live beside the reusable workspace */
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  FileCheck2,
  FileSignature,
  FileText,
  Landmark,
  MessageCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const COMMON_RESOURCES = [
  { title: 'Understanding the conveyancing process', href: '/bridge/resources#seller-guides' },
  { title: 'What happens after the OTP?', href: '/bridge/resources#seller-guides' },
  { title: 'Typical transfer timelines explained', href: '/bridge/resources#seller-guides' },
  { title: 'Common questions from sellers', href: '/bridge/resources#seller-guides' },
]

export const SELLER_TRANSACTION_STAGE_ORDER = [
  'otp',
  'offer_accepted',
  'instruction_sent',
  'attorney_opening_file',
  'fica_verification',
  'transfer_documents',
  'bond_approval',
  'guarantees',
  'lodgement',
  'registration',
  'completed',
]

export const SELLER_TRANSACTION_STAGE_DEFINITIONS = {
  otp: {
    title: 'Offer to Purchase',
    shortLabel: 'OTP',
    icon: FileSignature,
    description: 'Your seller file is ready and the next sale milestone is an Offer to Purchase.',
    detail: 'Your agent is marketing the property, coordinating buyer interest and will present any offers for your review.',
    duration: { min: null, max: null, label: 'Until an offer is accepted' },
    bullets: ['Marketing the property to buyers', 'Following up on buyer interest', 'Preparing offers for your review'],
    reassurance: 'No offer has been accepted yet. You remain in control of which offer, if any, you choose to accept.',
    faqs: [
      ['Has my property been sold?', 'Not yet. A sale moves forward only after you accept and sign an Offer to Purchase.'],
      ['What happens when an offer arrives?', 'Your agent will present the terms, explain any conditions and help you decide whether to accept, reject or counter.'],
      ['Do I need to do anything now?', 'No action is required unless your agent shares an offer or asks for additional information.'],
    ],
    resources: COMMON_RESOURCES,
  },
  offer_accepted: {
    title: 'Offer Accepted',
    shortLabel: 'Offer Accepted',
    icon: FileSignature,
    description: 'The Offer to Purchase has been accepted and the sale can now move into the legal transfer process.',
    detail: 'Your agent is finalising the signed agreement and making sure every condition is clearly recorded before instruction.',
    duration: { min: 1, max: 2, label: '1 – 2 business days' },
    bullets: ['Confirming the signed agreement', 'Checking suspensive conditions', 'Preparing the instruction pack'],
    reassurance: 'Your agent and transaction team are coordinating the handover into the legal process.',
    faqs: [
      ['Is the property sold now?', 'The offer is accepted, but any suspensive conditions still need to be fulfilled before the sale becomes unconditional.'],
      ['What are suspensive conditions?', 'These are conditions written into the offer, such as bond approval or the sale of another property.'],
      ['Do I need to contact the buyer?', 'No. Your agent will coordinate communication and keep both parties aligned.'],
    ],
    resources: COMMON_RESOURCES,
  },
  instruction_sent: {
    title: 'Instruction Sent',
    shortLabel: 'Instruction Sent',
    icon: FileCheck2,
    description: 'Your conveyancing attorney has received the instruction to begin preparing your transfer.',
    detail: 'This officially starts the legal transfer process.',
    duration: { min: 1, max: 3, label: '1 – 3 business days' },
    bullets: ['Opening the transfer file', 'Verifying all parties', 'Requesting initial documentation', 'Preparing the legal transfer process'],
    reassurance: 'This stage happens mostly behind the scenes, so there may not be visible activity every day.',
    faqs: [
      ["Why haven’t I heard anything?", 'Your estate agent and attorney are preparing the file and confirming the instruction details.'],
      ['Can delays happen?', 'Missing documents, municipal information or outstanding conditions can extend this stage.'],
      ['Do I need to contact anyone?', 'No. We will notify you if the team needs anything from you.'],
    ],
    resources: COMMON_RESOURCES,
  },
  attorney_opening_file: {
    title: 'Attorney Opening File',
    shortLabel: 'Attorney Opens File',
    icon: Scale,
    description: 'The transferring attorney is creating the formal legal file and validating the sale information.',
    detail: 'This gives the legal team the information they need to prepare documents and begin compliance checks.',
    duration: { min: 2, max: 5, label: '2 – 5 business days' },
    bullets: ['Capturing the sale agreement', 'Confirming seller and buyer details', 'Checking property information', 'Preparing the first legal requests'],
    reassurance: 'The file is being built carefully so later transfer steps can move without avoidable delays.',
    faqs: [
      ['Why does the attorney need my details again?', 'The attorney must independently verify the parties and keep a compliant legal record.'],
      ['When will I receive documents?', 'The attorney will send documents once the file and initial checks are ready.'],
      ['Can I use a different attorney?', 'The transferring attorney is normally appointed by the seller, subject to the sale agreement.'],
    ],
    resources: COMMON_RESOURCES,
  },
  fica_verification: {
    title: 'FICA Verification',
    shortLabel: 'FICA Verification',
    icon: ShieldCheck,
    description: 'The transaction team is completing the identity and compliance checks required by law.',
    detail: 'Your identity, address and source information must be verified before transfer documents can be finalised.',
    duration: { min: 2, max: 5, label: '2 – 5 business days' },
    bullets: ['Reviewing identity documents', 'Confirming proof of address', 'Completing compliance screening', 'Following up on missing information'],
    reassurance: 'Clear, current documents are the fastest way to keep this stage moving.',
    faqs: [
      ['Why is FICA required?', 'Attorneys and property professionals must verify clients under South African financial intelligence legislation.'],
      ['How recent must proof of address be?', 'Most teams require a document issued within the last three months.'],
      ['Are my documents secure?', 'Your documents remain in the secure transaction workspace and are shared only with authorised role players.'],
    ],
    resources: COMMON_RESOURCES,
  },
  transfer_documents: {
    title: 'Transfer Documents',
    shortLabel: 'Transfer Documents',
    icon: FileText,
    description: 'The transferring attorney is preparing the legal documents required to transfer ownership.',
    detail: 'You may be asked to review, sign or provide supporting information during this stage.',
    duration: { min: 5, max: 10, label: '5 – 10 business days' },
    bullets: ['Drafting transfer documents', 'Obtaining signatures', 'Applying for rates figures', 'Coordinating compliance certificates'],
    reassurance: 'Several third parties contribute here, so updates may arrive in batches rather than every day.',
    faqs: [
      ['Where do I sign?', 'Your attorney will arrange secure electronic signing or an appointment if originals are required.'],
      ['What are rates figures?', 'The municipality calculates amounts needed for a rates clearance certificate.'],
      ['Can documents be corrected?', 'Yes. Tell your attorney immediately if any personal or property information is incorrect.'],
    ],
    resources: COMMON_RESOURCES,
  },
  bond_approval: {
    title: 'Bond Approval',
    shortLabel: 'Bond Approval',
    icon: Landmark,
    description: 'The buyer’s finance is being finalised with the lender and bond registration team.',
    detail: 'This stage only applies when the sale depends on mortgage finance.',
    duration: { min: 5, max: 14, label: '5 – 14 business days' },
    bullets: ['Finalising lender conditions', 'Preparing bond documents', 'Coordinating bond and transfer attorneys', 'Confirming approval milestones'],
    reassurance: 'Finance timing is managed by the buyer’s bank and originator; your team will monitor it for you.',
    faqs: [
      ['Can I see the buyer’s application?', 'Private financial information is not shared, but your agent can confirm milestone outcomes.'],
      ['What if finance is declined?', 'Your agent and attorney will apply the terms of the Offer to Purchase and advise on the options.'],
      ['Does cash avoid this stage?', 'Yes. Cash transactions move directly to the remaining transfer requirements.'],
    ],
    resources: COMMON_RESOURCES,
  },
  guarantees: {
    title: 'Guarantees',
    shortLabel: 'Guarantees',
    icon: BadgeCheck,
    description: 'The attorneys are securing formal payment guarantees for the purchase price.',
    detail: 'Guarantees confirm that the required funds will be available when the property registers.',
    duration: { min: 3, max: 7, label: '3 – 7 business days' },
    bullets: ['Confirming guarantee requirements', 'Receiving bank guarantees', 'Checking purchase price coverage', 'Aligning all attorneys'],
    reassurance: 'You do not receive the purchase price yet; the guarantees secure payment for registration.',
    faqs: [
      ['What is a guarantee?', 'It is a bank-backed undertaking to pay the stated amount when registration occurs.'],
      ['When do I receive the proceeds?', 'The transferring attorney pays the net proceeds after registration and final account reconciliation.'],
      ['What can delay guarantees?', 'Outstanding bank conditions or incomplete bond documentation are common causes.'],
    ],
    resources: COMMON_RESOURCES,
  },
  lodgement: {
    title: 'Lodgement',
    shortLabel: 'Lodgement',
    icon: Building2,
    description: 'The full transfer set has been lodged at the Deeds Office for examination.',
    detail: 'The Deeds Office now checks the documents before registration can take place.',
    duration: { min: 7, max: 10, label: '7 – 10 business days' },
    bullets: ['Deeds Office examination', 'Coordinating linked bond matters', 'Responding to examiner notes', 'Preparing for registration'],
    reassurance: 'Your attorneys are monitoring the matter daily and will advise as soon as it is on prep or registered.',
    faqs: [
      ['Can I speed up the Deeds Office?', 'Once lodged, examination follows the Deeds Office process and cannot usually be expedited.'],
      ['What does “on prep” mean?', 'The documents have passed examination and the attorneys may prepare them for registration.'],
      ['Can lodgement be rejected?', 'Documents can be queried or rejected, but your attorney will correct and relodge them.'],
    ],
    resources: COMMON_RESOURCES,
  },
  registration: {
    title: 'Registration',
    shortLabel: 'Registration',
    icon: CheckCircle2,
    description: 'The Deeds Office is registering the property into the buyer’s name.',
    detail: 'Ownership changes legally on registration and the attorneys begin final payment reconciliation.',
    duration: { min: 1, max: 2, label: '1 – 2 business days' },
    bullets: ['Registering the transfer', 'Confirming linked bond registration', 'Releasing secured funds', 'Preparing final statements'],
    reassurance: 'You are at the final legal milestone. Your attorney will confirm registration directly.',
    faqs: [
      ['When will the money reflect?', 'Net proceeds are normally paid after registration once funds clear and the final account is reconciled.'],
      ['When does occupation happen?', 'Occupation follows the date and terms in the Offer to Purchase, which may differ from registration.'],
      ['Who confirms registration?', 'The transferring attorney will issue the formal registration confirmation.'],
    ],
    resources: COMMON_RESOURCES,
  },
  completed: {
    title: 'Sale Completed',
    shortLabel: 'Completed',
    icon: Sparkles,
    description: 'The property transfer is complete and the transaction has reached its final milestone.',
    detail: 'Your team is closing the file, reconciling final accounts and sharing the remaining records.',
    duration: { min: 1, max: 3, label: '1 – 3 business days' },
    bullets: ['Finalising statements', 'Releasing remaining records', 'Closing the transaction file', 'Confirming post-registration items'],
    reassurance: 'Congratulations. Your property sale has completed successfully.',
    faqs: [
      ['What should I keep?', 'Retain the signed sale agreement, attorney statements and registration confirmation for your records.'],
      ['Can I still access documents?', 'Your seller portal remains the central place for seller-visible transaction documents.'],
      ['Who handles final questions?', 'Your agent or transferring attorney can help with final account and occupation queries.'],
    ],
    resources: COMMON_RESOURCES,
  },
}

export function resolveSellerTransactionStageKey(...values) {
  const normalizedValues = values.flat().filter(Boolean).map((value) =>
    String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
  )
  const haystack = normalizedValues.join(' ')
  if (/completed|complete|closed/.test(haystack)) return 'completed'
  if (/registered|registration/.test(haystack)) return 'registration'
  if (/lodg|deeds_office|prep/.test(haystack)) return 'lodgement'
  if (/guarantee/.test(haystack)) return 'guarantees'
  if (/bond|finance|bank_approval/.test(haystack)) return 'bond_approval'
  if (/transfer_document|sign_transfer|rates_clearance|transfer_duty/.test(haystack)) return 'transfer_documents'
  if (/fica|compliance|verification/.test(haystack)) return 'fica_verification'
  if (/opening_file|file_open|attorney_open/.test(haystack)) return 'attorney_opening_file'
  if (normalizedValues.includes('reg')) return 'registration'
  if (normalizedValues.includes('atty') || normalizedValues.includes('att')) return 'attorney_opening_file'
  if (normalizedValues.includes('xfer')) return 'instruction_sent'
  if (normalizedValues.includes('fin')) return 'bond_approval'
  if (/instruction|instructed|attorney_assigned|transfer/.test(haystack)) return 'instruction_sent'
  if (normalizedValues.includes('dep') || normalizedValues.includes('otp') || /offer_to_purchase|listing_live|listed|offers/.test(haystack)) return 'otp'
  return 'offer_accepted'
}

function safeDate(value) {
  const timestamp = Date.parse(value || '')
  return Number.isNaN(timestamp) ? null : new Date(timestamp)
}

function formatDate(value, fallback = 'Pending') {
  const date = safeDate(value)
  return date
    ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
    : fallback
}

function getElapsedDay(value) {
  const date = safeDate(value)
  if (!date) return 1
  return Math.max(1, Math.floor((Date.now() - date.getTime()) / 86_400_000) + 1)
}

function WorkspaceAction({ action, className, children }) {
  if (!action?.href) return null
  if (/^(https?:|mailto:|tel:)/.test(action.href)) {
    return <a href={action.href} className={className} target={action.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{children}</a>
  }
  return <Link to={action.href} className={className}>{children}</Link>
}

function ParticipantCard({ participant }) {
  const initials = String(participant.name || participant.role || 'T').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return (
    <article className="flex items-center gap-3 border-b border-[#e6edf3] py-3 last:border-0">
      {participant.avatarUrl ? (
        <img src={participant.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
      ) : (
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f4ef] text-xs font-bold text-[#0b5a48]">{initials}</span>
      )}
      <div className="min-w-0 flex-1">
        <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[#07835e]">{participant.role}</span>
        <strong className="mt-0.5 block truncate text-sm text-[#102032]">{participant.name}</strong>
        {participant.company ? <span className="block truncate text-xs text-[#6a7c90]">{participant.company}</span> : null}
      </div>
      {participant.email ? (
        <a href={`mailto:${participant.email}`} className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[#d7e1eb] px-2.5 text-xs font-semibold text-[#244159]">
          <MessageCircle size={13} /> Message
        </a>
      ) : null}
    </article>
  )
}

export default function TransactionStageWorkspace({
  currentStageKey,
  startedAt,
  completedAt,
  pendingAction,
  activity = [],
  participants = [],
  overviewPath,
  documentsPath,
  listingUrl,
  agentEmail,
}) {
  const resolvedCurrentKey = SELLER_TRANSACTION_STAGE_DEFINITIONS[currentStageKey] ? currentStageKey : 'offer_accepted'
  const currentIndex = SELLER_TRANSACTION_STAGE_ORDER.indexOf(resolvedCurrentKey)
  const [selectedKey, setSelectedKey] = useState(resolvedCurrentKey)
  const selectedIndex = SELLER_TRANSACTION_STAGE_ORDER.indexOf(selectedKey)
  const stage = SELLER_TRANSACTION_STAGE_DEFINITIONS[selectedKey]
  const Icon = stage.icon
  const isCurrent = selectedKey === resolvedCurrentKey
  const isCompleted = selectedIndex < currentIndex || resolvedCurrentKey === 'completed'
  const day = getElapsedDay(startedAt)
  const tracksElapsedTime = Number.isFinite(stage.duration.max) && stage.duration.max > 0
  const approximateMax = stage.duration.max || day
  const durationProgress = Math.min(100, Math.round((day / approximateMax) * 100))
  const actionRequired = isCurrent && pendingAction?.tone === 'action'
  const timeline = useMemo(() => SELLER_TRANSACTION_STAGE_ORDER.map((key, index) => ({
    key,
    ...SELLER_TRANSACTION_STAGE_DEFINITIONS[key],
    state: index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming',
  })), [currentIndex])

  const primaryAction = actionRequired
    ? { href: pendingAction.href || documentsPath, label: pendingAction.label || 'Complete action' }
    : agentEmail
      ? { href: `mailto:${agentEmail}`, label: 'Message Agent' }
      : null

  return (
    <section className="space-y-5 pb-24 lg:pb-2">
      <header className="flex flex-wrap items-start justify-between gap-3 px-0.5">
        <div>
          <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-[#102032]">Progress</h1>
          <p className="mt-1 text-sm text-[#617287]">A detailed look at where your sale is right now.</p>
        </div>
        <Link to={overviewPath} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d4dee9] bg-white px-3 text-sm font-semibold text-[#22384f] transition hover:bg-[#f8fbfd]">
          <ArrowLeft size={15} /> Back to Overview
        </Link>
      </header>

      <article className="rounded-[18px] border border-[#dce5ed] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] md:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr] lg:items-center">
          <div>
            <span className="text-[0.64rem] font-bold uppercase tracking-[0.14em] text-[#087955]">{isCurrent ? 'Current Stage' : isCompleted ? 'Completed Stage' : 'Upcoming Stage'}</span>
            <div className="mt-4 flex items-start gap-4">
              <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#e7f5ef] text-[#075c48]">
                <Icon size={38} strokeWidth={1.7} />
              </span>
              <div>
                <h2 className="text-[1.8rem] font-semibold leading-tight tracking-[-0.04em] text-[#102032]">{stage.title}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#52667c]">{stage.description}</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52667c]">{stage.detail}</p>
              </div>
            </div>
          </div>
          <dl className="grid gap-4 border-t border-[#e2e9ef] pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-sm text-[#53667a]"><Clock3 size={16} /> Estimated duration</dt><dd className="text-sm font-semibold text-[#102032]">{stage.duration.label}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-sm text-[#53667a]"><CircleDot size={16} /> Status</dt><dd className={`rounded-md px-2.5 py-1 text-xs font-semibold ${isCurrent ? 'bg-[#e4f7ee] text-[#067451]' : isCompleted ? 'bg-[#e7f5ef] text-[#067451]' : 'bg-[#edf2f6] text-[#637589]'}`}>{isCurrent ? 'In Progress' : isCompleted ? 'Completed' : 'Upcoming'}</dd></div>
            {isCurrent && !tracksElapsedTime ? <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-sm text-[#53667a]"><CalendarDays size={16} /> Next milestone</dt><dd className="text-sm font-semibold text-[#102032]">Offer accepted</dd></div> : <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-sm text-[#53667a]"><CalendarDays size={16} /> {isCompleted ? 'Completed' : isCurrent ? 'Started' : 'Starts after'}</dt><dd className="text-sm font-semibold text-[#102032]">{isCompleted ? formatDate(completedAt || startedAt) : isCurrent ? formatDate(startedAt) : SELLER_TRANSACTION_STAGE_DEFINITIONS[resolvedCurrentKey].shortLabel}</dd></div>}
            {isCurrent && tracksElapsedTime ? <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-sm text-[#53667a]"><CheckCircle2 size={16} /> Current day</dt><dd className="text-sm font-semibold text-[#102032]">Day {day}</dd></div> : null}
          </dl>
        </div>
      </article>

      <section className="grid items-stretch gap-4 lg:grid-cols-3">
        <article className="rounded-[16px] border border-[#dce5ed] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <h3 className="flex items-center gap-3 text-sm font-semibold text-[#173047]"><Sparkles className="rounded-full bg-[#e8f6f0] p-2 text-[#07835e]" size={36} /> What is happening?</h3>
          <p className="mt-5 text-sm leading-6 text-[#53667a]">{stage.detail}</p>
          <ul className="mt-4 space-y-2 text-sm text-[#334a60]">{stage.bullets.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-[#07835e]" size={15} />{item}</li>)}</ul>
          <p className="mt-4 rounded-[10px] border border-[#cfe7dd] bg-[#eff9f5] p-3 text-xs leading-5 text-[#3f5f56]">{stage.reassurance}</p>
        </article>

        <article className="rounded-[16px] border border-[#dce5ed] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <h3 className="flex items-center gap-3 text-sm font-semibold text-[#173047]"><CheckCircle2 className="rounded-full bg-[#e8f6f0] p-2 text-[#07835e]" size={36} /> What you need to do</h3>
          {actionRequired ? (
            <div className="mt-5 rounded-[12px] border border-[#efd4a8] bg-[#fff8eb] p-4">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#a55d0a]"><Upload size={15} /> Action Required</span>
              <strong className="mt-3 block text-base text-[#473019]">{pendingAction.title}</strong>
              <p className="mt-2 text-sm leading-6 text-[#765d42]">{pendingAction.description}</p>
              <WorkspaceAction action={{ href: pendingAction.href || documentsPath }} className="mt-4 inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#b66a10] px-4 text-sm font-semibold text-white">
                {pendingAction.label || 'Complete action'} <ArrowRight size={14} />
              </WorkspaceAction>
            </div>
          ) : (
            <div className="mt-5 rounded-[12px] border border-[#cde6da] bg-[#eff9f5] p-4">
              <strong className="flex items-center gap-2 text-sm text-[#086247]"><CheckCircle2 size={17} /> No action required from you.</strong>
              <p className="mt-4 text-sm leading-6 text-[#526c63]">We’ll notify you as soon as the next step begins.</p>
            </div>
          )}
        </article>

        <article className="rounded-[16px] border border-[#dce5ed] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <h3 className="flex items-center gap-3 text-sm font-semibold text-[#173047]"><Clock3 className="rounded-full bg-[#eef3f8] p-2 text-[#294862]" size={36} /> How long does this take?</h3>
          <div className="mt-5 rounded-[12px] border border-[#e0e7ee] p-4">
            <span className="text-xs text-[#68798c]">Typical duration</span>
            <strong className="mt-1 block text-xl tracking-[-0.03em] text-[#102032]">{stage.duration.label}</strong>
            {isCurrent && tracksElapsedTime ? <><div className="my-4 border-t border-[#e5ebf0]" /><span className="text-xs text-[#68798c]">Current progress</span><p className="mt-2 text-sm text-[#20384f]">Day {day} of approximately {approximateMax}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8edf3]"><div className="h-full rounded-full bg-[#08765a]" style={{ width: `${durationProgress}%` }} /></div></> : null}
          </div>
          <p className="mt-4 text-xs leading-5 text-[#607286]">Timelines can vary depending on how quickly information is received.</p>
        </article>
      </section>

      <article className="rounded-[16px] border border-[#dce5ed] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <h3 className="text-sm font-semibold text-[#173047]">What’s next?</h3>
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="relative flex min-w-[1040px] justify-between px-2">
            <div className="absolute left-8 right-8 top-4 h-px bg-[#d8e2ea]" />
            {timeline.map((item) => (
              <button key={item.key} type="button" onClick={() => setSelectedKey(item.key)} className="relative z-10 flex w-[100px] flex-col items-center text-center">
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-[3px] ${item.state === 'completed' ? 'border-[#08765a] bg-[#08765a] text-white' : item.state === 'current' ? 'border-white bg-[#0b5145] text-white shadow-[0_0_0_2px_#0b5145]' : 'border-[#d9e2e9] bg-[#e8edf2] text-[#9aa9b7]'}`}>{item.state === 'completed' ? <Check size={14} /> : <span className="h-2 w-2 rounded-full bg-current" />}</span>
                <span className={`mt-3 text-[0.68rem] font-semibold leading-4 ${selectedKey === item.key ? 'text-[#075d4b]' : 'text-[#253c52]'}`}>{item.shortLabel}</span>
                {item.state === 'current' ? <span className="mt-1 text-[0.62rem] font-semibold text-[#08765a]">In Progress</span> : null}
              </button>
            ))}
          </div>
        </div>
      </article>

      <article className="rounded-[16px] border border-[#dce5ed] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <h3 className="text-sm font-semibold text-[#173047]">Frequently asked at this stage</h3>
        <div className="mt-3 overflow-hidden rounded-[10px] border border-[#dce5ed]">
          {stage.faqs.map(([question, answer], index) => (
            <details key={question} open={index === 0} className="group border-b border-[#e3eaf0] last:border-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#20384f]">{question}<ChevronDown size={15} className="transition group-open:rotate-180" /></summary>
              <p className="px-4 pb-3 text-xs leading-5 text-[#65778b]">{answer}</p>
            </details>
          ))}
        </div>
      </article>

      <section className="grid items-stretch gap-4 lg:grid-cols-3">
        <article className="rounded-[16px] border border-[#dce5ed] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <h3 className="text-sm font-semibold text-[#173047]">Who is working on this?</h3>
          <div className="mt-2">{participants.length ? participants.map((participant) => <ParticipantCard key={`${participant.role}-${participant.name}`} participant={participant} />) : <p className="mt-4 text-sm text-[#65778b]">Your assigned team will appear here as appointments are confirmed.</p>}</div>
        </article>

        <article className="rounded-[16px] border border-[#dce5ed] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <h3 className="text-sm font-semibold text-[#173047]">Recent activity</h3>
          <div className="mt-4 max-h-[300px] space-y-0 overflow-y-auto pr-1">
            {activity.length ? activity.slice(0, 8).map((item) => <div key={item.id || item.message} className="relative border-l border-[#cfe0d9] pb-5 pl-5 last:pb-1"><span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-[#07835e]" /><div className="flex items-start justify-between gap-3"><p className="text-xs font-medium leading-5 text-[#263e54]">{item.message || item.title}</p><time className="shrink-0 text-[0.62rem] text-[#7b8a9a]">{item.timestampLabel || formatDate(item.createdAt, 'Recent')}</time></div></div>) : <p className="text-sm text-[#65778b]">No seller-facing activity has been shared yet.</p>}
          </div>
        </article>

        <article className="rounded-[16px] border border-[#dce5ed] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <h3 className="text-sm font-semibold text-[#173047]">Helpful resources</h3>
          <div className="mt-4 space-y-2">{stage.resources.map((resource) => <Link key={resource.title} to={resource.href} className="flex items-center gap-3 rounded-[10px] border border-[#e0e7ed] p-3 text-xs font-semibold leading-5 text-[#253e53] transition hover:bg-[#f7faf9]"><FileText className="shrink-0 rounded-md bg-[#e9f7f1] p-2 text-[#08765a]" size={34} /> <span className="flex-1">{resource.title}</span><ChevronDown className="-rotate-90" size={14} /></Link>)}</div>
        </article>
      </section>

      <article className="flex flex-col gap-5 rounded-[16px] border border-[#d3e8df] bg-[linear-gradient(100deg,#edf9f4_0%,#f8fcfa_100%)] p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4"><span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#08765a] text-white"><ShieldCheck size={32} /></span><div><h3 className="text-lg font-semibold tracking-[-0.03em] text-[#10392f]">You’re exactly where you should be.</h3><p className="mt-2 text-sm leading-6 text-[#46675f]">{tracksElapsedTime ? `Most sellers spend around ${stage.duration.max} days in this stage.` : 'This stage depends on buyer activity and the offer terms you are willing to accept.'}<br />We’ll automatically notify you as soon as your transaction moves forward.</p></div></div>
        <div className="flex flex-wrap gap-2">
          <WorkspaceAction action={primaryAction} className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#087057] px-4 text-sm font-semibold text-white">{primaryAction?.label}<MessageCircle size={14} /></WorkspaceAction>
          {listingUrl ? <a href={listingUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#bcd9cd] bg-white px-4 text-sm font-semibold text-[#175444]">View Listing <ArrowRight size={14} /></a> : null}
        </div>
      </article>

      {actionRequired ? <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ecd4ad] bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.1)] backdrop-blur lg:hidden"><WorkspaceAction action={{ href: pendingAction.href || documentsPath }} className="flex h-12 w-full items-center justify-center gap-2 rounded-[11px] bg-[#b66a10] text-sm font-semibold text-white"><Upload size={16} /> {pendingAction.label || 'Complete action'}</WorkspaceAction></div> : null}
    </section>
  )
}
