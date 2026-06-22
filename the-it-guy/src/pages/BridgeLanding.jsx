import Lenis from 'lenis'
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Gauge,
  HandCoins,
  LayoutPanelTop,
  LineChart,
  Menu,
  MessageSquareMore,
  ShieldCheck,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react'
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BridgeCommandPalette from '../components/bridge/BridgeCommandPalette'
import { MotionCard, MotionSection, useBridgeMotion } from '../components/bridge/bridge-motion'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from '../components/ui/navigation-menu'
import { Separator } from '../components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { cn } from '../lib/utils'

const navItems = [
  { label: 'Buy', to: '/bridge/buy', dropdown: true },
  { label: 'Solutions', to: '/bridge/solutions' },
  { label: 'Tools', to: '/bridge/tools' },
  { label: 'Resources', to: '/bridge/resources' },
  { label: 'Pricing', to: '/bridge/pricing' },
  { label: 'About', to: '/bridge/about' },
]

const buyNavItems = [
  { label: 'Residential Properties', to: '/listings', copy: 'Browse homes and residential opportunities.' },
  { label: 'Commercial Properties', to: '/commercial/listings', copy: 'Explore commercial stock and leasing opportunities.' },
  { label: 'New Developments', to: '/developments', copy: 'Discover new estates, units and launches.' },
  { label: 'Affordability Calculator', to: '/bridge/tools#affordability', copy: 'Estimate affordability before you enquire.' },
  { label: 'Bond Calculator', to: '/bridge/tools#bond-calculator', copy: 'Understand monthly repayment ranges.' },
  { label: 'Transfer Cost Calculator', to: '/bridge/tools#transfer-costs', copy: 'Plan once-off purchase costs.' },
  { label: 'Rental Yield Calculator', to: '/bridge/tools#rental-yield', copy: 'Model income and yield quickly.' },
  { label: 'Buyer Guides', to: '/bridge/resources#buyer-guides', copy: 'Learn the journey from search to registration.' },
]

const heroBenefits = [
  { title: 'End-to-end visibility', icon: LayoutPanelTop },
  { title: 'Stronger relationships', icon: Users },
  { title: 'More efficiency', icon: Gauge },
  { title: 'Better outcomes', icon: CheckCircle2 },
]

const journeyPathCards = [
  {
    title: 'Buy Property',
    copy: 'Browse properties, developments, calculators and buyer resources.',
    cta: 'Explore Property',
    to: '/bridge/buy',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Grow Your Property Business',
    copy: 'Deliver a world-class transaction experience from offer to registration.',
    cta: 'Explore Platform',
    to: '/bridge/product',
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
  },
]

const buyerDiscoveryCards = [
  { title: 'Smart Search', copy: 'Find residential, commercial and development opportunities in the right place.', icon: Building2 },
  { title: 'Calculators', copy: 'Estimate affordability, bond repayments, transfer costs and rental yield.', icon: Gauge },
  { title: 'Buying Guides', copy: 'Understand each decision before the transaction begins.', icon: ClipboardList },
  { title: 'Market Insights', copy: 'Read the market with clearer context before you commit.', icon: LineChart },
  { title: 'Saved Alerts', copy: 'Keep track of the opportunities that match your journey.', icon: CheckCircle2 },
]

const professionalProductCards = [
  { title: 'Agent Dashboard', copy: 'Manage and track all transactions.', icon: LayoutPanelTop },
  { title: 'Buyer Portal', copy: 'Keep buyers informed every step of the way.', icon: UserRound },
  { title: 'Seller Portal', copy: 'Real-time updates and transparent communication.', icon: MessageSquareMore },
  { title: 'Transaction Tracking', copy: 'End-to-end visibility for every stakeholder.', icon: Workflow },
]

const stakeholderParticipants = ['Buyer', 'Seller', 'Agent', 'Attorney', 'Bond Originator', 'Bank', 'Deeds Office']

const enterpriseCards = [
  { title: 'Branded Portals', copy: 'Your brand. Your client experience.', icon: ShieldCheck },
  { title: 'Automated Updates', copy: 'Keep clients informed automatically.', icon: MessageSquareMore },
  { title: 'Real-Time Tracking', copy: 'Complete visibility at every step.', icon: LineChart },
  { title: 'Stronger Relationships', copy: 'Build trust and increase referrals.', icon: HandCoins },
]

const signatureStages = [
  {
    id: 'offer',
    title: 'Offer / Reservation',
    status: 'complete',
    chip: 'Complete',
    summary: 'Offer accepted, reservation recorded, and the full matter opened with the right parties attached.',
    bullets: ['Reservation pack approved', 'Deposit and stock status locked', 'Initial buyer documents requested'],
  },
  {
    id: 'bond',
    title: 'Bond Process',
    status: 'active',
    chip: 'Active now',
    summary: 'Buyer finance steps, outstanding documents, and stakeholder visibility stay aligned in one place.',
    bullets: ['Two outstanding buyer actions', 'Bond submission queued', 'Conveyancer notified automatically'],
  },
  {
    id: 'transfer',
    title: 'Transfer Workflow',
    status: 'ready',
    chip: 'Ready next',
    summary: 'Legal progression is prepared ahead of time so the deal does not stall when finance clears.',
    bullets: ['Document pack pre-checked', 'Dependencies mapped', 'Comments visible to the right teams'],
  },
  {
    id: 'registration',
    title: 'Registration',
    status: 'pending',
    chip: 'Pending',
    summary: 'The final legal milestone stays visible as part of the same connected transaction record.',
    bullets: ['Matter status prepared', 'Registration forecast visible', 'Executive reporting updated live'],
  },
  {
    id: 'handover',
    title: 'Handover',
    status: 'pending',
    chip: 'Pending',
    summary: 'Close the loop with client communication, practical handover steps, and a cleaner finish.',
    bullets: ['Handover checklist templated', 'Buyer comms staged', 'Final delivery notes tracked'],
  },
]

const processSteps = [
  {
    number: '01',
    title: 'Open the deal',
    copy: 'Capture the accepted offer, attach the right role-players, and establish one live record from day one.',
  },
  {
    number: '02',
    title: 'Coordinate responsibilities',
    copy: 'Move tasks, documents, and stakeholder actions through the correct stage with visibility for the teams involved.',
  },
  {
    number: '03',
    title: 'Track momentum',
    copy: 'See what is complete, what is blocked, and what should happen next without stitching updates together manually.',
  },
  {
    number: '04',
    title: 'Report with confidence',
    copy: 'Turn live transaction flow into cleaner internal oversight and presentable stakeholder reporting.',
  },
]

const personaCards = [
  {
    title: 'Developers',
    to: '/bridge/for-developers',
    copy: 'Track units, transaction flow, bottlenecks, and portfolio progress across your developments.',
    detail: 'Portfolio view, unit-level movement, reporting readiness',
    preview: ['Development performance', 'Deal ageing', 'Registration forecast'],
    icon: Building2,
  },
  {
    title: 'Conveyancers',
    to: '/bridge/for-conveyancers',
    copy: 'Manage workflows, documents, and legal milestones with more structure and less back-and-forth.',
    detail: 'Matter readiness, task ownership, document control',
    preview: ['Matter checklist', 'Stage dependencies', 'Document status'],
    icon: FileCheck2,
  },
  {
    title: 'Agents',
    to: '/bridge/for-agents',
    copy: 'Stay visible across every deal after the sale is agreed, without chasing fragmented updates.',
    detail: 'Post-sale visibility, cleaner buyer conversations, status clarity',
    preview: ['Buyer status', 'Sales-to-transfer handoff', 'Outstanding actions'],
    icon: Users,
  },
  {
    title: 'Buyers',
    to: '/bridge/for-buyers',
    copy: 'Follow the transaction clearly and understand what is complete, what is required, and what comes next.',
    detail: 'Guided onboarding, next-step clarity, calmer purchase journey',
    preview: ['Next required step', 'Document prompts', 'Handover readiness'],
    icon: UserRound,
  },
]

const productPreviews = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    title: 'Portfolio command view',
    copy: 'See active deals, pressure points, stage mix, and readiness across the wider book from one executive surface.',
    metrics: ['Live matters by development', 'Escalations flagged by stage', 'Registration readiness snapshot'],
  },
  {
    id: 'transaction',
    label: 'Transaction',
    title: 'Single matter workspace',
    copy: 'Tie comments, documents, tasks, stakeholder ownership, and lifecycle state back to one live transaction record.',
    metrics: ['Role-based actions', 'Document checklist in context', 'Milestone-by-milestone audit trail'],
  },
  {
    id: 'lifecycle',
    label: 'Lifecycle',
    title: 'Progress with clarity',
    copy: 'Understand what has moved, what is blocked, and where the deal sits in the journey from offer through handover.',
    metrics: ['Connected status line', 'Complete / active / ready-next states', 'Buyer-facing next-step visibility'],
  },
  {
    id: 'reporting',
    label: 'Reporting',
    title: 'Report-ready operational clarity',
    copy: 'Bridge turns workflow activity into presentable oversight so teams stop rebuilding transaction status in spreadsheets.',
    metrics: ['Executive-ready summaries', 'Development-level trend reporting', 'Fewer manual stakeholder updates'],
    premium: true,
  },
]

const reportHighlights = [
  'Cleaner stakeholder communication',
  'Less manual status collation',
  'Clearer operational oversight',
  'Reporting built from live workflow data',
]

const outcomes = [
  { title: 'More visibility across every deal', tone: 'standard' },
  { title: 'Less back-and-forth between stakeholders', tone: 'standard' },
  { title: 'Faster movement through key stages', tone: 'accent' },
  { title: 'Better client communication', tone: 'standard' },
  { title: 'More professional process management', tone: 'accent' },
  { title: 'Stronger internal control and reporting', tone: 'standard' },
]

const trustPanels = [
  'Designed around the realities of South African property transactions.',
  'Role-based experiences keep every stakeholder focused without fragmenting the system.',
  'Structured around real milestones, documents, and responsibilities rather than lead management patterns.',
]

const trustAccordion = [
  {
    title: 'Built for real transaction flow',
    copy: 'Bridge follows the transaction as it actually moves across commercial, legal, and buyer-facing milestones rather than forcing teams into generic CRM logic.',
  },
  {
    title: 'Created for high-trust workflows',
    copy: 'Permissions, ownership, and role-specific experiences are designed to reduce friction without losing operational control.',
  },
  {
    title: 'Focused on reporting as well as workflow',
    copy: 'The product is designed to give leadership cleaner oversight, not just help teams tick tasks off inside a system.',
  },
]

const rolePageContent = {
  developers: {
    title: 'For Developers',
    summary: 'Bridge gives developers a single operating layer across units, transaction flow, bottlenecks, and reporting readiness.',
    highlights: ['Portfolio visibility', 'Cross-team accountability', 'Cleaner reporting'],
  },
  conveyancers: {
    title: 'For Conveyancers',
    summary: 'Bridge keeps legal workflow, document readiness, and stakeholder communication anchored to the same live matter.',
    highlights: ['Matter control', 'Structured milestones', 'Status clarity'],
  },
  agents: {
    title: 'For Agents',
    summary: 'Bridge extends visibility beyond the sale so agents stay informed as the transaction progresses toward transfer and handover.',
    highlights: ['Post-sale visibility', 'Cleaner buyer conversations', 'Fewer manual follow-ups'],
  },
  buyers: {
    title: 'For Buyers',
    summary: 'Bridge gives buyers a clearer journey with guided expectations, document prompts, and next-step visibility throughout the transaction.',
    highlights: ['Clearer expectations', 'More confidence', 'Professional experience'],
  },
}

function siteLinkClass(active) {
  return cn(
    'rounded-full px-4 py-2 text-sm font-medium transition',
    active ? 'bg-black/[0.05] text-marketing-ink' : 'text-marketing-muted hover:bg-black/[0.035] hover:text-marketing-ink',
  )
}

function useBridgeSmoothScroll() {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion || typeof window === 'undefined') {
      return undefined
    }

    const lenis = new Lenis({
      duration: 1.02,
      smoothWheel: true,
      wheelMultiplier: 0.92,
    })

    let frameId = 0

    function raf(time) {
      lenis.raf(time)
      frameId = window.requestAnimationFrame(raf)
    }

    frameId = window.requestAnimationFrame(raf)

    return () => {
      window.cancelAnimationFrame(frameId)
      lenis.destroy()
    }
  }, [reduceMotion])
}

function SectionIntro({ eyebrow, title, copy, tier = 'standard' }) {
  return (
    <div className="max-w-3xl space-y-4">
      <Badge variant={tier === 'hero' ? 'accent' : 'default'}>{eyebrow}</Badge>
      <h2 className={cn('tracking-[-0.05em] text-marketing-ink', tier === 'emphasis' ? 'text-[clamp(2.4rem,4vw,3.9rem)] leading-[0.98]' : 'text-[clamp(2rem,3.6vw,3.25rem)] leading-[1.02]')}>
        {title}
      </h2>
      <p className="text-[15px] leading-7 text-marketing-muted">{copy}</p>
    </div>
  )
}

function SectionWrap({ children, className = '' }) {
  return <div className={cn('mx-auto w-full max-w-marketing', className)}>{children}</div>
}

function DarkFeaturePanel({ className = '', children }) {
  return (
    <div
      className={cn(
        'rounded-[32px] border border-black/6 bg-marketing-contrast text-white shadow-marketing-float',
        className,
      )}
    >
      {children}
    </div>
  )
}

function BridgeHeader({ currentPath }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-3 z-40 rounded-[28px] border border-white/70 bg-white/62 px-4 py-4 shadow-marketing-soft backdrop-blur-2xl md:px-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link to="/bridge" className="flex items-center gap-3 text-[1.05rem] font-semibold tracking-[0.16em] text-marketing-ink">
            <img src="/brand/bridge_9_white_background.png" alt="" className="h-7 w-auto rounded-md" />
            ARCH9
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            <NavigationMenu className="relative">
              <NavigationMenuList>
                {navItems.map((item) => (
                  <NavigationMenuItem key={item.label}>
                    {item.dropdown ? (
                      <>
                        <NavigationMenuTrigger className={currentPath.startsWith('/bridge/buy') ? 'bg-black/[0.05] text-marketing-ink' : ''}>
                          {item.label}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className="w-[min(92vw,560px)]">
                          <div className="grid gap-2 sm:grid-cols-2">
                            {buyNavItems.map((buyItem) => (
                              <NavigationMenuLink asChild key={buyItem.label}>
                                <Link to={buyItem.to} className="rounded-[18px] px-4 py-3 transition hover:bg-black/[0.035]">
                                  <div className="text-sm font-semibold text-marketing-ink">{buyItem.label}</div>
                                  <div className="mt-1 text-sm leading-6 text-marketing-muted">{buyItem.copy}</div>
                                </Link>
                              </NavigationMenuLink>
                            ))}
                          </div>
                        </NavigationMenuContent>
                      </>
                    ) : (
                      <NavigationMenuLink asChild>
                        <Link to={item.to} className={siteLinkClass(currentPath === item.to)}>
                          {item.label}
                        </Link>
                      </NavigationMenuLink>
                    )}
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
              <NavigationMenuViewport />
            </NavigationMenu>
          </div>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild variant="secondary">
            <Link to="/bridge/product">Explore the Platform</Link>
          </Button>
          <Button asChild>
            <Link to="/bridge/contact">
              Book a Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-marketing-borderStrong bg-white/85 text-marketing-ink shadow-marketing-soft lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(92vw,380px)]">
            <SheetHeader>
              <SheetTitle>Arch9 navigation</SheetTitle>
              <SheetDescription>Find property journeys, platform solutions and resources.</SheetDescription>
            </SheetHeader>
            <div className="grid gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded-[18px] border border-marketing-border bg-white/84 px-4 py-3 text-sm font-semibold text-marketing-ink transition hover:bg-marketing-accentSoft"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <Separator />
            <div className="grid gap-2">
              {buyNavItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded-[18px] border border-marketing-border bg-white/84 px-4 py-3 transition hover:bg-marketing-accentSoft"
                  onClick={() => setOpen(false)}
                >
                  <div className="text-sm font-semibold text-marketing-ink">{item.label}</div>
                  <div className="mt-1 text-sm leading-6 text-marketing-muted">{item.copy}</div>
                </Link>
              ))}
            </div>
            <Separator />
            <div className="grid gap-3">
              <Button asChild>
                <Link to="/bridge/contact" onClick={() => setOpen(false)}>
                  Book a Demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/bridge/product" onClick={() => setOpen(false)}>
                  Explore the Platform
                </Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}

function MetricPill({ label, value, subtle = false }) {
  return (
    <div
      className={cn(
        'rounded-[20px] border px-4 py-4',
        subtle ? 'border-white/10 bg-white/[0.04] text-white/72' : 'border-marketing-border bg-white/84 text-marketing-muted',
      )}
    >
      <div className={cn('text-[10px] uppercase tracking-[0.18em]', subtle ? 'text-white/42' : 'text-marketing-subtle')}>{label}</div>
      <div className={cn('mt-3 text-[1.2rem] font-semibold tracking-[-0.04em]', subtle ? 'text-white' : 'text-marketing-ink')}>{value}</div>
    </div>
  )
}

function PreviewCanvas({ preview }) {
  if (preview.id === 'reporting') {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.06fr,0.94fr]">
        <div className="rounded-[24px] border border-white/10 bg-black/[0.14] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">Quarterly reporting pack</div>
              <div className="mt-3 text-[1.18rem] font-semibold text-white">Development performance summary</div>
            </div>
            <Badge variant="accent" className="border-white/10 bg-white/[0.08] text-[#eadcc7]">
              Board-ready
            </Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ['Active matters', '47'],
              ['Ready next', '18'],
              ['Blocker age', '4.2d'],
            ].map(([label, value]) => (
              <MetricPill key={label} label={label} value={value} subtle />
            ))}
          </div>
          <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.05] p-4">
            <div className="flex items-end gap-2 h-32">
              {[36, 52, 48, 64, 61, 78, 74, 88].map((height, index) => (
                <div key={`${height}-${index}`} className="flex flex-1 flex-col justify-end">
                  <div className="rounded-t-full bg-[#eadcc7]/85" style={{ height: `${height}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[10px] uppercase tracking-[0.16em] text-white/42">
              <span>Week 1</span>
              <span>Week 8</span>
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.05] p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">What leadership sees</div>
            <div className="mt-4 space-y-3">
              {['Transactions by stage', 'Escalations requiring intervention', 'Weekly movement by development'].map((item) => (
                <div key={item} className="rounded-[16px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm text-white/74">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-gradient-to-br from-[#26231f] to-[#111111] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">Export summary</div>
                <div className="mt-2 text-[1.02rem] font-semibold text-white">Ready for stakeholder review</div>
              </div>
              <BarChart3 className="h-5 w-5 text-[#eadcc7]" />
            </div>
            <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-7 text-white/72">
              Reporting is generated from live workflow data rather than manually rebuilt before meetings.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (preview.id === 'dashboard') {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.08fr,0.92fr]">
        <div className="rounded-[24px] border border-marketing-border bg-white/88 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Portfolio command view</div>
              <div className="mt-2 text-[1.1rem] font-semibold tracking-[-0.04em] text-marketing-ink">Development-level oversight</div>
            </div>
            <Badge variant="accent">Live portfolio</Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ['Live matters', '47'],
              ['At risk', '6'],
              ['Ready next', '18'],
            ].map(([label, value]) => (
              <MetricPill key={label} label={label} value={value} />
            ))}
          </div>
          <div className="mt-4 rounded-[22px] border border-marketing-border bg-marketing-panelStrong p-4">
            <div className="grid gap-3 md:grid-cols-[1.2fr,0.8fr]">
              <div className="space-y-2">
                {[
                  ['Junoah Estate', '12 active | 3 ready next'],
                  ['Bergview Residences', '9 active | 1 blocked'],
                  ['Riverside Square', '7 active | 4 registration-ready'],
                ].map(([title, detail]) => (
                  <div key={title} className="rounded-[16px] border border-white/74 bg-white/82 px-4 py-3">
                    <div className="text-sm font-semibold text-marketing-ink">{title}</div>
                    <div className="mt-1 text-sm text-marketing-muted">{detail}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-[18px] border border-white/74 bg-white/82 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Stage mix</div>
                <div className="mt-4 space-y-3">
                  {[72, 58, 41, 27].map((value, index) => (
                    <div key={`${value}-${index}`}>
                      <div className="flex items-center justify-between text-xs text-marketing-muted">
                        <span>{['Bond', 'Transfer', 'Registration', 'Handover'][index]}</span>
                        <span>{value}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-black/[0.05]">
                        <div className="h-2 rounded-full bg-marketing-accent" style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          {preview.metrics.map((metric) => (
            <div key={metric} className="rounded-[22px] border border-marketing-border bg-white/84 px-5 py-4 text-sm leading-7 text-marketing-muted">
              {metric}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (preview.id === 'transaction') {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.02fr,0.98fr]">
        <div className="rounded-[24px] border border-marketing-border bg-white/88 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Single matter workspace</div>
              <div className="mt-2 text-[1.1rem] font-semibold tracking-[-0.04em] text-marketing-ink">Bond process active</div>
            </div>
            <Badge variant="accent">Live matter</Badge>
          </div>
          <div className="mt-5 grid gap-3">
            {[
              ['Buyer documents', '2 outstanding', 'w-2/3'],
              ['Conveyancer pack', 'Prepared next', 'w-1/2'],
              ['Agent visibility', 'In sync', 'w-full'],
            ].map(([label, value, width]) => (
              <div key={label} className="rounded-[20px] border border-marketing-border bg-marketing-panelStrong p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-marketing-ink">{label}</span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">{value}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-black/[0.05]">
                  <div className={cn('h-2 rounded-full bg-marketing-accent', width)} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <div className="rounded-[22px] border border-marketing-border bg-white/84 p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Context panel</div>
            <div className="mt-4 space-y-3">
              {['Stakeholders attached', 'Document checklist in context', 'Milestone-by-milestone audit trail'].map((item) => (
                <div key={item} className="rounded-[16px] border border-marketing-border bg-marketing-panelStrong px-4 py-3 text-sm text-marketing-muted">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[22px] border border-marketing-border bg-marketing-panelStrong p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Activity log</div>
            <div className="mt-4 space-y-3">
              {[
                'Buyer document reminder sent',
                'Bond submission queued',
                'Transfer pack marked ready next',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-[16px] border border-white/74 bg-white/84 px-4 py-3 text-sm text-marketing-muted">
                  <span className="h-2 w-2 rounded-full bg-marketing-accent" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
      <div className="rounded-[24px] border border-marketing-border bg-white/88 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Lifecycle progression</div>
            <div className="mt-2 text-[1.1rem] font-semibold tracking-[-0.04em] text-marketing-ink">Clear status across the full transaction</div>
          </div>
          <Badge variant="accent">Lifecycle</Badge>
        </div>
        <div className="mt-5 grid gap-3">
          {signatureStages.slice(0, 4).map((stage, index) => (
            <div key={stage.id} className={cn('rounded-[20px] border p-4', index === 1 ? 'border-marketing-accent/25 bg-marketing-accentSoft' : 'border-marketing-border bg-marketing-panelStrong')}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold', index === 1 ? 'border-marketing-accent/30 bg-white text-marketing-accent' : 'border-marketing-border bg-white/84 text-marketing-subtle')}>
                    {index + 1}
                  </div>
                  <div className="text-sm font-semibold text-marketing-ink">{stage.title}</div>
                </div>
                <span className="text-[10px] uppercase tracking-[0.16em] text-marketing-subtle">{stage.chip}</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-black/[0.05]">
                <div
                  className={cn(
                    'h-2 rounded-full bg-marketing-accent',
                    index === 0 && 'w-full',
                    index === 1 && 'w-[72%]',
                    index === 2 && 'w-[48%]',
                    index === 3 && 'w-[22%]',
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4">
        {preview.metrics.map((metric) => (
          <div key={metric} className="rounded-[22px] border border-marketing-border bg-white/84 px-5 py-4 text-sm leading-7 text-marketing-muted">
            {metric}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgressStatusCard({ label, status, progress, prefersReducedMotion }) {
  const fillTone =
    status === 'Complete' ? 'bg-[#f4eee6]' : status === 'In progress' ? 'bg-[#d8c7ae]' : 'bg-[#c2b4a0]/85'

  return (
    <Motion.div
      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="rounded-[24px] border border-white/10 bg-black/20 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] xl:px-6"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="text-[17px] font-medium leading-[1.15] tracking-[-0.03em] text-white/92 xl:text-[19px]">{label}</div>
        <div className="pt-1 text-right text-[11px] uppercase tracking-[0.2em] text-[#d8c7ae] xl:text-[12px]">{status}</div>
      </div>
      <div className="mt-5 h-3 rounded-full bg-white/10">
        <Motion.div
          initial={prefersReducedMotion ? false : { width: 0 }}
          animate={{ width: progress }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          className={cn('h-3 rounded-full', fillTone)}
        />
      </div>
    </Motion.div>
  )
}

function HeroProductProofBlock() {
  return (
    <div className="relative min-h-[620px] overflow-hidden rounded-[34px] border border-white/90 bg-[linear-gradient(145deg,#fffdf8_0%,#f4efe7_62%,#e9dfd0_100%)] p-5 shadow-marketing-float md:p-7">
      <div className="absolute inset-x-8 top-8 h-48 rounded-full bg-white/55 blur-3xl" />
      <div className="relative rounded-[28px] border border-white/85 bg-white/80 p-4 shadow-[0_28px_80px_rgba(57,49,39,0.14)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 border-b border-marketing-border px-2 pb-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Agency command centre</div>
            <div className="mt-2 text-[1.1rem] font-semibold tracking-[-0.04em] text-marketing-ink">Transaction OS</div>
          </div>
          <div className="rounded-full border border-[#d7c7b4] bg-[#f8f1e8] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b664f]">
            Live
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            ['Active deals', '47', 'Across branches'],
            ['At risk', '6', 'Needs attention'],
            ['Ready next', '18', 'Moving forward'],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-[22px] border border-marketing-border bg-marketing-panelStrong p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-marketing-subtle">{label}</div>
              <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-marketing-ink">{value}</div>
              <div className="mt-1 text-xs text-marketing-muted">{detail}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="rounded-[24px] border border-marketing-border bg-white/86 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-marketing-subtle">Transaction pipeline</div>
                <div className="mt-2 text-sm font-semibold text-marketing-ink">From offer to registration</div>
              </div>
              <Badge variant="accent">Connected</Badge>
            </div>
            <div className="mt-5 space-y-4">
              {[
                ['Offer signed', '100%'],
                ['Bond process', '72%'],
                ['Transfer prep', '54%'],
                ['Registration', '26%'],
              ].map(([label, width]) => (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs text-marketing-muted">
                    <span>{label}</span>
                    <span>{width}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-black/[0.05]">
                    <div className="h-2 rounded-full bg-marketing-accent" style={{ width }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            {[
              'Buyer documents requested',
              'Attorney matter opened',
              'Bond originator updated',
            ].map((item) => (
              <div key={item} className="rounded-[20px] border border-marketing-border bg-white/86 px-4 py-3 text-sm text-marketing-muted">
                <CheckCircle2 className="mr-2 inline h-4 w-4 text-marketing-accent" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute bottom-6 right-5 w-[min(72%,340px)] rounded-[26px] border border-white/80 bg-white/88 p-5 shadow-[0_24px_70px_rgba(57,49,39,0.16)] backdrop-blur-xl">
        <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Client portal</div>
        <div className="mt-3 text-[1.05rem] font-semibold text-marketing-ink">Next step visible</div>
        <p className="mt-2 text-sm leading-6 text-marketing-muted">Everyone sees what is complete, what is required, and who owns the next move.</p>
      </div>
    </div>
  )
}

function HeroSection() {
  return (
    <MotionSection className="pt-14 md:pt-16">
      <SectionWrap>
        <div className="grid items-center gap-6 xl:grid-cols-[1.02fr,0.98fr]">
          <div className="space-y-8">
            <div className="space-y-6">
              <Badge variant="accent">Transaction Operating System for Property</Badge>
              <h1 className="max-w-[13ch] text-[clamp(3.15rem,6.4vw,6rem)] font-semibold leading-[0.88] tracking-[-0.065em] text-marketing-ink">
                Power your business.
                <br />
                Deliver every transaction with confidence.
              </h1>
              <p className="max-w-2xl text-[17px] leading-8 text-marketing-muted">
                One connected platform to manage, communicate and move every deal forward — from offer to registration.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/bridge/product">
                    Explore the Platform
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/bridge/contact">Book a Demo</Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {heroBenefits.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="rounded-[20px] border border-marketing-border bg-white/74 p-4 shadow-marketing-soft">
                    <Icon className="h-5 w-5 text-marketing-accent" />
                    <div className="mt-3 text-sm font-semibold text-marketing-ink">{item.title}</div>
                  </div>
                )
              })}
            </div>
            <div className="grid gap-3 rounded-[26px] border border-marketing-border bg-marketing-panelStrong p-4 sm:grid-cols-3">
              {['Agency Principals', 'Estate Agents', 'Attorneys & Originators'].map((item) => (
                <div key={item} className="rounded-[18px] border border-white/70 bg-white/84 px-4 py-3 text-sm font-semibold text-marketing-muted">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div>
            <HeroProductProofBlock />
          </div>
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function PathImage({ src, title }) {
  return (
    <div className="relative min-h-[250px] overflow-hidden rounded-[28px]">
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(21,28,22,0.05)_0%,rgba(21,28,22,0.5)_100%)]" />
      <div className="absolute bottom-4 left-4 right-4 rounded-[20px] border border-white/35 bg-white/18 px-4 py-3 text-sm font-semibold text-white backdrop-blur-md">
        {title}
      </div>
    </div>
  )
}

function ProductMockup({ compact = false }) {
  return (
    <div className={cn('rounded-[28px] border border-marketing-border bg-white/90 p-4 shadow-marketing-panel', compact ? 'max-w-sm' : '')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-marketing-subtle">Live transaction</div>
          <div className="mt-2 text-sm font-semibold text-marketing-ink">Offer to registration</div>
        </div>
        <Badge variant="accent">Active</Badge>
      </div>
      <div className="mt-4 space-y-3">
        {[
          ['Offer signed', '100%'],
          ['Bond process', '72%'],
          ['Transfer', '48%'],
        ].map(([label, width]) => (
          <div key={label} className="rounded-[18px] border border-marketing-border bg-marketing-panelStrong p-3">
            <div className="flex items-center justify-between text-xs text-marketing-muted">
              <span>{label}</span>
              <span>{width}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-black/[0.05]">
              <div className="h-2 rounded-full bg-marketing-accent" style={{ width }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PhoneMockup() {
  return (
    <div className="w-[190px] rounded-[32px] border border-[#242424]/10 bg-[#171717] p-2 shadow-[0_24px_70px_rgba(40,34,28,0.18)]">
      <div className="rounded-[25px] bg-[#fbfaf7] p-4">
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[#d9d0c3]" />
        <div className="text-[10px] uppercase tracking-[0.16em] text-marketing-subtle">Buyer portal</div>
        <div className="mt-2 text-sm font-semibold text-marketing-ink">Next step</div>
        <div className="mt-4 space-y-2">
          {['Upload ID', 'Bond update', 'Attorney review'].map((item, index) => (
            <div key={item} className="rounded-[14px] border border-marketing-border bg-white px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-marketing-muted">
                <span className={cn('h-2 w-2 rounded-full', index === 0 ? 'bg-marketing-accent' : 'bg-[#d7c7b4]')} />
                {item}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SignatureWorkflowSection() {
  return (
    <MotionSection className="pt-20" id="stakeholders">
      <SectionWrap>
        <Card className="overflow-hidden bg-[linear-gradient(145deg,#fffdf8,#f1e9dc)] shadow-marketing-panel">
          <CardContent className="grid gap-8 p-6 md:p-8 xl:grid-cols-[0.86fr,1.14fr] xl:p-10">
            <div className="space-y-5">
              <Badge variant="accent">One connected transaction</Badge>
              <h2 className="max-w-[13ch] text-[clamp(2.4rem,4vw,4.2rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-marketing-ink">
                One transaction. Every stakeholder.
              </h2>
              <p className="max-w-xl text-[15px] leading-7 text-marketing-muted">
                A connected journey for everyone involved in the transaction.
              </p>
              <Button asChild variant="secondary">
                <Link to="/bridge/how-it-works">
                  View How It Works
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute left-6 right-6 top-1/2 hidden h-px bg-gradient-to-r from-transparent via-[#cdbcaa] to-transparent lg:block" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stakeholderParticipants.map((participant, index) => (
                  <StakeholderNode key={participant} label={participant} index={index} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </SectionWrap>
    </MotionSection>
  )
}

function ProblemSection() {
  return (
    <MotionSection className="pt-20" id="journey-path">
      <SectionWrap>
        <div className="mb-9 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionIntro
            eyebrow="Choose your path"
            title="Where are you on your property journey?"
            copy="Arch9 keeps buyers close to property discovery while giving professionals the transaction operating layer behind the experience."
          />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {journeyPathCards.map((card) => (
            <MotionCard key={card.title}>
              <Card className="group h-full overflow-hidden bg-marketing-panelElevated shadow-marketing-panel">
                <CardContent className="grid h-full gap-6 p-5 md:grid-cols-[0.95fr,1.05fr] md:p-6">
                  <div className="flex flex-col justify-between gap-6">
                    <div>
                      <Badge variant="accent">{card.title === 'Buy Property' ? 'For buyers & sellers' : 'For professionals'}</Badge>
                      <h3 className="mt-5 text-[clamp(2rem,3vw,3rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-marketing-ink">{card.title}</h3>
                      <p className="mt-4 text-[15px] leading-7 text-marketing-muted">{card.copy}</p>
                    </div>
                    <Button asChild variant="secondary" className="w-fit">
                      <Link to={card.to}>
                        {card.cta}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  <PathImage src={card.image} title={card.title} />
                </CardContent>
              </Card>
            </MotionCard>
          ))}
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function BuyerToolCard({ card }) {
  const Icon = card.icon
  return (
    <MotionCard>
      <Card className="h-full bg-white/88">
        <CardHeader className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-marketing-border bg-marketing-panelStrong text-marketing-accent">
            <Icon className="h-5 w-5" />
          </div>
          <CardTitle>{card.title}</CardTitle>
          <CardDescription>{card.copy}</CardDescription>
        </CardHeader>
      </Card>
    </MotionCard>
  )
}

function BenefitsSection() {
  return (
    <MotionSection className="pt-20" id="buyers">
      <SectionWrap>
        <div className="grid gap-8 lg:grid-cols-[0.86fr,1.14fr] lg:items-end">
          <SectionIntro
            eyebrow="For buyers & sellers"
            title="Find. Explore. Decide with confidence."
            copy="Property discovery now lives where it belongs: inside Buy, supported by developments, resources and practical decision tools."
          />
          <div className="rounded-[30px] border border-marketing-border bg-marketing-panelStrong p-4 shadow-marketing-panel">
            <div className="grid gap-4 md:grid-cols-[1.15fr,0.85fr]">
              <PathImage
                src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80"
                title="Featured developments"
              />
              <div className="grid gap-3">
                {['Residential Listings', 'Commercial Listings', 'New Developments', 'Buyer Resources'].map((item) => (
                  <Link key={item} to="/bridge/buy" className="rounded-[18px] border border-white/70 bg-white/86 px-4 py-3 text-sm font-semibold text-marketing-muted transition hover:text-marketing-ink">
                    {item}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-5">
          {buyerDiscoveryCards.map((card) => (
            <BuyerToolCard key={card.title} card={card} />
          ))}
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function ProcessSection() {
  return (
    <MotionSection className="pt-20" id="professionals">
      <SectionWrap>
        <Card className="overflow-hidden bg-marketing-panelElevated shadow-marketing-panel">
          <CardHeader className="pb-0">
            <SectionIntro
              eyebrow="For professionals"
              title="Everything you need to run better transactions."
              copy="Powerful tools that help you manage every transaction from offer to registration."
            />
          </CardHeader>
          <CardContent className="pt-10">
            <div className="grid gap-7 xl:grid-cols-[1.04fr,0.96fr] xl:items-center">
              <div className="relative min-h-[430px] rounded-[32px] border border-marketing-border bg-[linear-gradient(145deg,#fbfaf7,#eee5d8)] p-6">
                <ProductMockup />
                <div className="absolute bottom-7 right-7">
                  <PhoneMockup />
                </div>
                <div className="absolute bottom-8 left-8 max-w-[240px] rounded-[24px] border border-white/75 bg-white/86 p-5 shadow-marketing-soft">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-marketing-subtle">Stakeholder view</div>
                  <div className="mt-2 text-[1.15rem] font-semibold tracking-[-0.04em] text-marketing-ink">One connected journey</div>
                  <p className="mt-2 text-sm leading-6 text-marketing-muted">Agent, buyer, seller, attorney and bond teams stay aligned.</p>
                </div>
              </div>
              <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
                {professionalProductCards.map((card) => {
                  const Icon = card.icon
                  return (
                    <MotionCard key={card.title}>
                      <Card className="h-full bg-white/88">
                        <CardHeader className="space-y-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-marketing-border bg-marketing-panelStrong text-marketing-accent">
                            <Icon className="h-5 w-5" />
                          </div>
                          <CardTitle>{card.title}</CardTitle>
                          <CardDescription>{card.copy}</CardDescription>
                        </CardHeader>
                      </Card>
                    </MotionCard>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </SectionWrap>
    </MotionSection>
  )
}

function StakeholderNode({ label, index }) {
  return (
    <div className="rounded-[22px] border border-marketing-border bg-white/88 px-5 py-4 shadow-marketing-soft">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-marketing-accentSoft text-xs font-semibold text-marketing-accent">
          {index + 1}
        </div>
        <div className="text-sm font-semibold text-marketing-ink">{label}</div>
      </div>
    </div>
  )
}

function PersonaSection() {
  return (
    <MotionSection className="pt-20" id="enterprise">
      <SectionWrap>
        <div className="grid gap-8 xl:grid-cols-[0.82fr,1.18fr] xl:items-start">
          <div className="space-y-5">
            <SectionIntro
              eyebrow="Enterprise-level experience"
              title="Every agency deserves a world-class client experience."
              copy="Large brands spend millions building technology. Arch9 makes that experience accessible to every agency."
            />
            <div className="rounded-[30px] border border-marketing-border bg-marketing-panelStrong p-4">
              <PathImage
                src="https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80"
                title="Premium client experience"
              />
            </div>
          </div>
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
            {enterpriseCards.map((card) => {
              const Icon = card.icon
              return (
                <MotionCard key={card.title}>
                  <Card className="h-full bg-white/88">
                    <CardHeader className="space-y-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-marketing-border bg-marketing-panelStrong text-marketing-accent">
                        <Icon className="h-5 w-5" />
                      </div>
                      <CardTitle>{card.title}</CardTitle>
                      <CardDescription>{card.copy}</CardDescription>
                    </CardHeader>
                  </Card>
                </MotionCard>
              )
            })}
          </div>
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function ProductPreviewSection() {
  const [selected, setSelected] = useState('reporting')
  const selectedPreview = productPreviews.find((item) => item.id === selected) || productPreviews[0]
  const motionConfig = useBridgeMotion()

  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <Card className="overflow-hidden bg-marketing-panelElevated">
          <CardHeader>
            <SectionIntro
              eyebrow="Platform preview"
              title="A stronger product story, anchored in the software itself."
              copy="This section sells the product. The previews are intentionally distinct, and the reporting state gets the highest visual weight because Bridge’s edge is operational clarity as much as workflow coordination."
            />
          </CardHeader>
          <CardContent>
            <Tabs value={selected} onValueChange={setSelected}>
              <TabsList>
                {productPreviews.map((preview) => (
                  <TabsTrigger key={preview.id} value={preview.id}>
                    {preview.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={selected}>
                <AnimatePresence mode="wait">
                  <Motion.div
                    key={selectedPreview.id}
                    initial={motionConfig.prefersReducedMotion ? {} : { opacity: 0, y: 12 }}
                    animate={motionConfig.prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                    exit={motionConfig.prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    className="grid gap-5 xl:grid-cols-[1.08fr,0.92fr]"
                  >
                    <Card className={cn('overflow-hidden', selectedPreview.premium ? 'border-black/6 bg-marketing-contrast text-white shadow-marketing-float' : 'bg-white/92 shadow-marketing-panel')}>
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Badge variant={selectedPreview.premium ? 'accent' : 'default'} className={selectedPreview.premium ? 'bg-white/10 text-[#eadcc7] border-white/10' : ''}>
                            {selectedPreview.premium ? 'Premium preview' : 'Live preview'}
                          </Badge>
                          <Badge variant={selectedPreview.premium ? 'default' : 'accent'} className={selectedPreview.premium ? 'border-white/10 bg-white/[0.06] text-white/72' : ''}>
                            {selectedPreview.label}
                          </Badge>
                        </div>
                        <CardTitle className={selectedPreview.premium ? 'text-white text-[1.4rem]' : 'text-[1.4rem]'}>{selectedPreview.title}</CardTitle>
                        <CardDescription className={selectedPreview.premium ? 'text-white/72' : ''}>{selectedPreview.copy}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className={cn('rounded-[26px] border p-5', selectedPreview.premium ? 'border-white/10 bg-white/[0.06]' : 'border-marketing-border bg-marketing-panelStrong')}>
                          <PreviewCanvas preview={selectedPreview} />
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid gap-4">
                      {productPreviews.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelected(item.id)}
                          className={cn(
                            'rounded-[24px] border p-5 text-left transition',
                            selected === item.id
                              ? 'border-marketing-accent/30 bg-marketing-accentSoft shadow-marketing-soft'
                              : 'border-marketing-border bg-white/84 hover:border-marketing-borderStrong hover:bg-white/94',
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[1.02rem] font-semibold text-marketing-ink">{item.title}</div>
                            {item.premium ? <Badge variant="accent">Most premium</Badge> : null}
                          </div>
                          <p className="mt-3 text-sm leading-7 text-marketing-muted">{item.copy}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {item.metrics.slice(0, 2).map((metric) => (
                              <span key={metric} className="rounded-full border border-marketing-border bg-white/82 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-marketing-subtle">
                                {metric}
                              </span>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </Motion.div>
                </AnimatePresence>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </SectionWrap>
    </MotionSection>
  )
}

function ReportSection() {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
          <Card className="bg-marketing-panelStrong">
            <CardHeader>
              <Badge variant="accent">Report-ready value</Badge>
              <CardTitle className="text-[clamp(2rem,3vw,3rem)] leading-[1] tracking-[-0.05em]">
                Operational clarity that is presentable, not patched together.
              </CardTitle>
              <CardDescription className="text-[15px]">
                Bridge turns transaction activity into cleaner oversight for leadership and cleaner communication for stakeholders. The reporting story should be a first-class message, not a footnote.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {reportHighlights.map((item) => (
                <div key={item} className="rounded-[18px] border border-marketing-border bg-white/84 px-4 py-3 text-sm text-marketing-muted">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <DarkFeaturePanel className="p-7 md:p-8">
            <div className="flex items-center justify-between">
              <Badge variant="accent" className="bg-white/10 text-[#eadcc7] border-white/10">Executive reporting</Badge>
              <Gauge className="h-5 w-5 text-[#eadcc7]" />
            </div>
            <div className="mt-6 grid gap-4">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-white/52">Development summary</div>
                    <div className="mt-3 text-[1.12rem] font-semibold text-white">Bridge quarterly reporting pack</div>
                  </div>
                  <Badge variant="contrast" className="bg-white text-marketing-contrast">Exportable</Badge>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {[
                    ['Active matters', '47'],
                    ['Registration-ready', '18'],
                    ['Average blocker age', '4.2 days'],
                  ].map(([label, value]) => (
                    <MetricPill key={label} label={label} value={value} subtle />
                  ))}
                </div>
                <div className="mt-4 rounded-[20px] border border-white/10 bg-black/[0.14] p-4">
                  <div className="flex items-end gap-2 h-28">
                    {[31, 44, 40, 58, 62, 71, 77].map((height, index) => (
                      <div key={`${height}-${index}`} className="flex-1 rounded-t-full bg-[#eadcc7]/85" style={{ height: `${height}%` }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[0.94fr,1.06fr]">
                <div className="rounded-[24px] border border-white/10 bg-black/[0.14] p-5 text-sm leading-7 text-white/72">
                  Instead of asking teams to manually reconcile status before a leadership meeting, Bridge makes the workflow itself the reporting substrate.
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/52">Included in the view</div>
                  <div className="mt-4 space-y-3">
                    {['Risk-weighted blocker list', 'Stage movement trend', 'Development-level summaries'].map((item) => (
                      <div key={item} className="rounded-[16px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm text-white/74">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </DarkFeaturePanel>
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function OutcomesSection() {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <div className="grid gap-8 xl:grid-cols-[0.78fr,1.22fr]">
          <DarkFeaturePanel className="p-7 md:p-8">
            <Badge variant="accent" className="border-white/10 bg-white/[0.08] text-[#eadcc7]">Outcomes</Badge>
            <div className="mt-5 max-w-[12ch] text-[clamp(2.2rem,4vw,3.6rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-white">
              Why teams use Bridge
            </div>
            <p className="mt-4 text-[15px] leading-7 text-white/70">
              The value is operational and commercial: better oversight, stronger process control, clearer client communication, and faster movement through the real transaction lifecycle.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <MetricPill label="Reporting view" value="Presentable by default" subtle />
              <MetricPill label="Workflow view" value="Active state is legible" subtle />
            </div>
          </DarkFeaturePanel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {outcomes.map((item) => (
              <MotionCard key={item.title} className={item.tone === 'accent' ? 'sm:translate-y-3' : ''}>
                <Card className={cn('h-full', item.tone === 'accent' ? 'bg-marketing-accentSoft' : 'bg-marketing-panelElevated')}>
                  <CardHeader>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-marketing-border bg-white/84 text-marketing-accent">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                </Card>
              </MotionCard>
            ))}
          </div>
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function TrustSection() {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <Card className="bg-marketing-panelElevated">
          <CardHeader>
            <SectionIntro
              eyebrow="Trust"
              title="Built by people who understand the transaction."
              copy="The trust section should land like a closing argument. It needs more authority than a row of generic pills, so the statements below are framed as informed product choices."
            />
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
            <div className="grid gap-4">
              {trustPanels.map((panel) => (
                <Card key={panel} className="bg-white/84">
                  <CardContent className="pt-5 text-sm leading-7 text-marketing-muted">{panel}</CardContent>
                </Card>
              ))}
              <DarkFeaturePanel className="p-5">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/46">Operating principle</div>
                <div className="mt-3 text-[1.06rem] font-semibold text-white">The platform is built around the transaction itself.</div>
                <p className="mt-2 text-sm leading-7 text-white/68">
                  That is why the workflow, the stakeholder experience, and the reporting layer all feel connected rather than bolted together.
                </p>
              </DarkFeaturePanel>
            </div>
            <Accordion type="single" collapsible className="space-y-3">
              {trustAccordion.map((item) => (
                <AccordionItem key={item.title} value={item.title}>
                  <AccordionTrigger>{item.title}</AccordionTrigger>
                  <AccordionContent>{item.copy}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </SectionWrap>
    </MotionSection>
  )
}

function FinalCtaSection() {
  return (
    <MotionSection className="py-20">
      <SectionWrap>
        <Card className="overflow-hidden bg-marketing-panelElevated shadow-marketing-float">
          <CardContent className="grid gap-8 p-6 md:p-8 lg:grid-cols-[1fr,0.88fr] lg:items-center xl:p-10">
            <div className="max-w-3xl space-y-5">
              <Badge variant="accent">Ready for better transactions?</Badge>
              <h2 className="text-[clamp(2.4rem,4vw,4.2rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-marketing-ink">
                Ready to modernise your property business?
              </h2>
              <p className="text-[15px] leading-7 text-marketing-muted">
                Join agencies using Arch9 to connect, collaborate and close transactions with confidence.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/bridge/contact">
                    Book a Demo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/bridge/solutions">Explore Solutions</Link>
                </Button>
              </div>
            </div>
            <div className="relative min-h-[340px] overflow-hidden rounded-[30px]">
              <img
                src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80"
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02)_0%,rgba(39,32,25,0.52)_100%)]" />
              <div className="absolute bottom-5 left-5 right-5 rounded-[24px] border border-white/40 bg-white/18 p-5 text-white backdrop-blur-md">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/72">Arch9 platform</div>
                <div className="mt-2 text-[1.2rem] font-semibold">Search to registration, connected.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </SectionWrap>
    </MotionSection>
  )
}

function BridgeFooter() {
  return (
    <footer className="mx-auto mt-4 w-full max-w-marketing pb-10">
      <div className="rounded-[28px] border border-white/70 bg-white/62 px-6 py-6 shadow-marketing-soft backdrop-blur-xl md:flex md:items-center md:justify-between">
        <div>
          <div className="text-[1.1rem] font-semibold tracking-[-0.05em] text-marketing-ink">Arch9</div>
          <p className="mt-2 text-sm text-marketing-subtle">The platform that powers property transactions from search to registration.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-5 text-sm text-marketing-muted md:mt-0">
          {navItems.map((item) => (
            <Link key={item.label} to={item.to} className="text-marketing-muted transition hover:text-marketing-ink">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  )
}

function BridgeShell({ currentPath, title, children }) {
  useBridgeSmoothScroll()

  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(212,205,196,0.34),transparent_30%),radial-gradient(circle_at_85%_12%,rgba(237,233,227,0.45),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(210,193,168,0.18),transparent_28%),linear-gradient(180deg,#f6f3ee_0%,#f1ece6_34%,#fbfaf8_100%)] px-3 py-3 text-marketing-ink sm:px-4 md:px-5">
      <div className="mx-auto max-w-[1380px] rounded-[34px] border border-white/70 bg-white/38 px-4 py-4 shadow-marketingShell backdrop-blur-2xl md:rounded-[42px] md:px-6 md:py-6">
        <BridgeHeader currentPath={currentPath} />
        <BridgeCommandPalette />
        {children}
        <BridgeFooter />
      </div>
    </main>
  )
}

function HomePageBody() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <BenefitsSection />
      <ProcessSection />
      <SignatureWorkflowSection />
      <PersonaSection />
      <FinalCtaSection />
    </>
  )
}

function SubpageHero({ eyebrow, title, copy, highlights }) {
  return (
    <MotionSection className="pt-8 md:pt-12">
      <SectionWrap>
        <div className="grid gap-6 xl:grid-cols-[1fr,0.92fr]">
          <Card className="bg-marketing-panelElevated">
            <CardHeader>
              <Badge variant="accent">{eyebrow}</Badge>
              <div className="max-w-[16ch] text-[clamp(2.6rem,6vw,4.8rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-marketing-ink">
                {title}
              </div>
              <CardDescription className="max-w-2xl text-[16px] leading-8">{copy}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <Link to="/bridge/contact">
                    Book a Demo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/bridge">Back to overview</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
          <DarkFeaturePanel className="p-7 md:p-8">
            <div className="grid gap-4">
              {highlights.map((highlight) => (
                <div key={highlight} className="rounded-[22px] border border-white/10 bg-white/[0.05] px-5 py-4 text-sm leading-7 text-white/74">
                  {highlight}
                </div>
              ))}
            </div>
          </DarkFeaturePanel>
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function FrameworkGrid({ items, accentIndex = 0 }) {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((item, index) => (
            <MotionCard key={item.title}>
              <Card className={index === accentIndex ? 'bg-marketing-panelStrong' : 'bg-marketing-panelElevated'}>
                <CardHeader>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.copy}</CardDescription>
                </CardHeader>
              </Card>
            </MotionCard>
          ))}
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function ContactPageBody() {
  return (
    <>
      <SubpageHero
        eyebrow="Contact"
        title="Book a demo and see Arch9 in context."
        copy="Use this page as the framework for demo bookings, implementation conversations, and commercial follow-up."
        highlights={[
          'Show the workflow signature and reporting story in one walkthrough.',
          'Discuss how Arch9 fits current agency, legal, finance and client operations.',
          'Turn interest into a cleaner commercial next step.',
        ]}
      />
      <MotionSection className="pt-20">
        <SectionWrap>
          <div className="grid gap-6 xl:grid-cols-[0.86fr,1.14fr]">
            <Card className="bg-marketing-panelElevated">
              <CardHeader>
                <CardTitle>Demo agenda</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[
                  'Portfolio and transaction visibility',
                  'Role-based workspace walkthrough',
                  'Lifecycle coordination from offer to handover',
                  'Reporting and operational control',
                ].map((item) => (
                  <div key={item} className="rounded-[18px] border border-marketing-border bg-white/84 px-4 py-3 text-sm text-marketing-muted">
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-marketing-panelElevated">
              <CardHeader>
                <CardTitle>Demo request form</CardTitle>
                <CardDescription>Structured framework for the conversion flow. Hook it into your booking system when ready.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {['Name', 'Company', 'Email', 'Role'].map((field) => (
                  <label key={field} className="grid gap-2 text-sm text-marketing-muted">
                    <span>{field}</span>
                    <Input placeholder={field} />
                  </label>
                ))}
                <label className="grid gap-2 text-sm text-marketing-muted md:col-span-2">
                  <span>What do you want to solve?</span>
                  <textarea
                    rows="5"
                    className="w-full rounded-[20px] border border-marketing-borderStrong bg-white/86 px-4 py-3 text-sm text-marketing-ink outline-none transition placeholder:text-[#a0968a] focus:border-marketing-accent/45 focus:ring-4 focus:ring-marketing-accent/10"
                    placeholder="Tell us where your transaction process needs more structure."
                  />
                </label>
                <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
                  <Button>
                    Request Demo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button asChild variant="secondary">
                    <Link to="/bridge/solutions">Explore Solutions</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </SectionWrap>
      </MotionSection>
      <FinalCtaSection />
    </>
  )
}

function GenericSubpage({ currentPath, eyebrow, title, copy, highlights, modules }) {
  return (
    <BridgeShell currentPath={currentPath} title={`Arch9 | ${title}`}>
      <SubpageHero eyebrow={eyebrow} title={title} copy={copy} highlights={highlights} />
      <FrameworkGrid items={modules} />
      <FinalCtaSection />
    </BridgeShell>
  )
}

export function BridgeBuyPage() {
  return (
    <GenericSubpage
      currentPath="/bridge/buy"
      eyebrow="Buy"
      title="Property discovery, tools and resources in one place."
      copy="Browse residential and commercial properties, new developments, calculators and buyer guides from the dedicated Buy area."
      highlights={[
        'Residential and commercial property pathways live under Buy.',
        'New developments and buyer resources sit beside practical calculators.',
        'Search begins here, then Arch9 carries the transaction through to registration.',
      ]}
      modules={buyNavItems.map((item) => ({ title: item.label, copy: item.copy }))}
    />
  )
}

export function BridgeToolsPage() {
  return (
    <GenericSubpage
      currentPath="/bridge/tools"
      eyebrow="Tools"
      title="Decision tools for buyers and property teams."
      copy="Use calculators and structured workflows to make the next property decision clearer before the transaction begins."
      highlights={[
        'Affordability, bond, transfer cost and yield calculators.',
        'Professional tools for transaction tracking and client updates.',
        'Built to support the full property journey rather than a single listing moment.',
      ]}
      modules={[
        { title: 'Affordability Calculator', copy: 'Estimate a realistic buying range before enquiry.' },
        { title: 'Bond Calculator', copy: 'Understand repayment scenarios and finance readiness.' },
        { title: 'Transfer Cost Calculator', copy: 'Plan once-off transaction costs earlier.' },
      ]}
    />
  )
}

export function BridgeResourcesPage() {
  return (
    <GenericSubpage
      currentPath="/bridge/resources"
      eyebrow="Resources"
      title="Guides for a more confident property journey."
      copy="Buyer guides, transaction explainers and market context help every stakeholder understand what comes next."
      highlights={[
        'Buyer resources support search, offer and registration readiness.',
        'Professional resources explain better client experience workflows.',
        'Market insight content keeps the platform larger than listings alone.',
      ]}
      modules={buyerDiscoveryCards.map((card) => ({ title: card.title, copy: card.copy }))}
    />
  )
}

export function BridgePricingPage() {
  return (
    <GenericSubpage
      currentPath="/bridge/pricing"
      eyebrow="Pricing"
      title="Pricing built around your transaction operation."
      copy="Arch9 pricing can scale with agencies, branches and teams that need a better client transaction experience."
      highlights={[
        'Designed for agencies that want enterprise-level client experience.',
        'Role-based platform value across agents, attorneys and originators.',
        'Demo-led pricing keeps the package aligned to your workflow.',
      ]}
      modules={enterpriseCards.map((card) => ({ title: card.title, copy: card.copy }))}
    />
  )
}

export function BridgeAboutPage() {
  return (
    <GenericSubpage
      currentPath="/bridge/about"
      eyebrow="About"
      title="Arch9 powers property transactions from search to registration."
      copy="Arch9 is a transaction operating system for property teams that want better visibility, less administration and a more premium client journey."
      highlights={[
        'Agent-first, while still serving buyers and sellers.',
        'Built around transaction visibility and stakeholder confidence.',
        'Designed to make world-class client experience accessible to every agency.',
      ]}
      modules={[
        { title: 'Transaction Operating System', copy: 'A connected platform for the full property journey.' },
        { title: 'Better client experience', copy: 'Portals, updates and next steps that feel premium.' },
        { title: 'Less administration', copy: 'Reduce manual chasing by making progress visible.' },
      ]}
    />
  )
}

export default function BridgeLanding() {
  return (
    <BridgeShell currentPath="/bridge" title="Arch9 | Property Transaction Operating System">
      <HomePageBody />
    </BridgeShell>
  )
}

export function BridgeProductPage() {
  return (
    <GenericSubpage
      currentPath="/bridge/product"
      eyebrow="Product"
      title="The transaction coordination layer for property teams."
      copy="Arch9 picks up where traditional property CRMs stop. It turns the transaction itself into the operating layer."
      highlights={[
        'One shared record for workflow, documents, and accountability.',
        'Portfolio-level visibility paired with unit-level detail.',
        'Workflow and reporting built from the same source of truth.',
      ]}
      modules={[
        { title: 'Deal command centre', copy: 'A premium workspace that makes progress, blockers, and responsibilities obvious.' },
        { title: 'Structured document flow', copy: 'Required documents, approvals, and dependencies stay attached to the correct stage.' },
        { title: 'Operational intelligence', copy: 'Track movement, performance, and readiness without rebuilding the picture offline.' },
      ]}
    />
  )
}

export function BridgeSolutionsPage() {
  return (
    <GenericSubpage
      currentPath="/bridge/solutions"
      eyebrow="Solutions"
      title="One platform, tailored to each role in the transaction."
      copy="Arch9 is not four disconnected tools. It is one structured operating system with role-specific views."
      highlights={[
        'Developers see portfolio movement and reporting readiness.',
        'Conveyancers get structured legal workflow and document control.',
        'Agents and buyers get cleaner visibility after the sale is made.',
      ]}
      modules={personaCards.map((card) => ({ title: card.title, copy: card.detail }))}
    />
  )
}

export function BridgeHowItWorksPage() {
  return (
    <GenericSubpage
      currentPath="/bridge/how-it-works"
      eyebrow="How It Works"
      title="Arch9 follows the real transaction lifecycle."
      copy="The product mirrors how property transactions actually progress, so every stage carries clearer ownership and reporting value."
      highlights={[
        'Open the deal correctly from day one.',
        'Move responsibilities through the right stage with less friction.',
        'Turn operational flow into oversight, not admin noise.',
      ]}
      modules={processSteps.map((step) => ({ title: step.title, copy: step.copy }))}
    />
  )
}

export function BridgeContactPage() {
  return (
    <BridgeShell currentPath="/bridge/contact" title="Arch9 | Contact">
      <ContactPageBody />
    </BridgeShell>
  )
}

function RolePage({ roleKey, currentPath }) {
  const content = rolePageContent[roleKey]

  return (
    <GenericSubpage
      currentPath={currentPath}
      eyebrow="Role page"
      title={content.title}
      copy={content.summary}
      highlights={content.highlights}
      modules={content.highlights.map((item) => ({
        title: item,
        copy: `Framework block for the ${content.title.toLowerCase()} story. Expand this into proof points, screenshots, and role-specific workflow states.`,
      }))}
    />
  )
}

export function BridgeDevelopersPage() {
  return <RolePage roleKey="developers" currentPath="/bridge/for-developers" />
}

export function BridgeConveyancersPage() {
  return <RolePage roleKey="conveyancers" currentPath="/bridge/for-conveyancers" />
}

export function BridgeAgentsPage() {
  return <RolePage roleKey="agents" currentPath="/bridge/for-agents" />
}

export function BridgeBuyersPage() {
  return <RolePage roleKey="buyers" currentPath="/bridge/for-buyers" />
}
