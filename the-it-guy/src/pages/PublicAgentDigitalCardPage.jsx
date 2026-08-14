import {
  Bath,
  BedDouble,
  Building2,
  Copy,
  Download,
  ExternalLink,
  Home,
  LoaderCircle,
  Mail,
  MessageCircle,
  Phone,
  Share2,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  recordAgentDigitalCardEventSoon,
  resolveAgencyPublicCardListings,
  resolveAgencyPublicIntake,
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

function buildTheme(agency = {}) {
  const primary = normalizeThemeColour(agency.primaryColour, '#102236')
  const secondary = normalizeThemeColour(agency.secondaryColour, '#21445f')
  const accent = normalizeThemeColour(agency.accentColour, '#f5b83c')
  return {
    primary,
    secondary,
    accent,
    accentText: getContrastTextColour(accent),
    page: `linear-gradient(145deg, ${hexToRgba(primary, 0.97)} 0%, ${hexToRgba(secondary, 0.92)} 48%, #f7f9fc 48%, #f7f9fc 100%)`,
    hero: `linear-gradient(135deg, ${hexToRgba(primary, 0.96)} 0%, ${hexToRgba(secondary, 0.88)} 100%)`,
  }
}

function normalizeExternalUrl(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text
  return `https://${text}`
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

async function copyText(value = '') {
  const text = normalizeText(value)
  if (!text) return false
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  return false
}

function ContactButton({ icon: Icon, label, href, onClick = null, accent = false }) {
  const icon = Icon ? createElement(Icon, { size: 16 }) : null
  const className = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus:outline-none focus:ring-4 ${
    accent
      ? 'border border-transparent bg-[var(--card-accent)] text-[var(--card-accent-text)] shadow-[0_16px_34px_rgba(15,23,42,0.16)] hover:brightness-95 focus:ring-[var(--card-accent)]/25'
      : 'border border-slate-200 bg-white text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.06)] hover:border-slate-300 hover:bg-slate-50 focus:ring-slate-200'
  }`

  if (href) {
    return (
      <a className={className} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined} onClick={onClick || undefined}>
        {icon} {label}
      </a>
    )
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {icon} {label}
    </button>
  )
}

function ListingCard({ listing, intakeSlug = '', onTrack = () => {} }) {
  const price = formatCurrency(listing.askingPrice)
  const location = formatLocation(listing)
  const enquiryUrl = `/intake/${encodeURIComponent(intakeSlug)}?intent=buy&listing=${encodeURIComponent(listing.slug || '')}&listingId=${encodeURIComponent(listing.id || '')}&source=card`

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
  const [feedback, setFeedback] = useState('')
  const trackedViewRef = useRef('')

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setLoading(true)
        setError('')
        return resolveAgencyPublicIntake(cardSlug)
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
  const jobTitle = normalizeText(agent.jobTitle) || 'Property Practitioner'
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

  function showFeedback(message) {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 2200)
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
    const downloaded = downloadAgentDigitalCardTextFile({
      fileName: `${fileBaseName}.vcf`,
      text: vcard,
      mimeType: 'text/vcard;charset=utf-8',
    })
    showFeedback(downloaded ? 'Contact downloaded' : 'Download unavailable')
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
      className="min-h-screen bg-slate-50 text-slate-950"
      style={{
        '--card-primary': theme.primary,
        '--card-accent': theme.accent,
        '--card-accent-text': theme.accentText,
        background: theme.page,
      }}
    >
      <section className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-start lg:py-10">
        <aside className="overflow-hidden rounded-lg border border-white/15 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)] lg:sticky lg:top-8">
          <div className="px-6 pb-6 pt-7 text-white" style={{ background: theme.hero }}>
            <div className="flex items-start justify-between gap-4">
              {agency.logoUrl || agency.logoDarkUrl || agency.logoLightUrl ? (
                <img src={agency.logoUrl || agency.logoDarkUrl || agency.logoLightUrl} alt={agencyName} className="max-h-14 max-w-[190px] object-contain" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-lg font-semibold">
                  {agencyName.slice(0, 1).toUpperCase()}
                </div>
              )}
              {feedback ? <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold text-white">{feedback}</span> : null}
            </div>

            <div className="mt-7 flex flex-col items-center text-center">
              {agent.avatarUrl ? (
                <img src={agent.avatarUrl} alt="" className="h-32 w-32 rounded-full border-4 border-white object-cover shadow-[0_18px_38px_rgba(0,0,0,0.24)]" />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white bg-white/12 text-4xl font-semibold shadow-[0_18px_38px_rgba(0,0,0,0.24)]">
                  {agentName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em]">{agentName}</h1>
              <p className="mt-1 text-base font-medium text-white/78">{jobTitle}</p>
              <p className="mt-1 text-sm text-white/68">{agencyName}</p>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid grid-cols-3 gap-2">
              <ContactButton icon={Phone} label="Call" href={normalizePhoneHref(phone)} onClick={() => trackCardEvent('call_click')} />
              <ContactButton icon={MessageCircle} label="WhatsApp" href={normalizeWhatsAppHref(whatsapp, shareText)} onClick={() => trackCardEvent('whatsapp_click')} />
              <ContactButton icon={Mail} label="Email" href={email ? `mailto:${email}` : ''} onClick={() => trackCardEvent('email_click')} />
            </div>

            <div className="grid gap-3">
              <ContactButton icon={Home} label={intake.intake?.buyerCtaLabel || 'I am looking to buy'} href={buyerUrl} onClick={() => trackCardEvent('buyer_cta_click')} accent />
              <ContactButton icon={Building2} label={intake.intake?.sellerCtaLabel || 'I am looking to sell'} href={sellerUrl} onClick={() => trackCardEvent('seller_cta_click')} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <ContactButton icon={Download} label="Save Contact" onClick={downloadVcard} />
              <ContactButton icon={Share2} label="Share" href={normalizeWhatsAppHref('', shareText)} onClick={() => trackCardEvent('share_click')} />
              <ContactButton icon={Copy} label="Copy Link" onClick={() => {
                trackCardEvent('copy_link')
                copyText(shareUrl).then((copied) => showFeedback(copied ? 'Link copied' : 'Copy unavailable'))
              }} />
              {agency.website ? <ContactButton icon={ExternalLink} label="Website" href={normalizeExternalUrl(agency.website)} onClick={() => trackCardEvent('website_click')} /> : null}
            </div>
          </div>
        </aside>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white/96 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">My Listings</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Featured Properties</h2>
            </div>
            <a href={buyerUrl} onClick={() => trackCardEvent('buyer_cta_click', { placement: 'listings_header' })} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Buyer enquiry
            </a>
          </div>

          {listingLoading ? (
            <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">
              <LoaderCircle className="mr-2 animate-spin" size={18} /> Loading listings...
            </div>
          ) : listings.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

          <footer className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{email || phone || agency.contactEmail || agency.contactPhone}</span>
            <span className="font-semibold text-slate-700">Powered by ARCH9</span>
          </footer>
        </section>
      </section>
    </main>
  )
}
