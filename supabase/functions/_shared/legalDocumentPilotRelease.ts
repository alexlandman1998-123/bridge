export const LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT =
  "legal-document-pilot-release-v1";

export const LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_ENV =
  "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST";

const ORGANISATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LegalDocumentPilotReleaseOperation =
  | "canonical_generation"
  | "signing_invite"
  | "final_delivery";

export type LegalDocumentPilotReleaseDecision = {
  allowed: boolean;
  code: string | null;
  status: number;
  message: string;
  contract: typeof LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT;
  operation: LegalDocumentPilotReleaseOperation;
  organisationId: string;
  planDigest: string | null;
};

type EnvironmentReader = (name: string) => string | undefined;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalisedOrganisationId(value: unknown) {
  return text(value).toLowerCase();
}

function configuredOrganisationIds(value: unknown) {
  return new Set(
    text(value)
      .split(",")
      .map((item) => normalisedOrganisationId(item))
      .filter(Boolean),
  );
}

function readRuntimeEnvironment(name: string) {
  return Deno.env.get(name);
}

function denied({
  code,
  message,
  operation,
  organisationId,
  planDigest = null,
}: {
  code: string;
  message: string;
  operation: LegalDocumentPilotReleaseOperation;
  organisationId: string;
  planDigest?: string | null;
}): LegalDocumentPilotReleaseDecision {
  return {
    allowed: false,
    code,
    status: 403,
    message,
    contract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
    operation,
    organisationId,
    planDigest,
  };
}

/**
 * Read the production-only customer-release controls from Edge runtime
 * secrets. This guard deliberately never accepts a digest or organisation
 * allowlist from a request body: the packet's persisted organisation is the
 * subject and runtime configuration is the release authority.
 */
export function assessLegalDocumentPilotRelease({
  organisationId,
  operation,
  environment = readRuntimeEnvironment,
}: {
  organisationId: unknown;
  operation: LegalDocumentPilotReleaseOperation;
  environment?: EnvironmentReader;
}): LegalDocumentPilotReleaseDecision {
  const resolvedOrganisationId = normalisedOrganisationId(organisationId);
  const pilotEnabled = text(environment("LEGAL_DOCUMENT_PILOT_ENABLED"))
    .toLowerCase() === "true";
  const rawPlanDigest = text(environment(LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_ENV));
  const planDigest = rawPlanDigest.toLowerCase() || null;
  const allowlistedOrganisationIds = configuredOrganisationIds(
    environment("LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS"),
  );

  if (!pilotEnabled) {
    return denied({
      code: "LEGAL_DOCUMENT_PILOT_DISABLED",
      message: "Legal-document customer delivery is not enabled for this environment.",
      operation,
      organisationId: resolvedOrganisationId,
      planDigest,
    });
  }

  if (!rawPlanDigest) {
    return denied({
      code: "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_REQUIRED",
      message: "Legal-document customer delivery requires an approved pilot activation-plan digest.",
      operation,
      organisationId: resolvedOrganisationId,
    });
  }

  if (!/^sha256:[a-f0-9]{64}$/i.test(rawPlanDigest)) {
    return denied({
      code: "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_INVALID",
      message: "Legal-document customer delivery requires a valid SHA-256 pilot activation-plan digest.",
      operation,
      organisationId: resolvedOrganisationId,
    });
  }

  const configuredCohort = [...allowlistedOrganisationIds];
  if (!configuredCohort.length || configuredCohort.some((id) => !ORGANISATION_UUID.test(id))) {
    return denied({
      code: "LEGAL_DOCUMENT_PILOT_COHORT_INVALID",
      message: "Legal-document customer delivery requires a valid pilot organisation cohort.",
      operation,
      organisationId: resolvedOrganisationId,
      planDigest,
    });
  }

  if (!resolvedOrganisationId || !allowlistedOrganisationIds.has(resolvedOrganisationId)) {
    return denied({
      code: "LEGAL_DOCUMENT_PILOT_ORGANISATION_NOT_ALLOWLISTED",
      message: "Legal-document customer delivery is not enabled for this packet organisation.",
      operation,
      organisationId: resolvedOrganisationId,
      planDigest,
    });
  }

  return {
    allowed: true,
    code: null,
    status: 200,
    message: "Legal-document pilot release is active for this organisation.",
    contract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
    operation,
    organisationId: resolvedOrganisationId,
    planDigest,
  };
}

export function assertLegalDocumentPilotRelease(input: {
  organisationId: unknown;
  operation: LegalDocumentPilotReleaseOperation;
  environment?: EnvironmentReader;
}) {
  const decision = assessLegalDocumentPilotRelease(input);
  if (!decision.allowed) {
    throw Object.assign(new Error(decision.message), {
      code: decision.code,
      status: decision.status,
      pilotRelease: decision,
    });
  }
  return decision;
}
