const LABELS = {
  transfer: 'Transfer Department',
  bond: 'Bond Department',
  admin: 'Admin Department',
  management: 'Management',
}

const DESCRIPTIONS = {
  transfer: 'Transfer matters, registration, and conveyancing workflow.',
  bond: 'Bond registration and mortgage-related workflow.',
  admin: 'Operations, admin support, and coordination tasks.',
  management: 'Leadership, oversight, and firm governance.',
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
        gap: '0.35rem',
        borderRadius: '0.9rem',
        border: active ? '1px solid rgba(22, 103, 179, 0.45)' : '1px solid rgba(20, 33, 61, 0.14)',
        padding: '0.9rem',
        background: active ? 'rgba(22, 103, 179, 0.08)' : '#fff',
        opacity: disabled ? 0.75 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
        <strong>{LABELS[type]}</strong>
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
          Choose which departments are active for your firm. You can refine this later in firm settings.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
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
