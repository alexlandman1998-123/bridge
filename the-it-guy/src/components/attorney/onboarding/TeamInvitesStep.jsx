import { BriefcaseBusiness, Mail, Plus, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { ATTORNEY_FIRM_ROLE_VALUES } from '../../../lib/attorneyPermissions'
import { getAllowedDepartmentsForRole } from './teamInviteUtils'

const ROLE_LABELS = {
  director_partner: 'Director',
  transfer_attorney: 'Conveyancer',
  bond_attorney: 'Attorney',
  conveyancing_secretary: 'Assistant',
  admin_staff: 'Admin / Accounts',
  reception_scheduling: 'Reception',
  candidate_attorney: 'Candidate Attorney',
}

const DEPARTMENT_LABELS = {
  transfer: 'Transfer Department',
  bond: 'Bond Department',
  admin: 'Admin Department',
  management: 'Management',
}

const ALLOWED_INVITE_ROLES = ATTORNEY_FIRM_ROLE_VALUES.filter((role) => role !== 'firm_admin')

function inviteInitial(invite = {}, index = 0) {
  const email = String(invite.email || '').trim()
  if (email) return email[0].toUpperCase()
  return String(index + 1)
}

function PremiumSelectField({ label, icon: Icon, value, onChange, children, error = '' }) {
  return (
    <label className={`attorney-premium-field ${error ? 'has-error' : ''}`}>
      <span>
        <Icon size={14} aria-hidden="true" />
        {label}
      </span>
      <select value={value} onChange={onChange} required>
        {children}
      </select>
      {error ? <small className="attorney-field-error">{error}</small> : null}
    </label>
  )
}

function TeamInvitesStep({ invites = [], activeDepartmentTypes = [], onAddInvite, onRemoveInvite, onUpdateInvite, errors = {} }) {
  return (
    <div className="attorney-step-flow">
      <div className="attorney-step-hero">
        <div className="attorney-step-hero-copy">
          <span className="attorney-step-kicker">
            <UserPlus size={14} aria-hidden="true" />
            Team access
          </span>
          <h3>Prepare the first people who will operate inside the firm workspace.</h3>
          <p>
            Invitations are optional during onboarding and remain editable from firm settings after activation.
          </p>
        </div>
        <div className="attorney-invite-count-card">
          <strong>{invites.length}</strong>
          <span>{invites.length === 1 ? 'pending invite' : 'pending invites'}</span>
        </div>
      </div>

      <div className="attorney-invite-toolbar">
        <div>
          <span className="attorney-step-kicker">
            <ShieldCheck size={14} aria-hidden="true" />
            Access roster
          </span>
          <strong>Invite partners, conveyancers, and support staff.</strong>
        </div>
        <button type="button" className="attorney-inline-action is-primary" onClick={onAddInvite}>
          <Plus size={16} aria-hidden="true" />
          Add Team Member
        </button>
      </div>

      {errors._global ? <p className="attorney-step-alert">{errors._global}</p> : null}

      {invites.length ? (
        <div className="attorney-invite-list">
          {invites.map((invite, index) => {
            const rowErrors = errors[invite.id] || {}
            const allowedDepartmentTypes = getAllowedDepartmentsForRole(invite.role, activeDepartmentTypes)
            return (
              <article key={invite.id} className="attorney-invite-card">
                <div className="attorney-invite-card-head">
                  <span className="attorney-invite-avatar">{inviteInitial(invite, index)}</span>
                  <div>
                    <span>Invite {index + 1}</span>
                    <strong>{invite.email || 'New team member'}</strong>
                  </div>
                  <button type="button" className="attorney-icon-action" onClick={() => onRemoveInvite(invite.id)} aria-label={`Remove invite ${index + 1}`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>

                <div className="attorney-step-grid is-three">
                  <label className={`attorney-premium-field ${rowErrors.email ? 'has-error' : ''}`}>
                    <span>
                      <Mail size={14} aria-hidden="true" />
                      Email *
                    </span>
                    <input
                      type="email"
                      value={invite.email}
                      onChange={(event) => onUpdateInvite(invite.id, 'email', event.target.value)}
                      required
                    />
                    {rowErrors.email ? <small className="attorney-field-error">{rowErrors.email}</small> : null}
                  </label>

                  <PremiumSelectField
                    label="Role *"
                    icon={Users}
                    value={invite.role}
                    onChange={(event) => onUpdateInvite(invite.id, 'role', event.target.value)}
                    error={rowErrors.role}
                  >
                    <option value="">Select role</option>
                    {ALLOWED_INVITE_ROLES.map((role) => (
                      <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>
                    ))}
                  </PremiumSelectField>

                  <PremiumSelectField
                    label="Department *"
                    icon={BriefcaseBusiness}
                    value={invite.departmentType}
                    onChange={(event) => onUpdateInvite(invite.id, 'departmentType', event.target.value)}
                    error={rowErrors.departmentType}
                  >
                    <option value="">Select department</option>
                    {allowedDepartmentTypes.map((departmentType) => (
                      <option key={departmentType} value={departmentType}>
                        {DEPARTMENT_LABELS[departmentType] || departmentType}
                      </option>
                    ))}
                  </PremiumSelectField>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="attorney-invite-empty">
          <span>
            <UserPlus size={22} aria-hidden="true" />
          </span>
          <strong>No team invites added yet.</strong>
          <p>Add the first workspace users now, or activate the firm and invite the team later.</p>
          <button type="button" className="attorney-inline-action is-primary" onClick={onAddInvite}>
            <Plus size={16} aria-hidden="true" />
            Add Team Member
          </button>
        </div>
      )}
    </div>
  )
}

export default TeamInvitesStep
