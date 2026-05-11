const LABELS = {
  transfer: 'Transfer Department',
  bond: 'Bond Department',
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
  admin: 'Operations, admin support, and coordination tasks.',
  management: 'Leadership, oversight, and firm governance.',
  litigation: 'Disputes, court process, and legal representation workflow.',
  estates: 'Estate planning and deceased estate administration workflow.',
  commercial: 'Commercial agreements and corporate legal support.',
  developments: 'Development legal workflow, transfers, and deal coordination.',
}

const ICONS = {
  transfer: 'TR',
  bond: 'BD',
  admin: 'AD',
  management: 'MG',
}

function DepartmentCard({ type, active, disabled, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(type)}
      disabled={disabled}
      style={{
        textAlign: 'left',
        width: '100%',
        display: 'grid',
        gap: '0.45rem',
        borderRadius: '1rem',
        border: active ? '1px solid rgba(22, 103, 179, 0.45)' : '1px solid rgba(20, 33, 61, 0.14)',
        padding: '1rem',
        background: active ? 'rgba(22, 103, 179, 0.08)' : '#fff',
        opacity: disabled ? 0.75 : 1,
        boxShadow: active ? '0 8px 24px rgba(17, 73, 123, 0.08)' : '0 2px 8px rgba(15, 30, 60, 0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
        <strong style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
          <span aria-hidden>{ICONS[type] || '--'}</span>
          <span>{LABELS[type]}</span>
        </strong>
        <span className="status-message" style={{ fontWeight: 700 }}>{active ? 'Active' : 'Inactive'}</span>
      </div>
      <span className="status-message">{DESCRIPTIONS[type]}</span>
      {disabled ? <span className="status-message">Management must always remain active.</span> : null}
    </button>
  )
}

function DepartmentsStep({ selectedDepartments = {}, onToggleDepartment }) {
  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'grid', gap: '0.2rem' }}>
        <h3 style={{ margin: 0 }}>Active Departments</h3>
        <p className="status-message" style={{ margin: 0 }}>
          Choose which departments are active for your firm. This controls early permissions and dashboard defaults.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
        {['transfer', 'bond', 'admin', 'management'].map((departmentType) => (
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
