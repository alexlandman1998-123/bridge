import { BellRing, MessageSquareText, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { EMAIL_TEMPLATE_KEYS, getDefaultEmailTemplateSettings, sanitizeEmailTemplateSettings } from '../../lib/emailTemplateSettings'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchEmailTemplateSettings, updateEmailTemplateSettings } from '../../lib/settingsApi'
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

export default function SettingsCommunicationsTemplatesPage() {
  const { role } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [membershipRole, setMembershipRole] = useState('viewer')
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
        setMembershipRole(normalizeOrganisationMembershipRole(response?.membershipRole))
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
  }, [])

  const canEdit = canManageOrganisationSettings({ appRole: role, membershipRole })
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
        description="Edit the Bridge-branded onboarding and seller handoff email copy used across the current communications sequence."
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">
          Read-only for your role. Only Principal-level administrators can edit communications templates.
        </SettingsBanner>
      ) : null}

      <SettingsSectionCard
        title="Template Library"
        description="Select a template, edit copy, and save. Layout/branding remains locked to the Bridge email design system."
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
