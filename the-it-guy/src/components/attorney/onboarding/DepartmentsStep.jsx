import { BriefcaseBusiness, CheckCircle2, Circle, Landmark, LockKeyhole, Scale, ShieldCheck, Users } from 'lucide-react'

const LABELS = {
  transfer: 'Transfer Department',
  bond: 'Bond Department',
  cancellation: 'Bond Cancellation Department',
  admin: 'Admin Department',
  management: 'Management',
  litigation: 'Litigation',
  estates: 'Estates',
  commercial: 'Commercial',
  developments: 'Developments',
}

const DESCRIPTIONS = {
  transfer: 'Transfer matters, registration, and conveyancing workflow.',
  bond: 'Bond registration and mortgage-related workflow.',
  cancellation: 'Existing-bond cancellation, figures, guarantees, consent, and discharge workflow.',
  admin: 'Operations, support, finance handoffs, and coordination tasks.',
  management: 'Leadership, oversight, reporting, and firm governance.',
  litigation: 'Disputes, court process, and legal representation workflow.',
  estates: 'Estate planning and deceased estate administration workflow.',
  commercial: 'Commercial agreements and corporate legal support.',
  developments: 'Development legal workflow, transfers, and deal coordination.',
}

const METADATA = {
  transfer: { icon: Scale, accent: 'Conveyancing', lanes: ['Sale transfer', 'Documents', 'Registration'] },
  bond: { icon: Landmark, accent: 'Finance', lanes: ['Bond instruction', 'Guarantees', 'Lodgement'] },
  cancellation: { icon: Landmark, accent: 'Discharge', lanes: ['Bank instruction', 'Cancellation figures', 'Consent'] },
  admin: { icon: Users, accent: 'Operations', lanes: ['Intake', 'Billing', 'Scheduling'] },
  management: { icon: BriefcaseBusiness, accent: 'Governance', lanes: ['Oversight', 'Reporting', 'Permissions'] },
}

function DepartmentCard({ type, active, disabled, onToggle }) {
  const meta = METADATA[type] || { icon: BriefcaseBusiness, accent: 'Workflow', lanes: [] }
  const Icon = meta.icon

  return (
    <button
      type="button"
      className={`attorney-department-card ${active ? 'is-active' : ''} ${disabled ? 'is-locked' : ''}`}
      onClick={() => {
        if (!disabled) onToggleDepartmentSafe(onToggle, type)
      }}
      disabled={disabled}
      aria-pressed={active}
    >
      <span className="attorney-department-card-top">
        <span className="attorney-department-icon">
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="attorney-department-state">
          {disabled ? <LockKeyhole size={13} aria-hidden="true" /> : active ? <CheckCircle2 size={13} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
          {disabled ? 'Required' : active ? 'Active' : 'Inactive'}
        </span>
      </span>

      <span className="attorney-department-copy">
        <em>{meta.accent}</em>
        <strong>{LABELS[type]}</strong>
        <span>{DESCRIPTIONS[type]}</span>
      </span>

      <span className="attorney-department-lanes" aria-label={`${LABELS[type]} workflow lanes`}>
        {meta.lanes.map((lane) => (
          <span key={lane}>{lane}</span>
        ))}
      </span>
    </button>
  )
}

function onToggleDepartmentSafe(onToggle, type) {
  if (typeof onToggle === 'function') onToggle(type)
}

function DepartmentsStep({ selectedDepartments = {}, onToggleDepartment }) {
  const activeCount = ['transfer', 'bond', 'cancellation', 'admin', 'management'].filter((departmentType) => Boolean(selectedDepartments[departmentType])).length

  return (
    <div className="attorney-step-flow">
      <div className="attorney-step-hero">
        <div className="attorney-step-hero-copy">
          <span className="attorney-step-kicker">
            <ShieldCheck size={14} aria-hidden="true" />
            Workflow architecture
          </span>
          <h3>Switch on the legal lanes your firm will operate from day one.</h3>
          <p>
            Department choices shape routing defaults, dashboard modules, permissions, and the team invites that follow.
          </p>
        </div>
        <div className="attorney-department-count-card">
          <strong>{activeCount}</strong>
          <span>active lanes</span>
        </div>
      </div>

      <div className="attorney-departments-grid">
        {['transfer', 'bond', 'cancellation', 'admin', 'management'].map((departmentType) => (
          <DepartmentCard
            key={departmentType}
            type={departmentType}
            active={Boolean(selectedDepartments[departmentType])}
            disabled={departmentType === 'management'}
            onToggle={onToggleDepartment}
          />
        ))}
      </div>
    </div>
  )
}

export default DepartmentsStep
