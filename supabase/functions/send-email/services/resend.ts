export async function sendViaResendApi({
  apiKey,
  from,
  to,
  subject,
  html,
  text,
  attachments,
}: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    content_type?: string;
  }>;
}) {
  const response = await fetch("https://api.resend.com/emails", {
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
    }),
  });

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
