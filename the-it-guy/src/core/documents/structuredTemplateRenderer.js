export const TEMPLATE_RENDER_MODES = {
  LEGACY_DOCX: 'legacy_docx',
  NATIVE_STRUCTURED: 'native_structured',
}

export const NATIVE_RENDERER_VERSION = '2026.05.14'

function normalizeText(value) {
  return String(value || '').trim()
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderInlineText(value) {
  return escapeHtml(value).replace(/\n/g, '<br />')
}

function resolveTemplateMetadata(template = null) {
  return template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
}

function resolvePublicAssetUrl(value = '', assetBaseUrl = '') {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw
  const path = raw.startsWith('/') ? raw : `/${raw}`
  const base = normalizeText(assetBaseUrl).replace(/\/+$/, '')
  return base ? `${base}${path}` : path
}

function toTitleCase(value) {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function buildMissingToken(label) {
  return `[MISSING: ${label}]`
}

function normalizeTemplateSection(section = {}, index = 0) {
  const metadata = section?.metadata_json && typeof section.metadata_json === 'object'
    ? section.metadata_json
    : section?.metadata && typeof section.metadata === 'object'
      ? section.metadata
      : {}
  const placeholderLabels = metadata?.placeholder_labels && typeof metadata.placeholder_labels === 'object'
    ? metadata.placeholder_labels
    : {}
  const placeholders = Array.isArray(section?.placeholders)
    ? section.placeholders
    : Array.isArray(section?.placeholder_keys)
      ? section.placeholder_keys.map((placeholderKey) => [
          placeholderKey,
          normalizeText(placeholderLabels?.[placeholderKey]) || toTitleCase(placeholderKey),
        ])
      : []

  return {
    key: normalizeText(section?.key || section?.section_key || `section_${index + 1}`),
    label: normalizeText(section?.label || section?.section_label || `Section ${index + 1}`),
    required: section?.required === undefined ? Boolean(section?.is_required ?? true) : Boolean(section.required),
    sectionType: normalizeText(section?.sectionType || section?.section_type || 'legal_text').toLowerCase() || 'legal_text',
    sortOrder: Number.isFinite(Number(section?.sortOrder ?? section?.sort_order))
      ? Number(section?.sortOrder ?? section?.sort_order)
      : index,
    placeholders: placeholders
      .map((entry) => {
        if (Array.isArray(entry)) {
          return [normalizeText(entry[0]), normalizeText(entry[1]) || toTitleCase(entry[0])]
        }
        const placeholderKey = normalizeText(entry)
        return [placeholderKey, toTitleCase(placeholderKey)]
      })
      .filter(([placeholderKey]) => placeholderKey),
    legalText: normalizeText(section?.legalText || section?.legal_text || metadata?.legal_text || ''),
    metadata,
  }
}

export function normalizeTemplateRenderMode(template = null, packetType = '') {
  const metadata = resolveTemplateMetadata(template)
  const explicit =
    normalizeText(template?.render_mode) ||
    normalizeText(template?.renderMode) ||
    normalizeText(metadata?.render_mode) ||
    normalizeText(metadata?.renderMode)

  if (explicit === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) return TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
  if (explicit === TEMPLATE_RENDER_MODES.LEGACY_DOCX) return TEMPLATE_RENDER_MODES.LEGACY_DOCX

  const normalizedPacketType = normalizeText(packetType || template?.packet_type || template?.packetType).toLowerCase()
  if ((normalizedPacketType === 'mandate' || normalizedPacketType.startsWith('commercial_')) && normalizeText(template?.template_format || template?.templateFormat).toLowerCase() === 'html') {
    return TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
  }

  return TEMPLATE_RENDER_MODES.LEGACY_DOCX
}

export function templateUsesNativeRenderer(template = null, packetType = '') {
  return normalizeTemplateRenderMode(template, packetType) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
}

export function resolveTemplateStorageConfig(template = null) {
  const metadata = resolveTemplateMetadata(template)
  return {
    templatePath:
      normalizeText(template?.template_storage_path) ||
      normalizeText(template?.templateStoragePath) ||
      normalizeText(metadata?.template_storage_path) ||
      normalizeText(metadata?.templatePath) ||
      '',
    templateBucket:
      normalizeText(template?.template_storage_bucket) ||
      normalizeText(template?.templateStorageBucket) ||
      normalizeText(metadata?.template_storage_bucket) ||
      normalizeText(metadata?.template_bucket) ||
      normalizeText(metadata?.templateBucket) ||
      '',
    templateFilename:
      normalizeText(template?.template_file_name) ||
      normalizeText(template?.templateFileName) ||
      normalizeText(metadata?.template_file_name) ||
      normalizeText(metadata?.template_filename) ||
      normalizeText(metadata?.templateFilename) ||
      normalizeText(template?.template_label) ||
      normalizeText(template?.template_key) ||
      '',
    outputBucket:
      normalizeText(template?.template_output_bucket) ||
      normalizeText(template?.templateOutputBucket) ||
      normalizeText(metadata?.template_output_bucket) ||
      normalizeText(metadata?.output_bucket) ||
      normalizeText(metadata?.outputBucket) ||
      '',
  }
}

export function templateHasLegacySource(template = null) {
  const config = resolveTemplateStorageConfig(template)
  return Boolean(config.templatePath || (config.templateBucket && config.templateFilename))
}

export function templateHasNativeStructure(template = null) {
  const metadata = resolveTemplateMetadata(template)
  const validation = metadata?.last_render_validation && typeof metadata.last_render_validation === 'object'
    ? metadata.last_render_validation
    : metadata?.lastRenderValidation && typeof metadata.lastRenderValidation === 'object'
      ? metadata.lastRenderValidation
      : {}
  const sectionCount = Number(validation?.sectionCount || 0)
  return Boolean(
    (Array.isArray(template?.sections) && template.sections.length) ||
      sectionCount > 0 ||
      validation?.renderable === true ||
      validation?.isRenderable === true,
  )
}

export function templateIsUsableForGeneration(template = null, packetType = '') {
  if (templateUsesNativeRenderer(template, packetType)) {
    return templateHasNativeStructure(template)
  }
  return templateHasLegacySource(template)
}

function resolvePlaceholderValue(placeholders = {}, key = '', label = '') {
  const payload = placeholders && typeof placeholders === 'object' ? placeholders : {}
  const direct = payload?.[key]
  if (direct !== undefined && direct !== null && direct !== '') return direct
  const underscoreKey = normalizeText(key).replace(/\./g, '_')
  const underscored = payload?.[underscoreKey]
  if (underscored !== undefined && underscored !== null && underscored !== '') return underscored
  if (underscoreKey === 'agency') {
    return (
      payload.agency ||
      payload.agency_display_name ||
      payload.agency_name ||
      payload.agency_legal_name ||
      payload.organisation ||
      payload.organisation_display_name ||
      payload.organisation_name ||
      ''
    )
  }
  if (underscoreKey === 'organisation') {
    return (
      payload.organisation ||
      payload.organisation_display_name ||
      payload.organisation_name ||
      payload.agency ||
      payload.agency_display_name ||
      payload.agency_name ||
      payload.agency_legal_name ||
      ''
    )
  }
  return label ? '' : direct
}

function safeValueOrMissing(placeholders, key, label) {
  const value = resolvePlaceholderValue(placeholders, key, label)
  if (value === null || value === undefined || value === '') {
    return buildMissingToken(label)
  }
  return String(value)
}

function getPreviewField(placeholders, key, label) {
  const value = safeValueOrMissing(placeholders, key, label)
  const missing = value.startsWith('[MISSING:')
  return {
    value,
    html: `<span class="${missing ? 'packet-preview-missing' : ''}">${renderInlineText(value)}</span>`,
    missing,
  }
}

function renderStructuredFieldRows(section, placeholders) {
  const rows = (section.placeholders || []).map(([placeholderKey, placeholderLabel]) => {
    const resolvedValue = safeValueOrMissing(placeholders, placeholderKey, placeholderLabel)
    const missing = resolvedValue.startsWith('[MISSING:')
    return `
      <div class="packet-preview-row">
        <dt>${escapeHtml(placeholderLabel)}</dt>
        <dd class="${missing ? 'packet-preview-missing' : ''}">${renderInlineText(resolvedValue)}</dd>
      </div>
    `
  })

  return `
    <section class="packet-preview-section" data-section-key="${escapeHtml(section.key)}">
      <h3>${escapeHtml(section.label)}</h3>
      <dl>${rows.join('\n')}</dl>
    </section>
  `
}

function renderLegalClauseRows(section, placeholders, sectionIndex) {
  if (section.legalText) {
    return `<p class="legal-preview-paragraph">${renderInlineText(section.legalText)}</p>`
  }

  if (section.key === 'signature_pages') {
    const seller = getPreviewField(placeholders, 'seller_full_name', 'Seller Full Name')
    const agent = getPreviewField(placeholders, 'agent_full_name', 'Agent / Agency Representative')
    return `
      <div class="legal-signature-grid">
        <div class="legal-signature-block">
          <span class="legal-signature-line"></span>
          <strong>Seller</strong>
          <p>${seller.html}</p>
          <small>Date: ____________________</small>
        </div>
        <div class="legal-signature-block">
          <span class="legal-signature-line"></span>
          <strong>Agent / Agency Representative</strong>
          <p>${agent.html}</p>
          <small>Date: ____________________</small>
        </div>
      </div>
    `
  }

  return `
    <ol class="legal-clause-list">
      ${(section.placeholders || [])
        .map(([placeholderKey, placeholderLabel], rowIndex) => {
          const field = getPreviewField(placeholders, placeholderKey, placeholderLabel)
          return `
            <li>
              <span class="legal-clause-number">${sectionIndex}.${rowIndex + 1}</span>
              <span class="legal-clause-label">${escapeHtml(placeholderLabel)}</span>
              <span class="legal-clause-value ${field.missing ? 'packet-preview-missing-inline' : ''}">${field.html}</span>
            </li>
          `
        })
        .join('\n')}
    </ol>
  `
}

function renderMandateSectionHtml(section, placeholders, index) {
  const sectionIndex = index + 1
  return `
    <section class="legal-preview-section" data-section-key="${escapeHtml(section.key)}">
      <h2><span>${sectionIndex}.</span> ${escapeHtml(section.label)}</h2>
      ${renderLegalClauseRows(section, placeholders, sectionIndex)}
    </section>
  `
}

export function renderStructuredTemplate({
  packetType = 'mandate',
  title = '',
  template = null,
  sections = [],
  placeholders = {},
  branding = {},
  assetBaseUrl = '',
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'mandate'
  const normalizedSections = (Array.isArray(sections) ? sections : [])
    .map((section, index) => normalizeTemplateSection(section, index))
    .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))

  if (!normalizedSections.length) {
    const error = new Error('Structured template sections are missing.')
    error.code = 'NATIVE_TEMPLATE_NOT_RENDERABLE'
    throw error
  }

  const safeTitle = normalizeText(title) || `${toTitleCase(packetType)} Document`
  const orgName = normalizeText(branding?.organisationName || branding?.organisation_name) || 'Arch9 Workspace'
  const organisationLogo = resolvePublicAssetUrl(
    normalizeText(branding?.logoLightUrl || branding?.organisationLogoUrl || branding?.logoDarkUrl || branding?.logoHighContrastUrl || branding?.organisationLogoDarkUrl || branding?.organisationLogoHighContrastUrl || branding?.organisation_high_contrast_logo_url || ''),
    assetBaseUrl,
  )
  const bridgeLogoLabel = normalizeText(branding?.bridgeLogoLabel || '') || 'Arch9'
  const bridgeLogoUrl = resolvePublicAssetUrl(branding?.bridgeLogoLightUrl || '/brand/bridge_9_white_background.png', assetBaseUrl)
  const documentReference =
    normalizeText(placeholders.document_reference || placeholders.transaction_reference || placeholders.packet_reference) ||
    safeTitle ||
    'Preview reference pending'
  const isMandatePreview = normalizedPacketType === 'mandate'
  const renderedSections = isMandatePreview
    ? normalizedSections.map((section, index) => renderMandateSectionHtml(section, placeholders, index)).join('\n')
    : normalizedSections.map((section) => renderStructuredFieldRows(section, placeholders)).join('\n')
  const legalPreviewClass = isMandatePreview ? 'packet-preview-shell legal-document-preview-shell' : 'packet-preview-shell'
  const legalBodyClass = isMandatePreview ? 'legal-document-preview-body' : ''

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(safeTitle)}</title>
        <style>
          :root { color-scheme: light; font-family: Helvetica, Arial, sans-serif; }
          body { margin: 0; padding: 24px; background: #f4f7fb; color: #13263a; }
          .packet-preview-shell { margin: 0 auto; max-width: 980px; border: 1px solid #d7e4f2; border-radius: 18px; overflow: hidden; background: #ffffff; box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08); font-family: Helvetica, Arial, sans-serif; }
          .packet-preview-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 18px 20px; border-bottom: 1px solid #dfe9f4; background: linear-gradient(180deg, #ffffff 0%, #f9fbfe 100%); }
          .packet-preview-brand-left { display: flex; align-items: center; gap: 12px; }
          .packet-preview-logo { width: 44px; height: 44px; border: 1px solid #d7e4f2; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; }
          .packet-preview-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
          .packet-preview-bridge { display: inline-flex; flex-direction: row; align-items: flex-end; gap: 0; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #607991; }
          .packet-preview-bridge img { max-width: 128px; max-height: 28px; object-fit: contain; }
          .packet-preview-title { padding: 18px 20px 4px; }
          .packet-preview-title h1 { margin: 0; font-size: 1.35rem; letter-spacing: 0; }
          .packet-preview-title p { margin: 6px 0 0; color: #58708a; font-size: 0.92rem; }
          .packet-preview-content { padding: 18px 20px 22px; display: grid; gap: 14px; }
          .packet-preview-section { border: 1px solid #dfebf6; border-radius: 14px; background: #fcfdff; padding: 12px 14px; }
          .packet-preview-section h3 { margin: 0 0 8px; font-size: 0.9rem; letter-spacing: 0.04em; text-transform: uppercase; color: #607991; }
          .packet-preview-section dl { margin: 0; display: grid; gap: 8px; }
          .packet-preview-row { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 12px; }
          .packet-preview-row dt { font-size: 0.82rem; color: #6b8198; }
          .packet-preview-row dd { margin: 0; font-size: 0.9rem; color: #13263a; font-weight: 550; }
          .packet-preview-missing { color: #8a3b15 !important; background: #fff6df; box-shadow: inset 0 -0.45em 0 rgba(255, 214, 120, 0.32); font-weight: 700 !important; }
          .packet-preview-missing-block, .packet-preview-missing-inline { color: #8a3b15 !important; }
          .legal-document-preview-shell { max-width: 210mm; min-height: 286mm; border-radius: 4px; border-color: #d7d7d7; box-shadow: 0 22px 60px rgba(15, 23, 42, 0.12); }
          .legal-document-preview-shell .packet-preview-header { padding: 18mm 18mm 8mm; border-bottom: 1px solid #d8d8d8; background: #ffffff; }
          .legal-document-preview-shell .packet-preview-logo { width: 34mm; height: 13mm; border: 0; border-radius: 0; }
          .legal-document-preview-shell .packet-preview-logo img { max-width: 34mm; max-height: 13mm; }
          .legal-document-preview-shell .packet-preview-bridge { color: #555; letter-spacing: 0.06em; }
          .legal-document-preview-shell .packet-preview-bridge img { max-width: 36mm; max-height: 12mm; }
          .legal-document-preview-shell .packet-preview-title { padding: 9mm 18mm 6mm; text-align: center; border-bottom: 1px solid #e4e4e4; }
          .legal-document-preview-shell .packet-preview-title h1 { color: #111827; font-size: 24px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
          .legal-document-preview-shell .packet-preview-title p { margin-top: 7px; color: #5c6670; font-size: 12px; line-height: 1.45; }
          .legal-document-preview-body { display: block; padding: 9mm 18mm 16mm; }
          .legal-preview-section { margin: 0 0 9mm; break-inside: avoid; page-break-inside: avoid; }
          .legal-preview-section h2 { margin: 0 0 4mm; padding: 0 0 2mm; border-bottom: 1px solid #d7d7d7; color: #111827; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; line-height: 1.35; text-transform: uppercase; }
          .legal-preview-section h2 span { display: inline-block; min-width: 22px; }
          .legal-preview-paragraph { margin: 0; color: #1f2937; font-size: 13px; line-height: 1.72; }
          .legal-clause-list { display: grid; gap: 3mm; margin: 0; padding: 0; list-style: none; }
          .legal-clause-list li { display: grid; grid-template-columns: 30px minmax(130px, 0.38fr) minmax(0, 1fr); gap: 8px; color: #1f2937; font-size: 12.5px; line-height: 1.55; }
          .legal-clause-number, .legal-clause-label { color: #3f4a56; font-weight: 700; }
          .legal-clause-value { color: #111827; }
          .legal-signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12mm 10mm; margin-top: 13mm; }
          .legal-signature-block { min-height: 34mm; color: #1f2937; font-size: 12px; }
          .legal-signature-line { display: block; border-top: 1px solid #111827; margin-bottom: 3mm; }
          .legal-signature-block strong, .legal-signature-block p, .legal-signature-block small { display: block; margin: 0 0 2mm; }
          .legal-preview-footer { display: flex; align-items: center; justify-content: space-between; gap: 8mm; padding: 5mm 18mm 7mm; border-top: 1px solid #d8d8d8; color: #606a75; font-size: 10.5px; }
          .legal-preview-footer-brand, .legal-preview-footer-bridge { display: inline-flex; align-items: center; min-width: 34mm; max-width: 44mm; }
          .legal-preview-footer-bridge { justify-content: flex-end; }
          .legal-preview-footer img { max-width: 34mm; max-height: 9mm; object-fit: contain; }
          .legal-preview-page-number { flex: 1; text-align: center; font-weight: 700; }
          @media print { body { padding: 0; background: #ffffff; } .legal-document-preview-shell { width: 210mm; min-height: 297mm; border: 0; box-shadow: none; } }
        </style>
      </head>
      <body>
        <article class="${legalPreviewClass}">
          <header class="packet-preview-header">
            <div class="packet-preview-brand-left">
              <span class="packet-preview-logo">${organisationLogo ? `<img src="${escapeHtml(organisationLogo)}" alt="${escapeHtml(orgName)}" />` : escapeHtml(orgName.slice(0, 1) || 'B')}</span>
              <div>
                <strong>${escapeHtml(orgName)}</strong>
                <div class="packet-preview-bridge">
                  ${bridgeLogoUrl ? `<img src="${escapeHtml(bridgeLogoUrl)}" alt="${escapeHtml(bridgeLogoLabel)}" />` : escapeHtml(bridgeLogoLabel)}
                </div>
              </div>
            </div>
          </header>
          <div class="packet-preview-title">
            <h1>${escapeHtml(safeTitle)}</h1>
            <p>${escapeHtml(documentReference)}</p>
          </div>
          <main class="packet-preview-content ${legalBodyClass}">
            ${renderedSections}
          </main>
          <footer class="legal-preview-footer">
            <span class="legal-preview-footer-brand">${organisationLogo ? `<img src="${escapeHtml(organisationLogo)}" alt="${escapeHtml(orgName)}" />` : escapeHtml(orgName)}</span>
            <span class="legal-preview-page-number">${escapeHtml(documentReference)}</span>
            <span class="legal-preview-footer-bridge">${bridgeLogoUrl ? `<img src="${escapeHtml(bridgeLogoUrl)}" alt="${escapeHtml(bridgeLogoLabel)}" />` : escapeHtml(bridgeLogoLabel)}</span>
          </footer>
        </article>
      </body>
    </html>
  `

  return {
    html,
    documentModel: {
      packetType: normalizedPacketType,
      title: safeTitle,
      organisationName: orgName,
      documentReference,
      renderMode: normalizeTemplateRenderMode(template, normalizedPacketType),
      rendererVersion: NATIVE_RENDERER_VERSION,
      sections: normalizedSections,
    },
    renderable: normalizedSections.length > 0,
    blockingIssues: [],
    warnings: [],
    resolvedPlaceholderKeys: Array.from(
      new Set(
        normalizedSections.flatMap((section) => (section.placeholders || []).map(([placeholderKey]) => normalizeText(placeholderKey)).filter(Boolean)),
      ),
    ),
  }
}
