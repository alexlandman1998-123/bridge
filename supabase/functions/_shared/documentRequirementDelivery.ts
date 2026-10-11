import { buildAdditionalDocumentRequestEmail } from "../send-email/handlers/additionalDocumentRequest.ts";
import { resolveAudienceEmailSender, resolveEmailBranding } from "../send-email/services/emailBranding.ts";
import { sendViaResendApi } from "../send-email/services/resend.ts";
import { assessControlledTestRecipient } from "../send-email/utils/controlledTestRecipient.ts";
import type { SupabaseClient } from "supabase";

type Row = Record<string, any>;
type Client = { rpc(name: string, args: Row): PromiseLike<{ data: any; error: any }> };
type Envelope = { from: string; to: string; subject: string; html: string; text: string; portalPath: string };
const json = (status: number, data: Row) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
async function rpc(client: Client, name: string, args: Row) {
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}
export async function renderRequirementEnvelope(client: Client, target: Row, appUrl: string): Promise<Envelope> {
  const branding = await resolveEmailBranding({ supabase: client as SupabaseClient, organisationId: target.organisationId });
  const from = await resolveAudienceEmailSender({ audience: "client", branding, platformSender: Deno.env.get("RESEND_FROM_EMAIL") || "Arch9 <no-reply@arch9.co.za>", supabase: client as SupabaseClient });
  const message = `We have requested ${target.label}. Please log into your secure portal and upload the document.`;
  const content = buildAdditionalDocumentRequestEmail({ recipientName: "there", title: "Document requested", message,
    transactionId: target.transactionId || "", actionLink: new URL(target.portalPath, appUrl).href,
    metadata: { documentLabel: target.label, requestedFrom: target.recipientRole }, branding });
  return { from, to: target.to, subject: "Document requested", ...content, portalPath: target.portalPath };
}

export async function handleRequirementDelivery(request: Request, options: {
  serviceRoleKey: string; apiKey: string; appUrl: string; enabled: boolean; client: Client | null;
  render?: typeof renderRequirementEnvelope; send?: typeof sendViaResendApi;
}) {
  if (request.method !== "POST") return json(405, { error: "POST required" });
  if (!options.serviceRoleKey || request.headers.get("Authorization") !== `Bearer ${options.serviceRoleKey}`) return json(403, { error: "Service authorization required" });
  if (!options.enabled) return json(200, { suppressed: true, reason: "document_request_emails_disabled" });
  if (!options.apiKey || !options.client) return json(503, { error: "Delivery configuration is missing" });
  const client = options.client;
  const body = await request.json().catch(() => ({}));
  const results: Row[] = [];
  try {
    const jobs: Row[] = await rpc(client, "bridge_claim_requirement_deliveries", { p_limit: Math.min(25, Math.max(1, Number(body.limit) || 10)) });
    for (const job of jobs) {
      const finish = (outcome: string, providerId: string | null = null, error: string | null = null) => rpc(client, "bridge_finish_requirement_delivery", {
        p_id: job.id, p_claim: job.claim_token, p_outcome: outcome, p_provider_id: providerId, p_error: error,
      });
      try {
        const target = await rpc(client, "bridge_requirement_delivery_target", { p_id: job.id, p_claim: job.claim_token });
        if (!target) { await finish("waiting_portal", null, "An active matching portal and recipient are required."); results.push({ id: job.id, status: "waiting_portal" }); continue; }
        if (assessControlledTestRecipient({ email: target.to }).suppressed) {
          await finish("cancelled", null, "Controlled test recipient suppressed."); results.push({ id: job.id, status: "suppressed" }); continue;
        }
        if (job.envelope && (job.envelope.to !== target.to || job.envelope.portalPath !== target.portalPath)) {
          await finish("cancelled", null, "The portal recipient changed after the first delivery attempt. Review before requesting again."); results.push({ id: job.id, status: "cancelled" }); continue;
        }
        const proposed = job.envelope || await (options.render || renderRequirementEnvelope)(client, target, options.appUrl);
        const envelope: Envelope | null = await rpc(client, "bridge_prepare_requirement_delivery", { p_id: job.id, p_claim: job.claim_token, p_envelope: proposed });
        if (!envelope) { results.push({ id: job.id, status: "cancelled" }); continue; }
        const result = await (options.send || sendViaResendApi)({ ...envelope, apiKey: options.apiKey, idempotencyKey: `requirement-request/${job.id}`, timeoutMs: 15000 });
        if (!result.ok) throw new Error("Email provider did not confirm acceptance.");
        if (!result.data?.id) throw new Error("Email provider returned no receipt.");
        await finish("sent", result.data.id);
        results.push({ id: job.id, status: "sent" });
      } catch {
        // Never log addresses, portal tokens, rendered content, or provider bodies.
        await finish("retry", null, "Delivery could not be confirmed; retrying the same provider request.");
        results.push({ id: job.id, status: "retry" });
      }
    }
    return json(200, { results });
  } catch { return json(500, { error: "The document request queue could not be processed." }); }
}
