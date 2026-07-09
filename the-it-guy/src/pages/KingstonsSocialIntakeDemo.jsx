import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  CalendarDays,
  Car,
  Check,
  ChevronRight,
  ClipboardCheck,
  Heart,
  Home,
  Info,
  ListChecks,
  MapPin,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { createElement, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  bedroomOptions,
  buyerAreaOptions,
  buyerBudgetOptions,
  buyerFeatureOptions,
  buyerPropertyTypeOptions,
  createBuyerLead,
  createSellerLead,
  createValuationRequest,
  createViewingRequest,
  demoProperties,
  formatRand,
  getBudgetRange,
  matchPropertiesToBuyer,
  readKingstonsDemoState,
  resetKingstonsDemoState,
  sellerFeatureOptions,
  sellerPriceOptions,
} from '../lib/kingstonsSocialIntakeDemo'

const buyerSteps = ['Area', 'Budget', 'Bedrooms', 'Type', 'Features', 'Homes']
const sellerSteps = ['Address', 'Property', 'Features', 'Price', 'Booking']

const initialBuyer = {
  area: '',
  budget: '',
  budgetMin: '',
  budgetMax: '',
  beds: '',
  baths: '',
  propertyType: '',
  features: [],
  selectedPropertyIds: [],
  name: '',
  phone: '',
}

const initialSeller = {
  streetAddress: '',
  suburb: '',
  beds: '',
  baths: '',
  garages: '',
  propertyType: '',
  features: [],
  expectedPrice: '',
  name: '',
  phone: '',
  preferredDay: '',
  preferredTime: '',
}

const KINGSTONS_LANDING_BACKGROUND =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=82'

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

function toWhatsappNumber(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('0')) return `27${digits.slice(1)}`
  return digits
}

function KingstonsLogo({ size = 'large' }) {
  const isSmall = size === 'small'

  return (
    <div className="flex flex-col items-center">
      <div
        className={classNames(
          'grid place-items-center rounded-lg border border-[#f5bb05] bg-[#071b31] shadow-[0_12px_28px_rgba(1,18,34,0.28)]',
          isSmall ? 'h-11 w-11' : 'h-16 w-16',
        )}
      >
        <span className={classNames('font-black italic leading-none text-[#f5bb05]', isSmall ? 'text-2xl' : 'text-4xl')}>
          K
        </span>
      </div>
      {!isSmall ? (
        <p className="mt-2 text-center text-sm font-bold italic leading-none text-white [letter-spacing:0]">Kingstons</p>
      ) : null}
    </div>
  )
}

function DemoShell({ children, compact = false }) {
  return (
    <main className="min-h-screen bg-[#f5f6f8] text-[#071b31] [letter-spacing:0]">
      <div
        className={classNames(
          'mx-auto flex min-h-screen w-full flex-col',
          compact
            ? 'max-w-[1120px] px-4 py-5 sm:px-5'
            : 'max-w-[430px] bg-white px-4 py-4 shadow-[0_24px_80px_rgba(7,27,49,0.08)] sm:my-5 sm:min-h-[860px] sm:rounded-[30px] sm:border sm:border-[#dce1e7]',
        )}
      >
        {children}
      </div>
    </main>
  )
}

function DemoHeader({ onBack, eyebrow = 'ARCH9 Social Lead Engine', showAdminLink = false }) {
  return (
    <header className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        {onBack ? (
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#dce1e7] bg-white text-[#071b31] shadow-sm transition hover:border-[#f5bb05]"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
        ) : (
          <KingstonsLogo size="small" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-[#657181] [letter-spacing:0]">{eyebrow}</p>
          <p className="truncate text-sm font-black text-[#071b31] [letter-spacing:0]">Kingstons Real Estate</p>
        </div>
      </div>
      {showAdminLink ? (
        <Link
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dce1e7] bg-white px-3 text-xs font-bold text-[#071b31] shadow-sm transition hover:border-[#f5bb05]"
          to="/demo/kingstons-social-intake/admin"
        >
          <ClipboardCheck size={15} />
          Admin
        </Link>
      ) : null}
    </header>
  )
}

function LandingView({ onSelect }) {
  return (
    <DemoShell>
      <section className="-mx-4 -my-4 relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#06192d] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-white sm:min-h-[860px] sm:rounded-[30px] sm:px-7 sm:py-7">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${KINGSTONS_LANDING_BACKGROUND}")` }}
        />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,18,35,0.32)_0%,rgba(3,18,35,0.74)_42%,rgba(3,18,35,0.96)_100%)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[48%] bg-[linear-gradient(180deg,rgba(3,18,35,0)_0%,rgba(3,18,35,0.98)_82%)]" />

        <header className="relative z-10 flex items-center justify-between gap-4">
          <KingstonsLogo size="small" />
          <span className="rounded-full border border-white/16 bg-white/12 px-3 py-1.5 text-[11px] font-bold uppercase text-white/78 backdrop-blur-xl [letter-spacing:0]">
            Private intake
          </span>
        </header>

        <div className="relative z-10 flex flex-1 flex-col">
          <section className="pt-[11vh] sm:pt-24">
            <p className="text-xs font-black uppercase text-[#f5bb05] [letter-spacing:0]">Kingstons Real Estate</p>
            <h1 className="mt-3 max-w-[340px] text-[2.6rem] font-black leading-[0.95] text-white [letter-spacing:0]">
              Find the right move, faster.
            </h1>
            <p className="mt-5 max-w-[330px] text-sm font-medium leading-6 text-[#d7e3ee] [letter-spacing:0]">
              Start with one quick choice. Kingstons will match buyers to suitable homes or route sellers to a local valuation specialist.
            </p>

          </section>

          <section className="mt-auto grid gap-3 pb-5 pt-8">
            <IntentCard
              icon={Search}
              title="I want to buy"
              description="Share your area, budget, and must-haves. We will show the closest Kingstons matches."
              accent="buyer"
              onClick={() => onSelect('buyer')}
            />
            <IntentCard
              icon={Home}
              title="I want to sell"
              description="Request a valuation and tell us what makes your property stand out."
              accent="seller"
              onClick={() => onSelect('seller')}
            />
          </section>

          <footer className="text-center">
            <p className="text-xs font-medium leading-5 text-white/62 [letter-spacing:0]">
              Your details are used only for this property request.
            </p>
            <p className="mt-3 text-[10px] font-bold uppercase text-white/38 [letter-spacing:0]">
              Powered by Arch9
            </p>
          </footer>
        </div>
      </section>
    </DemoShell>
  )
}

function IntentCard({ icon: Icon, title, description, accent, onClick }) {
  const isBuyer = accent === 'buyer'

  return (
    <button
      type="button"
      className={classNames(
        'group flex min-h-[112px] w-full items-center gap-4 rounded-[22px] border p-4 text-left shadow-[0_20px_48px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition hover:-translate-y-0.5',
        isBuyer
          ? 'border-[#f5bb05]/38 bg-[#071b31]/84 text-white'
          : 'border-white bg-white text-[#071b31]',
      )}
      onClick={onClick}
    >
      <span
        className={classNames(
          'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
          isBuyer ? 'bg-[#f5bb05] text-[#071b31]' : 'bg-[#071b31] text-[#f5bb05]',
        )}
      >
        {createElement(Icon, { size: 22 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className={classNames('block text-base font-black leading-tight [letter-spacing:0]', isBuyer ? 'text-white' : 'text-[#071b31]')}>
          {title}
        </span>
        <span className={classNames('mt-1.5 block text-xs font-semibold leading-5 [letter-spacing:0]', isBuyer ? 'text-[#d7e3ee]' : 'text-[#556273]')}>
          {description}
        </span>
      </span>
      <span className={classNames(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition group-hover:translate-x-0.5',
        isBuyer ? 'bg-white/12 text-[#f5bb05]' : 'bg-[#f5bb05] text-[#071b31]',
      )}>
        <ChevronRight size={19} />
      </span>
    </button>
  )
}

function StepProgress({ steps, current }) {
  return (
    <div className="mt-5">
      <p className="text-center text-xs font-bold text-[#657181] [letter-spacing:0]">
        Step {current + 1} of {steps.length}
      </p>
      <div className="mt-5 flex items-center justify-center">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center" aria-label={step}>
            <span
              className={classNames(
                'h-3 w-3 rounded-full transition',
                index <= current ? 'bg-[#f5bb05]' : 'bg-[#dfe3e8]',
              )}
            />
            {index < steps.length - 1 ? (
              <span className={classNames('h-0.5 w-10', index < current ? 'bg-[#f5bb05]' : 'bg-[#dfe3e8]')} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function FlowHeader({ title, subtitle, steps, current, onBack }) {
  return (
    <section className="pt-2">
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e1e6ec] bg-white text-[#071b31] shadow-sm transition hover:border-[#f5bb05]"
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeft size={16} />
      </button>
      <StepProgress steps={steps} current={current} />
      <h1 className="mt-9 text-xl font-black leading-tight text-[#071b31] [letter-spacing:0]">{title}</h1>
      <p className="mt-3 text-xs font-medium leading-5 text-[#556273] [letter-spacing:0]">{subtitle}</p>
    </section>
  )
}

function OptionButton({ selected, children, onClick }) {
  return (
    <button
      type="button"
      className={classNames(
        'flex min-h-[46px] items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-bold transition [letter-spacing:0]',
        selected
          ? 'border-[#071b31] bg-[#071b31] text-white shadow-[0_12px_24px_rgba(7,27,49,0.16)]'
          : 'border-[#edf0f3] bg-[#f3f4f6] text-[#273447] hover:border-[#cfd6de] hover:bg-white',
      )}
      onClick={onClick}
    >
      <span>{children}</span>
      {selected ? (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#f5bb05] text-[#071b31]">
          <Check size={13} strokeWidth={3} />
        </span>
      ) : null}
    </button>
  )
}

function OptionGrid({ options, value, onChange }) {
  return (
    <div className="mt-5 grid gap-2.5">
      {options.map((option) => (
        <OptionButton key={option} selected={value === option} onClick={() => onChange(option)}>
          {option}
        </OptionButton>
      ))}
    </div>
  )
}

function FeatureGrid({ options, selected, onToggle }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            type="button"
            key={option}
            className={classNames(
              'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-black transition [letter-spacing:0]',
              isSelected
                ? 'border-[#071b31] bg-[#071b31] text-white shadow-[0_10px_20px_rgba(7,27,49,0.14)]'
                : 'border-[#edf0f3] bg-[#f3f4f6] text-[#273447] hover:border-[#cfd6de] hover:bg-white',
            )}
            onClick={() => onToggle(option)}
          >
            {isSelected ? <Check size={13} className="text-[#f5bb05]" strokeWidth={3} /> : null}
            {option}
          </button>
        )
      })}
    </div>
  )
}

function SelectablePropertyCard({ property, selected, onToggle }) {
  return (
    <button
      type="button"
      className={classNames(
        'group w-full overflow-hidden rounded-xl border bg-white text-left shadow-[0_12px_30px_rgba(7,27,49,0.08)] transition hover:-translate-y-0.5',
        selected
          ? 'border-[#f5bb05] ring-4 ring-[#f5bb05]/18'
          : 'border-[#e1e6ec] hover:border-[#f5bb05]/70',
      )}
      onClick={onToggle}
      aria-pressed={selected}
    >
      <div className="grid grid-cols-[112px_minmax(0,1fr)]">
        <div className="relative min-h-[146px] overflow-hidden bg-[#dce1e7]">
          <PropertyFallbackArtwork listing={property} />
          <img
            className="relative h-full w-full object-cover"
            src={property.imageUrl || property.image}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
          {selected ? (
            <span className="absolute left-2 top-2 rounded-full bg-[#f5bb05] px-2 py-1 text-[10px] font-black uppercase text-[#071b31]">
              Selected
            </span>
          ) : null}
        </div>
        <div className="min-w-0 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-black leading-tight text-[#071b31] [letter-spacing:0]">{property.title}</h3>
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#657181] [letter-spacing:0]">
                <MapPin size={13} />
                {property.suburb || property.area}
              </p>
            </div>
            <span
              className={classNames(
                'grid h-6 w-6 shrink-0 place-items-center rounded-md border transition',
                selected ? 'border-[#f5bb05] bg-[#f5bb05] text-[#071b31]' : 'border-[#cbd3dc] bg-white text-transparent',
              )}
              aria-hidden="true"
            >
              <Check size={14} strokeWidth={3} />
            </span>
          </div>

          <p className="mt-2 text-lg font-black text-[#071b31] [letter-spacing:0]">{formatRand(property.price)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Metric icon={BedDouble} value={`${property.beds}`} label="beds" />
            <Metric icon={Bath} value={`${property.baths}`} label="baths" />
            <Metric icon={Car} value={`${property.parking || property.garages}`} label="parking" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {property.features.slice(0, 3).map((feature) => (
              <span key={feature} className="rounded-md bg-[#eef2f6] px-2 py-1 text-[10px] font-bold text-[#657181]">
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', inputMode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[#657181] [letter-spacing:0]">{label}</span>
      <input
        className="mt-2 h-12 w-full rounded-lg border border-[#e1e6ec] bg-white px-3 text-sm font-semibold text-[#071b31] outline-none transition [letter-spacing:0] placeholder:text-[#a0a8b2] focus:border-[#f5bb05] focus:ring-4 focus:ring-[#f5bb05]/15"
        type={type}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SelectField({ label, value, onChange, options, placeholder = 'Select one' }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[#657181] [letter-spacing:0]">{label}</span>
      <select
        className="mt-2 h-12 w-full rounded-lg border border-[#e1e6ec] bg-white px-3 text-sm font-semibold text-[#071b31] outline-none transition [letter-spacing:0] focus:border-[#f5bb05] focus:ring-4 focus:ring-[#f5bb05]/15"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function StepBody({ eyebrow, title, subtitle, children }) {
  return (
    <section className="mt-5">
      <p className="text-xs font-black uppercase text-[#f5bb05] [letter-spacing:0]">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-black leading-tight text-[#071b31] [letter-spacing:0]">{title}</h2>
      {subtitle ? <p className="mt-3 text-xs font-medium leading-5 text-[#556273] [letter-spacing:0]">{subtitle}</p> : null}
      {children}
    </section>
  )
}

function FlowActions({ onBack, onNext, nextLabel = 'Continue', canContinue = true, isLast = false }) {
  return (
    <div className="mt-auto grid gap-3 pb-4 pt-8">
      <button
        type="button"
        className={classNames(
          'inline-flex h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-black shadow-[0_16px_28px_rgba(7,27,49,0.18)] transition disabled:cursor-not-allowed disabled:bg-[#cbd2da] disabled:text-white disabled:shadow-none [letter-spacing:0]',
          isLast ? 'bg-[#f5bb05] text-[#071b31] hover:bg-[#ffcb1f]' : 'bg-[#071b31] text-white hover:bg-[#0b2948]',
        )}
        onClick={onNext}
        disabled={!canContinue}
      >
        {nextLabel}
        {isLast ? <Sparkles size={16} /> : <ArrowRight size={16} />}
      </button>
      <button
        type="button"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold text-[#657181] transition hover:text-[#071b31]"
        onClick={onBack}
      >
        <ArrowLeft size={14} />
        Back
      </button>
    </div>
  )
}

function BuyerFlow({ onExit }) {
  const [buyer, setBuyer] = useState(initialBuyer)
  const [step, setStep] = useState(0)
  const [matches, setMatches] = useState([])
  const [buyerLead, setBuyerLead] = useState(null)
  const [selectedListing, setSelectedListing] = useState(null)
  const [savedProperties, setSavedProperties] = useState([])
  const [infoRequested, setInfoRequested] = useState([])
  const [toast, setToast] = useState('')

  const strongMatches = useMemo(() => matches.filter((listing) => listing.matchPercentage >= 70), [matches])
  const selectedProperties = useMemo(
    () => demoProperties.filter((property) => buyer.selectedPropertyIds.includes(property.id)),
    [buyer.selectedPropertyIds],
  )
  const hasResults = Boolean(buyerLead)

  function updateBuyer(key, value) {
    setBuyer((current) => ({ ...current, [key]: value }))
  }

  function updateBuyerBudget(value) {
    const range = getBudgetRange(value)
    setBuyer((current) => ({
      ...current,
      budget: value,
      budgetMin: range.min,
      budgetMax: Number.isFinite(range.max) ? range.max : '',
    }))
  }

  function toggleBuyerFeature(feature) {
    setBuyer((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }))
  }

  function toggleSelectedProperty(propertyId) {
    setBuyer((current) => {
      const currentIds = Array.isArray(current.selectedPropertyIds) ? current.selectedPropertyIds : []
      return {
        ...current,
        selectedPropertyIds: currentIds.includes(propertyId)
          ? currentIds.filter((id) => id !== propertyId)
          : [...currentIds, propertyId],
      }
    })
  }

  function canContinue() {
    if (step === 0) return Boolean(buyer.area)
    if (step === 1) return Boolean(buyer.budget)
    if (step === 2) return Boolean(buyer.beds)
    if (step === 3) return Boolean(buyer.propertyType)
    if (step === 4) return buyer.features.length > 0
    return true
  }

  function goBack() {
    if (step === 0) {
      onExit()
      return
    }
    setStep((current) => current - 1)
  }

  function submitBuyer() {
    const allMatches = matchPropertiesToBuyer(buyer)
    const selectedIds = Array.isArray(buyer.selectedPropertyIds) ? buyer.selectedPropertyIds : []
    const selectedMatches = allMatches.filter((listing) => selectedIds.includes(listing.id))
    const budgetRange = getBudgetRange(buyer.budget)
    const budgetMatches = allMatches.filter((listing) => listing.price >= budgetRange.min && listing.price <= budgetRange.max)
    const bestMatches = allMatches.filter((listing) => listing.matchPercentage >= 70)
    const displayMatches = (
      selectedMatches.length
        ? selectedMatches
        : budgetMatches.length
          ? budgetMatches
          : bestMatches.length
            ? bestMatches
            : allMatches
    ).slice(0, 6)
    const lead = createBuyerLead(buyer, displayMatches)
    setMatches(displayMatches)
    setBuyerLead(lead)
    setToast('Buyer lead created in local demo CRM')
  }

  function goNext() {
    if (!canContinue()) return
    if (step === buyerSteps.length - 1) {
      submitBuyer()
      return
    }
    setStep((current) => current + 1)
  }

  function restart() {
    setBuyer(initialBuyer)
    setStep(0)
    setMatches([])
    setBuyerLead(null)
    setSelectedListing(null)
    setSavedProperties([])
    setInfoRequested([])
    setToast('')
  }

  function toggleSavedProperty(listingId) {
    setSavedProperties((current) => (
      current.includes(listingId)
        ? current.filter((id) => id !== listingId)
        : [...current, listingId]
    ))
  }

  function requestInfo(listingId) {
    setInfoRequested((current) => (current.includes(listingId) ? current : [...current, listingId]))
    setToast('Request info added to this demo lead')
  }

  if (hasResults) {
    return (
      <DemoShell>
        <BuyerResults
          buyerLead={buyerLead}
          matches={matches}
          strongMatches={strongMatches}
          selectedProperties={selectedProperties}
          savedProperties={savedProperties}
          infoRequested={infoRequested}
          toast={toast}
          onBookViewing={setSelectedListing}
          onRequestInfo={requestInfo}
          onToggleSaved={toggleSavedProperty}
          onRestart={restart}
        />
        {selectedListing ? (
          <ViewingModal
            buyerLead={buyerLead}
            listing={selectedListing}
            onClose={() => setSelectedListing(null)}
            onCreated={(request) => {
              setBuyerLead((current) => ({
                ...current,
                name: request?.name || current.name,
                phone: request?.phone || current.phone,
                viewingRequested: true,
                status: 'Viewing Requested',
              }))
              setToast('Viewing request created in local demo CRM')
            }}
          />
        ) : null}
      </DemoShell>
    )
  }

  return (
    <DemoShell>
      <FlowHeader
        title={buyerStepTitle(step)}
        subtitle={buyerStepSubtitle(step)}
        steps={buyerSteps}
        current={step}
        onBack={onExit}
      />

      {step === 0 ? (
        <StepBody eyebrow="Buyer journey" title="Select the areas you're interested in">
          <OptionGrid options={buyerAreaOptions} value={buyer.area} onChange={(value) => updateBuyer('area', value)} />
        </StepBody>
      ) : null}

      {step === 1 ? (
        <StepBody eyebrow="Buyer journey" title="Select your budget range">
          <OptionGrid options={buyerBudgetOptions} value={buyer.budget} onChange={updateBuyerBudget} />
        </StepBody>
      ) : null}

      {step === 2 ? (
        <StepBody eyebrow="Buyer journey" title="Select the minimum number of bedrooms">
          <OptionGrid options={bedroomOptions} value={buyer.beds} onChange={(value) => updateBuyer('beds', value)} />
        </StepBody>
      ) : null}

      {step === 3 ? (
        <StepBody eyebrow="Buyer journey" title="What type of property are you looking for?">
          <OptionGrid
            options={buyerPropertyTypeOptions}
            value={buyer.propertyType}
            onChange={(value) => updateBuyer('propertyType', value)}
          />
        </StepBody>
      ) : null}

      {step === 4 ? (
        <StepBody eyebrow="Buyer journey" title="Select all that apply">
          <FeatureGrid options={buyerFeatureOptions} selected={buyer.features} onToggle={toggleBuyerFeature} />
        </StepBody>
      ) : null}

      {step === 5 ? (
        <StepBody
          eyebrow="Buyer journey"
          title="Which homes are you interested in?"
          subtitle="Select one or more properties. Kingstons will use this to match you with these homes or similar options."
        >
          <div className="mt-5 grid gap-3">
            {demoProperties.map((property) => (
              <SelectablePropertyCard
                key={property.id}
                property={property}
                selected={buyer.selectedPropertyIds.includes(property.id)}
                onToggle={() => toggleSelectedProperty(property.id)}
              />
            ))}
          </div>
        </StepBody>
      ) : null}

      <FlowActions
        onBack={goBack}
        onNext={goNext}
        nextLabel={buyerNextLabel(step, buyer.selectedPropertyIds)}
        canContinue={canContinue()}
        isLast={step === buyerSteps.length - 1}
      />
    </DemoShell>
  )
}

function buyerStepTitle(step) {
  return [
    'Where are you looking?',
    "What's your budget?",
    'Minimum bedrooms?',
    'Property type',
    'Any must-have features?',
    'Interested homes',
  ][step] || 'Buyer intake'
}

function buyerStepSubtitle(step) {
  return [
    'Choose the suburb Kingstons should prioritise first.',
    'Pick the price band that feels comfortable.',
    'Start with the smallest home you would consider.',
    'Choose the style of home you want to see.',
    'Add the features that would make a home worth viewing.',
    'Pick the specific listings Kingstons should prioritise.',
  ][step] || ''
}

function buyerNextLabel(step, selectedPropertyIds = []) {
  if (step === buyerSteps.length - 1) {
    return selectedPropertyIds.length ? 'Continue with selected properties' : 'Skip and match me anyway'
  }
  return 'Continue'
}

function BuyerResults({
  buyerLead,
  matches,
  strongMatches,
  selectedProperties,
  savedProperties,
  infoRequested,
  toast,
  onBookViewing,
  onRequestInfo,
  onToggleSaved,
  onRestart,
}) {
  const strongCount = strongMatches.length
  const resultMessage = strongCount
    ? `We found ${strongCount} properties that match your search`
    : 'No perfect matches yet, but we found similar properties.'
  const selectedHomes = selectedProperties.length ? selectedProperties : buyerLead.selectedProperties || []

  return (
    <>
      <section className="pt-2">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e1e6ec] bg-white text-[#071b31] shadow-sm transition hover:border-[#f5bb05]"
          onClick={onRestart}
          aria-label="Back to buyer search"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#071b31] px-3 py-2 text-xs font-black text-white">
          <Check size={15} />
          Buyer Lead Created
        </div>
        <h1 className="mt-4 text-2xl font-black leading-tight text-[#071b31] [letter-spacing:0]">{resultMessage}</h1>
        <p className="mt-2 text-xs font-medium leading-5 text-[#556273] [letter-spacing:0]">
          {buyerLead.area}, {buyerLead.budget}, {buyerLead.beds} beds
        </p>
      </section>

      {toast ? (
        <div className="mt-4 rounded-lg border border-[#d7eadf] bg-[#f0fbf4] px-4 py-3 text-xs font-bold text-[#087a3f]">
          {toast}
        </div>
      ) : null}

      <section className="mt-5 rounded-xl border border-[#e1e6ec] bg-white p-4 shadow-[0_12px_30px_rgba(7,27,49,0.06)]">
        <h2 className="text-sm font-black text-[#071b31] [letter-spacing:0]">Buyer request summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ReceiptItem label="Preferred area" value={buyerLead.area} />
          <ReceiptItem label="Budget range" value={buyerLead.budget} />
          <ReceiptItem label="Beds / Baths" value={`${buyerLead.beds || '-'} beds / ${buyerLead.baths || 'Flexible'} baths`} />
          <ReceiptItem label="Property type" value={buyerLead.propertyType} />
        </div>
        <div className="mt-2 rounded-lg border border-[#e1e6ec] bg-white px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[#657181] [letter-spacing:0]">Key must-haves</p>
          <p className="mt-1 text-sm font-black text-[#071b31] [letter-spacing:0]">
            {buyerLead.features?.length ? buyerLead.features.join(', ') : 'No must-haves selected'}
          </p>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-[#e1e6ec] bg-white p-4 shadow-[0_12px_30px_rgba(7,27,49,0.06)]">
        <h2 className="text-sm font-black text-[#071b31] [letter-spacing:0]">Homes you selected</h2>
        {selectedHomes.length ? (
          <div className="mt-3 grid gap-2">
            {selectedHomes.map((property) => (
              <CompactSelectedPropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-[#cbd3dc] bg-[#f8fafc] px-3 py-3 text-xs font-bold leading-5 text-[#657181] [letter-spacing:0]">
            No specific homes selected. Kingstons will match you with suitable options based on your preferences.
          </p>
        )}
      </section>

      <section className="mt-5 grid gap-4 pb-8">
        <div>
          <p className="text-xs font-black uppercase text-[#f5bb05] [letter-spacing:0]">Match result</p>
          <h2 className="mt-1 text-xl font-black text-[#071b31] [letter-spacing:0]">Closest Kingstons matches</h2>
        </div>
        {matches.map((listing) => (
          <PropertyCard
            key={listing.id}
            listing={listing}
            isSaved={savedProperties.includes(listing.id)}
            infoRequested={infoRequested.includes(listing.id)}
            onBookViewing={() => onBookViewing(listing)}
            onRequestInfo={() => onRequestInfo(listing.id)}
            onToggleSaved={() => onToggleSaved(listing.id)}
          />
        ))}
      </section>

      <div className="grid gap-3 pb-8">
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#dce1e7] bg-white px-4 text-sm font-black text-[#071b31] shadow-sm transition hover:border-[#f5bb05]"
          onClick={onRestart}
        >
          <Search size={16} />
          New buyer search
        </button>
        <Link
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#071b31] px-4 text-sm font-black text-white shadow-[0_16px_28px_rgba(7,27,49,0.18)] transition hover:bg-[#0b2948]"
          to="/demo/kingstons-social-intake/admin"
        >
          <ClipboardCheck size={16} />
          View admin preview
        </Link>
      </div>
    </>
  )
}

function CompactSelectedPropertyCard({ property }) {
  return (
    <article className="grid grid-cols-[68px_minmax(0,1fr)] gap-3 rounded-lg border border-[#eef2f6] bg-[#f8fafc] p-2">
      <div className="relative min-h-[64px] overflow-hidden rounded-md bg-[#dce1e7]">
        <PropertyFallbackArtwork listing={property} />
        <img
          className="relative h-full w-full object-cover"
          src={property.imageUrl || property.image}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[#071b31] [letter-spacing:0]">{property.title}</p>
        <p className="mt-1 text-[11px] font-bold text-[#657181] [letter-spacing:0]">
          {(property.suburb || property.area)} · {formatRand(property.price)}
        </p>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-[#071b31] [letter-spacing:0]">
          <span>{property.beds} beds</span>
          <span>{property.baths} baths</span>
          <span>{property.parking || property.garages} parking</span>
        </div>
      </div>
    </article>
  )
}

function ReceiptItem({ label, value }) {
  return (
    <div className="rounded-lg border border-[#e1e6ec] bg-white px-3 py-2">
      <p className="text-[11px] font-bold uppercase text-[#657181] [letter-spacing:0]">{label}</p>
      <p className="mt-1 text-sm font-black text-[#071b31] [letter-spacing:0]">{value || '-'}</p>
    </div>
  )
}

const propertyArtworkThemes = [
  { sky: '#b8d4f0', lawn: '#294b35', house: '#f3efe7', roof: '#0a1f36', accent: '#f5bb05', pool: '#2aaed6' },
  { sky: '#d8d2c8', lawn: '#39513b', house: '#d7c4ab', roof: '#17283a', accent: '#c89b34', pool: '#8bbccf' },
  { sky: '#cdd8e5', lawn: '#273f2e', house: '#ece6dc', roof: '#5b4732', accent: '#f5bb05', pool: '#4ca8c8' },
  { sky: '#b7c7d9', lawn: '#315942', house: '#c2b49f', roof: '#0a1f36', accent: '#ffffff', pool: '#3a9cc2' },
]

function getArtworkTheme(listingId = '') {
  const index = Number(String(listingId).replace(/\D/g, '').slice(-1) || 0)
  return propertyArtworkThemes[index % propertyArtworkThemes.length]
}

function PropertyFallbackArtwork({ listing }) {
  const theme = getArtworkTheme(listing.id)

  return (
    <div
      data-property-artwork
      className="absolute inset-0 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${theme.sky} 0%, #eef3f8 54%, ${theme.lawn} 55%, ${theme.lawn} 100%)`,
      }}
      aria-hidden="true"
    >
      <div
        className="absolute bottom-[14%] left-[8%] h-[18%] w-[34%] rounded-t-lg opacity-90"
        style={{ backgroundColor: theme.pool, boxShadow: 'inset 0 8px 18px rgba(255,255,255,0.32)' }}
      />
      <div className="absolute bottom-[27%] left-[13%] h-[28%] w-[70%] rounded-sm shadow-[0_18px_34px_rgba(0,0,0,0.22)]" style={{ backgroundColor: theme.house }}>
        <div className="absolute -top-[22%] left-[-4%] h-[28%] w-[108%] skew-x-[-10deg]" style={{ backgroundColor: theme.roof }} />
        <div className="absolute bottom-[16%] left-[10%] h-[44%] w-[16%] rounded-sm bg-[#071b31]/80" />
        <div className="absolute bottom-[16%] left-[32%] h-[44%] w-[16%] rounded-sm bg-[#071b31]/70" />
        <div className="absolute bottom-[16%] left-[54%] h-[44%] w-[16%] rounded-sm bg-[#071b31]/70" />
        <div className="absolute bottom-[16%] right-[8%] h-[54%] w-[14%] rounded-sm" style={{ backgroundColor: theme.accent }} />
      </div>
      <div className="absolute bottom-[10%] right-[10%] h-[13%] w-[20%] rounded-full bg-white/20 blur-sm" />
      <div className="absolute left-[7%] top-[14%] h-[20%] w-[20%] rounded-full bg-white/30 blur-md" />
    </div>
  )
}

function PropertyCard({ listing, isSaved, infoRequested, onBookViewing, onRequestInfo, onToggleSaved }) {
  const whatsappUrl = `https://wa.me/${toWhatsappNumber(listing.agentPhone)}?text=${encodeURIComponent(`Hi ${listing.agentName}, I am interested in ${listing.title}.`)}`

  return (
    <article
      data-property-card
      className="overflow-hidden rounded-lg border border-[#071b31] bg-white shadow-[0_16px_34px_rgba(7,27,49,0.12)]"
    >
      <div className="relative aspect-[1.22] overflow-hidden bg-[#dce1e7]">
        <PropertyFallbackArtwork listing={listing} />
        <img
          className="relative h-full w-full object-cover"
          src={listing.image}
          alt={listing.title}
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
        <span className="absolute bottom-0 left-0 rounded-tr-lg bg-[#07964f] px-3 py-1.5 text-[11px] font-black uppercase text-white">
          {listing.matchPercentage}% match
        </span>
        <button
          type="button"
          className={classNames(
            'absolute right-3 top-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/70 bg-black/20 text-white backdrop-blur transition',
            isSaved ? 'text-[#f5bb05]' : 'hover:bg-black/35',
          )}
          onClick={onToggleSaved}
          aria-label={isSaved ? 'Unsave property' : 'Save property'}
        >
          <Heart size={17} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-black text-[#071b31] [letter-spacing:0]">{formatRand(listing.price)}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#657181] [letter-spacing:0]">
              <MapPin size={14} />
              {listing.area}
            </p>
          </div>
          <p className="rounded-full bg-[#eef2f6] px-3 py-1 text-[11px] font-black text-[#071b31]">{listing.propertyType}</p>
        </div>

        <div className="mt-4 flex items-center gap-5 text-[#071b31]">
          <Metric icon={BedDouble} value={`${listing.beds}`} label="" />
          <Metric icon={Bath} value={`${listing.baths}`} label="" />
          <Metric icon={Car} value={`${listing.garages}`} label="" />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {listing.features.slice(0, 5).map((feature) => {
            const isMatched = listing.matchedFeatures?.includes(feature)
            return (
              <span
                key={feature}
                className={classNames(
                  'rounded-md px-2 py-1 text-[11px] font-bold',
                  isMatched ? 'bg-[#e8f5e9] text-[#087a3f]' : 'bg-[#eef2f6] text-[#657181]',
                )}
              >
                {feature}
              </span>
            )
          })}
        </div>

        <p className="mt-4 text-xs font-bold text-[#657181] [letter-spacing:0]">Agent: {listing.agentName}</p>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#071b31] px-3 text-xs font-black text-white transition hover:bg-[#0b2948]"
            onClick={onBookViewing}
          >
            <CalendarDays size={15} />
            Book viewing
          </button>
          <div className="grid grid-cols-2 gap-2">
            <a
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dce1e7] bg-white px-3 text-xs font-black text-[#071b31] transition hover:border-[#f5bb05]"
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={15} className="text-[#1bbf64]" />
              WhatsApp
            </a>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dce1e7] bg-white px-3 text-xs font-black text-[#071b31] transition hover:border-[#f5bb05]"
              onClick={onRequestInfo}
            >
              {infoRequested ? <Check size={15} /> : <Info size={15} />}
              {infoRequested ? 'Requested' : 'Info'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function Metric({ icon: Icon, value, label }) {
  return (
    <div className="inline-flex items-center gap-1 text-xs font-bold text-[#071b31] [letter-spacing:0]">
      {createElement(Icon, { className: 'text-[#657181]', size: 15 })}
      <span>{value}</span>
      {label ? <span className="text-[#657181]">{label}</span> : null}
    </div>
  )
}

function ViewingModal({ buyerLead, listing, onClose, onCreated }) {
  const [request, setRequest] = useState({
    name: buyerLead?.name || '',
    phone: buyerLead?.phone || '',
    preferredDay: '',
    preferredTime: '',
  })
  const [created, setCreated] = useState(false)

  function updateRequest(key, value) {
    setRequest((current) => ({ ...current, [key]: value }))
  }

  function submitViewing() {
    if (!request.name || !request.phone || !request.preferredDay || !request.preferredTime) return
    createViewingRequest({ buyerLeadId: buyerLead.id, listing, request })
    setCreated(true)
    onCreated(request)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#031223]/70 px-4 py-4 sm:items-center">
      <div className="w-full max-w-[430px] rounded-lg bg-white shadow-[0_28px_70px_rgba(3,18,35,0.32)]">
        <div className="flex items-center justify-between border-b border-[#e1e6ec] px-4 py-4">
          <div>
            <p className="text-xs font-black uppercase text-[#f5bb05] [letter-spacing:0]">Book viewing</p>
            <h2 className="mt-1 text-lg font-black text-[#071b31] [letter-spacing:0]">{listing.title}</h2>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#dce1e7] text-[#657181] transition hover:border-[#f5bb05] hover:text-[#071b31]"
            onClick={onClose}
            aria-label="Close viewing modal"
          >
            <X size={18} />
          </button>
        </div>

        {created ? (
          <section className="px-4 py-5">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f5bb05] text-[#071b31]">
              <Check size={24} />
            </span>
            <h3 className="mt-4 text-2xl font-black leading-tight text-[#071b31] [letter-spacing:0]">
              Your viewing request has been sent to Kingstons.
            </h3>
            <p className="mt-2 text-sm font-medium leading-6 text-[#556273] [letter-spacing:0]">
              An agent will contact you shortly to confirm.
            </p>
            <div className="mt-5 grid gap-2">
              {['Lead captured', 'Viewing request created', 'Agent notified'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg border border-[#e1e6ec] px-3 py-3">
                  <Check size={17} className="text-[#087a3f]" />
                  <span className="text-sm font-bold text-[#071b31] [letter-spacing:0]">{item}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#071b31] px-4 text-sm font-black text-white"
              onClick={onClose}
            >
              Done
            </button>
          </section>
        ) : (
          <section className="px-4 py-5">
            <div className="grid gap-4">
              <Field label="Name" value={request.name} onChange={(value) => updateRequest('name', value)} />
              <Field
                label="Phone number"
                value={request.phone}
                onChange={(value) => updateRequest('phone', value)}
                inputMode="tel"
              />
              <Field
                label="Preferred viewing day"
                type="date"
                value={request.preferredDay}
                onChange={(value) => updateRequest('preferredDay', value)}
              />
              <Field
                label="Preferred time"
                type="time"
                value={request.preferredTime}
                onChange={(value) => updateRequest('preferredTime', value)}
              />
            </div>
            <button
              type="button"
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f5bb05] px-4 text-sm font-black text-[#071b31] transition hover:bg-[#ffcb1f] disabled:cursor-not-allowed disabled:bg-[#cbd2da] disabled:text-white"
              onClick={submitViewing}
              disabled={!request.name || !request.phone || !request.preferredDay || !request.preferredTime}
            >
              <Send size={16} />
              Send viewing request
            </button>
          </section>
        )}
      </div>
    </div>
  )
}

function SellerFlow({ onExit }) {
  const [seller, setSeller] = useState(initialSeller)
  const [step, setStep] = useState(0)
  const [sellerLead, setSellerLead] = useState(null)
  const [valuationRequest, setValuationRequest] = useState(null)

  function updateSeller(key, value) {
    setSeller((current) => ({ ...current, [key]: value }))
  }

  function toggleSellerFeature(feature) {
    setSeller((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }))
  }

  function canContinue() {
    if (step === 0) return Boolean(seller.streetAddress && seller.suburb)
    if (step === 1) return Boolean(seller.beds && seller.baths && seller.garages && seller.propertyType)
    if (step === 2) return seller.features.length > 0
    if (step === 3) return Boolean(seller.expectedPrice)
    return Boolean(seller.name && seller.phone && seller.preferredDay && seller.preferredTime)
  }

  function goBack() {
    if (step === 0) {
      onExit()
      return
    }
    setStep((current) => current - 1)
  }

  function submitSeller() {
    const lead = createSellerLead(seller)
    const request = createValuationRequest({ sellerLeadId: lead.id, seller })
    setSellerLead({ ...lead, status: 'Valuation Requested' })
    setValuationRequest(request)
  }

  function goNext() {
    if (!canContinue()) return
    if (step === sellerSteps.length - 1) {
      submitSeller()
      return
    }
    setStep((current) => current + 1)
  }

  if (sellerLead) {
    return (
      <DemoShell>
        <SellerSuccess sellerLead={sellerLead} valuationRequest={valuationRequest} onExit={onExit} />
      </DemoShell>
    )
  }

  return (
    <DemoShell>
      <FlowHeader
        title={sellerStepTitle(step)}
        subtitle={sellerStepSubtitle(step)}
        steps={sellerSteps}
        current={step}
        onBack={onExit}
      />

      {step === 0 ? (
        <section className="mt-5">
          <div className="grid gap-4">
            <Field
              label="Street address"
              value={seller.streetAddress}
              onChange={(value) => updateSeller('streetAddress', value)}
              placeholder="12 Example Street"
            />
            <Field
              label="Suburb"
              value={seller.suburb}
              onChange={(value) => updateSeller('suburb', value)}
              placeholder="Boksburg"
            />
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="mt-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bedrooms" value={seller.beds} onChange={(value) => updateSeller('beds', value)} inputMode="numeric" />
            <Field label="Bathrooms" value={seller.baths} onChange={(value) => updateSeller('baths', value)} inputMode="numeric" />
            <Field label="Garages" value={seller.garages} onChange={(value) => updateSeller('garages', value)} inputMode="numeric" />
            <SelectField
              label="Property type"
              value={seller.propertyType}
              onChange={(value) => updateSeller('propertyType', value)}
              options={buyerPropertyTypeOptions}
            />
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mt-5">
          <FeatureGrid options={sellerFeatureOptions} selected={seller.features} onToggle={toggleSellerFeature} />
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-5">
          <OptionGrid
            options={sellerPriceOptions}
            value={seller.expectedPrice}
            onChange={(value) => updateSeller('expectedPrice', value)}
          />
        </section>
      ) : null}

      {step === 4 ? (
        <section className="mt-5">
          <div className="grid gap-4">
            <Field label="Name" value={seller.name} onChange={(value) => updateSeller('name', value)} placeholder="Owner name" />
            <Field
              label="Phone number"
              value={seller.phone}
              onChange={(value) => updateSeller('phone', value)}
              placeholder="082 000 0000"
              inputMode="tel"
            />
            <Field
              label="Preferred valuation day"
              type="date"
              value={seller.preferredDay}
              onChange={(value) => updateSeller('preferredDay', value)}
            />
            <Field
              label="Preferred time"
              type="time"
              value={seller.preferredTime}
              onChange={(value) => updateSeller('preferredTime', value)}
            />
          </div>
        </section>
      ) : null}

      <FlowActions
        onBack={goBack}
        onNext={goNext}
        nextLabel={step === sellerSteps.length - 1 ? 'Submit request' : 'Continue'}
        canContinue={canContinue()}
        isLast={step === sellerSteps.length - 1}
      />
    </DemoShell>
  )
}

function sellerStepTitle(step) {
  return [
    "What's the address of your property?",
    'Tell us about your property',
    'Select key features',
    'Expected asking price',
    'When would you prefer a valuation?',
  ][step] || 'Seller valuation'
}

function sellerStepSubtitle(step) {
  return [
    'Kingstons will use this to route the valuation to the right area expert.',
    'A few facts help the agent prepare before they call.',
    'Optional extras can materially affect the valuation strategy.',
    'Choose the range you have in mind, or tell us you are not sure.',
    'Pick a convenient time for the Kingstons team to confirm.',
  ][step] || ''
}

function SellerSuccess({ sellerLead, valuationRequest, onExit }) {
  return (
    <section className="-mx-4 -my-4 flex min-h-screen flex-col bg-[radial-gradient(circle_at_50%_0%,#0e5a4b_0%,#00483d_46%,#00372f_100%)] px-4 py-8 text-white sm:min-h-[860px] sm:rounded-[30px]">
      <div className="mx-auto mt-5 grid h-20 w-20 place-items-center rounded-full border border-[#f5bb05] text-[#f5bb05]">
        <Check size={38} strokeWidth={1.8} />
      </div>
      <div className="mt-7 text-center">
        <h1 className="text-3xl font-black leading-tight text-white [letter-spacing:0]">Thank you!</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-[#d6eee8] [letter-spacing:0]">
          Your valuation request has been received.
        </p>
      </div>

      <section className="mt-7 rounded-lg bg-white px-4 py-4 text-[#071b31] shadow-[0_18px_44px_rgba(0,0,0,0.16)]">
        <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#071b31] px-3 py-2 text-xs font-black text-white">
          <ShieldCheck size={15} className="text-[#f5bb05]" />
          Seller Lead Created
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <ReceiptItem label="Owner" value={sellerLead.ownerName} />
          <ReceiptItem label="Phone" value={sellerLead.phone} />
          <ReceiptItem label="Address" value={sellerLead.address} />
          <ReceiptItem label="Expected Price" value={sellerLead.expectedAskingPrice} />
        </div>
        <ReceiptItem label="Preferred Valuation Time" value={sellerLead.preferredValuationTime} />
      </section>

      <section className="mt-5 rounded-lg bg-white px-4 py-4 text-[#071b31] shadow-[0_18px_44px_rgba(0,0,0,0.12)]">
        <h2 className="text-sm font-black text-[#071b31] [letter-spacing:0]">Here's what happens next:</h2>
        <div className="mt-4 grid gap-3">
        {[
          ['Agent reviews your property', "We'll analyse your details"],
          ['Valuation appointment', "We'll confirm a convenient time"],
          ['Valuation and strategy', "We'll prepare your report"],
          ['List with confidence', "We'll market your property"],
        ].map((item) => (
          <div key={item[0]} className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef2f6] text-[#071b31]">
              <Check size={16} className="text-[#f5bb05]" />
            </span>
            <span>
              <span className="block text-xs font-black text-[#071b31] [letter-spacing:0]">{item[0]}</span>
              <span className="mt-0.5 block text-[11px] font-medium text-[#657181] [letter-spacing:0]">{item[1]}</span>
            </span>
          </div>
        ))}
        </div>
      </section>

      {valuationRequest ? (
        <div className="mt-5 rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-xs font-bold text-[#d6eee8]">
          Valuation request created for {valuationRequest.preferredDay} at {valuationRequest.preferredTime}
        </div>
      ) : null}

      <div className="mt-auto grid gap-3 pt-6">
        <button
          type="button"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-[#00483d] shadow-[0_16px_28px_rgba(0,0,0,0.14)] transition hover:bg-[#f5bb05]"
          onClick={onExit}
        >
          Back to home
        </button>
        <Link
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/25 px-4 text-sm font-black text-white transition hover:border-[#f5bb05]"
          to="/demo/kingstons-social-intake/admin"
        >
          <ClipboardCheck size={16} />
          View admin preview
        </Link>
      </div>
    </section>
  )
}

function AdminPreview() {
  const [demoState, setDemoState] = useState(() => readKingstonsDemoState())

  function resetDemo() {
    setDemoState(resetKingstonsDemoState())
  }

  return (
    <DemoShell compact>
      <DemoHeader eyebrow="Demo Admin Preview" />

      <section className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-[#f5bb05] [letter-spacing:0]">CRM-ready records</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-[#071b31] [letter-spacing:0]">
            Kingstons social intake admin
          </h1>
          <p className="mt-2 max-w-[660px] text-sm font-medium leading-6 text-[#556273] [letter-spacing:0]">
            Captured local demo leads from the buyer match and seller valuation flows.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AdminStat label="Buyer Leads" value={demoState.buyerLeads.length} />
          <AdminStat label="Seller Leads" value={demoState.sellerLeads.length} />
          <AdminStat label="Viewings" value={demoState.viewingRequests.length} />
          <AdminStat label="Valuations" value={demoState.valuationRequests.length} />
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#071b31] px-4 text-sm font-black text-white shadow-[0_16px_28px_rgba(7,27,49,0.18)] transition hover:bg-[#0b2948]"
          to="/demo/kingstons-social-intake"
        >
          <ArrowLeft size={16} />
          Back to intake
        </Link>
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#dce1e7] bg-white px-4 text-sm font-black text-[#071b31] shadow-sm transition hover:border-[#f5bb05]"
          onClick={resetDemo}
        >
          <X size={16} />
          Reset local demo data
        </button>
      </div>

      <section className="mt-7">
        <SectionTitle icon={UserRound} title="Buyer Leads" />
        {demoState.buyerLeads.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {demoState.buyerLeads.map((lead) => (
              <AdminLeadCard key={lead.id}>
                <AdminRow label="Name" value={lead.name} />
                <AdminRow label="Phone" value={lead.phone} />
                <AdminRow label="Area" value={lead.area} />
                <AdminRow label="Budget" value={lead.budget} />
                <AdminRow
                  label="Selected Homes"
                  value={lead.selectedProperties?.length ? lead.selectedProperties.map((property) => property.title).join(', ') : 'None'}
                />
                <AdminRow label="Matched Properties" value={`${lead.matchedProperties?.length || 0} attached`} />
                <AdminRow label="Viewing Requested" value={lead.viewingRequested ? 'Yes' : 'No'} />
                <AdminRow label="Status" value={lead.status} />
              </AdminLeadCard>
            ))}
          </div>
        ) : (
          <EmptyAdminState label="No buyer leads captured yet." />
        )}
      </section>

      <section className="mt-7 pb-8">
        <SectionTitle icon={Home} title="Seller Leads" />
        {demoState.sellerLeads.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {demoState.sellerLeads.map((lead) => (
              <AdminLeadCard key={lead.id}>
                <AdminRow label="Name" value={lead.ownerName} />
                <AdminRow label="Phone" value={lead.phone} />
                <AdminRow label="Address" value={lead.address} />
                <AdminRow label="Expected Price" value={lead.expectedAskingPrice} />
                <AdminRow label="Valuation Time" value={lead.preferredValuationTime} />
                <AdminRow label="Status" value={lead.status} />
              </AdminLeadCard>
            ))}
          </div>
        ) : (
          <EmptyAdminState label="No seller leads captured yet." />
        )}
      </section>
    </DemoShell>
  )
}

function AdminStat({ label, value }) {
  return (
    <div className="rounded-lg border border-[#dce1e7] bg-white px-4 py-3 text-center shadow-sm">
      <p className="text-2xl font-black text-[#071b31] [letter-spacing:0]">{value}</p>
      <p className="mt-1 text-[11px] font-black uppercase text-[#657181] [letter-spacing:0]">{label}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#071b31] text-[#f5bb05]">
        {createElement(Icon, { size: 18 })}
      </span>
      <h2 className="text-xl font-black text-[#071b31] [letter-spacing:0]">{title}</h2>
    </div>
  )
}

function AdminLeadCard({ children }) {
  return (
    <article className="grid gap-2 rounded-lg border border-[#dce1e7] bg-white p-4 shadow-[0_12px_30px_rgba(7,27,49,0.06)]">
      {children}
    </article>
  )
}

function AdminRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#eef2f6] py-2 last:border-b-0">
      <span className="text-xs font-black uppercase text-[#657181] [letter-spacing:0]">{label}</span>
      <span className="max-w-[62%] text-right text-sm font-black text-[#071b31] [letter-spacing:0]">{value || '-'}</span>
    </div>
  )
}

function EmptyAdminState({ label }) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-[#cbd3dc] bg-white/70 px-4 py-8 text-center">
      <ListChecks className="mx-auto text-[#657181]" size={28} />
      <p className="mt-3 text-sm font-bold text-[#556273] [letter-spacing:0]">{label}</p>
    </div>
  )
}

export default function KingstonsSocialIntakeDemo({ view = 'intake', initialMode = 'landing' }) {
  const [mode, setMode] = useState(() => (['buyer', 'seller'].includes(initialMode) ? initialMode : 'landing'))

  if (view === 'admin') {
    return <AdminPreview />
  }

  if (mode === 'buyer') {
    return <BuyerFlow onExit={() => setMode('landing')} />
  }

  if (mode === 'seller') {
    return <SellerFlow onExit={() => setMode('landing')} />
  }

  return <LandingView onSelect={setMode} />
}
