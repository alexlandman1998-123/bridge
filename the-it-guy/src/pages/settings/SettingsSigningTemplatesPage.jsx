import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  CopyPlus,
  FileSignature,
  FileText,
  FlaskConical,
  FolderUp,
  Layers3,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { renderPacketPreview } from '../../core/documents/packetService'
import {
  buildCanonicalMergeSampleData,
  listCanonicalMergeFields,
  suggestCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from '../../core/documents/mergeFieldRegistry'
import {
  createDocumentPacketTemplate,
  fetchDocumentPacketTemplate,
  listDocumentPacketTemplates,
  listDocumentPlaceholderDefinitions,
  updateDocumentPacketTemplate,
  uploadDocumentPacketTemplateAsset,
  upsertDocumentPlaceholderDefinition,
} from '../../lib/documentPacketsApi'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsEmptyState,
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
  {
    key: 'otp',
    label: 'Offer To Purchase',
    shortLabel: 'OTP',
    icon: FileSignature,
    subtitle: 'Template set for offer drafting and buyer signature journeys.',
  },
  {
    key: 'mandate',
    label: 'Mandate Agreement',
    shortLabel: 'Mandate',
    icon: FileText,
    subtitle: 'Template set for seller mandates and listing activation workflows.',
  },
]

const TEMPLATE_STATUS_OPTIONS = [
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Active' },
  { key: 'deprecated', label: 'Deprecated' },
  { key: 'archived', label: 'Archived' },
]

const PLACEHOLDER_KEY_PATTERN = /^[a-z0-9_.-]+$/i

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizeTemplateStatus(template = {}) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  const fromMetadata = normalizeText(metadata.lifecycle_status || metadata.template_status).toLowerCase()
  if (fromMetadata) return fromMetadata
  if (template?.is_active === false) return 'archived'
  return template?.is_default ? 'active' : 'draft'
}

function detectTemplateTokenIssues(text = '') {
  const value = String(text || '')
  const openMatches = value.match(/{{/g) || []
  const closeMatches = value.match(/}}/g) || []
  const malformed = []

  const tokenMatches = [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)]
  const tokens = tokenMatches
    .map((match) => normalizeText(match[1]))
    .filter(Boolean)

  if (openMatches.length !== closeMatches.length) {
    malformed.push('Unbalanced placeholder braces detected.')
  }

  for (const token of tokens) {
    if (!PLACEHOLDER_KEY_PATTERN.test(token)) {
      malformed.push(`Placeholder "${token}" contains unsupported characters.`)
    }
  }

  return {
    tokens,
    malformed,
  }
}

function sectionsFromTemplate(template = null) {
  const sections = Array.isArray(template?.sections) ? template.sections : []
  return sections.map((section, index) => {
    const legalText = String(section.legal_text || section.legalText || '')
    const tokenScan = detectTemplateTokenIssues(legalText)
    const placeholderKeysFromSection = Array.isArray(section.placeholder_keys)
      ? section.placeholder_keys
      : Array.isArray(section.placeholderKeys)
        ? section.placeholderKeys
        : []

    const allPlaceholderKeys = Array.from(
      new Set([...placeholderKeysFromSection.map((item) => normalizeText(item)).filter(Boolean), ...tokenScan.tokens]),
    )

    return {
      id: section.id || null,
      sectionKey: normalizeText(section.section_key || section.sectionKey || `section_${index + 1}`),
      sectionLabel: normalizeText(section.section_label || section.sectionLabel || `Section ${index + 1}`),
      sectionType: normalizeText(section.section_type || section.sectionType || 'legal_text') || 'legal_text',
      legalText,
      placeholderKeys: allPlaceholderKeys,
      placeholderKeysText: allPlaceholderKeys.join(', '),
      isRequired: section.is_required === undefined ? true : Boolean(section.is_required),
      sortOrder: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : index,
    }
  })
}

function toTemplateForm(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}

  return {
    templateLabel: normalizeText(template?.template_label || template?.templateLabel),
    description: String(template?.description || ''),
    versionTag: normalizeText(template?.version_tag || template?.versionTag || 'v1') || 'v1',
    templateFormat: normalizeText(template?.template_format || template?.templateFormat || 'docx') || 'docx',
    templateStoragePath:
      normalizeText(template?.template_storage_path || metadata.template_storage_path || metadata.templatePath || ''),
    templateStorageBucket:
      normalizeText(template?.template_storage_bucket || metadata.template_storage_bucket || metadata.templateBucket || ''),
    templateFileName:
      normalizeText(template?.template_file_name || metadata.template_file_name || metadata.templateFilename || ''),
    templateOutputBucket:
      normalizeText(template?.template_output_bucket || metadata.template_output_bucket || metadata.outputBucket || ''),
    templateStatus: normalizeTemplateStatus(template),
    isActive: template?.is_active === undefined ? true : Boolean(template?.is_active),
    isDefault: Boolean(template?.is_default),
    sections: sectionsFromTemplate(template),
    metadataJson: metadata,
  }
}

function mapSectionForSave(section = {}, index = 0) {
  const placeholderKeys = String(section.placeholderKeysText || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean)

  return {
    sectionKey: normalizeText(section.sectionKey || `section_${index + 1}`),
    sectionLabel: normalizeText(section.sectionLabel || `Section ${index + 1}`),
    sectionType: normalizeText(section.sectionType || 'legal_text') || 'legal_text',
    legalText: String(section.legalText || ''),
    placeholderKeys,
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

function incrementVersionTag(versionTag = 'v1') {
  const normalized = normalizeText(versionTag) || 'v1'
  const match = normalized.match(/^(.*?)(\d+)$/)
  if (!match) return `${normalized}-v2`
  const [, prefix = '', numberPart = '1'] = match
  const nextNumber = Number(numberPart) + 1
  return `${prefix}${nextNumber}`
}

function statusPillClass(status = '') {
  const key = normalizeText(status).toLowerCase()
  if (key === 'active' || key === 'approved' || key === 'signed') {
    return 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
  }
  if (key === 'in_review' || key === 'deprecated') {
    return 'border-[#f4e2bf] bg-[#fff8ec] text-[#7d520d]'
  }
  if (key === 'archived') {
    return 'border-[#e2eaf3] bg-[#f7fafc] text-[#5f7288]'
  }
  return 'border-[#d7e2ee] bg-white text-[#4f637a]'
}

function summarizeTemplateValidation({
  form = {},
  placeholderRegistry = [],
  packetType = 'otp',
  canonicalFields = [],
} = {}) {
  const blockers = []
  const warnings = []

  if (!normalizeText(form.templateLabel)) {
    blockers.push('Template label is required.')
  }

  if (!normalizeText(form.versionTag)) {
    blockers.push('Version tag is required.')
  }

  if (!normalizeText(form.templateStoragePath)) {
    warnings.push('DOCX storage path is not configured yet. Generation will fail until a template file path is saved.')
  }

  const sections = Array.isArray(form.sections) ? form.sections : []
  if (!sections.length) {
    blockers.push('Add at least one template section.')
  }

  const tokenSet = new Set()
  const malformedTokens = []
  const duplicateSectionKeys = new Set()
  const seenSectionKeys = new Set()
  const legacyTokens = []

  for (const section of sections) {
    const sectionKey = normalizeText(section.sectionKey)
    if (!sectionKey) {
      blockers.push('Every section must have a section key.')
    }
    if (sectionKey && seenSectionKeys.has(sectionKey)) {
      duplicateSectionKeys.add(sectionKey)
    }
    seenSectionKeys.add(sectionKey)

    const legalScan = detectTemplateTokenIssues(section.legalText)
    for (const token of legalScan.tokens) tokenSet.add(token)
    for (const issue of legalScan.malformed) {
      malformedTokens.push(`${normalizeText(section.sectionLabel || section.sectionKey || 'Section')}: ${issue}`)
    }

    for (const token of String(section.placeholderKeysText || '')
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean)) {
      if (!PLACEHOLDER_KEY_PATTERN.test(token)) {
        malformedTokens.push(`${normalizeText(section.sectionLabel || section.sectionKey || 'Section')}: Placeholder "${token}" is malformed.`)
      } else {
        tokenSet.add(token)
      }
    }
  }

  if (duplicateSectionKeys.size) {
    blockers.push(`Duplicate section keys found: ${Array.from(duplicateSectionKeys).join(', ')}`)
  }

  if (malformedTokens.length) {
    blockers.push(...malformedTokens)
  }

  const requiredRegistryKeys = new Set(
    (placeholderRegistry || [])
      .filter((item) => item?.is_active !== false && item?.is_required_default)
      .map((item) => normalizeText(item.placeholder_key))
      .filter(Boolean),
  )

  const tokenValidation = validateTemplateTokensAgainstRegistry({
    tokens: Array.from(tokenSet),
    packetType,
  })
  for (const row of tokenValidation.deprecated || []) {
    legacyTokens.push(row)
  }

  const canonicalRequired = new Set(
    (canonicalFields || [])
      .filter((field) => field.required)
      .map((field) => normalizeText(field.key))
      .filter(Boolean),
  )
  const effectiveRequired = new Set([...requiredRegistryKeys, ...canonicalRequired])

  const missingRequired = Array.from(effectiveRequired).filter((key) => {
    const existsDirectly = tokenSet.has(key)
    const existsByAlias = (tokenValidation.normalized || []).includes(key)
    return !existsDirectly && !existsByAlias
  })
  if (missingRequired.length) {
    warnings.push(`Required merge fields are missing from template sections: ${missingRequired.map((key) => `{{${key}}}`).join(', ')}.`)
  }

  const unknownTokens = (tokenValidation.unknown || []).map((row) => row.token)
  if (unknownTokens.length) {
    const withSuggestions = (tokenValidation.unknown || []).map((row) => {
      const suggestion = row.suggested || suggestCanonicalMergeFieldKey(row.token, { packetType })
      return suggestion ? `Unknown field {{${row.token}}}. Suggested replacement: {{${suggestion}}}` : `Unknown field {{${row.token}}}. Add it to the registry or replace it.`
    })
    warnings.push(withSuggestions.join(' '))
  }

  if (legacyTokens.length) {
    warnings.push(
      `Deprecated merge fields detected: ${legacyTokens
        .map((row) => `{{${row.token}}} should become {{${row.canonicalKey}}}`)
        .join('; ')}. These still resolve through aliases for now.`,
    )
  }

  return {
    blockers,
    warnings,
    tokenCount: tokenSet.size,
    tokenList: Array.from(tokenSet).sort(),
    unknownTokens,
    missingRequired,
    deprecatedTokens: legacyTokens,
    normalizedTokenList: tokenValidation.normalized || [],
  }
}

function buildTemplateMetadata(form = {}, existingMetadata = {}, uploadMeta = null) {
  const nextMetadata = {
    ...(existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}),
    lifecycle_status: normalizeText(form.templateStatus || 'draft') || 'draft',
    template_storage_path: normalizeNullableText(form.templateStoragePath),
    template_storage_bucket: normalizeNullableText(form.templateStorageBucket),
    template_file_name: normalizeNullableText(form.templateFileName),
    template_output_bucket: normalizeNullableText(form.templateOutputBucket),
  }

  if (uploadMeta && typeof uploadMeta === 'object') {
    nextMetadata.template_uploaded_at = new Date().toISOString()
    nextMetadata.template_upload_source = 'settings_legal_templates'
  }

  return nextMetadata
}

function buildSamplePreviewContext(packetType = 'otp') {
  if (packetType === 'mandate') {
    return {
      lead: {
        lead_name: 'Sample Seller',
        seller_name: 'Sample Seller',
        seller_email: 'seller@example.com',
        seller_phone: '0820000000',
      },
      mandateDraft: {
        selling_price: 4500000,
        mandate_type: 'sole',
        special_conditions: 'No special conditions captured in sample mode.',
      },
      generatedByName: 'Bridge Template Tester',
      generatedByRole: 'principal',
    }
  }

  return {
    transaction: {
      unit_number: 'Unit 12',
      development_name: 'Sample Estate',
      sale_price: 3250000,
      purchase_price: 3250000,
      stage: 'Offer',
      finance_type: 'bond',
      buyer_name: 'Sample Buyer',
    },
    unit: {
      unit_number: '12',
      development_name: 'Sample Estate',
      erf_number: 'ERF-1204',
    },
    buyer: {
      full_name: 'Sample Buyer',
      email: 'buyer@example.com',
      phone: '0830000000',
    },
    specialConditions: 'Sample preview condition.',
    generatedByName: 'Bridge Template Tester',
    generatedByRole: 'principal',
  }
}

function TemplateStatusPill({ status = 'draft', children = null }) {
  const label = children || TEMPLATE_STATUS_OPTIONS.find((item) => item.key === status)?.label || 'Draft'
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] ${statusPillClass(status)}`}>
      {label}
    </span>
  )
}

export default function SettingsSigningTemplatesPage() {
  const { role } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)
  const [testingTemplate, setTestingTemplate] = useState(false)
  const [savingPlaceholder, setSavingPlaceholder] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [packetType, setPacketType] = useState('otp')
  const [templatesByType, setTemplatesByType] = useState({ otp: [], mandate: [] })
  const [placeholdersByType, setPlaceholdersByType] = useState({ otp: [], mandate: [] })
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateDetail, setTemplateDetail] = useState(null)
  const [form, setForm] = useState(toTemplateForm(null))
  const [placeholderForm, setPlaceholderForm] = useState({
    placeholderKey: '',
    entityScope: 'transaction',
    dataType: 'text',
    description: '',
    exampleValue: '',
    isRequiredDefault: false,
    isActive: true,
  })
  const [previewState, setPreviewState] = useState({ loading: false, html: '', warnings: [], critical: [], error: '' })
  const [mergeFieldSearch, setMergeFieldSearch] = useState('')
  const [mergeFieldCategory, setMergeFieldCategory] = useState('all')

  const canEdit = canManageOrganisationSettings({ appRole: role, membershipRole })

  const loadTemplatesAndRegistry = useCallback(async ({
    targetPacketType = 'otp',
    preferredTemplateId = '',
  } = {}) => {
    const [otpTemplates, mandateTemplates, otpRegistry, mandateRegistry] = await Promise.all([
      listDocumentPacketTemplates({ packetType: 'otp', includeInactive: true }),
      listDocumentPacketTemplates({ packetType: 'mandate', includeInactive: true }),
      listDocumentPlaceholderDefinitions({ packetType: 'otp', includeInactive: true }).catch(() => []),
      listDocumentPlaceholderDefinitions({ packetType: 'mandate', includeInactive: true }).catch(() => []),
    ])

    const nextByType = {
      otp: [...(otpTemplates || [])].sort(templateSort),
      mandate: [...(mandateTemplates || [])].sort(templateSort),
    }

    setTemplatesByType(nextByType)
    setPlaceholdersByType({
      otp: otpRegistry || [],
      mandate: mandateRegistry || [],
    })

    const selectedList = nextByType[targetPacketType] || []
    if (!selectedList.length) {
      setSelectedTemplateId('')
      setTemplateDetail(null)
      setForm(toTemplateForm(null))
      return
    }

    const currentStillExists = selectedList.some((item) => item.id === preferredTemplateId)
    setSelectedTemplateId(currentStillExists ? preferredTemplateId : selectedList[0].id)
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError('')
        const context = await fetchOrganisationSettings()
        if (!active) return
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole))
        await loadTemplatesAndRegistry({
          targetPacketType: 'otp',
          preferredTemplateId: '',
        })
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Unable to load legal templates.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [loadTemplatesAndRegistry])

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
        setPreviewState({ loading: false, html: '', warnings: [], critical: [], error: '' })
        return
      }

      try {
        setError('')
        const detail = await fetchDocumentPacketTemplate(selectedTemplateId, { includeSections: true })
        if (!active) return
        setTemplateDetail(detail)
        setForm(toTemplateForm(detail))
        setPreviewState({ loading: false, html: '', warnings: [], critical: [], error: '' })
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

  const selectedList = useMemo(
    () => templatesByType[packetType] || [],
    [packetType, templatesByType],
  )
  const selectedTemplate = useMemo(
    () => selectedList.find((item) => item.id === selectedTemplateId) || null,
    [selectedList, selectedTemplateId],
  )

  const selectedIsOrgOwned = Boolean(selectedTemplate?.organisation_id)
  const placeholderRegistry = useMemo(
    () => placeholdersByType[packetType] || [],
    [packetType, placeholdersByType],
  )
  const canonicalFields = useMemo(
    () => listCanonicalMergeFields({ packetType }),
    [packetType],
  )
  const canonicalSampleMap = useMemo(
    () => buildCanonicalMergeSampleData({ packetType }),
    [packetType],
  )
  const canonicalCategories = useMemo(
    () => ['all', ...Array.from(new Set(canonicalFields.map((row) => normalizeText(row.category)).filter(Boolean)))],
    [canonicalFields],
  )
  const filteredCanonicalFields = useMemo(() => {
    const search = normalizeText(mergeFieldSearch).toLowerCase()
    return canonicalFields.filter((field) => {
      if (mergeFieldCategory !== 'all' && normalizeText(field.category) !== mergeFieldCategory) return false
      if (!search) return true
      return (
        normalizeText(field.key).toLowerCase().includes(search) ||
        normalizeText(field.label).toLowerCase().includes(search) ||
        normalizeText(field.description).toLowerCase().includes(search)
      )
    })
  }, [canonicalFields, mergeFieldCategory, mergeFieldSearch])
  const validationSummary = useMemo(
    () => summarizeTemplateValidation({
      form,
      placeholderRegistry,
      packetType,
      canonicalFields,
    }),
    [canonicalFields, form, packetType, placeholderRegistry],
  )

  const templateTypeConfig = SUPPORTED_PACKET_TYPES.find((item) => item.key === packetType) || SUPPORTED_PACKET_TYPES[0]

  async function refreshAll() {
    await loadTemplatesAndRegistry({
      targetPacketType: packetType,
      preferredTemplateId: selectedTemplateId,
    })
  }

  async function handleCreateTemplate() {
    try {
      setCreatingTemplate(true)
      setError('')
      setMessage('')

      const timestamp = Date.now()
      const created = await createDocumentPacketTemplate({
        packetType,
        templateKey: `${packetType}_template_${timestamp}`,
        templateLabel: `${templateTypeConfig.shortLabel} Template ${new Date().toLocaleDateString()}`,
        description: 'Draft legal template',
        versionTag: 'v1',
        templateFormat: 'docx',
        isDefault: false,
        isActive: false,
        metadataJson: {
          lifecycle_status: 'draft',
        },
        sections: [
          {
            sectionKey: 'parties',
            sectionLabel: 'Parties',
            sectionType: 'dynamic_fields',
            legalText: 'Buyer: {{buyer_full_name}}\nSeller: {{seller_full_name}}',
            isRequired: true,
            sortOrder: 0,
          },
          {
            sectionKey: 'terms',
            sectionLabel: 'Purchase Terms',
            sectionType: 'legal_text',
            legalText: 'Purchase price: {{purchase_price}}',
            isRequired: true,
            sortOrder: 1,
          },
          {
            sectionKey: 'signatures',
            sectionLabel: 'Signatures',
            sectionType: 'signature_zone',
            legalText: 'Signed by {{buyer_full_name}} and {{seller_full_name}}',
            isRequired: true,
            sortOrder: 2,
          },
        ],
      })

      await refreshAll()
      setSelectedTemplateId(created?.id || '')
      setMessage('New draft template created.')
    } catch (createError) {
      setError(createError?.message || 'Unable to create template.')
    } finally {
      setCreatingTemplate(false)
    }
  }

  async function handleCreateEditableCopy() {
    if (!templateDetail) return

    try {
      setCloning(true)
      setError('')
      setMessage('')

      const cloned = await createDocumentPacketTemplate({
        packetType,
        templateKey: `${normalizeText(templateDetail.template_key || packetType)}_org_${Date.now()}`,
        templateLabel: `${normalizeText(templateDetail.template_label || templateTypeConfig.label)} (Organisation)`,
        description: templateDetail.description || '',
        versionTag: normalizeText(templateDetail.version_tag || 'v1') || 'v1',
        templateFormat: normalizeText(templateDetail.template_format || 'docx') || 'docx',
        templateStoragePath: normalizeText(templateDetail.template_storage_path || ''),
        metadataJson: {
          ...(templateDetail?.metadata_json && typeof templateDetail.metadata_json === 'object' ? templateDetail.metadata_json : {}),
          lifecycle_status: normalizeTemplateStatus(templateDetail),
        },
        sections: (templateDetail.sections || []).map((section, index) => mapSectionForSave({
          sectionKey: section.section_key,
          sectionLabel: section.section_label,
          sectionType: section.section_type,
          legalText: section.legal_text,
          placeholderKeysText: Array.isArray(section.placeholder_keys) ? section.placeholder_keys.join(', ') : '',
          isRequired: section.is_required,
          sortOrder: section.sort_order ?? index,
        }, index)),
      })

      await refreshAll()
      setSelectedTemplateId(cloned?.id || '')
      setMessage('Editable organisation template created from selected base template.')
    } catch (cloneError) {
      setError(cloneError?.message || 'Unable to create editable copy.')
    } finally {
      setCloning(false)
    }
  }

  async function handleCreateNextVersion() {
    if (!templateDetail || !selectedTemplate) return

    try {
      setCloning(true)
      setError('')
      setMessage('')

      const currentVersion = normalizeText(form.versionTag || templateDetail.version_tag || 'v1') || 'v1'
      const nextVersion = incrementVersionTag(currentVersion)
      const cloned = await createDocumentPacketTemplate({
        packetType,
        templateKey: `${normalizeText(selectedTemplate.template_key || packetType)}_${Date.now()}`,
        templateLabel: `${normalizeText(form.templateLabel || selectedTemplate.template_label || templateTypeConfig.label)} ${nextVersion.toUpperCase()}`,
        description: form.description,
        versionTag: nextVersion,
        templateFormat: form.templateFormat,
        templateStoragePath: normalizeText(form.templateStoragePath),
        isDefault: false,
        isActive: false,
        metadataJson: buildTemplateMetadata({ ...form, templateStatus: 'draft' }, form.metadataJson || {}, null),
        sections: (form.sections || []).map((section, index) => mapSectionForSave(section, index)),
      })

      await refreshAll()
      setSelectedTemplateId(cloned?.id || '')
      setMessage(`Template version ${nextVersion} created as a new draft.`)
    } catch (cloneError) {
      setError(cloneError?.message || 'Unable to create next version.')
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
          placeholderKeysText: '',
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

  async function handleUploadTemplateFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedTemplateId || !selectedTemplate) return

    try {
      setUploadingTemplate(true)
      setError('')
      setMessage('')

      const uploaded = await uploadDocumentPacketTemplateAsset({
        file,
        packetType,
        templateKey: normalizeText(selectedTemplate.template_key || selectedTemplateId),
      })

      setForm((previous) => ({
        ...previous,
        templateStoragePath: normalizeText(uploaded.path),
        templateStorageBucket: normalizeText(uploaded.bucket),
        templateFileName: normalizeText(uploaded.fileName),
      }))
      setMessage('DOCX template uploaded. Save to apply this file to the template version.')
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload DOCX template.')
    } finally {
      setUploadingTemplate(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!selectedTemplateId || !selectedTemplate) return

    if (!selectedIsOrgOwned) {
      setError('Create an organisation-owned template copy before editing this template.')
      return
    }

    if (validationSummary.blockers.length) {
      setError('Resolve template blockers before saving.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const metadataJson = buildTemplateMetadata(form, form.metadataJson || {}, null)
      await updateDocumentPacketTemplate(selectedTemplateId, {
        templateLabel: form.templateLabel,
        description: form.description,
        versionTag: form.versionTag,
        templateFormat: form.templateFormat,
        templateStoragePath: form.templateStoragePath,
        isActive: form.isActive,
        isDefault: form.isDefault,
        metadataJson,
        sections: (form.sections || []).map((section, index) => mapSectionForSave(section, index)),
      })

      if (form.isDefault) {
        const orgTemplates = (templatesByType[packetType] || []).filter((row) => row.organisation_id && row.id !== selectedTemplateId && row.is_default)
        for (const row of orgTemplates) {
          // keep one active default template per packet type
          await updateDocumentPacketTemplate(row.id, { isDefault: false })
        }
      }

      await refreshAll()
      setMessage('Legal template saved.')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save legal template.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetAsDefault() {
    if (!selectedTemplateId || !selectedIsOrgOwned || !canEdit) return

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const orgTemplates = (templatesByType[packetType] || []).filter((row) => row.organisation_id)
      for (const row of orgTemplates) {
        const shouldBeDefault = row.id === selectedTemplateId
        if (Boolean(row.is_default) !== shouldBeDefault) {
          await updateDocumentPacketTemplate(row.id, {
            isDefault: shouldBeDefault,
            isActive: shouldBeDefault ? true : row.is_active,
          })
        }
      }

      await refreshAll()
      setMessage('Default template updated for this document type.')
    } catch (defaultError) {
      setError(defaultError?.message || 'Unable to set template as default.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestGenerate() {
    if (!templateDetail) return

    try {
      setTestingTemplate(true)
      setError('')
      setMessage('')
      setPreviewState({ loading: true, html: '', warnings: [], critical: [], error: '' })

      const preview = await renderPacketPreview({
        packetType,
        context: buildSamplePreviewContext(packetType),
        template: templateDetail,
        title: `${templateTypeConfig.shortLabel} template validation preview`,
      })

      setPreviewState({
        loading: false,
        html: preview?.previewHtml || '',
        warnings: preview?.warnings || [],
        critical: preview?.critical || [],
        error: '',
      })

      if (preview?.critical?.length) {
        setMessage('Template preview generated with validation blockers. Review the checklist before activation.')
      } else {
        setMessage('Template preview generated using sample data.')
      }
    } catch (previewError) {
      setPreviewState({
        loading: false,
        html: '',
        warnings: [],
        critical: [],
        error: previewError?.message || 'Unable to generate template preview.',
      })
    } finally {
      setTestingTemplate(false)
    }
  }

  async function handleSavePlaceholder(event) {
    event.preventDefault()

    const placeholderKey = normalizeText(placeholderForm.placeholderKey)
    if (!placeholderKey) {
      setError('Merge field key is required.')
      return
    }
    if (!PLACEHOLDER_KEY_PATTERN.test(placeholderKey)) {
      setError('Merge field key can only include letters, numbers, dots, underscores, and hyphens.')
      return
    }

    try {
      setSavingPlaceholder(placeholderKey)
      setError('')
      setMessage('')

      await upsertDocumentPlaceholderDefinition({
        packetType,
        placeholderKey,
        entityScope: normalizeText(placeholderForm.entityScope || 'transaction'),
        dataType: normalizeText(placeholderForm.dataType || 'text'),
        description: normalizeNullableText(placeholderForm.description),
        exampleValue: normalizeNullableText(placeholderForm.exampleValue),
        isRequiredDefault: Boolean(placeholderForm.isRequiredDefault),
        isActive: placeholderForm.isActive !== false,
      })

      await refreshAll()
      setPlaceholderForm({
        placeholderKey: '',
        entityScope: 'transaction',
        dataType: 'text',
        description: '',
        exampleValue: '',
        isRequiredDefault: false,
        isActive: true,
      })
      setMessage('Merge field definition saved.')
    } catch (placeholderError) {
      setError(placeholderError?.message || 'Unable to save merge field definition.')
    } finally {
      setSavingPlaceholder('')
    }
  }

  async function togglePlaceholderFlag(row, field, nextValue) {
    try {
      const rowKey = normalizeText(row?.placeholder_key)
      if (!rowKey) return
      setSavingPlaceholder(rowKey)
      setError('')
      setMessage('')

      await upsertDocumentPlaceholderDefinition({
        packetType: row.packet_type || packetType,
        placeholderKey: row.placeholder_key,
        entityScope: row.entity_scope || 'transaction',
        dataType: row.data_type || 'text',
        description: row.description || '',
        exampleValue: row.example_value || '',
        isRequiredDefault: field === 'isRequiredDefault' ? nextValue : Boolean(row.is_required_default),
        isActive: field === 'isActive' ? nextValue : Boolean(row.is_active),
      })

      await refreshAll()
      setMessage('Merge field updated.')
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update merge field definition.')
    } finally {
      setSavingPlaceholder('')
    }
  }

  async function handleCopyToken(token = '') {
    const normalizedToken = normalizeText(token)
    if (!normalizedToken) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`{{${normalizedToken}}}`)
      }
      setMessage(`Copied {{${normalizedToken}}} to clipboard.`)
    } catch {
      setMessage(`Token ready: {{${normalizedToken}}}`)
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading legal template library…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Legal Templates"
        description="Manage mandate and OTP template lifecycles, merge fields, versioning, and activation rules for legal document generation."
        actions={
          canEdit ? (
            <button
              type="button"
              className="auth-primary-cta"
              onClick={() => void handleCreateTemplate()}
              disabled={creatingTemplate}
            >
              <Plus size={14} />
              <span className="ml-1">{creatingTemplate ? 'Creating…' : 'New Template'}</span>
            </button>
          ) : null
        }
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">
          Read-only for your role. Principal-level administrators can edit legal templates and merge-field governance.
        </SettingsBanner>
      ) : null}

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

      <SettingsSectionCard
        title="Template Type"
        description="Select which legal document family you want to manage in this library."
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
                  'flex h-full min-h-[108px] flex-col rounded-[14px] border p-4 text-left transition duration-150 ease-out',
                  active
                    ? 'border-[#c8d7e6] bg-[#edf3f8] text-[#162334]'
                    : 'border-[#e2eaf3] bg-[#fbfdff] text-[#4f637a] hover:border-[#cfdbe8] hover:bg-white',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em]">
                  <Icon size={16} />
                  <span>{item.shortLabel}</span>
                </div>
                <p className="mt-2 text-base font-semibold text-[#162334]">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{item.subtitle}</p>
              </button>
            )
          })}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Template Library"
        description="One active default template is enforced per document type. Existing packets keep their linked template version."
      >
        {selectedList.length ? (
          <div className="overflow-x-auto rounded-[16px] border border-[#dfe8f1] bg-white">
            <table className="min-w-[860px] w-full text-left text-sm">
              <thead className="bg-[#f6f9fc] text-[0.68rem] uppercase tracking-[0.14em] text-[#6b7d93]">
                <tr>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {selectedList.map((template) => {
                  const active = selectedTemplateId === template.id
                  const status = normalizeTemplateStatus(template)
                  return (
                    <tr
                      key={template.id}
                      className={[
                        'cursor-pointer border-t border-[#ecf1f6] transition duration-150 ease-out',
                        active ? 'bg-[#edf3f8]' : 'hover:bg-[#f9fbff]',
                      ].join(' ')}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#162334]">{template.template_label || template.template_key}</p>
                        <p className="text-xs text-[#6b7d93]">{template.description || template.template_key}</p>
                      </td>
                      <td className="px-4 py-3 text-[#445b73] uppercase tracking-[0.08em]">{template.packet_type || packetType}</td>
                      <td className="px-4 py-3 text-[#445b73]">{template.version_tag || 'v1'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TemplateStatusPill status={status} />
                          {template.is_default ? <TemplateStatusPill status="active">Default</TemplateStatusPill> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#445b73]">{template.organisation_id ? 'Organisation' : 'Global'}</td>
                      <td className="px-4 py-3 text-[#445b73]">{template.updated_at ? new Date(template.updated_at).toLocaleString() : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <SettingsEmptyState
            title="No templates found"
            description="No template records exist for this legal document type yet."
            action={
              canEdit ? (
                <button type="button" className="auth-primary-cta" onClick={() => void handleCreateTemplate()}>
                  <Plus size={14} />
                  <span className="ml-1">Create First Template</span>
                </button>
              ) : null
            }
          />
        )}
      </SettingsSectionCard>

      {selectedTemplate ? (
        <form onSubmit={handleSave} className="space-y-6">
          <SettingsSectionCard
            title="Template Workspace"
            description={selectedIsOrgOwned
              ? 'Manage template metadata, storage path, lifecycle status, and legal clause sections.'
              : 'This template is global and read-only. Create an organisation-owned copy before editing.'}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {!selectedIsOrgOwned && canEdit ? (
                  <button
                    type="button"
                    className="auth-secondary-cta"
                    onClick={() => void handleCreateEditableCopy()}
                    disabled={cloning}
                  >
                    <CopyPlus size={14} />
                    <span className="ml-1">{cloning ? 'Creating…' : 'Create Editable Copy'}</span>
                  </button>
                ) : null}

                {selectedIsOrgOwned && canEdit ? (
                  <button
                    type="button"
                    className="auth-secondary-cta"
                    onClick={() => void handleCreateNextVersion()}
                    disabled={cloning}
                  >
                    <Layers3 size={14} />
                    <span className="ml-1">{cloning ? 'Creating…' : 'New Version'}</span>
                  </button>
                ) : null}

                {selectedIsOrgOwned && canEdit ? (
                  <button
                    type="button"
                    className="auth-secondary-cta"
                    onClick={() => void handleSetAsDefault()}
                    disabled={saving || Boolean(form.isDefault)}
                  >
                    <ShieldCheck size={14} />
                    <span className="ml-1">{form.isDefault ? 'Default Active' : 'Set As Default'}</span>
                  </button>
                ) : null}
              </div>
            }
          >
            <div className={settingsGridClass}>
              <label className={settingsFieldClass}>
                Template label
                <input
                  type="text"
                  value={form.templateLabel}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, templateLabel: event.target.value }))}
                />
              </label>

              <label className={settingsFieldClass}>
                Version tag
                <input
                  type="text"
                  value={form.versionTag}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, versionTag: event.target.value }))}
                />
              </label>

              <label className={settingsFieldClass}>
                Template status
                <select
                  value={form.templateStatus}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, templateStatus: event.target.value }))}
                >
                  {TEMPLATE_STATUS_OPTIONS.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className={settingsFieldClass}>
                Template format
                <select
                  value={form.templateFormat}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, templateFormat: event.target.value }))}
                >
                  <option value="docx">DOCX</option>
                </select>
              </label>

              <label className={settingsFieldClass}>
                Storage bucket
                <input
                  type="text"
                  value={form.templateStorageBucket}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, templateStorageBucket: event.target.value }))}
                />
              </label>

              <label className={settingsFieldClass}>
                Output bucket
                <input
                  type="text"
                  value={form.templateOutputBucket}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, templateOutputBucket: event.target.value }))}
                />
              </label>

              <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                Template storage path
                <input
                  type="text"
                  value={form.templateStoragePath}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, templateStoragePath: event.target.value }))}
                  placeholder="legal-templates/{organisation}/{packetType}/template.docx"
                />
              </label>

              <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                Template file name
                <input
                  type="text"
                  value={form.templateFileName}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, templateFileName: event.target.value }))}
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

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-[12px] border border-[#e2eaf3] bg-[#fbfdff] px-4 py-3 text-sm text-[#445b73]">
                <input
                  type="checkbox"
                  checked={Boolean(form.isActive)}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
                />
                Active template version
              </label>
              <label className="flex items-center gap-3 rounded-[12px] border border-[#e2eaf3] bg-[#fbfdff] px-4 py-3 text-sm text-[#445b73]">
                <input
                  type="checkbox"
                  checked={Boolean(form.isDefault)}
                  disabled={!canEdit || !selectedIsOrgOwned}
                  onChange={(event) => setForm((previous) => ({ ...previous, isDefault: event.target.checked }))}
                />
                Default template for this document type
              </label>
            </div>

            <div className="rounded-[14px] border border-[#e3eaf2] bg-[#f9fbff] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#2e4259]">DOCX Upload</h4>
                  <p className="mt-1 text-xs text-[#6b7d93]">Upload a DOCX template file and save to bind its storage path to this template version.</p>
                </div>
                {canEdit && selectedIsOrgOwned ? (
                  <label className="auth-secondary-cta cursor-pointer">
                    <Upload size={14} />
                    <span className="ml-1">{uploadingTemplate ? 'Uploading…' : 'Upload DOCX'}</span>
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(event) => void handleUploadTemplateFile(event)}
                      disabled={uploadingTemplate}
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#2e4259]">Template Sections</h4>
                {canEdit && selectedIsOrgOwned ? (
                  <button type="button" className="auth-secondary-cta" onClick={addSection}>
                    <Plus size={14} />
                    <span className="ml-1">Add Section</span>
                  </button>
                ) : null}
              </div>

              {(form.sections || []).length ? (
                <div className="space-y-3">
                  {(form.sections || []).map((section, index) => (
                    <div key={`${section.sectionKey}-${index}`} className="rounded-[12px] border border-[#e2eaf3] bg-[#fbfdff] p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className={settingsFieldClass}>
                          Section key
                          <input
                            type="text"
                            value={section.sectionKey}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { sectionKey: event.target.value })}
                          />
                        </label>
                        <label className={settingsFieldClass}>
                          Section label
                          <input
                            type="text"
                            value={section.sectionLabel}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { sectionLabel: event.target.value })}
                          />
                        </label>
                        <label className={settingsFieldClass}>
                          Section type
                          <select
                            value={section.sectionType}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { sectionType: event.target.value })}
                          >
                            <option value="legal_text">Legal Text</option>
                            <option value="dynamic_fields">Dynamic Fields</option>
                            <option value="conditional_clause">Conditional Clause</option>
                            <option value="annexure">Annexure</option>
                            <option value="signature_zone">Signature Zone</option>
                            <option value="metadata">Metadata</option>
                          </select>
                        </label>
                        <label className={settingsFieldClass}>
                          Sort order
                          <input
                            type="number"
                            value={section.sortOrder}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { sortOrder: Number(event.target.value || 0) })}
                          />
                        </label>
                        <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                          Merge fields (comma separated)
                          <input
                            type="text"
                            value={section.placeholderKeysText || ''}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { placeholderKeysText: event.target.value })}
                            placeholder="buyer_full_name, purchase_price"
                          />
                        </label>
                        <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                          Legal text / clause body
                          <textarea
                            rows={4}
                            value={section.legalText}
                            disabled={!canEdit || !selectedIsOrgOwned}
                            onChange={(event) => updateSection(index, { legalText: event.target.value })}
                            placeholder="Include legal clause content and merge fields such as {{buyer_full_name}}"
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

            <div className={settingsActionRowClass}>
              <button
                type="button"
                className="auth-secondary-cta"
                onClick={() => void handleTestGenerate()}
                disabled={!selectedTemplateId || testingTemplate}
              >
                <FlaskConical size={14} />
                <span className="ml-1">{testingTemplate ? 'Testing…' : 'Test Generate'}</span>
              </button>

              <button
                type="submit"
                className="auth-primary-cta"
                disabled={!canEdit || !selectedIsOrgOwned || saving}
              >
                <Save size={14} />
                <span className="ml-1">{saving ? 'Saving…' : 'Save Template Version'}</span>
              </button>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            title="Merge Field Governance"
            description="Manage placeholder definitions for this document type. Required fields are validated during generation."
          >
            <div className="rounded-[14px] border border-[#e3eaf2] bg-[#fbfdff] p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#2e4259]">Canonical Field Registry</h4>
                  <p className="mt-1 text-xs text-[#6b7d93]">Single source of truth for legal merge fields, grouped by category with sample values and alias awareness.</p>
                </div>
                <span className="inline-flex rounded-full border border-[#d8e3ef] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#4f637a]">
                  {canonicalFields.length} canonical fields
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <label className={settingsFieldClass}>
                  Search fields
                  <input
                    type="text"
                    value={mergeFieldSearch}
                    onChange={(event) => setMergeFieldSearch(event.target.value)}
                    placeholder="Search key, label, description..."
                  />
                </label>
                <label className={settingsFieldClass}>
                  Category
                  <select
                    value={mergeFieldCategory}
                    onChange={(event) => setMergeFieldCategory(event.target.value)}
                  >
                    {canonicalCategories.map((category) => (
                      <option key={category} value={category}>
                        {category === 'all' ? 'All Categories' : category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 max-h-[360px] overflow-auto rounded-[12px] border border-[#dfe8f1] bg-white">
                <table className="min-w-[920px] w-full text-left text-sm">
                  <thead className="bg-[#f6f9fc] text-[0.68rem] uppercase tracking-[0.14em] text-[#6b7d93]">
                    <tr>
                      <th className="px-4 py-3">Field</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Required</th>
                      <th className="px-4 py-3">Sample</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCanonicalFields.length ? filteredCanonicalFields.map((field) => {
                      const mappedInRegistry = placeholderRegistry.some((item) => normalizeText(item.placeholder_key) === field.key)
                      return (
                        <tr key={field.key} className="border-t border-[#ecf1f6]">
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-semibold text-[#162334]">{field.key}</p>
                            <p className="text-xs text-[#6b7d93]">{field.label}</p>
                            <p className="text-[11px] text-[#8aa0b7]">{field.description}</p>
                          </td>
                          <td className="px-4 py-3 text-[#4f637a]">{field.category}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] ${field.required ? 'border-[#f3d9a8] bg-[#fff8ec] text-[#9a6a12]' : 'border-[#d7e2ee] bg-white text-[#5f7288]'}`}>
                              {field.required ? 'Required' : 'Optional'}
                            </span>
                            <div className="mt-1 text-[11px] text-[#7f93aa]">
                              {mappedInRegistry ? 'Mapped in registry' : 'Not mapped in registry'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#4f637a]">{canonicalSampleMap[field.key] || field.sampleValue || '—'}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="auth-secondary-cta"
                              onClick={() => void handleCopyToken(field.key)}
                            >
                              Copy
                            </button>
                          </td>
                        </tr>
                      )
                    }) : (
                      <tr>
                        <td className="px-4 py-6 text-sm text-[#6b7d93]" colSpan={5}>
                          No canonical fields match your current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[16px] border border-[#dfe8f1] bg-white">
              <table className="min-w-[860px] w-full text-left text-sm">
                <thead className="bg-[#f6f9fc] text-[0.68rem] uppercase tracking-[0.14em] text-[#6b7d93]">
                  <tr>
                    <th className="px-4 py-3">Merge field</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Required</th>
                    <th className="px-4 py-3">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {placeholderRegistry.length ? placeholderRegistry.map((row) => {
                    const rowKey = normalizeText(row.placeholder_key)
                    const rowSaving = savingPlaceholder === rowKey
                    return (
                      <tr key={`${row.packet_type}-${row.placeholder_key}`} className="border-t border-[#ecf1f6]">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-semibold text-[#162334]">{row.placeholder_key}</p>
                          <p className="text-xs text-[#6b7d93]">{row.description || 'No description yet.'}</p>
                        </td>
                        <td className="px-4 py-3 text-[#445b73]">{row.entity_scope || 'transaction'}</td>
                        <td className="px-4 py-3 text-[#445b73]">{row.data_type || 'text'}</td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-xs text-[#445b73]">
                            <input
                              type="checkbox"
                              checked={Boolean(row.is_required_default)}
                              disabled={!canEdit || rowSaving}
                              onChange={(event) => void togglePlaceholderFlag(row, 'isRequiredDefault', event.target.checked)}
                            />
                            Required
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-xs text-[#445b73]">
                            <input
                              type="checkbox"
                              checked={row.is_active !== false}
                              disabled={!canEdit || rowSaving}
                              onChange={(event) => void togglePlaceholderFlag(row, 'isActive', event.target.checked)}
                            />
                            Active
                          </label>
                        </td>
                      </tr>
                    )
                  }) : (
                    <tr>
                      <td className="px-4 py-6 text-sm text-[#6b7d93]" colSpan={5}>
                        No merge-field definitions yet for this template type.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {canEdit ? (
              <div className="rounded-[14px] border border-[#e3eaf2] bg-[#f9fbff] p-4">
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[#2e4259]">Add Merge Field</h4>
                <div className={settingsGridClass}>
                  <label className={settingsFieldClass}>
                    Placeholder key
                    <input
                      type="text"
                      value={placeholderForm.placeholderKey}
                      onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, placeholderKey: event.target.value }))}
                      placeholder="seller_full_name"
                    />
                  </label>
                  <label className={settingsFieldClass}>
                    Entity scope
                    <input
                      type="text"
                      value={placeholderForm.entityScope}
                      onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, entityScope: event.target.value }))}
                      placeholder="transaction"
                    />
                  </label>
                  <label className={settingsFieldClass}>
                    Data type
                    <input
                      type="text"
                      value={placeholderForm.dataType}
                      onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, dataType: event.target.value }))}
                      placeholder="text"
                    />
                  </label>
                  <label className={settingsFieldClass}>
                    Example value
                    <input
                      type="text"
                      value={placeholderForm.exampleValue}
                      onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, exampleValue: event.target.value }))}
                    />
                  </label>
                  <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                    Description
                    <textarea
                      rows={2}
                      value={placeholderForm.description}
                      onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, description: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-[12px] border border-[#e2eaf3] bg-white px-4 py-3 text-sm text-[#445b73]">
                    <input
                      type="checkbox"
                      checked={Boolean(placeholderForm.isRequiredDefault)}
                      onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, isRequiredDefault: event.target.checked }))}
                    />
                    Required by default
                  </label>
                  <label className="flex items-center gap-3 rounded-[12px] border border-[#e2eaf3] bg-white px-4 py-3 text-sm text-[#445b73]">
                    <input
                      type="checkbox"
                      checked={placeholderForm.isActive !== false}
                      onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, isActive: event.target.checked }))}
                    />
                    Active
                  </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    className="auth-secondary-cta"
                    onClick={(event) => void handleSavePlaceholder(event)}
                    disabled={Boolean(savingPlaceholder)}
                  >
                    <Plus size={14} />
                    <span className="ml-1">{savingPlaceholder ? 'Saving…' : 'Save Merge Field'}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </SettingsSectionCard>

          <SettingsSectionCard
            title="Validation + Test Preview"
            description="Use this checklist before activation to avoid failed generation, missing signer fields, or placeholder mismatches."
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
              <div className="space-y-3 rounded-[14px] border border-[#e3eaf2] bg-[#fbfdff] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#2e4259]">Template Validation</h4>
                  <span className="text-xs text-[#5f7288]">{validationSummary.tokenCount} merge fields detected</span>
                </div>

                {validationSummary.blockers.length ? (
                  <div className="space-y-2">
                    {validationSummary.blockers.map((item) => (
                      <p key={`blocker-${item}`} className="flex items-start gap-2 rounded-[10px] border border-[#f3d1ce] bg-[#fff4f3] px-3 py-2 text-xs text-[#8e1f15]">
                        <XCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="flex items-center gap-2 rounded-[10px] border border-[#ccead8] bg-[#f2fbf5] px-3 py-2 text-xs text-[#1f7a45]">
                    <CheckCircle2 size={14} />
                    No blocking issues detected.
                  </p>
                )}

                {validationSummary.warnings.length ? (
                  <div className="space-y-2">
                    {validationSummary.warnings.map((item) => (
                      <p key={`warning-${item}`} className="flex items-start gap-2 rounded-[10px] border border-[#f4e2bf] bg-[#fff8ec] px-3 py-2 text-xs text-[#7d520d]">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </p>
                    ))}
                  </div>
                ) : null}

                {validationSummary.tokenList.length ? (
                  <div className="rounded-[10px] border border-[#dfe8f1] bg-white p-3">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#6b7d93]">Detected merge fields</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {validationSummary.tokenList.map((token) => (
                        <span
                          key={token}
                          className="inline-flex items-center gap-1 rounded-full border border-[#d9e4ef] bg-[#f7fafd] px-2.5 py-1 text-[0.68rem] font-semibold text-[#35546c]"
                        >
                          <CircleDot size={10} />
                          {token}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[14px] border border-[#e3eaf2] bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#2e4259]">Template Preview / Test Generation</h4>
                  <button
                    type="button"
                    className="auth-secondary-cta"
                    onClick={() => void handleTestGenerate()}
                    disabled={testingTemplate}
                  >
                    <FolderUp size={14} />
                    <span className="ml-1">{testingTemplate ? 'Generating…' : 'Run Test Generate'}</span>
                  </button>
                </div>

                {previewState.loading ? (
                  <SettingsLoadingState compact label="Preparing sample preview…" />
                ) : previewState.error ? (
                  <SettingsBanner tone="error">{previewState.error}</SettingsBanner>
                ) : previewState.html ? (
                  <div className="space-y-3">
                    {previewState.critical.length ? (
                      <SettingsBanner tone="error">Critical validation issues detected in sample preview.</SettingsBanner>
                    ) : null}
                    {previewState.warnings.length ? (
                      <SettingsBanner tone="warning">Sample preview generated with warning-level data gaps.</SettingsBanner>
                    ) : null}
                    <div className="max-h-[420px] overflow-auto rounded-[12px] border border-[#e2eaf3] bg-[#fbfdff] p-4 text-sm leading-6 text-[#233246]">
                      <div dangerouslySetInnerHTML={{ __html: previewState.html }} />
                    </div>
                  </div>
                ) : (
                  <SettingsEmptyState
                    title="Preview not generated yet"
                    description="Run Test Generate to validate the template using safe sample data without affecting live transactions."
                    action={
                      <button
                        type="button"
                        className="auth-secondary-cta"
                        onClick={() => void handleTestGenerate()}
                        disabled={testingTemplate}
                      >
                        <Sparkles size={14} />
                        <span className="ml-1">Run Test Generate</span>
                      </button>
                    }
                  />
                )}
              </div>
            </div>
          </SettingsSectionCard>
        </form>
      ) : null}
    </div>
  )
}
