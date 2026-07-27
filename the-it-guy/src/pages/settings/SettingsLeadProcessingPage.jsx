import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  Mail,
  RefreshCw,
  Settings,
  Wrench,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  SettingsPageHeader,
  SettingsSectionCard,
  settingsCardClass,
  settingsPageClass,
} from './settingsUi'

const SETUP_STEPS = [
  {
    title: 'Generate the address',
    copy: 'Open Lead Capture and make sure each active agent has a Ready or Active address.',
    action: 'Open Lead Capture',
    to: '/settings/lead-capture',
    icon: Mail,
  },
  {
    title: 'Forward portal mail',
    copy: 'Use the agent address as the forwarding destination in Property24, Private Property, Facebook, or website forms.',
    action: 'View addresses',
    to: '/settings/lead-capture',
    icon: Settings,
  },
  {
    title: 'Send one test enquiry',
    copy: 'Submit a test from the source and confirm it appears under Recent Inbound Emails.',
    action: 'Check inbound',
    to: '/settings/lead-capture',
    icon: Inbox,
  },
]

const DAILY_STEPS = [
  {
    title: 'Check new enquiries',
    copy: 'Open Enquiries first. Process the newest rows, confirm the assigned agent, and move real opportunities into the active lead flow.',
    to: '/pipeline/enquiries',
  },
  {
    title: 'Clear review items',
    copy: 'Open Lead Capture when the Needs Review count is above zero. Repair missing names, phone numbers, listing references, or assignment details.',
    to: '/settings/lead-capture',
  },
  {
    title: 'Fix the source, then resolve',
    copy: 'If a lead keeps landing unmatched, update the forwarding destination at the property portal or website form before resolving the review item.',
    to: '/settings/lead-capture',
  },
]

const STATUS_ROWS = [
  ['Ready', 'The address exists. Send a test enquiry before relying on it.'],
  ['Test Received', 'The mailbox route received an email, but no lead has been created from it yet.'],
  ['Active', 'Inbound email has created or matched a lead successfully.'],
  ['Needs Review', 'The email arrived, but the parser could not confidently create a clean lead.'],
]

function StepCard({ item, index }) {
  const Icon = item.icon || ClipboardCheck
  return (
    <div className={settingsCardClass}>
      <div className="flex items-start gap-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#d9e4ef] bg-[#f8fbff] text-[#35546c]">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8da6]">Step {index + 1}</p>
          <h4 className="mt-1 text-sm font-semibold text-[#162334]">{item.title}</h4>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{item.copy}</p>
          {item.to ? (
            <Link to={item.to} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#176b48]">
              {item.action || 'Open'} <ArrowRight size={15} />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StatusTable() {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#dfe7ee] bg-white">
      <table className="min-w-full text-left">
        <thead className="bg-[#f8fbfe] text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">
          <tr>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {STATUS_ROWS.map(([status, meaning]) => (
            <tr key={status} className="border-t border-[#e8eef5] align-top">
              <td className="px-4 py-3 text-sm font-semibold text-[#162334]">{status}</td>
              <td className="px-4 py-3 text-sm leading-6 text-[#6b7d93]">{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SettingsLeadProcessingPage() {
  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Lead Processing"
        description="A short operating guide for using forwarded portal enquiries after lead capture is switched on."
        actions={
          <Link
            to="/settings/lead-capture"
            className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#244b76] bg-[#274e7a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f4167]"
          >
            <Mail size={16} />
            Lead Capture
          </Link>
        }
      />

      <SettingsSectionCard title="First-Time Setup" description="Complete this once per source or when a new agent starts receiving portal enquiries.">
        <div className="grid gap-4 lg:grid-cols-3">
          {SETUP_STEPS.map((item, index) => (
            <StepCard key={item.title} item={item} index={index} />
          ))}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Daily Processing" description="Use this routine to keep inbound enquiries moving into clean leads.">
        <div className="grid gap-4">
          {DAILY_STEPS.map((item, index) => (
            <StepCard key={item.title} item={item} index={index} />
          ))}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Status Guide" description="These are the statuses users will see while checking lead capture health.">
        <StatusTable />
      </SettingsSectionCard>

      <SettingsSectionCard title="When Something Looks Wrong" description="The fastest checks before escalating a lead capture issue.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className={settingsCardClass}>
            <AlertCircle className="text-[#9a6408]" size={20} />
            <h4 className="mt-3 text-sm font-semibold text-[#162334]">No email appears</h4>
            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Confirm the property portal forwards to the exact copied address.</p>
          </div>
          <div className={settingsCardClass}>
            <Wrench className="text-[#35546c]" size={20} />
            <h4 className="mt-3 text-sm font-semibold text-[#162334]">Email needs review</h4>
            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Use Repair to add missing contact details, then create or link the lead.</p>
          </div>
          <div className={settingsCardClass}>
            <CheckCircle2 className="text-[#1f7a45]" size={20} />
            <h4 className="mt-3 text-sm font-semibold text-[#162334]">Lead was created</h4>
            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Continue from Enquiries or the lead workspace and follow normal qualification steps.</p>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Quick Links">
        <div className="flex flex-wrap gap-3">
          <Link to="/pipeline/enquiries" className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#d7e2ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd]">
            <Inbox size={16} />
            Enquiries
          </Link>
          <Link to="/settings/lead-capture" className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#d7e2ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd]">
            <RefreshCw size={16} />
            Capture Health
          </Link>
        </div>
      </SettingsSectionCard>
    </div>
  )
}
