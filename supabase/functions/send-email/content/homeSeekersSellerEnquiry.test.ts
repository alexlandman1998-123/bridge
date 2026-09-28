import {
  buildHomeSeekersSellerAgencyEmail,
  buildHomeSeekersSellerClientEmail,
} from "./homeSeekersSellerEnquiry.ts";

function assert(condition: unknown, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

function assertNotIncludes(value: string, unexpected: string) {
  assert(!value.includes(unexpected), `Unexpected ${unexpected} in email`);
}

Deno.test("Home Seekers seller messages use distinct copy and CI", () => {
  const input = {
    sellerName: "Jordan Mokoena",
    sellerEmail: "jordan@example.com",
    sellerPhone: "+27 82 555 0142",
    propertyAddress: "18 Oak Street, Moreleta Park",
    message: "We hope to move in December.",
    leadUrl: "https://app.arch9.co.za/pipeline/leads/123",
  };
  const agency = buildHomeSeekersSellerAgencyEmail(input);
  const client = buildHomeSeekersSellerClientEmail(input);

  assert(agency.subject.includes("Jordan Mokoena"));
  assert(agency.html.includes("18 Oak Street, Moreleta Park"));
  assert(agency.html.includes("Open seller lead"));
  assert(client.html.includes("Hi Jordan"));
  assert(client.html.includes("We listen to what matters"));
  assertNotIncludes(client.html, "jordan@example.com");
  assertNotIncludes(client.html, "+27 82 555 0142");
  assert(agency.html.includes("#ff6319"));
  assertNotIncludes(agency.html, "#b48a42");
  assertNotIncludes(client.html, "#07152f");
  assert(client.text.includes("Arch9 Concierge for Home Seekers"));
});

Deno.test("seller supplied content is escaped and unsafe lead links are dropped", () => {
  const email = buildHomeSeekersSellerAgencyEmail({
    sellerName: '<script>alert("x")</script>\nBcc: someone@example.com',
    message: '<img src=x onerror="alert(1)">',
    leadUrl: "javascript:alert(1)",
  });
  assertNotIncludes(email.html, "<script>");
  assertNotIncludes(email.html, "<img src=x");
  assertNotIncludes(email.html, "javascript:");
  assertNotIncludes(email.html, "Open seller lead");
  assertNotIncludes(email.subject, "\n");
});

Deno.test("preview emails are visibly marked and keep distinct subjects", () => {
  const input = { sellerName: "Alex", preview: true };
  const agency = buildHomeSeekersSellerAgencyEmail(input);
  const seller = buildHomeSeekersSellerClientEmail(input);
  assert(agency.subject.startsWith("[TEST] "));
  assert(seller.subject.startsWith("[TEST] "));
  assert(agency.subject !== seller.subject);
  assert(agency.html.includes("DESIGN PREVIEW · NO ACTION REQUIRED"));
  assert(seller.html.includes("DESIGN PREVIEW · NO ACTION REQUIRED"));
});
