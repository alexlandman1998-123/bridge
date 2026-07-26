import { normalizeText } from "./text.ts";

export const CONTROLLED_TEST_NOTIFICATION_SUPPRESSION_REASON =
  "controlled_test_recipient";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readEmailDomain(email: string) {
  const [, domain = ""] = email.split("@");
  return domain.trim().toLowerCase();
}

/** Never hand controlled pilot contacts to an external email provider. */
export function assessControlledTestRecipient({
  email = "",
  recipientName = "",
  metadata = {},
}: {
  email?: unknown;
  recipientName?: unknown;
  metadata?: unknown;
} = {}) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  const domain = readEmailDomain(normalizedEmail);
  const normalizedName = normalizeText(recipientName).toLowerCase();
  const metadataRecord = toRecord(metadata);
  const controlledTestRoleSet = normalizeText(
    metadataRecord.controlledTestRoleSet ?? metadataRecord.controlled_test_role_set,
  );
  const testDataProtection = toRecord(
    metadataRecord.testDataProtection ?? metadataRecord.test_data_protection,
  );
  const suppressed = normalizedEmail.endsWith(".invalid") ||
    domain === "example.com" ||
    domain === "example.net" ||
    domain === "example.org" ||
    domain.endsWith(".example.com") ||
    domain.endsWith(".example.net") ||
    domain.endsWith(".example.org") ||
    domain === "example.test" ||
    domain.endsWith(".example.test") ||
    domain.endsWith(".test") ||
    normalizedName.includes("test — do not action") ||
    normalizedName.includes("test - do not action") ||
    Boolean(controlledTestRoleSet) ||
    testDataProtection.isTestData === true ||
    testDataProtection.is_test_data === true;

  return {
    suppressed,
    reason: suppressed ? CONTROLLED_TEST_NOTIFICATION_SUPPRESSION_REASON : "",
    message: suppressed
      ? "Controlled test recipient: external notification delivery is suppressed."
      : "",
  };
}
