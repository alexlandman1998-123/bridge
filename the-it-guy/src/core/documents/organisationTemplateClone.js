import {
  buildCanonicalTemplateDefinition,
  validateCanonicalTemplateDefinition,
} from './canonicalTemplateDefinition.js'

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function key(value, fallback = 'variant') {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback
}

function withoutLegacyStorageMetadata(metadata = {}) {
  const next = metadata && typeof metadata === 'object' ? { ...metadata } : {}
  for (const field of [
    'template_storage_bucket', 'template_bucket', 'templateBucket',
    'template_storage_path', 'templatePath',
    'template_file_name', 'template_filename', 'templateFilename',
  ]) delete next[field]
  return next
}

export function buildOrganisationTemplateCloneInput(sourceTemplate = {}, {
  templateLabel = '',
  description = '',
  variantLabel = '',
  templateKey = '',
  now = Date.now(),
} = {}) {
  const definition = buildCanonicalTemplateDefinition(sourceTemplate)
  const validation = validateCanonicalTemplateDefinition(definition)
  if (!validation.valid) {
    const error = new Error(`Source template is invalid: ${validation.blockers[0]}`)
    error.code = 'INVALID_TEMPLATE_CLONE_SOURCE'
    error.blockers = validation.blockers
    throw error
  }
  if (definition.sourceMode !== 'native') {
    const error = new Error('Only native structured templates can be copied into the company template builder.')
    error.code = 'LEGACY_TEMPLATE_CLONE_BLOCKED'
    throw error
  }

  const sourceMetadata = withoutLegacyStorageMetadata(sourceTemplate.metadata_json || sourceTemplate.metadataJson || {})
  const sourceTemplateId = text(sourceTemplate.id || definition.templateId) || null
  const baseTemplateId = text(sourceMetadata.base_template_id || sourceMetadata.source_template_id) || sourceTemplateId
  const resolvedVariantLabel = text(variantLabel)
  const resolvedLabel = text(templateLabel) || `${definition.name} Copy`
  const suffix = resolvedVariantLabel ? key(resolvedVariantLabel) : 'company'
  const timestamp = Number.isFinite(Number(now)) ? Math.trunc(Number(now)) : Date.now()

  return {
    packetType: definition.documentType,
    moduleType: definition.moduleType || 'agency',
    templateKey: key(templateKey, `${definition.templateKey}_${suffix}_${timestamp}`),
    templateLabel: resolvedLabel,
    description: text(description) || `Company-owned editable copy of ${definition.name}.`,
    versionTag: 'v1',
    templateStatus: 'draft',
    templateFormat: 'structured',
    templateStorageBucket: null,
    templateStoragePath: null,
    templateFileName: null,
    isDefault: false,
    isActive: false,
    metadataJson: {
      ...sourceMetadata,
      lifecycle_status: 'draft',
      template_status: 'draft',
      render_mode: 'native_structured',
      native_template: true,
      inherit_organisation_branding: definition.branding?.inheritOrganisationBranding !== false,
      branding: definition.branding || { inheritOrganisationBranding: true },
      default_signer_roles: definition.defaultSignerRoles || [],
      source_template_id: baseTemplateId,
      base_template_id: baseTemplateId,
      clone_parent_template_id: sourceTemplateId,
      source_template_key: definition.templateKey,
      source_template_version: definition.version,
      company_template_variant: true,
      company_variant_label: resolvedVariantLabel || null,
      cloned_at: new Date(timestamp).toISOString(),
    },
    sections: definition.sections.map((section, index) => ({
      sectionKey: section.key,
      sectionLabel: section.label,
      sectionType: section.type,
      sortOrder: index,
      isRequired: Boolean(section.required),
      isRepeatable: Boolean(section.repeatable),
      conditionJson: section.condition || {},
      placeholderKeys: (section.mergeFields || []).map((field) => field.key).filter(Boolean),
      legalText: String(section.content || ''),
      metadataJson: {
        ...(section.metadata && typeof section.metadata === 'object' ? section.metadata : {}),
        editable: section.editable !== false,
        custom: Boolean(section.custom),
        company_owned_copy: true,
        planned_signing_fields: Array.isArray(section.signingFields) ? section.signingFields : [],
        signing: {
          ...(
            section.metadata?.signing && typeof section.metadata.signing === 'object'
              ? section.metadata.signing
              : {}
          ),
          signing_fields: Array.isArray(section.signingFields) ? section.signingFields : [],
        },
      },
    })),
  }
}
