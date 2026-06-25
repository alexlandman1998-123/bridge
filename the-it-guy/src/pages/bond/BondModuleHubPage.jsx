import { Building2, CalendarDays, ClipboardList, FileBarChart2, ShieldUser } from 'lucide-react'
import { Link } from 'react-router-dom'
import BondPageShell from '../../components/bond/BondPageShell'
import BondSectionCard from '../../components/bond/BondSectionCard'

const SECTION_META = Object.freeze({
  teams: {
    title: 'Teams',
    eyebrow: 'Bond Operations',
    description: 'Review consultant, processor, compliance, branch, and regional structures that support the bond workflow.',
    icon: ShieldUser,
    cards: [
      { title: 'Consultants', description: 'Monitor active consultant books and follow-up workload.', href: '/dashboard' },
      { title: 'Processors', description: 'Keep submission and bank-response queues balanced.', href: '/bond/pipeline?view=ready-for-submission' },
      { title: 'Compliance', description: 'Surface FICA, review, and escalation items.', href: '/bond/pipeline?view=stalled' },
    ],
  },
  banks: {
    title: 'Banks',
    eyebrow: 'Lender Coverage',
    description: 'Use the command center and applications tracker to monitor bank response patterns, approvals, and turnaround context.',
    icon: Building2,
    cards: [
      { title: 'Bank Performance', description: 'Compare approvals, bottlenecks, and lender activity on the dashboard.', href: '/dashboard' },
      { title: 'Submission Stats', description: 'Track what is ready, submitted, and still waiting on support docs.', href: '/bond/pipeline' },
      { title: 'Turnaround View', description: 'Watch lender-linked applications through bond instruction and transfer.', href: '/bond/applications' },
    ],
  },
  performance: {
    title: 'Performance',
    eyebrow: 'Bond Insights',
    description: 'Compare approvals, turnaround speed, pipeline quality, and lender conversion through a calmer performance lens.',
    icon: FileBarChart2,
    cards: [
      { title: 'Pipeline Performance', description: 'Review volume, movement, and bottlenecks across the finance pipeline.', href: '/bond/pipeline' },
      { title: 'Development Performance', description: 'Compare project-level origination outcomes and risk.', href: '/bond/developments' },
      { title: 'Bank Analytics', description: 'Compare approval ratios, delays, and lender responsiveness.', href: '/dashboard' },
    ],
  },
  tasks: {
    title: 'Tasks',
    eyebrow: 'Operational Work',
    description: 'Prioritise document follow-ups, stalled applications, and next actions across the bond workflow.',
    icon: ClipboardList,
    cards: [
      { title: 'Awaiting Documents', description: 'Follow up on incomplete applications before submission.', href: '/bond/pipeline?view=awaiting-docs' },
      { title: 'At-Risk Applications', description: 'Review active applications with delay or risk signals.', href: '/bond/applications?view=at-risk' },
      { title: 'Ready for Submission', description: 'Move reviewed applications into the bank submission queue.', href: '/bond/pipeline?view=ready-for-submission' },
    ],
  },
  calendar: {
    title: 'Calendar',
    eyebrow: 'Application Timing',
    description: 'Review applications that need signing, attorney handoff, or registration timing attention.',
    icon: CalendarDays,
    cards: [
      { title: 'Attorney Stage', description: 'Track applications moving into attorney instruction and transfer work.', href: '/bond/applications?view=attorney-stage' },
      { title: 'Instruction Sent', description: 'Review applications with instructions already sent to attorneys.', href: '/bond/applications?view=instruction-sent' },
      { title: 'Registered', description: 'Check recently registered bond applications.', href: '/bond/applications?view=registered' },
    ],
  },
})

export default function BondModuleHubPage({ section = 'teams' }) {
  const meta = SECTION_META[section] || {
    title: 'Bond Workspace',
    eyebrow: 'Arch9',
    description: 'This section is ready for expanded bond operations workflows.',
    icon: FileBarChart2,
    cards: [],
  }
  const Icon = meta.icon || FileBarChart2

  return (
    <BondPageShell>
      <BondSectionCard
        className="bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]"
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
        action={(
          <div className="rounded-[20px] border border-[#dce6f2] bg-[#f7fbff] p-3 text-[#17324d]">
            <Icon size={20} />
          </div>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {meta.cards.map((card) => (
          <Link
            key={card.title}
            to={card.href}
            className="rounded-[24px] border border-[#dbe5f0] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.035)] transition hover:-translate-y-[1px] hover:border-[#ccd9e8]"
          >
            <p className="text-base font-semibold text-[#142132]">{card.title}</p>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">{card.description}</p>
          </Link>
        ))}
      </div>
    </BondPageShell>
  )
}
