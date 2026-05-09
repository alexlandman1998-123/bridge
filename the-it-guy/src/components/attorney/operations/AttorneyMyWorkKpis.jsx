import { AlertTriangle, CalendarCheck2, CheckSquare, FileClock, FileWarning, FolderOpen } from 'lucide-react'

const BASE_KPIS = [
  { key: 'myActiveMatters', label: 'My Active Matters', icon: FolderOpen },
  { key: 'transferMatters', label: 'Transfer Matters', icon: FolderOpen },
  { key: 'bondMatters', label: 'Bond Matters', icon: FolderOpen },
  { key: 'tasksDueToday', label: 'Tasks Due Today', icon: CheckSquare },
  { key: 'outstandingDocuments', label: 'Outstanding Documents', icon: FileWarning },
  { key: 'pendingSignatures', label: 'Pending Signatures', icon: FileClock },
  { key: 'delayedMatters', label: 'Delayed Matters', icon: AlertTriangle },
  { key: 'upcomingAppointments', label: 'Upcoming Appointments', icon: CalendarCheck2 },
]

function KpiCard({ label, value, icon: Icon }) {
  return (
    <div className="panel card-tier-standard" style={{ display: 'grid', gap: '0.35rem', minHeight: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <p className="status-message" style={{ margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </p>
        {Icon ? <Icon size={16} color="#4f5f79" /> : null}
      </div>
      <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.05 }}>{Number(value || 0)}</p>
    </div>
  )
}

function AttorneyMyWorkKpis({ kpis }) {
  const roleSpecific = Array.isArray(kpis?.roleSpecific) ? kpis.roleSpecific : []

  return (
    <section style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>My Work</h3>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {BASE_KPIS.map((item) => (
          <KpiCard key={item.key} label={item.label} value={kpis?.[item.key] || 0} icon={item.icon} />
        ))}
        {roleSpecific.map((item) => (
          <KpiCard key={item.key} label={item.label} value={item.value || 0} />
        ))}
      </div>
    </section>
  )
}

export default AttorneyMyWorkKpis
