import { motion } from 'framer-motion'
import {
  Building,
  ClipboardList,
  FileChart,
  Home,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'

const sectionVariants = {
  hidden: { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0 },
}

const navLinks = [
  { label: 'Product', href: '#product' },
  { label: 'Solutions', href: '#solutions' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Contact', href: '#contact' },
]

const solutionsMenu = [
  { label: 'For Developers', description: 'Track developments, progress, and closing health.', href: '#role-developers' },
  { label: 'For Conveyancers', description: 'Manage workflows, documents, and handover milestones.', href: '#role-conveyancers' },
  { label: 'For Agents', description: 'Stay visible across every deal after the sale is made.', href: '#role-agents' },
  { label: 'For Buyers', description: 'Follow your transaction clearly and know what comes next.', href: '#role-buyers' },
]

const problemPoints = [
  'No single view of progress',
  'Missing documents and delays',
  'Clients constantly asking for updates',
  'Teams working in silos',
  'Too much admin and back-and-forth',
  'No shared accountability',
]

const solutionPillars = [
  {
    title: 'Shared visibility',
    description: 'One workspace that shows progress across every stakeholder, phase, and document.',
    icon: Building,
  },
  {
    title: 'Structured workflow',
    description: 'Built-in stages keep every task anchored to the right part of the transaction.',
    icon: ClipboardList,
  },
  {
    title: 'Clear responsibilities',
    description: 'Assignments, reminders, and ownership make accountability obvious.',
    icon: ShieldCheck,
  },
  {
    title: 'Better client experience',
    description: 'Buyers and teams receive the same milestones, updates, and next steps.',
    icon: Users,
  },
]

const timelineStages = [
  {
    title: 'Offer / Reservation',
    description: 'Terms logged, reservation deposit tracked, and documents collated.',
  },
  {
    title: 'Bond Process',
    description: 'Bond lodgement, approvals, and trust accounting monitored in one place.',
  },
  {
    title: 'Transfer Workflow',
    description: 'Deeds office requirements, checklists, and fee settlements stay visible.',
  },
  {
    title: 'Registration',
    description: 'Final sign-offs, registration status, and certificates are tracked live.',
  },
  {
    title: 'Handover',
    description: 'Defect lists, keys, and client handover notes are recorded for clarity.',
  },
]

const roleCards = [
  {
    id: 'role-developers',
    title: 'Developers',
    description: 'Track units, deals, and progress across your developments.',
    icon: Layers,
  },
  {
    id: 'role-conveyancers',
    title: 'Conveyancers',
    description: 'Manage workflows, documents, and milestones with more structure.',
    icon: FileChart,
  },
  {
    id: 'role-agents',
    title: 'Agents',
    description: 'Stay visible across every deal after the sale is made.',
    icon: Sparkles,
  },
  {
    id: 'role-buyers',
    title: 'Buyers',
    description: 'Follow your transaction clearly and know what comes next.',
    icon: Home,
  },
]

const workflowCards = [
  {
    step: '1',
    label: 'Transaction stage',
    title: 'Offer / Reservation',
    status: 'Complete',
    description:
      'Offer accepted, reservation recorded, and the full matter opened with the right parties attached.',
    items: [
      'Reservation pack approved',
      'Deposit and stock status locked',
      'Initial buyer documents requested',
    ],
    progress: 100,
    tone: 'complete',
  },
  {
    step: '2',
    label: 'Transaction stage',
    title: 'Bond Process',
    status: 'Active now',
    description:
      'Buyer finance steps, outstanding documents, and stakeholder visibility stay aligned in one place.',
    items: [
      'Two outstanding buyer actions',
      'Bond submission queued',
      'Conveyancer notified automatically',
    ],
    progress: 72,
    tone: 'active',
  },
  {
    step: '3',
    label: 'Transaction stage',
    title: 'Transfer Workflow',
    status: 'Ready next',
    description:
      'Legal progression is prepared ahead of time so the deal does not stall when finance clears.',
    items: [
      'Transfer pack staged',
      'Signing prep ready',
      'Instruction flow mapped',
    ],
    progress: 42,
    tone: 'next',
  },
  {
    step: '4',
    label: 'Transaction stage',
    title: 'Registration',
    status: 'Pending',
    description:
      'Final registration readiness, documents, and completion checks are aligned before closure.',
    items: [
      'Registration target tracked',
      'Final document set prepared',
      'Completion communication ready',
    ],
    progress: 24,
    tone: 'pending',
  },
]

const outcomes = [
  'More visibility across every deal',
  'Less back-and-forth between stakeholders',
  'Faster movement through key stages',
  'Better client communication',
  'More professional process management',
  'Stronger internal control and reporting',
]

const trustStatements = [
  'Designed for the realities of South African property transactions.',
  'Role-based experiences keep every stakeholder focused on their workstream.',
  'Structured around real transaction stages and document flow, not just leads.',
  'Created to reduce friction across the full process from offer to handover.',
]

const Section = ({ children, id, className = '' }) => (
  <motion.section
    id={id}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.2 }}
    transition={{ duration: 0.6 }}
    variants={sectionVariants}
    className={`w-full ${className}`}
  >
    <div className="mx-auto max-w-6xl px-6 py-0 sm:px-8 lg:px-0">{children}</div>
  </motion.section>
)

const SectionHeading = ({ eyebrow, title, description, className = '' }) => (
  <div className={`max-w-3xl space-y-3 ${className}`}>
    {eyebrow && <p className="text-xs uppercase tracking-[0.45em] text-bridge-subtle">{eyebrow}</p>}
    <h2 className="text-3xl font-semibold leading-tight text-bridge-text sm:text-4xl">{title}</h2>
    {description && <p className="text-base text-bridge-subtle">{description}</p>}
  </div>
)

const CTAButton = ({ variant = 'primary', children, href }) => {
  const baseClass =
    'inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

  const variants = {
    primary:
      'bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-lg shadow-slate-900/30 hover:brightness-105 focus-visible:outline-slate-900',
    secondary:
      'border border-slate-300 bg-white text-bridge-text shadow-sm hover:border-slate-400 focus-visible:outline-slate-400',
  }

  return (
    <motion.a
      whileHover={{ translateY: -1 }}
      transition={{ duration: 0.2 }}
      className={`${baseClass} ${variants[variant]}`}
      href={href}
    >
      {children}
    </motion.a>
  )
}

const ProblemCard = ({ text }) => (
  <motion.div
    whileHover={{ translateY: -6, boxShadow: '0 20px 45px rgba(15, 23, 42, 0.15)' }}
    className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-base text-bridge-text shadow-sm transition"
  >
    {text}
  </motion.div>
)

const SolutionCard = ({ title, description, Icon }) => (
  <motion.div
    whileHover={{ translateY: -6, boxShadow: '0 20px 45px rgba(15, 23, 42, 0.15)' }}
    className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm transition"
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
      <Icon className="h-5 w-5" />
    </div>
    <h3 className="text-lg font-semibold text-bridge-text">{title}</h3>
    <p className="text-sm text-bridge-subtle">{description}</p>
  </motion.div>
)

const RoleCard = ({ title, description, Icon, id }) => (
  <motion.article
    id={id}
    whileHover={{ translateY: -4, boxShadow: '0 20px 35px rgba(15, 23, 42, 0.12)' }}
    className="flex flex-col justify-between gap-6 rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm transition"
  >
    <div className="flex items-center gap-3">
      <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-xl font-semibold text-bridge-text">{title}</h3>
    </div>
    <p className="text-sm text-bridge-subtle">{description}</p>
    <button className="text-sm font-semibold text-slate-700 underline-offset-4 hover:text-slate-900">
      Learn More →
    </button>
  </motion.article>
)

const TimelineStep = ({ index, title, description, isLast }) => (
  <motion.div className="flex gap-4 sm:gap-6">
    <div className="flex flex-col items-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700">
        {index}
      </div>
      {!isLast && <div className="mt-2 h-full w-px bg-slate-200" />}
    </div>
    <div className="flex-1 space-y-2 pb-8">
      <p className="text-sm uppercase tracking-[0.3em] text-bridge-subtle">Stage {index}</p>
      <h3 className="text-lg font-semibold text-bridge-text">{title}</h3>
      <p className="text-sm text-bridge-subtle">{description}</p>
    </div>
  </motion.div>
)

const Header = () => (
  <header className="sticky top-0 z-50 border-b border-white/60 bg-white/90 backdrop-blur-md">
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4 sm:px-8 lg:px-0">
      <div className="text-xl font-semibold tracking-[0.2em] text-bridge-text">Bridge</div>

      <nav className="hidden items-center gap-6 text-sm font-semibold tracking-[0.25em] text-bridge-subtle lg:flex">
        {navLinks.map((link) => (
          <a key={link.label} className="transition hover:text-bridge-text" href={link.href}>
            {link.label}
          </a>
        ))}

        <div className="group relative">
          <button className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-bridge-subtle transition hover:text-bridge-text">
            Solutions
            <span className="text-[10px]">▾</span>
          </button>

          <div className="pointer-events-none absolute left-1/2 top-full z-20 -translate-x-1/2 translate-y-4 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-6 group-hover:opacity-100">
            <div className="w-[240px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-soft">
              <div className="space-y-3">
                {solutionsMenu.map((item) => (
                  <a
                    key={item.label}
                    className="group block rounded-xl px-3 py-2 text-sm transition hover:bg-slate-50"
                    href={item.href}
                  >
                    <p className="font-semibold text-slate-900 group-hover:text-slate-700">{item.label}</p>
                    <p className="text-[11px] leading-4 text-slate-500">{item.description}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <CTAButton variant="primary" href="#contact">
          Book a Demo
        </CTAButton>
      </div>
    </div>
  </header>
)

const Hero = () => (
  <section className="bg-white">
    <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:py-24 lg:grid-cols-[1.15fr,0.85fr] lg:px-8">
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.4em] text-bridge-subtle">Transaction coordination</p>
        <h1 className="text-4xl font-semibold leading-tight text-bridge-text sm:text-5xl">
          From offer to handover — all in one place.
        </h1>
        <p className="text-lg text-bridge-subtle">
          Bridge gives developers, conveyancers, agents, and buyers a shared workspace to manage every step of the
          property transaction process with more clarity, structure, and control.
        </p>
        <div className="flex flex-wrap gap-3">
          <CTAButton variant="primary" href="#contact">
            Book a Demo
          </CTAButton>
          <CTAButton variant="secondary" href="#product">
            Explore the Platform
          </CTAButton>
        </div>
        <p className="text-sm text-bridge-subtle">One transaction. One system. Everyone aligned.</p>
      </div>

      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-slate-900 p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.4em] text-slate-300">Transactions</span>
            <span className="rounded-full border border-white/30 px-3 py-1 text-[11px] uppercase tracking-[0.4em] text-white/70">
              Live
            </span>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.4em] text-slate-300">Active pipeline</p>
              <div className="text-3xl font-semibold tracking-tight">47 deals</div>
            </div>

            <div className="space-y-3">
              {['Offer accepted', 'Bond lodged', 'Documents ready for transfer'].map((item) => (
                <div key={item}>
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    {item}
                    <span className="text-[11px] uppercase tracking-[0.4em] text-emerald-300">On track</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                      style={{ width: '68%' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-white/10 p-4 text-sm text-slate-200">
              <p className="text-xs uppercase tracking-[0.4em] text-slate-300">Next milestone</p>
              <p className="text-base font-semibold text-white">Bond in process</p>
              <p className="text-xs text-slate-300">Notification sent to conveyancer + buyer</p>
            </div>
          </div>
        </div>

        <div className="absolute -bottom-8 -right-8 hidden w-48 rounded-[24px] border border-slate-200 bg-white/90 p-4 text-xs text-bridge-subtle shadow-lg md:block">
          <p className="font-semibold text-bridge-text">Structured visibility</p>
          <p className="text-[11px]">Tasks, documents, and ownership in one view.</p>
        </div>
      </motion.div>
    </div>
  </section>
)

const ProblemSection = () => (
  <Section id="problem" className="border-b border-bridge-border bg-white py-16">
    <SectionHeading
      title="Property transactions are still managed across too many disconnected systems."
      description="Most deals are still coordinated through emails, WhatsApp messages, spreadsheets, phone calls, and fragmented updates between different parties."
    />
    <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {problemPoints.map((point) => (
        <ProblemCard key={point} text={point} />
      ))}
    </div>
  </Section>
)

const SolutionSection = () => (
  <Section id="solutions" className="bg-bridge-bg py-16">
    <SectionHeading
      title="One shared platform for the people moving the deal forward."
      description="Bridge brings the key stakeholders in a property transaction into one structured system, so progress is visible, responsibilities are clear, and the process moves with less friction."
    />
    <div className="mt-10 grid gap-6 md:grid-cols-2">
      {solutionPillars.map((pillar) => (
        <SolutionCard key={pillar.title} title={pillar.title} description={pillar.description} Icon={pillar.icon} />
      ))}
    </div>
  </Section>
)

const HowItWorksSection = () => (
  <Section id="how-it-works" className="border-b border-bridge-border bg-white py-16">
    <SectionHeading eyebrow="Transaction lifecycle" title="A clearer path from accepted offer to final handover." />
    <div className="mt-10 space-y-2">
      {timelineStages.map((stage, index) => (
        <TimelineStep
          key={stage.title}
          index={index + 1}
          title={stage.title}
          description={stage.description}
          isLast={index === timelineStages.length - 1}
        />
      ))}
    </div>
  </Section>
)

const WorkflowStackCard = ({ card, index }) => {
  const stickyTop =
    index === 0
      ? 'lg:top-[110px]'
      : index === 1
        ? 'lg:top-[145px]'
        : index === 2
          ? 'lg:top-[180px]'
          : 'lg:top-[215px]'

  const overlapClass = index === 0 ? 'lg:mt-0' : 'lg:-mt-[220px]'

  const toneClass =
    card.tone === 'active'
      ? 'border border-white/15 bg-[linear-gradient(180deg,#2B2B2B_0%,#202020_100%)]'
      : 'border border-white/12 bg-[linear-gradient(180deg,#181818_0%,#101010_100%)]'

  const badgeClass =
    card.tone === 'active'
      ? 'border border-white/10 bg-white/10 text-white'
      : card.tone === 'pending'
        ? 'border border-white/10 bg-transparent text-white/55'
        : 'border border-white/10 bg-white text-black'

  return (
    <div
      className={`relative rounded-[30px] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] transition-all duration-500 lg:sticky ${stickyTop} ${overlapClass} ${toneClass}`}
      style={{ zIndex: 20 + index }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-sm font-medium text-white/75">
              {card.step}
            </div>

            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.32em] text-white/28">{card.label}</p>
              <h3 className="mt-2 text-2xl font-semibold leading-tight text-white md:text-[2rem]">
                {card.title}
              </h3>
            </div>
          </div>

          <span className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] ${badgeClass}`}>
            {card.status}
          </span>
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/60 md:text-[15px]">{card.description}</p>

        <div className="mt-5 h-[6px] w-full rounded-full bg-white/10">
          <div className="h-[6px] rounded-full bg-[#E7DED1]" style={{ width: `${card.progress}%` }} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {card.items.map((item) => (
            <div
              key={item}
              className="rounded-[20px] border border-white/12 bg-white/[0.045] px-4 py-4 text-sm leading-6 text-white/85"
            >
              {item}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

const WorkflowStackSection = () => (
  <section id="product" className="bg-[#E9E4DC] px-5 py-8 sm:px-6 md:px-8 md:py-12">
    <div className="mx-auto max-w-[1360px] rounded-[40px] bg-[#0A0A0A] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.18)] md:p-6 lg:p-10">
      <div className="grid gap-10 lg:min-h-[340vh] lg:grid-cols-[0.9fr,1.1fr] lg:gap-12">
        <div className="self-start lg:sticky lg:top-[110px] lg:h-fit">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-[11px] uppercase tracking-[0.32em] text-white/70">
            Bridge signature
          </div>

          <h2 className="mt-6 max-w-[520px] text-4xl font-semibold leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-[5rem]">
            The transaction workflow, made visible like live operational software.
          </h2>

          <p className="mt-6 max-w-[520px] text-base leading-8 text-white/60">
            This is where Bridge differentiates itself. Every stage is connected, status is legible, and the active
            moment in the deal becomes obvious instead of buried in messages and spreadsheets.
          </p>

          <div className="mt-8 grid max-w-[540px] grid-cols-2 gap-3">
            <div className="rounded-full border border-white/10 bg-white px-5 py-4 text-sm font-medium text-black">
              Complete
            </div>
            <div className="rounded-full border border-white/10 bg-transparent px-5 py-4 text-sm font-medium text-white/85">
              Active
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.045] px-5 py-4 text-sm font-medium text-white/85">
              Ready next
            </div>
            <div className="rounded-full border border-white/10 bg-transparent px-5 py-4 text-sm font-medium text-white/45">
              Pending
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:max-w-[560px]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5">
              <p className="text-[11px] uppercase tracking-[0.32em] text-white/35">Operational narrative</p>
              <p className="mt-5 text-2xl font-semibold leading-tight text-white">
                The current stage becomes the center of the conversation.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.32em] text-white/35">Active stage</p>
              <p className="mt-5 text-2xl font-semibold leading-tight text-white">Bond process</p>
            </div>
          </div>
        </div>

        <div className="relative self-start pt-2 lg:pt-0">
          {workflowCards.map((card, index) => (
            <WorkflowStackCard key={card.title} card={card} index={index} />
          ))}
        </div>
      </div>
    </div>
  </section>
)

const RoleRoutingSection = () => (
  <Section id="roles" className="bg-bridge-bg py-16">
    <SectionHeading title="Built for every key role in the transaction." />
    <div className="mt-10 grid gap-6 md:grid-cols-2">
      {roleCards.map((role) => (
        <RoleCard key={role.title} title={role.title} description={role.description} Icon={role.icon} id={role.id} />
      ))}
    </div>
  </Section>
)

const OutcomesSection = () => (
  <Section id="outcomes" className="bg-bridge-bg py-16">
    <SectionHeading
      title="Why teams use Bridge"
      description="Commercial teams, conveyancers, agents, and buyers all share the same source of truth."
    />
    <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {outcomes.map((item) => (
        <motion.div
          key={item}
          whileHover={{ translateY: -4 }}
          className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-bridge-text shadow-sm transition"
        >
          {item}
        </motion.div>
      ))}
    </div>
  </Section>
)

const TrustSection = () => (
  <Section id="trust" className="border-b border-bridge-border bg-white py-16">
    <SectionHeading
      title="Built for high-trust property workflows"
      description="Bridge limits friction by matching real conveyancing stages with role-specific responsibilities."
    />
    <div className="mt-8 space-y-4">
      {trustStatements.map((statement) => (
        <p key={statement} className="text-sm text-bridge-subtle">
          • {statement}
        </p>
      ))}
    </div>
  </Section>
)

const FinalCTASection = () => (
  <Section id="contact" className="bg-gradient-to-br from-slate-900 to-slate-800 py-16">
    <div className="rounded-[32px] border border-white/10 bg-white/5 p-10">
      <div className="space-y-6 text-white">
        <h2 className="text-3xl font-semibold">Bring more structure to every property transaction.</h2>
        <p className="text-base text-white/80">
          See how Bridge helps your team manage the full journey from offer to handover with more clarity, control, and
          confidence.
        </p>
        <div className="flex flex-wrap gap-3">
          <CTAButton variant="primary" href="#contact">
            Book a Demo
          </CTAButton>
          <CTAButton variant="secondary" href="#solutions">
            Explore Solutions
          </CTAButton>
        </div>
      </div>
    </div>
  </Section>
)

const Footer = () => (
  <footer className="bg-white/90 px-6 py-10 shadow-inner shadow-slate-900/5">
    <div className="mx-auto flex max-w-6xl flex-col gap-6 border-t border-bridge-border pt-6 text-sm text-bridge-subtle sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold tracking-[0.4em] text-bridge-text">Bridge</p>
        <p>One shared platform for property transactions.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <a href="#product" className="hover:text-bridge-text">
          Product
        </a>
        <a href="#solutions" className="hover:text-bridge-text">
          Solutions
        </a>
        <a href="#contact" className="hover:text-bridge-text">
          Contact
        </a>
      </div>

      <p className="text-xs text-bridge-subtle">© {new Date().getFullYear()} Bridge</p>
    </div>
  </footer>
)

export default function BridgeLanding() {
  return (
    <div className="min-h-screen bg-bridge-bg text-bridge-text">
      <Header />

      <main className="flex flex-col gap-20 pb-20">
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <WorkflowStackSection />
        <RoleRoutingSection />
        <OutcomesSection />
        <TrustSection />
        <FinalCTASection />
      </main>

      <Footer />
    </div>
  )
}

export default function StickyTest() {
  return (
    <div className="bg-white">
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h1 className="mb-10 text-4xl font-bold">Sticky Test</h1>
        </div>
      </section>

      <section className="bg-neutral-100 px-6 py-10">
        <div className="mx-auto grid min-h-[300vh] max-w-6xl gap-10 md:grid-cols-[0.9fr,1.1fr]">
          <div className="sticky top-[100px] h-fit self-start rounded-3xl bg-black p-8 text-white">
            <p className="text-sm uppercase tracking-[0.3em] text-white/60">Left side</p>
            <h2 className="mt-4 text-5xl font-semibold">This should stay pinned.</h2>
            <p className="mt-4 text-white/70">
              If this does not stick, the problem is in a parent wrapper.
            </p>
          </div>

          <div className="relative self-start space-y-6">
            <div className="sticky top-[100px] rounded-3xl bg-neutral-900 p-8 text-white shadow-2xl">
              Card 1
            </div>

            <div className="sticky top-[140px] -mt-[180px] rounded-3xl bg-neutral-800 p-8 text-white shadow-2xl">
              Card 2
            </div>

            <div className="sticky top-[180px] -mt-[180px] rounded-3xl bg-neutral-700 p-8 text-white shadow-2xl">
              Card 3
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}