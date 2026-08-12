import { BellRing, CheckCircle2, Clock3, MailWarning, MessageSquareText, Route, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { EMAIL_TEMPLATE_KEYS, getDefaultEmailTemplateSettings, sanitizeEmailTemplateSettings } from '../../lib/emailTemplateSettings'
import { canManageOrganisationSettings, getWorkspaceAdministratorLabel, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchEmailTemplateSettings, updateEmailTemplateSettings } from '../../lib/settingsApi'
import {
  CLIENT_COMMUNICATION_EMAIL_POLICY,
  CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS,
  CLIENT_COMMUNICATION_TRIGGER_SOURCE,
  getClientCommunicationCoverageSummary,
  listClientCommunicationJourney,
  resolveClientCommunicationAutomationState,
} from '../../services/clientCommunicationJourneyCatalog'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsActionRowClass,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
  settingsPageClass,
} from './settingsUi'

function linesToTextarea(value = []) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function textareaToLines(value = '') {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const TEMPLATE_LABELS = {
  [EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING]: 'Client Onboarding',
  [EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING]: 'Seller Onboarding',
  [EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING_SUBMITTED]: 'Seller Onboarding Submitted',
}

const STATUS_LABELS = {
  [CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.EXISTING]: 'Existing',
  [CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.PARTIAL]: 'Partial',
  [CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.MISSING]: 'Missing',
  [CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.ACTIVITY_ONLY]: 'Activity only',
}

const STATUS_CLASSES = {
  [CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.EXISTING]: 'border-[#b8dbc8] bg-[#edf8f1] text-[#225f3b]',
  [CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.PARTIAL]: 'border-[#d8c795] bg-[#fff8df] text-[#715c17]',
  [CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.MISSING]: 'border-[#e5b8b8] bg-[#fff0f0] text-[#8a2d2d]',
  [CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.ACTIVITY_ONLY]: 'border-[#cbd8e6] bg-[#f3f7fb] text-[#465c74]',
}

const EMAIL_POLICY_LABELS = {
  [CLIENT_COMMUNICATION_EMAIL_POLICY.SEND_EMAIL]: 'Send email',
  [CLIENT_COMMUNICATION_EMAIL_POLICY.CONDITIONAL_EMAIL]: 'Conditional',
  [CLIENT_COMMUNICATION_EMAIL_POLICY.PORTAL_FIRST]: 'Portal first',
  [CLIENT_COMMUNICATION_EMAIL_POLICY.DO_NOT_EMAIL]: 'Do not email',
}

const TRIGGER_SOURCE_LABELS = {
  [CLIENT_COMMUNICATION_TRIGGER_SOURCE.DIRECT_WORKFLOW]: 'Direct workflow',
  [CLIENT_COMMUNICATION_TRIGGER_SOURCE.FRONTEND_SERVICE]: 'Frontend service',
  [CLIENT_COMMUNICATION_TRIGGER_SOURCE.EDGE_FUNCTION]: 'Edge function',
  [CLIENT_COMMUNICATION_TRIGGER_SOURCE.DATABASE_EVENT]: 'Database event',
  [CLIENT_COMMUNICATION_TRIGGER_SOURCE.MIXED]: 'Mixed',
  [CLIENT_COMMUNICATION_TRIGGER_SOURCE.NOT_WIRED]: 'Not wired',
}

function formatCatalogLabel(value = '') {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLASSES[status] || STATUS_CLASSES[CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.PARTIAL]}`}>
      {STATUS_LABELS[status] || formatCatalogLabel(status)}
    </span>
  )
}

function JourneyCoveragePanel() {
  const [audienceFilter, setAudienceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const journey = useMemo(() => listClientCommunicationJourney(), [])
  const visibleJourney = useMemo(() => listClientCommunicationJourney({
    audience: audienceFilter === 'all' ? '' : audienceFilter,
    status: statusFilter === 'all' ? '' : statusFilter,
  }), [audienceFilter, statusFilter])
  const coverage = useMemo(() => getClientCommunicationCoverageSummary(journey), [journey])
  const summaryItems = [
    {
      label: 'Existing',
      value: coverage.byStatus[CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.EXISTING] || 0,
      icon: CheckCircle2,
    },
    {
      label: 'Partial',
      value: coverage.byStatus[CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.PARTIAL] || 0,
      icon: Clock3,
    },
    {
      label: 'Missing',
      value: coverage.byStatus[CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.MISSING] || 0,
      icon: MailWarning,
    },
    {
      label: 'Activity only',
      value: coverage.byStatus[CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.ACTIVITY_ONLY] || 0,
      icon: MessageSquareText,
    },
  ]

  return (
    <SettingsSectionCard
      title="Client Journey Coverage"
      description="Canonical buyer and seller communications mapped against the current notification automation and email handlers."
    >
      <div className="grid gap-3 md:grid-cols-4">
        {summaryItems.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-[8px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">{item.label}</p>
                <Icon size={16} className="text-[#60758d]" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-[#132338]">{item.value}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className={settingsFieldClass}>
          Audience
          <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)}>
            <option value="all">All audiences</option>
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="buyer_seller">Buyer + Seller</option>
            <option value="internal">Internal / Activity Only</option>
          </select>
        </label>
        <label className={settingsFieldClass}>
          Coverage
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 overflow-hidden rounded-[8px] border border-[#e1e9f2]">
        <div className="hidden gap-3 border-b border-[#e1e9f2] bg-[#f6f9fc] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d] md:grid md:grid-cols-[1.1fr_0.75fr_1fr_0.8fr]">
          <span>Communication</span>
          <span>Policy</span>
          <span>Source & CTA</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-[#edf2f7]">
          {visibleJourney.map((entry) => {
            const automationState = resolveClientCommunicationAutomationState(entry)
            return (
              <div key={entry.key} className="grid gap-3 px-4 py-4 text-sm text-[#344b63] md:grid-cols-[1.1fr_0.75fr_1fr_0.8fr]">
                <div>
                  <div className="flex items-center gap-2">
                    <Route size={15} className="shrink-0 text-[#60758d]" />
                    <p className="font-semibold text-[#14243a]">{entry.label}</p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#60758d]">
                    {entry.journey}
                    {automationState.automationKey ? ` · ${automationState.automationKey}` : ''}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#60758d]">{entry.notes}</p>
                </div>
                <div className="space-y-2 text-xs leading-5 text-[#60758d]">
                  <p><span className="font-semibold text-[#40566d]">Audience:</span> {formatCatalogLabel(entry.audience)}</p>
                  <p><span className="font-semibold text-[#40566d]">Category:</span> {formatCatalogLabel(entry.category)}</p>
                  <p><span className="font-semibold text-[#40566d]">Email:</span> {EMAIL_POLICY_LABELS[entry.emailPolicy] || formatCatalogLabel(entry.emailPolicy)}</p>
                </div>
                <div className="space-y-2 text-xs leading-5 text-[#60758d]">
                  <p><span className="font-semibold text-[#40566d]">Trigger:</span> {entry.trigger}</p>
                  <p><span className="font-semibold text-[#40566d]">Source:</span> {TRIGGER_SOURCE_LABELS[entry.triggerSource] || formatCatalogLabel(entry.triggerSource)}</p>
                  <p><span className="font-semibold text-[#40566d]">CTA:</span> {entry.ctaDestination}</p>
                  {entry.sourceFiles?.length ? (
                    <p><span className="font-semibold text-[#40566d]">Files:</span> {entry.sourceFiles.slice(0, 2).join(', ')}{entry.sourceFiles.length > 2 ? ` +${entry.sourceFiles.length - 2}` : ''}</p>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <StatusBadge status={entry.status} />
                  <p className="text-xs leading-5 text-[#60758d]"><span className="font-semibold text-[#40566d]">Risk:</span> {entry.duplicateRisk}</p>
                  <p className="text-xs leading-5 text-[#60758d]"><span className="font-semibold text-[#40566d]">Next:</span> {entry.nextAction}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </SettingsSectionCard>
  )
}

export default function SettingsCommunicationsTemplatesPage() {
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [membershipRole, setMembershipRole] = useState('viewer')
  const administratorLabel = getWorkspaceAdministratorLabel({ appRole: role, workspaceType: resolvedWorkspaceType })
  const [templates, setTemplates] = useState(getDefaultEmailTemplateSettings())
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError('')
        const response = await fetchEmailTemplateSettings()
        if (!active) return
        setMembershipRole(normalizeOrganisationMembershipRole(response?.membershipRole, {
          appRole: role,
          workspaceType: response?.organisation?.type || resolvedWorkspaceType,
        }))
        setTemplates(sanitizeEmailTemplateSettings(response?.templates || {}))
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Unable to load communications templates.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [role, resolvedWorkspaceType])

  const canEdit = canManageOrganisationSettings({ appRole: role, membershipRole, workspaceType: resolvedWorkspaceType })
  const selectedTemplate = templates[selectedTemplateKey] || getDefaultEmailTemplateSettings()[selectedTemplateKey]

  const templateOptions = useMemo(
    () => [
      EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING,
      EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING,
      EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING_SUBMITTED,
    ],
    [],
  )

  function updateSelectedTemplateField(field, value) {
    setTemplates((previous) => ({
      ...previous,
      [selectedTemplateKey]: {
        ...(previous?.[selectedTemplateKey] || {}),
        [field]: value,
      },
    }))
  }

  async function handleSave(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const payload = sanitizeEmailTemplateSettings(templates)
      const response = await updateEmailTemplateSettings(payload)
      setTemplates(sanitizeEmailTemplateSettings(response?.templates || payload))
      setMessage('Communications templates saved.')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save communications templates.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading communications templates…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Communications Templates"
        description="Edit the Arch9-branded onboarding and seller handoff email copy used across the current communications sequence."
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">
          Read-only for your role. Only {administratorLabel} can edit communications templates.
        </SettingsBanner>
      ) : null}

      <JourneyCoveragePanel />

      <SettingsSectionCard
        title="Template Library"
        description="Select a template, edit copy, and save. Layout/branding remains locked to the Arch9 email design system."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {templateOptions.map((templateKey) => {
            const active = templateKey === selectedTemplateKey
            return (
              <button
                key={templateKey}
                type="button"
                onClick={() => setSelectedTemplateKey(templateKey)}
                className={[
                  'flex h-full min-h-[92px] flex-col rounded-[14px] border p-4 text-left transition duration-150 ease-out',
                  active
                    ? 'border-[#c8d7e6] bg-[#edf3f8] text-[#162334]'
                    : 'border-[#e2eaf3] bg-[#fbfdff] text-[#4f637a] hover:border-[#cfdbe8] hover:bg-white',
                ].join(' ')}
              >
                <div className="flex h-full items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{TEMPLATE_LABELS[templateKey]}</p>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      {templateKey === EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING
                        ? 'Buyer/client onboarding introduction email.'
                        : 'Seller onboarding introduction email.'}
                    </p>
                  </div>
                  {templateKey === EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING ? (
                    <MessageSquareText size={16} />
                  ) : templateKey === EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING ? (
                    <Send size={16} />
                  ) : (
                    <BellRing size={16} />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </SettingsSectionCard>

      <form onSubmit={handleSave}>
        <SettingsSectionCard
          title={TEMPLATE_LABELS[selectedTemplateKey] || 'Template'}
          description="Copy-only controls. Dynamic fields (name/property/link) are still injected automatically at send time."
        >
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              Subject
              <input
                type="text"
                value={selectedTemplate.subject || ''}
                disabled={!canEdit}
                onChange={(event) => updateSelectedTemplateField('subject', event.target.value)}
              />
            </label>
            <label className={settingsFieldClass}>
              CTA Label
              <input
                type="text"
                value={selectedTemplate.ctaLabel || ''}
                disabled={!canEdit}
                onChange={(event) => updateSelectedTemplateField('ctaLabel', event.target.value)}
              />
            </label>
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              Intro Paragraphs (one per line)
              <textarea
                rows={4}
                value={linesToTextarea(selectedTemplate.introParagraphs)}
                disabled={!canEdit}
                onChange={(event) => updateSelectedTemplateField('introParagraphs', textareaToLines(event.target.value))}
              />
            </label>
            {selectedTemplateKey === EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING ? (
              <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                Capability Bullets (one per line)
                <textarea
                  rows={4}
                  value={linesToTextarea(selectedTemplate.capabilityBullets)}
                  disabled={!canEdit}
                  onChange={(event) => updateSelectedTemplateField('capabilityBullets', textareaToLines(event.target.value))}
                />
              </label>
            ) : null}
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              Process Steps (one per line)
              <textarea
                rows={5}
                value={linesToTextarea(selectedTemplate.processSteps)}
                disabled={!canEdit}
                onChange={(event) => updateSelectedTemplateField('processSteps', textareaToLines(event.target.value))}
              />
            </label>
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              Security Copy
              <textarea
                rows={3}
                value={selectedTemplate.securityBody || ''}
                disabled={!canEdit}
                onChange={(event) => updateSelectedTemplateField('securityBody', event.target.value)}
              />
            </label>
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              Help Footer Copy
              <textarea
                rows={3}
                value={selectedTemplate.helpBody || ''}
                disabled={!canEdit}
                onChange={(event) => updateSelectedTemplateField('helpBody', event.target.value)}
              />
            </label>
          </div>

          {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
          {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

          <div className={settingsActionRowClass}>
            <button type="submit" className="auth-primary-cta" disabled={!canEdit || saving}>
              {saving ? 'Saving…' : 'Save Template Settings'}
            </button>
          </div>
        </SettingsSectionCard>
      </form>
    </div>
  )
}
