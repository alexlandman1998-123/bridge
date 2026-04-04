import Lenis from 'lenis'
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Command,
  FileCheck2,
  Gauge,
  HandCoins,
  LayoutPanelTop,
  LineChart,
  Menu,
  MessageSquareMore,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BridgeCommandPalette from '../components/bridge/BridgeCommandPalette'
import { MotionCard, MotionSection, useBridgeMotion } from '../components/bridge/bridge-motion'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
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
  { label: 'Product', to: '/bridge/product' },
  { label: 'Solutions', to: '/bridge/solutions' },
  { label: 'How It Works', to: '/bridge/how-it-works' },
  { label: 'Contact', to: '/bridge/contact' },
]

const roleNavItems = [
  {
    label: 'For Developers',
    to: '/bridge/for-developers',
    copy: 'Portfolio visibility, stock flow, and cross-team transaction control.',
  },
  {
    label: 'For Conveyancers',
    to: '/bridge/for-conveyancers',
    copy: 'Structured legal workflow, document readiness, and cleaner progress reporting.',
  },
  {
    label: 'For Agents',
    to: '/bridge/for-agents',
    copy: 'Post-sale visibility without chasing fragmented updates.',
  },
  {
    label: 'For Buyers',
    to: '/bridge/for-buyers',
    copy: 'A clearer, more professional transaction journey with guided next steps.',
  },
]

const heroMetrics = [
  { label: 'Shared transaction record', value: 'One system', copy: 'The deal, the workflow, and the reporting stay connected.' },
  { label: 'Role-specific experiences', value: '4 core roles', copy: 'Developers, conveyancers, agents, and buyers on one platform.' },
  { label: 'Operational reporting', value: 'Report-ready', copy: 'Presentable oversight without stitched spreadsheets.' },
]

const heroSignalPoints = [
  'Shared transaction intelligence',
  'Role-specific workflow surfaces',
  'Report-ready operational oversight',
  'Milestones mapped to real transaction stages',
  'Documents, notes, and ownership in one place',
  'Clear next actions across every handoff',
  'Professional oversight from workflow to reporting',
  'Post-sale progress that stays visible',
]

const heroProgressCards = [
  { label: 'Buyer onboarding', status: 'Complete', progress: '100%' },
  { label: 'Finance and supporting docs', status: 'In progress', progress: '68%' },
  { label: 'Transfer readiness', status: 'Prepared next', progress: '48%' },
]

const heroOperationalKpis = [
  { label: 'Active', value: '47' },
  { label: 'At Risk', value: '6' },
  { label: 'Ready', value: '18' },
]

const heroPipelineFlow = [
  { stage: 'Offer', count: 12, width: '100%' },
  { stage: 'Signed', count: 9, width: '75%' },
  { stage: 'Bond', count: 6, width: '50%' },
  { stage: 'Transfer', count: 4, width: '34%' },
  { stage: 'Registration', count: 2, width: '18%' },
]

const workflowLegend = [
  { label: 'Complete', tone: 'bg-white text-marketing-contrast border-white' },
  { label: 'Active', tone: 'bg-[#eadcc7]/14 text-[#eadcc7] border-[#eadcc7]/25' },
  { label: 'Ready next', tone: 'bg-white/[0.06] text-white/80 border-white/10' },
  { label: 'Pending', tone: 'bg-white/[0.04] text-white/55 border-white/8' },
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

const problemCards = [
  {
    title: 'No single source of truth',
    copy: 'Progress lives in inboxes, spreadsheets, and disconnected chats, so nobody is confident they have the latest answer.',
    impact: 'The latest view is unclear',
    icon: MessageSquareMore,
    emphasis: false,
  },
  {
    title: 'Clients keep asking for updates',
    copy: 'When the process is opaque, the team spends time explaining status manually instead of moving the deal forward.',
    impact: 'Manual updates replace momentum',
    icon: UserRound,
    emphasis: true,
  },
  {
    title: 'Teams work in silos',
    copy: 'Developers, legal teams, agents, and buyers operate in parallel without a shared operational record.',
    impact: 'Handoffs lose context',
    icon: Users,
    emphasis: false,
  },
  {
    title: 'Reporting is stitched together',
    copy: 'Leaders still rely on manual status collation instead of live, presentable operational reporting.',
    impact: 'Oversight is rebuilt manually',
    icon: LineChart,
    emphasis: false,
  },
]

const benefitCards = [
  {
    title: 'Shared visibility',
    label: 'Visibility',
    copy: 'Everyone works from the same transaction record, so the current state is visible without manual chasing.',
    support: ['Latest stage stays legible', 'Shared record across roles'],
    icon: LayoutPanelTop,
    featured: true,
  },
  {
    title: 'Structured workflow',
    label: 'Workflow',
    copy: 'Stages, tasks, and dependencies follow the real transaction lifecycle instead of generic pipeline logic.',
    support: ['Milestones map to real stages', 'Dependencies stay attached'],
    icon: Workflow,
  },
  {
    title: 'Clear responsibilities',
    label: 'Accountability',
    copy: 'Ownership stays obvious, outstanding actions remain visible, and handoffs stop losing momentum.',
    support: ['Current owner stays obvious', 'Blocked work surfaces earlier'],
    icon: ClipboardList,
  },
  {
    title: 'Better client experience',
    label: 'Client experience',
    copy: 'Buyers see what is happening, what is required, and what comes next through a clearer journey.',
    support: ['Updates feel clearer', 'Next steps stay visible'],
    icon: ShieldCheck,
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

function statusBadge(status) {
  if (status === 'active') return 'accent'
  if (status === 'complete') return 'contrast'
  return 'default'
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
          <Link to="/bridge" className="text-[1.05rem] font-semibold tracking-[0.18em] text-marketing-ink">
            BRIDGE
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <Link key={item.label} to={item.to} className={siteLinkClass(currentPath === item.to)}>
                {item.label}
              </Link>
            ))}

            <NavigationMenu className="relative">
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className={currentPath.startsWith('/bridge/for-') ? 'bg-black/[0.05] text-marketing-ink' : ''}>
                    Solutions by role
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid gap-2">
                      {roleNavItems.map((item) => (
                        <NavigationMenuLink asChild key={item.label}>
                          <Link
                            to={item.to}
                            className="rounded-[18px] px-4 py-3 transition hover:bg-black/[0.035]"
                          >
                            <div className="text-sm font-semibold text-marketing-ink">{item.label}</div>
                            <div className="mt-1 text-sm leading-6 text-marketing-muted">{item.copy}</div>
                          </Link>
                        </NavigationMenuLink>
                      ))}
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
              <NavigationMenuViewport />
            </NavigationMenu>
          </div>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('bridge:open-command-palette'))}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-marketing-borderStrong bg-white/80 px-4 text-sm font-semibold text-marketing-muted shadow-marketing-soft transition hover:border-marketing-accent/35 hover:text-marketing-ink"
          >
            <Command className="h-4 w-4" />
            Command
            <span className="rounded-full border border-marketing-border bg-marketing-panelStrong px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-marketing-subtle">
              Cmd K
            </span>
          </button>
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
              <SheetTitle>Bridge navigation</SheetTitle>
              <SheetDescription>Use the public site like product software, not a brochure.</SheetDescription>
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
              {roleNavItems.map((item) => (
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
    <motion.div
      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="rounded-[24px] border border-white/10 bg-black/20 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] xl:px-6"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="text-[17px] font-medium leading-[1.15] tracking-[-0.03em] text-white/92 xl:text-[19px]">{label}</div>
        <div className="pt-1 text-right text-[11px] uppercase tracking-[0.2em] text-[#d8c7ae] xl:text-[12px]">{status}</div>
      </div>
      <div className="mt-5 h-3 rounded-full bg-white/10">
        <motion.div
          initial={prefersReducedMotion ? false : { width: 0 }}
          animate={{ width: progress }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          className={cn('h-3 rounded-full', fillTone)}
        />
      </div>
    </motion.div>
  )
}

function HeroProductProofBlock() {
  const motionConfig = useBridgeMotion()

  return (
    <DarkFeaturePanel className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_24%),linear-gradient(180deg,#111214_0%,#0f0f10_100%)] p-6 md:p-8 xl:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <motion.div
          animate={motionConfig.prefersReducedMotion ? undefined : { opacity: [0.72, 1, 0.72] }}
          transition={motionConfig.prefersReducedMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-[12px] uppercase tracking-[0.24em] text-white/62"
        >
          <span className="h-2 w-2 rounded-full bg-[#d8c7ae]" />
          Live product proof
        </motion.div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-[12px] uppercase tracking-[0.24em] text-white/52">
          Product-led
        </div>
      </div>

      <div className="mt-8 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.025)_100%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:p-7 xl:p-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-[0.24em] text-white/55">Transaction workspace</div>
            <div className="mt-3 text-[24px] font-semibold leading-[0.96] tracking-[-0.045em] text-white sm:text-[27px] md:text-[29px] lg:whitespace-nowrap xl:text-[34px]">
              Junoah Estate
            </div>
          </div>
          <div className="inline-flex w-fit shrink-0 items-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-[12px] uppercase tracking-[0.22em] text-[#d8c7ae] whitespace-nowrap">
            Bond active
          </div>
        </div>

        <div className="grid gap-6 2xl:grid-cols-[1.06fr_0.94fr]">
          <div className="flex flex-col gap-5">
            {heroProgressCards.map((card) => (
              <ProgressStatusCard
                key={card.label}
                label={card.label}
                status={card.status}
                progress={card.progress}
                prefersReducedMotion={motionConfig.prefersReducedMotion}
              />
            ))}
          </div>

          <div className="flex flex-col gap-5">
            <motion.div
              whileHover={motionConfig.prefersReducedMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/56">Operational reporting</div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {heroOperationalKpis.map((item) => (
                  <div key={item.label} className="min-w-0 rounded-[22px] border border-white/10 bg-white/[0.025] px-4 py-5 text-center">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/56">{item.label}</div>
                    <div className="mt-3 text-[32px] font-semibold tracking-[-0.04em] text-white md:text-[34px]">{item.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              whileHover={motionConfig.prefersReducedMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/56">Pipeline flow</div>
              <div className="mt-4 space-y-4">
                {heroPipelineFlow.map((item) => (
                  <div key={item.stage}>
                    <div className="flex items-center justify-between gap-3 text-[13px] text-white/76">
                      <span>{item.stage}</span>
                      <span className="text-white/52">{item.count}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/8">
                      <motion.div
                        initial={motionConfig.prefersReducedMotion ? false : { width: 0 }}
                        animate={{ width: item.width }}
                        transition={{ duration: 0.64, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                        className="h-2 rounded-full bg-[#d8c7ae]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

          </div>
        </div>
      </div>
    </DarkFeaturePanel>
  )
}

function HeroSection() {
  return (
    <MotionSection className="pt-8 md:pt-12">
      <SectionWrap>
        <div className="grid items-stretch gap-6 xl:grid-cols-[1.02fr,0.98fr]">
          <Card className="h-full overflow-hidden border-white/90 bg-marketing-panelElevated shadow-marketing-float">
            <CardHeader className="space-y-6 pb-4">
              <Badge variant="accent">South African property transaction platform</Badge>
              <div className="max-w-[13ch] text-[clamp(3.35rem,7vw,6.2rem)] font-semibold leading-[0.88] tracking-[-0.075em] text-marketing-ink">
                From <span className="text-marketing-accent">offer</span> to <span className="text-marketing-accent">handover</span>, all in one place.
              </div>
              <CardDescription className="max-w-2xl text-[16px] leading-8">
                Bridge is the shared transaction platform for developers, conveyancers, agents, and buyers. It gives everyone one structured workspace to manage progress, tasks, and accountability across the full property journey.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/bridge/contact">
                    Book a Demo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/bridge/product">Explore the Platform</Link>
                </Button>
              </div>

              <div className="grid items-stretch gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                <div className="h-full rounded-[28px] border border-marketing-border bg-marketing-panelStrong p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">Why Bridge feels different</div>
                      <div className="mt-3 text-[1.28rem] font-semibold tracking-[-0.04em] text-marketing-ink">
                        Built to feel like operating infrastructure, not another admin layer.
                      </div>
                    </div>
                    <Sparkles className="h-5 w-5 text-marketing-accent" />
                  </div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {heroSignalPoints.map((item) => (
                      <div key={item} className="rounded-[18px] border border-white bg-white/82 px-4 py-3 text-sm text-marketing-muted">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  {heroMetrics.map((metric, index) => (
                    <MotionCard key={metric.label}>
                      <Card className={cn('h-full border-marketing-border bg-white/84', index === 0 && 'bg-white/92')}>
                        <CardContent className="pt-5">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-marketing-subtle">{metric.label}</div>
                          <div className="mt-3 text-[1.18rem] font-semibold tracking-[-0.04em] text-marketing-ink">{metric.value}</div>
                          <p className="mt-2 text-sm leading-6 text-marketing-muted">{metric.copy}</p>
                        </CardContent>
                      </Card>
                    </MotionCard>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <HeroProductProofBlock />
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function SignatureWorkflowSection() {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <DarkFeaturePanel className="overflow-visible p-7 md:p-10">
          <div className="grid gap-8 xl:grid-cols-[0.88fr,1.12fr]">
            <div className="space-y-5">
              <Badge variant="accent" className="bg-white/10 text-[#eadcc7] border-white/10">Bridge signature</Badge>
              <h2 className="text-[clamp(2.4rem,4vw,4.3rem)] leading-[0.95] tracking-[-0.06em] text-white">
                The transaction workflow, made visible like live operational software.
              </h2>
              <p className="max-w-xl text-[15px] leading-7 text-white/68">
                This is where Bridge differentiates itself. Every stage is connected, status is legible, and the active moment in the deal becomes obvious instead of buried in messages and spreadsheets.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {workflowLegend.map((item) => (
                  <div key={item.label} className={cn('rounded-[18px] border px-4 py-3 text-sm', item.tone)}>
                    {item.label}
                  </div>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-[0.92fr,1.08fr]">
                <div className="rounded-[24px] border border-white/10 bg-black/[0.16] p-5">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Operational narrative</div>
                  <div className="mt-3 text-[1.06rem] font-semibold text-white">The current stage becomes the center of gravity.</div>
                  <p className="mt-2 text-sm leading-7 text-white/66">
                    Bridge makes the active transaction moment clear to every stakeholder while keeping downstream readiness visible before delays appear.
                  </p>
                </div>
                <div className="grid gap-3">
                  <MetricPill label="Active stage" value="Bond process" subtle />
                  <MetricPill label="Next handoff" value="Transfer readiness" subtle />
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="space-y-4 pb-3">
                {signatureStages.map((stage, index) => (
                  <MotionCard key={stage.id}>
                    <div
                      className={cn(
                        'relative grid gap-4 rounded-[28px] border p-5 transition',
                        stage.status === 'active'
                          ? 'border-[#eadcc7]/35 bg-white/[0.1] shadow-[0_24px_70px_rgba(0,0,0,0.28)]'
                          : 'border-white/8 bg-white/[0.04]',
                      )}
                    >
                      {stage.status === 'active' ? <div className="absolute inset-y-5 left-0 w-px bg-gradient-to-b from-[#eadcc7]/0 via-[#eadcc7] to-[#eadcc7]/0" /> : null}
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              'flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold',
                              stage.status === 'active'
                                ? 'border-[#eadcc7]/40 bg-[#eadcc7]/18 text-[#f8efe2]'
                                : 'border-white/10 bg-white/[0.03] text-white/75',
                            )}
                          >
                            {index + 1}
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Transaction stage</div>
                            <div className="mt-1 text-[1.12rem] font-semibold tracking-[-0.03em] text-white">{stage.title}</div>
                          </div>
                        </div>
                        <Badge variant={stage.status === 'active' ? 'accent' : stage.status === 'complete' ? 'contrast' : 'default'} className={cn(stage.status === 'active' && 'bg-[#eadcc7]/12 text-[#eadcc7] border-[#eadcc7]/20', stage.status === 'complete' && 'bg-white text-marketing-contrast', stage.status === 'pending' && 'border-white/10 bg-white/[0.05] text-white/58', stage.status === 'ready' && 'border-white/10 bg-white/[0.05] text-white/72')}>
                          {stage.chip}
                        </Badge>
                      </div>
                      <p className="text-sm leading-7 text-white/70">{stage.summary}</p>
                      <div className="h-1.5 rounded-full bg-white/[0.08]">
                        <div
                          className={cn(
                            'h-1.5 rounded-full transition-all',
                            stage.status === 'complete' && 'w-full bg-white',
                            stage.status === 'active' && 'w-[72%] bg-[#eadcc7]',
                            stage.status === 'ready' && 'w-[48%] bg-white/60',
                            stage.status === 'pending' && 'w-[24%] bg-white/30',
                          )}
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-3">
                        {stage.bullets.map((bullet) => (
                          <div
                            key={bullet}
                            className={cn(
                              'rounded-[18px] border px-4 py-3 text-sm',
                              stage.status === 'active'
                                ? 'border-[#eadcc7]/18 bg-[#eadcc7]/10 text-white/82'
                                : 'border-white/8 bg-black/[0.12] text-white/74',
                            )}
                          >
                            {bullet}
                          </div>
                        ))}
                      </div>
                    </div>
                  </MotionCard>
                ))}
              </div>
            </div>
          </div>
        </DarkFeaturePanel>
      </SectionWrap>
    </MotionSection>
  )
}

function ProblemSection() {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <div className="grid items-start gap-10 xl:grid-cols-[0.78fr,1.22fr]">
          <div className="max-w-[38rem] space-y-5">
            <Badge>The gap</Badge>
            <h2 className="max-w-[10ch] text-[clamp(2.9rem,5.4vw,5.8rem)] leading-[0.9] tracking-[-0.065em] text-marketing-ink">
              Property transactions are still managed across too many disconnected systems.
            </h2>
            <p className="max-w-[32rem] text-[15px] leading-8 text-marketing-muted">
              Bridge exists because too many deals are still coordinated through email, WhatsApp, manual follow-up, and fragmented views of progress.
            </p>
          </div>
          <div className="grid auto-rows-fr gap-5 md:grid-cols-2">
            {problemCards.map((card) => {
              const Icon = card.icon
              const content = (
                <Card
                  className={cn(
                    'flex h-full flex-col',
                    card.emphasis
                      ? 'border-transparent bg-marketing-contrast text-white shadow-marketing-float'
                      : 'bg-white/92',
                  )}
                >
                  <CardHeader className="space-y-5 pb-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className={cn('flex h-12 w-12 items-center justify-center rounded-[18px] border', card.emphasis ? 'border-white/10 bg-white/[0.06] text-[#eadcc7]' : 'border-marketing-border bg-marketing-panelStrong text-marketing-accent')}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className={cn('text-[11px] uppercase tracking-[0.18em]', card.emphasis ? 'text-[#eadcc7]/82' : 'text-marketing-subtle')}>
                        {card.emphasis ? 'Priority issue' : 'Problem'}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <CardTitle className={cn('tracking-[-0.04em]', card.emphasis ? 'text-white' : '')}>{card.title}</CardTitle>
                      <CardDescription className={cn('text-[15px] leading-7', card.emphasis ? 'text-white/72' : '')}>{card.copy}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <div className={cn('border-t pt-4', card.emphasis ? 'border-white/10' : 'border-marketing-border')}>
                      <div className={cn('text-[11px] uppercase tracking-[0.18em]', card.emphasis ? 'text-white/42' : 'text-marketing-subtle')}>
                        Commercial impact
                      </div>
                      <div className={cn('mt-3 text-sm leading-6', card.emphasis ? 'text-white/84' : 'text-marketing-muted')}>
                        {card.impact}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )

              return <MotionCard key={card.title} className="h-full">{content}</MotionCard>
            })}
          </div>
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function BenefitsSection() {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <div className="max-w-[46rem]">
          <SectionIntro
            eyebrow="The platform"
            title="One shared platform for the people moving the deal forward."
            copy="Bridge brings developers, conveyancers, agents, and buyers into one structured operational system, so visibility, responsibility, and communication stay aligned."
          />
        </div>
        <div className="mt-12 grid auto-rows-fr gap-5 md:grid-cols-2">
          {benefitCards.map((card, index) => {
            const Icon = card.icon
            const featured = index === 0

            return (
              <MotionCard key={card.title} className="h-full">
                <Card
                  className={cn(
                    'flex h-full flex-col',
                    featured
                      ? 'border-white bg-marketing-panelStrong shadow-[0_22px_44px_rgba(15,15,16,0.06)]'
                      : 'bg-white/92',
                  )}
                >
                  <CardHeader className="space-y-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-marketing-border bg-white/84 text-marketing-accent">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">{card.label}</div>
                    </div>
                    <div className="space-y-2">
                      <CardTitle className={cn('tracking-[-0.04em]', featured ? 'text-[1.56rem]' : 'text-[1.42rem]')}>{card.title}</CardTitle>
                      <CardDescription className="max-w-[31rem] text-[15px] leading-7">{card.copy}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <div className={cn('grid gap-3 border-t border-marketing-border pt-5', featured ? 'sm:grid-cols-2' : '')}>
                      {card.support.map((item) => (
                        <div key={item} className="flex items-start gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-marketing-accent/70" />
                          <span className="text-sm leading-6 text-marketing-muted">{item}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </MotionCard>
            )
          })}
        </div>
      </SectionWrap>
    </MotionSection>
  )
}

function ProcessSection() {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <Card className="overflow-hidden bg-marketing-panelElevated">
          <CardHeader className="pb-0">
            <SectionIntro
              eyebrow="How It Works"
              title="A lifecycle engine, not just five boxes."
              copy="Bridge is designed around the progression of a real property transaction, so every stage has clearer ownership, momentum, and downstream visibility."
            />
          </CardHeader>
          <CardContent className="pt-10">
            <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
              <div className="rounded-[28px] border border-marketing-border bg-marketing-panelStrong p-5 md:p-6">
                <div className="text-[11px] uppercase tracking-[0.2em] text-marketing-subtle">Flow logic</div>
                <div className="mt-3 text-[1.28rem] font-semibold tracking-[-0.04em] text-marketing-ink">
                  The process feels sequential because the software treats the lifecycle as connected motion.
                </div>
                <div className="mt-5 space-y-3">
                  {['The live transaction opens the system of record.', 'Responsibilities move with the stage, not outside it.', 'Reporting is generated from the same workflow foundation.'].map((item) => (
                    <div key={item} className="rounded-[18px] border border-white/74 bg-white/86 px-4 py-3 text-sm text-marketing-muted">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative grid gap-4 md:grid-cols-2">
                <div className="pointer-events-none absolute left-[calc(25%-1px)] right-[calc(25%-1px)] top-10 hidden h-px bg-gradient-to-r from-transparent via-marketing-borderStrong to-transparent md:block" />
                {processSteps.map((step, index) => (
                  <MotionCard key={step.number}>
                    <Card className={cn('h-full', index === 1 ? 'bg-marketing-panelStrong shadow-marketing-panel' : index === 3 ? 'bg-white/92' : 'bg-marketing-panelElevated')}>
                      <CardHeader className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="text-[2.2rem] font-semibold tracking-[-0.06em] text-marketing-accent">{step.number}</div>
                          {index === 1 ? <Badge variant="accent">Current momentum</Badge> : <Badge>{`Stage ${index + 1}`}</Badge>}
                        </div>
                        <CardTitle>{step.title}</CardTitle>
                        <CardDescription>{step.copy}</CardDescription>
                      </CardHeader>
                    </Card>
                  </MotionCard>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </SectionWrap>
    </MotionSection>
  )
}

function PersonaSection() {
  return (
    <MotionSection className="pt-20">
      <SectionWrap>
        <SectionIntro
          eyebrow="Persona-led platform"
          title="Built for every key role in the transaction."
          copy="One platform with tailored experiences. Each card below acts like a gateway into what that role sees and why Bridge matters to them."
        />
        <div className="mt-10 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-2">
          {personaCards.map((card) => {
            const Icon = card.icon
            return (
              <MotionCard key={card.title}>
                <Card className="group flex h-full flex-col overflow-hidden bg-marketing-panelElevated transition">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-marketing-border bg-white/86 text-marketing-accent transition group-hover:border-marketing-accent/25 group-hover:bg-marketing-accentSoft">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="rounded-full border border-marketing-border bg-white/82 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-marketing-subtle">
                        Role view
                      </div>
                    </div>
                    <CardTitle>{card.title}</CardTitle>
                    <CardDescription className="min-h-[84px]">{card.copy}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex flex-1 flex-col">
                    <div className="rounded-[20px] border border-marketing-border bg-white/84 px-4 py-3 text-sm text-marketing-muted">
                      {card.detail}
                    </div>
                    <div className="mt-3 flex-1 rounded-[20px] border border-marketing-border bg-marketing-panelStrong p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-marketing-subtle">What they see</div>
                      <div className="mt-3 grid gap-2">
                        {card.preview.map((item) => (
                          <div
                            key={item}
                            className="rounded-[14px] border border-white/70 bg-white/86 px-3 py-2 text-sm text-marketing-muted transition group-hover:border-marketing-accent/18"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="pt-5">
                      <Button asChild variant="ghost" className="px-0 text-marketing-accent hover:bg-transparent">
                        <Link to={card.to}>
                          Learn More
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </MotionCard>
            )
          })}
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
                  <motion.div
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
                  </motion.div>
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
        <DarkFeaturePanel className="overflow-hidden p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr,0.88fr] lg:items-end">
            <div className="max-w-3xl space-y-5">
              <Badge variant="accent" className="bg-white/10 text-[#eadcc7] border-white/10">Final CTA</Badge>
              <h2 className="text-[clamp(2.3rem,4vw,4rem)] leading-[0.96] tracking-[-0.06em] text-white">
                Bring more structure to every property transaction.
              </h2>
              <p className="text-[15px] leading-7 text-white/70">
                See how Bridge helps your team manage the full journey from offer to handover with more clarity, control, confidence, and report-ready operational oversight.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {['Shared visibility', 'Operational control', 'Report-ready clarity'].map((item) => (
                  <div key={item} className="rounded-[18px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/72">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricPill label="Demo view" value="Workflow + reporting" subtle />
                  <MetricPill label="Audience fit" value="Developers to buyers" subtle />
                </div>
                <div className="mt-5 flex flex-col gap-3">
                  <Button asChild size="lg" variant="secondary" className="border-white/12 bg-white text-marketing-contrast hover:border-white/20">
                    <Link to="/bridge/contact">
                      Book a Demo
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/[0.08] hover:text-white">
                    <Link to="/bridge/solutions">Explore Solutions</Link>
                  </Button>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event('bridge:open-command-palette'))}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <Command className="h-4 w-4" />
                    Open Command Palette
                  </button>
                </div>
              </div>
            </div>
          </div>
        </DarkFeaturePanel>
      </SectionWrap>
    </MotionSection>
  )
}

function BridgeFooter() {
  return (
    <footer className="mx-auto mt-4 w-full max-w-marketing pb-10">
      <div className="rounded-[28px] border border-white/70 bg-white/62 px-6 py-6 shadow-marketing-soft backdrop-blur-xl md:flex md:items-center md:justify-between">
        <div>
          <div className="text-[1.1rem] font-semibold tracking-[-0.05em] text-marketing-ink">Bridge</div>
          <p className="mt-2 text-sm text-marketing-subtle">One shared platform for property transactions.</p>
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
      <SignatureWorkflowSection />
      <ProblemSection />
      <BenefitsSection />
      <ProcessSection />
      <PersonaSection />
      <ProductPreviewSection />
      <ReportSection />
      <OutcomesSection />
      <TrustSection />
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
        title="Book a demo and see Bridge in context."
        copy="Use this page as the framework for demo bookings, implementation conversations, and commercial follow-up."
        highlights={[
          'Show the workflow signature and reporting story in one walkthrough.',
          'Discuss how Bridge fits current developer, legal, and sales operations.',
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
    <BridgeShell currentPath={currentPath} title={`Bridge | ${title}`}>
      <SubpageHero eyebrow={eyebrow} title={title} copy={copy} highlights={highlights} />
      <FrameworkGrid items={modules} />
      <FinalCtaSection />
    </BridgeShell>
  )
}

export default function BridgeLanding() {
  return (
    <BridgeShell currentPath="/bridge" title="Bridge | Property transaction platform">
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
      copy="Bridge picks up where traditional property CRMs stop. It turns the transaction itself into the operating layer."
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
      copy="Bridge is not four disconnected tools. It is one structured operating system with role-specific views."
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
      title="Bridge follows the real transaction lifecycle."
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
    <BridgeShell currentPath="/bridge/contact" title="Bridge | Contact">
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
