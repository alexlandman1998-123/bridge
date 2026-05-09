export const EMAIL_TEMPLATE_KEYS = {
  CLIENT_ONBOARDING: 'client_onboarding',
  SELLER_ONBOARDING: 'seller_onboarding',
}

const DEFAULT_SECURITY_BODY =
  'Your information and documents are handled securely through Bridge. Only authorised parties involved in your transaction can access your onboarding details.'

export const DEFAULT_EMAIL_TEMPLATE_SETTINGS = {
  [EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING]: {
    templateKey: EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING,
    displayName: 'Client Onboarding',
    subject: 'Complete your Bridge onboarding',
    title: 'Client Onboarding',
    preheader: 'Your Bridge onboarding is ready. Complete your details and documents to continue.',
    introParagraphs: [
      'Your property transaction has been added to Bridge and your onboarding process is now ready to begin.',
      'Bridge is a property transaction platform that keeps buyers, sellers, agents, attorneys, and bond originators connected throughout the process.',
    ],
    capabilityBullets: [
      'Complete your onboarding information',
      'Upload required documents securely',
      'Track transaction progress',
      'Receive updates and next steps from your team',
    ],
    processSteps: [
      'Complete your onboarding information.',
      'Upload the required documents.',
      'Your team reviews and prepares the next steps.',
      'Progress and updates appear in your client portal.',
    ],
    ctaLabel: 'Open Onboarding',
    securityTitle: 'Security & Privacy',
    securityBody: DEFAULT_SECURITY_BODY,
    helpBody: 'Need help? Reply to this email or contact your property representative directly.',
  },
  [EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING]: {
    templateKey: EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING,
    displayName: 'Seller Onboarding',
    subject: 'Complete seller onboarding',
    title: 'Seller Onboarding',
    preheader:
      'Your Bridge seller onboarding is ready. Complete your details to continue mandate and listing preparation.',
    introParagraphs: [
      'Your property sale has been added to Bridge and your onboarding process is now ready to begin.',
      'Bridge is a property transaction platform that keeps sellers, buyers, agents, attorneys, and supporting teams connected throughout the process.',
    ],
    processSteps: [
      'Complete your seller onboarding information.',
      'Upload any required property and seller documents.',
      'Your agent reviews the information and prepares mandate steps.',
      'Progress and updates are shared through your Bridge workspace.',
    ],
    ctaLabel: 'Open Onboarding',
    securityTitle: 'Security & Privacy',
    securityBody: DEFAULT_SECURITY_BODY,
    helpBody: 'Need help? Reply to this email or contact your property representative directly.',
  },
}

function normalizeText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeLines(value, fallback = []) {
  if (Array.isArray(value)) {
    const rows = value.map((item) => String(item || '').trim()).filter(Boolean)
    return rows.length ? rows : fallback
  }

  if (typeof value === 'string') {
    const rows = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
    return rows.length ? rows : fallback
  }

  return fallback
}

function normalizeTemplateConfig(input = {}, fallback) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    ...fallback,
    templateKey: fallback.templateKey,
    displayName: fallback.displayName,
    subject: normalizeText(source.subject, fallback.subject),
    title: normalizeText(source.title, fallback.title),
    preheader: normalizeText(source.preheader, fallback.preheader),
    introParagraphs: normalizeLines(source.introParagraphs, fallback.introParagraphs),
    capabilityBullets: normalizeLines(source.capabilityBullets, fallback.capabilityBullets || []),
    processSteps: normalizeLines(source.processSteps, fallback.processSteps),
    ctaLabel: normalizeText(source.ctaLabel, fallback.ctaLabel),
    securityTitle: normalizeText(source.securityTitle, fallback.securityTitle),
    securityBody: normalizeText(source.securityBody, fallback.securityBody),
    helpBody: normalizeText(source.helpBody, fallback.helpBody),
  }
}

export function sanitizeEmailTemplateSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    [EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING]: normalizeTemplateConfig(
      source[EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING],
      DEFAULT_EMAIL_TEMPLATE_SETTINGS[EMAIL_TEMPLATE_KEYS.CLIENT_ONBOARDING],
    ),
    [EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING]: normalizeTemplateConfig(
      source[EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING],
      DEFAULT_EMAIL_TEMPLATE_SETTINGS[EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING],
    ),
  }
}

export function getDefaultEmailTemplateSettings() {
  return sanitizeEmailTemplateSettings(DEFAULT_EMAIL_TEMPLATE_SETTINGS)
}

export function getEmailTemplateSettingsFromOrganisationSettings(settingsJson = {}) {
  if (!settingsJson || typeof settingsJson !== 'object') {
    return getDefaultEmailTemplateSettings()
  }

  return sanitizeEmailTemplateSettings(settingsJson.emailTemplates || {})
}
