export async function sendViaResendApi({
  apiKey,
  from,
  to,
  subject,
  html,
  text,
  attachments,
  replyTo,
  timeoutMs = 0,
}: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  timeoutMs?: number;
  attachments?: Array<{
    filename: string;
    content: string;
    content_type?: string;
  }>;
}) {
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
      },
      body: JSON.stringify({
        from,
        to,
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
    message: `Resend returned a non-JSON response with status ${response.status}.`,
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
