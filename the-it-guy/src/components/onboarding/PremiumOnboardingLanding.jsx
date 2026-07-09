import { Bookmark, ChevronRight, ClipboardCheck, Clock3, Home, MapPin, ShieldCheck } from 'lucide-react'
import { buildClientBrandCssVars, resolveClientBrandTheme } from '../../lib/clientBrandTheme.js'

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

function normalizePortalType(value = '') {
  return value === 'seller' ? 'seller' : 'buyer'
}

function escapeInlineCssUrl(value = '') {
  return String(value || '').trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function resolveLandingTheme({ brandTheme = null, agencyLogo = '', agencyName = '', backgroundImage = '' } = {}) {
  if (brandTheme && typeof brandTheme === 'object') {
    return brandTheme.primaryColor ? brandTheme : resolveClientBrandTheme(brandTheme)
  }

  return resolveClientBrandTheme({
    legacyBranding: {
      organisationName: agencyName,
      agencyName,
      logoUrl: agencyLogo,
      logoDarkUrl: agencyLogo,
      logoLightUrl: agencyLogo,
    },
    fallback: {
      heroImageUrl: backgroundImage,
    },
  })
}

function AgencyLogo({ logoUrl = '', agencyName = '' }) {
  const safeName = String(agencyName || '').trim() || 'Your Agency'

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${safeName} logo`}
        className="h-14 w-auto max-w-[230px] object-contain drop-shadow-[0_16px_30px_rgba(0,0,0,0.35)] sm:h-16 sm:max-w-[280px]"
      />
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border text-[var(--client-brand-accent)] shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--client-brand-accent) 12%, transparent)',
          borderColor: 'color-mix(in srgb, var(--client-brand-accent) 62%, transparent)',
        }}
      >
        <Home size={25} strokeWidth={1.8} />
      </span>
      <span className="hidden min-w-0 text-sm font-semibold leading-5 text-white sm:block">
        {safeName}
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
  brandTheme = null,
  onStart,
}) {
  const type = normalizePortalType(portalType)
  const content = CONTENT[type]
  const theme = resolveLandingTheme({ brandTheme, agencyLogo, agencyName, backgroundImage })
  const themeCssVars = buildClientBrandCssVars(theme)
  const resolvedAgencyLogo = agencyLogo || theme.logoDarkUrl || theme.logoUrl || theme.logoLightUrl || ''
  const resolvedAgencyName = agencyName || theme.organisationName || ''
  const resolvedBackgroundImage = theme.heroImageUrl || backgroundImage || DEFAULT_BACKGROUND_IMAGES[type]
  const landingStyle = {
    ...themeCssVars,
    '--premium-onboarding-background-image': `url("${escapeInlineCssUrl(resolvedBackgroundImage)}")`,
  }
  const safePersonName = String(personName || '').trim()
  const safePropertyAddress = String(propertyAddress || '').trim()
  const contextRows = [
    safePropertyAddress ? { icon: MapPin, label: 'Property', value: safePropertyAddress } : null,
    { icon: ClipboardCheck, label: 'Process', value: type === 'seller' ? 'Seller intake and property details' : 'Buyer intake and purchase details' },
  ].filter(Boolean)

  return (
    <section
      className="relative isolate min-h-screen overflow-hidden bg-[var(--client-brand-primary)] text-white"
      style={landingStyle}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'var(--premium-onboarding-background-image)' }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, var(--client-brand-overlay) 0%, color-mix(in srgb, var(--client-brand-primary) 90%, transparent) 42%, color-mix(in srgb, var(--client-brand-primary) 68%, transparent) 72%, var(--client-brand-overlay) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--client-brand-primary) 28%, transparent) 0%, color-mix(in srgb, var(--client-brand-primary) 74%, transparent) 100%)',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 sm:py-7 lg:px-10 lg:py-8">
        <header className="flex items-center justify-between gap-4">
          <AgencyLogo logoUrl={resolvedAgencyLogo} agencyName={resolvedAgencyName} />
          <span className="hidden rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase text-white/75 backdrop-blur-xl sm:inline-flex">
            Secure intake
          </span>
        </header>

        <div className="grid flex-1 items-center gap-8 py-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12 lg:py-8 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="max-w-[720px]">
            {safePersonName ? <p className="mb-4 text-base font-semibold text-white/80">Hi {safePersonName},</p> : null}
            <p className="text-sm font-semibold uppercase text-[var(--client-brand-accent)]">{content.label}</p>
            <h1 className="mt-4 max-w-[700px] text-[3.2rem] font-semibold leading-none text-white">
              {content.headlinePrefix}{' '}
              <span className="block text-[var(--client-brand-accent)]">{content.headlineAccent}</span>
            </h1>
            <p className="mt-5 max-w-[540px] text-lg leading-8 text-white/80">
              {content.subtext}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {REASSURANCE_ROWS.map((item) => {
                const RowIcon = item.icon
                return (
                  <div key={item.title} className="flex min-h-[74px] min-w-[190px] flex-1 items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-xl sm:max-w-[230px]">
                    <span
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--client-brand-accent)]"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--client-brand-accent) 14%, transparent)' }}
                    >
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
              className="mt-8 inline-flex min-h-[58px] w-full items-center justify-center gap-3 rounded-[18px] bg-[var(--client-brand-accent)] px-6 py-4 text-base font-semibold text-[var(--client-brand-accent-contrast)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--client-brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--client-brand-primary)] sm:w-auto sm:min-w-[270px]"
              style={{ boxShadow: '0 18px 38px color-mix(in srgb, var(--client-brand-accent) 28%, transparent)' }}
            >
              {content.cta}
              <ChevronRight size={21} />
            </button>
          </div>

          <aside className="rounded-lg border border-white/15 bg-white/10 p-5 shadow-[0_24px_58px_rgba(0,0,0,0.28)] backdrop-blur-2xl lg:p-6">
            <p className="text-xs font-semibold uppercase text-[var(--client-brand-accent)]">Before you start</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">A few details, captured once.</h2>
            <div className="mt-5 grid gap-3">
              {contextRows.map((row) => {
                const RowIcon = row.icon
                return (
                  <div key={row.label} className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/15 p-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-[var(--client-brand-accent)]">
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
