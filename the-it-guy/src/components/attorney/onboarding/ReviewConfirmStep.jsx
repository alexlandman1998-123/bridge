import { useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCopy,
  Clock3,
  FileText,
  Mail,
  Palette,
  PencilLine,
  Rocket,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { getAttorneyRoleLabel } from '../../../constants/attorneyRoleCatalog.js'

const DEPARTMENT_LABELS = {
  transfer: 'Transfer Department',
  bond: 'Bond Department',
  admin: 'Admin Department',
  management: 'Management',
}

const STATE_LABELS = {
  complete: 'Ready',
  optional: 'Optional',
  recommended: 'Recommended',
  prepared: 'Prepared',
  needs_attention: 'Needs attention',
}

const STATE_ICONS = {
  complete: Check,
  optional: Clock3,
  recommended: Clock3,
  prepared: CheckCircle2,
  needs_attention: AlertCircle,
}

function SummaryCard({ title, icon: Icon, children }) {
  return (
    <article className="attorney-review-card">
      <div className="attorney-review-card-head">
        <span>
          <Icon size={16} aria-hidden="true" />
        </span>
        <h4>{title}</h4>
      </div>
      {children}
    </article>
  )
}

function LaunchMetric({ metric }) {
  return (
    <article className="attorney-launch-metric">
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <em>{metric.detail}</em>
    </article>
  )
}

function ReviewAction({ stepKey, label, onNavigateToStep }) {
  if (!stepKey || !onNavigateToStep) return null
  return (
    <button type="button" className="attorney-dossier-action" onClick={() => onNavigateToStep(stepKey)}>
      <PencilLine size={13} aria-hidden="true" />
      {label}
    </button>
  )
}

function getActionLabel(item) {
  if (item.state === 'needs_attention') return 'Fix'
  if (item.state === 'recommended') return 'Review'
  if (item.state === 'optional') return 'Add'
  return 'Review'
}

function DossierItem({ item, onNavigateToStep }) {
  const state = item.state || (item.isReady ? 'complete' : 'needs_attention')
  const Icon = STATE_ICONS[state] || Circle
  return (
    <div className={`attorney-dossier-item is-${state}`}>
      <span>
        <Icon size={15} aria-hidden="true" />
      </span>
      <p>
        <strong>{item.label}</strong>
        <em>{item.description || item.detail}</em>
      </p>
      <div className="attorney-dossier-item-actions">
        <small>{STATE_LABELS[state] || state}</small>
        <ReviewAction stepKey={item.stepKey} label={getActionLabel({ ...item, state })} onNavigateToStep={onNavigateToStep} />
      </div>
    </div>
  )
}

function SurfaceItem({ item, onNavigateToStep }) {
  const Icon = STATE_ICONS[item.state] || Circle
  return (
    <div className={`attorney-surface-item is-${item.state}`}>
      <span>
        <Icon size={14} aria-hidden="true" />
      </span>
      <p>
        <strong>{item.label}</strong>
        <em>{item.detail}</em>
      </p>
      <ReviewAction stepKey={item.stepKey} label={getActionLabel(item)} onNavigateToStep={onNavigateToStep} />
    </div>
  )
}

function ReviewFact({ label, value }) {
  return (
    <p className="attorney-review-fact">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </p>
  )
}

function getLogoSummary(branding) {
  if (branding.logoFileName) return branding.logoFileName
  if (branding.logoPath) return branding.logoPath.split('/').filter(Boolean).pop() || 'Uploaded logo'
  if (branding.logoUrl) return 'Uploaded logo'
  return 'Logo pending'
}

function getAddress(firmInformation = {}) {
  return [
    firmInformation.addressLine1,
    firmInformation.addressLine2,
    firmInformation.city,
    firmInformation.province,
    firmInformation.postalCode,
    firmInformation.country,
  ]
    .filter(Boolean)
    .join(', ')
}

function ReviewConfirmStep({ firmInformation, branding, activeDepartmentTypes, invites, activationDossier, onNavigateToStep }) {
  const [packetStatus, setPacketStatus] = useState('')
  const departmentList = activeDepartmentTypes.map((type) => DEPARTMENT_LABELS[type] || type)
  const logoSummary = getLogoSummary(branding)
  const address = getAddress(firmInformation)
  const dossier = activationDossier || {}
  const metrics = Array.isArray(dossier.metrics) ? dossier.metrics : []
  const requiredItems = Array.isArray(dossier.requiredItems) ? dossier.requiredItems : []
  const recommendedItems = Array.isArray(dossier.recommendedItems) ? dossier.recommendedItems : []
  const launchSurfaces = Array.isArray(dossier.launchSurfaces) ? dossier.launchSurfaces : []
  const readyGateCount = requiredItems.filter((item) => item.isReady).length
  const launchStatus = dossier.status === 'ready' ? 'Launch ready' : 'Needs attention'
  const nextAction = dossier.nextAction?.stepKey ? dossier.nextAction : null
  const launchPacket = dossier.launchPacket

  async function copyLaunchPacket() {
    if (!launchPacket?.text) return
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(launchPacket.text)
      setPacketStatus('Launch packet copied')
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setPacketStatus(''), 2400)
      }
    } catch {
      setPacketStatus('Copy unavailable')
    }
  }

  return (
    <div className="attorney-step-flow">
      <div className={`attorney-step-hero attorney-activation-hero is-${dossier.status || 'blocked'}`}>
        <div className="attorney-step-hero-copy">
          <span className="attorney-step-kicker">
            <Rocket size={14} aria-hidden="true" />
            Activation dossier
          </span>
          <h3>{dossier.headline || 'Confirm the workspace before it goes live.'}</h3>
          <p>{dossier.summary || 'Activation creates the firm, applies departments, stores the brand kit, and queues pending invitations.'}</p>
          <div className="attorney-dossier-hero-actions">
            {nextAction && onNavigateToStep ? (
              <button type="button" className="attorney-dossier-hero-action" onClick={() => onNavigateToStep(nextAction.stepKey)}>
                <ArrowRight size={15} aria-hidden="true" />
                {nextAction.actionLabel} {nextAction.label}
              </button>
            ) : null}
            {launchPacket?.text ? (
              <button type="button" className="attorney-dossier-copy-action" onClick={copyLaunchPacket}>
                <ClipboardCopy size={15} aria-hidden="true" />
                Copy launch packet
              </button>
            ) : null}
            {packetStatus ? <span className="attorney-dossier-copy-status">{packetStatus}</span> : null}
          </div>
        </div>
        <div className="attorney-review-ready-card">
          {dossier.status === 'ready' ? <CheckCircle2 size={24} aria-hidden="true" /> : <AlertCircle size={24} aria-hidden="true" />}
          <strong>{launchStatus}</strong>
          <span>{readyGateCount} / {requiredItems.length || 4} gates cleared</span>
        </div>
      </div>

      <div className="attorney-launch-metrics" aria-label="Activation metrics">
        {metrics.map((metric) => (
          <LaunchMetric key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="attorney-dossier-grid">
        <SummaryCard title="Required Gates" icon={ShieldCheck}>
          <div className="attorney-dossier-list">
            {requiredItems.map((item) => (
              <DossierItem key={item.key} item={item} onNavigateToStep={onNavigateToStep} />
            ))}
          </div>
        </SummaryCard>

        <SummaryCard title="Launch Surfaces" icon={Activity}>
          <div className="attorney-surface-list">
            {launchSurfaces.map((item) => (
              <SurfaceItem key={item.key} item={item} onNavigateToStep={onNavigateToStep} />
            ))}
          </div>
        </SummaryCard>
      </div>

      {recommendedItems.length ? (
        <div className="attorney-recommended-strip">
          <span>
            <Clock3 size={15} aria-hidden="true" />
            Finishing touch
          </span>
          {recommendedItems.map((item) => (
            <p key={item.key}>
              <strong>{item.label}</strong>
              <em>{item.description}</em>
              <ReviewAction stepKey={item.stepKey} label={getActionLabel(item)} onNavigateToStep={onNavigateToStep} />
            </p>
          ))}
        </div>
      ) : null}

      <div className="attorney-review-grid">
        <SummaryCard title="Firm Information" icon={Building2}>
          <ReviewFact label="Name" value={firmInformation.name} />
          <ReviewFact label="Email" value={firmInformation.email} />
          <ReviewFact label="Phone" value={firmInformation.phone} />
          <ReviewFact label="Website" value={firmInformation.website} />
          <ReviewFact label="Address" value={address} />
        </SummaryCard>

        <SummaryCard title="Brand Kit" icon={Palette}>
          <ReviewFact label="Logo" value={logoSummary} />
          <div className="attorney-review-swatch-row">
            <span style={{ background: branding.primaryColour || '#0f4c81' }} />
            <span style={{ background: branding.secondaryColour || '#1e2a44' }} />
            <p>
              <strong>{branding.primaryColour || '#0f4c81'}</strong>
              <em>{branding.secondaryColour || '#1e2a44'}</em>
            </p>
          </div>
        </SummaryCard>

        <SummaryCard title="Active Departments" icon={Scale}>
          {departmentList.length ? (
            <div className="attorney-review-chip-row">
              {departmentList.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          ) : (
            <p className="attorney-review-empty">No departments selected.</p>
          )}
        </SummaryCard>

        <SummaryCard title="Client-Facing Surfaces" icon={FileText}>
          <div className="attorney-review-surface-list">
            <span>
              <FileText size={14} aria-hidden="true" />
              Letterhead
            </span>
            <span>
              <Mail size={14} aria-hidden="true" />
              Email signature
            </span>
            <span>
              <ShieldCheck size={14} aria-hidden="true" />
              Client portal
            </span>
          </div>
        </SummaryCard>
      </div>

      <SummaryCard title="Team Invitations" icon={Users}>
        {invites.length ? (
          <div className="attorney-review-team-list">
            {invites.map((invite) => (
              <div key={invite.id}>
                <span>{String(invite.email || '?')[0].toUpperCase()}</span>
                <p>
                  <strong>{invite.email}</strong>
                  <em>{getAttorneyRoleLabel(invite.role)} - {DEPARTMENT_LABELS[invite.departmentType] || invite.departmentType}</em>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="attorney-review-empty">No invitations added during onboarding.</p>
        )}
      </SummaryCard>
    </div>
  )
}

export default ReviewConfirmStep
