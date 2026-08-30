import { isMissingColumnError, isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

const EMAIL_TEMPLATE_CACHE_TTL_MS = 60_000;
const emailTemplateOverrideCache = new Map<
  string,
  { expiresAt: number; value?: EmailTemplateOverride | null; promise?: Promise<EmailTemplateOverride | null> }
>();

function normalizeLines(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    const lines = value.map((item) => normalizeText(item)).filter(Boolean);
    return lines.length ? lines : fallback;
  }

  if (typeof value === "string") {
    const lines = value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    return lines.length ? lines : fallback;
  }

  return fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type EmailTemplateOverride = {
  subject?: string;
  title?: string;
  preheader?: string;
  introParagraphs?: string[];
  capabilityBullets?: string[];
  processSteps?: string[];
  ctaLabel?: string;
  securityTitle?: string;
  securityBody?: string;
  helpBody?: string;
};

export function normalizeEmailTemplateOverride(value: unknown): EmailTemplateOverride {
  const source = toRecord(value);
  return {
    subject: normalizeText(source.subject),
    title: normalizeText(source.title),
    preheader: normalizeText(source.preheader),
    introParagraphs: normalizeLines(source.introParagraphs),
    capabilityBullets: normalizeLines(source.capabilityBullets),
    processSteps: normalizeLines(source.processSteps),
    ctaLabel: normalizeText(source.ctaLabel),
    securityTitle: normalizeText(source.securityTitle),
    securityBody: normalizeText(source.securityBody),
    helpBody: normalizeText(source.helpBody),
  };
}

export async function fetchOrganisationEmailTemplateOverride(
  supabase: { from: (table: string) => any },
  organisationId: string,
  templateKey: string,
): Promise<EmailTemplateOverride | null> {
  const normalizedOrganisationId = normalizeText(organisationId);
  const normalizedTemplateKey = normalizeText(templateKey);
  if (!normalizedOrganisationId || !normalizedTemplateKey) {
    return null;
  }

  const cacheKey = `${normalizedOrganisationId}:${normalizedTemplateKey}`;
  const cached = emailTemplateOverrideCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && "value" in cached) {
    return cached.value ?? null;
  }
  if (cached?.promise) return cached.promise;

  const request = (async () => {
    const query = await supabase
      .from("organisation_settings")
      .select("settings_json")
      .eq("organisation_id", normalizedOrganisationId)
      .maybeSingle();

    if (query.error) {
      if (
        isMissingTableError(query.error, "organisation_settings") ||
        isMissingSchemaError(query.error) ||
        isMissingColumnError(query.error, "settings_json")
      ) {
        emailTemplateOverrideCache.set(cacheKey, {
          expiresAt: Date.now() + EMAIL_TEMPLATE_CACHE_TTL_MS,
          value: null,
        });
        return null;
      }
      emailTemplateOverrideCache.delete(cacheKey);
      throw query.error;
    }

    const settings = toRecord(query.data?.settings_json);
    const emailTemplates = toRecord(settings.emailTemplates);
    const templateOverrides = toRecord(emailTemplates[normalizedTemplateKey]);
    const value = Object.keys(templateOverrides).length
      ? normalizeEmailTemplateOverride(templateOverrides)
      : null;
    emailTemplateOverrideCache.set(cacheKey, {
      expiresAt: Date.now() + EMAIL_TEMPLATE_CACHE_TTL_MS,
      value,
    });
    return value;
  })();

  emailTemplateOverrideCache.set(cacheKey, { expiresAt: 0, promise: request });
  return request;
}
