export type WebsiteLeadIntent = 'buy' | 'sell' | 'rent' | 'other'

const supportedIntents = new Set<WebsiteLeadIntent>(['buy', 'sell', 'rent', 'other'])

/**
 * Keep the public API permissive enough for older website revisions, while
 * ensuring only the explicit homepage choices can influence CRM routing.
 */
export function normalizeWebsiteLeadIntent(value: unknown): WebsiteLeadIntent | undefined {
  if (typeof value !== 'string') return undefined
  const intent = value.trim().toLowerCase()
  return supportedIntents.has(intent as WebsiteLeadIntent) ? intent as WebsiteLeadIntent : undefined
}
