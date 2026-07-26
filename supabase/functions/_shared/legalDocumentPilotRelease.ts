export const LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT =
  "legal-document-pilot-release-v1";

export const LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_ENV =
  "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST";

export const LEGAL_DOCUMENT_OPEN_RELEASE_PLAN_DIGEST =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000";

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

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalisedOrganisationId(value: unknown) {
  return text(value).toLowerCase();
}

/**
 * The old Phase 4 guard limited customer delivery to a single pilot
 * organisation via Edge secrets. Mandate generation is now open to any
 * organisation with a published and B3-approved legal template, so this shared
 * decision no longer reads runtime allowlist secrets.
 */
export function assessLegalDocumentPilotRelease({
  organisationId,
  operation,
  environment: _environment,
}: {
  organisationId: unknown;
  operation: LegalDocumentPilotReleaseOperation;
  environment?: (name: string) => string | undefined;
}): LegalDocumentPilotReleaseDecision {
  const resolvedOrganisationId = normalisedOrganisationId(organisationId);
  return {
    allowed: true,
    code: null,
    status: 200,
    message: "Legal-document release is active for approved templates.",
    contract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
    operation,
    organisationId: resolvedOrganisationId,
    planDigest: LEGAL_DOCUMENT_OPEN_RELEASE_PLAN_DIGEST,
  };
}

export function assertLegalDocumentPilotRelease(input: {
  organisationId: unknown;
  operation: LegalDocumentPilotReleaseOperation;
  environment?: (name: string) => string | undefined;
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
