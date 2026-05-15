import { ChevronRight, Mail, Phone } from 'lucide-react'
import AttorneyFirmLogo from './AttorneyFirmLogo'

function statusTone(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'active') return { border: '#b9d7c8', bg: '#ecf9f1', text: '#067647', label: 'Active' }
  if (normalized === 'pending') return { border: '#f5d9a6', bg: '#fff7eb', text: '#b54708', label: 'Pending' }
  if (normalized === 'paused') return { border: '#dbe5ef', bg: '#f7f9fc', text: '#475467', label: 'Paused' }
  if (normalized === 'completed') return { border: '#c8d8f2', bg: '#edf4ff', text: '#175cd3', label: 'Completed' }
  return { border: '#dbe5ef', bg: '#f7f9fc', text: '#475467', label: 'Unknown' }
}

function AttorneyFirmRolePlayerCard({
  rolePlayer = null,
  assignmentLabel = 'Attorney Assignment',
  onViewDetails = null,
  readOnly = false,
}) {
  const firm = rolePlayer?.firm || null
  const firmName = firm?.name || 'Attorney Firm'
  const primaryName = rolePlayer?.attorneyUser?.name || rolePlayer?.primaryAttorney?.name || 'Not assigned'
  const secretaryName = rolePlayer?.secretary?.name || ''
  const status = statusTone(rolePlayer?.status || 'active')

  return (
    <article className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AttorneyFirmLogo
            firmName={firmName}
            logoUrl={firm?.logoUrl || firm?.logo_url}
            primaryColour={firm?.primaryColour || firm?.primary_colour}
            secondaryColour={firm?.secondaryColour || firm?.secondary_colour}
            size={40}
            borderRadius={10}
          />
          <div className="min-w-0">
            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">{assignmentLabel}</span>
            <h4 className="mt-1 truncate text-sm font-semibold text-[#142132]">{firmName}</h4>
          </div>
        </div>
        <span
          className="inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
          style={{ borderColor: status.border, background: status.bg, color: status.text }}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-[#35546c]">
        <p style={{ margin: 0 }}>
          <strong className="text-[#142132]">{rolePlayer?.isPrimary === false ? 'Supporting' : 'Primary'}:</strong> {primaryName}
        </p>
        {secretaryName ? (
          <p style={{ margin: 0 }}>
            <strong className="text-[#142132]">Secretary:</strong> {secretaryName}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 text-sm text-[#5a6b80]">
        {firm?.phone ? (
          <p className="flex items-center gap-2" style={{ margin: 0 }}>
            <Phone size={13} />
            {firm.phone}
          </p>
        ) : null}
        {firm?.email ? (
          <p className="flex items-center gap-2" style={{ margin: 0 }}>
            <Mail size={13} />
            {firm.email}
          </p>
        ) : null}
      </div>

      {onViewDetails && !readOnly ? (
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-1 rounded-full border border-[#d8e3f0] bg-white px-3 py-1.5 text-[0.72rem] font-semibold text-[#35546c]"
          onClick={onViewDetails}
        >
          View details
          <ChevronRight size={13} />
        </button>
      ) : null}
    </article>
  )
}

export default AttorneyFirmRolePlayerCard
