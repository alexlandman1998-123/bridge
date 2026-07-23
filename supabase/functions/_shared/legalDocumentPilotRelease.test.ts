import {
  assessLegalDocumentPilotRelease,
  assertLegalDocumentPilotRelease,
  LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
} from "./legalDocumentPilotRelease.ts";

const digest = `sha256:${"a".repeat(64)}`;
const organisationId = "11111111-1111-4111-8111-111111111111";
const otherOrganisationId = "22222222-2222-4222-8222-222222222222";

function environment(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("pilot release allows only an enabled, exactly allowlisted organisation with an activation digest", () => {
  const decision = assessLegalDocumentPilotRelease({
    organisationId,
    operation: "canonical_generation",
    environment: environment({
      LEGAL_DOCUMENT_PILOT_ENABLED: "true",
      LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: organisationId,
      LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: digest,
    }),
  });
  expect(decision.allowed, "The configured organisation should be released.");
  expect(decision.contract === LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT, "The stable release contract must be returned.");
  expect(decision.organisationId === organisationId, "Organisation comparison should be normalised but exact.");
  expect(decision.planDigest === digest, "The attested digest must be retained in the decision.");
});

Deno.test("pilot release accepts a valid multi-organisation demo cohort", () => {
  const decision = assessLegalDocumentPilotRelease({
    organisationId: otherOrganisationId,
    operation: "signing_invite",
    environment: environment({
      LEGAL_DOCUMENT_PILOT_ENABLED: "true",
      LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: `${organisationId},${otherOrganisationId}`,
      LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: digest,
    }),
  });
  expect(decision.allowed, "The second configured organisation should be released.");
  expect(decision.organisationId === otherOrganisationId, "The selected organisation should be retained.");
});

Deno.test("pilot release fails closed for disabled, missing-digest, malformed-digest, and non-allowlisted states", () => {
  const base = {
    LEGAL_DOCUMENT_PILOT_ENABLED: "true",
    LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: organisationId,
    LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: digest,
  };
  const cases = [
    [{ ...base, LEGAL_DOCUMENT_PILOT_ENABLED: "false" }, "LEGAL_DOCUMENT_PILOT_DISABLED"],
    [{ ...base, LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: "" }, "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_REQUIRED"],
    [{ ...base, LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: "sha256:not-a-digest" }, "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_INVALID"],
    [{ ...base, LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: `${organisationId},not-a-uuid` }, "LEGAL_DOCUMENT_PILOT_COHORT_INVALID"],
    [base, "LEGAL_DOCUMENT_PILOT_ORGANISATION_NOT_ALLOWLISTED"],
  ] as const;
  for (const [values, expectedCode] of cases) {
    const decision = assessLegalDocumentPilotRelease({
      organisationId: expectedCode === "LEGAL_DOCUMENT_PILOT_ORGANISATION_NOT_ALLOWLISTED" ? otherOrganisationId : organisationId,
      operation: "final_delivery",
      environment: environment(values),
    });
    expect(!decision.allowed, `${expectedCode} must block customer delivery.`);
    expect(decision.code === expectedCode, `Expected ${expectedCode}, received ${decision.code}.`);
  }
});

Deno.test("assertion exposes the guard decision without accepting request-supplied runtime state", () => {
  let failure: { code?: string; pilotRelease?: { contract?: string } } | null = null;
  try {
    assertLegalDocumentPilotRelease({
      organisationId,
      operation: "signing_invite",
      environment: environment({
        LEGAL_DOCUMENT_PILOT_ENABLED: "true",
        LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: organisationId,
      }),
    });
  } catch (error) {
    failure = error as { code?: string; pilotRelease?: { contract?: string } };
  }
  expect(failure?.code === "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_REQUIRED", "Missing activation evidence must throw the fail-closed code.");
  expect(failure?.pilotRelease?.contract === LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT, "Thrown failures must identify the stable guard contract.");
});
