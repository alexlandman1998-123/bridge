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
        gridTemplateRows: disabled ? 'auto 1fr auto' : 'auto 1fr',
        minHeight: '13rem',
        gap: '0.7rem',
        borderRadius: '0.9rem',
        border: active ? '1px solid rgba(22, 103, 179, 0.42)' : '1px solid rgba(20, 33, 61, 0.13)',
        padding: '1.05rem',
        background: active ? 'rgba(22, 103, 179, 0.08)' : '#fff',
        opacity: disabled ? 0.75 : 1,
        boxShadow: active ? '0 8px 24px rgba(17, 73, 123, 0.08)' : '0 2px 8px rgba(15, 30, 60, 0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start' }}>
        <strong style={{ display: 'inline-flex', gap: '0.6rem', alignItems: 'center', minWidth: 0 }}>
          <span aria-hidden style={{ flex: '0 0 auto', fontWeight: 800, color: '#294862' }}>{ICONS[type] || '--'}</span>
          <span style={{ lineHeight: 1.2 }}>{LABELS[type]}</span>
        </strong>
        <span
          className="status-message"
          style={{
            flex: '0 0 auto',
            border: '1px solid rgba(20, 33, 61, 0.1)',
            borderRadius: '0.75rem',
            background: '#fff',
            color: active ? '#294862' : '#7b8794',
            fontWeight: 700,
            padding: '0.35rem 0.55rem',
          }}
        >
          {active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <span className="status-message" style={{ display: 'block', margin: 0, lineHeight: 1.45 }}>{DESCRIPTIONS[type]}</span>
      {disabled ? (
        <span className="status-message" style={{ display: 'block', margin: 0, borderRadius: '0.75rem', background: '#fff', padding: '0.7rem' }}>
          Management must always remain active.
        </span>
      ) : null}
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

      <div className="attorney-departments-grid">
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
