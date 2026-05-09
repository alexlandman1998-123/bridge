import { CopyPlus, FileSignature, FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  createDocumentPacketTemplate,
  fetchDocumentPacketTemplate,
  listDocumentPacketTemplates,
  updateDocumentPacketTemplate,
} from '../../lib/documentPacketsApi'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings } from '../../lib/settingsApi'
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
import { useWorkspace } from '../../context/WorkspaceContext'

const SUPPORTED_PACKET_TYPES = [
  { key: 'otp', label: 'OTP Templates', icon: FileSignature },
  { key: 'mandate', label: 'Mandate Templates', icon: FileText },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function toTemplateForm(template = null) {
  const sections = Array.isArray(template?.sections)
    ? template.sections.map((section, index) => ({
        id: section.id || null,
        sectionKey: normalizeText(section.section_key || section.sectionKey || `section_${index + 1}`),
        sectionLabel: normalizeText(section.section_label || section.sectionLabel || `Section ${index + 1}`),
        sectionType: normalizeText(section.section_type || section.sectionType || 'legal_text') || 'legal_text',
        legalText: String(section.legal_text || section.legalText || ''),
        isRequired: section.is_required === undefined ? true : Boolean(section.is_required),
        sortOrder: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : index,
      }))
    : []

  return {
    templateLabel: normalizeText(template?.template_label || template?.templateLabel),
    description: String(template?.description || ''),
    versionTag: normalizeText(template?.version_tag || template?.versionTag || 'v1') || 'v1',
    isActive: template?.is_active === undefined ? true : Boolean(template?.is_active),
    sections,
  }
}

function mapSectionForSave(section = {}, index = 0) {
  return {
    sectionKey: normalizeText(section.sectionKey || `section_${index + 1}`),
    sectionLabel: normalizeText(section.sectionLabel || `Section ${index + 1}`),
    sectionType: normalizeText(section.sectionType || 'legal_text') || 'legal_text',
    legalText: String(section.legalText || ''),
    isRequired: section.isRequired === undefined ? true : Boolean(section.isRequired),
    sortOrder: Number.isFinite(Number(section.sortOrder)) ? Number(section.sortOrder) : index,
  }
}

function templateSort(left, right) {
  const leftOrg = Boolean(left?.organisation_id)
  const rightOrg = Boolean(right?.organisation_id)
  if (leftOrg !== rightOrg) return leftOrg ? -1 : 1
  const leftDefault = Boolean(left?.is_default)
  const rightDefault = Boolean(right?.is_default)
  if (leftDefault !== rightDefault) return leftDefault ? -1 : 1
  return String(right?.updated_at || '').localeCompare(String(left?.updated_at || ''))
}

export default function SettingsSigningTemplatesPage() {
  const { role } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [packetType, setPacketType] = useState('otp')
  const [templatesByType, setTemplatesByType] = useState({ otp: [], mandate: [] })
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateDetail, setTemplateDetail] = useState(null)
  const [form, setForm] = useState(toTemplateForm(null))

  const canEdit = canManageOrganisationSettings({ appRole: role, membershipRole })

  async function loadTemplates(type = packetType) {
    const [otpTemplates, mandateTemplates] = await Promise.all([
      listDocumentPacketTemplates({ packetType: 'otp', includeInactive: true }),
      listDocumentPacketTemplates({ packetType: 'mandate', includeInactive: true }),
    ])

    const nextByType = {
      otp: [...(otpTemplates || [])].sort(templateSort),
      mandate: [...(mandateTemplates || [])].sort(templateSort),
    }

    setTemplatesByType(nextByType)

    const selectedList = nextByType[type] || []
    if (!selectedList.length) {
      setSelectedTemplateId('')
      setTemplateDetail(null)
      setForm(toTemplateForm(null))
      return
    }

    const currentStillExists = selectedList.some((item) => item.id === selectedTemplateId)
    const nextTemplateId = currentStillExists ? selectedTemplateId : selectedList[0].id
    setSelectedTemplateId(nextTemplateId)
  }

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError('')
        const context = await fetchOrganisationSettings()
        if (!active) return
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole))
        await loadTemplates('otp')
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Unable to load signing templates.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const selectedList = templatesByType[packetType] || []
    if (!selectedList.length) {
      setSelectedTemplateId('')
      setTemplateDetail(null)
      setForm(toTemplateForm(null))
      return
    }

    if (!selectedTemplateId || !selectedList.some((item) => item.id === selectedTemplateId)) {
      setSelectedTemplateId(selectedList[0].id)
    }
  }, [packetType, selectedTemplateId, templatesByType])

  useEffect(() => {
    let active = true
    async function loadDetail() {
      if (!selectedTemplateId) {
        setTemplateDetail(null)
        setForm(toTemplateForm(null))
        return
      }
      try {
        setError('')
        const detail = await fetchDocumentPacketTemplate(selectedTemplateId, { includeSections: true })
        if (!active) return
        setTemplateDetail(detail)
        setForm(toTemplateForm(detail))
      } catch (detailError) {
        if (active) {
          setError(detailError?.message || 'Unable to load template details.')
        }
      }
    }
    void loadDetail()
    return () => {
      active = false
    }
  }, [selectedTemplateId])

  const selectedList = templatesByType[packetType] || []
  const selectedTemplate = useMemo(
    () => selectedList.find((item) => item.id === selectedTemplateId) || null,
    [selectedList, selectedTemplateId],
  )

  const selectedIsOrgOwned = Boolean(selectedTemplate?.organisation_id)

  async function handleCreateEditableCopy() {
    if (!templateDetail) return
    try {
      setCloning(true)
      setError('')
      setMessage('')

      const cloned = await createDocumentPacketTemplate({
        packetType,
        templateKey: `${normalizeText(templateDetail.template_key || packetType)}_org_${Date.now()}`,
        templateLabel: `${normalizeText(templateDetail.template_label || packetType.toUpperCase())} (Organisation)`,
        description: templateDetail.description || '',
        versionTag: normalizeText(templateDetail.version_tag || 'v1') || 'v1',
        templateFormat: normalizeText(templateDetail.template_format || 'docx') || 'docx',
        sections: (templateDetail.sections || []).map((section, index) => mapSectionForSave({
          sectionKey: section.section_key,
          sectionLabel: section.section_label,
          sectionType: section.section_type,
          legalText: section.legal_text,
          isRequired: section.is_required,
          sortOrder: section.sort_order ?? index,
        }, index)),
      })

      await loadTemplates(packetType)
      setSelectedTemplateId(cloned?.id || '')
      setMessage('Editable organisation template created from base template.')
    } catch (cloneError) {
      setError(cloneError?.message || 'Unable to create editable template copy.')
    } finally {
      setCloning(false)
    }
  }

  function addSection() {
    setForm((previous) => ({
      ...previous,
      sections: [
        ...(previous.sections || []),
        {
          id: null,
          sectionKey: `section_${(previous.sections || []).length + 1}`,
          sectionLabel: `Section ${(previous.sections || []).length + 1}`,
          sectionType: 'legal_text',
          legalText: '',
          isRequired: true,
          sortOrder: (previous.sections || []).length,
        },
      ],
    }))
  }

  function updateSection(index, patch) {
    setForm((previous) => ({
      ...previous,
      sections: (previous.sections || []).map((section, sectionIndex) => (
        sectionIndex === index ? { ...section, ...patch } : section
      )),
    }))
  }

  function removeSection(index) {
    setForm((previous) => ({
      ...previous,
      sections: (previous.sections || []).filter((_, sectionIndex) => sectionIndex !== index),
    }))
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!selectedTemplateId || !selectedTemplate) return

    try {
      setSaving(true)
      setError('')
      setMessage('')

      await updateDocumentPacketTemplate(selectedTemplateId, {
        templateLabel: form.templateLabel,
        description: form.description,
        versionTag: form.versionTag,
        isActive: form.isActive,
        sections: (form.sections || []).map((section, index) => mapSectionForSave(section, index)),
      })

      await loadTemplates(packetType)
      setMessage('Signing template saved.')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save signing template.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading signing templates…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Signing Templates"
        description="Manage OTP and mandate template structures used for packet generation and online signing workflows."
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">
          Read-only for your role. Only Principal-level administrators can edit signing templates.
        </SettingsBanner>
      ) : null}

      <SettingsSectionCard
        title="Template Type"
        description="Switch between Offer to Purchase and mandate templates."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {SUPPORTED_PACKET_TYPES.map((item) => {
            const active = packetType === item.key
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setPacketType(item.key)}
                className={[
                  'flex h-full min-h-[84px] flex-col justify-center rounded-[14px] border p-4 text-left transition duration-150 ease-out',
                  active
                    ? 'border-[#c8d7e6] bg-[#edf3f8] text-[#162334]'
                    : 'border-[#e2eaf3] bg-[#fbfdff] text-[#4f637a] hover:border-[#cfdbe8] hover:bg-white',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon size={16} />
                  <span>{item.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Available Templates"
        description="Global defaults are read-only. Create an organisation copy to customize legal text and clauses."
      >
        {selectedList.length ? (
          <div className="grid gap-3">
            {selectedList.map((template) => {
              const active = selectedTemplateId === template.id
              const isOrgOwned = Boolean(template.organisation_id)
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={[
                    'rounded-[14px] border px-4 py-3 text-left transition duration-150 ease-out',
                    active
                      ? 'border-[#c8d7e6] bg-[#edf3f8]'
                      : 'border-[#e2eaf3] bg-[#fbfdff] hover:border-[#cfdbe8] hover:bg-white',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#162334]">{template.template_label || template.template_key}</p>
                    <span className="inline-flex rounded-full border border-[#d7e2ee] bg-white px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#5f7288]">
                      {isOrgOwned ? 'Organisation' : 'Global'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#6b7d93]">{template.description || template.template_key}</p>
                </button>
              )
            })}
          </div>
        ) : (
          <SettingsBanner tone="warning">No templates found for this packet type yet.</SettingsBanner>
        )}
      </SettingsSectionCard>

      {selectedTemplate ? (
        <form onSubmit={handleSave}>
          <SettingsSectionCard
            title="Template Editor"
            description={selectedIsOrgOwned
              ? 'Edit template label and legal section content used in generated signing packets.'
              : 'This is a global template. Create an organisation copy to edit it.'}
            actions={
              !selectedIsOrgOwned && canEdit ? (
                <button
                  type="button"
                  className="auth-secondary-cta"
                  onClick={() => void handleCreateEditableCopy()}
                  disabled={cloning}
                >
                  <CopyPlus size={14} />
                  <span className="ml-1">{cloning ? 'Creating…' : 'Create Editable Copy'}</span>
                </button>
              ) : null
            }
          >
            <div className={settingsGridClass}>
              <label className={settingsFieldClass}>
                Template Label
                <input
                  type="text"
                  value={form.templateLabel}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, templateLabel: event.target.value }))}
                />
              </label>
              <label className={settingsFieldClass}>
                Version Tag
                <input
                  type="text"
                  value={form.versionTag}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, versionTag: event.target.value }))}
                />
              </label>
              <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                Description
                <textarea
                  rows={3}
                  value={form.description}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                />
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#2e4259]">Template Sections</h4>
                {canEdit && selectedIsOrgOwned ? (
                  <button type="button" className="auth-secondary-cta" onClick={addSection}>Add Section</button>
                ) : null}
              </div>

              {(form.sections || []).length ? (
                <div className="space-y-3">
                  {(form.sections || []).map((section, index) => (
                    <div key={`${section.sectionKey}-${index}`} className="rounded-[12px] border border-[#e2eaf3] bg-[#fbfdff] p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className={settingsFieldClass}>
                          Section Key
                          <input
                            type="text"
                            value={section.sectionKey}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { sectionKey: event.target.value })}
                          />
                        </label>
                        <label className={settingsFieldClass}>
                          Section Label
                          <input
                            type="text"
                            value={section.sectionLabel}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { sectionLabel: event.target.value })}
                          />
                        </label>
                        <label className={settingsFieldClass}>
                          Section Type
                          <select
                            value={section.sectionType}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { sectionType: event.target.value })}
                          >
                            <option value="legal_text">Legal Text</option>
                            <option value="dynamic_fields">Dynamic Fields</option>
                            <option value="conditional_clause">Conditional Clause</option>
                            <option value="signature_zone">Signature Zone</option>
                            <option value="metadata">Metadata</option>
                          </select>
                        </label>
                        <label className={settingsFieldClass}>
                          Sort Order
                          <input
                            type="number"
                            value={section.sortOrder}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { sortOrder: Number(event.target.value || 0) })}
                          />
                        </label>
                        <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                          Legal Text / Clause Body
                          <textarea
                            rows={4}
                            value={section.legalText}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { legalText: event.target.value })}
                          />
                        </label>
                      </div>
                      {canEdit && selectedIsOrgOwned ? (
                        <div className="mt-3 flex justify-end">
                          <button type="button" className="auth-secondary-cta" onClick={() => removeSection(index)}>
                            Remove Section
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <SettingsBanner tone="warning">No sections configured for this template.</SettingsBanner>
              )}
            </div>

            {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
            {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

            <div className={settingsActionRowClass}>
              <button
                type="submit"
                className="auth-primary-cta"
                disabled={!canEdit || !selectedIsOrgOwned || saving}
              >
                {saving ? 'Saving…' : 'Save Signing Template'}
              </button>
            </div>
          </SettingsSectionCard>
        </form>
      ) : null}
    </div>
  )
}
