import {
  ArrowLeft, ArrowRight, BarChart3, BriefcaseBusiness, Building2, Check, CheckCircle2,
  CircleDot, Clock3, FileText, Gauge, Home, Landmark, LoaderCircle, LockKeyhole,
  Mail, Menu, Play, Scale, ShieldCheck, Sparkles, UsersRound, Workflow, X,
} from 'lucide-react'
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { captureLaunchAttribution, submitLaunchEventLead } from '../services/launchEventLeadService'

const SESSION_KEY = 'arch9:personalised-demo-progress:v1'

const DEMO_FLOW_CONFIG = {
  estate_agency: {
    label: 'Estate Agency', icon: Building2,
    groups: [
      { field: 'businessSize', label: 'How many agents do you have?', options: ['1-5', '6-20', '21-50', '50+'] },
      { field: 'monthlyTransactions', label: 'Monthly transactions', options: ['0-20', '20-50', '50-100', '100+'] },
    ],
  },
  attorney: {
    label: 'Attorney', icon: Scale,
    groups: [
      { field: 'businessSize', label: 'Team / firm size', options: ['1-5', '6-20', '21-50', '50+'] },
      { field: 'monthlyTransactions', label: 'Monthly property matters', options: ['0-20', '20-50', '50-100', '100+'] },
    ],
  },
  bond_originator: {
    label: 'Bond Originator', icon: Landmark,
    groups: [
      { field: 'businessSize', label: 'Number of consultants', options: ['1-5', '6-20', '21-50', '50+'] },
      { field: 'monthlyTransactions', label: 'Monthly applications', options: ['0-20', '20-50', '50-100', '100+'] },
    ],
  },
  developer: {
    label: 'Developer', icon: Home,
    groups: [
      { field: 'businessSize', label: 'Active developments', options: ['1', '2-5', '6-10', '10+'] },
      { field: 'monthlyTransactions', label: 'Approximate monthly unit sales', options: ['0-20', '20-50', '50-100', '100+'] },
    ],
  },
  commercial_agency: {
    label: 'Commercial Agency', icon: BriefcaseBusiness,
    groups: [
      { field: 'businessSize', label: 'Number of brokers', options: ['1-5', '6-20', '21-50', '50+'] },
      { field: 'monthlyTransactions', label: 'Monthly transactions / deals', options: ['0-20', '20-50', '50-100', '100+'] },
    ],
  },
  other: {
    label: 'Other', icon: CircleDot,
    groups: [
      { field: 'businessSize', label: 'Team size', options: ['1-5', '6-20', '21-50', '50+'] },
      { field: 'monthlyTransactions', label: 'Monthly transactions / projects', options: ['0-20', '20-50', '50-100', '100+'] },
    ],
  },
}

const INTEREST_OPTIONS = [
  { value: 'Client Portal', icon: UsersRound }, { value: 'Transactions', icon: Workflow },
  { value: 'CRM', icon: BriefcaseBusiness }, { value: 'Documents', icon: FileText },
  { value: 'Automation', icon: Sparkles }, { value: 'Reporting', icon: BarChart3 },
]

const INITIAL_FORM = {
  role: '', firstName: '', lastName: '', email: '', phone: '', company: '',
  businessSize: '', monthlyTransactions: '', interests: [], frustration: '',
  preferredNextAction: '', website: '',
}

const STEP_COPY = {
  1: ['What best describes you?', 'This helps us personalise your demo experience.'],
  2: ['Tell us about yourself', "We'll use this to prepare for your demo."],
  3: ['Tell us about your business', 'This helps us tailor the right demo for you.'],
  4: ['What would you like to see?', "Select the areas you'd like us to focus on."],
  5: ["What's your biggest frustration today?", 'A quick answer helps us help you.'],
  6: ['Almost there!', 'How would you prefer to continue?'],
}

function cx(...classes) { return classes.filter(Boolean).join(' ') }

function loadSession() {
  if (typeof window === 'undefined' || !window.sessionStorage) return null
  try { return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}

function trackFunnelEvent(event, metadata = {}, metaEvent = '') {
  if (typeof window === 'undefined') return
  const payload = { event, ...metadata }
  window.dataLayer?.push(payload)
  window.dispatchEvent(new CustomEvent('arch9_demo_funnel_event', { detail: payload }))
  if (typeof window.fbq !== 'function' || !metaEvent) return
  if (['ViewContent', 'Lead', 'Schedule'].includes(metaEvent)) window.fbq('track', metaEvent, metadata)
  else window.fbq('trackCustom', metaEvent, metadata)
}

function BrandMark() {
  return <span className="inline-flex items-center gap-2.5 text-white" aria-label="Arch9">
    <span className="relative h-6 w-8 overflow-hidden" aria-hidden="true"><span className="absolute inset-x-0 top-1 h-5 rounded-t-full border-[3px] border-b-0 border-[#64B992]" /></span>
    <span className="text-[0.88rem] font-semibold">ARCH9</span>
  </span>
}

function Header({ onStart }) {
  const [open, setOpen] = useState(false)
  return <header className="sticky top-0 z-50 h-[68px] border-b border-white/10 bg-[#071E1A] text-white">
    <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between px-5 sm:px-6">
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="min-h-11" aria-label="Back to top"><BrandMark /></button>
      <button type="button" onClick={() => setOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-[12px] text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#64B992]" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} title={open ? 'Close menu' : 'Open menu'}>
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </div>
    {open ? <div className="absolute right-5 top-[60px] w-48 rounded-[12px] border border-[#26453e] bg-[#0b2b25] p-2 shadow-xl">
      <button type="button" onClick={() => { setOpen(false); onStart() }} className="flex min-h-11 w-full items-center rounded-[9px] px-3 text-left text-sm hover:bg-white/10">Personalised demo</button>
      <Link to="/login" className="flex min-h-11 items-center rounded-[9px] px-3 text-sm hover:bg-white/10">Login</Link>
    </div> : null}
  </header>
}

function ProductPreview() {
  return <div className="relative mx-auto mt-10 max-w-[760px] overflow-hidden rounded-[18px] border border-[#d8d0c4] bg-white shadow-[0_24px_70px_rgba(7,30,26,0.12)]" aria-label="Arch9 product workspace preview">
    <div className="flex h-10 items-center gap-2 border-b border-[#e6e0d7] px-4">
      <span className="h-2 w-2 rounded-full bg-[#64B992]" /><span className="h-2 w-2 rounded-full bg-[#dfc991]" /><span className="h-2 w-2 rounded-full bg-[#d9d5ce]" /><span className="ml-auto h-4 w-28 rounded-[4px] bg-[#f1eee8]" />
    </div>
    <div className="grid min-h-[230px] grid-cols-[64px_1fr] sm:grid-cols-[150px_1fr]">
      <aside className="border-r border-[#e8e2d9] bg-[#071E1A] p-3 sm:p-4">
        <div className="mb-6 hidden text-xs font-semibold text-white sm:block">ARCH9</div>
        {[Gauge, Workflow, UsersRound, FileText].map((Icon, index) => <div key={index} className={cx('mb-2 flex h-9 items-center gap-2 rounded-[7px] px-2', index === 1 ? 'bg-white/12 text-white' : 'text-[#8eb7ab]')}>
          <Icon className="h-4 w-4 shrink-0" /><span className="hidden text-[11px] sm:block">{['Overview', 'Transactions', 'Clients', 'Documents'][index]}</span>
        </div>)}
      </aside>
      <div className="bg-[#fbfaf7] p-4 sm:p-6">
        <div className="flex items-center justify-between"><div><p className="text-[9px] font-semibold text-[#698078]">TRANSACTIONS</p><p className="mt-1 text-sm font-semibold text-[#071E1A] sm:text-base">Your pipeline, connected</p></div><span className="rounded-[7px] bg-[#0b5d48] px-3 py-2 text-[9px] font-semibold text-white">New transaction</span></div>
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">{['Active', 'Awaiting action', 'Completed'].map((label, index) => <div key={label} className="rounded-[8px] border border-[#e7e0d6] bg-white p-2.5 sm:p-3"><p className="text-[8px] text-[#71807c] sm:text-[10px]">{label}</p><p className="mt-2 text-lg font-semibold text-[#071E1A]">{[28, 5, 142][index]}</p></div>)}</div>
        <div className="mt-3 rounded-[8px] border border-[#e7e0d6] bg-white p-3">
          <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold">Transaction journey</span><span className="text-[9px] text-[#0b7459]">View all</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e7ece9]"><div className="h-full w-3/5 rounded-full bg-[#0b7459]" /></div>
          <div className="mt-3 grid grid-cols-3 gap-2">{[70, 48, 62].map((width, index) => <span key={index} className="h-2 rounded-[3px] bg-[#edf0ee]" style={{ width: `${width}%` }} />)}</div>
        </div>
      </div>
    </div>
  </div>
}

function Landing({ onStart }) {
  return <main className="min-h-[calc(100dvh-68px)] bg-[#FAF5ED]">
    <section className="mx-auto max-w-[1080px] px-5 pb-16 pt-10 sm:px-6 sm:pt-14 lg:pb-24 lg:pt-20">
      <div className="max-w-[690px]">
        <p className="text-[0.72rem] font-semibold text-[#0b7459]">THE TRANSACTION OPERATING SYSTEM</p>
        <h1 className="mt-5 max-w-[650px] text-[2.85rem] font-bold leading-[1.02] text-[#071E1A] sm:text-[3.6rem] lg:text-[4.7rem]">Your entire <span className="text-[#168262]">real estate</span> business.</h1>
        <p className="mt-6 max-w-[560px] text-[1.05rem] leading-7 text-[#40504b] sm:text-lg">One connected platform to run your agency, delight your clients and close more deals.</p>
        <ul className="mt-7 grid gap-3 text-[0.94rem] leading-6 text-[#263a34]">{['Listings, leads, CRM and transactions in one place', 'Connect every professional in the transaction', 'Built for sales, rentals and developments'].map((item) => <li key={item} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#168262]" /><span>{item}</span></li>)}</ul>
        <button type="button" onClick={onStart} className="mt-8 flex min-h-14 w-full items-center justify-center gap-3 rounded-[15px] bg-[#071E1A] px-5 font-semibold text-white transition hover:bg-[#0d382f] active:bg-[#031011] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#64B992]/50 sm:w-auto sm:min-w-[310px]">Get your personalised demo <ArrowRight className="h-5 w-5" /></button>
        <button type="button" onClick={() => document.getElementById('product-preview')?.scrollIntoView({ behavior: 'smooth' })} className="mt-3 flex min-h-11 items-center gap-2 px-1 text-sm font-semibold text-[#071E1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#64B992]"><Play className="h-4 w-4 fill-current" /> See how it works</button>
        <p className="mt-5 flex items-center gap-2 text-xs text-[#5c6965]"><LockKeyhole className="h-4 w-4" />Your information is safe with us. No spam, ever.</p>
      </div>
      <div id="product-preview"><ProductPreview /></div>
    </section>
  </main>
}

function Intro({ onStart }) {
  const points = [
    [<Clock3 key="clock" className="h-5 w-5" />, 'Takes less than 60 seconds', 'Quick and easy setup'],
    [<Sparkles key="sparkles" className="h-5 w-5" />, 'Tailored for you', "We'll personalise your demo"],
    [<ShieldCheck key="shield" className="h-5 w-5" />, 'Your data is secure', 'We never share your information'],
  ]
  return <main className="min-h-[calc(100dvh-68px)] bg-[#FAF5ED] px-5 py-10 sm:px-6 lg:grid lg:place-items-center lg:py-16">
    <section className="mx-auto w-full max-w-[620px]">
      <p className="text-[0.72rem] font-semibold text-[#0b7459]">GET YOUR PERSONALISED DEMO</p>
      <h1 className="mt-5 max-w-[530px] text-[2.55rem] font-bold leading-[1.04] text-[#071E1A] sm:text-[3.4rem]">Let&apos;s tailor Arch9 to your business</h1>
      <p className="mt-5 max-w-[480px] text-[1.05rem] leading-7 text-[#4c5b56]">A few quick questions so we can show you exactly what matters.</p>
      <div className="mt-10 grid gap-6">{points.map(([icon, title, detail]) => <div key={title} className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[#e4f2eb] text-[#0b7459]">{icon}</span><div><p className="font-semibold text-[#071E1A]">{title}</p><p className="mt-1 text-sm text-[#65726e]">{detail}</p></div></div>)}</div>
      <button type="button" onClick={onStart} className="mt-10 flex min-h-14 w-full items-center justify-center gap-3 rounded-[15px] bg-[#071E1A] px-5 font-semibold text-white transition hover:bg-[#0d382f] active:bg-[#031011] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#64B992]/50">Start now <ArrowRight className="h-5 w-5" /></button>
      <p className="mt-5 text-center text-sm text-[#5c6965]">Already use Arch9? <Link to="/login" className="font-semibold text-[#0b7459] underline underline-offset-4">Login</Link></p>
    </section>
  </main>
}

function Progress({ step }) {
  return <div className="mb-9" aria-label={`Step ${step} of 6`}><p className="text-xs font-semibold text-[#0b7459]">STEP {step} OF 6</p><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#e2ddd4]"><div className="h-full rounded-full bg-[#0b7459] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(step / 6) * 100}%` }} /></div></div>
}

function SelectionButton({ selected, icon: Icon, children, onClick, compact = false }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={cx('relative flex min-h-16 w-full items-center gap-3 rounded-[15px] border px-4 text-left text-[0.95rem] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#64B992]/40', compact ? 'min-h-14' : 'sm:min-h-[68px]', selected ? 'border-[#168262] bg-[#e8f4ee] text-[#071E1A]' : 'border-[#d9d1c6] bg-white/55 text-[#25352f] hover:border-[#9dbbae]')}>
    {Icon ? <Icon className="h-5 w-5 shrink-0 text-[#168262]" /> : null}<span className="min-w-0 flex-1">{children}</span><span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border', selected ? 'border-[#168262] bg-[#168262] text-white' : 'border-[#b9b2a8] text-transparent')} aria-hidden="true"><Check className="h-3.5 w-3.5" /></span>
  </button>
}

function TextField({ label, error, ...props }) {
  const id = props.id || props.name
  return <label htmlFor={id} className="block"><span className="mb-2 block text-[0.94rem] font-semibold text-[#172a24]">{label}</span><input {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={cx('h-14 w-full rounded-[15px] border bg-white px-4 text-base text-[#071E1A] outline-none transition placeholder:text-[#939b98] focus:border-[#168262] focus:ring-4 focus:ring-[#64B992]/20', error ? 'border-[#b84032]' : 'border-[#d8d0c5]')} />{error ? <span id={`${id}-error`} className="mt-1.5 block text-sm font-medium text-[#a73225]" role="alert">{error}</span> : null}</label>
}

function StepContent({ step, form, setField, errors, onRoleSelect }) {
  const roleConfig = DEMO_FLOW_CONFIG[form.role] || DEMO_FLOW_CONFIG.other
  if (step === 1) return <div className="grid grid-cols-2 gap-3">{Object.entries(DEMO_FLOW_CONFIG).map(([value, option]) => <SelectionButton key={value} selected={form.role === value} icon={option.icon} onClick={() => onRoleSelect(value)}>{option.label}</SelectionButton>)}</div>
  if (step === 2) return <div className="grid gap-5">
    <TextField label="First name" name="firstName" value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} autoComplete="given-name" error={errors.firstName} />
    <TextField label="Last name" name="lastName" value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} autoComplete="family-name" error={errors.lastName} />
    <TextField label="Work email" name="email" type="email" inputMode="email" value={form.email} onChange={(event) => setField('email', event.target.value)} autoComplete="email" error={errors.email} />
    <TextField label="Phone number" name="phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => setField('phone', event.target.value)} autoComplete="tel" error={errors.phone} />
    <TextField label="Company name" name="company" value={form.company} onChange={(event) => setField('company', event.target.value)} autoComplete="organization" error={errors.company} />
  </div>
  if (step === 3) return <div className="grid gap-8">{roleConfig.groups.map((group) => <fieldset key={group.field}><legend className="mb-4 text-base font-semibold text-[#172a24]">{group.label}</legend><div className="grid grid-cols-2 gap-3">{group.options.map((option) => <SelectionButton key={option} selected={form[group.field] === option} onClick={() => setField(group.field, option)}>{option}</SelectionButton>)}</div>{errors[group.field] ? <p className="mt-2 text-sm font-medium text-[#a73225]" role="alert">{errors[group.field]}</p> : null}</fieldset>)}</div>
  if (step === 4) return <div className="grid gap-3">{INTEREST_OPTIONS.map((option) => <SelectionButton key={option.value} compact icon={option.icon} selected={form.interests.includes(option.value)} onClick={() => setField('interests', form.interests.includes(option.value) ? form.interests.filter((value) => value !== option.value) : [...form.interests, option.value])}>{option.value}</SelectionButton>)}{errors.interests ? <p className="text-sm font-medium text-[#a73225]" role="alert">{errors.interests}</p> : null}</div>
  if (step === 5) return <label htmlFor="frustration" className="block"><span className="mb-3 flex items-center gap-2 text-base font-semibold text-[#172a24]">Your answer <span className="rounded-[6px] bg-[#ece8e0] px-2 py-1 text-xs font-medium text-[#5b6763]">Optional</span></span><textarea id="frustration" value={form.frustration} onChange={(event) => setField('frustration', event.target.value)} rows={6} className="min-h-40 w-full resize-y rounded-[15px] border border-[#d8d0c5] bg-white p-4 text-base leading-6 text-[#071E1A] outline-none transition placeholder:text-[#939b98] focus:border-[#168262] focus:ring-4 focus:ring-[#64B992]/20" placeholder="E.g. delays in registration, poor communication, too many manual processes..." /></label>
  return <div className="grid gap-3">
    <SelectionButton icon={Mail} selected={form.preferredNextAction === 'email_demo'} onClick={() => setField('preferredNextAction', 'email_demo')}><span className="block">Email me my demo</span><span className="mt-1 block text-sm font-normal text-[#64716d]">We&apos;ll send your personalised demo to your inbox.</span></SelectionButton>
    <SelectionButton icon={Clock3} selected={form.preferredNextAction === 'book_team'} onClick={() => setField('preferredNextAction', 'book_team')}><span className="block">Book a time with our team</span><span className="mt-1 block text-sm font-normal text-[#64716d]">Schedule a quick walkthrough at a time that works for you.</span></SelectionButton>
    {errors.preferredNextAction ? <p className="text-sm font-medium text-[#a73225]" role="alert">{errors.preferredNextAction}</p> : null}
  </div>
}

function DesktopContext({ step }) {
  return <aside className="hidden bg-[#071E1A] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div><p className="text-xs font-semibold text-[#8dd1b5]">PERSONALISED DEMO</p><h2 className="mt-5 text-[2.7rem] font-bold leading-[1.06] text-white">Let&apos;s tailor Arch9 to your business</h2><p className="mt-5 max-w-sm leading-7 text-[#bfd0ca]">A focused walkthrough shaped around your role, team and priorities.</p></div><div className="grid gap-5 text-sm text-[#d7e3df]"><p className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[#8dd1b5]" />Your information stays private</p><p className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-[#8dd1b5]" />Less than 60 seconds</p><p className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-[#8dd1b5]" />Step {step} of 6</p></div></aside>
}

function Questionnaire({ step, form, setForm, onStep, onSubmit, submitting, submitError }) {
  const [errors, setErrors] = useState({})
  const reducedMotion = useReducedMotion()
  const advanceTimer = useRef(null)
  const [title, subtitle] = STEP_COPY[step]
  useEffect(() => () => window.clearTimeout(advanceTimer.current), [])
  const setField = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: '' })) }
  const validate = () => {
    const next = {}
    if (step === 2) {
      if (!form.firstName.trim()) next.firstName = 'Enter your first name.'
      if (!form.lastName.trim()) next.lastName = 'Enter your last name.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid work email.'
      if (!form.phone.trim()) next.phone = 'Enter your phone number.'
      if (!form.company.trim()) next.company = 'Enter your company name.'
    }
    if (step === 3) { if (!form.businessSize) next.businessSize = 'Choose an option.'; if (!form.monthlyTransactions) next.monthlyTransactions = 'Choose an option.' }
    if (step === 4 && form.interests.length === 0) next.interests = 'Choose at least one area.'
    if (step === 6 && !form.preferredNextAction) next.preferredNextAction = 'Choose how you would like to continue.'
    setErrors(next); return Object.keys(next).length === 0
  }
  const continueFlow = () => { if (!validate()) return; if (step === 6) onSubmit(); else onStep(step + 1) }
  const selectRole = (role) => { setForm((current) => ({ ...current, role, businessSize: '', monthlyTransactions: '' })); window.clearTimeout(advanceTimer.current); advanceTimer.current = window.setTimeout(() => onStep(2, role), reducedMotion ? 0 : 220) }
  return <main className="min-h-[calc(100dvh-68px)] bg-[#FAF5ED] lg:p-8">
    <div className="mx-auto min-h-[calc(100dvh-68px)] max-w-[1180px] lg:grid lg:min-h-[720px] lg:grid-cols-[0.8fr_1.2fr] lg:overflow-hidden lg:rounded-[24px] lg:border lg:border-[#d8d0c5] lg:bg-white">
      <DesktopContext step={step} />
      <section className="arch9-questionnaire flex min-h-[calc(100dvh-68px)] flex-col lg:min-h-0">
        <div className="flex-1 px-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-8 sm:px-8 lg:px-14 lg:pb-12 lg:pt-12">
          <Progress step={step} />
          <AnimatePresence mode="wait" initial={false}><Motion.div key={step} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -6 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
            <h1 className="max-w-[600px] text-[2.2rem] font-bold leading-[1.06] text-[#071E1A] sm:text-[2.65rem]">{title}</h1><p className="mt-4 text-[1.02rem] leading-7 text-[#596762]">{subtitle}</p>
            <div className="mt-8"><StepContent step={step} form={form} setField={setField} errors={errors} onRoleSelect={selectRole} /></div>
            <div className="mt-8 flex items-center gap-2 text-xs text-[#65726e]"><LockKeyhole className="h-4 w-4 text-[#168262]" />Your information stays private</div>
            {submitError ? <p className="mt-4 rounded-[10px] bg-[#fbe8e4] p-3 text-sm font-medium text-[#932d21]" role="alert">{submitError}</p> : null}
          </Motion.div></AnimatePresence>
        </div>
        {step > 1 ? <div className="arch9-form-actions fixed inset-x-0 bottom-0 z-40 border-t border-[#ddd5ca] bg-[#FAF5ED]/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:px-8 lg:static lg:bg-white lg:px-14 lg:pb-10"><div className="mx-auto flex max-w-[720px] gap-3">
          <button type="button" onClick={() => onStep(step - 1)} disabled={submitting} className="flex min-h-14 min-w-[108px] items-center justify-center gap-2 rounded-[14px] border border-[#d4cdc2] bg-white px-4 font-semibold text-[#25352f] transition hover:border-[#9dbbae] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#64B992]/40 disabled:opacity-50"><ArrowLeft className="h-4 w-4" /> Back</button>
          <button type="button" onClick={continueFlow} disabled={submitting} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#071E1A] px-5 font-semibold text-white transition hover:bg-[#0d382f] active:bg-[#031011] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#64B992]/50 disabled:cursor-not-allowed disabled:bg-[#789088]">{submitting ? <><LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" />Submitting...</> : <>{step === 6 ? 'Finish' : 'Continue'} <ArrowRight className="h-5 w-5" /></>}</button>
        </div></div> : null}
      </section>
    </div>
  </main>
}

function Success({ nextAction }) {
  const booking = nextAction === 'book_team'
  return <main className="grid min-h-[calc(100dvh-68px)] place-items-center bg-[#FAF5ED] px-5 py-12"><section className="w-full max-w-[580px] text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#dff1e8] text-[#0b7459]"><Check className="h-8 w-8" /></span><p className="mt-7 text-xs font-semibold text-[#0b7459]">YOUR DEMO IS READY</p><h1 className="mt-4 text-[2.55rem] font-bold leading-[1.05] text-[#071E1A]">Thanks. We&apos;ve got what we need.</h1><p className="mx-auto mt-5 max-w-md text-base leading-7 text-[#596762]">{booking ? 'Your preferences are saved. Choose a convenient time for a focused walkthrough with our team.' : 'Your personalised Arch9 demo will be sent to your inbox. You can explore the platform while you wait.'}</p><Link to={booking ? '/bridge/contact' : '/mobile-demo/home'} className="mt-9 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[15px] bg-[#071E1A] px-5 font-semibold text-white transition hover:bg-[#0d382f] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#64B992]/50 sm:w-auto sm:min-w-[300px]">{booking ? 'Choose a time' : 'Explore Arch9'} <ArrowRight className="h-5 w-5" /></Link></section></main>
}

export default function Arch9LaunchConcierge() {
  const saved = useMemo(() => loadSession(), [])
  const [phase, setPhase] = useState(saved?.phase || 'landing')
  const [step, setStep] = useState(saved?.step || 1)
  const [form, setForm] = useState({ ...INITIAL_FORM, ...(saved?.form || {}) })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const attribution = useMemo(() => captureLaunchAttribution(), [])
  const completedSteps = useRef(new Set())
  useEffect(() => { trackFunnelEvent('demo_landing_view', { utm_campaign: attribution.utm_campaign || '', utm_content: attribution.utm_content || '' }, 'ViewContent') }, [attribution])
  useEffect(() => { if (typeof window === 'undefined' || !window.sessionStorage || phase === 'success') return; window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ phase, step, form })) }, [phase, step, form])
  const startIntro = () => { setPhase('intro'); trackFunnelEvent('demo_started', { utm_campaign: attribution.utm_campaign || '', utm_content: attribution.utm_content || '' }, 'DemoStarted') }
  const setActiveStep = (nextStep, roleOverride = '') => {
    if (nextStep > step && !completedSteps.current.has(step)) { completedSteps.current.add(step); trackFunnelEvent(`demo_step_${step}_complete`, { role: roleOverride || form.role, utm_campaign: attribution.utm_campaign || '', utm_content: attribution.utm_content || '' }) }
    setStep(nextStep); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const submit = async () => {
    if (submitting) return
    setSubmitting(true); setSubmitError('')
    try {
      await submitLaunchEventLead({ ...form, attribution })
      if (form.preferredNextAction === 'book_team') trackFunnelEvent('demo_booking_selected', { role: form.role, utm_campaign: attribution.utm_campaign || '', utm_content: attribution.utm_content || '' }, 'Schedule')
      trackFunnelEvent('demo_completed', { role: form.role, utm_campaign: attribution.utm_campaign || '', utm_content: attribution.utm_content || '' }, 'Lead')
      window.sessionStorage?.removeItem(SESSION_KEY); setPhase('success'); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) { setSubmitError(error?.message || 'We could not save your details. Please try again.') } finally { setSubmitting(false) }
  }
  return <div className="min-h-[100dvh] bg-[#FAF5ED] font-sans text-[#071E1A]">
    <style>{'@media (max-width: 1023px) { .arch9-questionnaire:has(input:focus, textarea:focus) .arch9-form-actions { display: none; } }'}</style>
    <Header onStart={startIntro} />{phase === 'landing' ? <Landing onStart={startIntro} /> : null}{phase === 'intro' ? <Intro onStart={() => { setPhase('questionnaire'); setStep(1) }} /> : null}{phase === 'questionnaire' ? <Questionnaire step={step} form={form} setForm={setForm} onStep={setActiveStep} onSubmit={submit} submitting={submitting} submitError={submitError} /> : null}{phase === 'success' ? <Success nextAction={form.preferredNextAction} /> : null}
  </div>
}
