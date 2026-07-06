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
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/20 bg-white/90 p-2 shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
          <img
            src={logoUrl}
            alt={`${safeName} logo`}
            className="max-h-8 w-auto max-w-8 object-contain"
          />
        </span>
        <span className="hidden min-w-0 text-sm font-semibold leading-5 text-white sm:block">
          {safeName}
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[#4ee481]/60 bg-[#4ee481]/10 text-[#58e884] shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <Home size={25} strokeWidth={1.8} />
      </span>
      <span className="hidden min-w-0 text-sm font-semibold leading-5 text-white sm:block">
        {safeName}
      </span>
    </div>
  )
}

function PoweredByPill() {
  return (
    <div className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-[#0d1a24]/60 px-3 text-sm font-semibold text-white/75 shadow-[0_16px_34px_rgba(0,0,0,0.24)] backdrop-blur-xl">
      <span>Powered by</span>
      <span className="rounded-full bg-white px-3 py-1 text-[#111b28]">arch9</span>
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
    <section className="relative isolate min-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[32px] border border-white/10 bg-[#061019] text-white shadow-[0_28px_72px_rgba(2,8,23,0.36)] sm:min-h-[760px]">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${resolvedBackgroundImage}")` }}
      />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,18,0.74)_0%,rgba(4,12,18,0.48)_34%,rgba(3,8,13,0.9)_100%)]" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_22%_16%,rgba(61,220,132,0.18),transparent_34%),linear-gradient(128deg,rgba(3,10,18,0.92)_0%,rgba(6,21,30,0.78)_48%,rgba(2,7,12,0.94)_100%)]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent_0%,rgba(2,8,13,0.92)_100%)]" />

      <div className="relative z-10 flex min-h-[calc(100dvh-1.5rem)] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:min-h-[760px] sm:px-8 sm:py-8">
        <header className="flex items-center justify-between gap-4">
          <AgencyLogo logoUrl={agencyLogo} agencyName={agencyName} />
          <PoweredByPill />
        </header>

        <div className="flex flex-1 flex-col justify-end pt-10">
          <div className="max-w-[620px]">
            <p className="text-sm font-semibold uppercase text-[#50e37f]">{content.label}</p>
            <h1 className="mt-5 text-[3.35rem] font-semibold leading-[1.02] text-white max-[380px]:text-[2.85rem] sm:text-[4.5rem]">
              {content.headlinePrefix}
              <span className="block text-[#45d36d]">{content.headlineAccent}</span>
            </h1>
            <p className="mt-5 max-w-[460px] text-[1.05rem] leading-7 text-white/80 sm:text-xl sm:leading-8">
              {content.subtext}
            </p>
          </div>

          <article className="mt-9 rounded-[28px] border border-white/20 bg-white/10 p-5 shadow-[0_22px_56px_rgba(0,0,0,0.32)] backdrop-blur-2xl sm:max-w-[480px]">
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#58e884]/30 bg-[#45d36d]/15 text-[#55e780] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <Icon size={31} strokeWidth={1.8} />
              </span>
              <ChevronRight size={24} className="shrink-0 text-[#55e780]" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold leading-tight text-white">{content.cardTitle}</h2>
            <p className="mt-2 text-base leading-6 text-white/70">{content.cardText}</p>
            {preparedFor || address ? (
              <div className="mt-5 rounded-[20px] border border-white/15 bg-black/20 px-4 py-3 text-sm leading-6 text-white/70">
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
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#45d36d]/15 text-[#55e780]">
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
            className="mt-8 inline-flex min-h-[60px] w-full items-center justify-center gap-3 rounded-[18px] bg-[#15983f] px-5 py-4 text-base font-semibold text-white shadow-[0_18px_38px_rgba(18,152,63,0.34)] transition hover:bg-[#128639] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65ef91] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111a] sm:max-w-[500px]"
          >
            {content.cta}
            <ChevronRight size={21} />
          </button>
        </div>
      </div>
    </section>
  )
}
