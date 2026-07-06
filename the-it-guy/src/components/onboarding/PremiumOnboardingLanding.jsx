import { Bookmark, ChevronRight, Clock3, Home, Search, ShieldCheck } from 'lucide-react'

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
    cardTitle: "I'm a Buyer",
    cardText: 'I want to buy a property',
    cta: 'Start buyer onboarding',
    icon: Search,
  },
  seller: {
    label: 'SELLER ONBOARDING',
    headlinePrefix: 'Let’s get your property',
    headlineAccent: 'sale started.',
    subtext: 'A quick and easy seller intake to help us get your property sale on the move.',
    cardTitle: "I'm a Seller",
    cardText: 'I want to sell my property',
    cta: 'Start seller onboarding',
    icon: Home,
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
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[#f7cf22]/60 bg-[#f7cf22]/10 text-[#f7cf22] shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
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
  onStart,
}) {
  const type = normalizePortalType(portalType)
  const content = CONTENT[type]
  const Icon = content.icon
  const resolvedBackgroundImage = backgroundImage || DEFAULT_BACKGROUND_IMAGES[type]
  const preparedFor = String(personName || '').trim()
  const address = String(propertyAddress || '').trim()

  return (
    <section className="relative isolate min-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[32px] border border-[#f7cf22]/20 bg-[#001a3d] text-white shadow-[0_28px_72px_rgba(0,16,45,0.38)] sm:min-h-[760px]">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${resolvedBackgroundImage}")` }}
      />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,20,52,0.82)_0%,rgba(0,31,74,0.62)_36%,rgba(0,13,35,0.94)_100%)]" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_24%_14%,rgba(247,207,34,0.18),transparent_34%),linear-gradient(128deg,rgba(0,22,56,0.94)_0%,rgba(0,35,79,0.82)_50%,rgba(0,12,33,0.96)_100%)]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent_0%,rgba(0,12,33,0.94)_100%)]" />

      <div className="relative z-10 flex min-h-[calc(100dvh-1.5rem)] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:min-h-[760px] sm:px-8 sm:py-8">
        <header className="flex items-start">
          <AgencyLogo logoUrl={agencyLogo} agencyName={agencyName} />
        </header>

        <div className="flex flex-1 flex-col justify-end pt-10">
          <div className="max-w-[620px]">
            <p className="text-sm font-semibold uppercase text-[#f7cf22]">{content.label}</p>
            <h1 className="mt-5 text-[3.35rem] font-semibold leading-[1.02] text-white max-[380px]:text-[2.85rem] sm:text-[4.5rem]">
              {content.headlinePrefix}
              <span className="block text-[#f7cf22]">{content.headlineAccent}</span>
            </h1>
            <p className="mt-5 max-w-[460px] text-[1.05rem] leading-7 text-white/80 sm:text-xl sm:leading-8">
              {content.subtext}
            </p>
          </div>

          <article className="mt-9 rounded-[28px] border border-[#f7cf22]/24 bg-[#001f4d]/62 p-5 shadow-[0_22px_56px_rgba(0,10,31,0.38)] backdrop-blur-2xl sm:max-w-[480px]">
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#f7cf22]/45 bg-[#f7cf22]/14 text-[#f7cf22] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <Icon size={31} strokeWidth={1.8} />
              </span>
              <ChevronRight size={24} className="shrink-0 text-[#f7cf22]" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold leading-tight text-white">{content.cardTitle}</h2>
            <p className="mt-2 text-base leading-6 text-white/70">{content.cardText}</p>
            {preparedFor || address ? (
              <div className="mt-5 rounded-[20px] border border-[#f7cf22]/18 bg-[#000f27]/34 px-4 py-3 text-sm leading-6 text-white/72">
                {preparedFor ? <p className="font-semibold text-white/90">Prepared for {preparedFor}</p> : null}
                {address ? <p className={`${preparedFor ? 'mt-1 ' : ''}text-white/70`}>{address}</p> : null}
              </div>
            ) : null}
          </article>

          <div className="mt-8 space-y-5 sm:max-w-[500px]">
            {REASSURANCE_ROWS.map((item) => {
              const RowIcon = item.icon
              return (
                <div key={item.title} className="flex items-start gap-4">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f7cf22]/14 text-[#f7cf22]">
                    <RowIcon size={24} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold leading-6 text-white">{item.title}</span>
                    <span className="mt-0.5 block text-sm leading-6 text-white/60">{item.description}</span>
                  </span>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={onStart}
            className="mt-8 inline-flex min-h-[60px] w-full items-center justify-center gap-3 rounded-[18px] bg-[#f7cf22] px-5 py-4 text-base font-semibold text-[#001b44] shadow-[0_18px_38px_rgba(247,207,34,0.28)] transition hover:bg-[#ffd943] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe66b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#001a3d] sm:max-w-[500px]"
          >
            {content.cta}
            <ChevronRight size={21} />
          </button>
        </div>
      </div>
    </section>
  )
}
