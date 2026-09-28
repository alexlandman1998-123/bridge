import {
  arch9ConciergeSender,
  handleHomeSeekersSellerEmailPreview,
  HOME_SEEKERS_ORGANISATION_ID,
  homeSeekersSellerDetails,
  isHomeSeekersSellerEnquiry,
  sendHomeSeekersSellerEnquiryEmails,
} from "./homeSeekersSellerEnquiry.ts";

function assert(condition: unknown, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

Deno.test("Home Seekers seller routing is narrow and extracts valuation address", () => {
  assert(isHomeSeekersSellerEnquiry({
    eventKind: "new_website_enquiry_principal",
    organisationId: HOME_SEEKERS_ORGANISATION_ID,
    leadCategory: "seller",
  }));
  assert(
    !isHomeSeekersSellerEnquiry({
      eventKind: "new_website_enquiry_principal",
      organisationId: "another-agency",
      leadCategory: "seller",
    }),
  );
  assert(
    !isHomeSeekersSellerEnquiry({
      eventKind: "new_website_enquiry_principal",
      organisationId: HOME_SEEKERS_ORGANISATION_ID,
      leadCategory: "buyer",
    }),
  );
  const details = homeSeekersSellerDetails({
    sellerName: "Jordan Mokoena",
    enquiryMessage: "Property address: 18 Oak Street, Moreleta Park",
  });
  assert(details.propertyAddress === "18 Oak Street, Moreleta Park");
  assert(!details.message);
  assert(
    arch9ConciergeSender("Arch9 <no-reply@arch9.co.za>") ===
      "Arch9 Concierge <no-reply@arch9.co.za>",
  );
});

Deno.test("preview delivery requires service role and the allowlisted recipient", async () => {
  const keys = [
    "HOME_SEEKERS_SELLER_PREVIEW_RECIPIENT",
    "RESEND_API_KEY",
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  const originalFetch = globalThis.fetch;
  let sends = 0;
  Deno.env.set(keys[0], "alexlandman1998@gmail.com");
  Deno.env.set(keys[1], "resend-test");
  const serviceRoleToken = `Bearer ${btoa('{"alg":"HS256"}')}.${
    btoa('{"role":"service_role"}')
  }.test-signature`;
  globalThis.fetch = () => {
    sends++;
    return Promise.resolve(Response.json({ id: `preview-${sends}` }));
  };
  const payload = {
    to: "alexlandman1998@gmail.com",
    sellerEmail: "alexlandman1998@gmail.com",
    sellerName: "Alex",
    previewId: "preview_12345",
  };
  try {
    const unauthorized = await handleHomeSeekersSellerEmailPreview(
      new Request("https://example.org"),
      payload,
    );
    assert(unauthorized.status === 403);
    const anonToken = `Bearer ${btoa('{"alg":"HS256"}')}.${
      btoa('{"role":"anon"}')
    }.test-signature`;
    const anon = await handleHomeSeekersSellerEmailPreview(
      new Request("https://example.org", {
        headers: { authorization: anonToken },
      }),
      payload,
    );
    assert(anon.status === 403);
    const wrongRecipient = await handleHomeSeekersSellerEmailPreview(
      new Request("https://example.org", {
        headers: { authorization: serviceRoleToken },
      }),
      { ...payload, sellerEmail: "other@gmail.com" },
    );
    assert(wrongRecipient.status === 403);
    assert(sends === 0);
    const result = await handleHomeSeekersSellerEmailPreview(
      new Request("https://example.org", {
        headers: { authorization: serviceRoleToken },
      }),
      payload,
    );
    assert(result.status === 200);
    assert(sends === 2);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[index]);
    });
  }
});

Deno.test("seller enquiry dispatch sends separate branded messages with separate idempotency keys", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ headers: Headers; body: Record<string, unknown> }> =
    [];
  globalThis.fetch = async (url, options) => {
    const request = new Request(String(url), options as RequestInit);
    requests.push({
      headers: request.headers,
      body: await request.json() as Record<string, unknown>,
    });
    return Response.json({ id: `email-${requests.length}` });
  };
  try {
    const result = await sendHomeSeekersSellerEnquiryEmails({
      apiKey: "test-api-key",
      configuredSender: "Arch9 <no-reply@arch9.co.za>",
      agencyTo: "alexlandman1998@gmail.com",
      sellerTo: "seller@sample.co.za",
      details: {
        sellerName: "Jordan Mokoena",
        sellerEmail: "seller@sample.co.za",
        propertyAddress: "18 Oak Street",
      },
      idempotencyKey: "website-lead:receipt-123",
    });
    assert(result.ok);
    assert(requests.length === 2);
    assert(requests[0].body.to === "alexlandman1998@gmail.com");
    assert(requests[1].body.to === "seller@sample.co.za");
    assert(
      requests.every((request) =>
        request.body.from === "Arch9 Concierge <no-reply@arch9.co.za>"
      ),
    );
    assert(
      requests[0].headers.get("idempotency-key") ===
        "website-lead:receipt-123:agency",
    );
    assert(
      requests[1].headers.get("idempotency-key") ===
        "website-lead:receipt-123:seller",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
