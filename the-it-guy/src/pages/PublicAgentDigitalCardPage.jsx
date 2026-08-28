import {
  Bath,
  BedDouble,
  Building2,
  ChevronRight,
  ExternalLink,
  Home,
  LoaderCircle,
  Mail,
  MessageCircle,
  Phone,
  Tag,
  UserPlus,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  recordAgentDigitalCardEventSoon,
  resolveAgencyPublicAgentCard,
  resolveAgencyPublicCardListings,
} from '../services/agencyPublicIntakeService'
import {
  buildAgentDigitalCardFileBaseName,
  buildAgentDigitalCardShareText,
  buildAgentDigitalCardVcard,
  downloadAgentDigitalCardTextFile,
} from '../services/agentDigitalCardShareService'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeThemeColour(value = '', fallback = '') {
  const text = normalizeText(value)
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${text.slice(1).split('').map((char) => `${char}${char}`).join('')}`
  if (/^#[0-9a-f]{6}$/i.test(text)) return text
  return fallback
}

function hexToRgb(hex = '#102236') {
  const safeHex = normalizeThemeColour(hex, '#102236').slice(1)
  const value = Number.parseInt(safeHex, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function hexToRgba(hex = '#102236', alpha = 1) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getContrastTextColour(hex = '#f5b83c') {
  const { r, g, b } = hexToRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#102236' : '#ffffff'
}

function formatCurrency(value = null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(numeric)
}

function formatLocation(listing = {}) {
  return [listing.suburb, listing.city || listing.province].map(normalizeText).filter(Boolean).join(', ')
}

function formatDisplayRole(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  if (text === text.toLowerCase()) {
    return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
  }
  return text
}

function buildTheme(agency = {}) {
  const primary = normalizeThemeColour(agency.primaryColour, '#102236')
  const secondary = normalizeThemeColour(agency.secondaryColour, '#21445f')
  const accent = normalizeThemeColour(agency.accentColour, '#f5b83c')
  return {
    primary,
    secondary,
    accent,
    accentText: getContrastTextColour(accent),
    hero: `linear-gradient(135deg, ${hexToRgba(primary, 0.96)} 0%, ${hexToRgba(secondary, 0.88)} 100%)`,
  }
}

function normalizePhoneHref(value = '') {
  const text = normalizeText(value).replace(/[^\d+]/g, '')
  return text ? `tel:${text}` : ''
}

function normalizeWhatsAppHref(value = '', fallbackText = '') {
  const digits = normalizeText(value).replace(/[^\d]/g, '')
  if (digits) return `https://wa.me/${digits}`
  return fallbackText ? `https://wa.me/?text=${encodeURIComponent(fallbackText)}` : ''
}

function RoundContactLink({ icon: Icon, label, href = '', onClick = null }) {
  const icon = Icon ? createElement(Icon, { size: 22, strokeWidth: 2.4 }) : null
  const disabled = !href && !onClick
  const className = `group flex w-full min-w-0 flex-col items-center gap-2 text-center ${disabled ? 'pointer-events-none opacity-45' : ''}`
  const content = (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--card-primary)] text-white shadow-[0_12px_26px_rgba(15,23,42,0.2)] ring-1 ring-white/70 transition group-hover:-translate-y-0.5 group-hover:brightness-110">
        {icon}
      </span>
      <span className="text-[0.82rem] font-semibold text-slate-950">{label}</span>
    </>
  )

  if (!href) {
    return (
      <button type="button" className={className} onClick={disabled ? undefined : onClick || undefined}>
        {content}
      </button>
    )
  }

  return (
    <a className={className} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined} onClick={onClick || undefined}>
      {content}
    </a>
  )
}

function IntentCta({ icon: Icon, title, subtitle, href, onClick = null, tone = 'primary' }) {
  const icon = Icon ? createElement(Icon, { size: 27, strokeWidth: 1.9 }) : null
  const toneClass = tone === 'accent'
    ? 'bg-[linear-gradient(135deg,var(--card-accent)_0%,rgba(184,134,28,0.96)_100%)] text-[var(--card-accent-text)] shadow-[0_16px_34px_rgba(184,134,28,0.24)]'
    : 'bg-[linear-gradient(135deg,var(--card-primary)_0%,var(--card-secondary)_100%)] text-white shadow-[0_16px_34px_rgba(15,23,42,0.22)]'
  const secondaryTextClass = tone === 'accent' ? 'text-[var(--card-accent-text)]/78' : 'text-white/78'
  const iconBorderClass = tone === 'accent' ? 'border-[var(--card-accent-text)]/72 text-[var(--card-accent-text)]' : 'border-white/78 text-white'

  return (
    <a
      href={href}
      onClick={onClick || undefined}
      className={`group flex min-h-[86px] w-full min-w-0 items-center gap-4 rounded-lg px-5 py-4 transition hover:-translate-y-0.5 hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-[var(--card-primary)]/20 ${toneClass}`}
    >
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 ${iconBorderClass}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.15rem] font-semibold leading-6">{title}</span>
        <span className={`mt-1 block text-[0.86rem] leading-5 ${secondaryTextClass}`}>{subtitle}</span>
      </span>
      <ChevronRight className="shrink-0 transition group-hover:translate-x-1" size={28} strokeWidth={2.2} />
    </a>
  )
}

function ListingCard({ listing, intakeSlug = '', onTrack = () => {} }) {
  const price = formatCurrency(listing.askingPrice)
  const location = formatLocation(listing)
  const enquiryParams = new URLSearchParams({
    intent: 'buy',
    listing: listing.slug || '',
    listingId: listing.id || '',
    listingTitle: listing.title || '',
    listingPrice: listing.askingPrice ? String(listing.askingPrice) : '',
    source: 'card',
  })
  const enquiryUrl = `/intake/${encodeURIComponent(intakeSlug)}?${enquiryParams.toString()}`

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
      <div className="aspect-[4/3] bg-slate-100">
        {listing.coverImageUrl ? (
          <img src={listing.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Home size={30} />
          </div>
        )}
      </div>
      <div className="p-4">
        {price ? <p className="text-[0.95rem] font-semibold text-slate-950">{price}</p> : null}
        <h3 className="mt-1 line-clamp-2 min-h-[2.75rem] text-[0.98rem] font-semibold leading-6 text-slate-900">{listing.title || 'Property listing'}</h3>
        {location ? <p className="mt-1 truncate text-sm text-slate-500">{location}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          {listing.bedrooms ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1"><BedDouble size={13} /> {listing.bedrooms}</span> : null}
          {listing.bathrooms ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1"><Bath size={13} /> {listing.bathrooms}</span> : null}
          {listing.propertyType ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1"><Building2 size={13} /> {listing.propertyType}</span> : null}
        </div>
        <a
          href={enquiryUrl}
          onClick={() => onTrack('listing_click', {
            listingId: listing.id || '',
            listingSlug: listing.slug || '',
            listingTitle: listing.title || '',
          })}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--card-primary)] px-4 text-sm font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[var(--card-primary)]/20"
        >
          Enquire <ExternalLink size={15} />
        </a>
      </div>
    </article>
  )
}

export default function PublicAgentDigitalCardPage() {
  const { cardSlug = '' } = useParams()
  const [intake, setIntake] = useState(null)
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [listingLoading, setListingLoading] = useState(false)
  const [error, setError] = useState('')
  const trackedViewRef = useRef('')

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setLoading(true)
        setError('')
        return resolveAgencyPublicAgentCard(cardSlug)
      })
      .then((resolved) => {
        if (!cancelled && resolved) setIntake(resolved)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || 'This digital card is not available.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cardSlug])

  useEffect(() => {
    if (!intake?.card?.enabled) return undefined
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (cancelled) return []
        setListingLoading(true)
        return resolveAgencyPublicCardListings(cardSlug, { limit: 6 })
      })
      .then((items) => {
        if (!cancelled) setListings(items)
      })
      .catch(() => {
        if (!cancelled) setListings([])
      })
      .finally(() => {
        if (!cancelled) setListingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cardSlug, intake?.card?.enabled])

  useEffect(() => {
    if (!intake?.card?.agent?.name && !intake?.agency?.name) return undefined
    const previousTitle = document.title
    document.title = `${intake.card.agent.name || 'Agent'} | ${intake.agency.name || 'Digital card'}`
    return () => {
      document.title = previousTitle
    }
  }, [intake?.agency?.name, intake?.card?.agent?.name])

  useEffect(() => {
    if (!intake?.card?.enabled || !cardSlug) return
    const viewKey = `${cardSlug}:${intake.updatedAt || ''}`
    if (trackedViewRef.current === viewKey) return
    trackedViewRef.current = viewKey
    recordAgentDigitalCardEventSoon({
      slug: cardSlug,
      eventType: 'card_view',
      metadata: {
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    })
  }, [cardSlug, intake?.card?.enabled, intake?.updatedAt])

  const theme = useMemo(() => buildTheme(intake?.agency || {}), [intake?.agency])
  const agent = intake?.card?.agent || {}
  const agency = intake?.agency || {}
  const agencyName = normalizeText(agency.name) || 'Agency'
  const agentName = normalizeText(agent.name) || agencyName
  const jobTitle = formatDisplayRole(agent.jobTitle) || 'Property Practitioner'
  const phone = normalizeText(agent.phone)
  const whatsapp = normalizeText(agent.whatsapp || agent.phone)
  const email = normalizeText(agent.email)
  const shareUrl = typeof window !== 'undefined' ? window.location.href : intake?.cardUrl || ''
  const intakeUrl = `/intake/${encodeURIComponent(cardSlug)}`
  const buyerUrl = `${intakeUrl}?intent=buy&source=card`
  const sellerUrl = `${intakeUrl}?intent=sell&source=card`
  const shareText = buildAgentDigitalCardShareText({
    agentName,
    organisationName: agencyName,
    shareUrl,
  })
  const heroLogoUrl = normalizeText(agency.logoDarkUrl || agency.logoLightUrl || agency.logoUrl || agency.logoIconUrl)

  function trackCardEvent(eventType, metadata = {}) {
    recordAgentDigitalCardEventSoon({
      slug: cardSlug,
      eventType,
      metadata: {
        ...metadata,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    })
  }

  function downloadVcard() {
    trackCardEvent('vcf_download')
    const fileBaseName = buildAgentDigitalCardFileBaseName({ agentName, organisationName: agencyName })
    const vcard = buildAgentDigitalCardVcard({
      agentName,
      agentEmail: email,
      agentPhone: phone || whatsapp,
      agentJobTitle: jobTitle,
      organisationName: agencyName,
      shareUrl,
    })
    downloadAgentDigitalCardTextFile({
      fileName: `${fileBaseName}.vcf`,
      text: vcard,
      mimeType: 'text/vcard;charset=utf-8',
    })
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <LoaderCircle className="mr-2 animate-spin" size={20} /> Loading digital card...
      </main>
    )
  }

  if (error || !intake?.card?.enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <h1 className="text-xl font-semibold text-slate-950">Digital card unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error || 'This link is not an active agent digital card.'}</p>
        </section>
      </main>
    )
  }

  return (
    <main
      className="relative min-h-screen overflow-x-hidden text-slate-950"
      style={{
        '--card-primary': theme.primary,
        '--card-secondary': theme.secondary,
        '--card-accent': theme.accent,
        '--card-accent-text': theme.accentText,
        backgroundColor: theme.primary,
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -bottom-[36rem] -right-[30rem] h-[78rem] w-[78rem] rounded-full border-[8rem]"
          style={{ borderColor: hexToRgba(theme.secondary, 0.34) }}
        />
        <div
          className="absolute -bottom-[27rem] -right-[21rem] h-[60rem] w-[60rem] rounded-full border-2"
          style={{ borderColor: hexToRgba(theme.secondary, 0.58) }}
        />
      </div>

      <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1600px] min-w-0 gap-5 px-4 py-5 sm:px-6 lg:min-h-0 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] lg:items-stretch lg:px-8 lg:py-5 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] xl:gap-7">
        <aside className="overflow-hidden rounded-lg border border-white/15 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)] lg:sticky lg:top-10 lg:self-start">
          <div className="px-6 pb-24 pt-7 text-white lg:pb-20 lg:pt-5" style={{ background: theme.hero }}>
            <div className="flex items-center justify-center">
              {heroLogoUrl ? (
                <img src={heroLogoUrl} alt={agencyName} className="max-h-24 w-full max-w-[340px] object-contain sm:max-h-28" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-2xl font-semibold text-white">
                  {agencyName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-6 lg:pb-5">
            <div className="-mt-20 flex flex-col items-center text-center">
              {agent.avatarUrl ? (
                <img src={agent.avatarUrl} alt="" className="h-40 w-40 rounded-full border-[6px] border-white object-cover shadow-[0_20px_44px_rgba(15,23,42,0.24)]" />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center rounded-full border-[6px] border-white bg-slate-100 text-5xl font-semibold text-[var(--card-primary)] shadow-[0_20px_44px_rgba(15,23,42,0.24)]">
                  {agentName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <h1 className="mt-5 text-[2.15rem] font-semibold leading-none text-slate-950 lg:mt-4">{agentName}</h1>
              <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-base">
                <span className="font-semibold text-[var(--card-accent)]">{jobTitle}</span>
                <span className="text-slate-300">|</span>
                <span className="font-medium text-slate-950">{agencyName}</span>
              </p>
            </div>

            <div className="mt-7 grid grid-cols-4 gap-3 lg:mt-5">
              <RoundContactLink icon={Phone} label="Call" href={normalizePhoneHref(phone)} onClick={() => trackCardEvent('call_click')} />
              <RoundContactLink icon={MessageCircle} label="WhatsApp" href={normalizeWhatsAppHref(whatsapp, shareText)} onClick={() => trackCardEvent('whatsapp_click')} />
              <RoundContactLink icon={Mail} label="Email" href={email ? `mailto:${email}` : ''} onClick={() => trackCardEvent('email_click')} />
              <RoundContactLink icon={UserPlus} label="Save" onClick={downloadVcard} />
            </div>

            <div className="mt-6 grid gap-3 lg:mt-5">
              <IntentCta
                icon={Home}
                title={intake.intake?.buyerCtaLabel || 'I am looking to buy'}
                subtitle="Let me help you find your perfect home"
                href={buyerUrl}
                onClick={() => trackCardEvent('buyer_cta_click')}
              />
              <IntentCta
                icon={Tag}
                title={intake.intake?.sellerCtaLabel || 'I am looking to sell'}
                subtitle="Get a free market assessment"
                href={sellerUrl}
                onClick={() => trackCardEvent('seller_cta_click')}
                tone="accent"
              />
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/25 bg-white/[0.08] p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-6 lg:h-full">
          <div>
            <div>
              <p className="text-xs font-semibold uppercase text-white/60">My Listings</p>
              <h2 className="mt-1 text-2xl font-semibold text-white/90">Featured Properties</h2>
            </div>
          </div>

          {listingLoading ? (
            <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">
              <LoaderCircle className="mr-2 animate-spin" size={18} /> Loading listings...
            </div>
          ) : listings.length ? (
            <div className="mt-5 grid min-w-0 gap-4 overflow-y-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard key={listing.id || listing.slug} listing={listing} intakeSlug={cardSlug} onTrack={trackCardEvent} />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
              <Home className="mx-auto text-slate-400" size={30} />
              <h3 className="mt-3 text-base font-semibold text-slate-900">No public listings linked yet</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Buyer and seller enquiries still route directly to {agentName}.</p>
            </div>
          )}

          <footer className="mt-auto flex flex-col gap-3 border-t border-slate-200 pt-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{email || phone || agency.contactEmail || agency.contactPhone}</span>
            <span className="font-semibold text-slate-700">Powered by ARCH9</span>
          </footer>
        </section>
      </section>
    </main>
  )
}
