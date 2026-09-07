import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildAgencySignupNotificationEmail } from "./agencySignupNotification.ts";

Deno.test("agency signup notification includes the follow-up details", () => {
  const message = buildAgencySignupNotificationEmail({
    authUserId: "f5b6a3d4-6c83-498a-89c8-31bd8d50f1d1",
    email: "principal@example.com",
    fullName: "Ava Principal",
    phone: "+27 82 123 4567",
    appRole: "agent",
    intendedOrgRole: "principal",
    onboardingPath: "agency_owner",
    workspaceAction: "create_workspace",
    source: "public_signup",
    signedUpAt: "2026-09-06T10:30:00.000Z",
    adminUrl: "https://admin.arch9.co.za",
  });

  assertStringIncludes(message.text, "principal@example.com");
  assertStringIncludes(message.text, "Workspace action: create_workspace");
  assertStringIncludes(message.html, "Open Arch9 Admin");
  assertEquals(message.text.includes("Password"), false);
});
