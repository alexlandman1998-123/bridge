import { assertEquals } from "jsr:@std/assert@1";
import {
  hasServiceRoleClaim,
  matchesOperatorKey,
  parseDiscoveryAction,
  UAT_GRAPHQL_ENDPOINT,
} from "./policy.ts";

Deno.test("schema discovery accepts only fixed, metadata-only actions", () => {
  assertEquals(parseDiscoveryAction({ action: "probe" }), { action: "probe" });
  assertEquals(parseDiscoveryAction({ action: "roots" }), { action: "roots" });
  assertEquals(parseDiscoveryAction({ action: "type", typeName: "Query" }), {
    action: "type",
    typeName: "Query",
  });
  assertEquals(
    parseDiscoveryAction({ action: "roots", query: "{ owners { idNumber } }" }),
    null,
  );
  assertEquals(
    parseDiscoveryAction({ action: "type", typeName: "Query", variables: {} }),
    null,
  );
  assertEquals(
    parseDiscoveryAction({ action: "type", typeName: "Query } { owners" }),
    null,
  );
  assertEquals(parseDiscoveryAction({ action: "report" }), null);
  assertEquals(
    UAT_GRAPHQL_ENDPOINT,
    "https://propinfoapi.co.za/live/uat/graphql/",
  );
});

Deno.test("schema discovery requires the exact operator key", async () => {
  assertEquals(await matchesOperatorKey("", "secret"), false);
  assertEquals(await matchesOperatorKey("secret", ""), false);
  assertEquals(await matchesOperatorKey("wrong", "secret"), false);
  assertEquals(await matchesOperatorKey("secret", "secret"), true);
});

Deno.test("schema discovery accepts only a current service-role JWT claim after gateway verification", () => {
  const token = (payload: Record<string, unknown>) =>
    `header.${btoa(JSON.stringify(payload)).replace(/=/g, "")}.signature`;
  assertEquals(
    hasServiceRoleClaim(
      token({
        iss: "supabase",
        role: "service_role",
        exp: Date.now() / 1_000 + 60,
      }),
    ),
    true,
  );
  assertEquals(
    hasServiceRoleClaim(
      token({
        iss: "supabase",
        role: "authenticated",
        exp: Date.now() / 1_000 + 60,
      }),
    ),
    false,
  );
  assertEquals(
    hasServiceRoleClaim(
      token({ iss: "supabase", role: "service_role", exp: 1 }),
    ),
    false,
  );
  assertEquals(hasServiceRoleClaim("not-a-jwt"), false);
});
