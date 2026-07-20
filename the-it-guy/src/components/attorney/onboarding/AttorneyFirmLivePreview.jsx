import { AlertCircle, BriefcaseBusiness, Check, FileText, Mail, Monitor, Scale, ShieldCheck, Users } from 'lucide-react'
import { getAttorneyRoleLabel } from '../../../constants/attorneyRoleCatalog.js'
import { ATTORNEY_DEPARTMENT_LABELS } from '../../../services/attorneyMatterModules.js'

const DEPARTMENT_LABELS = ATTORNEY_DEPARTMENT_LABELS

function normalizeText(value = '') {
  return String(value || '').trim()
}

function getFirmInitials(name = '') {
  const parts = normalizeText(name).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A9'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function getLogoLabel(branding = {}) {
  if (branding.logoFileName) return branding.logoFileName
  if (branding.logoPath) return branding.logoPath.split('/').filter(Boolean).pop() || 'Logo ready'
  if (branding.logoUrl) return 'Logo ready'
  return 'Logo pending'
}

function buildAddress(firmInformation = {}) {
  return [
    firmInformation.addressLine1,
    firmInformation.addressLine2,
    firmInformation.city,
    firmInformation.province,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(', ')
}

function AttorneyFirmLivePreview({ preview = null, progressPercent = 0, readiness = null, variant = '' }) {
  const firmInformation = preview?.firmInformation || {}
  const branding = preview?.branding || {}
  const activeDepartmentTypes = Array.isArray(preview?.activeDepartmentTypes) ? preview.activeDepartmentTypes : []
  const invites = Array.isArray(preview?.invites) ? preview.invites : []
  const readinessItems = Array.isArray(readiness?.items) ? readiness.items : []
  const firmName = normalizeText(firmInformation.name) || 'Your Attorney Firm'
  const primaryColour = normalizeText(branding.primaryColour) || '#0f4c81'
  const secondaryColour = normalizeText(branding.secondaryColour) || '#1e2a44'
  const address = buildAddress(firmInformation) || 'Client-facing address will appear here'
  const email = normalizeText(firmInformation.email) || 'transfers@yourfirm.co.za'
  const phone = normalizeText(firmInformation.phone) || '+27 00 000 0000'
  const website = normalizeText(firmInformation.website) || 'www.yourfirm.co.za'
  const visibleDepartments = activeDepartmentTypes.length ? activeDepartmentTypes : ['transfer', 'bond', 'cancellation', 'management']
  const visibleInvites = invites.filter((invite) => normalizeText(invite.email)).slice(0, 3)
  const previewClassName = variant ? `attorney-firm-preview is-${variant}` : 'attorney-firm-preview'

  return (
    <aside
      className={previewClassName}
      style={{
        '--attorney-preview-primary': primaryColour,
        '--attorney-preview-secondary': secondaryColour,
      }}
      aria-label="Live firm preview"
    >
      <div className="attorney-firm-preview-head">
        <span className="attorney-firm-preview-kicker">
          <Monitor size={14} aria-hidden="true" />
          Live Firm Preview
        </span>
        <strong>{firmName}</strong>
        <p>Client-facing surfaces update as the setup takes shape.</p>
      </div>

      {readinessItems.length ? (
        <div className="attorney-preview-readiness">
          <div>
            <span className="attorney-preview-section-label">
              <ShieldCheck size={14} aria-hidden="true" />
              Activation Checklist
            </span>
            <strong>{readiness?.headline || 'Setup readiness'}</strong>
          </div>
          <div className="attorney-preview-readiness-list">
            {readinessItems.slice(0, 5).map((item) => (
              <span key={item.key} className={`is-${item.state}`}>
                {item.state === 'complete' || item.state === 'optional' ? <Check size={12} aria-hidden="true" /> : <AlertCircle size={12} aria-hidden="true" />}
                {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="attorney-preview-brand-card">
        <div className="attorney-preview-logo">
          {branding.logoUrl ? <img src={branding.logoUrl} alt="" /> : <span>{getFirmInitials(firmName)}</span>}
        </div>
        <div>
          <strong>{firmName}</strong>
          <span>{getLogoLabel(branding)}</span>
        </div>
        <div className="attorney-preview-swatches" aria-label="Selected brand colours">
          <span style={{ background: primaryColour }} />
          <span style={{ background: secondaryColour }} />
        </div>
      </div>

      <div className="attorney-preview-document">
        <div className="attorney-preview-document-top">
          <span />
          <span />
        </div>
        <div className="attorney-preview-document-title">
          <FileText size={15} aria-hidden="true" />
          Document Letterhead
        </div>
        <strong>{firmName}</strong>
        <p>{address}</p>
        <div className="attorney-preview-document-rule" />
        <div className="attorney-preview-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="attorney-preview-grid">
        <div className="attorney-preview-mini">
          <span>
            <Mail size={14} aria-hidden="true" />
            Email Signature
          </span>
          <strong>{firmName}</strong>
          <p>{email}</p>
          <p>{phone}</p>
        </div>

        <div className="attorney-preview-mini">
          <span>
            <BriefcaseBusiness size={14} aria-hidden="true" />
            Matter Card
          </span>
          <strong>Transfer Instruction</strong>
          <p>Ready for workflow routing</p>
          <div className="attorney-preview-matter-status">Prepared</div>
        </div>
      </div>

      <div className="attorney-preview-portal">
        <div>
          <span>
            <ShieldCheck size={14} aria-hidden="true" />
            Client Portal
          </span>
          <strong>{website}</strong>
        </div>
        <div className="attorney-preview-progress-ring">{progressPercent}%</div>
      </div>

      <div className="attorney-preview-section">
        <span className="attorney-preview-section-label">
          <Scale size={14} aria-hidden="true" />
          Workflows enabled
        </span>
        <div className="attorney-preview-chip-row">
          {visibleDepartments.map((departmentType) => (
            <span key={departmentType}>{DEPARTMENT_LABELS[departmentType] || departmentType}</span>
          ))}
        </div>
      </div>

      <div className="attorney-preview-section">
        <span className="attorney-preview-section-label">
          <Users size={14} aria-hidden="true" />
          Team access
        </span>
        {visibleInvites.length ? (
          <div className="attorney-preview-team-list">
            {visibleInvites.map((invite) => (
              <div key={invite.id || invite.email}>
                <span>{normalizeText(invite.email)[0]?.toUpperCase() || 'T'}</span>
                <p>
                  <strong>{normalizeText(invite.email)}</strong>
                  <em>{getAttorneyRoleLabel(invite.role, { short: true, fallback: 'Team member' })}</em>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="attorney-preview-empty">Invite partners, conveyancers, and support staff when ready.</p>
        )}
      </div>
    </aside>
  )
}

export default AttorneyFirmLivePreview
