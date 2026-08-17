import { normalizeEmailRecipients, sendViaResendApi } from "./resend.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message || `Expected ${expectedJson}, received ${actualJson}`,
    );
  }
}

Deno.test("normalizeEmailRecipients dedupes, validates, and excludes primary recipients", () => {
  const recipients = normalizeEmailRecipients(
    [
      "Agent <Agent@Example.Test>",
      "agent@arch9.co.za",
      "buyer@arch9.co.za",
      "not-an-email",
      "assistant@arch9.co.za",
    ],
    ["buyer@arch9.co.za"],
  );

  assertEquals(recipients, ["agent@arch9.co.za", "assistant@arch9.co.za"]);
});

Deno.test("sendViaResendApi sends normalized bcc recipients to Resend", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendViaResendApi({
      apiKey: "test-key",
      from: "Arch9 <sender@arch9.co.za>",
      to: "buyer@arch9.co.za",
      bcc: ["agent@arch9.co.za", "buyer@arch9.co.za", "bad-value"],
      subject: "Subject",
      html: "<p>Hello</p>",
    });

    assertEquals(result.ok, true);
    assertEquals(requestBody ? requestBody["bcc"] : null, [
      "agent@arch9.co.za",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendViaResendApi omits bcc when no copy recipient remains", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendViaResendApi({
      apiKey: "test-key",
      from: "Arch9 <sender@arch9.co.za>",
      to: "agent@arch9.co.za",
      bcc: "agent@arch9.co.za",
      subject: "Subject",
      html: "<p>Hello</p>",
    });

    assertEquals(result.ok, true);
    assertEquals(
      Object.prototype.hasOwnProperty.call(requestBody, "bcc"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sendViaResendApi suppresses controlled test bcc recipients", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendViaResendApi({
      apiKey: "test-key",
      from: "Arch9 <sender@arch9.co.za>",
      to: "buyer@arch9.co.za",
      bcc: ["fixture@example.test", "fixture@example.com"],
      subject: "Subject",
      html: "<p>Hello</p>",
    });

    assertEquals(result.ok, true);
    assertEquals(
      Object.prototype.hasOwnProperty.call(requestBody, "bcc"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
