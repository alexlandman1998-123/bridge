import {
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  Globe2,
  Handshake,
  Info,
  Landmark,
  MapPin,
  PieChart,
  UserRound,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { createElement } from 'react'
import Button from '../ui/Button'

const OPTION_ICONS = {
  person: UserRound,
  people: UsersRound,
  globe: Globe2,
  building: Building2,
  bank: Landmark,
  wallet: WalletCards,
  split: PieChart,
  finance: CircleDollarSign,
}

const SECTION_ICONS = {
  ownership: Landmark,
  property: HomeFallbackIcon,
  property_details: Building2,
  details: FileCheck2,
  calendar: CalendarClock,
  location: MapPin,
  price: CircleDollarSign,
  people: UsersRound,
  collaboration: Handshake,
  badge: BadgeCheck,
  success: CheckCircle2,
}

function HomeFallbackIcon(props) {
  return <Building2 {...props} />
}

export function BuyerPurchaserIllustration() {
  return (
    <svg viewBox="0 0 360 178" className="h-full w-full" role="img" aria-label="Property and buyers illustration">
      <defs>
        <linearGradient id="buyer-property-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#edf8f3" />
          <stop offset="100%" stopColor="#f7fbfd" />
        </linearGradient>
      </defs>
      <path d="M68 145c4-46 46-91 94-93 28-1 51 12 68 31 11 12 22 18 39 15 31-5 57 10 66 38 3 10 3 21 0 32H44c8-6 16-13 24-23Z" fill="url(#buyer-property-bg)" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M112 84h102v70H112z" fill="#f8fbfd" stroke="#c7d9e3" strokeWidth="2" />
        <path d="m102 88 61-47 61 47" fill="#173146" stroke="#173146" strokeWidth="2" />
        <path d="M133 113h20v41h-20z" fill="#d9eee7" stroke="#8cc8b7" strokeWidth="2" />
        <path d="M173 108h19v24h-19zM133 98h20M173 98h19" stroke="#74b7a8" strokeWidth="3" />
        <path d="M209 108h48v46h-48z" fill="#edf8f3" stroke="#b9d9d0" strokeWidth="2" />
        <path d="m201 111 32-23 32 23" fill="#2b4a5e" stroke="#2b4a5e" strokeWidth="2" />
        <path d="M57 156h286" stroke="#d7e7ed" strokeWidth="2" />
      </g>
      <g>
        <circle cx="80" cy="98" r="8" fill="#183146" />
        <path d="M77 106c-10 8-12 22-8 39" stroke="#2f8f86" strokeWidth="7" strokeLinecap="round" />
        <path d="M83 108c9 11 17 19 26 23" stroke="#2f8f86" strokeWidth="5" strokeLinecap="round" />
        <path d="M70 143h24" stroke="#183146" strokeWidth="6" strokeLinecap="round" />
        <circle cx="283" cy="97" r="8" fill="#183146" />
        <path d="M282 106c10 8 13 23 9 39" stroke="#74b7a8" strokeWidth="7" strokeLinecap="round" />
        <path d="M277 108c-8 10-16 18-25 23" stroke="#74b7a8" strokeWidth="5" strokeLinecap="round" />
        <path d="M271 143h24" stroke="#183146" strokeWidth="6" strokeLinecap="round" />
      </g>
      <g fill="#7cc6b4" opacity="0.58">
        <circle cx="47" cy="134" r="14" />
        <circle cx="62" cy="122" r="10" />
        <circle cx="237" cy="144" r="13" />
        <circle cx="325" cy="128" r="17" />
      </g>
      <g fill="#ffffff">
        <path d="M55 74c7-10 24-11 32 0h36c-11-17-44-18-56 0H55Z" opacity="0.9" />
        <path d="M258 71c8-10 25-11 34 0h31c-11-16-42-17-54 0h-11Z" opacity="0.85" />
      </g>
    </svg>
  )
}

export function BuyerFinanceIllustration() {
  return (
    <svg viewBox="0 0 360 178" className="h-full w-full" role="img" aria-label="Finance and checklist illustration">
      <defs>
        <linearGradient id="buyer-finance-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f1faf6" />
          <stop offset="100%" stopColor="#f7fbfd" />
        </linearGradient>
      </defs>
      <path d="M55 145c11-52 58-91 113-91 45 0 82 24 100 59 21-3 42 10 50 32 3 8 4 16 2 25H42c2-9 7-17 13-25Z" fill="url(#buyer-finance-bg)" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M103 31h79l42 42v86H103z" fill="#ffffff" stroke="#d7e4ec" strokeWidth="2" />
        <path d="M182 31v43h42" fill="#eef5f8" stroke="#d7e4ec" strokeWidth="2" />
        <path d="M127 74h58M127 97h70M127 119h54" stroke="#cbdce3" strokeWidth="6" />
        <circle cx="127" cy="136" r="19" fill="#75c7b5" />
        <path d="m118 136 7 7 13-15" fill="none" stroke="#fff" strokeWidth="5" />
        <path d="M231 109h83v50h-83z" fill="#eaf6f1" stroke="#b8d8cf" strokeWidth="2" />
        <path d="m221 110 52-32 52 32" fill="#6cbba9" stroke="#6cbba9" strokeWidth="2" />
        <path d="M238 122v26M258 122v26M280 122v26M301 122v26M226 159h96" stroke="#2f8f86" strokeWidth="5" />
      </g>
      <g fill="#ffffff" opacity="0.78">
        <path d="M48 87c9-12 28-12 39 0h41c-12-19-50-21-64 0H48Z" />
      </g>
    </svg>
  )
}

export function BuyerPurchaseModeIllustration() {
  return (
    <svg viewBox="0 0 360 178" className="h-full w-full" role="img" aria-label="Co-purchaser and home illustration">
      <defs>
        <linearGradient id="buyer-mode-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#edf8f3" />
          <stop offset="100%" stopColor="#f7fbfd" />
        </linearGradient>
      </defs>
      <path d="M39 151c6-55 49-100 99-101 20-1 35 8 52 15 14 6 31 2 47-2 43-9 83 21 87 72 1 12 0 23-4 34H38c-1-6-1-12 1-18Z" fill="url(#buyer-mode-bg)" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M224 95h92v61h-92z" fill="#f8fbfd" stroke="#c7d9e3" strokeWidth="2" />
        <path d="m214 99 56-42 57 42" fill="#173146" stroke="#173146" strokeWidth="2" />
        <path d="M244 120h18v36h-18z" fill="#d9eee7" stroke="#8cc8b7" strokeWidth="2" />
        <path d="M279 118h18v22h-18z" stroke="#74b7a8" strokeWidth="3" />
        <path d="M45 158h289" stroke="#d7e7ed" strokeWidth="2" />
      </g>
      <g>
        <circle cx="98" cy="82" r="14" fill="#183146" />
        <path d="M88 99c-18 13-23 38-21 59h57c4-25-4-48-23-59Z" fill="#2f4b5e" />
        <path d="M120 111c19 16 33 24 47 28" stroke="#2f4b5e" strokeWidth="9" strokeLinecap="round" />
        <circle cx="162" cy="82" r="13" fill="#183146" />
        <path d="M152 98c-17 14-21 40-18 60h56c4-24-4-47-22-60Z" fill="#86c9ba" />
        <path d="M146 112c-14 16-26 24-40 28" stroke="#86c9ba" strokeWidth="9" strokeLinecap="round" />
        <path d="M124 134c9 11 21 11 32 0" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      </g>
      <g fill="#ffffff" opacity="0.86">
        <path d="M57 76c8-13 30-14 40 0h48c-13-20-54-22-70 0H57Z" />
      </g>
      <g fill="#7cc6b4" opacity="0.58">
        <circle cx="48" cy="134" r="14" />
        <circle cx="327" cy="130" r="15" />
      </g>
    </svg>
  )
}

export function SellerOwnershipIllustration() {
  return (
    <svg viewBox="0 0 360 188" className="h-full w-full" role="img" aria-label="Seller ownership and for sale illustration">
      <path d="M43 151c4-50 43-94 91-96 25-1 39 12 56 22 15 9 31 0 48-7 43-18 91 15 91 71 0 11-2 22-6 33H41c-2-7-1-15 2-23Z" fill="#eef8f3" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M101 83h130v78H101z" fill="#f9fcfd" stroke="#cadbe4" strokeWidth="2" />
        <path d="m91 88 75-57 76 57" fill="#173146" stroke="#173146" strokeWidth="2" />
        <path d="M132 119h25v42h-25z" fill="#dff1eb" stroke="#8fc8ba" strokeWidth="2" />
        <path d="M180 107h22v21h-22zM132 102h24" stroke="#7dbfb0" strokeWidth="3" />
        <path d="M271 111v52" stroke="#173146" strokeWidth="4" />
        <path d="M241 119h60v34h-60z" fill="#2f8f64" stroke="#24744f" strokeWidth="2" />
        <path d="M253 134h36" stroke="#fff" strokeWidth="4" />
        <path d="M74 164h257" stroke="#d7e7ed" strokeWidth="2" />
      </g>
      <g>
        <circle cx="75" cy="94" r="11" fill="#173146" />
        <path d="M65 108c-17 12-22 38-19 56h48c4-22-1-45-18-56Z" fill="#244158" />
        <path d="M88 114c13 13 25 21 36 23" stroke="#2f8f64" strokeWidth="8" strokeLinecap="round" />
      </g>
      <g fill="#61b88f" opacity="0.7">
        <circle cx="54" cy="144" r="15" />
        <circle cx="246" cy="150" r="13" />
        <path d="M258 121c0-18 22-18 22 0v44h-22Z" />
        <circle cx="319" cy="145" r="17" />
      </g>
      <g fill="#ffffff" opacity="0.9">
        <path d="M57 75c8-12 28-12 38 0h40c-12-19-48-20-63 0H57Z" />
      </g>
    </svg>
  )
}

export function SellerPropertyDetailsIllustration() {
  return (
    <svg viewBox="0 0 360 188" className="h-full w-full" role="img" aria-label="Property details and location illustration">
      <path d="M39 151c7-55 52-99 104-96 24 1 40 13 59 16 18 3 35-8 56-3 40 9 70 48 64 96H39c-2-4-2-8 0-13Z" fill="#eef8f3" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M81 84h130v78H81z" fill="#f8fbfd" stroke="#c7d9e3" strokeWidth="2" />
        <path d="m72 87 39-32 111 5v29" fill="#2f9d67" stroke="#2f9d67" strokeWidth="2" />
        <path d="M116 110h41v52h-41z" fill="#dcf0e8" stroke="#8cc8b7" strokeWidth="2" />
        <path d="M172 100h25v29h-25zM96 101h16M94 130h18" stroke="#84bfb0" strokeWidth="3" />
        <path d="M220 116h62v46h-62z" fill="#eaf6f1" stroke="#b8d8cf" strokeWidth="2" />
        <path d="M216 116h70" stroke="#2f9d67" strokeWidth="12" />
        <path d="M236 160h76" stroke="#d7e7ed" strokeWidth="2" />
      </g>
      <path d="M296 74c-20 0-36 15-36 35 0 25 36 62 36 62s36-37 36-62c0-20-16-35-36-35Z" fill="#32a66d" />
      <circle cx="296" cy="109" r="12" fill="#f8fbfd" />
      <g fill="#61b88f" opacity="0.65">
        <circle cx="56" cy="141" r="19" />
        <circle cx="233" cy="147" r="15" />
        <circle cx="258" cy="151" r="10" />
      </g>
      <path d="M44 166h279" stroke="#d7e7ed" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function SellerSellingContextIllustration() {
  return (
    <svg viewBox="0 0 360 188" className="h-full w-full" role="img" aria-label="Selling checklist and timeline illustration">
      <path d="M39 150c7-49 42-84 83-83 22 1 37 11 56 11 17 0 33-9 55-9 45 1 82 41 84 92H39c-2-4-2-8 0-11Z" fill="#eef8f3" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M113 55h112v116H113z" fill="#f8fbfd" stroke="#2f4b5e" strokeWidth="5" />
        <path d="M145 48h48l7 18h-62z" fill="#86b9ae" stroke="#4f8278" strokeWidth="3" />
        <circle cx="143" cy="91" r="10" fill="#e8f5ef" stroke="#94c9bb" strokeWidth="2" />
        <path d="m137 91 5 5 10-12" stroke="#2f8f64" strokeWidth="4" />
        <path d="M166 88h37M166 102h26" stroke="#cbdce3" strokeWidth="5" />
        <circle cx="143" cy="125" r="10" fill="#e8f5ef" stroke="#94c9bb" strokeWidth="2" />
        <path d="m137 125 5 5 10-12" stroke="#2f8f64" strokeWidth="4" />
        <path d="M166 122h39M166 136h30" stroke="#cbdce3" strokeWidth="5" />
        <circle cx="247" cy="131" r="44" fill="#dff2e9" stroke="#32a66d" strokeWidth="5" />
        <path d="M247 101v31l-17 16" stroke="#2f4b5e" strokeWidth="5" />
        <path d="M247 91v9M247 162v10M205 132h9M281 132h10" stroke="#2f4b5e" strokeWidth="4" />
      </g>
      <g fill="#61b88f" opacity="0.65">
        <path d="M71 116c8-21 25-21 32 0v52H71Z" />
        <path d="M52 132c9-22 23-16 27 6v31H52Z" />
        <circle cx="307" cy="139" r="16" />
      </g>
      <path d="M47 170h276" stroke="#d7e7ed" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function SellerDocumentsIllustration() {
  return (
    <svg viewBox="0 0 360 188" className="h-full w-full" role="img" aria-label="Seller documents illustration">
      <path d="M54 152c10-55 59-91 113-88 52 4 95 40 105 93H55c-2-2-2-4-1-5Z" fill="#eef8f3" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M112 42h100l38 39v88H112z" fill="#fff" stroke="#d4e1ea" strokeWidth="2" />
        <path d="M212 42v40h38" fill="#eef5f8" stroke="#d4e1ea" strokeWidth="2" />
        <path d="M139 90h60M139 114h74M139 138h50" stroke="#cbdce3" strokeWidth="6" />
        <circle cx="121" cy="142" r="26" fill="#2f8f64" />
        <path d="m109 142 9 9 18-22" stroke="#fff" strokeWidth="6" />
      </g>
    </svg>
  )
}

export function SellerCollaborationIllustration() {
  return (
    <svg viewBox="0 0 360 188" className="h-full w-full" role="img" aria-label="Seller collaboration illustration">
      <path d="M42 151c7-48 46-82 91-81 23 1 37 10 55 10 18 0 33-10 54-8 42 5 76 42 79 91H43c-2-4-2-8-1-12Z" fill="#eef8f3" />
      <g>
        <circle cx="132" cy="79" r="16" fill="#173146" />
        <path d="M101 160c0-39 12-62 33-62 23 0 36 23 36 62Z" fill="#244158" />
        <circle cx="232" cy="79" r="16" fill="#173146" />
        <path d="M197 160c0-39 13-62 35-62s35 23 35 62Z" fill="#75c7b5" />
        <path d="M161 122c22 25 42 25 65 0" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
        <path d="M155 123c16 16 31 24 47 24" fill="none" stroke="#2f8f64" strokeWidth="9" strokeLinecap="round" />
      </g>
      <path d="M68 164h231" stroke="#d7e7ed" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function SellerSuccessIllustration() {
  return (
    <svg viewBox="0 0 360 188" className="h-full w-full" role="img" aria-label="Seller success illustration">
      <path d="M58 152c8-56 56-96 111-94 55 2 103 43 112 99H59c-2-2-2-4-1-5Z" fill="#eef8f3" />
      <circle cx="178" cy="103" r="58" fill="#dff2e9" stroke="#32a66d" strokeWidth="5" />
      <path d="m149 104 21 21 43-52" fill="none" stroke="#2f8f64" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M78 164h204" stroke="#d7e7ed" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function SellerOnboardingIllustration({ variant = 'ownership' }) {
  const Illustration =
    variant === 'property_details'
      ? SellerPropertyDetailsIllustration
      : variant === 'selling_context'
        ? SellerSellingContextIllustration
        : variant === 'documents'
          ? SellerDocumentsIllustration
          : variant === 'collaboration'
            ? SellerCollaborationIllustration
            : variant === 'success'
              ? SellerSuccessIllustration
              : SellerOwnershipIllustration

  return (
    <div className="relative mx-auto h-[168px] w-full max-w-[360px] overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#f8fcfa_0%,#eef8f3_100%)] max-[360px]:h-[126px]">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_45%_24%,rgba(47,143,100,0.18),transparent_58%)]" />
      <div className="relative h-full w-full px-1.5 py-2">
        <Illustration />
      </div>
    </div>
  )
}

export function OnboardingStepHeader({
  brand = {},
  typeLabel = 'Buyer onboarding',
  questionPosition = 1,
  questionTotal = 1,
  title = '',
  description = '',
  progressPercent = 0,
  address = '',
}) {
  const name = String(brand.name || '').trim() || 'Your property team'
  const initials = String(brand.initials || name.charAt(0) || 'B').trim().slice(0, 3).toUpperCase()

  return (
    <section className="md:hidden rounded-[22px] border border-[#dbe5ef] bg-white/95 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-[#142033] text-xs font-semibold text-white shadow-[0_12px_24px_rgba(20,32,51,0.16)]">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-5 text-[#20324a]">{name}</p>
            <p className="mt-0.5 truncate text-xs font-medium leading-4 text-[#516981]">{typeLabel}</p>
          </div>
        </div>
        <span className="inline-flex h-10 shrink-0 items-center rounded-full bg-[#eef4fb] px-3 text-sm font-semibold text-[#4d637a]">
          {questionPosition}/{questionTotal}
        </span>
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#445b73]">
          Question {questionPosition} of {questionTotal}
        </p>
        <h1 className="mt-2 text-2xl font-semibold leading-[1.1] tracking-normal text-[#132033]">
          {title}
        </h1>
        {description ? <p className="mt-3 text-[0.95rem] leading-6 text-[#516981]">{description}</p> : null}
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#e9eef5]" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-[linear-gradient(90deg,#16344a_0%,#2f8f86_100%)] transition-[width] duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {address ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#415a73]">{address}</p> : null}
    </section>
  )
}

export function OnboardingIllustration({ type = 'property_people' }) {
  const Illustration =
    type === 'finance_security'
      ? BuyerFinanceIllustration
      : type === 'purchase_mode'
        ? BuyerPurchaseModeIllustration
        : BuyerPurchaserIllustration

  return (
    <div className="relative mx-auto h-[150px] w-full max-w-[340px] overflow-hidden rounded-[26px] bg-[linear-gradient(180deg,#f7fbfa_0%,#eef7f4_100%)] max-[360px]:h-[122px]">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(124,198,180,0.24),transparent_58%)]" />
      <div className="relative h-full w-full px-2 py-2">
        <Illustration />
      </div>
    </div>
  )
}

export function OnboardingSectionHeader({
  icon = 'details',
  title = '',
  description = '',
  accent = 'green',
}) {
  const Icon = typeof icon === 'string' ? (SECTION_ICONS[icon] || FileCheck2) : icon
  const accentClasses =
    accent === 'green'
      ? 'border-[#d7eadf] bg-white text-[#137a4a]'
      : 'border-[#dbe5ef] bg-white text-[#35546c]'

  return (
    <div className="flex items-start gap-3">
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border shadow-[0_10px_22px_rgba(15,23,42,0.05)] ${accentClasses}`}>
        {createElement(Icon, { size: 18, strokeWidth: 1.8 })}
      </span>
      <div className="min-w-0">
        {title ? <h3 className="text-[1.15rem] font-semibold leading-tight text-[#162435] sm:text-[1.1rem]">{title}</h3> : null}
        {description ? <p className="mt-1.5 text-sm leading-5 text-[#516981]">{description}</p> : null}
      </div>
    </div>
  )
}

export function OnboardingSummaryCard({
  badge = '',
  title = '',
  children,
  icon = 'success',
  tone = 'green',
}) {
  const Icon = typeof icon === 'string' ? (SECTION_ICONS[icon] || CheckCircle2) : icon
  const toneClasses =
    tone === 'green'
      ? 'border-[#cfe8da] bg-[#f4fbf7] text-[#14532d]'
      : 'border-[#dbe6f2] bg-[#f8fbff] text-[#22364a]'
  const iconClasses =
    tone === 'green'
      ? 'border-[#b9dec8] bg-[#2f8f64] text-white'
      : 'border-[#d6e1ee] bg-white text-[#35546c]'

  return (
    <aside className={`rounded-[18px] border px-4 py-3 text-sm leading-6 shadow-[0_10px_22px_rgba(15,23,42,0.04)] ${toneClasses}`}>
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${iconClasses}`}>
          {createElement(Icon, { size: 17, strokeWidth: 2 })}
        </span>
        <div className="min-w-0">
          {badge ? (
            <span className="inline-flex rounded-full border border-current/15 bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold">
              {badge}
            </span>
          ) : null}
          {title ? <p className={`${badge ? 'mt-2' : ''} text-sm font-semibold text-[#172334]`}>{title}</p> : null}
          {children ? <p className="mt-1 text-sm leading-5 text-[#516981]">{children}</p> : null}
        </div>
      </div>
    </aside>
  )
}

export function OnboardingOptionCard({
  label,
  description,
  icon = 'person',
  selected = false,
  onSelect,
  name,
  value,
}) {
  const Icon = OPTION_ICONS[icon] || UserRound

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      name={name}
      value={value}
      onClick={onSelect}
      className={`group flex w-full items-center gap-3 rounded-[18px] border px-3.5 py-3.5 text-left transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8f86]/30 ${
        selected
          ? 'border-[#142033] bg-[#f6fbff] shadow-[0_14px_30px_rgba(20,32,51,0.12)] ring-1 ring-[#142033]/10'
          : 'border-[#dbe5ef] bg-white shadow-[0_10px_22px_rgba(15,23,42,0.045)] hover:border-[#b9cadd] hover:bg-[#fbfdff]'
      }`}
    >
      <span
        className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border ${
          selected
            ? 'border-[#b6d7cf] bg-[#e9f8f2] text-[#16344a]'
            : 'border-[#d8e5ee] bg-[#f7fafc] text-[#35546c]'
        }`}
      >
        {createElement(Icon, { size: 23, strokeWidth: 1.7 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold leading-5 text-[#142033]">
          {label}
          {selected ? <CheckCircle2 size={15} className="shrink-0 text-[#2f8f86]" aria-hidden="true" /> : null}
        </span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[#516981]">{description}</span> : null}
      </span>
      <ChevronRight size={18} className="shrink-0 text-[#203852]" aria-hidden="true" />
    </button>
  )
}

export function OnboardingInfoCard({ title = 'What happens next', children }) {
  return (
    <aside className="rounded-[18px] border border-[#dbe5ef] bg-[#f8fbff] p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#cbd9e7] bg-white text-[#203852]">
          <Info size={17} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#142033]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[#516981]">{children}</p>
        </div>
      </div>
    </aside>
  )
}

export function OnboardingVisualStep({
  helperTitle = '',
  helperCopy = '',
  illustration = 'property_people',
  options = [],
  selectedValue = '',
  onSelect,
  optionGroupName = 'onboarding-option',
  infoCard = null,
  error = '',
}) {
  return (
    <section className="space-y-4 md:hidden">
      <OnboardingIllustration type={illustration} />

      {(helperTitle || helperCopy) ? (
        <div>
          {helperTitle ? <h2 className="text-base font-semibold leading-6 text-[#142033]">{helperTitle}</h2> : null}
          {helperCopy ? <p className="mt-1.5 text-sm leading-6 text-[#516981]">{helperCopy}</p> : null}
        </div>
      ) : null}

      <div className="space-y-2.5" role="radiogroup" aria-label={helperTitle || optionGroupName}>
        {options.map((option) => (
          <OnboardingOptionCard
            key={option.value}
            name={optionGroupName}
            value={option.value}
            label={option.label}
            description={option.description || option.caption}
            icon={option.icon}
            selected={selectedValue === option.value}
            onSelect={() => onSelect?.(option.value)}
          />
        ))}
      </div>

      {error ? <p className="rounded-[12px] border border-[#f1c9c5] bg-[#fff5f4] px-3 py-2 text-xs font-medium text-[#b42318]">{error}</p> : null}

      {infoCard ? <OnboardingInfoCard title={infoCard.title}>{infoCard.copy}</OnboardingInfoCard> : null}
    </section>
  )
}

export function StickyOnboardingActions({
  pageContainerClass = '',
  saving = false,
  showBackButton = false,
  primaryActionLabel = 'Continue',
  onSaveDraft,
  onBack,
  onPrimary,
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-[linear-gradient(180deg,rgba(249,251,253,0)_0%,rgba(255,255,255,0.92)_20%,rgba(255,255,255,0.98)_100%)] backdrop-blur-xl md:static md:mt-5 md:bg-transparent md:backdrop-blur-0">
      <div className={`${pageContainerClass} px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] md:px-0 md:pt-0 md:pb-0`}>
        <div className="rounded-t-[22px] border border-[#dbe5ef] bg-white/95 px-3 py-2.5 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none">
          <div className="flex items-center justify-between gap-2 md:justify-start md:gap-3">
            <Button type="button" variant="ghost" onClick={onSaveDraft} disabled={saving} className="min-h-[40px] md:min-h-[50px]">
              Save Draft
            </Button>
            {showBackButton ? (
              <Button type="button" variant="ghost" onClick={onBack} className="min-h-[40px] md:min-h-[50px]">
                <ChevronLeft size={14} /> Back
              </Button>
            ) : (
              <span />
            )}
          </div>
          <Button
            type="button"
            onClick={onPrimary}
            disabled={saving}
            className="mt-2.5 w-full min-h-[48px] rounded-[14px] bg-[#0f2d46] text-white hover:bg-[#0c2438] md:mt-3 md:min-h-[54px] md:max-w-[320px]"
          >
            {primaryActionLabel}
            {primaryActionLabel === 'Submit Onboarding' ? null : <ChevronRight size={14} />}
          </Button>
        </div>
      </div>
    </div>
  )
}
