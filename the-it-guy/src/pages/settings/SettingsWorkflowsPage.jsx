import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchDocumentLabelMappingReport, fetchWorkflowSettings, updateWorkflowSettings } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  SettingsToggleRow,
  settingsActionRowClass,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'

export default function SettingsWorkflowsPage() {
  const { role } = useWorkspace()
  const canEdit = role === 'developer'
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [mappingReport, setMappingReport] = useState(null)
  const [mappingLoading, setMappingLoading] = useState(true)
  const [mappingError, setMappingError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setMappingLoading(true)
        setMappingError('')
        const [workflowResponse, mappingResponse] = await Promise.all([
          fetchWorkflowSettings(),
          fetchDocumentLabelMappingReport(),
        ])
        if (active) {
          setForm(workflowResponse)
          setMappingReport(mappingResponse)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
          setMappingError(loadError.message)
        }
      } finally {
        if (active) {
          setLoading(false)
          setMappingLoading(false)
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

  async function handleRefreshMappingReport() {
    try {
      setMappingLoading(true)
      setMappingError('')
      const nextReport = await fetchDocumentLabelMappingReport()
      setMappingReport(nextReport)
    } catch (refreshError) {
      setMappingError(refreshError.message)
    } finally {
      setMappingLoading(false)
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

        <SettingsSectionCard
          title="Document Mapping Audit"
          description="Lightweight report of legacy labels that still rely on inferred workspace mapping."
          actions={(
            <Button type="button" variant="ghost" onClick={() => void handleRefreshMappingReport()} disabled={mappingLoading}>
              {mappingLoading ? 'Refreshing…' : 'Refresh report'}
            </Button>
          )}
        >
          {mappingLoading ? <SettingsLoadingState label="Scanning document metadata…" compact /> : null}

          {!mappingLoading && mappingError ? <SettingsBanner tone="warning">{mappingError}</SettingsBanner> : null}

          {!mappingLoading && !mappingError && mappingReport ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <article className="rounded-[14px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-3">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Shared scanned</span>
                  <strong className="mt-2 block text-lg font-semibold text-[#162334]">{mappingReport.scanned?.sharedDocuments || 0}</strong>
                </article>
                <article className="rounded-[14px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-3">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Required scanned</span>
                  <strong className="mt-2 block text-lg font-semibold text-[#162334]">{mappingReport.scanned?.requiredDocuments || 0}</strong>
                </article>
                <article className="rounded-[14px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-3">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Needs review</span>
                  <strong className="mt-2 block text-lg font-semibold text-[#162334]">{mappingReport.totals?.needsReview || 0}</strong>
                </article>
              </div>

              {!mappingReport.rows?.length ? (
                <div className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-5 py-6 text-sm text-[#6b7d93]">
                  No unmapped or ambiguous labels were detected in the latest scan.
                </div>
              ) : (
                <div className={settingsTableClass}>
                  <div className="hidden grid-cols-[1.5fr_0.9fr_1.4fr_0.9fr_0.8fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] md:grid">
                    <span>Label</span>
                    <span>Scope</span>
                    <span>Reason</span>
                    <span>Bucket</span>
                    <span>Count</span>
                  </div>
                  <div className="divide-y divide-[#e9eff5]">
                    {mappingReport.rows.slice(0, 20).map((row) => (
                      <div key={`${row.scope}-${row.label}-${row.reason}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1.5fr_0.9fr_1.4fr_0.9fr_0.8fr] md:items-center md:gap-4">
                        <div className="space-y-1">
                          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Label</span>
                          <strong className="text-sm text-[#162334]">{row.label}</strong>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Scope</span>
                          <span className="text-sm capitalize text-[#51657b]">{row.scope.replaceAll('_', ' ')}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Reason</span>
                          <span className="text-sm text-[#51657b]">{row.reason}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Bucket</span>
                          <span className="text-sm capitalize text-[#51657b]">{row.workspaceCategory}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Count</span>
                          <span className="text-sm font-semibold text-[#162334]">{row.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
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
