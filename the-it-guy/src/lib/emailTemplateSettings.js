export const EMAIL_TEMPLATE_KEYS = {
  CLIENT_ONBOARDING: 'client_onboarding',
  SELLER_ONBOARDING: 'seller_onboarding',
}

const DEFAULT_CLIENT_SECURITY_BODY =
  'Your information and documents are handled securely through Bridge. Only authorised parties involved in your transaction can access your onboarding details.'

const DEFAULT_SELLER_SECURITY_BODY =
  'Your information is securely stored and only shared with authorised parties involved in your property sale.'

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
    securityBody: DEFAULT_CLIENT_SECURITY_BODY,
    helpBody: 'Need help? Reply to this email or contact your property representative directly.',
  },
  [EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING]: {
    templateKey: EMAIL_TEMPLATE_KEYS.SELLER_ONBOARDING,
    displayName: 'Seller Onboarding',
    subject: 'Complete your seller information',
    title: 'Your Property Sale Starts Here',
    preheader:
      'Your agent has invited you to complete seller information for your property.',
    introParagraphs: [
      'Your agent has invited you to complete the seller onboarding process for your property.',
      'This should only take a few minutes and helps ensure your property sale progresses smoothly from the start.',
      'To get everything ready, we need a few details and any available property documents from you.',
    ],
    processSteps: [
      'Complete your seller information.',
      'Upload any available property documents.',
      "Your agent reviews everything and prepares the property for listing.",
      "We'll keep you updated as your sale progresses.",
    ],
    ctaLabel: 'Complete Seller Information',
    securityTitle: 'Trust & Security',
    securityBody: DEFAULT_SELLER_SECURITY_BODY,
    helpBody: 'Need help? Reply to this email or contact your agent directly.',
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
