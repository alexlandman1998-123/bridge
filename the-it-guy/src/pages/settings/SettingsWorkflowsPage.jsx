import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchWorkflowSettings, updateWorkflowSettings } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  SettingsToggleRow,
  settingsActionRowClass,
  settingsPageClass,
} from './settingsUi'

export default function SettingsWorkflowsPage() {
  const { role } = useWorkspace()
  const canEdit = role === 'developer'
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const response = await fetchWorkflowSettings()
        if (active) {
          setForm(response)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
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

  function updateGroup(groupKey, fieldKey, value) {
    setForm((previous) => ({
      ...previous,
      [groupKey]: {
        ...previous[groupKey],
        [fieldKey]: value,
      },
    }))
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const response = await updateWorkflowSettings({
        onboardingRules: form.onboardingRules,
        documentRules: form.documentRules,
        workflowDefaults: form.workflowDefaults,
        automationSettings: form.automationSettings,
      })
      setForm(response)
      setMessage('Workflow settings saved.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return <SettingsLoadingState label="Loading workflow settings…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Workflows & Rules"
        title="Platform defaults and rule controls"
        description="Control onboarding, document rules, workflow defaults, and automation behavior."
      />

      {!canEdit ? <SettingsBanner tone="warning">Read-only for your role. Developer admins can edit workflow defaults.</SettingsBanner> : null}

      <form className="space-y-0" onSubmit={handleSave}>
        <SettingsSectionCard
          title="Onboarding Rules"
          description="Control which transaction structures are available in onboarding and how finance branching behaves."
        >
          <div>
            <SettingsToggleRow
              title="Enable employment type for bond / hybrid"
              description="Show the employment-type selector when finance includes bond processing."
              checked={form.onboardingRules.enableEmploymentTypeForBond}
              disabled={!canEdit}
              onChange={(value) => updateGroup('onboardingRules', 'enableEmploymentTypeForBond', value)}
            />
            <SettingsToggleRow
              title="Allow hybrid finance"
              description="Enable combination cash + bond transaction structures."
              checked={form.onboardingRules.allowHybridFinance}
              disabled={!canEdit}
              onChange={(value) => updateGroup('onboardingRules', 'allowHybridFinance', value)}
            />
            <SettingsToggleRow
              title="Allow trust onboarding"
              description="Allow trust-based purchaser structures in client onboarding."
              checked={form.onboardingRules.allowTrustOnboarding}
              disabled={!canEdit}
              onChange={(value) => updateGroup('onboardingRules', 'allowTrustOnboarding', value)}
            />
            <SettingsToggleRow
              title="Allow company onboarding"
              description="Allow company / Pty Ltd purchaser structures in client onboarding."
              checked={form.onboardingRules.allowCompanyOnboarding}
              disabled={!canEdit}
              onChange={(value) => updateGroup('onboardingRules', 'allowCompanyOnboarding', value)}
            />
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Document Rules" description="Define how document requirements are generated and controlled after onboarding.">
          <div>
            <SettingsToggleRow
              title="Auto-generate required documents"
              description="Create transaction-required document records as soon as onboarding is submitted."
              checked={form.documentRules.autoGenerateRequiredDocuments}
              disabled={!canEdit}
              onChange={(value) => updateGroup('documentRules', 'autoGenerateRequiredDocuments', value)}
            />
            <SettingsToggleRow
              title="Require document approval before next stage"
              description="Keep manual stage progression gated behind accepted documents where relevant."
              checked={form.documentRules.requireDocumentApprovalBeforeNextStage}
              disabled={!canEdit}
              onChange={(value) => updateGroup('documentRules', 'requireDocumentApprovalBeforeNextStage', value)}
            />
            <SettingsToggleRow
              title="Allow manual document overrides"
              description="Let internal users add or suppress required documents when a matter needs an exception."
              checked={form.documentRules.allowManualDocumentOverrides}
              disabled={!canEdit}
              onChange={(value) => updateGroup('documentRules', 'allowManualDocumentOverrides', value)}
            />
            <SettingsToggleRow
              title="Enable soft-required documents"
              description="Support recommended documents that guide users without blocking progression."
              checked={form.documentRules.enableSoftRequiredDocuments}
              disabled={!canEdit}
              onChange={(value) => updateGroup('documentRules', 'enableSoftRequiredDocuments', value)}
            />
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Workflow Defaults" description="Set which operational lanes Bridge should create and maintain by default.">
          <div>
            <SettingsToggleRow
              title="Finance workflow enabled by default"
              description="Create the finance lane when the transaction structure requires it."
              checked={form.workflowDefaults.financeWorkflowEnabled}
              disabled={!canEdit}
              onChange={(value) => updateGroup('workflowDefaults', 'financeWorkflowEnabled', value)}
            />
            <SettingsToggleRow
              title="Transfer workflow enabled by default"
              description="Create the legal transfer lane for all new transactions."
              checked={form.workflowDefaults.transferWorkflowEnabled}
              disabled={!canEdit}
              onChange={(value) => updateGroup('workflowDefaults', 'transferWorkflowEnabled', value)}
            />
            <SettingsToggleRow
              title="Close-out workflow enabled by default"
              description="Keep post-registration commercial close-out active after registration."
              checked={form.workflowDefaults.closeOutWorkflowEnabled}
              disabled={!canEdit}
              onChange={(value) => updateGroup('workflowDefaults', 'closeOutWorkflowEnabled', value)}
            />
            <SettingsToggleRow
              title="Handover workflow after registration"
              description="Enable handover and unit lifecycle tooling once registration is complete."
              checked={form.workflowDefaults.handoverWorkflowEnabledAfterRegistration}
              disabled={!canEdit}
              onChange={(value) => updateGroup('workflowDefaults', 'handoverWorkflowEnabledAfterRegistration', value)}
            />
            <SettingsToggleRow
              title="Auto-create unit after registration"
              description="Create or activate a unit workspace automatically when a transaction registers."
              checked={form.workflowDefaults.autoCreateUnitAfterRegistration}
              disabled={!canEdit}
              onChange={(value) => updateGroup('workflowDefaults', 'autoCreateUnitAfterRegistration', value)}
            />
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Status & Automation" description="Control which internal automations and state-locking rules run by default.">
          <div>
            <SettingsToggleRow
              title="Auto-notify on workflow stage change"
              description="Send internal notifications when workflow stage ownership changes."
              checked={form.automationSettings.autoNotifyOnWorkflowStageChange}
              disabled={!canEdit}
              onChange={(value) => updateGroup('automationSettings', 'autoNotifyOnWorkflowStageChange', value)}
            />
            <SettingsToggleRow
              title="Auto-create document requirements"
              description="Create document checklists as soon as the transaction structure is known."
              checked={form.automationSettings.autoCreateDocumentRequirements}
              disabled={!canEdit}
              onChange={(value) => updateGroup('automationSettings', 'autoCreateDocumentRequirements', value)}
            />
            <SettingsToggleRow
              title="Auto-lock onboarding after client submission"
              description="Prevent external client edits once the information sheet has been submitted."
              checked={form.automationSettings.autoLockOnboardingAfterClientSubmission}
              disabled={!canEdit}
              onChange={(value) => updateGroup('automationSettings', 'autoLockOnboardingAfterClientSubmission', value)}
            />
            <SettingsToggleRow
              title="Allow internal onboarding edits"
              description="Let internal users update onboarding answers after the client has submitted."
              checked={form.automationSettings.allowInternalOnboardingEdits}
              disabled={!canEdit}
              onChange={(value) => updateGroup('automationSettings', 'allowInternalOnboardingEdits', value)}
            />
          </div>
        </SettingsSectionCard>

        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

        {canEdit ? (
          <div className={settingsActionRowClass}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Workflow Settings'}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  )
}
