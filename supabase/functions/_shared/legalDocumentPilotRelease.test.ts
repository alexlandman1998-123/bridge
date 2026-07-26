import {
  assessLegalDocumentPilotRelease,
  assertLegalDocumentPilotRelease,
  LEGAL_DOCUMENT_OPEN_RELEASE_PLAN_DIGEST,
  LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
} from "./legalDocumentPilotRelease.ts";

const organisationId = "11111111-1111-4111-8111-111111111111";
const otherOrganisationId = "22222222-2222-4222-8222-222222222222";

function environment(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("legal-document release allows any organisation with stable release evidence", () => {
  const decision = assessLegalDocumentPilotRelease({
    organisationId,
    operation: "canonical_generation",
    environment: environment({
      LEGAL_DOCUMENT_PILOT_ENABLED: "false",
      LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: otherOrganisationId,
      LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: "sha256:not-a-digest",
    }),
  });
  expect(decision.allowed, "The release should not be limited by runtime pilot secrets.");
  expect(decision.contract === LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT, "The stable release contract must be returned.");
  expect(decision.organisationId === organisationId, "Organisation comparison should be normalised but exact.");
  expect(decision.planDigest === LEGAL_DOCUMENT_OPEN_RELEASE_PLAN_DIGEST, "The open release digest must be stable.");
});

Deno.test("assertion returns the open release decision without accepting request-supplied runtime state", () => {
  const decision = assertLegalDocumentPilotRelease({
    organisationId: otherOrganisationId,
    operation: "signing_invite",
    environment: environment({}),
  });
  expect(decision.allowed, "The assertion should allow any organisation.");
  expect(decision.organisationId === otherOrganisationId, "The packet organisation remains part of the release evidence.");
});
