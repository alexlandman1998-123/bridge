import { createClient } from "supabase";

const jsonHeaders = { "Content-Type": "application/json" };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function positiveInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function jwtRole(request: Request) {
  const token = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const segment = token.split(".")[1] || "";
  if (!segment) return "";
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
    return String(JSON.parse(atob(normalized))?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  // The gateway verifies the JWT; the worker additionally requires its service-role claim.
  if (jwtRole(request) !== "service_role") return json({ ok: false, error: "Dispatcher authority required." }, 403);
  const url = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!url || !serviceRoleKey) return json({ ok: false, error: "Dispatcher environment is incomplete." }, 503);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc("bridge_dispatch_conveyancer_notifications", {
    p_limit: positiveInteger(body.limit, 50, 200),
    p_now: typeof body.asOf === "string" && body.asOf ? body.asOf : new Date().toISOString(),
  });
  if (error) return json({ ok: false, error: error.message, code: error.code || null }, 500);
  return json({ ok: true, ...((data && typeof data === "object") ? data : {}), dispatchedAt: new Date().toISOString() });
});
