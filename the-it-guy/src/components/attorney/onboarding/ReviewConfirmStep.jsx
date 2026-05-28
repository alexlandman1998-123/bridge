const DEPARTMENT_LABELS = {
  transfer: 'Transfer Department',
  bond: 'Bond Department',
  admin: 'Admin Department',
  management: 'Management',
}

const ROLE_LABELS = {
  director_partner: 'Director / Partner',
  transfer_attorney: 'Transfer Attorney',
  bond_attorney: 'Bond Attorney',
  conveyancing_secretary: 'Conveyancing Secretary',
  admin_staff: 'Admin Staff',
  reception_scheduling: 'Reception / Scheduling',
  candidate_attorney: 'Candidate Attorney',
}

function SummaryCard({ title, children }) {
  return (
    <div className="ui-panel-muted" style={{ display: 'grid', gap: '0.5rem', padding: '0.9rem' }}>
      <h4 style={{ margin: 0 }}>{title}</h4>
      {children}
    </div>
  )
}

function getLogoSummary(branding) {
  if (branding.logoFileName) return branding.logoFileName
  if (branding.logoPath) return branding.logoPath.split('/').filter(Boolean).pop() || 'Uploaded logo'
  if (branding.logoUrl) return 'Uploaded logo'
  return 'No logo provided'
}

function ReviewConfirmStep({ firmInformation, branding, activeDepartmentTypes, invites }) {
  const departmentList = activeDepartmentTypes.map((type) => DEPARTMENT_LABELS[type] || type)
  const logoSummary = getLogoSummary(branding)

  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'grid', gap: '0.2rem' }}>
        <h3 style={{ margin: 0 }}>Review & Confirm</h3>
        <p className="status-message" style={{ margin: 0 }}>
          Confirm your setup details. We will create your firm, apply departments, and add pending invitations.
        </p>
      </div>

      <SummaryCard title="Firm Information">
        <p className="status-message" style={{ margin: 0 }}><strong>Name:</strong> {firmInformation.name || '—'}</p>
        <p className="status-message" style={{ margin: 0 }}><strong>Email:</strong> {firmInformation.email || '—'}</p>
        <p className="status-message" style={{ margin: 0 }}><strong>Phone:</strong> {firmInformation.phone || '—'}</p>
        <p className="status-message" style={{ margin: 0 }}><strong>Website:</strong> {firmInformation.website || '—'}</p>
        <p className="status-message" style={{ margin: 0 }}>
          <strong>Address:</strong> {[firmInformation.addressLine1, firmInformation.addressLine2, firmInformation.city, firmInformation.province, firmInformation.postalCode, firmInformation.country]
            .filter(Boolean)
            .join(', ') || '—'}
        </p>
      </SummaryCard>

      <SummaryCard title="Branding">
        <div className="attorney-review-branding-row">
          <p className="status-message attorney-review-text" style={{ margin: 0 }}>
            <strong>Logo:</strong> {logoSummary}
          </p>
          <div style={{ display: 'flex', gap: '0.45rem' }}>
            <span style={{ width: 18, height: 18, borderRadius: '999px', background: branding.primaryColour || '#0f4c81', border: '1px solid rgba(20,33,61,0.2)' }} />
            <span style={{ width: 18, height: 18, borderRadius: '999px', background: branding.secondaryColour || '#1e2a44', border: '1px solid rgba(20,33,61,0.2)' }} />
          </div>
        </div>
      </SummaryCard>

      <SummaryCard title="Active Departments">
        {departmentList.length ? (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {departmentList.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : (
          <p className="status-message" style={{ margin: 0 }}>No departments selected.</p>
        )}
      </SummaryCard>

      <SummaryCard title="Team Invitations">
        {invites.length ? (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {invites.map((invite) => (
              <li key={invite.id}>
                {invite.email} · {ROLE_LABELS[invite.role] || invite.role} · {DEPARTMENT_LABELS[invite.departmentType] || invite.departmentType}
              </li>
            ))}
          </ul>
        ) : (
          <p className="status-message" style={{ margin: 0 }}>No invitations added during onboarding.</p>
        )}
      </SummaryCard>
    </div>
  )
}

export default ReviewConfirmStep
