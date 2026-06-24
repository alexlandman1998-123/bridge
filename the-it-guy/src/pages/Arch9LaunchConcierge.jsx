import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  Check,
  ChevronDown,
  Clock3,
  Landmark,
  LockKeyhole,
  Scale,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { AnimatePresence, motion as Motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { submitLaunchEventLead } from '../services/launchEventLeadService'

const DOMAIN_LABEL = 'app.arch9.co.za'

const ROLE_OPTIONS = [
  { value: 'developer', label: 'Developer', icon: Building2 },
  { value: 'agency', label: 'Agency', icon: UsersRound },
  { value: 'commercial', label: 'Commercial', icon: BriefcaseBusiness },
  { value: 'attorney', label: 'Attorney', icon: Scale },
  { value: 'bond_originator', label: 'Bond Originator', icon: Landmark },
  { value: 'buyer_seller', label: 'Buyer / Seller', icon: UserRound },
]

const FOCUS_OPTIONS = [
  { value: '', label: 'Select an option' },
  { value: 'faster_registrations', label: 'Faster registrations' },
  { value: 'agent_crm', label: 'Agent CRM' },
  { value: 'attorney_workspace', label: 'Attorney workspace' },
  { value: 'bond_originator_workflow', label: 'Bond originator workflow' },
  { value: 'commercial_pipeline', label: 'Commercial pipeline' },
  { value: 'developer_sales', label: 'Developer sales' },
  { value: 'client_portals', label: 'Client portals' },
  { value: 'document_generation', label: 'Document generation' },
  { value: 'executive_reporting', label: 'Executive reporting' },
  { value: 'general_overview', label: 'General overview' },
]

const TIME_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: "I'm flexible" },
]

const INTRO_POINTS = [
  { label: '15 minute call', icon: Clock3 },
  { label: 'Tailored to your business', icon: UserRound },
  { label: 'No setup required', icon: LockKeyhole },
]

const NEXT_STEPS = [
  { label: 'We review your details', icon: BriefcaseBusiness },
  { label: 'Prepare a tailored walkthrough', icon: CalendarCheck2 },
  { label: 'Confirm a time that suits you', icon: Clock3 },
]

const STEP_COPY = {
  1: {
    kicker: 'Step 1 of 4',
    title: 'Let’s start with your details.',
  },
  2: {
    kicker: 'Step 2 of 4',
    title: 'What best describes you?',
    subtitle: 'This helps us tailor your session.',
  },
  3: {
    kicker: 'Step 3 of 4',
    title: 'What would you like to discuss?',
    subtitle: 'Choose the main focus for our conversation.',
  },
  4: {
    kicker: 'Step 4 of 4',
    title: 'When works best for you?',
    subtitle: 'Select your preferred time.',
  },
}

function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isValidEmail(value = '') {
  const email = normalizeEmail(value)
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function FirstName({ name }) {
  const firstName = String(name || '').trim().split(/\s+/)[0]
  return firstName ? `, ${firstName}` : ''
}

function StepShell({ step, children, onBack }) {
  const copy = STEP_COPY[step]

  return (
    <div className="flex min-h-[100svh] flex-col px-6 pb-5 pt-6">
      <div className="flex h-9 items-center">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#24332f] transition hover:bg-[#eeeae2]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5">
        <p className="text-[0.78rem] font-medium text-[#111817]">{copy.kicker}</p>
        <div className="mt-4 grid grid-cols-4 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((item) => (
            <span
              key={item}
              className={cx(
                'h-[3px] rounded-full transition-colors duration-300',
                item <= step ? 'bg-[#0b4b3c]' : 'bg-[#e4e0d8]',
              )}
            />
          ))}
        </div>
      </div>

      <div className="mt-9">
        <h1 className="font-serif text-[2rem] leading-[1.05] tracking-[-0.03em] text-[#111817]">
          {copy.title}
        </h1>
        {copy.subtitle ? (
          <p className="mt-4 max-w-[18rem] text-[0.95rem] leading-6 text-[#313b39]">{copy.subtitle}</p>
        ) : null}
      </div>

      <div className="mt-7 flex-1">{children}</div>

      <footer className="mt-5 text-center text-[0.7rem] font-semibold text-[#101817]">{DOMAIN_LABEL}</footer>
    </div>
  )
}

function FieldError({ children }) {
  if (!children) return null
  return <p className="mt-1.5 text-[0.8rem] font-semibold text-[#9f241b]">{children}</p>
}

function TextField({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[0.92rem] font-medium text-[#111817]">{label}</span>
      <input
        {...props}
        className={cx(
          'h-[54px] w-full rounded-[8px] border bg-white/50 px-4 text-[0.95rem] text-[#111817] outline-none transition placeholder:text-[#8a8f8d] focus:border-[#0b4b3c] focus:ring-4 focus:ring-[#0b4b3c]/10',
          error ? 'border-[#9f241b]' : 'border-[#cec8bd]',
          props.className,
        )}
      />
      <FieldError>{error}</FieldError>
    </label>
  )
}

function PrimaryButton({ children, icon = ArrowRight, className = '', ...props }) {
  const Icon = icon
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex h-[62px] w-full items-center justify-center gap-4 rounded-[10px] bg-[#064734] px-5 text-[1rem] font-medium text-white shadow-[0_20px_44px_rgba(6,71,52,0.22)] transition duration-200 hover:bg-[#053f30] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
    >
      <span>{children}</span>
      <Icon className="h-5 w-5" />
    </button>
  )
}

function IntroScreen({ onStart }) {
  return (
    <div className="flex min-h-[100svh] flex-col px-7 pb-6 pt-8">
      <div className="flex items-center justify-between">
        <span className="text-[1.08rem] font-semibold text-[#101817]">09:18</span>
        <span className="rounded-[5px] bg-[#101817] px-1.5 py-0.5 text-[0.72rem] font-bold text-white">88</span>
      </div>

      <section className="flex flex-1 flex-col justify-center py-8">
        <div className="text-center">
          <p className="font-sans text-[1.52rem] font-light tracking-[0.38em] text-[#123a34]">ARCH9</p>
          <div className="mt-28 inline-flex items-center gap-2 rounded-full bg-[#ebe7dd] px-4 py-2 text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[#6c5a36]">
            <span className="text-[#0b4b3c]">✦</span>
            Arch9 Concierge
          </div>
          <h1 className="mx-auto mt-11 max-w-[20rem] font-serif text-[2.8rem] leading-[1.15] tracking-[-0.04em] text-[#111817]">
            Let’s continue the conversation.
          </h1>
          <p className="mx-auto mt-7 max-w-[17rem] text-center text-[1.2rem] leading-8 text-[#5d6361]">
            Request a private strategy session after today’s launch.
          </p>
        </div>

        <div className="mt-16 grid gap-7">
          {INTRO_POINTS.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="flex items-center gap-5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#eeece6] text-[#123a34]">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="text-[1.06rem] text-[#101817]">{item.label}</span>
              </div>
            )
          })}
        </div>
      </section>

      <div>
        <PrimaryButton onClick={onStart}>Start Request</PrimaryButton>
        <div className="mt-5 flex items-center justify-center gap-2 text-[0.9rem] text-[#686f6c]">
          <LockKeyhole className="h-4 w-4" />
          <span>Your details are private and secure</span>
        </div>
        <footer className="mt-8 text-center text-[0.82rem] font-semibold text-[#101817]">{DOMAIN_LABEL}</footer>
      </div>
    </div>
  )
}

function DetailsStep({ form, errors, updateField, onNext, onBack }) {
  return (
    <StepShell step={1} onBack={onBack}>
      <div className="grid gap-5">
        <TextField
          label="Full name"
          placeholder="Your name"
          autoComplete="name"
          value={form.name}
          error={errors.name}
          onChange={(event) => updateField('name', event.target.value)}
        />
        <TextField
          label="Email"
          placeholder="you@company.co.za"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={form.email}
          error={errors.email}
          onChange={(event) => updateField('email', event.target.value)}
        />
        <TextField
          label="Phone number"
          placeholder="Your mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={form.phone}
          error={errors.phone}
          onChange={(event) => updateField('phone', event.target.value)}
        />
        <TextField
          label="Company"
          placeholder="Company or team"
          autoComplete="organization"
          value={form.company}
          onChange={(event) => updateField('company', event.target.value)}
        />
      </div>

      <div className="mt-14">
        <PrimaryButton onClick={onNext}>Next</PrimaryButton>
      </div>
    </StepShell>
  )
}

function RoleStep({ form, errors, updateField, onNext, onBack }) {
  return (
    <StepShell step={2} onBack={onBack}>
      <div className="grid gap-3">
        {ROLE_OPTIONS.map((option) => {
          const selected = form.roleType === option.value
          const Icon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => updateField('roleType', option.value)}
              className={cx(
                'flex min-h-[52px] items-center gap-3 rounded-[8px] border px-4 text-left text-[0.95rem] transition duration-200',
                selected
                  ? 'border-[#064734] bg-[#064734] text-white shadow-[0_16px_34px_rgba(6,71,52,0.18)]'
                  : 'border-[#d3cdc2] bg-white/42 text-[#111817] hover:border-[#b9b1a4]',
              )}
              style={selected ? { background: '#064734', borderColor: '#064734', color: '#ffffff' } : undefined}
              aria-pressed={selected}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
      <FieldError>{errors.roleType}</FieldError>

      <div className="mt-6">
        <PrimaryButton onClick={onNext}>Next</PrimaryButton>
      </div>
    </StepShell>
  )
}

function FocusStep({ form, errors, updateField, onNext, onBack }) {
  return (
    <StepShell step={3} onBack={onBack}>
      <label className="block">
        <span className="sr-only">Discussion focus</span>
        <span className="relative block">
          <select
            value={form.discussionFocus}
            onChange={(event) => updateField('discussionFocus', event.target.value)}
            className={cx(
              'h-[58px] w-full appearance-none rounded-[8px] border bg-white/46 px-4 pr-11 text-[0.95rem] text-[#111817] outline-none transition focus:border-[#0b4b3c] focus:ring-4 focus:ring-[#0b4b3c]/10',
              errors.discussionFocus ? 'border-[#9f241b]' : 'border-[#d3cdc2]',
            )}
          >
            {FOCUS_OPTIONS.map((option) => (
              <option key={option.value || 'empty'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111817]" />
        </span>
      </label>
      <FieldError>{errors.discussionFocus}</FieldError>

      <label className="mt-5 block">
        <span className="mb-2 block text-[0.92rem] font-medium text-[#111817]">Anything specific we should know?</span>
        <textarea
          value={form.notes}
          onChange={(event) => updateField('notes', event.target.value)}
          placeholder="Optional"
          maxLength={360}
          className="min-h-[96px] w-full resize-none rounded-[8px] border border-[#d3cdc2] bg-white/46 px-4 py-3 text-[0.95rem] text-[#111817] outline-none transition placeholder:text-[#8a8f8d] focus:border-[#0b4b3c] focus:ring-4 focus:ring-[#0b4b3c]/10"
        />
      </label>

      <div className="mt-20">
        <PrimaryButton onClick={onNext}>Next</PrimaryButton>
      </div>
    </StepShell>
  )
}

function TimeStep({ form, errors, updateField, onSubmit, onBack, status, submitError }) {
  return (
    <StepShell step={4} onBack={onBack}>
      <div className="grid gap-5">
        {TIME_OPTIONS.map((option) => {
          const selected = form.preferredTime === option.value
          return (
            <button
              key={option.value}
              type="button"
              className="flex items-center gap-4 text-left text-[0.98rem] text-[#111817]"
              onClick={() => updateField('preferredTime', option.value)}
            >
              <span className={cx(
                'grid h-5 w-5 place-items-center rounded-full border transition',
                selected ? 'border-[#0b4b3c] bg-[#0b4b3c]' : 'border-[#a8aca9] bg-transparent',
              )}>
                {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
      <FieldError>{errors.preferredTime}</FieldError>

      {submitError ? (
        <p className="mt-6 rounded-[8px] border border-[#e0b2a7] bg-[#fff3ef] px-4 py-3 text-[0.86rem] font-medium text-[#9f241b]">
          {submitError}
        </p>
      ) : null}

      <div className="mt-28">
        <PrimaryButton onClick={onSubmit} icon={Check} disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Sending...' : 'Request Follow-Up'}
        </PrimaryButton>
      </div>
    </StepShell>
  )
}

function SuccessScreen({ form }) {
  return (
    <div className="flex min-h-[100svh] flex-col px-7 pb-6 pt-8">
      <div className="flex flex-1 flex-col justify-center">
        <div className="grid h-20 w-20 place-items-center rounded-[20px] bg-[#064734] text-white shadow-[0_20px_50px_rgba(6,71,52,0.25)]">
          <Check className="h-9 w-9" />
        </div>
        <h1 className="mt-10 max-w-[18rem] font-serif text-[2.65rem] leading-[1.12] tracking-[-0.04em] text-[#123a34]">
          All set. We’ll be in touch.
        </h1>
        <p className="mt-6 max-w-[19rem] text-[1.02rem] leading-7 text-[#5d6361]">
          Thank you<FirstName name={form.name} /> for your request. We’ll contact you within 24 hours to arrange your private session.
        </p>

        <section className="mt-10 rounded-[10px] border border-[#d9d2c7] bg-white/34 p-6">
          <h2 className="font-serif text-[1.35rem] text-[#111817]">What happens next?</h2>
          <div className="mt-6 grid gap-5">
            {NEXT_STEPS.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-4">
                  <Icon className="h-4 w-4 text-[#123a34]" />
                  <span className="text-[0.93rem] text-[#111817]">{item.label}</span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      <footer className="mt-8 text-center text-[0.76rem] font-semibold text-[#101817]">{DOMAIN_LABEL}</footer>
    </div>
  )
}

export default function Arch9LaunchConcierge() {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    roleType: '',
    discussionFocus: '',
    notes: '',
    preferredTime: '',
    website: '',
  })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')
  const [submitError, setSubmitError] = useState('')

  const pageVariants = useMemo(() => ({
    enter: (customDirection) => ({
      opacity: 0,
      x: customDirection > 0 ? 18 : -18,
      filter: 'blur(2px)',
    }),
    center: {
      opacity: 1,
      x: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
    },
    exit: (customDirection) => ({
      opacity: 0,
      x: customDirection > 0 ? -18 : 18,
      filter: 'blur(2px)',
      transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
    }),
  }), [])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function goTo(nextStep) {
    setDirection(nextStep > step ? 1 : -1)
    setStep(nextStep)
  }

  function validateStep(targetStep = step) {
    const nextErrors = {}
    if (targetStep === 1) {
      if (!String(form.name || '').trim()) nextErrors.name = 'Full name is required.'
      if (!String(form.phone || '').trim()) nextErrors.phone = 'Phone number is required.'
      if (!isValidEmail(form.email)) nextErrors.email = 'Enter a valid email address.'
    }
    if (targetStep === 2 && !form.roleType) nextErrors.roleType = 'Choose one option.'
    if (targetStep === 3 && !form.discussionFocus) nextErrors.discussionFocus = 'Choose a main focus.'
    if (targetStep === 4 && !form.preferredTime) nextErrors.preferredTime = 'Choose a preferred time.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit() {
    setSubmitError('')
    if (form.website) {
      goTo(5)
      return
    }
    if (!validateStep(4)) return
    setStatus('submitting')
    try {
      await submitLaunchEventLead(form)
      goTo(5)
    } catch (error) {
      setSubmitError(error?.message || 'Something went wrong. Please try again.')
    } finally {
      setStatus('idle')
    }
  }

  const screen = (() => {
    if (step === 0) return <IntroScreen onStart={() => goTo(1)} />
    if (step === 1) {
      return (
        <DetailsStep
          form={form}
          errors={errors}
          updateField={updateField}
          onNext={() => validateStep(1) && goTo(2)}
          onBack={() => goTo(0)}
        />
      )
    }
    if (step === 2) {
      return (
        <RoleStep
          form={form}
          errors={errors}
          updateField={updateField}
          onNext={() => validateStep(2) && goTo(3)}
          onBack={() => goTo(1)}
        />
      )
    }
    if (step === 3) {
      return (
        <FocusStep
          form={form}
          errors={errors}
          updateField={updateField}
          onNext={() => validateStep(3) && goTo(4)}
          onBack={() => goTo(2)}
        />
      )
    }
    if (step === 4) {
      return (
        <TimeStep
          form={form}
          errors={errors}
          updateField={updateField}
          onSubmit={handleSubmit}
          onBack={() => goTo(3)}
          status={status}
          submitError={submitError}
        />
      )
    }
    return <SuccessScreen form={form} />
  })()

  return (
    <main className="min-h-screen bg-[#f3f0ea] text-[#111817]">
      <div className="mx-auto min-h-screen w-full max-w-[440px] overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.95),transparent_32%),linear-gradient(160deg,#fbfaf7_0%,#f3f0ea_55%,#fbfaf7_100%)] shadow-[0_28px_90px_rgba(17,24,23,0.12)] sm:my-6 sm:min-h-[calc(100vh-3rem)] sm:rounded-[32px]">
        <AnimatePresence mode="wait" custom={direction}>
          <Motion.div
            key={step}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {screen}
          </Motion.div>
        </AnimatePresence>
      </div>
    </main>
  )
}
