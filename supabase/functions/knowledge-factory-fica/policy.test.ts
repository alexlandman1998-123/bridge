import { assertEquals } from "jsr:@std/assert@1";
import { mayAccessFicaHandoff } from "./policy.ts";

const userId = "user-1";
const ficaCase = { organisation_id: "org-1", created_by: userId };
const membership = { organisation_id: "org-1", user_id: userId, status: "active", role: "agent" };
const organisationAccess = { enabled: true, suspended_at: null, allowed_operations: ["fica_kyc"] };
const userPermission = { revoked_at: null, allowed_operations: ["fica_kyc"] };
const allowed = { userId, ficaCase, membership, organisationAccess, userPermission };

Deno.test("FICA handoff requires current organisation and named user access", () => {
  assertEquals(mayAccessFicaHandoff(allowed), true);
  assertEquals(mayAccessFicaHandoff({ ...allowed, membership: { ...membership, status: "inactive" } }), false);
  assertEquals(mayAccessFicaHandoff({ ...allowed, membership: { ...membership, organisation_id: "org-2" } }), false);
  assertEquals(mayAccessFicaHandoff({ ...allowed, organisationAccess: { ...organisationAccess, suspended_at: "2026-09-27" } }), false);
  assertEquals(mayAccessFicaHandoff({ ...allowed, userPermission: { ...userPermission, revoked_at: "2026-09-27" } }), false);
});

Deno.test("FICA handoff is limited to the case creator or an authorised reviewer", () => {
  assertEquals(mayAccessFicaHandoff({ ...allowed, ficaCase: { ...ficaCase, created_by: "user-2" } }), false);
  assertEquals(mayAccessFicaHandoff({ ...allowed, ficaCase: { ...ficaCase, created_by: "user-2" }, membership: { ...membership, role: "compliance_officer" } }), true);
});
