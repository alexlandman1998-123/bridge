import { supabase } from "../../lib/supabaseClient";

function text(value = "") { return String(value || "").trim(); }

export async function getKnowledgeFactoryDemoReadiness({ organisationId } = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("Please sign in again before reviewing demo readiness.");
  const response = await fetch("/api/knowledge-factory/demo-readiness", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ organisationId: text(organisationId) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(text(payload?.error) || `Demo readiness request failed (HTTP ${response.status}).`);
  return payload || {};
}
