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

  const data = await response.json();

  if (!response.ok) {
    return {
      ok: false as const,
      error: data,
    };
  }

  return {
    ok: true as const,
    data,
  };
}
