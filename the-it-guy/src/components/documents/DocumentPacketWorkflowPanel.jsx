import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../ui/Button'
import SigningOperationalStatusCard from './SigningOperationalStatusCard'
import SigningProgressTimeline from './SigningProgressTimeline'
import { useWorkspace } from '../../context/WorkspaceContext'
import { isOrganisationAdminMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings } from '../../lib/settingsApi'
import {
  archivePacket,
  generateFinalSignedPacketDocument,
  generatePacketVersion,
  generateSigningLinks,
  getDocumentConversionHealthStatus,
  getPacketSigningSummary,
  listPacketVersions,
  prepareSigningFields,
  renderPacketPreview,
  resetSigningFields,
  savePacketDraft,
} from '../../core/documents/packetService'
import { resolveLegalDocumentGenerationRecovery } from '../../core/documents/legalDocumentGenerationRecovery'
import { captureLegalDocumentGenerationBaseline, findReconciledLegalDocumentVersion, reconcileLegalDocumentGenerationFailure } from '../../core/documents/legalDocumentGenerationReconciliation'
import { resolveLegalDocumentRetryPolicy } from '../../core/documents/legalDocumentGenerationRetryPolicy'
import { recordLegalDocumentGenerationSupportHandoff } from '../../core/documents/legalDocumentGenerationSupportHandoff'
import { resolveSigningOperationalStatus } from '../../core/documents/signingOperationalStatus'
import { appendDocumentPacketEvent, getFinalDocumentCompletionStatus } from '../../lib/documentPacketsApi'

function normalizeText(value) {
  return String(value || '').trim()
}

function resolvePacketErrorFeedback(error = null) {
  const code = normalizeText(error?.code)
  if (code === 'VALIDATION_BLOCKED') {
    const legalScenarioMissing = Array.isArray(error?.validation?.legalDocumentMissingRoutingFacts)
      ? error.validation.legalDocumentMissingRoutingFacts
      : []
    if (legalScenarioMissing.length) {
      return {
        label: 'Legal setup incomplete',
        message: `Confirm ${legalScenarioMissing.map((field) => String(field).replace(/_/g, ' ')).join(', ')} before generating the document.`,
      }
    }
    const packMissing = Array.isArray(error?.validation?.conditionalPackMissingPlaceholders)
      ? error.validation.conditionalPackMissingPlaceholders
      : []
    if (packMissing.length) {
      const grouped = groupConditionalPackIssues(packMissing)
      const summary = grouped
        .slice(0, 3)
        .map((group) => `${group.label}: ${group.fields.slice(0, 3).join(', ')}`)
        .join('; ')
      return {
        label: 'Conditional pack data missing',
        message: summary
          ? `Complete the active clause pack fields before generating: ${summary}.`
          : 'Complete the active conditional clause pack fields before generating the document.',
      }
    }
    return {
      label: 'Validation blocked',
      message: 'Fix the critical missing fields before generating the document.',
    }
  }
  if (code === 'MISSING_TEMPLATE_FILE') {
    return {
      label: 'Template unavailable',
      message: 'The selected template could not be rendered. Check the active template configuration and try again.',
    }
  }
  if (code === 'NATIVE_TEMPLATE_NOT_RENDERABLE') {
    return {
      label: 'Template not renderable',
      message: 'The active native template is missing required sections or merge fields. Finish the template setup and try again.',
    }
  }
  if (code === 'HTML_RENDER_FAILED' || code === 'PDF_RENDER_FAILED') {
    return {
      label: 'Renderer failed',
      message: 'Arch9 could not assemble the final PDF from the native template. Please retry.',
    }
  }
  if (code === 'STORAGE_UPLOAD_FAILED') {
    return {
      label: 'Storage upload failed',
      message: 'Arch9 generated the document but could not save it to storage. Please retry.',
    }
  }
  if (code === 'MISSING_RENDERED_FILE_PATH' || code === 'MISSING_RENDERED_FILE_REFERENCE') {
    return {
      label: 'Generation failed',
      message: 'Generation finished without a valid file reference. Packet was not marked generated.',
    }
  }
  if (code === 'MISSING_DOCUMENT_RECORD') {
    return {
      label: 'Generation failed',
      message: 'A document record was not created for this version. Packet was not marked generated.',
    }
  }
  if (code === 'DOCX_RENDER_FAILED') {
    return {
      label: 'Template render failed',
      message: 'The template contains unresolved tags or missing placeholder mappings.',
    }
  }
  if (code === 'NO_GENERATED_VERSION' || code === 'NO_SIGNING_VERSION') {
    return {
      label: 'Generate packet first',
      message: 'A generated packet version is required before signing fields can be prepared.',
    }
  }
  if (code === 'NO_SIGNING_FIELDS') {
    return {
      label: 'Signing seed unavailable',
      message: 'Arch9 could not create default signing fields from current packet data.',
    }
  }
  if (code === 'SIGNING_ALREADY_PROGRESSING') {
    return {
      label: 'Reset blocked',
      message: 'Reset is not allowed because signing has already progressed for this packet.',
    }
  }
  if (code === 'SIGNERS_INCOMPLETE') {
    return {
      label: 'Signers incomplete',
      message: 'All required signers must complete signing before finalisation.',
    }
  }
  if (code === 'FIELDS_INCOMPLETE') {
    return {
      label: 'Fields incomplete',
      message: 'Required signing fields are still incomplete. Complete them before finalisation.',
    }
  }
  if (code === 'MISSING_SIGNATURE_ASSETS') {
    return {
      label: 'Missing signature assets',
      message: 'One or more required signature assets are missing. Re-apply signer fields and retry.',
    }
  }
  if (code === 'MISSING_RENDERED_ARTIFACT') {
    return {
      label: 'Generated file missing',
      message: 'No generated source artifact was found for this packet version.',
    }
  }
  if (code === 'FINAL_SIGNED_UPLOAD_FAILED') {
    return {
      label: 'Final upload failed',
      message: 'Arch9 could not store the final signed artifact. Please retry.',
    }
  }

  const rawMessage = normalizeText(error?.message).toLowerCase()
  if (rawMessage.includes('no signers found')) {
    return {
      label: 'Prepare signing fields first',
      message: 'No signers were found for this packet version. Prepare signing fields before generating links.',
    }
  }
  if (rawMessage.includes('no generated packet version')) {
    return {
      label: 'Generate packet first',
      message: 'A generated packet version is required before generating signing links.',
    }
  }

  return {
    label: 'Generation failed',
    message: normalizeText(error?.message) || 'Packet generation failed. Please retry.',
  }
}

function groupConditionalPackIssues(issues = []) {
  const groups = new Map()
  for (const issue of issues || []) {
    const key = normalizeText(issue?.packKey || issue?.sectionKey || issue?.source || 'conditional_pack')
    const label = normalizeText(issue?.packLabel || issue?.sectionLabel || 'Conditional clause pack')
    const fieldLabel = normalizeText(issue?.placeholderLabel || issue?.placeholderKey || issue?.message)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        fields: [],
      })
    }
    if (fieldLabel && !groups.get(key).fields.includes(fieldLabel)) {
      groups.get(key).fields.push(fieldLabel)
    }
  }
  return Array.from(groups.values())
}

function getConditionalPackIssueCount(pack = {}, groupedMissing = []) {
  const keys = [
    normalizeText(pack?.key),
    normalizeText(pack?.packKey),
    ...(Array.isArray(pack?.sectionKeys) ? pack.sectionKeys.map((item) => normalizeText(item)) : []),
  ].filter(Boolean)
  const keySet = new Set(keys)
  return groupedMissing
    .filter((group) => keySet.has(normalizeText(group.key)))
    .reduce((count, group) => count + group.fields.length, 0)
}

function getConditionalPackAuditMissingFields(pack = {}) {
  const missingPlaceholders = Array.isArray(pack?.missingPlaceholders) ? pack.missingPlaceholders : []
  const requiredMergeFields = Array.isArray(pack?.requiredMergeFields) ? pack.requiredMergeFields : []
  const labels = [
    ...missingPlaceholders.map((issue) => normalizeText(issue?.placeholderLabel || issue?.placeholderKey)),
    ...requiredMergeFields
      .filter((field) => field?.missing)
      .map((field) => normalizeText(field?.label || field?.key)),
  ].filter(Boolean)
  return Array.from(new Set(labels))
}

function getConditionalPackAuditRequiredFields(pack = {}) {
  const requiredMergeFields = Array.isArray(pack?.requiredMergeFields) ? pack.requiredMergeFields : []
  return requiredMergeFields
    .map((field) => normalizeText(field?.label || field?.key))
    .filter(Boolean)
}

function buildConditionalPackAuditSignalRows(signals = {}) {
  return Object.entries(signals || {})
    .map(([key, value]) => ({
      key,
      label: key
        .replace(/([A-Z])/g, ' $1')
        .replace(/\s+/g, ' ')
        .replace(/^./, (character) => character.toUpperCase()),
      value: normalizeText(value),
    }))
    .filter((row) => row.value)
}

function resolveVersionStatus(version = {}) {
  const renderStatus = normalizeText(version?.render_status).toLowerCase()
  if (renderStatus === 'generated') return 'document generated'
  if (renderStatus === 'failed') return 'generation failed'
  if (renderStatus === 'draft') return 'draft'
  return renderStatus || 'unknown'
}

function resolveTemplateId(templates = [], templateId = '') {
  const normalizedTemplateId = normalizeText(templateId)
  if (normalizedTemplateId && templates.some((item) => String(item?.id || '') === normalizedTemplateId)) {
    return normalizedTemplateId
  }
  return templates[0]?.id || ''
}

function ValidationSummary({ validation = null, showAuditDetails = false }) {
  const critical = validation?.critical || []
  const warnings = validation?.warnings || []
  const conditionalPackDataRequirements = Array.isArray(validation?.conditionalPackDataRequirements)
    ? validation.conditionalPackDataRequirements
    : []
  const conditionalPackMissingPlaceholders = Array.isArray(validation?.conditionalPackMissingPlaceholders)
    ? validation.conditionalPackMissingPlaceholders
    : []
  const conditionalPackAudit = validation?.conditionalPackAudit && typeof validation.conditionalPackAudit === 'object'
    ? validation.conditionalPackAudit
    : null
  const activePackAudits = Array.isArray(conditionalPackAudit?.activePacks)
    ? conditionalPackAudit.activePacks
    : []
  const inactivePackAudits = Array.isArray(conditionalPackAudit?.inactivePacks)
    ? conditionalPackAudit.inactivePacks
    : []
  const conditionalPackRows = activePackAudits.length ? activePackAudits : conditionalPackDataRequirements
  const auditSignalRows = buildConditionalPackAuditSignalRows(conditionalPackAudit?.activationSignals)
  const auditDocumentTriggers = Array.isArray(conditionalPackAudit?.documentTriggers)
    ? conditionalPackAudit.documentTriggers
    : []
  const groupedConditionalMissing = groupConditionalPackIssues(conditionalPackMissingPlaceholders)

  return (
    <section className="rounded-[14px] border border-[#dfe8f2] bg-white p-3.5">
      <h4 className="text-sm font-semibold text-[#142132]">Validation Summary</h4>
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 ${critical.length ? 'border-[#f3d1ce] bg-[#fff4f3] text-[#b42318]' : 'border-[#d7e9dd] bg-[#eefaf1] text-[#1c7d45]'}`}>
          Critical: {critical.length}
        </span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 ${warnings.length ? 'border-[#f4e2bf] bg-[#fff8ec] text-[#9a640f]' : 'border-[#d7e9dd] bg-[#eefaf1] text-[#1c7d45]'}`}>
          Warnings: {warnings.length}
        </span>
        {conditionalPackRows.length ? (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 ${conditionalPackMissingPlaceholders.length ? 'border-[#f3d1ce] bg-[#fff4f3] text-[#b42318]' : 'border-[#d7e9dd] bg-[#eefaf1] text-[#1c7d45]'}`}>
            Active packs: {conditionalPackRows.length}
          </span>
        ) : null}
      </div>
      {conditionalPackRows.length ? (
        <div className="mt-3 rounded-[12px] border border-[#e1eaf4] bg-[#fbfdff] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6e8399]">Active Conditional Packs</p>
            <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
              conditionalPackMissingPlaceholders.length
                ? 'border-[#f3d1ce] bg-[#fff4f3] text-[#b42318]'
                : 'border-[#d7e9dd] bg-[#eefaf1] text-[#1c7d45]'
            }`}>
              {conditionalPackMissingPlaceholders.length ? `${conditionalPackMissingPlaceholders.length} missing` : 'Ready'}
            </span>
          </div>
          <div className="mt-2 grid gap-2">
            {conditionalPackRows.map((pack) => {
              const auditMissingFields = getConditionalPackAuditMissingFields(pack)
              const missingCount = activePackAudits.length
                ? auditMissingFields.length
                : getConditionalPackIssueCount(pack, groupedConditionalMissing)
              const requiredFields = getConditionalPackAuditRequiredFields(pack)
              return (
                <article key={pack.key || pack.packKey} className={`rounded-[10px] border px-2.5 py-2 text-xs ${
                  missingCount
                    ? 'border-[#f3d1ce] bg-[#fff8f7] text-[#8e1f15]'
                    : 'border-[#d7e9dd] bg-white text-[#1c7d45]'
                }`}>
                  <p className="font-semibold">{pack.label || pack.key}</p>
                  <p className="mt-0.5">
                    {missingCount ? `${missingCount} required field${missingCount === 1 ? '' : 's'} missing` : 'Required pack data is present'}
                  </p>
                  {showAuditDetails && normalizeText(pack.reason) ? (
                    <p className="mt-1 text-[0.68rem] text-[#607387]">{pack.reason}</p>
                  ) : null}
                  {showAuditDetails && requiredFields.length ? (
                    <p className="mt-1 text-[0.68rem] text-[#607387]">
                      Fields: {requiredFields.slice(0, 6).join(', ')}
                    </p>
                  ) : null}
                </article>
              )
            })}
          </div>
          {groupedConditionalMissing.length ? (
            <div className="mt-3 space-y-2 border-t border-[#e6eef7] pt-3">
              {groupedConditionalMissing.map((group) => (
                <div key={`conditional-pack-missing-${group.key}`} className="rounded-[10px] border border-[#f3d1ce] bg-white px-2.5 py-2 text-xs text-[#8e1f15]">
                  <p className="font-semibold">{group.label}</p>
                  <p className="mt-0.5">{group.fields.join(', ')}</p>
                </div>
              ))}
            </div>
          ) : null}
          {showAuditDetails && conditionalPackAudit ? (
            <details className="mt-3 border-t border-[#e6eef7] pt-3 text-xs text-[#607387]">
              <summary className="cursor-pointer font-semibold text-[#2f455c]">Clause Pack Trace</summary>
              <div className="mt-2 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 font-semibold text-[#2f455c]">
                    Ready: {conditionalPackAudit?.summary?.readyPackCount || 0}
                  </span>
                  <span className="rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 font-semibold text-[#2f455c]">
                    Blocked: {conditionalPackAudit?.summary?.blockedPackCount || 0}
                  </span>
                  <span className="rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 font-semibold text-[#2f455c]">
                    Inactive: {inactivePackAudits.length}
                  </span>
                </div>
                {auditSignalRows.length ? (
                  <div>
                    <p className="font-semibold text-[#2f455c]">Activation signals</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {auditSignalRows.map((signal) => (
                        <span key={signal.key} className="rounded-full border border-[#dce6f2] bg-white px-2 py-1 text-[0.68rem]">
                          {signal.label}: {signal.value}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {auditDocumentTriggers.length ? (
                  <div>
                    <p className="font-semibold text-[#2f455c]">Document triggers</p>
                    <p className="mt-1 text-[0.68rem]">{auditDocumentTriggers.slice(0, 10).join(', ')}</p>
                  </div>
                ) : null}
                {inactivePackAudits.length ? (
                  <div>
                    <p className="font-semibold text-[#2f455c]">Inactive packs</p>
                    <div className="mt-1 space-y-1">
                      {inactivePackAudits.slice(0, 6).map((pack) => (
                        <p key={`inactive-pack-${pack.key}`} className="text-[0.68rem]">
                          <span className="font-semibold">{pack.label || pack.key}:</span> {pack.reason || 'No matching activation signal.'}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {critical.map((item) => (
          <p key={`critical-${item.placeholderKey || item.message}`} className="rounded-[10px] border border-[#f3d1ce] bg-[#fff4f3] px-2.5 py-2 text-xs text-[#8e1f15]">
            {item.message}
          </p>
        ))}
        {warnings.map((item) => (
          <p key={`warning-${item.placeholderKey || item.message}`} className="rounded-[10px] border border-[#f4e2bf] bg-[#fff8ec] px-2.5 py-2 text-xs text-[#7d520d]">
            {item.message}
          </p>
        ))}
        {!critical.length && !warnings.length ? (
          <p className="rounded-[10px] border border-[#d7e9dd] bg-[#eefaf1] px-2.5 py-2 text-xs text-[#1c7d45]">
            Packet looks complete and ready for generation.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function VersionList({ versions = [] }) {
  if (!versions.length) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#d8e2ee] bg-white px-3 py-3 text-xs text-[#6b7d93]">
        No generated versions yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {versions.map((version) => (
        <article key={version.id} className="rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2.5 text-xs">
          <p className="font-semibold text-[#142132]">Version {version.version_number}</p>
          <p className="mt-0.5 text-[#607387]">Status: {resolveVersionStatus(version)}</p>
          <p className="mt-0.5 text-[#607387]">Generated: {version.generated_at ? new Date(version.generated_at).toLocaleString('en-ZA') : '—'}</p>
          {version?.finalised_at ? (
            <p className="mt-0.5 text-[#1c7d45]">
              Final signed: {new Date(version.finalised_at).toLocaleString('en-ZA')}
            </p>
          ) : null}
          {normalizeText(version?.final_signed_file_access_url || version?.final_signed_file_url) ? (
            <a
              href={version.final_signed_file_access_url || version.final_signed_file_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex text-[0.68rem] font-semibold text-[#2f5d87] hover:underline"
            >
              View Final Signed Document
            </a>
          ) : null}
          {normalizeText(version?.validation_summary_json?.failureMessage) ? (
            <p className="mt-1 rounded-[8px] border border-[#f3d1ce] bg-[#fff4f3] px-2 py-1 text-[0.68rem] text-[#8e1f15]">
              {version.validation_summary_json.failureMessage}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function SigningFieldsSummary({ summary = null, canManage = false, busy = false, onSignerAction = null }) {
  const grouped = Array.isArray(summary?.groupedBySigner) ? summary.groupedBySigner : []
  if (!summary || (!summary.signerCount && !summary.fieldCount)) {
    return (
      <section className="rounded-[14px] border border-[#dfe8f2] bg-white p-3.5">
        <h4 className="text-sm font-semibold text-[#142132]">Signing Fields Preview</h4>
        <p className="mt-2 text-xs text-[#607387]">No signing fields configured yet for this packet.</p>
      </section>
    )
  }

  return (
    <section className="rounded-[14px] border border-[#dfe8f2] bg-white p-3.5">
      <h4 className="text-sm font-semibold text-[#142132]">Signing Fields Preview</h4>
      <div className="mt-2 grid gap-2 text-xs text-[#607387] sm:grid-cols-2">
        <p>Signers: <span className="font-semibold text-[#142132]">{summary.signerCount || 0}</span></p>
        <p>Fields: <span className="font-semibold text-[#142132]">{summary.fieldCount || 0}</span></p>
        <p>Required Initials: <span className="font-semibold text-[#142132]">{summary.requiredInitials || 0}</span></p>
        <p>Required Signatures: <span className="font-semibold text-[#142132]">{summary.requiredSignatures || 0}</span></p>
        <p>Required Complete: <span className="font-semibold text-[#142132]">{summary.completedRequiredFieldCount || 0}/{summary.requiredFieldCount || 0}</span></p>
        <p>All Signers Complete: <span className={`font-semibold ${summary.allSignersSigned ? 'text-[#1c7d45]' : 'text-[#8e1f15]'}`}>{summary.allSignersSigned ? 'Yes' : 'No'}</span></p>
      </div>
      <div className="mt-3 space-y-2">
        {grouped.map((group) => (
          <article key={group.signerRole} className="rounded-[10px] border border-[#dce6f2] bg-[#fbfdff] px-2.5 py-2 text-xs">
            <p className="font-semibold text-[#142132]">{group.signerRole.replace(/_/g, ' ')}</p>
            <p className="mt-0.5 text-[#607387]">
              {group.total} total • {group.initials} initials • {group.signatures} signatures • {group.dates} dates • {group.texts} text
            </p>
          </article>
        ))}
      </div>
      {summary?.signers?.length ? <div className="mt-3"><SigningProgressTimeline signers={summary.signers} canManage={canManage} canRemind={false} busy={busy} onSignerAction={onSignerAction} compact /></div> : null}
    </section>
  )
}

export default function DocumentPacketWorkflowPanel({
  packetType = 'otp',
  heading = '',
  context = {},
  templates = [],
  packetId = '',
  onPacketIdChange = null,
  onPacketGenerated = null,
  className = '',
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(resolveTemplateId(templates))
  const [previewState, setPreviewState] = useState(null)
  const [packetState, setPacketState] = useState(null)
  const [versions, setVersions] = useState([])
  const [showVersions, setShowVersions] = useState(false)
  const [loadingAction, setLoadingAction] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [statusLabel, setStatusLabel] = useState('')
  const [generationRecovery, setGenerationRecovery] = useState(null)
  const generationFailureCountsRef = useRef(new Map())
  const recordedGenerationHandoffsRef = useRef(new Set())
  const [signingSummary, setSigningSummary] = useState(null)
  const [canManagePacketAdminActions, setCanManagePacketAdminActions] = useState(false)
  const [conversionHealth, setConversionHealth] = useState(null)
  const [finalCompletion, setFinalCompletion] = useState(null)
  const { role } = useWorkspace()
  const selectedTemplate = useMemo(
    () => templates.find((item) => String(item?.id || '') === String(selectedTemplateId || '')) || null,
    [templates, selectedTemplateId],
  )

  useEffect(() => {
    setSelectedTemplateId((currentTemplateId) => resolveTemplateId(templates, currentTemplateId))
  }, [templates])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const nextPreview = await renderPacketPreview({
          packetType,
          context,
          title: heading,
          template: selectedTemplate,
        })
        if (!cancelled) {
          setPreviewState(nextPreview)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error?.message || 'Unable to render packet preview right now.')
        }
      }
    }, 320)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [context, heading, packetType, selectedTemplate])

  useEffect(() => {
    let active = true
    async function resolveAdminAccess() {
      try {
        const settings = await fetchOrganisationSettings()
        if (!active) return
        setCanManagePacketAdminActions(
          isOrganisationAdminMembershipRole(settings?.membershipRole) || role === 'developer',
        )
      } catch {
        if (!active) return
        setCanManagePacketAdminActions(role === 'developer')
      }
    }
    void resolveAdminAccess()
    return () => {
      active = false
    }
  }, [role])

  useEffect(() => {
    let active = true
    async function loadConversionHealth() {
      if (!canManagePacketAdminActions) {
        if (active) setConversionHealth(null)
        return
      }
      try {
        const health = await getDocumentConversionHealthStatus()
        if (!active) return
        setConversionHealth(health)
      } catch (error) {
        if (!active) return
        setConversionHealth({
          healthy: false,
          status: 'unknown_error',
          message: error?.message || 'Unable to verify conversion runtime health.',
        })
      }
    }
    void loadConversionHealth()
    return () => {
      active = false
    }
  }, [canManagePacketAdminActions])

  const sectionManifest = previewState?.sectionManifest || []
  const previewHtml = previewState?.previewHtml || ''
  const latestFinalVersion = (versions || []).find(
    (version) => normalizeText(version?.final_signed_file_access_url || version?.final_signed_file_url),
  )
  const latestFinalStatusVersion = (versions || []).find(
    (version) => normalizeText(version?.final_signed_file_path || version?.final_signed_file_url),
  )
  const completedSignersCount = (signingSummary?.signers || []).filter(
    (signer) => String(signer?.status || '').toLowerCase() === 'signed',
  ).length
  const canGenerateFinalSigned =
    Number(signingSummary?.signerCount || 0) > 0 &&
    (signingSummary?.allSignersSigned || completedSignersCount === Number(signingSummary?.signerCount || 0)) &&
    Number(signingSummary?.requiredSignatures || 0) > 0 &&
    (signingSummary?.allRequiredFieldsCompleted ||
      Number(signingSummary?.completedRequiredFieldCount || 0) === Number(signingSummary?.requiredFieldCount || 0))
  const signingOperationalStatus = useMemo(() => resolveSigningOperationalStatus({
    packetType,
    packet: packetState || {},
    versions,
    signingSummary: signingSummary || {},
    finalCompletion,
    viewerRole: role,
  }), [finalCompletion, packetState, packetType, role, signingSummary, versions])

  useEffect(() => {
    const resolvedPacketId = normalizeText(packetState?.id || packetId)
    const resolvedVersionId = normalizeText(latestFinalStatusVersion?.id)
    if (!resolvedPacketId || !resolvedVersionId) {
      setFinalCompletion(null)
      return undefined
    }
    let active = true
    getFinalDocumentCompletionStatus({ packetId: resolvedPacketId, versionId: resolvedVersionId })
      .then((result) => { if (active) setFinalCompletion(result) })
      .catch((error) => {
        console.warn('[DocumentPacketWorkflowPanel] Final completion status unavailable.', error)
        if (active) setFinalCompletion(null)
      })
    return () => { active = false }
  }, [latestFinalStatusVersion?.id, packetId, packetState?.id])

  const refreshVersions = useCallback(async (nextPacketId = '') => {
    const resolvedPacketId = normalizeText(nextPacketId || packetState?.id || packetId)
    if (!resolvedPacketId) return
    const rows = await listPacketVersions(resolvedPacketId)
    setVersions(rows || [])
  }, [packetId, packetState?.id])

  const refreshSigningSummary = useCallback(async (nextPacketId = '') => {
    const resolvedPacketId = normalizeText(nextPacketId || packetState?.id || packetId)
    if (!resolvedPacketId) {
      setSigningSummary(null)
      return
    }
    const summary = await getPacketSigningSummary({ packetId: resolvedPacketId })
    setSigningSummary(summary)
  }, [packetId, packetState?.id])

  async function handleSaveDraft() {
    try {
      setLoadingAction('save_draft')
      setErrorMessage('')
      setStatusMessage('')
      setStatusLabel('')
      const result = await savePacketDraft({
        packetId: packetState?.id || packetId || null,
        packetType,
        context,
        template: selectedTemplate,
      })
      setPacketState(result.packet)
      setPreviewState(result.validation)
      setStatusLabel('Draft saved')
      setStatusMessage('Draft saved. Validation state captured.')
      await refreshSigningSummary(result.packet?.id)
      if (result.packet?.id && typeof onPacketIdChange === 'function') {
        onPacketIdChange(result.packet.id)
      }
    } catch (error) {
      const feedback = resolvePacketErrorFeedback(error)
      setStatusLabel(feedback.label)
      setErrorMessage(feedback.message)
    } finally {
      setLoadingAction('')
    }
  }

  async function handleGenerateVersion({ regenerate = false } = {}) {
    const generationBaseline = captureLegalDocumentGenerationBaseline(versions)
    try {
      setLoadingAction(regenerate ? 'regenerate' : 'generate')
      setErrorMessage('')
      setStatusMessage('')
      setStatusLabel('')
      const result = await generatePacketVersion({
        packetId: packetState?.id || packetId || null,
        packetType,
        context,
        template: selectedTemplate,
        allowWarnings: true,
      })
      setPacketState(result.packet)
      setPreviewState(result.validation)
      setStatusLabel('Document generated')
      setStatusMessage(regenerate ? 'Packet regenerated successfully.' : 'Packet generated successfully.')
      setGenerationRecovery(null)
      generationFailureCountsRef.current.clear()
      await refreshSigningSummary(result.packet?.id)
      if (result.packet?.id && typeof onPacketIdChange === 'function') {
        onPacketIdChange(result.packet.id)
      }
      await refreshVersions(result.packet?.id)
      if (typeof onPacketGenerated === 'function') {
        onPacketGenerated(result)
      }
    } catch (error) {
      if (error?.validation) {
        setPreviewState(error.validation)
      }
      setStatusLabel('Checking draft status')
      const reconciliation = await reconcileLegalDocumentGenerationFailure({
        error,
        baseline: generationBaseline,
        loadStatus: async () => {
          const resolvedPacketId = normalizeText(packetState?.id || packetId || error?.packetId)
          const rows = resolvedPacketId ? await listPacketVersions(resolvedPacketId) : []
          setVersions(rows || [])
          return rows || []
        },
      })
      if (reconciliation.confirmed) {
        setStatusLabel('Document generated')
        setStatusMessage('Generation completed and the recovered draft is ready to review.')
        setErrorMessage('')
        setGenerationRecovery(null)
        generationFailureCountsRef.current.clear()
        await refreshSigningSummary(packetState?.id || packetId)
        return
      }
      const recovery = resolveLegalDocumentGenerationRecovery(error, { packetType })
      const recoveryPacketId = normalizeText(packetState?.id || packetId || error?.packetId)
      const signature = `${packetType}:${recoveryPacketId || 'unsaved'}:${recovery.code}`
      const policy = resolveLegalDocumentRetryPolicy({ recovery, previousFailureCount: generationFailureCountsRef.current.get(signature) || 0, packetType, packetId: recoveryPacketId })
      generationFailureCountsRef.current.set(signature, policy.failureCount)
      const displayMessage = `${policy.message} Next step: ${policy.nextAction}`
      setGenerationRecovery({ ...policy, displayMessage, baseline: generationBaseline, packetId: recoveryPacketId })
      setStatusLabel(policy.label)
      setErrorMessage(displayMessage)
      if (policy.escalated) void ensureGenerationSupportHandoff({ ...policy, packetId: recoveryPacketId })
    } finally {
      setLoadingAction('')
    }
  }

  async function ensureGenerationSupportHandoff(policy) {
    const reference = normalizeText(policy?.supportReference)
    if (!reference || recordedGenerationHandoffsRef.current.has(reference)) return false
    const result = await recordLegalDocumentGenerationSupportHandoff({
      appendEvent: appendDocumentPacketEvent,
      packetId: normalizeText(policy?.packetId || packetState?.id || packetId),
      organisationId: packetState?.organisation_id || null,
      policy,
      packetType,
      surface: 'packet_panel',
    })
    if (result.recorded) recordedGenerationHandoffsRef.current.add(reference)
    return result.recorded
  }

  async function handleGenerationRecoveryAction() {
    if (!generationRecovery || loadingAction) return
    if (generationRecovery.actionKey === 'retry') {
      await handleGenerateVersion({ regenerate: true })
      return
    }
    if (generationRecovery.actionKey === 'refresh') {
      setLoadingAction('refresh_recovery')
      try {
        const rows = generationRecovery.packetId ? await listPacketVersions(generationRecovery.packetId) : []
        setVersions(rows || [])
        if (findReconciledLegalDocumentVersion(rows, generationRecovery.baseline)) {
          setGenerationRecovery(null)
          setErrorMessage('')
          setStatusLabel('Document generated')
          setStatusMessage('The completed draft is ready to review.')
        }
      } finally {
        setLoadingAction('')
      }
      return
    }
    if (generationRecovery.actionKey === 'sign_in') {
      window.location.assign('/auth')
      return
    }
    if (generationRecovery.actionKey === 'review_information') {
      setStatusMessage('Review the validation summary above, complete the missing information, and generate again.')
      return
    }
    if (['contact_admin', 'contact_support'].includes(generationRecovery.actionKey)) {
      const recorded = await ensureGenerationSupportHandoff(generationRecovery)
      await navigator.clipboard?.writeText(generationRecovery.supportReference).catch(() => null)
      setStatusMessage(`Reference ${generationRecovery.supportReference} copied. Include it when asking for help.${recorded ? ' The handoff was added to the packet audit trail.' : ''}`)
    }
  }

  async function handleArchivePacket() {
    const resolvedPacketId = normalizeText(packetState?.id || packetId)
    if (!resolvedPacketId) {
      setErrorMessage('Save or generate this packet before archiving.')
      return
    }

    try {
      setLoadingAction('archive')
      setErrorMessage('')
      setStatusMessage('')
      setStatusLabel('')
      const archived = await archivePacket(resolvedPacketId, { reason: 'Archived from packet workflow panel.' })
      setPacketState(archived)
      setStatusLabel('Packet archived')
      setStatusMessage('Packet archived.')
      await refreshSigningSummary(archived?.id)
    } catch (error) {
      const feedback = resolvePacketErrorFeedback(error)
      setStatusLabel(feedback.label)
      setErrorMessage(feedback.message)
    } finally {
      setLoadingAction('')
    }
  }

  async function handlePrepareSigningFields() {
    const resolvedPacketId = normalizeText(packetState?.id || packetId)
    if (!resolvedPacketId) {
      setStatusLabel('Packet required')
      setErrorMessage('Generate the packet first before preparing signing fields.')
      return
    }

    try {
      setLoadingAction('prepare_signing')
      setErrorMessage('')
      setStatusMessage('')
      setStatusLabel('')
      const result = await prepareSigningFields({
        packetId: resolvedPacketId,
        packetType,
        context,
        placeholders: previewState?.placeholders || {},
      })
      await refreshSigningSummary(resolvedPacketId)
      setStatusLabel(result?.alreadyPrepared ? 'Signing fields already prepared' : 'Signing fields prepared')
      setStatusMessage(
        result?.alreadyPrepared
          ? 'Signing fields already exist for this packet version. No duplicates were created.'
          : 'Default signers, initials, and signatures were created.',
      )
    } catch (error) {
      const feedback = resolvePacketErrorFeedback(error)
      setStatusLabel(feedback.label)
      setErrorMessage(feedback.message)
    } finally {
      setLoadingAction('')
    }
  }

  async function handleResetSigningFields() {
    const resolvedPacketId = normalizeText(packetState?.id || packetId)
    if (!resolvedPacketId) {
      setStatusLabel('Packet required')
      setErrorMessage('Load a generated packet before resetting signing fields.')
      return
    }

    try {
      setLoadingAction('reset_signing')
      setErrorMessage('')
      setStatusMessage('')
      setStatusLabel('')
      await resetSigningFields({
        packetId: resolvedPacketId,
      })
      await refreshSigningSummary(resolvedPacketId)
      setStatusLabel('Signing fields reset')
      setStatusMessage('Signing fields and signers were reset for this packet version.')
    } catch (error) {
      const feedback = resolvePacketErrorFeedback(error)
      setStatusLabel(feedback.label)
      setErrorMessage(feedback.message)
    } finally {
      setLoadingAction('')
    }
  }

  async function handleGenerateSigningLinks(targetSignerRole = '') {
    const resolvedPacketId = normalizeText(packetState?.id || packetId)
    if (!resolvedPacketId) {
      setStatusLabel('Packet required')
      setErrorMessage('Load a generated packet before generating signer links.')
      return
    }

    try {
      setLoadingAction('generate_links')
      setErrorMessage('')
      setStatusMessage('')
      setStatusLabel('')
      const result = await generateSigningLinks({
        packetId: resolvedPacketId,
        expiresInHours: 72,
        baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
        regenerate: Boolean(targetSignerRole),
        targetSignerRole,
      })
      await refreshSigningSummary(resolvedPacketId)
      setStatusLabel(targetSignerRole ? 'Signing link resent' : 'Signing links generated')
      setStatusMessage(targetSignerRole ? `Generated a new secure link for ${targetSignerRole.replace(/_/g, ' ')}.` : `Generated secure links for ${result?.signers?.length || 0} signer(s).`)
    } catch (error) {
      const feedback = resolvePacketErrorFeedback(error)
      setStatusLabel(feedback.label)
      setErrorMessage(feedback.message)
    } finally {
      setLoadingAction('')
    }
  }

  async function handleGenerateFinalSignedDocument() {
    const resolvedPacketId = normalizeText(packetState?.id || packetId)
    if (!resolvedPacketId) {
      setStatusLabel('Packet required')
      setErrorMessage('Load a generated packet before finalising the signed artifact.')
      return
    }

    try {
      setLoadingAction('finalise_signed')
      setErrorMessage('')
      setStatusMessage('')
      setStatusLabel('')
      const result = await generateFinalSignedPacketDocument({
        packetId: resolvedPacketId,
      })
      setPacketState(result?.packet || packetState)
      await refreshVersions(resolvedPacketId)
      await refreshSigningSummary(resolvedPacketId)
      setStatusLabel('Final signed document generated')
      setStatusMessage('Final signed PDF artifact was generated and stored successfully.')
    } catch (error) {
      const feedback = resolvePacketErrorFeedback(error)
      setStatusLabel(feedback.label)
      setErrorMessage(feedback.message)
    } finally {
      setLoadingAction('')
    }
  }

  async function toggleVersions() {
    const nextState = !showVersions
    setShowVersions(nextState)
    if (nextState) {
      try {
        await refreshVersions()
      } catch (error) {
        setErrorMessage(error?.message || 'Unable to load packet versions.')
      }
    }
  }

  useEffect(() => {
    void refreshSigningSummary(packetState?.id || packetId)
    void refreshVersions(packetState?.id || packetId)
  }, [packetId, packetState?.id, refreshSigningSummary, refreshVersions])

  return (
    <div className={`grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.1fr)] ${className}`}>
      <aside className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Packet Structure</p>
        <h4 className="mt-1.5 text-sm font-semibold text-[#142132]">{heading || `${String(packetType || '').toUpperCase()} Packet`}</h4>
        <ol className="mt-3 space-y-2 text-xs">
          {sectionManifest.map((section, index) => (
            <li key={section.key} className="rounded-[10px] border border-[#dce6f2] bg-white px-2.5 py-2 text-[#35546c]">
              <span className="text-[#8aa0b8]">{index + 1}. </span>
              <span className="font-semibold text-[#142132]">{section.label}</span>
            </li>
          ))}
          {!sectionManifest.length ? (
            <li className="rounded-[10px] border border-dashed border-[#dce6f2] bg-white px-2.5 py-2 text-[#6b7d93]">
              Preview not available yet.
            </li>
          ) : null}
        </ol>
      </aside>

      <section className="space-y-3.5 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3.5">
        <SigningOperationalStatusCard status={signingOperationalStatus} compact />
        <div className="rounded-[14px] border border-[#dfe8f2] bg-white p-3.5">
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
            Template
            <select
              className="rounded-[10px] border border-[#d8e2ee] bg-white px-2.5 py-2 text-sm font-medium normal-case tracking-normal text-[#142132]"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              {(templates || []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.template_label || template.template_key}
                </option>
              ))}
              {!templates?.length ? <option value="">Default template</option> : null}
            </select>
          </label>
        </div>

        <ValidationSummary validation={previewState} showAuditDetails={canManagePacketAdminActions} />
        <SigningFieldsSummary
          summary={signingSummary}
          canManage={canManagePacketAdminActions}
          busy={loadingAction === 'generate_links'}
          onSignerAction={(action, signer) => void handleGenerateSigningLinks(action === 'resend' ? signer.role : '')}
        />
        {canManagePacketAdminActions && conversionHealth ? (
          <div
            className={`rounded-[12px] border px-3 py-2 text-xs ${
              conversionHealth.healthy
                ? 'border-[#d7e9dd] bg-[#eefaf1] text-[#1c7d45]'
                : conversionHealth.status === 'not_configured'
                  ? 'border-[#f4e2bf] bg-[#fff8ec] text-[#9a640f]'
                  : 'border-[#f3d1ce] bg-[#fff4f3] text-[#8e1f15]'
            }`}
          >
            <p className="font-semibold">
              {conversionHealth.healthy
                ? 'Document conversion available'
                : conversionHealth.status === 'not_configured'
                  ? 'Document conversion not configured'
                  : 'Document conversion unavailable'}
            </p>
            <p>{conversionHealth.message || 'Conversion health status unavailable.'}</p>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-[12px] border border-[#f3d1ce] bg-[#fff4f3] px-3 py-2 text-xs text-[#8e1f15]">
            {statusLabel ? <p className="font-semibold">{statusLabel}</p> : null}
            <p>{errorMessage}</p>
            {generationRecovery?.displayMessage === errorMessage ? (
              <Button className="mt-2" size="sm" variant="secondary" onClick={() => void handleGenerationRecoveryAction()} disabled={Boolean(loadingAction)}>
                {generationRecovery.actionLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
        {statusMessage ? (
          <div className="rounded-[12px] border border-[#d7e9dd] bg-[#eefaf1] px-3 py-2 text-xs text-[#1c7d45]">
            {statusLabel ? <p className="font-semibold">{statusLabel}</p> : null}
            {statusMessage}
          </div>
        ) : null}
        {latestFinalVersion ? (
          <div className="rounded-[12px] border border-[#dfe8f2] bg-white px-3 py-2 text-xs text-[#2f5d87]">
            <p className="font-semibold text-[#142132]">Final signed artifact ready</p>
            <a
              href={latestFinalVersion.final_signed_file_access_url || latestFinalVersion.final_signed_file_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex hover:underline"
            >
              Open final signed document
            </a>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void handleSaveDraft()} disabled={Boolean(loadingAction)}>
            {loadingAction === 'save_draft' ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button onClick={() => void handleGenerateVersion({ regenerate: false })} disabled={Boolean(loadingAction)}>
            {loadingAction === 'generate' ? 'Generating…' : 'Generate Preview'}
          </Button>
          <Button variant="secondary" onClick={() => void handleGenerateVersion({ regenerate: true })} disabled={Boolean(loadingAction)}>
            {loadingAction === 'regenerate' ? 'Regenerating…' : 'Regenerate Version'}
          </Button>
          <Button variant="ghost" onClick={() => void handleArchivePacket()} disabled={Boolean(loadingAction)}>
            {loadingAction === 'archive' ? 'Archiving…' : 'Archive Packet'}
          </Button>
          {canManagePacketAdminActions ? (
            <>
              <Button variant="secondary" onClick={() => void handlePrepareSigningFields()} disabled={Boolean(loadingAction)}>
                {loadingAction === 'prepare_signing' ? 'Preparing…' : 'Prepare Signing Fields'}
              </Button>
              <Button variant="ghost" onClick={() => void handleResetSigningFields()} disabled={Boolean(loadingAction)}>
                {loadingAction === 'reset_signing' ? 'Resetting…' : 'Reset Signing Fields'}
              </Button>
              <Button variant="secondary" onClick={() => void handleGenerateSigningLinks()} disabled={Boolean(loadingAction)}>
                {loadingAction === 'generate_links' ? 'Generating Links…' : 'Generate Signing Links'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleGenerateFinalSignedDocument()}
                disabled={Boolean(loadingAction) || !canGenerateFinalSigned}
                title={!canGenerateFinalSigned ? 'All signers must complete signing before finalisation.' : undefined}
              >
                {loadingAction === 'finalise_signed' ? 'Generating Final Signed…' : 'Generate Final Signed Document'}
              </Button>
            </>
          ) : null}
          <Button variant="ghost" onClick={() => void toggleVersions()}>
            {showVersions ? 'Hide Versions' : 'View Previous Versions'}
          </Button>
        </div>

        {showVersions ? <VersionList versions={versions} /> : null}
      </section>

      <section className="rounded-[16px] border border-[#dce6f2] bg-white p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[#142132]">Live Preview</h4>
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{String(packetType || '').toUpperCase()}</span>
        </div>
        <div className="h-[540px] overflow-hidden rounded-[12px] border border-[#dce6f2] bg-[#f8fbff]">
          {previewHtml ? (
            <iframe title={`${packetType}-packet-preview`} srcDoc={previewHtml} className="h-full w-full border-0 bg-white" />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-xs text-[#6b7d93]">Preview not available yet.</div>
          )}
        </div>
      </section>
    </div>
  )
}
