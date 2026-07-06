import { Check, Copy, ExternalLink, Home, KeyRound, LayoutDashboard, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getOnboardingDemoLinks } from '../lib/onboardingDemoLinks'

const LINK_CARD_CLASS =
  'rounded-[22px] border border-[#dbe5ef] bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.07)]'
const ACTION_CLASS =
  'inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold transition'

function useOrigin() {
  return useMemo(() => (
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
  ), [])
}

function useLocationSearch() {
  return useMemo(() => (
    typeof window !== 'undefined' && window.location
      ? `${window.location.search || ''}${window.location.hash || ''}`
      : ''
  ), [])
}

async function copyText(value = '') {
  const text = String(value || '')
  if (!text) return false

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return true
  }

  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

function DemoLinkCard({ title, description, href, absoluteUrl, icon: Icon }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      setCopied(await copyText(absoluteUrl))
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className={LINK_CARD_CLASS}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#d8e3ee] bg-[#f6f9fc] text-[#2f4a61]">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142334]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#61758a]">{description}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[14px] border border-[#e0e8f1] bg-[#f8fbfe] px-3 py-3">
        <p className="break-all text-xs font-medium leading-5 text-[#42576d]">{absoluteUrl}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link className={`${ACTION_CLASS} bg-[#172334] text-white shadow-[0_12px_24px_rgba(23,35,52,0.18)]`} to={href}>
          Open <ExternalLink size={15} />
        </Link>
        <button
          type="button"
          className={`${ACTION_CLASS} border border-[#ccd9e7] bg-white text-[#21364c]`}
          onClick={copyLink}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </article>
  )
}

export default function OnboardingLinksDemoPage() {
  const origin = useOrigin()
  const search = useLocationSearch()
  const links = useMemo(() => getOnboardingDemoLinks(origin, search), [origin, search])

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f9fbfd_0%,#eef4fb_48%,#e5edf6_100%)] px-4 py-5 text-[#142334]">
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-4">
        <section className="rounded-[24px] border border-[#dbe5ef] bg-white/92 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.07)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#60758d]">Arch9 Demo Links</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#142334]">
            Client demo links
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#61758a]">
            Static demo links for the client-facing buyer and seller onboarding and portal flows.
          </p>
        </section>

        <DemoLinkCard
          title="Buyer Onboarding"
          description="Purchaser details, finance path, required documents, and review."
          href={links.buyerPath}
          absoluteUrl={links.buyerUrl}
          icon={UserRound}
        />

        <DemoLinkCard
          title="Seller Onboarding"
          description="Seller details, property facts, disclosure, compliance, and review."
          href={links.sellerPath}
          absoluteUrl={links.sellerUrl}
          icon={Home}
        />

        <DemoLinkCard
          title="Buyer Portal"
          description="Client workspace with progress, documents, appointments, and next actions."
          href={links.buyerPortalPath}
          absoluteUrl={links.buyerPortalUrl}
          icon={LayoutDashboard}
        />

        <DemoLinkCard
          title="Seller Portal"
          description="Seller workspace with listing progress, documents, offers, and appointments."
          href={links.sellerPortalPath}
          absoluteUrl={links.sellerPortalUrl}
          icon={KeyRound}
        />
      </div>
    </main>
  )
}
