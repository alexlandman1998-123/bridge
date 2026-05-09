import { ATTORNEY_FIRM_ROLE_VALUES } from '../../../lib/attorneyPermissions'

const ROLE_LABELS = {
  director_partner: 'Director / Partner',
  transfer_attorney: 'Transfer Attorney',
  bond_attorney: 'Bond Attorney',
  conveyancing_secretary: 'Conveyancing Secretary',
  admin_staff: 'Admin Staff',
  reception_scheduling: 'Reception / Scheduling',
  candidate_attorney: 'Candidate Attorney',
}

const ALLOWED_INVITE_ROLES = ATTORNEY_FIRM_ROLE_VALUES.filter((role) => role !== 'firm_admin')

function resolveDefaultDepartmentByRole(role, availableDepartmentTypes = []) {
  if (!role) return ''
  if (role === 'director_partner' && availableDepartmentTypes.includes('management')) return 'management'
  if (role === 'transfer_attorney' && availableDepartmentTypes.includes('transfer')) return 'transfer'
  if (role === 'bond_attorney' && availableDepartmentTypes.includes('bond')) return 'bond'
  if (role === 'admin_staff' && availableDepartmentTypes.includes('admin')) return 'admin'
  if (role === 'reception_scheduling' && availableDepartmentTypes.includes('admin')) return 'admin'
  if (role === 'candidate_attorney' && availableDepartmentTypes.includes('transfer')) return 'transfer'
  return availableDepartmentTypes[0] || ''
}

export function getAllowedDepartmentsForRole(role, departmentTypes = []) {
  const available = [...departmentTypes]
  if (!role) return available
  if (role === 'transfer_attorney') return available.filter((type) => type === 'transfer')
  if (role === 'bond_attorney') return available.filter((type) => type === 'bond')
  if (role === 'conveyancing_secretary') return available.filter((type) => ['transfer', 'bond', 'admin'].includes(type))
  if (role === 'admin_staff' || role === 'reception_scheduling') return available.filter((type) => type === 'admin')
  if (role === 'director_partner') return available.filter((type) => type === 'management')
  if (role === 'candidate_attorney') return available.filter((type) => ['transfer', 'bond'].includes(type))
  return available
}

export function normalizeInviteForRole(invite, availableDepartmentTypes) {
  const nextRole = invite.role || ''
  const allowedDepartments = getAllowedDepartmentsForRole(nextRole, availableDepartmentTypes)
  const departmentType = allowedDepartments.includes(invite.departmentType)
    ? invite.departmentType
    : resolveDefaultDepartmentByRole(nextRole, allowedDepartments)

  return {
    ...invite,
    departmentType,
  }
}

function TeamInvitesStep({ invites = [], activeDepartmentTypes = [], onAddInvite, onRemoveInvite, onUpdateInvite, errors = {} }) {
  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'grid', gap: '0.2rem' }}>
        <h3 style={{ margin: 0 }}>Invite Team Members</h3>
        <p className="status-message" style={{ margin: 0 }}>
          Invite colleagues now or skip and invite them later from firm settings.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <p className="status-message" style={{ margin: 0 }}>
          Invitations are optional in onboarding.
        </p>
        <button type="button" className="header-secondary-cta" onClick={onAddInvite}>+ Add Team Member</button>
      </div>

      {errors._global ? <p className="status-message" style={{ margin: 0, color: '#b42318' }}>{errors._global}</p> : null}

      {invites.length ? (
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          {invites.map((invite, index) => {
            const rowErrors = errors[invite.id] || {}
            const allowedDepartmentTypes = getAllowedDepartmentsForRole(invite.role, activeDepartmentTypes)
            return (
              <div key={invite.id} className="panel card-tier-soft" style={{ display: 'grid', gap: '0.6rem', padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Invite {index + 1}</strong>
                  <button type="button" className="header-secondary-cta" onClick={() => onRemoveInvite(invite.id)}>Remove</button>
                </div>

                <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <label className="form-field">
                    <span>Email *</span>
                    <input
                      type="email"
                      value={invite.email}
                      onChange={(event) => onUpdateInvite(invite.id, 'email', event.target.value)}
                      required
                    />
                    {rowErrors.email ? <small style={{ color: '#b42318' }}>{rowErrors.email}</small> : null}
                  </label>

                  <label className="form-field">
                    <span>Role *</span>
                    <select
                      value={invite.role}
                      onChange={(event) => onUpdateInvite(invite.id, 'role', event.target.value)}
                      required
                    >
                      <option value="">Select role</option>
                      {ALLOWED_INVITE_ROLES.map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>
                      ))}
                    </select>
                    {rowErrors.role ? <small style={{ color: '#b42318' }}>{rowErrors.role}</small> : null}
                  </label>

                  <label className="form-field">
                    <span>Department *</span>
                    <select
                      value={invite.departmentType}
                      onChange={(event) => onUpdateInvite(invite.id, 'departmentType', event.target.value)}
                      required
                    >
                      <option value="">Select department</option>
                      {allowedDepartmentTypes.map((departmentType) => (
                        <option key={departmentType} value={departmentType}>
                          {departmentType === 'management'
                            ? 'Management'
                            : departmentType === 'transfer'
                              ? 'Transfer Department'
                              : departmentType === 'bond'
                                ? 'Bond Department'
                                : 'Admin Department'}
                        </option>
                      ))}
                    </select>
                    {rowErrors.departmentType ? <small style={{ color: '#b42318' }}>{rowErrors.departmentType}</small> : null}
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="status-message" style={{ margin: 0 }}>No team invites added yet.</p>
      )}
    </div>
  )
}

export default TeamInvitesStep
