import { isMissingColumnError, isMissingSchemaError, isMissingTableError } from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

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
      return null;
    }
    throw query.error;
  }

  const settings = toRecord(query.data?.settings_json);
  const emailTemplates = toRecord(settings.emailTemplates);
  const templateOverrides = toRecord(emailTemplates[normalizedTemplateKey]);
  if (!Object.keys(templateOverrides).length) {
    return null;
  }

  return normalizeEmailTemplateOverride(templateOverrides);
}
