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

function renderLegalTextWithPlaceholders(value = '', placeholders = {}) {
  return escapeHtml(value)
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => {
      const placeholderKey = normalizeText(token)
      if (!placeholderKey) return ''
      const resolvedValue = safeValueOrMissing(placeholders, placeholderKey, placeholderKey)
      const missing = resolvedValue.startsWith('[MISSING:')
      return `<span class="${missing ? 'packet-preview-missing' : ''}">${escapeHtml(resolvedValue)}</span>`
    })
    .replace(/\n/g, '<br />')
}

function isMarkdownTableLine(line = '') {
  return /^\s*\|.*\|\s*$/.test(String(line || ''))
}

function getMarkdownTableCells(line = '') {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line = '') {
  const cells = getMarkdownTableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderMarkdownTable(rows = [], placeholders = {}) {
  if (!rows.length) return ''
  const [header = [], ...bodyRows] = rows
  return `
    <table class="legal-preview-table">
      <thead>
        <tr>${header.map((cell) => `<th>${renderLegalTextWithPlaceholders(cell, placeholders)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${renderLegalTextWithPlaceholders(cell, placeholders)}</td>`).join('')}</tr>`).join('\n')}
      </tbody>
    </table>
  `
}

function renderLegalTextBlocks(value = '', placeholders = {}) {
  const lines = String(value || '').split(/\r?\n/)
  const blocks = []
  let paragraphLines = []
  const flushParagraph = () => {
    if (!paragraphLines.length) return
    const paragraphText = paragraphLines.join('\n').trim()
    if (paragraphText) {
      blocks.push(`<p class="legal-preview-paragraph">${renderLegalTextWithPlaceholders(paragraphText, placeholders)}</p>`)
    }
    paragraphLines = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const nextLine = lines[index + 1]
    if (isMarkdownTableLine(line) && isMarkdownTableSeparator(nextLine)) {
      flushParagraph()
      const tableRows = [getMarkdownTableCells(line)]
      index += 2
      while (index < lines.length && isMarkdownTableLine(lines[index])) {
        tableRows.push(getMarkdownTableCells(lines[index]))
        index += 1
      }
      index -= 1
      blocks.push(renderMarkdownTable(tableRows, placeholders))
      continue
    }
    paragraphLines.push(line)
  }

  flushParagraph()
  return blocks.join('\n')
}

function getSectionSigningMetadata(section = {}) {
  const metadata = section?.metadata && typeof section.metadata === 'object' ? section.metadata : {}
  return metadata.signing && typeof metadata.signing === 'object' ? metadata.signing : metadata
}

function getSectionSigningRequirement(section = {}) {
  const signing = getSectionSigningMetadata(section)
  const requirement = normalizeText(signing.signing_requirement || signing.signingRequirement).toLowerCase()
  if (requirement === 'client_signature') return 'client_signature'
  if (requirement === 'client_initial') return 'client_initial'
  if (signing.requires_signature || signing.requiresSignature) return 'client_signature'
  if (signing.requires_initial || signing.requiresInitial) return 'client_initial'
  return 'none'
}

function getDefaultClientSigningPlaceholderKey(packetType = 'otp', requirement = 'client_initial') {
  const partyPrefix = normalizeText(packetType).toLowerCase() === 'mandate' ? 'seller' : 'buyer'
  return requirement === 'client_signature' ? `${partyPrefix}_signature` : `${partyPrefix}_initials`
}

function renderSectionSigningRequirement(section = {}, placeholders = {}, packetType = 'otp') {
  const requirement = getSectionSigningRequirement(section)
  if (requirement === 'none') return ''
  const signing = getSectionSigningMetadata(section)
  const placeholderKey = normalizeText(
    requirement === 'client_signature'
      ? signing.signature_placeholder_key || signing.signaturePlaceholderKey
      : signing.initial_placeholder_key || signing.initialPlaceholderKey,
  ) || getDefaultClientSigningPlaceholderKey(packetType, requirement)
  const label = requirement === 'client_signature' ? 'Client signature' : 'Client initials'
  return `
    <div class="legal-section-signing-requirement">
      <span class="legal-section-signing-label">${escapeHtml(label)}</span>
      <span class="legal-section-signing-line">${renderLegalTextWithPlaceholders(`{{${placeholderKey}}}`, placeholders)}</span>
    </div>
  `
}

function appendSectionSigningRequirement(content = '', section = {}, placeholders = {}, packetType = 'otp') {
  return [
    content,
    renderSectionSigningRequirement(section, placeholders, packetType),
  ].filter(Boolean).join('\n')
}

function compactJoin(values = [], separator = ', ') {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(separator)
}

function renderContactIcon(type = '') {
  const common = 'aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
  if (type === 'website') {
    return `<svg ${common}><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c2.2 2.4 3.4 5.4 3.4 9s-1.2 6.6-3.4 9"></path><path d="M12 3c-2.2 2.4-3.4 5.4-3.4 9s1.2 6.6 3.4 9"></path></svg>`
  }
  if (type === 'email') {
    return `<svg ${common}><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>`
  }
  if (type === 'address') {
    return `<svg ${common}><path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11z"></path><circle cx="12" cy="10" r="2.4"></circle></svg>`
  }
  return `<svg ${common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"></path></svg>`
}

function resolveDocumentContactItems(branding = {}, placeholders = {}) {
  const address = firstText(
    branding.physicalAddress,
    branding.physical_address,
    branding.organisationPhysicalAddress,
    branding.organisation_physical_address,
    branding.address,
    compactJoin([branding.addressLine1, branding.addressLine2, branding.city, branding.province, branding.postalCode]),
    placeholders.organisation_physical_address,
    placeholders['organisation.physical_address'],
    placeholders.agency_address,
  )
  const items = [
    ['website', firstText(branding.website, branding.organisationWebsite, branding.organisation_website, branding.companyWebsite, placeholders.organisation_website, placeholders['organisation.website'], placeholders.agency_website)],
    ['email', firstText(branding.email, branding.organisationEmail, branding.organisation_email, branding.contactEmail, branding.companyEmail, placeholders.organisation_email, placeholders['organisation.email'], placeholders.agency_email)],
    ['address', address],
    ['phone', firstText(branding.telephone, branding.phoneNumber, branding.phone_number, branding.phone, branding.telephoneNumber, branding.contactPhone, branding.organisationPhone, branding.organisation_phone, placeholders.organisation_phone, placeholders.organisation_telephone, placeholders['organisation.phone'], placeholders.agency_phone)],
  ]
  return items
    .map(([type, value]) => ({ type, value: normalizeText(value) }))
    .filter((item) => item.value)
}

function renderDocumentContactRow(items = []) {
  if (!items.length) return ''
  return `
    <div class="document-contact-row">
      ${items.map((item) => `
        <span class="document-contact-item">
          <span class="document-contact-icon">${renderContactIcon(item.type)}</span>
          <span class="document-contact-value">${renderInlineText(item.value)}</span>
        </span>
      `).join('\n')}
    </div>
  `
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

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function formatOwnershipShare(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  return text.includes('%') ? text : `${text}%`
}

function combineName(...values) {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(' ')
}

function normalizePartyRecord(source = {}, { role = 'Party', title = '' } = {}) {
  const payload = asRecord(source)
  const partyRole = firstText(payload.role, role)
  const name = firstText(
    payload.fullName,
    payload.full_name,
    payload.displayName,
    payload.display_name,
    payload.name,
    payload.legalName,
    payload.legal_name,
    combineName(payload.firstName, payload.lastName),
    combineName(payload.first_name, payload.last_name),
    combineName(payload.name, payload.surname),
  )
  const idNumber = firstText(
    payload.idNumber,
    payload.id_number,
    payload.identityNumber,
    payload.identity_number,
    payload.registrationNumber,
    payload.registration_number,
    payload.companyRegistrationNumber,
    payload.company_registration_number,
    payload.trustRegistrationNumber,
    payload.trust_registration_number,
    payload.passportNumber,
    payload.passport_number,
  )
  const normalized = {
    role: partyRole,
    title: firstText(payload.title, payload.label, title, partyRole),
    name,
    idNumber,
    email: firstText(payload.email, payload.emailAddress, payload.email_address),
    phone: firstText(payload.phone, payload.mobile, payload.mobileNumber, payload.mobile_number),
    capacity: firstText(payload.capacity, payload.signingCapacity, payload.signing_capacity, payload.roleTitle, payload.role_title),
    ownershipShare: formatOwnershipShare(firstText(payload.ownershipShare, payload.ownership_share, payload.share)),
    organisationName: firstText(payload.organisationName, payload.organisation_name, payload.organizationName, payload.agencyName),
    ffcNumber: firstText(payload.ffcNumber, payload.ffc_number, payload.fidelityFundCertificateNumber),
  }
  return [name, idNumber, normalized.email, normalized.phone, normalized.capacity, normalized.ownershipShare, normalized.organisationName, normalized.ffcNumber].some((value) => normalizeText(value)) ? normalized : null
}

function dedupePartyRecords(parties = []) {
  const seen = new Set()
  return parties.filter((party) => {
    if (!party) return false
    const key = [party.name, party.idNumber, party.email].map((value) => normalizeText(value).toLowerCase()).filter(Boolean).join('|')
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

function normalizePlaceholderParties(value = []) {
  return Array.isArray(value)
    ? dedupePartyRecords(value.map((party, index) => normalizePartyRecord(party, {
        role: party?.role || 'Party',
        title: party?.title || party?.label || `Party ${index + 1}`,
      })))
    : []
}

function buildPartyField(label, value, { required = false } = {}) {
  const resolved = normalizeText(value)
  const missing = required && !resolved
  if (!resolved && !required) return null
  return {
    label,
    value: missing ? buildMissingToken(label) : resolved,
    missing,
  }
}

function renderPartyCardGrid(groups = [], { compact = false } = {}) {
  const normalizedGroups = groups
    .map((group) => ({
      label: normalizeText(group.label),
      parties: Array.isArray(group.parties) ? group.parties.filter(Boolean) : [],
    }))
    .filter((group) => group.parties.length)
  if (!normalizedGroups.length) return ''

  return normalizedGroups.map((group) => `
    <div class="party-card-group">
      ${group.label ? `<h4>${escapeHtml(group.label)}</h4>` : ''}
      <div class="party-card-grid ${compact ? 'party-card-grid-compact' : ''}">
        ${group.parties.map((party, index) => {
          const fields = [
            buildPartyField('Name', party.name, { required: true }),
            buildPartyField('ID / Registration', party.idNumber, { required: party.role !== 'Agent' }),
            buildPartyField('Email', party.email, { required: party.role !== 'Agent' }),
            buildPartyField('Phone', party.phone),
            buildPartyField('Capacity', party.capacity),
            buildPartyField('Ownership', party.ownershipShare),
            buildPartyField('Organisation', party.organisationName),
            buildPartyField('FFC number', party.ffcNumber),
          ].filter(Boolean)
          return `
            <article class="party-card">
              <h5>${escapeHtml(party.title || party.role || `Party ${index + 1}`)}</h5>
              <dl>
                ${fields.map((field) => `
                  <div class="party-card-row">
                    <dt>${escapeHtml(field.label)}</dt>
                    <dd class="${field.missing ? 'packet-preview-missing' : ''}">${renderInlineText(field.value)}</dd>
                  </div>
                `).join('\n')}
              </dl>
            </article>
          `
        }).join('\n')}
      </div>
    </div>
  `).join('\n')
}

function getPartyGroupsForSection(section, placeholders = {}, packetType = 'mandate') {
  const sectionKey = normalizeText(section?.key)
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'mandate'
  if (normalizedPacketType !== 'mandate' && sectionKey === 'buyer_details') {
    const buyerParties = normalizePlaceholderParties(placeholders.buyer_parties)
    const fallbackBuyer = normalizePartyRecord({
      title: 'Buyer',
      name: placeholders.buyer_full_name,
      idNumber: placeholders.buyer_id_number,
      email: placeholders.buyer_email,
      phone: placeholders.buyer_phone,
    }, { role: 'Buyer', title: 'Buyer' })
    const parties = buyerParties.length ? buyerParties : [fallbackBuyer].filter(Boolean)
    return parties.length ? [{ label: '', parties }] : []
  }
  if (normalizedPacketType !== 'mandate' && sectionKey === 'seller_details') {
    const sellerParties = normalizePlaceholderParties(placeholders.seller_parties)
    const fallbackSeller = normalizePartyRecord({
      title: 'Seller',
      name: placeholders.seller_full_name,
      idNumber: placeholders.seller_id_number,
      email: placeholders.seller_email,
      phone: placeholders.seller_phone,
    }, { role: 'Seller', title: 'Seller' })
    const parties = sellerParties.length ? sellerParties : [fallbackSeller].filter(Boolean)
    return parties.length ? [{ label: '', parties }] : []
  }
  if (normalizedPacketType === 'mandate' && sectionKey === 'parties') {
    const sellerParties = normalizePlaceholderParties(placeholders.seller_parties)
    const fallbackSeller = normalizePartyRecord({
      title: 'Seller',
      name: placeholders.seller_full_name,
      idNumber: placeholders.seller_id_number,
      email: placeholders.seller_email,
      phone: placeholders.seller_phone,
    }, { role: 'Seller', title: 'Seller' })
    const sellers = sellerParties.length ? sellerParties : [fallbackSeller].filter(Boolean)
    const agentParty = normalizePartyRecord({
      role: 'Agent',
      title: 'Agent / Agency',
      name: placeholders.agent_full_name,
      email: placeholders.agent_email,
      phone: placeholders.agent_phone,
      organisationName: placeholders.organisation_name || placeholders.organisation_display_name || placeholders.agency_display_name,
      ffcNumber: placeholders.agent_ffc_number,
    }, {
      role: 'Agent',
      title: 'Agent / Agency',
    })
    return [
      sellers.length ? { label: 'Sellers', parties: sellers } : null,
      agentParty ? { label: 'Agency', parties: [agentParty] } : null,
    ].filter(Boolean)
  }
  return []
}

function renderStructuredFieldRows(section, placeholders, packetType = 'otp') {
  const partyContent = renderPartyCardGrid(getPartyGroupsForSection(section, placeholders, packetType))
  if (partyContent) {
    return `
      <section class="packet-preview-section" data-section-key="${escapeHtml(section.key)}">
        <h3>${escapeHtml(section.label)}</h3>
        ${partyContent}
      </section>
    `
  }

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

function renderLegalClauseRows(section, placeholders, sectionIndex, packetType = 'mandate') {
  if (section.key === 'parties') {
    const partyContent = renderPartyCardGrid(getPartyGroupsForSection(section, placeholders, packetType), { compact: true })
    if (partyContent) return appendSectionSigningRequirement(partyContent, section, placeholders, packetType)
  }

  if (section.legalText) {
    return appendSectionSigningRequirement(renderLegalTextBlocks(section.legalText, placeholders), section, placeholders, packetType)
  }

  if (section.key === 'signature_pages') {
    const seller = getPreviewField(placeholders, 'seller_full_name', 'Seller Full Name')
    const agent = getPreviewField(placeholders, 'agent_full_name', 'Agent / Agency Representative')
    return appendSectionSigningRequirement(`
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
    `, section, placeholders, packetType)
  }

  return appendSectionSigningRequirement(`
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
  `, section, placeholders, packetType)
}

function renderMandateSectionHtml(section, placeholders, index, packetType = 'mandate') {
  const sectionIndex = index + 1
  return `
    <section class="legal-preview-section" data-section-key="${escapeHtml(section.key)}">
      <h2><span>${sectionIndex}.</span> ${escapeHtml(section.label)}</h2>
      ${renderLegalClauseRows(section, placeholders, sectionIndex, packetType)}
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
  const orgName = normalizeText(branding?.organisationName || branding?.organisation_name) || 'Organisation'
  const organisationLogo = resolvePublicAssetUrl(
    normalizeText(branding?.logoLightUrl || branding?.organisationLogoUrl || branding?.logoDarkUrl || branding?.logoHighContrastUrl || branding?.organisationLogoDarkUrl || branding?.organisationLogoHighContrastUrl || branding?.organisation_high_contrast_logo_url || ''),
    assetBaseUrl,
  )
  const contactItems = resolveDocumentContactItems(branding, placeholders)
  const documentReference =
    normalizeText(placeholders.document_reference || placeholders.transaction_reference || placeholders.packet_reference) ||
    safeTitle ||
    'Preview reference pending'
  const isLegalDocumentPreview = ['mandate', 'otp'].includes(normalizedPacketType)
  const renderedSections = isLegalDocumentPreview
    ? normalizedSections.map((section, index) => renderMandateSectionHtml(section, placeholders, index, normalizedPacketType)).join('\n')
    : normalizedSections.map((section) => renderStructuredFieldRows(section, placeholders, normalizedPacketType)).join('\n')
  const legalPreviewClass = isLegalDocumentPreview ? 'packet-preview-shell legal-document-preview-shell' : 'packet-preview-shell'
  const legalBodyClass = isLegalDocumentPreview ? 'legal-document-preview-body' : ''

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
          .document-contact-row { display: inline-flex; align-items: center; justify-content: flex-end; gap: 14px; min-width: 0; color: #13263a; font-size: 0.76rem; line-height: 1.35; }
          .document-contact-item { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 260px; }
          .document-contact-icon { display: inline-flex; width: 15px; height: 15px; flex: 0 0 15px; color: #111827; }
          .document-contact-icon svg { width: 15px; height: 15px; }
          .document-contact-value { min-width: 0; overflow-wrap: anywhere; }
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
          .party-card-group { display: grid; gap: 8px; }
          .party-card-group + .party-card-group { margin-top: 12px; }
          .party-card-group h4 { margin: 0; color: #3f4a56; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
          .party-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .party-card { border: 1px solid #d9e5f1; border-radius: 10px; background: #ffffff; padding: 10px 12px; break-inside: avoid; page-break-inside: avoid; }
          .party-card h5 { margin: 0 0 8px; color: #13263a; font-size: 0.9rem; font-weight: 750; }
          .party-card dl { display: grid; gap: 5px; margin: 0; }
          .party-card-row { display: grid; grid-template-columns: minmax(92px, 0.42fr) minmax(0, 1fr); gap: 8px; align-items: start; }
          .party-card-row dt { color: #6b8198; font-size: 0.78rem; }
          .party-card-row dd { margin: 0; color: #13263a; font-size: 0.84rem; font-weight: 650; overflow-wrap: anywhere; }
          .packet-preview-missing { color: #8a3b15 !important; background: #fff6df; box-shadow: inset 0 -0.45em 0 rgba(255, 214, 120, 0.32); font-weight: 700 !important; }
          .packet-preview-missing-block, .packet-preview-missing-inline { color: #8a3b15 !important; }
          .legal-document-preview-shell { max-width: 210mm; min-height: 286mm; border-radius: 4px; border-color: #d7d7d7; box-shadow: 0 22px 60px rgba(15, 23, 42, 0.12); }
          .legal-document-preview-shell .packet-preview-header { padding: 18mm 18mm 8mm; border-bottom: 1px solid #d8d8d8; background: #ffffff; }
          .legal-document-preview-shell .packet-preview-brand-left { min-width: 0; flex: 0 0 auto; }
          .legal-document-preview-shell .packet-preview-logo { width: auto; min-width: 34mm; max-width: 48mm; height: 15mm; border: 0; border-radius: 0; }
          .legal-document-preview-shell .packet-preview-logo img { max-width: 48mm; max-height: 15mm; }
          .legal-document-preview-shell .packet-preview-logo strong { color: #111827; font-size: 15px; line-height: 1.15; }
          .legal-document-preview-shell .document-contact-row { flex: 1 1 auto; gap: 5mm; font-size: 10.5px; }
          .legal-document-preview-shell .document-contact-item { max-width: 42mm; gap: 2mm; }
          .legal-document-preview-shell .document-contact-icon, .legal-document-preview-shell .document-contact-icon svg { width: 4mm; height: 4mm; }
          .legal-document-preview-shell .packet-preview-title { padding: 9mm 18mm 6mm; text-align: center; border-bottom: 1px solid #e4e4e4; }
          .legal-document-preview-shell .packet-preview-title h1 { color: #111827; font-size: 24px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
          .legal-document-preview-shell .packet-preview-title p { margin-top: 7px; color: #5c6670; font-size: 12px; line-height: 1.45; }
          .legal-document-preview-body { display: block; padding: 9mm 18mm 16mm; }
          .legal-preview-section { margin: 0 0 9mm; break-inside: avoid; page-break-inside: avoid; }
          .legal-preview-section h2 { margin: 0 0 4mm; padding: 0 0 2mm; border-bottom: 1px solid #d7d7d7; color: #111827; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; line-height: 1.35; text-transform: uppercase; }
          .legal-preview-section h2 span { display: inline-block; min-width: 22px; }
          .legal-preview-paragraph { margin: 0; color: #1f2937; font-size: 13px; line-height: 1.72; }
          .legal-preview-paragraph + .legal-preview-table, .legal-preview-table + .legal-preview-paragraph { margin-top: 4mm; }
          .legal-preview-table { width: 100%; border-collapse: collapse; color: #1f2937; font-size: 12px; line-height: 1.45; }
          .legal-preview-table th, .legal-preview-table td { border: 1px solid #d7d7d7; padding: 2.5mm 3mm; text-align: left; vertical-align: top; }
          .legal-preview-table th { background: #f6f7f8; color: #111827; font-weight: 700; }
          .legal-section-signing-requirement { display: grid; grid-template-columns: minmax(34mm, 0.3fr) minmax(0, 1fr); gap: 4mm; align-items: end; margin-top: 5mm; color: #1f2937; font-size: 12px; break-inside: avoid; page-break-inside: avoid; }
          .legal-section-signing-label { color: #3f4a56; font-weight: 700; }
          .legal-section-signing-line { min-height: 8mm; border-bottom: 1px solid #111827; padding-bottom: 1.5mm; }
          .legal-clause-list { display: grid; gap: 3mm; margin: 0; padding: 0; list-style: none; }
          .legal-clause-list li { display: grid; grid-template-columns: 30px minmax(130px, 0.38fr) minmax(0, 1fr); gap: 8px; color: #1f2937; font-size: 12.5px; line-height: 1.55; }
          .legal-clause-number, .legal-clause-label { color: #3f4a56; font-weight: 700; }
          .legal-clause-value { color: #111827; }
          .legal-document-preview-shell .party-card-group { gap: 3mm; }
          .legal-document-preview-shell .party-card-group + .party-card-group { margin-top: 5mm; }
          .legal-document-preview-shell .party-card-group h4 { color: #3f4a56; font-size: 11px; }
          .legal-document-preview-shell .party-card-grid { gap: 3mm; }
          .legal-document-preview-shell .party-card { border-color: #d7d7d7; border-radius: 2mm; padding: 3mm; }
          .legal-document-preview-shell .party-card h5 { font-size: 12px; margin-bottom: 2mm; }
          .legal-document-preview-shell .party-card dl { gap: 1.5mm; }
          .legal-document-preview-shell .party-card-row { grid-template-columns: minmax(28mm, 0.42fr) minmax(0, 1fr); gap: 2mm; }
          .legal-document-preview-shell .party-card-row dt, .legal-document-preview-shell .party-card-row dd { font-size: 11px; line-height: 1.4; }
          .legal-signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12mm 10mm; margin-top: 13mm; }
          .legal-signature-block { min-height: 34mm; color: #1f2937; font-size: 12px; }
          .legal-signature-line { display: block; border-top: 1px solid #111827; margin-bottom: 3mm; }
          .legal-signature-block strong, .legal-signature-block p, .legal-signature-block small { display: block; margin: 0 0 2mm; }
          .legal-preview-footer { display: flex; align-items: center; justify-content: space-between; gap: 8mm; padding: 5mm 18mm 7mm; border-top: 1px solid #d8d8d8; color: #606a75; font-size: 10.5px; }
          .legal-preview-footer-brand, .legal-preview-footer-spacer { display: inline-flex; align-items: center; min-width: 34mm; max-width: 44mm; }
          .legal-preview-footer img { max-width: 34mm; max-height: 9mm; object-fit: contain; }
          .legal-preview-page-number { flex: 1; text-align: center; font-weight: 700; }
          @media print { body { padding: 0; background: #ffffff; } .legal-document-preview-shell { width: 210mm; min-height: 297mm; border: 0; box-shadow: none; } }
          @media (max-width: 780px) { .packet-preview-header { flex-wrap: wrap; } .document-contact-row { justify-content: flex-start; flex-wrap: wrap; gap: 8px 12px; width: 100%; } .document-contact-item { max-width: 100%; } .party-card-grid { grid-template-columns: 1fr; } .party-card-row { grid-template-columns: 1fr; gap: 3px; } }
        </style>
      </head>
      <body>
        <article class="${legalPreviewClass}">
          <header class="packet-preview-header">
            <div class="packet-preview-brand-left">
              <span class="packet-preview-logo">${organisationLogo ? `<img src="${escapeHtml(organisationLogo)}" alt="${escapeHtml(orgName)}" />` : `<strong>${escapeHtml(orgName)}</strong>`}</span>
            </div>
            ${renderDocumentContactRow(contactItems)}
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
            <span class="legal-preview-footer-spacer"></span>
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
