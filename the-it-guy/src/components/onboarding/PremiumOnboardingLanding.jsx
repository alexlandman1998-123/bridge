import { Bookmark, ChevronRight, ClipboardCheck, Clock3, Home, MapPin, ShieldCheck } from 'lucide-react'

const DEFAULT_BACKGROUND_IMAGES = {
  buyer: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=82',
  seller: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=82',
}

const CONTENT = {
  buyer: {
    label: 'BUYER ONBOARDING',
    headlinePrefix: 'Let’s get your property',
    headlineAccent: 'purchase started.',
    subtext: 'A quick and easy buyer intake to help us get the right details for your purchase.',
    cta: 'Start buyer onboarding',
  },
  seller: {
    label: 'SELLER ONBOARDING',
    headlinePrefix: 'Let’s get your property',
    headlineAccent: 'sale started.',
    subtext: 'A quick and easy seller intake to help us get your property sale on the move.',
    cta: 'Start seller onboarding',
  },
}

const REASSURANCE_ROWS = [
  {
    title: 'Takes about 10 minutes',
    description: 'Quick and simple process',
    icon: Clock3,
  },
  {
    title: 'Information is secure',
    description: 'Your data is safe with us',
    icon: ShieldCheck,
  },
  {
    title: 'Save and continue later',
    description: 'Pick up where you left off',
    icon: Bookmark,
  },
]

const DEFAULT_THEME = {
  primary: '#494b8a',
  secondary: '#000000',
  accent: '#ceac69',
}

function normalizePortalType(value = '') {
  return value === 'seller' ? 'seller' : 'buyer'
}

function normalizeThemeColour(value = '', fallback = '') {
  const text = String(value || '').trim()
  if (!text) return fallback
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text.slice(1).split('').map((char) => `${char}${char}`).join('')}`
  }
  if (/^#[0-9a-f]{6}$/i.test(text)) return text
  return fallback
}

function hexToRgb(hex = DEFAULT_THEME.primary) {
  const safeHex = normalizeThemeColour(hex, DEFAULT_THEME.primary).slice(1)
  const value = Number.parseInt(safeHex, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function hexToRgba(hex = DEFAULT_THEME.primary, alpha = 1) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getContrastTextColour(hex = DEFAULT_THEME.accent, darkText = DEFAULT_THEME.secondary) {
  const { r, g, b } = hexToRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? darkText : '#ffffff'
}

function resolveTheme({ primaryColour = '', secondaryColour = '', accentColour = '' } = {}) {
  const primary = normalizeThemeColour(primaryColour, DEFAULT_THEME.primary)
  const secondary = normalizeThemeColour(secondaryColour, DEFAULT_THEME.secondary)
  const accent = normalizeThemeColour(accentColour, DEFAULT_THEME.accent)
  const accentText = getContrastTextColour(accent, secondary)

  return {
    primary,
    secondary,
    accent,
    accentText,
    accentSoft: hexToRgba(accent, 0.14),
    accentBorder: hexToRgba(accent, 0.6),
    accentShadow: hexToRgba(accent, 0.28),
    primaryMuted: hexToRgba(primary, 0.4),
    overlayHorizontal: `linear-gradient(90deg, ${hexToRgba(primary, 0.96)} 0%, ${hexToRgba(secondary, 0.9)} 42%, ${hexToRgba(secondary, 0.68)} 72%, ${hexToRgba(primary, 0.88)} 100%)`,
    overlayVertical: `linear-gradient(180deg, ${hexToRgba(primary, 0.28)} 0%, ${hexToRgba(primary, 0.74)} 100%)`,
  }
}

function AgencyLogo({ logoUrl = '', agencyName = '' }) {
  const safeName = String(agencyName || '').trim() || 'Your Agency'

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${safeName} logo`}
        className="h-20 w-auto max-w-[320px] object-contain drop-shadow-[0_18px_34px_rgba(0,0,0,0.38)] sm:h-24 sm:max-w-[420px]"
      />
    )
  }

  return (
    <div className="flex min-w-0 items-center">
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border bg-[var(--landing-accent-soft)] text-[var(--landing-accent)] shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl" style={{ borderColor: 'var(--landing-accent-border)' }}>
        <Home size={25} strokeWidth={1.8} />
      </span>
    </div>
  )
}

export default function PremiumOnboardingLanding({
  portalType = 'buyer',
  agencyLogo = '',
  agencyName = '',
  personName = '',
  propertyAddress = '',
  backgroundImage = '',
  primaryColour = '',
  secondaryColour = '',
  accentColour = '',
  onStart,
}) {
  const type = normalizePortalType(portalType)
  const content = CONTENT[type]
  const resolvedBackgroundImage = backgroundImage || DEFAULT_BACKGROUND_IMAGES[type]
  const theme = resolveTheme({ primaryColour, secondaryColour, accentColour })
  const safePersonName = String(personName || '').trim()
  const safePropertyAddress = String(propertyAddress || '').trim()
  const contextRows = [
    safePropertyAddress ? { icon: MapPin, label: 'Property', value: safePropertyAddress } : null,
    { icon: ClipboardCheck, label: 'Process', value: type === 'seller' ? 'Seller intake and property details' : 'Buyer intake and purchase details' },
  ].filter(Boolean)

  return (
    <section
      className="relative isolate min-h-screen overflow-hidden text-white"
      style={{
        '--landing-primary': theme.primary,
        '--landing-secondary': theme.secondary,
        '--landing-accent': theme.accent,
        '--landing-accent-text': theme.accentText,
        '--landing-accent-soft': theme.accentSoft,
        '--landing-accent-border': theme.accentBorder,
        '--landing-accent-shadow': theme.accentShadow,
        '--landing-primary-muted': theme.primaryMuted,
        backgroundColor: theme.primary,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${resolvedBackgroundImage}")` }}
      />
      <div aria-hidden className="absolute inset-0" style={{ background: theme.overlayHorizontal }} />
      <div aria-hidden className="absolute inset-0" style={{ background: theme.overlayVertical }} />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 sm:py-7 lg:px-10 lg:py-8">
        <header className="flex items-center">
          <AgencyLogo logoUrl={agencyLogo} agencyName={agencyName} />
        </header>

        <div className="grid flex-1 items-center gap-8 py-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12 lg:py-8 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="max-w-[720px]">
            {safePersonName ? <p className="mb-4 text-base font-semibold text-white/80">Hi {safePersonName},</p> : null}
            <p className="text-sm font-semibold uppercase text-[var(--landing-accent)]">{content.label}</p>
            <h1 className="mt-4 max-w-[700px] text-[3.2rem] font-semibold leading-none text-white">
              {content.headlinePrefix}{' '}
              <span className="block text-[var(--landing-accent)]">{content.headlineAccent}</span>
            </h1>
            <p className="mt-5 max-w-[540px] text-lg leading-8 text-white/80">
              {content.subtext}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {REASSURANCE_ROWS.map((item) => {
                const RowIcon = item.icon
                return (
                  <div key={item.title} className="flex min-h-[74px] min-w-[190px] flex-1 items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-xl sm:max-w-[230px]">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--landing-accent-soft)] text-[var(--landing-accent)]">
                      <RowIcon size={20} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-5 text-white">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-white/60">{item.description}</span>
                    </span>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={onStart}
              className="mt-8 inline-flex min-h-[58px] w-full items-center justify-center gap-3 rounded-[18px] bg-[var(--landing-accent)] px-6 py-4 text-base font-semibold text-[var(--landing-accent-text)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-primary)] sm:w-auto sm:min-w-[270px]"
              style={{ boxShadow: `0 18px 38px ${theme.accentShadow}` }}
            >
              {content.cta}
              <ChevronRight size={21} />
            </button>
          </div>

          <aside className="rounded-lg border border-white/15 bg-white/10 p-5 shadow-[0_24px_58px_rgba(0,0,0,0.28)] backdrop-blur-2xl lg:p-6">
            <p className="text-xs font-semibold uppercase text-[var(--landing-accent)]">Before you start</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">A few details, captured once.</h2>
            <div className="mt-5 grid gap-3">
              {contextRows.map((row) => {
                const RowIcon = row.icon
                return (
                  <div key={row.label} className="flex items-start gap-3 rounded-lg border border-white/10 bg-[var(--landing-primary-muted)] p-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-[var(--landing-accent)]">
                      <RowIcon size={19} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold uppercase text-white/50">{row.label}</span>
                      <span className="mt-1 block text-sm font-semibold leading-6 text-white">{row.value}</span>
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-5 text-sm leading-6 text-white/60">
              You can save and continue later. Your agent will use this information to prepare the listing, mandate, and document checklist.
            </p>
          </aside>
        </div>
      </div>
    </section>
  )
}
