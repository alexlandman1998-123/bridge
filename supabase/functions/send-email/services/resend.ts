import { assessControlledTestRecipient } from "../utils/controlledTestRecipient.ts";

function normalizeEmailAddress(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0] || "";
}

export function normalizeEmailRecipients(
  recipients: string | string[] | undefined,
  excludedRecipients: Array<string | undefined> = [],
) {
  const excluded = new Set(
    excludedRecipients.map((recipient) => normalizeEmailAddress(recipient))
      .filter(Boolean),
  );
  const values = Array.isArray(recipients) ? recipients : [recipients];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const email = normalizeEmailAddress(value);
    const recipientSafety = assessControlledTestRecipient({ email });
    if (
      !email || excluded.has(email) || seen.has(email) ||
      recipientSafety.suppressed
    ) continue;
    seen.add(email);
    normalized.push(email);
  }

  return normalized;
}

export async function sendViaResendApi({
  apiKey,
  from,
  to,
  bcc,
  subject,
  html,
  text,
  attachments,
  replyTo,
  idempotencyKey,
  timeoutMs = 0,
}: {
  apiKey: string;
  from: string;
  to: string;
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  attachments?: Array<{
    filename: string;
    content: string;
    content_type?: string;
  }>;
}) {
  const bccRecipients = normalizeEmailRecipients(bcc, [to]);
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort("resend_request_timeout"), timeoutMs)
    : null;
  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to,
        bcc: bccRecipients.length ? bccRecipients : undefined,
        subject,
        html,
        text,
        attachments,
        reply_to: replyTo || undefined,
      }),
      signal: controller?.signal,
    });
  } catch (error) {
    return {
      ok: false as const,
      status: null,
      error: {
        message: error instanceof DOMException && error.name === "AbortError"
          ? `Resend request timed out after ${timeoutMs}ms.`
          : error instanceof Error
          ? error.message
          : "Resend request failed before a response was returned.",
      },
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({
    message:
      `Resend returned a non-JSON response with status ${response.status}.`,
  }));

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: data,
    };
  }

  return {
    ok: true as const,
    status: response.status,
    data,
  };
}
