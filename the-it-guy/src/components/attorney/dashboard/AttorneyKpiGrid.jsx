import {
  AlertTriangle,
  Building2,
  FileCheck,
  FileText,
  Files,
  Hourglass,
  Signature,
  Stamp,
} from 'lucide-react'
import AttorneyKpiCard from './AttorneyKpiCard'

const KPI_CONFIG = [
  { key: 'activeMatters', label: 'Active Matters', icon: Files, helperText: 'Total active firm matters' },
  { key: 'transferMatters', label: 'Transfer Matters', icon: Building2, helperText: 'Transfer-focused matters' },
  { key: 'bondMatters', label: 'Bond Matters', icon: FileText, helperText: 'Bond-focused matters' },
  { key: 'lodgedThisWeek', label: 'Lodged This Week', icon: Stamp, helperText: 'Lodgement updates this week' },
  { key: 'registeredThisMonth', label: 'Registered This Month', icon: FileCheck, helperText: 'Registrations this month' },
  { key: 'delayedMatters', label: 'Delayed Matters', icon: AlertTriangle, helperText: 'Needs management attention' },
  { key: 'awaitingFica', label: 'Awaiting FICA', icon: Hourglass, helperText: 'Awaiting client FICA documents' },
  { key: 'awaitingSignatures', label: 'Awaiting Signatures', icon: Signature, helperText: 'Waiting for signatures' },
]

function AttorneyKpiGrid({ kpis = {} }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-base font-semibold text-slate-950">Key Metrics</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {KPI_CONFIG.map((config) => (
          <AttorneyKpiCard
            key={config.key}
            icon={config.icon}
            label={config.label}
            helperText={config.helperText}
            value={Number(kpis?.[config.key] || 0)}
          />
        ))}
      </div>
    </section>
  )
}

export default AttorneyKpiGrid
