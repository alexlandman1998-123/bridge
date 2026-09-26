import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  hasServiceRoleClaim,
  matchesOperatorKey,
  parseDiscoveryAction,
  UAT_GRAPHQL_ENDPOINT,
} from "./policy.ts";

type Json = Record<string, unknown>;

const TYPE_REF =
  "kind name ofType { kind name ofType { kind name ofType { kind name } } }";
const ROOTS_QUERY =
  `query FicaDiscoveryRoots { __schema { queryType { name fields(includeDeprecated: false) { name description args { name type { ${TYPE_REF} } } type { ${TYPE_REF} } } } } }`;
const TYPE_QUERY =
  `query FicaDiscoveryType($name: String!) { __type(name: $name) { kind name description fields(includeDeprecated: false) { name description args { name type { ${TYPE_REF} } } type { ${TYPE_REF} } } inputFields { name description type { ${TYPE_REF} } } enumValues(includeDeprecated: false) { name description } possibleTypes { name kind } } }`;

function reply(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function supplierToken(): Promise<string> {
  const email = Deno.env.get("KNOWLEDGE_FACTORY_EMAIL")?.trim();
  const password = Deno.env.get("KNOWLEDGE_FACTORY_PASSWORD");
  if (!email || !password) throw new Error("supplier_credentials_unavailable");
  const response = await fetch(UAT_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operationName: "KnowledgeFactoryLogin",
      query:
        "mutation KnowledgeFactoryLogin($input: LoginInput!) { login(login: $input) { tokenPayload { expiresUtc token } errors { ... on ArgumentError { message paramName } ... on ArgumentNullError { message paramName } ... on Error { message } } } }",
      variables: { input: { email, password } },
    }),
  });
  const body = await response.json().catch(() => ({})) as Json;
  const login = (body.data as Json | undefined)?.login as Json | undefined;
  const token = login?.tokenPayload as Json | undefined;
  if (!response.ok) throw new Error(`supplier_login_http_${response.status}`);
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error("supplier_login_graphql_error");
  }
  if (Array.isArray(login?.errors) && login.errors.length) {
    throw new Error("supplier_login_rejected");
  }
  if (typeof token?.token !== "string" || !token.token) {
    throw new Error("supplier_login_token_missing");
  }
  return token.token;
}

async function discover(
  action: NonNullable<ReturnType<typeof parseDiscoveryAction>>,
): Promise<Json> {
  if (action.action === "probe") {
    const response = await fetch(UAT_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "GraphQL-Cost": "validate",
      },
      body: JSON.stringify({
        operationName: "FicaDiscoveryProbe",
        query: "query FicaDiscoveryProbe { __typename }",
      }),
    });
    const raw = (await response.text()).slice(0, 16_000);
    let body: Json = {};
    if (raw.trimStart().startsWith("{")) {
      try {
        body = JSON.parse(raw) as Json;
      } catch {
        /* A malformed supplier response is still useful as HTTP evidence. */
      }
    }
    const htmlTitle = /<title[^>]*>([^<]{0,160})<\/title>/i.exec(raw)?.[1]
      ?.trim() || null;
    let portalHttpStatus: number | null = null;
    let portalContentType: string | null = null;
    try {
      const portal = await fetch(
        "https://new.propertyintellect.co.za/graphql/portal/",
      );
      portalHttpStatus = portal.status;
      portalContentType = portal.headers.get("content-type")?.split(";")[0] ||
        "unknown";
    } catch {
      /* Keep the API result even if the separate portal cannot load. */
    }
    return {
      environment: "uat",
      action: "probe",
      supplierHttpStatus: response.status,
      contentType: response.headers.get("content-type")?.split(";")[0] ||
        "unknown",
      server: response.headers.get("server")?.slice(0, 80) || null,
      cloudflareRay: response.headers.get("cf-ray")?.slice(0, 100) || null,
      cloudflareMitigation:
        response.headers.get("cf-mitigated")?.slice(0, 80) ||
        null,
      requestId: response.headers.get("x-request-id")?.slice(0, 100) || null,
      azureReference: response.headers.get("x-azure-ref")?.slice(0, 100) ||
        null,
      via: response.headers.get("via")?.slice(0, 100) || null,
      htmlTitle,
      htmlMarker: /cloudflare/i.test(raw)
        ? "cloudflare"
        : /access denied/i.test(raw)
        ? "access_denied"
        : /forbidden/i.test(raw)
        ? "forbidden"
        : null,
      graphqlErrorCount: Array.isArray(body.errors) ? body.errors.length : 0,
      portalHttpStatus,
      portalContentType,
    };
  }
  const token = await supplierToken();
  const roots = action.action === "roots";
  const response = await fetch(UAT_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
      "GraphQL-Cost": "validate",
    },
    body: JSON.stringify({
      operationName: roots ? "FicaDiscoveryRoots" : "FicaDiscoveryType",
      query: roots ? ROOTS_QUERY : TYPE_QUERY,
      variables: roots ? {} : { name: action.typeName },
    }),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length)) {
    const first = Array.isArray(body.errors)
      ? body.errors[0] as Json | undefined
      : undefined;
    const message = typeof first?.message === "string" ? first.message : "";
    throw new Error(
      /introspection/i.test(message)
        ? "supplier_introspection_denied"
        : "supplier_schema_query_failed",
    );
  }
  const data = body.data as Json | undefined;
  const schema = roots ? data?.__schema : data?.__type;
  if (!schema || typeof schema !== "object") {
    throw new Error("supplier_schema_unavailable");
  }
  return { environment: "uat", action: action.action, schema };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply(405, { error: "method_not_allowed" });
  }
  const bearer =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  // verify_jwt=true makes Supabase verify the legacy JWT before this handler.
  // Some projects expose a different service key in the runtime environment,
  // so accept the verified service-role claim as well as an exact key match.
  const exactOperatorKey = await matchesOperatorKey(
    bearer,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
  if (!exactOperatorKey && !hasServiceRoleClaim(bearer)) {
    return reply(403, { error: "operator_access_required" });
  }
  const body = await request.json().catch(() => null);
  const action = parseDiscoveryAction(body);
  if (!action) return reply(400, { error: "unsupported_discovery_request" });
  try {
    return reply(200, await discover(action));
  } catch (error) {
    const code = error instanceof Error
      ? error.message
      : "supplier_schema_query_failed";
    return reply(code === "supplier_introspection_denied" ? 424 : 502, {
      error: code,
      environment: "uat",
    });
  }
});
